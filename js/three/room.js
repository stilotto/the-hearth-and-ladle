// The immersive common room: the same simulation as the 2D view, drawn in
// 3D and heard from where you stand.
import * as THREE from '../../vendor/three.module.min.js';
import { G, on } from '../state.js';
import { TS, kind, cost, tables, seats, fixtures, lore } from '../world.js';
import { createCast, startDay, update, speak } from '../sim.js';
import { Sfx } from '../audio.js';
import { skyAt } from '../render.js';
import { fmtTime, hourOf, clamp, lerp, mulberry } from '../util.js';
import * as TX from './tex.js';
import { makePerson, makeCat, makeItem, mat } from './people.js';
import { createFX } from './fx.js';
import { createSound } from './sound.js';
import { buildProps } from './props.js';

const S = 0.8;            // metres per tile
const H = 3.4;            // ceiling height
const px2m = (p) => (p / TS) * S;
const m2px = (m) => (m / S) * TS;

// ------------------------------------------------------------------ renderer
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0a0705');
scene.fog = new THREE.FogExp2('#1b120b', 0.03);
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 60);
// 2: shadows, bloom and haze; 1: bloom without shadows; 0: bare, for old phones
const quality = { level: 2, ratio: Math.min(window.devicePixelRatio || 1, 1.25) };
const fx = createFX(renderer);
const rnd = Math.random, rf = (a, b) => a + rnd() * (b - a);

function resize() {
  const w = window.innerWidth, h = window.innerHeight, ratio = quality.level === 2 ? quality.ratio : quality.level === 1 ? Math.min(quality.ratio, 1) : 0.7;
  renderer.setPixelRatio(ratio);
  renderer.setSize(w, h, false);
  fx.setSize(w, h, ratio);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ------------------------------------------------------------------ materials
const tex2 = (c, rep, bump = 0.02, blur = 0) => ({ map: TX.toTex(c, rep), bumpMap: TX.bumpOf(c, rep, blur), bumpScale: bump });
const plankC = TX.planks(11), stoneC = TX.stone(5), flagC = TX.flagstone(), woodC = TX.planks(13, [24, 40, 30]);
const M = {
  floor: new THREE.MeshStandardMaterial({ ...tex2(plankC, [19.2 / 2.4, 10.4 / 2.4], 0.7), roughness: 0.6 }),
  ceil: new THREE.MeshStandardMaterial({ ...tex2(TX.planks(12, [24, 30, 16]), [6, 4], 0.6), roughness: 0.95, color: '#8a7a6a' }),
  plaster: new THREE.MeshStandardMaterial({ ...tex2(TX.plaster(), [1, 1], 0.25, 1), roughness: 0.95 }),
  reveal: new THREE.MeshStandardMaterial({ color: '#a89878', roughness: 0.95 }),
  stone: new THREE.MeshStandardMaterial({ ...tex2(stoneC, [1, 1], 1.2, 1), roughness: 0.9 }),
  flag: new THREE.MeshStandardMaterial({ ...tex2(flagC, [3, 4], 1, 1), roughness: 0.7 }),
  cobble: new THREE.MeshStandardMaterial({ ...tex2(TX.cobbles(), [6, 4], 1.2, 1), roughness: 0.45 }),
  beam: new THREE.MeshStandardMaterial({ color: '#3a2615', roughness: 0.9 }),
  wood: new THREE.MeshStandardMaterial({ ...tex2(woodC, [1, 1], 0.6), roughness: 0.7 }),
  dark: new THREE.MeshStandardMaterial({ color: '#4a2f1b', roughness: 0.75 }),
  top: new THREE.MeshStandardMaterial({ color: '#6e4a2a', roughness: 0.4 }),
  soot: new THREE.MeshStandardMaterial({ color: '#120c08', roughness: 1 }),
  iron: new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.5, metalness: 0.7 }),
  wax: new THREE.MeshStandardMaterial({ color: '#efe6cf', roughness: 0.6, emissive: '#ffcc88', emissiveIntensity: 0.15 }),
};

M.stone.userData.wuv = 0.75; M.wood.userData.wuv = 0.3;

// Everything that never moves is collected here and merged into a handful of
// meshes once the room is built, so the firelight's shadows stay cheap.
const statics = [];
function add(mesh, x, y, z, o = {}) {
  mesh.position.set(x, y, z);
  if (o.cast !== false) mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (o.ry) mesh.rotation.y = o.ry;
  (o.parent || scene).add(mesh);
  if (!o.dyn) statics.push(mesh);
  return mesh;
}
function addGroup(g, cast = true) {
  scene.add(g);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = true; statics.push(o); } });
  return g;
}
// box from min/max corners (x0,y0,z0)-(x1,y1,z1)
function slab(x0, y0, z0, x1, y1, z1, m, o) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), k = m.userData.wuv;
  if (k) {      // map by position in the room, so stone courses and planks keep their size on any block
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + cx, y = p.getY(i) + cy, z = p.getZ(i) + cz, ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      if (ay > ax && ay > az) uv.setXY(i, z * k, x * k); else if (ax > az) uv.setXY(i, z * k, y * k); else uv.setXY(i, x * k, y * k);
    }
  }
  return add(new THREE.Mesh(g, m), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, o);
}
function plane(w, h, m) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); }
function batchStatics() {
  scene.updateMatrixWorld(true);
  const groups = new Map();
  for (const m of statics) {
    if (!m.parent) continue;
    const key = m.material.uuid + (m.castShadow ? 'c' : '-') + (m.receiveShadow ? 'r' : '-');
    let g = groups.get(key);
    if (!g) groups.set(key, g = { m, pos: [], nor: [], uv: [] });
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    geo.applyMatrix4(m.matrixWorld);
    g.pos.push(geo.attributes.position.array); g.nor.push(geo.attributes.normal.array); g.uv.push(geo.attributes.uv.array);
    m.removeFromParent(); m.geometry.dispose(); geo.dispose();
  }
  const cat = (list) => { const out = new Float32Array(list.reduce((n, a) => n + a.length, 0)); let o = 0; for (const a of list) { out.set(a, o); o += a.length; } return out; };
  for (const g of groups.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(cat(g.pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(cat(g.nor), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(cat(g.uv), 2));
    const mesh = new THREE.Mesh(geo, g.m.material);
    mesh.castShadow = g.m.castShadow; mesh.receiveShadow = g.m.receiveShadow;
    scene.add(mesh);
  }
  statics.length = 0;
}

// ------------------------------------------------------------------ the room
const X0 = S, X1 = 25 * S, Z0 = 2 * S, Z1 = 15 * S;
const WIN = [[3 * S, 5 * S], [14 * S, 17 * S]].map(([x0, x1]) => ({ w: x1 - x0 - 0.2, hgt: 1.3, cx: (x0 + x1) / 2, cy: 1.85 }));
const KX0 = 22 * S + 0.05, KX1 = 23 * S - 0.05, RECESS = 0.24;
// A wall with openings cut in it; plaster is mapped once floor to ceiling so the smoke stain sits at the top.
function wall(side, holes = []) {
  const horiz = side === 'back' || side === 'front';
  const a0 = horiz ? X0 : Z0, a1 = horiz ? X1 : Z1;
  const rects = [];
  let cur = a0;
  for (const h of [...holes].sort((p, q) => p.a - q.a)) {
    rects.push([cur, h.a, 0, H]);
    if (h.y0 > 0) rects.push([h.a, h.b, 0, h.y0]);
    rects.push([h.a, h.b, h.y1, H]);
    cur = h.b;
  }
  rects.push([cur, a1, 0, H]);
  for (const [u0, u1, y0, y1] of rects) {
    if (u1 - u0 < 0.001 || y1 - y0 < 0.001) continue;
    const g = new THREE.PlaneGeometry(u1 - u0, y1 - y0);
    const uv = g.attributes.uv, mid = (u0 + u1) / 2;
    for (let i = 0; i < uv.count; i++) {
      const lx = g.attributes.position.getX(i) * (side === 'front' || side === 'left' ? -1 : 1), ly = g.attributes.position.getY(i);
      uv.setXY(i, (mid + lx) / 2.6, ((y0 + y1) / 2 + ly) / H);
    }
    const m = new THREE.Mesh(g, M.plaster);
    if (side === 'back') add(m, mid, (y0 + y1) / 2, Z0, { cast: false });
    else if (side === 'front') add(m, mid, (y0 + y1) / 2, Z1, { cast: false, ry: Math.PI });
    else if (side === 'left') add(m, X0, (y0 + y1) / 2, mid, { cast: false, ry: Math.PI / 2 });
    else add(m, X1, (y0 + y1) / 2, mid, { cast: false, ry: -Math.PI / 2 });
  }
}
{
  const f = plane(X1 - X0, Z1 - Z0, M.floor); f.rotation.x = -Math.PI / 2; add(f, (X0 + X1) / 2, 0, (Z0 + Z1) / 2, { cast: false });
  const fl = plane(5 * S, 6 * S, M.flag); fl.rotation.x = -Math.PI / 2; add(fl, 22.5 * S, 0.004, 5 * S, { cast: false });
  const fl2 = plane(2 * S, S, M.flag); fl2.rotation.x = -Math.PI / 2; add(fl2, 24 * S, 0.004, 8.5 * S, { cast: false });
  const c = plane(X1 - X0, Z1 - Z0, M.ceil); c.rotation.x = Math.PI / 2; add(c, (X0 + X1) / 2, H, (Z0 + Z1) / 2, { cast: false });
  wall('back', [...WIN.map((w) => ({ a: w.cx - w.w / 2, b: w.cx + w.w / 2, y0: w.cy - w.hgt / 2, y1: w.cy + w.hgt / 2 })), { a: KX0, b: KX1, y0: 0, y1: 2.1 }]);
  wall('front', [{ a: 12 * S, b: 14 * S, y0: 0, y1: 2.2 }]);
  wall('left'); wall('right');
  // timber framing
  const inWin = (x) => WIN.some((w) => Math.abs(x - w.cx) < w.w / 2 + 0.1) || (x > KX0 - 0.1 && x < KX1 + 0.1);
  for (let x = X0 + 0.1; x < X1; x += 2.4) { if (!inWin(x)) slab(x - 0.1, 0, Z0, x + 0.1, H, Z0 + 0.12, M.beam); if (x < 12 * S - 0.2 || x > 14 * S + 0.2) slab(x - 0.1, 0, Z1 - 0.12, x + 0.1, H, Z1, M.beam); }
  for (let z = Z0 + 2.4; z < Z1; z += 2.4) { slab(X0, 0, z - 0.1, X0 + 0.12, H, z + 0.1, M.beam); slab(X1 - 0.12, 0, z - 0.1, X1, H, z + 0.1, M.beam); }
  // rails along the walls, broken where a doorway or window cuts through
  const rail = (y0, y1, zA, zB, gaps) => { let cur = X0; for (const [a, b] of [...gaps, [X1, X1]]) { if (a > cur) slab(cur, y0, zA, a, y1, zB, M.beam, { cast: false }); cur = Math.max(cur, b); } };
  rail(H - 0.25, H, Z0, Z0 + 0.14, []); rail(0, 0.18, Z0, Z0 + 0.14, [[KX0, KX1]]); rail(1.0, 1.08, Z0, Z0 + 0.14, [[KX0, KX1]]);
  rail(H - 0.25, H, Z1 - 0.14, Z1, []); rail(0, 0.18, Z1 - 0.14, Z1, [[12 * S, 14 * S]]); rail(1.0, 1.08, Z1 - 0.14, Z1, [[12 * S, 14 * S]]);
  for (const [a, b] of [[X0, X0 + 0.14], [X1 - 0.14, X1]]) { slab(a, H - 0.25, Z0, b, H, Z1, M.beam, { cast: false }); slab(a, 0, Z0, b, 0.18, Z1, M.beam, { cast: false }); slab(a, 1.0, Z0, b, 1.08, Z1, M.beam, { cast: false }); }
  // ceiling beams
  for (let x = X0 + 1.2; x < X1; x += 2.4) slab(x - 0.14, H - 0.36, Z0, x + 0.14, H, Z1, M.beam);
  slab(X0, H - 0.5, 7 * S - 0.2, X1, H - 0.34, 7 * S + 0.2, M.beam);
  // stairwell opening
  const hole = plane(2 * S, 2.5 * S, new THREE.MeshBasicMaterial({ color: '#050302' })); hole.rotation.x = Math.PI / 2; add(hole, X0 + S, H - 0.01, 6.25 * S, { cast: false, dyn: true });
}

// hearth
const HEARTH = new THREE.Vector3(8.0, 0.35, 2.05);
{
  const x0 = 8 * S, x1 = 12 * S, z0 = Z0, z1 = 3 * S;
  slab(x0, 0, z0, x0 + S, 1.3, z1, M.stone); slab(x1 - S, 0, z0, x1, 1.3, z1, M.stone);
  slab(x0, 1.45, z0, x1, H, z1 - 0.12, M.stone);
  slab(x0 - 0.15, 1.3, z0, x1 + 0.15, 1.45, z1 + 0.15, M.beam);
  slab(x0 + S, 1.2, z0, x1 - S, 1.3, z1 - 0.05, M.stone);
  const back = plane(1.6, 1.3, M.soot); add(back, 8.0, 0.65, z0 + 0.02, { cast: false });
  slab(x0 - 0.3, 0, z0, x1 + 0.3, 0.07, z1 + 0.45, M.stone, { cast: false });
  // on the mantle
  const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.2, 8), mat('#8a5a3a')); add(jug, 6.9, 1.55, 2.3);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat('#d8d0bc')); add(skull, 8.0, 1.53, 2.3);
  for (const x of [8.7, 9.1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 6), M.wax); add(c, x, 1.54, 2.28); }
  const sword = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.02), mat('#aab0b6', { metalness: 0.8, roughness: 0.3 })); add(sword, 8.0, 2.1, z1 - 0.1);
  // logs, charred where they sit in the embers
  for (const [dx, r] of [[-0.2, 0.3], [0.2, -0.3], [0, 0]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.9, 7), mat('#1c110a')); l.rotation.z = Math.PI / 2; l.rotation.y = r; add(l, 8.0 + dx, 0.16 + (dx === 0 ? 0.1 : 0), 2.05, { cast: false }); }
}

