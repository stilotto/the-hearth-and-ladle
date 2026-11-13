// A small hand-rolled post chain: HDR scene target, soft bloom from flames and
// windows, then one grading pass (filmic tone map, vignette, warm tint, grain).
import * as THREE from '../../vendor/three.module.min.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';

const pass = (frag, uniforms, o = {}) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false, ...o });

const DOWN = `
varying vec2 vUv; uniform sampler2D tex; uniform vec2 px; uniform float knee;
void main(){
  vec3 c = texture2D(tex, vUv + px * vec2(-1., -1.)).rgb + texture2D(tex, vUv + px * vec2(1., -1.)).rgb
         + texture2D(tex, vUv + px * vec2(-1., 1.)).rgb + texture2D(tex, vUv + px * vec2(1., 1.)).rgb;
  c *= .25;
  if (knee > 0.) { float l = max(c.r, max(c.g, c.b)); c *= smoothstep(knee * .55, knee * 1.6, l); c = min(c, vec3(12.)); }
  gl_FragColor = vec4(c, 1.);
}`;
const UP = `
varying vec2 vUv; uniform sampler2D tex; uniform vec2 px;
void main(){
  vec3 c = texture2D(tex, vUv).rgb * 4.;
  c += (texture2D(tex, vUv + px * vec2(-1., 0.)).rgb + texture2D(tex, vUv + px * vec2(1., 0.)).rgb + texture2D(tex, vUv + px * vec2(0., -1.)).rgb + texture2D(tex, vUv + px * vec2(0., 1.)).rgb) * 2.;
  c += texture2D(tex, vUv + px * vec2(-1., -1.)).rgb + texture2D(tex, vUv + px * vec2(1., -1.)).rgb + texture2D(tex, vUv + px * vec2(-1., 1.)).rgb + texture2D(tex, vUv + px * vec2(1., 1.)).rgb;
  gl_FragColor = vec4(c / 16. * .8, 1.);
}`;
const FINAL = `
varying vec2 vUv; uniform sampler2D scene; uniform sampler2D bloom;
uniform float exposure, strength, time, grain, fade; uniform vec3 tint;
vec3 fit(vec3 v){ vec3 a = v * (v + .0245786) - .000090537; vec3 b = v * (.983729 * v + .4329510) + .238081; return a / b; }
vec3 aces(vec3 c){
  const mat3 I = mat3(vec3(.59719, .07600, .02840), vec3(.35458, .90834, .13383), vec3(.04823, .01566, .83777));
  const mat3 O = mat3(vec3(1.60475, -.10208, -.00327), vec3(-.53108, 1.10813, -.07276), vec3(-.07367, -.00605, 1.07602));
  return clamp(O * fit(I * (c * exposure / .6)), 0., 1.);
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec3 c = texture2D(scene, vUv).rgb + texture2D(bloom, vUv).rgb * strength;
  vec2 q = vUv - .5;
  c *= 1. - smoothstep(.25, 1.05, dot(q, q) * 2.2) * .5;
  c = aces(c * tint);
  float l = dot(c, vec3(.3, .59, .11));
  c = mix(vec3(l), c, 1.08);                                   // a touch more colour in the mids
  c = mix(c, c * c * (3. - 2. * c), .12);                      // gentle contrast curve
  c = mix(pow(c, vec3(1. / 2.4)) * 1.055 - .055, c * 12.92, step(c, vec3(.0031308)));
  c += (hash(gl_FragCoord.xy + fract(time) * 91.7) - .5) * grain;
  gl_FragColor = vec4(c * fade, 1.);
}`;

export function createFX(renderer) {
  const gl = renderer.getContext();
  const ok = renderer.capabilities.isWebGL2 !== false && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
  quad.frustumCulled = false;
  const LEVELS = 4;
  const rt = (w, h, o = {}) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, ...o });
  let sceneRT = null, mips = [];
  const down = pass(DOWN, { tex: { value: null }, px: { value: new THREE.Vector2() }, knee: { value: 0 } });
  const up = pass(UP, { tex: { value: null }, px: { value: new THREE.Vector2() } }, { blending: THREE.AdditiveBlending, transparent: true });
  const final = pass(FINAL, {
    scene: { value: null }, bloom: { value: null }, exposure: { value: 1.3 }, strength: { value: 0.45 },
    time: { value: 0 }, grain: { value: 0.035 }, fade: { value: 1 }, tint: { value: new THREE.Color(1.03, 1, 0.95) },
  });
  const draw = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quad, cam); };

  const fx = {
    ok, enabled: ok, uniforms: final.uniforms,
    setSize(w, h, ratio) {
      if (!ok) return;
      const W = Math.max(2, Math.floor(w * ratio)), H = Math.max(2, Math.floor(h * ratio));
      sceneRT?.dispose(); for (const m of mips) m.dispose();
      const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0);
      sceneRT = rt(W, H, { depthBuffer: true, samples });
      mips = [];
      for (let i = 0, mw = W, mh = H; i < LEVELS; i++) { mw = Math.max(2, mw >> 1); mh = Math.max(2, mh >> 1); mips.push(rt(mw, mh)); }
    },
    render(scene, camera, t, animate = true) {
      if (!ok || !fx.enabled || !sceneRT) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
      renderer.setRenderTarget(sceneRT);
      renderer.render(scene, camera);
      let src = sceneRT;
      for (let i = 0; i < LEVELS; i++) {
        down.uniforms.tex.value = src.texture; down.uniforms.px.value.set(0.5 / src.width, 0.5 / src.height); down.uniforms.knee.value = i === 0 ? 1.0 : 0;
        draw(down, mips[i]); src = mips[i];
      }
      const auto = renderer.autoClear; renderer.autoClear = false;
      for (let i = LEVELS - 1; i > 0; i--) {
        up.uniforms.tex.value = mips[i].texture; up.uniforms.px.value.set(1 / mips[i].width, 1 / mips[i].height);
        draw(up, mips[i - 1]);
      }
      renderer.autoClear = auto;
      final.uniforms.scene.value = sceneRT.texture; final.uniforms.bloom.value = mips[0].texture;
      final.uniforms.time.value = animate ? t : 0;
      draw(final, null);
    },
  };
  return fx;
}