// stage and rug
slab(2 * S, 0, Z0, 5 * S, 0.22, 4 * S, M.wood);
{
  const r = new THREE.Mesh(new THREE.PlaneGeometry(6 * S, 3 * S), new THREE.MeshStandardMaterial({ map: TX.toTex(TX.rug(), [1, 1]), roughness: 1 }));
  r.rotation.x = -Math.PI / 2; add(r, 10 * S, 0.006, 4.5 * S, { cast: false });
}

// stairs up the left wall, rising toward the back
function stairElev(z) { return clamp((10 * S - z) / (5 * S), 0, 1) * 3.2; }
for (let i = 0; i < 10; i++) {
  const z1 = 10 * S - i * 0.4 * S * 1.25, z0 = z1 - 0.4 * S * 1.25;
  if (z1 <= 5 * S) break;
  const h = stairElev((z0 + z1) / 2) + 0.16;
  slab(X0, 0, Math.max(z0, 5 * S), 3 * S, h, z1, M.wood);
}
for (let z = 5.2 * S; z < 10 * S; z += 0.9) { slab(3 * S - 0.06, 0, z - 0.04, 3 * S, stairElev(z) + 1.0, z + 0.04, M.beam); }
{
  const len = 5 * S, rise = 3.2;
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, Math.hypot(len, rise)), M.beam);
  rail.position.set(3 * S - 0.03, 1.0 + rise / 2, 7.5 * S); rail.rotation.x = Math.atan2(rise, len); scene.add(rail);
}

// bar counter, shelves and kegs
{
  slab(19 * S, 0, Z0, 20 * S, 1.05, 9 * S, M.dark);
  slab(19 * S, 0, 8 * S, 23 * S, 1.05, 9 * S, M.dark);
  slab(19 * S - 0.06, 1.05, Z0, 20 * S + 0.06, 1.11, 9 * S + 0.06, M.top);
  slab(19 * S - 0.06, 1.05, 8 * S - 0.06, 23 * S + 0.06, 1.11, 9 * S + 0.06, M.top);
  for (let z = Z0 + 0.4; z < 9 * S; z += 0.8) slab(19 * S - 0.02, 0.15, z - 0.3, 19 * S, 0.95, z + 0.3, M.beam, { cast: false });
  for (let x = 19 * S + 0.4; x < 23 * S; x += 0.8) slab(x - 0.3, 0.15, 9 * S, x + 0.3, 0.95, 9 * S + 0.02, M.beam, { cast: false });
  const r = mulberry(21);
  const bottleCols = ['#2f5a3a', '#6b2a22', '#b08a3a', '#3a4a6a', '#d8d0bc', '#4a3020'];
  for (const y of [1.45, 2.05]) {
    slab(19 * S, y - 0.04, Z0, 22 * S - 0.1, y, Z0 + 0.3, M.beam);
    slab(23 * S + 0.1, y - 0.04, Z0, X1, y, Z0 + 0.3, M.beam);
    for (let x = 19 * S + 0.1; x < X1 - 0.1; x += 0.13 + r() * 0.08) {
      if (x > 22 * S - 0.2 && x < 23 * S + 0.2) continue;
      const h = 0.18 + r() * 0.14;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, h, 7), mat(bottleCols[Math.floor(r() * 6)], { roughness: 0.15, metalness: 0.1 }));
      add(b, x, y + h / 2, Z0 + 0.15, { cast: false });
    }
  }
  // kitchen door
  slab(22 * S, 2.1, Z0, 23 * S, 2.2, Z0 + 0.1, M.beam);
  for (let y = 3; y <= 6; y++) {
    const k = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.7, 12), mat('#6b4424'));
    k.rotation.z = Math.PI / 2; add(k, 24.5 * S, 0.42, (y + 0.5) * S);
    for (const dx of [-0.25, 0.25]) { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.04, 12), M.iron); band.rotation.z = Math.PI / 2; add(band, 24.5 * S + dx, 0.42, (y + 0.5) * S); }
    const tap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.04), mat('#c9a64a', { metalness: 0.7 })); add(tap, 24.5 * S - 0.38, 0.42, (y + 0.5) * S);
  }
  slab(24 * S, 0, 3 * S, X1, 0.1, 7 * S, M.beam);
}

// wall decorations
{
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16), mat('#7a2a22')); shield.rotation.x = Math.PI / 2; add(shield, 6.5 * S, 2.3, Z0 + 0.04);
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat('#c9a64a', { metalness: 0.7, roughness: 0.3 })); add(boss, 6.5 * S, 2.3, Z0 + 0.08);
  slab(17 * S, 1.6, Z0, 18.7 * S, 2.5, Z0 + 0.05, mat('#5a3a22'));
  for (const [x, y, w, h] of [[17.3, 1.75, 0.45, 0.55], [17.95, 1.85, 0.5, 0.4], [18.1, 2.3, 0.3, 0.15]]) slab(x * S, y, Z0 + 0.05, x * S + w, y + h, Z0 + 0.06, mat('#e0d4b4'), { cast: false });
  // antlers
  const bone = mat('#d8ccb0');
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.35 - i * 0.07, 5), bone); t.position.set(13.5 * S + s * (0.08 + i * 0.1), 2.55 + i * 0.08, Z0 + 0.08); t.rotation.z = -s * (0.5 + i * 0.3); scene.add(t); }
  // herbs drying from the beam over the stage
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 6), mat(['#5a7a3a', '#7a6a3a', '#4a6a3a', '#6a7a4a'][i])); b.rotation.x = Math.PI; add(b, 2.5 * S + i * 0.35, H - 0.6, Z0 + 0.3); }
}

// windows: set back in the wall; the glass is a live canvas (sky, town, weather)
const windows = [];
const paneTex = [TX.paneLight(2), TX.paneLight(3)];
WIN.forEach((W, wi) => {
  const { w, hgt, cx, cy } = W, zg = Z0 - RECESS;
  const [cv, g] = TX.canvas(256, 192);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const glass = plane(w, hgt, new THREE.MeshBasicMaterial({ map: tex, fog: false }));
  add(glass, cx, cy, zg, { cast: false, dyn: true });
  // the reveal: the thickness of the wall around the opening
  slab(cx - w / 2 - 0.02, cy - hgt / 2 - 0.02, zg, cx - w / 2, cy + hgt / 2 + 0.02, Z0, M.reveal, { cast: false }); slab(cx + w / 2, cy - hgt / 2 - 0.02, zg, cx + w / 2 + 0.02, cy + hgt / 2 + 0.02, Z0, M.reveal, { cast: false });
  slab(cx - w / 2, cy + hgt / 2, zg, cx + w / 2, cy + hgt / 2 + 0.02, Z0, M.reveal, { cast: false }); slab(cx - w / 2, cy - hgt / 2 - 0.05, zg, cx + w / 2, cy - hgt / 2, Z0 + 0.02, M.beam, { cast: false });
  // surround at the wall face, glazing bars at the glass
  for (const [a, b, c2, d] of [[-w / 2 - 0.08, -hgt / 2 - 0.08, w / 2 + 0.08, -hgt / 2], [-w / 2 - 0.08, hgt / 2, w / 2 + 0.08, hgt / 2 + 0.08], [-w / 2 - 0.08, -hgt / 2, -w / 2, hgt / 2], [w / 2, -hgt / 2, w / 2 + 0.08, hgt / 2]]) slab(cx + a, cy + b, Z0, cx + c2, cy + d, Z0 + 0.1, M.beam);
  const cols = wi ? 3 : 2;
  for (let i = 1; i < cols; i++) { const x = cx - w / 2 + (w * i) / cols; slab(x - 0.025, cy - hgt / 2, zg, x + 0.025, cy + hgt / 2, zg + 0.06, M.beam, { cast: false }); }
  slab(cx - w / 2, cy - 0.025, zg, cx + w / 2, cy + 0.025, zg + 0.06, M.beam, { cast: false });
  slab(cx - w / 2 - 0.12, cy - hgt / 2 - 0.12, Z0, cx + w / 2 + 0.12, cy - hgt / 2 - 0.08, Z0 + 0.2, M.beam);
  // light falling through: slices in the air and a pool on the boards
  const shaftMat = new THREE.MeshBasicMaterial({ map: paneTex[wi], color: '#ffe2b0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const shaft = new THREE.Group();
  for (let i = 1; i <= 22; i++) { const sl = plane(w * 1.05, hgt * 1.05, shaftMat); sl.position.set(0, -i * 0.076, i * 0.124); shaft.add(sl); }
  shaft.position.set(cx, cy, Z0); scene.add(shaft);
  const poolMat = new THREE.MeshBasicMaterial({ map: paneTex[wi], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const pool = plane(w * 1.1, 2.5, poolMat); pool.rotation.x = -Math.PI / 2; pool.position.set(cx, 0.02, Z0 + 3.05); scene.add(pool);
  const r = mulberry(70 + wi * 13);
  let rx = -20; const roofs = [];
  while (rx < 256) { const bw = 34 + r() * 46; roofs.push({ x: rx, w: bw, h: 34 + r() * 44, pitch: 14 + r() * 16, chim: r() < 0.6 ? r() : -1, lit: Array.from({ length: 2 }, () => (r() < 0.55 ? [0.15 + r() * 0.6, 0.3 + r() * 0.4, r()] : null)) }); rx += bw + 2 + r() * 10; }
  windows.push({
    cv, g, tex, w, cx, cy, shaftMat, poolMat, glass, roofs, acc: 1,
    hills: Array.from({ length: 18 }, (_, i) => 96 + Math.sin(i * 0.9 + wi * 2) * 9 + r() * 7),
    stars: Array.from({ length: 46 }, () => [r() * 256, r() * 110, 0.3 + r() * 0.5, r() * 6]),
    clouds: Array.from({ length: 7 }, () => ({ x: r() * 320 - 40, y: 10 + r() * 80, w: 50 + r() * 70, v: 1.5 + r() * 3 })),
    drops: Array.from({ length: 70 }, () => [Math.random() * 256, Math.random() * 192, 0.6 + Math.random()]),
    beads: Array.from({ length: 26 }, () => ({ x: Math.random() * 256, y: Math.random() * 192, v: 0, r: 1 + Math.random() * 1.8 })),
    moon: wi === 1,
  });
});

// front door: swings open when someone passes, onto the lane outside
const door = new THREE.Group();
const DOOR = new THREE.Vector3(13 * S, 1.2, Z1);
let rainOut, outsideMat, doorPool, laneGlow;
{
  door.position.set(12 * S, 0, Z1 - 0.06);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(2 * S, 2.2, 0.08), new THREE.MeshStandardMaterial({ ...tex2(woodC, [1, 1], 0.6), color: '#9a7a5a', roughness: 0.8 }));
  leaf.position.x = S; leaf.castShadow = true; leaf.receiveShadow = true; door.add(leaf);
  for (const y of [0.4, 1.8]) { const b = new THREE.Mesh(new THREE.BoxGeometry(2 * S, 0.06, 0.1), M.iron); b.position.set(0, y - 1.1, 0.01); leaf.add(b); }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 5, 12), M.iron); ring.position.set(0.6, 0, -0.05); leaf.add(ring);
  leaf.position.y = 1.1;
  scene.add(door);
  slab(12 * S - 0.12, 0, Z1 - 0.15, 12 * S, 2.35, Z1 + 0.3, M.beam); slab(14 * S, 0, Z1 - 0.15, 14 * S + 0.12, 2.35, Z1 + 0.3, M.beam);
  slab(12 * S - 0.12, 2.2, Z1 - 0.15, 14 * S + 0.12, 2.35, Z1 + 0.3, M.beam);
  slab(12 * S, -0.02, Z1 - 0.04, 14 * S, 0.03, Z1 + 0.4, M.stone, { cast: false });
  const ground = plane(14, 7.5, M.cobble); ground.rotation.x = -Math.PI / 2; add(ground, 13 * S, -0.01, Z1 + 3.75, { cast: false, dyn: true });
  const [laneTex, laneLit] = TX.street();
  outsideMat = new THREE.MeshBasicMaterial({ map: laneTex, fog: false });
  const lane = plane(18, 9, outsideMat); lane.rotation.y = Math.PI; add(lane, 13 * S, 3.0, Z1 + 7.4, { cast: false, dyn: true });
  laneGlow = new THREE.MeshBasicMaterial({ map: laneLit, fog: false, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  const lit = plane(18, 9, laneGlow); lit.rotation.y = Math.PI; lit.position.set(13 * S, 3.0, Z1 + 7.38); scene.add(lit);
  // rain seen through the doorway
  const N = 140, pos = new Float32Array(N * 6);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rainOut = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#a8b8d0', transparent: true, opacity: 0.35, fog: false }));
  rainOut.userData.d = Array.from({ length: N }, () => [8.6 + Math.random() * 4.4, Math.random() * 3.2, Z1 + 0.4 + Math.random() * 4.5, 7 + Math.random() * 4]);
  rainOut.frustumCulled = false; rainOut.visible = false; scene.add(rainOut);
  // cold light spilling over the threshold
  const [c, g] = TX.canvas(64, 128);
  const gr = g.createLinearGradient(0, 128, 0, 0); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.filter = 'blur(6px)'; g.fillRect(10, 0, 44, 128);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  doorPool = plane(2.0, 3.2, new THREE.MeshBasicMaterial({ map: tx, color: '#8fa4d0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  doorPool.rotation.x = -Math.PI / 2; doorPool.position.set(13 * S, 0.022, Z1 - 1.6); scene.add(doorPool);
}

// the inn from the lane: timber front, lit windows, a lantern and the sign over the door
const frontMat = new THREE.MeshBasicMaterial({ fog: false, alphaTest: 0.5, transparent: false });
const frontGlow = new THREE.MeshBasicMaterial({ fog: false, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
const signMat = new THREE.MeshBasicMaterial({ fog: false, side: THREE.DoubleSide });
const sign = new THREE.Group();
let lanternPool;
{
  const FW = 16, FH = 6, PX = 64, cx = 13 * S;
  const [c, g] = TX.canvas(FW * PX, FH * PX), [gc, gg] = TX.canvas(FW * PX / 2, FH * PX / 2);
  const X = (m) => (m - (cx - FW / 2)) * PX, Y = (m) => (FH - m) * PX;
  g.drawImage(TX.plaster(8), 0, 0, c.width, c.height);
  g.fillStyle = 'rgba(40,30,20,.25)'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#4a4640'; g.fillRect(0, Y(0.5), c.width, 0.5 * PX);                     // stone footing
  g.fillStyle = '#2c1c10';
  for (let x = 0; x <= FW; x += 1.6) g.fillRect(x * PX - 7, 0, 14, c.height);
  for (const y of [0.5, 2.5, 3.2, 5.9]) g.fillRect(0, Y(y) - 7, c.width, 14);
  for (let x = 0; x < FW; x += 3.2) { g.save(); g.translate(x * PX + 51, Y(4.5)); g.rotate(0.6); g.fillRect(-6, -90, 12, 180); g.restore(); }
  gg.fillStyle = '#000'; gg.fillRect(0, 0, gc.width, gc.height);
  for (const wx of [5.6, 7.4, 13.4, 15.2]) {
    g.fillStyle = '#2c1c10'; g.fillRect(X(wx) - 6, Y(2.3) - 6, 1.1 * PX + 12, 1.1 * PX + 12);
    g.fillStyle = '#3a2a18'; g.fillRect(X(wx), Y(2.3), 1.1 * PX, 1.1 * PX);
    const wg = gg.createRadialGradient(X(wx + 0.55) / 2, Y(1.7) / 2, 2, X(wx + 0.55) / 2, Y(1.75) / 2, 46);
    wg.addColorStop(0, '#ffd088'); wg.addColorStop(0.6, '#e08a30'); wg.addColorStop(1, '#7a3a10');
    gg.fillStyle = wg; gg.fillRect(X(wx) / 2, Y(2.3) / 2, 1.1 * PX / 2, 1.1 * PX / 2);
    gg.fillStyle = '#000'; gg.fillRect(X(wx + 0.52) / 2, Y(2.3) / 2, 3, 1.1 * PX / 2); gg.fillRect(X(wx) / 2, Y(1.78) / 2, 1.1 * PX / 2, 3);
    const hl = gg.createRadialGradient(X(wx + 0.55) / 2, Y(1.75) / 2, 20, X(wx + 0.55) / 2, Y(1.75) / 2, 70);
    hl.addColorStop(0, 'rgba(255,160,70,.16)'); hl.addColorStop(1, 'rgba(255,160,70,0)');
    gg.globalCompositeOperation = 'lighter'; gg.fillStyle = hl; gg.fillRect(X(wx - 1) / 2, Y(3.4) / 2, 3.1 * PX / 2, 3.2 * PX / 2); gg.globalCompositeOperation = 'source-over';
  }
  // the lantern by the door and the wash of light it throws on the wall
  const lx = X(11.75) / 2, ly = Y(2.05) / 2;
  const lg = gg.createRadialGradient(lx, ly, 1, lx, ly, 110); lg.addColorStop(0, 'rgba(255,215,150,1)'); lg.addColorStop(0.06, 'rgba(255,170,80,.6)'); lg.addColorStop(1, 'rgba(255,140,50,0)');
  gg.globalCompositeOperation = 'lighter'; gg.fillStyle = lg; gg.fillRect(lx - 110, ly - 110, 220, 220);
  g.fillStyle = '#1a1410'; g.fillRect(X(11.68), Y(2.25), 9, 26); g.fillRect(X(11.5), Y(2.28), 20, 4);
  g.clearRect(X(12 * S), Y(2.2), 2 * S * PX, 2.2 * PX);                                  // the doorway
  gg.fillStyle = '#000'; gg.globalCompositeOperation = 'source-over'; gg.fillRect(X(12 * S) / 2, Y(2.2) / 2, S * PX, 1.1 * PX);
  const ft = new THREE.CanvasTexture(c); ft.colorSpace = THREE.SRGBColorSpace; ft.anisotropy = 4; frontMat.map = ft;
  const gt = new THREE.CanvasTexture(gc); gt.colorSpace = THREE.SRGBColorSpace; frontGlow.map = gt;
  const wallOut = plane(FW, FH, frontMat); wallOut.position.set(cx, FH / 2, Z1 + 0.3); scene.add(wallOut);
  const glowOut = plane(FW, FH, frontGlow); glowOut.position.set(cx, FH / 2, Z1 + 0.31); scene.add(glowOut);
  lanternPool = plane(4.2, 3.4, new THREE.MeshBasicMaterial({ map: TX.glowSprite(), color: '#ff9a48', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  lanternPool.rotation.x = -Math.PI / 2; lanternPool.position.set(11.4, 0.012, Z1 + 1.5); scene.add(lanternPool);
  // the sign, swinging on its bracket
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.0), M.iron); arm.position.set(9.1, 3.25, Z1 + 0.8); scene.add(arm);
  const board = plane(1.5, 0.62, signMat); board.position.y = -0.4; sign.add(board);
  sign.position.set(9.1, 3.22, Z1 + 0.85); scene.add(sign);
}
function paintSign() {
  const [c, g] = TX.canvas(384, 160);
  g.fillStyle = '#3a2412'; g.fillRect(0, 0, 384, 160);
  g.strokeStyle = '#c9a24a'; g.lineWidth = 5; g.strokeRect(9, 9, 366, 142);
  g.fillStyle = '#e8c45a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const words = lore.inn.split(' '), half = Math.ceil(words.length / 2), lines = lore.inn.length > 16 ? [words.slice(0, half).join(' '), words.slice(half).join(' ')] : [lore.inn];
  let size = 54; g.font = `${size}px "IM Fell English SC", Georgia, serif`;
  while (Math.max(...lines.map((l) => g.measureText(l).width)) > 330 && size > 20) { size -= 2; g.font = `${size}px "IM Fell English SC", Georgia, serif`; }
  lines.forEach((l, i) => g.fillText(l, 192, 80 + (i - (lines.length - 1) / 2) * size * 1.05));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  signMat.map?.dispose(); signMat.map = t; signMat.needsUpdate = true;
}

// the kitchen passage: its door stands open on firelight, steam and the clatter of pots
const KITCHEN = new THREE.Vector3((KX0 + KX1) / 2, 1.2, Z0 - 0.6);
let kitchenGlow, kitchenPool;
{
  const d = 1.9, z1 = Z0 - d;
  const fl = plane(KX1 - KX0 + 0.3, d, M.flag); fl.rotation.x = -Math.PI / 2; add(fl, KITCHEN.x, 0.003, Z0 - d / 2, { cast: false });
  slab(KX0 - 0.2, 0, z1, KX0, 2.3, Z0, M.stone, { cast: false }); slab(KX1, 0, z1, KX1 + 0.2, 2.3, Z0, M.stone, { cast: false });
  slab(KX0 - 0.2, 2.1, z1, KX1 + 0.2, 2.3, Z0, M.beam, { cast: false });
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.66, 2.05, 0.05), mat('#5a3a22')); leaf.geometry.translate(0.33, 0, 0); leaf.rotation.y = 1.42; add(leaf, KX0 + 0.03, 1.03, Z0 - 0.04, { cast: false });
  const [c, g] = TX.canvas(64, 96);
  g.fillStyle = '#2a1608'; g.fillRect(0, 0, 64, 96);
  const gr = g.createRadialGradient(34, 70, 2, 34, 66, 60); gr.addColorStop(0, '#ffd890'); gr.addColorStop(0.3, '#e07a28'); gr.addColorStop(1, 'rgba(60,24,6,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 96);
  g.fillStyle = '#140a04'; g.fillRect(0, 30, 64, 3); g.fillRect(0, 52, 30, 3);
  for (const [x, w2, h2] of [[6, 7, 9], [16, 5, 12], [26, 8, 7], [44, 6, 10], [53, 6, 8]]) g.fillRect(x, 30 - h2, w2, h2);
  g.beginPath(); g.arc(46, 46, 7, 0, Math.PI); g.fill(); g.fillRect(45, 33, 2, 8); g.fillRect(8, 76, 20, 20);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  kitchenGlow = new THREE.MeshBasicMaterial({ map: tx, fog: false });
  add(plane(KX1 - KX0 + 0.4, 2.3, kitchenGlow), KITCHEN.x, 1.15, z1, { cast: false, dyn: true });
}

// furniture from the simulation's own map
for (const t of tables) {
  const x0 = t.x * S + 0.05, x1 = (t.x + t.w) * S - 0.05, z0 = t.y * S + 0.06, z1 = (t.y + 1) * S - 0.06;
  slab(x0, 0.72, z0, x1, 0.78, z1, t.booth ? M.dark : M.top);
  slab(x0 + 0.06, 0.62, z0 + 0.06, x1 - 0.06, 0.72, z1 - 0.06, M.beam, { cast: false });
  for (const [x, z] of [[x0 + 0.08, z0 + 0.08], [x1 - 0.08, z0 + 0.08], [x0 + 0.08, z1 - 0.08], [x1 - 0.08, z1 - 0.08]]) slab(x - 0.04, 0, z - 0.04, x + 0.04, 0.72, z + 0.04, M.beam);
}
function seatYaw(s) {
  if (s.bar) return s.x === 18 ? Math.PI / 2 : Math.PI;
  if (s.side === 'w') return Math.PI / 2;
  if (s.side === 'e') return -Math.PI / 2;
  return s.face === 'f' ? 0 : Math.PI;
}
{
  const jr = mulberry(90);
  for (const s of seats) {
    s.yaw = seatYaw(s);
    const cx = (s.x + 0.5) * S, cz = (s.y + 0.5) * S;
    const g = new THREE.Group(); g.position.set(cx, 0, cz);
    if (s.stool) {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.17, 0.06, 10), M.top); top.position.y = 0.7; g.add(top);
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.7, 5), M.beam); l.position.set(Math.cos(a) * 0.12, 0.35, Math.sin(a) * 0.12); l.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12); g.add(l); }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 4, 10), M.beam); ring.rotation.x = Math.PI / 2; ring.position.y = 0.25; g.add(ring);
      s.h = 0.72;
    } else {
      const booth = s.table && s.table.booth;
      g.rotation.y = s.yaw + (booth ? 0 : (jr() - 0.5) * 0.22);     // nobody ever pushes a chair in straight
      const seatMesh = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.42), M.dark); seatMesh.position.y = 0.45; g.add(seatMesh);
      for (const [x, z] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, z < 0 && !booth ? 0.98 : 0.45, 0.04), M.beam); l.position.set(x, z < 0 && !booth ? 0.49 : 0.225, z); g.add(l); }
      if (booth) { const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.9, 0.05), M.dark); back.position.set(0, 0.9, -0.2); g.add(back); }
      else for (const y of [0.66, 0.88]) { const sl = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.03), M.beam); sl.position.set(0, y, -0.17); g.add(sl); }
      s.h = 0.47;
    }
    addGroup(g);
  }
}
// soft pools of shade under tables and chairs, so candle-lit furniture sits on the floor
{
  const ao = new THREE.MeshBasicMaterial({ map: TX.blobShadow(), transparent: true, depthWrite: false, opacity: 0.75 });
  const dab = (x, z, w, d) => { const m = plane(w, d, ao); m.rotation.x = -Math.PI / 2; add(m, x, 0.009, z, { cast: false }); };
  for (const t of tables) dab((t.x + t.w / 2) * S, (t.y + 0.5) * S, t.w * S + 0.9, 1.7);
  for (const s of seats) dab((s.x + 0.5) * S, (s.y + 0.5) * S, 0.85, 0.85);
  dab(19.5 * S, 5.5 * S, 1.6, 6.4); dab(21 * S, 8.5 * S, 4, 1.6); dab(24.5 * S, 5 * S, 1.4, 3.8);
}
const strawTex = TX.toTex(TX.plaster(6), [3, 2]);
const props = buildProps({ scene, add, slab, addGroup, M, S, H, X0, X1, Z0, Z1, strawTex, windows });

// ------------------------------------------------------------------ light
const hemi = new THREE.HemisphereLight('#ffe8c8', '#3a2a1a', 0.4); scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffe2b0', 0); sun.position.set(8, 6, -6); sun.target.position.set(10, 0, 6); scene.add(sun, sun.target);
const fireLight = new THREE.PointLight('#ff9d55', 30, 0, 1.6);
fireLight.position.set(8.0, 0.7, 2.6);
fireLight.castShadow = true;
fireLight.shadow.mapSize.set(512, 512);
fireLight.shadow.bias = -0.004;
fireLight.shadow.radius = 4;
fireLight.shadow.camera.near = 0.2;
scene.add(fireLight);
const lightning = new THREE.DirectionalLight('#c8d4ff', 0); lightning.position.set(10, 5, -8); scene.add(lightning);

const flameTex = TX.flameSprite();
const glowTex = TX.glowSprite();
const smokeTex = TX.smokeSprite();
const HDR = 2;      // flames are brighter than white, so they bloom
function sprite(tex, s, color = '#ffffff', opacity = 1, o = {}) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: false, ...o }));
  sp.scale.set(s, s, 1);
  return sp;
}
const hot = (hex, k = HDR) => new THREE.Color(hex).multiplyScalar(k);
kitchenPool = plane(1.6, 2.2, new THREE.MeshBasicMaterial({ map: glowTex, color: '#ff9a48', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
kitchenPool.rotation.x = -Math.PI / 2; kitchenPool.position.set(KITCHEN.x, 0.024, Z0 + 0.5); scene.add(kitchenPool);

// fixture lights: candles, sconces, lanterns
const lamps = [];
for (const f of fixtures) {
  let pos;
  const g = new THREE.Group();
  if (f.type === 'candle') {
    const t = f.table;
    pos = new THREE.Vector3((t.x + t.w / 2) * S, 0.78, (t.y + 0.5) * S);
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.02, 8), mat('#b8a47a', { metalness: 0.5 })); holder.position.y = 0.01; g.add(holder);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.14, 8), M.wax); c.position.y = 0.09; g.add(c);
    for (let i = 0; i < 3; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.008, 5, 4), M.wax); d.scale.y = 2.5; d.position.set(Math.cos(i * 2.3) * 0.023, 0.1 + i * 0.02, Math.sin(i * 2.3) * 0.023); g.add(d); }
    g.userData.flameY = 0.19;
  } else if (f.type === 'sconce') {
    const x = f.x < 100 ? X0 + 0.14 : X1 - 0.14;
    pos = new THREE.Vector3(x, 1.75, (f.y / TS) * S + 0.3);
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.06), M.iron); br.position.x = f.x < 100 ? -0.06 : 0.06; g.add(br);
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.03, 0.03, 8), M.iron); dish.position.y = 0.02; g.add(dish);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 8), M.wax); c.position.y = 0.09; g.add(c);
    g.userData.flameY = 0.2;
  } else {
    pos = new THREE.Vector3((f.x / TS) * S, 1.11, (f.y / TS) * S);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.14), new THREE.MeshStandardMaterial({ color: '#ffcf80', emissive: '#ff9a30', emissiveIntensity: 0, transparent: true, opacity: 0.85 }));
    fr.position.y = 0.13; g.add(fr); g.userData.glass = fr;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.24, 0.014), M.iron); bar.position.set(x * 0.07, 0.13, z * 0.07); g.add(bar); }
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.08, 4), M.iron); cap.position.y = 0.28; cap.rotation.y = Math.PI / 4; g.add(cap);
    g.userData.flameY = 0.12;
  }
  g.position.copy(pos);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);
  const fl = sprite(flameTex, 0.07, hot('#ffffff', 2)); fl.position.y = g.userData.flameY; fl.center.set(0.5, 0.15); g.add(fl);
  const gl = sprite(glowTex, 0.5, '#ffb060', 0.5); gl.position.y = g.userData.flameY + 0.02; g.add(gl);
  const light = new THREE.PointLight('#ffc080', 0, 0, 2);
  light.position.set(0, g.userData.flameY + 0.1, 0);
  g.add(light);
  lamps.push({ f, g, fl, gl, light, pos, base: f.type === 'candle' ? 1.6 : f.type === 'sconce' ? 2.2 : 2.4, phase: Math.random() * 10, on: 0, was: false });
}

// the fire itself: flames, a bed of embers, sparks, and smoke drawn up the chimney
const FIRE_FRAG = `
uniform float time, fire, seed; varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= .5; } return s; }
void main(){
  vec2 uv = vUv; float x = (uv.x - .5) * 2.;
  // separate tongues: the height of the flame wanders along the logs
  float h = (.22 + .7 * fire) * (.45 + .85 * noise(vec2(uv.x * 3.2 + seed, time * .9 + seed)));
  float n = fbm(vec2(uv.x * 4.5 + seed, uv.y * 3.2 - time * 1.9));
  float n2 = fbm(vec2(uv.x * 9. - seed, uv.y * 7. - time * 3.1));
  float lick = uv.x + (n2 - .5) * .25 * uv.y;
  float body = 1. - smoothstep(.55, 1., abs((lick - .5) * 2.) * (1. + uv.y * .9));
  float f = body * (1. - uv.y / h) + (n - .5) * 1.3 * (.25 + uv.y * 2.2) + (n2 - .5) * .45;
  f = clamp(f * 1.25, 0., 1.) * smoothstep(0., .05, uv.y) * body;
  vec3 col = mix(vec3(.9, .12, .01), vec3(1., .5, .08), smoothstep(.15, .55, f));
  col = mix(col, vec3(1., .8, .42), smoothstep(.65, 1., f));
  gl_FragColor = vec4(col * f * f * 0.5, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const flames = [];
for (const [dz, w, sd] of [[-0.14, 1.5, 1.7], [0, 1.35, 5.3], [0.13, 1.2, 9.1]]) {
  const m = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, fire: { value: 0.8 }, seed: { value: sd } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: FIRE_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const f = plane(w, 1.45, m); f.position.set(HEARTH.x, 0.14 + 0.725, HEARTH.z + dz); scene.add(f); flames.push(m);
}
const fireGlow = sprite(glowTex, 2.8, '#ff9040', 0.5); fireGlow.position.set(8.0, 0.55, 2.3); scene.add(fireGlow);
const embers = plane(1.25, 0.5, new THREE.MeshBasicMaterial({ map: glowTex, color: hot('#ff4a12', 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
embers.rotation.x = -Math.PI / 2; embers.position.set(8.0, 0.09, 2.05); scene.add(embers);
const SPARKS = 70;
const sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
const sparkLife = new Float32Array(SPARKS).map(() => Math.random());
const sparkV = Array.from({ length: SPARKS }, () => [0, 0]);
const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: hot('#ffb050', 3), size: 0.016, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
sparks.frustumCulled = false; scene.add(sparks);

// soft particles: chimney smoke, steam off the stew, pipe smoke, a snuffed wick
const PUFFS = 70, puffs = [];
for (let i = 0; i < PUFFS; i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0, depthWrite: false }));
  sp.visible = false; scene.add(sp); puffs.push({ sp, life: 1, max: 1 });
}
let puffI = 0;
function puff(x, y, z, o = {}) {
  const p = puffs[puffI = (puffI + 1) % PUFFS];
  p.sp.position.set(x, y, z); p.life = 0; p.max = o.life || 2.5;
  p.vx = o.vx || 0; p.vy = o.vy ?? 0.25; p.vz = o.vz || 0; p.s0 = o.s0 || 0.08; p.s1 = o.s1 || 0.4; p.op = o.op || 0.25;
  p.sp.material.color.set(o.col || '#b8b0a4'); p.sp.material.rotation = Math.random() * 6; p.sp.visible = true;
}
// a smoky haze that hangs under the beams and catches the firelight
const haze = [];
for (let i = 0; i < 7; i++) {
  const sp = sprite(smokeTex, 5, '#ffb070', 0.05, { fog: true });
  sp.userData = { x: X0 + 2 + Math.random() * (X1 - X0 - 4), z: Z0 + 1.5 + Math.random() * (Z1 - Z0 - 3), y: 2.1 + Math.random() * 0.9, ph: Math.random() * 10 };
  sp.material.rotation = Math.random() * 6; scene.add(sp); haze.push(sp);
}

// dust drifting in the air
const DUST = 420;
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(DUST * 3);
for (let i = 0; i < DUST; i++) { dustPos[i * 3] = X0 + Math.random() * (X1 - X0); dustPos[i * 3 + 1] = Math.random() * H; dustPos[i * 3 + 2] = Z0 + Math.random() * (Z1 - Z0); }
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#ffe0b0', size: 0.012, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
scene.add(dust);

batchStatics();

// ------------------------------------------------------------------ sound
const sound = createSound({
  hearth: HEARTH, door: DOOR, kitchen: KITCHEN, bar: new THREE.Vector3(20.5 * S, 1.2, 5 * S), stage: new THREE.Vector3(3.5 * S, 1.3, 3 * S),
  windows: windows.map((w) => new THREE.Vector3(w.cx, w.cy, Z0)),
});
function startAudio() { Sfx.spatial = true; Sfx.setOn(true); sound.start(); }
const surfaceAt = (x, z) => { const k = kind[Math.floor(z / S)]?.[Math.floor(x / S)]; return k === 'rug' ? 'rug' : k === 'flag' ? 'flag' : 'wood'; };
const camDir = new THREE.Vector3();

// ------------------------------------------------------------------ people
const bodies = new Map();
const blobTex = TX.blobShadow();
function bodyFor(a) {
  let b = bodies.get(a);
  if (!b) {
    b = a.kind === 'cat' ? makeCat(a.catCol) : makePerson(a);
    b.root.userData.agent = a;
    scene.add(b.root);
    b.blob = plane(1, 1, new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.8 }));
    b.blob.rotation.x = -Math.PI / 2; b.blob.renderOrder = 1; scene.add(b.blob);
    bodies.set(a, b);
    b.last = { x: a.x, y: a.y }; b.fresh = true;
  }
  return b;
}
const tableItems = new Map();   // key -> mesh
function placeItem(key, kindName, x, y, z) {
  let it = tableItems.get(key);
  if (!it || it.userData.kind !== kindName) {
    if (it) scene.remove(it);
    it = makeItem(kindName); it.userData.kind = kindName;
    it.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(it); tableItems.set(key, it);
  }
  it.position.set(x, y, z); it.visible = true; it.userData.seen = true;
  return it;
}

const now = () => performance.now() / 1000;
const wrap = (d) => { while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const life = { doorT: 0, wasMusic: false, fast: false, cat: null, talkers: [] };
const headPos = new THREE.Vector3();

function syncPeople(dt, t) {
  for (const it of tableItems.values()) it.userData.seen = false;
  const ms = performance.now();
  life.talkers = G.agents.filter((a) => a.present && a.bubble && ms < a.bubble.until && !a.bubble.whisper);
  life.cat = null;
  const bard = G.music.playing ? G.music.bard : null;
  if (life.wasMusic && !G.music.playing && !life.fast) {
    const fans = G.agents.filter((a) => a.present && a.kind === 'person' && a.sitting && a.mood > 0.4);
    for (const a of fans) { const b = bodies.get(a); if (b) b.anim.clap = rf(1.8, 3.2); }
    sound.claps(fans.map((a) => ({ x: px2m(a.x), y: 1, z: px2m(a.y - 5) })));
  }
  life.wasMusic = G.music.playing;
  const k = Math.min(1, dt * 11);

  for (const a of G.agents) {
    const b = bodies.get(a);
    if (!a.present) { if (b) { b.root.visible = false; b.blob.visible = false; b.fresh = true; } continue; }
    const B = bodyFor(a);
    B.root.visible = true;
    const X = px2m(a.x), Z = px2m(a.y - 5);
    const tile = kind[a.ty] && kind[a.ty][a.tx];
    const onStairs = tile === 'stairs';
    const elev = onStairs ? stairElev(Z) : tile === 'stage' ? 0.22 : 0;
    const moving = !!a.path;
    const dx = a.x - B.last.x, dz = a.y - B.last.y;
    B.last = { x: a.x, y: a.y };
    let yaw = B.anim.yaw;
    if (moving && Math.hypot(dx, dz) > 0.01) yaw = Math.atan2(dx, dz);
    if (a.sitting && a.seat) yaw = a.seat.yaw;
    const partner = a.convo ? (a.convo.a === a ? a.convo.b : a.convo.a) : null;
    if (!moving && !a.sitting && partner) yaw = Math.atan2(partner.x - a.x, partner.y - a.y);
    B.anim.yaw += wrap(yaw - B.anim.yaw) * Math.min(1, dt * 8);
    B.root.rotation.set(0, B.anim.yaw, 0);
    B.blob.visible = !onStairs;

    if (B.cat) {
      B.root.position.set(X, elev, Z);
      const sleep = a.pose === 'sleep', sit = a.pose === 'sit';
      B.body.scale.set(1, (sleep ? 0.6 : 1) + Math.sin(t * 1.6) * 0.025, sleep ? 0.7 : 1);
      B.body.position.y = sleep ? 0.08 : 0.16;
      B.head.position.y = sleep ? 0.12 : sit ? 0.32 : 0.26;
      B.tail.rotation.y = Math.sin(t * 2 + a.id) * (sleep ? 0.1 : 0.6);
      B.tail.rotation.x = sit ? -0.6 : 0.3;
      B.legs.forEach((l, i) => { l.visible = !sleep; l.rotation.x = moving ? Math.sin(a.walkPhase * Math.PI + i * Math.PI) * 0.6 : 0; });
      if (a.sitting === false && a.pose === 'sit' && tile === 'seat') B.root.position.y = 0.47;
      B.blob.position.set(X, B.root.position.y + 0.016, Z); B.blob.scale.set(0.5, 0.5, 1);
      life.cat = B.root.position;
      continue;
    }

    const A = B.anim, sc = B.scale, ph0 = A.ph;
    let rootY = elev, tx = X, tz = Z;
    const [L, R] = B.legs;
    const [AL, AR] = B.arms;
    const ph = a.walkPhase * Math.PI;
    const act = a.activity || '';
    const talking = a.bubble && ms < a.bubble.until;
    const breath = Math.sin(t * 1.4 + ph0);
    // reset pose
    for (const j of B.joints) j.rotation.set(0, 0, 0);
    B.body.rotation.set(0, 0, 0); B.body.position.set(0, 0, 0);
    AL.sh.rotation.z = -0.07; AR.sh.rotation.z = 0.07;
    B.chest.scale.y = 1 + breath * 0.014;
    B.torso.rotation.x = breath * 0.008;
    const mug = a.seat && a.seat.mug && a.seat.mug.owner === a.id && a.seat.mug.level > 0.02 ? a.seat.mug : null;
    let drinking = false, busyArms = false;

    if (a.sitting) {
      const s = a.seat;
      rootY = (s ? s.h : 0.47) - 0.84 * sc + 0.02;
      const spread = 0.12 + 0.1 * Math.sin(ph0 * 3);
      L.hip.rotation.set(-Math.PI / 2 + 0.1, 0, -spread * 0.5); R.hip.rotation.set(-Math.PI / 2 + 0.1, 0, spread * 0.5);
      L.knee.rotation.x = Math.PI / 2 - 0.1 + Math.sin(ph0) * 0.25; R.knee.rotation.x = Math.PI / 2 - 0.1 + Math.cos(ph0 * 1.7) * 0.25;
      const fwd = 0.08;
      tx = (s ? (s.x + 0.5) * S : X) + Math.sin(yaw) * fwd; tz = (s ? (s.y + 0.5) * S : Z) + Math.cos(yaw) * fwd;
      if (B.legs.skirt) B.legs.skirt.visible = false;
      const engaged = partner || talking;
      const slump = a.sick ? 0 : a.drunk > 0.75 ? 0.22 : 0;
      B.torso.rotation.x += (engaged ? 0.17 : -0.03 + 0.05 * Math.sin(ph0 * 2)) + slump;
      B.torso.rotation.z = Math.sin(t * 0.23 + ph0) * 0.025;
      for (const arm of B.arms) { arm.sh.rotation.x = engaged ? -0.8 : -0.5; arm.el.rotation.x = engaged ? -0.95 : -0.7; arm.sh.rotation.z = arm.side * -0.1; }
      if (slump) B.head.rotation.x = 0.25;
      if (G.music.playing && a !== bard && a.mood > 0.45) { R.knee.rotation.x += Math.max(0, Math.sin(t * 6.4 + ph0)) * 0.12; B.head.rotation.x += Math.sin(t * 6.4 + ph0) * 0.03; }
    } else {
      const swing = moving ? Math.sin(ph) * 0.55 : 0;
      L.hip.rotation.x = swing; R.hip.rotation.x = -swing;
      L.knee.rotation.x = moving ? Math.max(0, Math.sin(ph + 1.2)) * 0.8 : 0;
      R.knee.rotation.x = moving ? Math.max(0, Math.sin(ph + 1.2 + Math.PI)) * 0.8 : 0;
      AL.sh.rotation.x = -swing * 0.7; AR.sh.rotation.x = swing * 0.7;
      AL.el.rotation.x = AR.el.rotation.x = moving ? -0.35 : -0.12;
      if (moving) {
        rootY += Math.abs(Math.cos(ph)) * 0.035;
        B.torso.rotation.x += 0.07; B.torso.rotation.y = -swing * 0.16;
        const si = Math.floor(a.walkPhase);
        if (si !== A.stepI) { A.stepI = si; if (!life.fast) sound.step({ x: X, z: Z }, surfaceAt(X, Z), 0.55 * sc); }
      } else {
        // standing: weight drifts from one foot to the other
        const w = Math.sin(t * 0.33 + ph0);
        B.body.rotation.z = w * 0.035; B.body.position.x = w * 0.02; B.torso.rotation.z = -w * 0.04;
        L.hip.rotation.z = -w * 0.035; R.hip.rotation.z = -w * 0.035;
        if (/by the fire/.test(act)) { for (const arm of B.arms) { arm.sh.rotation.x = -0.95; arm.el.rotation.x = -0.45; arm.sh.rotation.z = arm.side * -(0.2 + 0.06 * Math.sin(t * 5 + ph0)); } busyArms = true; }
        if (/candles/.test(act)) { AR.sh.rotation.x = -1.7; AR.el.rotation.x = -0.3; busyArms = true; }
        if (/drawing a drink/.test(act)) { AR.sh.rotation.x = -1.0; AR.el.rotation.x = -0.6; busyArms = true; }
      }
      if (a.carry === 'broom') { const sw = Math.sin(t * 3.6 + ph0); AR.sh.rotation.x = -0.75 + sw * 0.25; AL.sh.rotation.x = -0.9 + sw * 0.25; AL.el.rotation.x = AR.el.rotation.x = -0.6; AL.sh.rotation.z = 0.3; B.torso.rotation.x += 0.22; B.torso.rotation.y = sw * 0.2; busyArms = true; }
      else if (a.carry && a.carry !== 'lute' && a.carry !== 'relic') { AR.sh.rotation.x = -0.75; AR.el.rotation.x = -1.0; busyArms = true; }
      if (B.legs.skirt) B.legs.skirt.visible = true;
    }
    if (B.cloak) B.cloak.rotation.x = moving ? 0.2 + Math.sin(ph * 2) * 0.05 : a.sitting ? 0.12 : 0.03;
    // drunken sway
    if (a.drunk > 0.6) B.torso.rotation.z += Math.sin(t * 0.9 + a.id) * 0.06;
    if (a.dance) {
      rootY += Math.abs(Math.sin(t * 6 + a.id)) * 0.08;
      AL.sh.rotation.z = -2.4 + Math.sin(t * 6) * 0.3; AR.sh.rotation.z = 2.4 + Math.sin(t * 6 + 1) * 0.3;
      B.root.rotation.y += Math.sin(t * 2 + a.id) * 0.5; busyArms = true;
    }
    if (a.shake) { AR.sh.rotation.x = -1.4 + Math.sin(t * 14 + a.id) * 0.6; AL.sh.rotation.x = -1.2; B.torso.rotation.x = 0.2; busyArms = true; }
    if (a.sick) { B.torso.rotation.x = 0.9; B.head.rotation.x = 0.4; AL.sh.rotation.x = AR.sh.rotation.x = -1.2; busyArms = true; }
    if (a.hand) { AR.sh.rotation.x = -2.5 + Math.sin(t * 5) * 0.08; AR.el.rotation.x = -0.45; AR.sh.rotation.z = 0.25; busyArms = true; }

    // a new line: give it a voice, from where they are
    if (a.bubble && a.bubble !== B.lastBubble) {
      B.lastBubble = a.bubble;
      if (!life.fast) { B.head.getWorldPosition(headPos); sound.voice(a, headPos, a.bubble.text, Math.max(0.6, (a.bubble.until - ms) / 1000 - 0.2), { whisper: a.bubble.whisper, loud: a.bubble.loud }); }
    }
    // talking: nods, a hand that helps the words along, a moving mouth
    if (talking) {
      B.head.rotation.x += Math.sin(t * 5.3 + a.id) * 0.05;
      if (!busyArms) { const gs = 0.5 + 0.5 * Math.sin(t * 2.3 + a.id); AL.sh.rotation.x += -0.35 - gs * 0.35; AL.el.rotation.x = -1.0 - gs * 0.3; AL.sh.rotation.z = -0.15 - gs * 0.2; }
      B.mouth.scale.set(0.85, 1 + Math.abs(Math.sin(t * 16 + ph0)) * (a.bubble.whisper ? 1.5 : 4.5) * (0.4 + 0.6 * Math.abs(Math.sin(t * 4.7 + ph0))), 1);
    } else B.mouth.scale.set(1, 1, 1);
    // mirth at a good table, and applause when a song ends
    if (a.sitting && partner && !talking && a.mood > 0.6 && a.drunk > 0.12 && A.laugh <= 0 && !life.fast && rnd() < dt * 0.02 && !(partner.bubble && partner.bubble.whisper)) {
      A.laugh = 1.3; B.head.getWorldPosition(headPos); sound.laugh(a, headPos);
    }
    if (A.laugh > 0) {
      A.laugh -= dt;
      B.torso.rotation.x += -0.14 + Math.sin(t * 24) * 0.035; B.head.rotation.x -= 0.22; rootY += Math.abs(Math.sin(t * 24)) * 0.006;
      B.mouth.scale.set(1.1, 5, 1);
    }
    if (A.clap > 0) { A.clap -= dt; for (const arm of B.arms) { arm.sh.rotation.x = -0.95; arm.el.rotation.x = -1.15; arm.sh.rotation.z = arm.side * -(0.2 + 0.22 * Math.abs(Math.sin(t * 13 + ph0))); } busyArms = true; }

    // where the head turns: partner, whoever is speaking nearby, you, the door, the bard, or nothing much
    let lookYaw = null, lookPitch = 0;
    const rx = B.root.position.x, rz = B.root.position.z;
    const pdx = player.x - rx, pdz = player.z - rz, pd = Math.hypot(pdx, pdz);
    const speaker = !partner && life.talkers.find((o) => o !== a && Math.hypot(o.x - a.x, o.y - a.y) < 44);
    if (partner) { lookYaw = Math.atan2(partner.x - a.x, partner.y - a.y); lookPitch = partner.sitting === a.sitting ? 0 : a.sitting ? -0.3 : 0.25; }
    else if (pd < 2.4) { lookYaw = Math.atan2(pdx, pdz); lookPitch = clamp((camera.position.y - (B.root.position.y + 1.55 * sc)) / Math.max(0.5, pd) * -0.8, -0.4, 0.3); }
    else if (speaker) lookYaw = Math.atan2(speaker.x - a.x, speaker.y - a.y);
    else if (life.doorT > 0 && a.id % 3 !== 0) lookYaw = Math.atan2(DOOR.x - rx, DOOR.z - rz);
    else if (bard && bard !== a && (a.id + Math.floor(t / 11)) % 3 !== 0) lookYaw = Math.atan2(px2m(bard.x) - rx, px2m(bard.y - 5) - rz);
    let hy;
    if (lookYaw !== null) hy = clamp(wrap(lookYaw - B.anim.yaw), -1.15, 1.15);
    else {
      A.glanceT -= dt;
      if (A.glanceT < 0) { A.glanceT = rf(1.5, 6); A.glance = rnd() < 0.35 ? 0 : rf(-0.75, 0.75); A.glanceP = rf(-0.08, 0.16); }
      hy = A.glance; lookPitch = A.glanceP;
    }
    A.headYaw += (hy - A.headYaw) * Math.min(1, dt * 4);
    A.headPitch += (lookPitch - A.headPitch) * Math.min(1, dt * 4);
    B.neck.rotation.y = A.headYaw * 0.35; B.head.rotation.y = A.headYaw * 0.65;
    B.head.rotation.x += A.headPitch;
    if (!busyArms && !talking && !a.sitting && !moving) {       // now and then, a hand to the chin
      A.fidget -= dt;
      if (A.fidget < 0) { AL.sh.rotation.x = -0.55; AL.el.rotation.x = -2.0; AL.sh.rotation.z = 0.15; if (A.fidget < -2.2) A.fidget = rf(7, 18); }
    }

    // held things, drinking and eating
    let holdKind = a.carry || null;
    if (!holdKind && a.sitting && mug && A.laugh <= 0 && !(A.clap > 0)) {
      if (mug.kind === 'stew') {
        const cyc = (t * 0.42 + ph0) % 1;
        if (cyc < 0.5 && !talking) { const up = Math.sin((cyc / 0.5) * Math.PI); AR.sh.rotation.x = -0.75 - up * 0.45; AR.el.rotation.x = -1.0 - up * 0.9; AR.sh.rotation.z = 0.1 + up * 0.25; B.head.rotation.x += 0.12 + up * 0.08; B.torso.rotation.x += 0.08; }
      } else {
        A.drinkT -= dt;
        if (A.drinkT < 0) { drinking = true; if (A.drinkT < -1.8) A.drinkT = (talking || partner ? 7 : 5) + Math.random() * 9; }
        if (drinking) { holdKind = mug.kind; AR.sh.rotation.x = -1.2; AR.el.rotation.x = -1.6; AR.sh.rotation.z = 0.35; B.head.rotation.x = -0.25; B.mouth.scale.set(1, 1, 1); }
      }
    }
    if (a.carry === 'lute') {
      const playing = bard === a;
      AL.sh.rotation.x = -0.9; AL.el.rotation.x = -1.2; AR.sh.rotation.x = -0.6; AR.el.rotation.x = -1.0 + (playing ? Math.sin(t * 12) * 0.25 : 0);
      if (playing) { B.torso.rotation.z += Math.sin(t * 1.6) * 0.05; B.head.rotation.x += Math.sin(t * 3.2) * 0.05; R.knee.rotation.x += Math.max(0, Math.sin(t * 6.4)) * 0.2; B.head.getWorldPosition(headPos); sound.lute(headPos); }
    }
    if (B.heldKind !== holdKind) {
      if (B.held) B.held.parent.remove(B.held);
      B.held = holdKind ? makeItem(holdKind === 'empty' ? 'mug' : holdKind) : null;
      B.heldKind = holdKind;
      if (B.held) {
        if (holdKind === 'lute') { B.held.position.set(0, 0.28, 0.2); B.held.rotation.set(0, 0, -0.9); B.torso.add(B.held); }
        else { B.held.position.set(0, -0.05, 0.03); B.arms[1].grip.add(B.held); }
      }
    }
    if (B.held && B.held.userData.flameAt) {
      B.held.userData.flame ||= (() => { const f = sprite(flameTex, 0.06, hot('#ffffff', 2)); f.position.y = B.held.userData.flameAt; f.center.set(0.5, 0.15); B.held.add(f); return f; })();
    }
    a._drinking = drinking;

    // eyes: blink, and droop with drink
    A.blinkT -= dt;
    if (A.blinkT < -0.11) A.blinkT = rf(1.4, 5.5);
    const lid = A.blinkT < 0 ? 0.1 : a.sick ? 0.4 : a.drunk > 0.7 ? 0.55 : A.laugh > 0 ? 0.35 : 1;
    for (const e of B.eyes) e.scale.y = lid;

    // ease every joint toward its pose so nothing snaps
    if (a.sitting !== B.wasSitting) { if (B.wasSitting !== undefined && !B.fresh && !life.fast) sound.scrape({ x: tx, z: tz }); B.wasSitting = a.sitting; }
    if (B.fresh) B.root.position.set(tx, rootY, tz);
    else { const kp = a.sitting || !moving ? Math.min(1, dt * 6) : 1; B.root.position.x += (tx - B.root.position.x) * kp; B.root.position.z += (tz - B.root.position.z) * kp; B.root.position.y += (rootY - B.root.position.y) * Math.min(1, dt * 9); }
    for (let i = 0; i < B.joints.length; i++) {
      const j = B.joints[i].rotation, p = B.prev[i];
      if (B.fresh) p.set(j.x, j.y, j.z);
      else { p.x += (j.x - p.x) * k; p.y += (j.y - p.y) * k; p.z += (j.z - p.z) * k; j.set(p.x, p.y, p.z); }
    }
    B.fresh = false;
    B.blob.position.set(B.root.position.x, elev + 0.016, B.root.position.z);
    const bs = (a.sitting ? 0.95 : 0.7) * sc; B.blob.scale.set(bs, bs, 1);

    // steam from a bowl, smoke from a pipe
    if (!G.reduced && !life.fast) {
      if (mug && mug.kind === 'stew' && rnd() < dt * 2.2) puff(px2m(a.seat.item[0]), (a.seat.bar ? 1.11 : 0.78) + 0.06, px2m(a.seat.item[1] + 2), { life: 1.6, vy: 0.22, s0: 0.05, s1: 0.22, op: 0.16, col: '#e8e4dc' });
      if (a.pipe && a.sitting && rnd() < dt * 0.9) { B.head.getWorldPosition(headPos); puff(headPos.x + Math.sin(B.anim.yaw) * 0.2, headPos.y, headPos.z + Math.cos(B.anim.yaw) * 0.2, { life: 4, vy: 0.14, s0: 0.05, s1: 0.5, op: 0.2, col: '#b4b0b8' }); }
    }
  }
  syncTable();
  for (const it of tableItems.values()) if (!it.userData.seen) it.visible = false;
}
function syncTable() {
  for (const s of seats) {
    if (!s.mug) { s._mug = null; continue; }
    const ix = px2m(s.item[0]), iz = px2m(s.item[1] + 2), iy = s.bar ? 1.11 : 0.78;
    if (s._mug !== s.mug) { s._mug = s.mug; if (!life.fast) sound.clunk({ x: ix, y: iy, z: iz }); }
    const occ = s.occupant;
    if (occ && occ._drinking && s.mug.owner === occ.id) continue;
    const k = s.mug.level > 0.02 ? s.mug.kind : 'empty';
    placeItem('seat' + s.id, k, ix, iy, iz);
  }
  for (const t of tables) t.extra.forEach((e, i) => { const it = placeItem(`tx${t.id}${i}`, e, (t.x + 0.3 + i * 0.25) * S, 0.78, (t.y + 0.55) * S); if (it.userData.spin) it.userData.spin.rotation.y += 0.02; });
  G.items.forEach((e, i) => placeItem('item' + i, e.kind, px2m(e.x), 0.78, px2m(e.y)));
}

// ------------------------------------------------------------------ you
const ARRIVE = !G.reduced;
const player = ARRIVE ? { x: 13 * S, z: Z1 + 3.4, yaw: 0, pitch: 0.16, intro: -1,
  bob: 0, elev: 0, vx: 0, vz: 0, sit: null, eye: 1.62, back: null, stepI: 0, lean: 0 } : { x: 15.5 * S, z: 13.2 * S, yaw: 0.62, pitch: -0.08, intro: null, bob: 0, elev: 0, vx: 0, vz: 0, sit: null, eye: 1.62, back: null, stepI: 0, lean: 0 };
const keys = new Set();
// your own shadow, thrown across the boards by the fire
const shade = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.1, 3, 8), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
shade.castShadow = true; shade.frustumCulled = false; scene.add(shade);
function blockedAt(x, z) {
  const tx = Math.floor(x / S), tz = Math.floor(z / S);
  if (!kind[tz] || kind[tz][tx] === undefined) return true;
  const k = kind[tz][tx];
  if (cost[tz][tx] === 0 || k === 'door') return true;
  if (k === 'stairs' && tz <= 6) return true;
  return false;
}
function canStand(x, z) {
  const r = 0.2;
  for (const [dx, dz] of [[-r, -r], [r, -r], [-r, r], [r, r]]) if (blockedAt(x + dx, z + dz)) return false;
  // no stepping onto the staircase from the side
  const on = (xx, zz) => kind[Math.floor(zz / S)]?.[Math.floor(xx / S)] === 'stairs';
  if (on(player.x, player.z) !== on(x, z) && Math.floor(Math.max(z, player.z) / S) !== 10 && Math.floor(Math.min(z, player.z) / S) !== 9) return false;
  return true;
}
// chairs, barrels and people are round things you slide around rather than walk through
function pushOut(x, z) {
  const push = (cx, cz, r) => { const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz); if (d < r && d > 0.001) { x = cx + (dx / d) * r; z = cz + (dz / d) * r; } };
  for (const s of props.solids) push(s.x, s.z, s.r + 0.2);
  for (const s of seats) if (!s.stool || s.occupant) push((s.x + 0.5) * S, (s.y + 0.5) * S, 0.4);
  for (const [a, b] of bodies) if (a.present && a.kind === 'person' && !a.sitting) push(b.root.position.x, b.root.position.z, 0.46);
  return [x, z];
}
function nearSeat() {
  let best = null, bd = 1.05;
  for (const s of seats) {
    if (s.occupant || s.reserved) continue;
    const d = Math.hypot((s.x + 0.5) * S - player.x, (s.y + 0.5) * S - player.z);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
function toggleSit() {
  if (player.sit) { player.sit.reserved = null; player.sit = null; if (player.back) { player.x = player.back.x; player.z = player.back.z; } sound.scrape(player); return; }
  const s = nearSeat();
  if (!s) return;
  player.back = { x: player.x, z: player.z }; player.sit = s; s.reserved = player; player.vx = player.vz = 0;
  sound.scrape(player);
}
// arriving: a moment in the lane under the sign, then the door opens and you walk in
function arrive(dt) {
  const u = (player.intro += dt);
  life.hold = u > 0.4;
  const k = clamp((u - 1.5) / 3.6, 0, 1), e = k * k * (3 - 2 * k);
  const z = lerp(Z1 + 3.4, Z1 - 1.6, e);
  player.bob += Math.abs(z - player.z) * 3.6; player.z = z;
  if (k > 0 && k < 1) player.pitch += (-0.04 - player.pitch) * Math.min(1, dt * 1.2);
  const si = Math.floor(player.bob / Math.PI);
  if (si !== player.stepI) { player.stepI = si; sound.step(null, z > Z1 + 0.2 ? 'flag' : 'wood', 0.9); }
  if (u > 5.6) { player.intro = null; life.hold = false; }
}
function movePlayer(dt) {
  let f = 0, s = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
  f += touch.move.y; s += touch.move.x;
  const len = Math.hypot(f, s);
  if (player.sit) {
    const st = player.sit;
    if (st.occupant || (st.reserved && st.reserved !== player)) { player.sit = null; if (st.reserved === player) st.reserved = null; if (player.back) { player.x = player.back.x; player.z = player.back.z; } return; }
    const k = Math.min(1, dt * 5);
    player.x += ((st.x + 0.5) * S - player.x) * k; player.z += ((st.y + 0.5) * S - player.z) * k;
    player.eye += (st.h + 0.74 - player.eye) * k; player.elev += (0 - player.elev) * k;
    if (len > 0.6 && Math.hypot((st.x + 0.5) * S - player.x, (st.y + 0.5) * S - player.z) < 0.1) toggleSit();
    return;
  }
  player.eye += (1.62 - player.eye) * Math.min(1, dt * 5);
  const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2.6 : 1.5;
  let wx = 0, wz = 0;
  if (len > 0.05) {
    f /= Math.max(1, len); s /= Math.max(1, len);
    const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
    wx = (-sin * f + cos * s) * speed; wz = (-cos * f - sin * s) * speed;
  }
  // a body has weight: ease into a walk and out of it
  const acc = Math.min(1, dt * (len > 0.05 ? 7 : 9));
  player.vx += (wx - player.vx) * acc; player.vz += (wz - player.vz) * acc;
  const ox = player.x, oz = player.z;
  if (canStand(player.x + player.vx * dt, player.z)) player.x += player.vx * dt; else player.vx = 0;
  if (canStand(player.x, player.z + player.vz * dt)) player.z += player.vz * dt; else player.vz = 0;
  const [qx, qz] = pushOut(player.x, player.z);
  if ((qx !== player.x || qz !== player.z) && canStand(qx, qz)) { player.x = qx; player.z = qz; }
  const moved = Math.hypot(player.x - ox, player.z - oz);
  player.bob += moved * 3.6;
  player.lean += (s * 0.012 * (moved > 0.0005 ? 1 : 0) - player.lean) * Math.min(1, dt * 5);
  const si = Math.floor(player.bob / Math.PI);
  if (si !== player.stepI) { player.stepI = si; sound.step(null, surfaceAt(player.x, player.z), speed > 2 ? 1.2 : 0.9); }
  const onStairs = kind[Math.floor(player.z / S)]?.[Math.floor(player.x / S)] === 'stairs';
  player.elev = lerp(player.elev, onStairs ? stairElev(player.z) : 0, Math.min(1, dt * 10));
}

// ------------------------------------------------------------------ HUD, captions, input
const $ = (s) => document.querySelector(s);
const captions = [];
const COLORS = ['#e8b04a', '#9ad0c2', '#e89a7a', '#b8a8e0', '#a8d08a', '#e0c07a', '#8ab8e0', '#e08aa8'];
on('heard', (h) => {
  captions.unshift({ who: h.who, text: h.text, whisper: h.whisper, at: now() });
  captions.length = Math.min(captions.length, 4);
  renderCaptions();
});
let clueDay = 0;
on('clue', () => { if (clueDay === G.day) return; clueDay = G.day; toast('You overheard something that matters tonight. Your journal in the 2D room keeps track of clues.'); });
on('dawn', () => { $('#dawn').hidden = false; document.exitPointerLock?.(); G.paused = true; });
function renderCaptions() {
  const t = now();
  $('#captions').innerHTML = captions.filter((c) => t - c.at < 7).slice(0, 3).reverse().map((c) =>
    `<p class="${c.whisper ? 'whisper' : ''}" style="opacity:${clamp(1.4 - (t - c.at) / 5, 0.2, 1).toFixed(2)}"><b style="color:${c.who.role === 'stranger' ? '#9aa89a' : COLORS[c.who.id % COLORS.length]}">${esc(c.who.first)}</b> ${esc(c.text)}</p>`).join('');
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function toast(text) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = text;
  $('#toasts').prepend(el);
  setTimeout(() => el.remove(), 5000);
}
on('toast', ({ text }) => toast(text));

// people notice you: a word of greeting the first time you come close and catch their eye
const greeted = new Set();
let greetT = 4;
function greetings(dt) {
  greetT -= dt;
  if (greetT > 0) return;
  greetT = 0.5;
  for (const [a, b] of bodies) {
    if (!a.present || a.kind !== 'person' || greeted.has(a.id + ':' + G.day) || a.convo || a.busy || a.sick || a.role === 'stranger' || (a.bubble && performance.now() < a.bubble.until)) continue;
    const dx = player.x - b.root.position.x, dz = player.z - b.root.position.z, d = Math.hypot(dx, dz);
    if (d > 1.7 || Math.abs(wrap(Math.atan2(dx, dz) - b.anim.yaw)) > 1.2) continue;
    // and you are looking back at them
    if (Math.abs(wrap(Math.atan2(-dx, -dz) - (player.yaw + Math.PI))) > 0.6) continue;
    greeted.add(a.id + ':' + G.day);
    if (rnd() < 0.3) continue;
    const wet = G.weather !== 'clear';
    const lines = a.role === 'keeper' ? ['Evening. Find a seat, I\'ll be round.', 'Welcome in. Mind the cat.', wet ? 'Shut that door behind you, it\'s foul out.' : 'Come in, come in. Fire\'s lit.']
      : ['Evening.', 'Evening, stranger.', wet ? 'Foul night to be on the road.' : 'Fine evening for it.', 'Hm? Oh. Evening.', 'New face. Welcome.', a.drunk > 0.5 ? 'Heh. Hello, you.' : 'Well met.'];
    speak(a, lines[Math.floor(rnd() * lines.length)]);
    greetT = 6;
    break;
  }
}

const touch = { move: { x: 0, y: 0 }, id: null, lookId: null, sx: 0, sy: 0, lx: 0, ly: 0 };
let entered = false, locked = false, fadeT = 0;
function enter(withSound) {
  $('#intro').hidden = true;
  entered = true;
  G.paused = false;
  if (player.intro != null) player.intro = 0;
  if (withSound) startAudio();
  if (!matchMedia('(pointer: coarse)').matches) canvas.requestPointerLock?.()?.catch?.(() => {});
  setTimeout(() => $('#hint').classList.add('gone'), 14000);
}
$('#enterSound').addEventListener('click', () => enter(true));
$('#enterQuiet').addEventListener('click', () => enter(false));
$('#act').addEventListener('click', () => toggleSit());
$('#again').addEventListener('click', () => { $('#dawn').hidden = true; if (player.sit) toggleSit(); startDay(G.day + 1); G.paused = false; captions.length = 0; });
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; $('#hint').classList.toggle('dim', locked); });
canvas.addEventListener('click', () => { if (entered && !locked && !matchMedia('(pointer: coarse)').matches) canvas.requestPointerLock?.()?.catch?.(() => {}); });
let dragging = false;
canvas.addEventListener('mousedown', () => { dragging = true; });
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', (e) => {
  if (!entered) return;
  if (locked || dragging) { player.yaw -= e.movementX * 0.0022; player.pitch = clamp(player.pitch - e.movementY * 0.0022, -1.2, 1.2); }
});
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'KeyM') { if (!sound.on) startAudio(); else Sfx.setOn(!Sfx.on); }
  if (e.code === 'KeyQ') { quality.level = (quality.level + 2) % 3; autoQ = true; applyQuality(); toast(['Low quality: fastest', 'Medium quality: no shadows', 'High quality'][quality.level]); }
  if (e.code === 'KeyE' && entered) toggleSit();
  if (e.code === 'Space') { e.preventDefault(); G.paused = !G.paused; }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
// touch: left half moves, right half looks
canvas.addEventListener('touchstart', (e) => {
  for (const t of e.changedTouches) {
    if (t.clientX < window.innerWidth / 2 && touch.id === null) {
      touch.id = t.identifier; touch.sx = t.clientX; touch.sy = t.clientY;
      const st = $('#stick'); st.hidden = false; st.style.left = t.clientX + 'px'; st.style.top = t.clientY + 'px'; st.firstChild.style.transform = '';
    }
    else if (touch.lookId === null) { touch.lookId = t.identifier; touch.lx = t.clientX; touch.ly = t.clientY; }
  }
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === touch.id) {
      touch.move.x = clamp((t.clientX - touch.sx) / 50, -1, 1); touch.move.y = clamp(-(t.clientY - touch.sy) / 50, -1, 1);
      $('#stick').firstChild.style.transform = `translate(${touch.move.x * 34}px, ${-touch.move.y * 34}px)`;
    }
    if (t.identifier === touch.lookId) { player.yaw -= (t.clientX - touch.lx) * 0.005; player.pitch = clamp(player.pitch - (t.clientY - touch.ly) * 0.005, -1.2, 1.2); touch.lx = t.clientX; touch.ly = t.clientY; }
  }
}, { passive: true });
const touchEnd = (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === touch.id) { touch.id = null; touch.move.x = touch.move.y = 0; $('#stick').hidden = true; }
    if (t.identifier === touch.lookId) touch.lookId = null;
  }
};
canvas.addEventListener('touchend', touchEnd);
canvas.addEventListener('touchcancel', touchEnd);

function applyQuality() {
  renderer.shadowMap.enabled = quality.level === 2;
  fireLight.castShadow = quality.level === 2;
  fx.enabled = quality.level >= 1;
  for (const h of haze) h.visible = quality.level >= 1;
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  resize();
}

// who am I looking at?
const ray = new THREE.Raycaster();
function lookTarget() {
  ray.setFromCamera({ x: 0, y: 0 }, camera);
  let best = null, bd = 4.5;
  for (const [a, b] of bodies) {
    if (!a.present || !b.root.visible) continue;
    const p = b.root.position.clone(); p.y += (a.kind === 'cat' ? 0.2 : a.sitting ? 1.0 : 1.2) * (b.scale || 1);
    const d = ray.ray.distanceToPoint(p), along = p.clone().sub(ray.ray.origin).dot(ray.ray.direction);
    if (along > 0 && d < 0.35 && along < bd) { bd = along; best = a; }
  }
  return best;
}

// ------------------------------------------------------------------ frame
let fireClock = 0, expo = 1.3;
let last = performance.now(), fpsT = 0, fpsN = 0, autoQ = /[?&]hq\b/.test(location.search), uiT = 0, kick = 0, doorWas = false;
const nightTint = new THREE.Color(), tmpC = new THREE.Color();
function frame(nowMs) {
  const dt = Math.min(0.1, (nowMs - last) / 1000); last = nowMs;
  const t = nowMs / 1000;
  life.fast = keys.has('KeyF');
  if (!G.paused) {
    let sdt = dt * (life.fast ? 12 : 1);
    while (sdt > 0) { const s = Math.min(0.25, sdt); update(s); sdt -= s; }
  }
  G.particles.length = 0;       // the 2D view's sparks and notes; this room draws its own
  if (entered) { if (player.intro != null) arrive(dt); else { movePlayer(dt); if (!G.paused) greetings(dt); } }
  G.sel = null;
  G.ear = { x: m2px(player.x), y: m2px(player.z) - 3 };

  // camera: a walking head bobs, rolls a little into its turns, and is never perfectly still
  const still = G.reduced ? 0 : 1;
  const bob = Math.sin(player.bob * 2) * 0.022 * still, sway = Math.sin(t * 0.6) * 0.004 * still;
  camera.position.set(player.x + Math.cos(player.yaw) * Math.sin(player.bob) * 0.012 * still, player.eye + player.elev + bob + Math.sin(t * 1.3) * 0.003 * still, player.z - Math.sin(player.yaw) * Math.sin(player.bob) * 0.012 * still);
  camera.rotation.set(player.pitch + sway, player.yaw, -player.lean * still, 'YXZ');
  shade.position.set(player.x, player.eye - 0.75 + player.elev, player.z);
  shade.scale.y = player.sit ? 0.6 : 1;

  // time of day
  const h = hourOf(G.t);
  const sky = skyAt(h);
  const clear = G.weather === 'clear', storm = G.weather === 'storm';
  const moon = clear && (h >= 19.5 || h < 6) ? 1 : 0;
  hemi.intensity = 0.11 + sky.day * 0.5;
  hemi.color.setRGB(...sky.amb.map((v) => clamp(v / 200, 0, 1.2))).lerp(nightTint.set('#8a9ac8'), (1 - sky.day) * 0.5);
  sun.intensity = sky.day * 0.6;
  scene.fog.color.setRGB(0.1 + sky.day * 0.18, 0.07 + sky.day * 0.15, 0.045 + sky.day * 0.12);
  scene.fog.density = 0.02 + (1 - sky.day) * 0.01;
  if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 2.5);
  const flash = G.reduced ? 0 : G.flash;
  lightning.intensity = flash * 3;
  for (const w of windows) {
    w.acc += dt;
    if (w.acc > 0.08) { drawWindow(w, sky, h, t, w.acc); w.acc = 0; }
    w.glass.material.color.setScalar(1 + sky.day * 1.3 + flash * 3);
    // gold at dusk, silver under a clear moon, white for an instant in a storm
    tmpC.setRGB(1, 0.8, 0.52).multiplyScalar(sky.day * 0.9).add(nightTint.setRGB(0.5, 0.62, 1).multiplyScalar(moon * 0.22 + flash * 1.5 + (1 - sky.day) * 0.05));
    w.poolMat.color.copy(tmpC); w.poolMat.opacity = 0.4;
    w.shaftMat.color.copy(tmpC); w.shaftMat.opacity = 0.014 * clamp(sky.day * 1.5 + flash, 0, 1);
  }

  // the door opens for anyone near it, and the night comes in with them
  const near = life.hold || G.agents.some((a) => a.present && a.kind === 'person' && a.ty >= 14 && a.tx >= 11 && a.tx <= 14);
  door.rotation.y = lerp(door.rotation.y, near ? -1.5 : 0, Math.min(1, dt * (near ? 4 : 2.2)));
  const open = clamp(-door.rotation.y / 1.5, 0, 1);
  if (near && !doorWas) life.doorT = 2.6;
  doorWas = near; life.doorT -= dt;
  outsideMat.color.setRGB(0.2 + sky.day * 1.1 + flash, 0.23 + sky.day * 1.05 + flash, 0.34 + sky.day * 0.9 + flash);
  laneGlow.color.setScalar((1 - sky.day) * 1.6);
  doorPool.material.opacity = open * (0.1 + sky.day * 0.5 + moon * 0.12 + flash);
  rainOut.visible = !clear && (open > 0.03 || player.z > Z1);
  const outC = outsideMat.color;
  frontMat.color.copy(outC); signMat.color.setRGB(outC.r + 0.25 * (1 - sky.day), outC.g + 0.18 * (1 - sky.day), outC.b);
  frontGlow.color.setScalar(0.25 + (1 - sky.day) * 1.5); lanternPool.material.opacity = 0.12 + 0.4 * (1 - sky.day);
  sign.rotation.x = G.reduced ? 0 : Math.sin(t * 1.1) * (0.03 + (sound.gust || 0) * (storm ? 0.3 : 0.08));
  if (rainOut.visible) {
    const arr = rainOut.geometry.attributes.position.array, d = rainOut.userData.d;
    for (let i = 0; i < d.length; i++) {
      const p = d[i]; p[1] -= p[3] * dt; if (p[1] < 0) { p[1] = 3.2; p[0] = 8.6 + Math.random() * 4.4; }
      arr[i * 6] = p[0]; arr[i * 6 + 1] = p[1]; arr[i * 6 + 2] = p[2]; arr[i * 6 + 3] = p[0] + 0.03; arr[i * 6 + 4] = p[1] + 0.22; arr[i * 6 + 5] = p[2];
    }
    rainOut.geometry.attributes.position.needsUpdate = true;
  }
  const draft = G.reduced ? 0 : Math.max(open, storm ? (sound.gust || 0) * 0.5 : 0);

  // fire
  const fire = G.fire;
  kick = Math.max(0, kick - dt * 3);
  if (!G.reduced && rnd() < dt * 0.6 * fire) kick = rf(0.1, 0.3);
  const flick = G.reduced ? 1 : 1 + 0.1 * Math.sin(t * 11) + 0.08 * Math.sin(t * 17.3) + 0.06 * Math.sin(t * 5.1) + 0.05 * Math.sin(t * 29.7) + kick - draft * 0.12 * Math.sin(t * 23);
  fireLight.intensity = (12 + 26 * fire) * flick;
  fireLight.position.x = 8.0 + (G.reduced ? 0 : Math.sin(t * 7) * 0.05 + Math.sin(t * 13.1) * 0.03);
  fireLight.position.y = 0.7 + (G.reduced ? 0 : Math.sin(t * 9.3) * 0.04);
  fireGlow.material.opacity = 0.16 + 0.2 * fire * flick;
  embers.material.opacity = clamp(0.5 + 0.4 * fire + (G.reduced ? 0 : 0.15 * Math.sin(t * 2.1) + 0.1 * Math.sin(t * 3.7)), 0, 1);
  fireClock += dt * (G.reduced ? 0.12 : 1);
  for (const f of flames) { f.uniforms.time.value = fireClock; f.uniforms.fire.value = clamp(fire + kick * 0.5, 0, 1.4); }
  const sp = sparkGeo.attributes.position.array;
  for (let i = 0; i < SPARKS; i++) {
    sparkLife[i] += dt * (0.35 + fire * 0.5);
    if (sparkLife[i] > 1) { sparkLife[i] = 0; sp[i * 3] = HEARTH.x + (Math.random() - 0.5) * 0.6; sp[i * 3 + 2] = HEARTH.z + (Math.random() - 0.5) * 0.2; sparkV[i][0] = (Math.random() - 0.5) * 0.25; sparkV[i][1] = Math.random() < 0.12 ? 0.5 + Math.random() * 0.5 : 0; }
    sp[i * 3 + 1] = 0.25 + sparkLife[i] * 1.1 - sparkV[i][1] * sparkLife[i] * sparkLife[i] * 1.2;
    sp[i * 3] += (Math.sin(t * 5 + i) * 0.16 + sparkV[i][0]) * dt;
    sp[i * 3 + 2] += sparkV[i][1] * dt * 0.9;       // now and then one spits out onto the hearthstone
  }
  sparkGeo.attributes.position.needsUpdate = true;
  if (!G.reduced && rnd() < dt * (2 + fire * 3)) puff(HEARTH.x + rf(-0.35, 0.35), 0.75, HEARTH.z - 0.05, { life: 1.3, vy: 0.75, s0: 0.25, s1: 0.6, op: 0.22, col: '#3a332e' });
  const dp = dustGeo.attributes.position.array;
  for (let i = 0; i < DUST; i++) { dp[i * 3 + 1] += Math.sin(t * 0.3 + i) * 0.0008; dp[i * 3] += Math.cos(t * 0.2 + i * 1.3) * 0.0006 + draft * 0.0012; if (dp[i * 3] > X1) dp[i * 3] = X0; }
  dustGeo.attributes.position.needsUpdate = true;
  dust.material.opacity = 0.22 + 0.25 * sky.day;
  for (const p of puffs) {
    if (!p.sp.visible) continue;
    p.life += dt;
    const q = p.life / p.max;
    if (q >= 1) { p.sp.visible = false; continue; }
    p.sp.position.x += (p.vx + Math.sin(t * 1.3 + p.max * 9) * 0.03 + draft * 0.15) * dt; p.sp.position.y += p.vy * dt; p.sp.position.z += p.vz * dt;
    const sz = lerp(p.s0, p.s1, q); p.sp.scale.set(sz, sz, 1);
    p.sp.material.opacity = p.op * Math.min(1, q * 5) * (1 - q);
  }
  for (const hz of haze) {
    const u = hz.userData;
    hz.position.set(u.x + Math.sin(t * 0.05 + u.ph) * 1.2, u.y + Math.sin(t * 0.08 + u.ph * 2) * 0.15, u.z + Math.cos(t * 0.04 + u.ph) * 0.9);
    const dF = Math.hypot(hz.position.x - HEARTH.x, hz.position.z - HEARTH.z);
    hz.material.opacity = (0.018 + 0.05 * fire * flick / (1 + dF * 0.35)) + sky.day * 0.012;
  }
  kitchenGlow.color.setScalar(G.closing >= 3 ? 0.25 : 1.5 + (G.reduced ? 0 : 0.25 * Math.sin(t * 6.3) + 0.15 * Math.sin(t * 14.1)));
  kitchenPool.material.opacity = G.closing >= 3 ? 0.04 : 0.22 + (G.reduced ? 0 : 0.05 * Math.sin(t * 6.3));

  // candles, sconces, lanterns follow the simulation (the pot-boy lights them)
  for (const l of lamps) {
    const lit = l.f.lit;
    if (lit !== l.was) { if (!lit && l.was && !G.reduced) for (let i = 0; i < 3; i++) puff(l.pos.x, l.pos.y + l.g.userData.flameY + 0.03, l.pos.z, { life: 2.2 + i * 0.5, vy: 0.3, s0: 0.03, s1: 0.3, op: 0.3, col: '#c8c4c0' }); l.was = lit; }
    l.on += ((lit ? 1 : 0) - l.on) * Math.min(1, dt * (lit ? 2.5 : 8));
    const amp = 1 + draft * 3.5;
    const fl = G.reduced ? 1 : Math.max(0.35, 1 + amp * (0.1 * Math.sin(t * 13 + l.phase) + 0.05 * Math.sin(t * 23 + l.phase)));
    l.light.intensity = l.base * l.on * fl;
    l.fl.visible = l.gl.visible = l.on > 0.02;
    l.fl.scale.set(0.05 * fl * l.on, 0.09 * fl * l.on, 1);
    l.fl.material.rotation = G.reduced ? 0 : Math.sin(t * 9 + l.phase) * 0.12 * amp - draft * 0.3;
    l.gl.material.opacity = 0.5 * l.on * fl;
    if (l.g.userData.glass) l.g.userData.glass.material.emissiveIntensity = 1.3 * l.on;
  }

  syncPeople(dt, t);
  camera.getWorldDirection(camDir);
  sound.listener(camera.position, camDir);
  sound.update(dt, { door: open, hour: h, fast: life.fast, cat: life.cat, catNear: life.cat && Math.hypot(life.cat.x - player.x, life.cat.z - player.z) < 1.5 });
  Sfx.update(dt);
  if (fadeT < 1 && entered) fadeT = Math.min(1, fadeT + dt / (G.reduced ? 0.01 : 2.2));
  fx.uniforms.fade.value = fadeT * fadeT * (3 - 2 * fadeT);
  {
    const fdx = HEARTH.x - camera.position.x, fdz = HEARTH.z - camera.position.z, fd = Math.hypot(fdx, fdz) || 1;
    const facing = Math.max(0, (camDir.x * fdx + camDir.z * fdz) / fd);
    const glare = facing * facing * clamp(1.15 - fd / 9, 0.2, 1) * clamp(fire, 0, 1);
    expo += (1.52 - 0.5 * glare - 0.22 * sky.day - expo) * Math.min(1, dt * 0.9);
    fx.uniforms.exposure.value = expo;
  }
  fx.uniforms.grain.value = G.reduced ? 0.015 : 0.035;
  fx.render(scene, camera, t, !G.reduced);

  // HUD
  uiT += dt;
  if (uiT > 0.2) {
    uiT = 0;
    $('#clock').textContent = `${fmtTime(G.t)} · ${{ clear: 'clear', rain: 'rain', storm: 'storm' }[G.weather]}${G.paused && entered ? ' · paused' : ''}`;
    const who = entered ? lookTarget() : null;
    $('#look').innerHTML = who ? `<b>${esc(who.name)}</b><span>${esc(who.activity || who.title)}</span>` : '';
    const act = $('#act'), can = entered && (player.sit || nearSeat());
    act.hidden = !can;
    if (can) act.textContent = player.sit ? 'Stand up' : 'Sit down';
    renderCaptions();
  }
  // step quality down if the machine is struggling: ignore the first seconds (shaders
  // compiling, textures uploading), then judge four seconds at a time, at most twice
  if (entered && !autoQ) {
    fpsT += dt;
    if (fpsT > 3) fpsN++;
    if (fpsT > 7) {
      const fps = fpsN / 4; fpsT = 3; fpsN = 0;
      if (fps < 27 && quality.level > 0) { quality.level--; applyQuality(); toast(quality.level ? 'Shadows off to keep things smooth. Press Q to change quality.' : 'Switched to low quality to keep things smooth. Press Q to change it.'); if (!quality.level) autoQ = true; }
      else autoQ = true;
    }
  }
  requestAnimationFrame(frame);
}

// What you see through the glass: sky, weather, and the roofs of the town.
function drawWindow(w, sky, h, t, dt) {
  const g = w.g, W = 256, HH = 192;
  const night = h >= 19.5 || h < 6, clear = G.weather === 'clear', storm = G.weather === 'storm';
  const gr = g.createLinearGradient(0, 0, 0, HH * 0.75);
  gr.addColorStop(0, sky.top); gr.addColorStop(1, sky.bot);
  g.fillStyle = gr; g.fillRect(0, 0, W, HH);
  if (night && clear) {
    for (const s of w.stars) { g.fillStyle = `rgba(230,232,255,${(s[2] * (0.6 + 0.4 * Math.sin(t * 0.7 + s[3]))).toFixed(2)})`; g.fillRect(s[0], s[1], 1.4, 1.4); }
    if (w.moon) {
      const mg = g.createRadialGradient(196, 44, 4, 196, 44, 46); mg.addColorStop(0, 'rgba(220,226,255,.35)'); mg.addColorStop(1, 'rgba(220,226,255,0)');
      g.fillStyle = mg; g.fillRect(140, 0, 116, 100);
      g.fillStyle = '#eeeada'; g.beginPath(); g.arc(196, 44, 12, 0, 7); g.fill();
      g.fillStyle = 'rgba(160,160,170,.35)'; g.beginPath(); g.arc(192, 41, 3, 0, 7); g.arc(200, 49, 2.2, 0, 7); g.fill();
    }
  }
  // clouds: a few wisps on a fine evening, a low lid of them in the wet
  const dark = 1 - sky.day;
  for (const c of w.clouds) {
    c.x += c.v * dt * (storm ? 4 : clear ? 0.6 : 2); if (c.x - c.w > W) c.x = -c.w;
    const v = Math.round(lerp(clear ? 235 : 150, clear ? 46 : 26, dark));
    g.fillStyle = `rgba(${v},${v},${Math.round(v * 1.08)},${clear ? 0.16 : 0.5})`;
    g.beginPath(); g.ellipse(c.x, c.y * (clear ? 1 : 1.3), c.w * (clear ? 1 : 1.6), c.w * (clear ? 0.2 : 0.42), 0, 0, 7); g.fill();
  }
  // far hills, then the roofs across the lane
  g.fillStyle = `rgba(${Math.round(lerp(70, 12, dark))},${Math.round(lerp(84, 15, dark))},${Math.round(lerp(96, 26, dark))},.92)`;
  g.beginPath(); g.moveTo(0, HH); w.hills.forEach((y, i) => g.lineTo((i / 17) * W, y)); g.lineTo(W, HH); g.fill();
  const rc = `rgb(${Math.round(lerp(52, 7, dark))},${Math.round(lerp(46, 7, dark))},${Math.round(lerp(44, 11, dark))})`;
  for (const b of w.roofs) {
    const top = HH - b.h;
    g.fillStyle = rc;
    g.fillRect(b.x, top, b.w, b.h);
    g.beginPath(); g.moveTo(b.x - 4, top); g.lineTo(b.x + b.w / 2, top - b.pitch); g.lineTo(b.x + b.w + 4, top); g.fill();
    if (b.chim >= 0) g.fillRect(b.x + 6 + b.chim * (b.w - 18), top - b.pitch * 0.9, 6, b.pitch);
    if (sky.day < 0.6) for (const l of b.lit) {
      if (!l || (h < 12 && h > 0.2 + l[2] * 2.2)) continue;      // one by one the town goes to bed
      const a = (0.75 + 0.2 * Math.sin(t * (2 + l[2] * 3) + l[2] * 40)) * (1 - sky.day);
      g.fillStyle = `rgba(250,188,96,${a.toFixed(2)})`; g.fillRect(b.x + l[0] * (b.w - 10), top + l[1] * (b.h - 12), 7, 9);
      g.fillStyle = `rgba(250,170,80,${(a * 0.18).toFixed(2)})`; g.fillRect(b.x + l[0] * (b.w - 10) - 5, top + l[1] * (b.h - 12) - 5, 17, 19);
    }
  }
  if (!clear) {
    g.fillStyle = `rgba(150,170,200,${storm ? 0.2 : 0.14})`; g.fillRect(0, 0, W, HH);
    g.strokeStyle = 'rgba(200,215,240,.4)'; g.lineWidth = 1;
    g.beginPath();
    const slant = storm ? 5 : 2;
    for (const d of w.drops) {
      d[1] += d[2] * dt * (storm ? 620 : 420); d[0] -= slant * dt * 60 * 0.3;
      if (d[1] > HH) { d[1] = -14; d[0] = Math.random() * (W + 30); }
      g.moveTo(d[0], d[1]); g.lineTo(d[0] - slant, d[1] + 13);
    }
    g.stroke();
    // beads on the glass that gather, then run
    for (const b of w.beads) {
      if (b.v === 0 && Math.random() < dt * (storm ? 0.5 : 0.25)) b.v = 20 + Math.random() * 60;
      if (b.v > 0) { g.fillStyle = 'rgba(210,225,245,.16)'; g.fillRect(b.x - 0.5, b.y - b.v * 0.25, 1.2, b.v * 0.25); b.y += b.v * dt; b.x += Math.sin(b.y * 0.2) * 0.3; }
      if (b.y > HH + 4) { b.y = Math.random() * HH * 0.7; b.x = Math.random() * W; b.v = 0; }
      g.fillStyle = 'rgba(215,228,248,.28)'; g.beginPath(); g.arc(b.x, b.y, b.r * 0.7, 0, 7); g.fill();
    }
  }
  // old glass: grime in the corners, and the room's glow caught in it after dark
  const vg = g.createRadialGradient(W / 2, HH / 2, 50, W / 2, HH / 2, 170); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(30,18,6,${(0.3 + dark * 0.25).toFixed(2)})`);
  g.fillStyle = vg; g.fillRect(0, 0, W, HH);
  if (G.flash > 0 && !G.reduced) { g.fillStyle = `rgba(235,240,255,${(G.flash * 0.75).toFixed(2)})`; g.fillRect(0, 0, W, HH); }
  w.tex.needsUpdate = true;
}

// ------------------------------------------------------------------ go
paintSign();
document.fonts?.ready.then(paintSign);
createCast();
startDay(1);
G.paused = true;
$('#innName').textContent = lore.inn;
if (matchMedia('(pointer: coarse)').matches) $('#hint').textContent = 'Left thumb walks · right thumb looks';
$('#signName').textContent = lore.inn;
document.title = `${lore.inn} · Step Inside`;
resize();
requestAnimationFrame(frame);
window.G = G;
window.__room = { player, fx, sound, quality, life, bodies, applyQuality, toggleSit, advance(min) { while (min > 0) { const s = Math.min(0.25, min); update(s); min -= s; } } };
