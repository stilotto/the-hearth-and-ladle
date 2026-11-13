// The clutter that makes a room feel used: firewood, cloaks on pegs, hams in
// the rafters, tankards over the bar, pictures, curtains, cobwebs.
import * as THREE from '../../vendor/three.module.min.js';
import { mulberry } from '../util.js';
import * as TX from './tex.js';
import { mat, makeItem } from './people.js';

export function buildProps(K) {
  const { scene, add, slab, addGroup, M, S, H, X0, X1, Z0, Z1 } = K;
  const r = mulberry(404);
  const cyl = (rt, rb, h, m, seg = 10) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  const sph = (rad, m, w = 10, h = 8) => new THREE.Mesh(new THREE.SphereGeometry(rad, w, h), m);
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const solids = [];
  const pewter = mat('#9a9c98', { metalness: 0.75, roughness: 0.4 });
  const rope = mat('#8a7450');
  const quiet = { cast: false };

  // ---- hearth: firewood, irons, a kettle on its hook, things on the mantel
  for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) {
    const l = cyl(0.075, 0.08, 0.5, mat(['#5a3a1a', '#6b4726', '#4e3216'][(row + i) % 3]), 7);
    l.rotation.x = Math.PI / 2; l.rotation.y = (r() - 0.5) * 0.1;
    add(l, 9.82 + i * 0.16 + row * 0.08, 0.09 + row * 0.14, 1.9, { cast: row === 2 });
    const end = cyl(0.06, 0.06, 0.005, mat('#c9a878'), 7); end.rotation.x = Math.PI / 2; add(end, l.position.x, l.position.y, 2.152, quiet);
  }
  solids.push({ x: 10.05, z: 1.95, r: 0.42 });
  for (const [dx, tilt] of [[0, 0.1], [0.09, -0.06]]) { const p = cyl(0.012, 0.012, 0.95, M.iron, 5); p.rotation.z = tilt; add(p, 6.2 + dx, 0.48, 2.5, quiet); }
  add(box(0.22, 0.04, 0.16, M.iron), 6.24, 0.02, 2.5, quiet);
  {
    const kx = 7.42, kz = 2.02;
    add(cyl(0.012, 0.012, 0.5, M.iron, 5), kx, 0.92, kz, quiet);
    const pot = sph(0.15, M.iron, 12, 8); pot.scale.y = 0.85; add(pot, kx, 0.56, kz);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 5, 14), M.iron); rim.rotation.x = Math.PI / 2; add(rim, kx, 0.66, kz, quiet);
    const bar = cyl(0.015, 0.015, 1.5, M.iron, 5); bar.rotation.z = Math.PI / 2; add(bar, 8.0, 1.16, kz, quiet);
    for (const ax of [7.45, 8.55]) { add(box(0.04, 0.26, 0.5, M.iron), ax, 0.13, 2.08, quiet); add(sph(0.035, pewter, 6, 5), ax, 0.28, 2.33, quiet); }
  }
  for (const [x, s2] of [[7.25, 0.13], [7.55, 0.1]]) { const pl = cyl(s2, s2, 0.012, pewter, 14); pl.rotation.x = Math.PI / 2 - 0.22; add(pl, x, 1.45 + s2, 2.16, quiet); }
  { const tk = makeItem('empty'); tk.position.set(8.38, 1.45, 2.3); tk.rotation.y = 2; addGroup(tk, false); }
  // soot licking up the stone above the opening
  {
    const [c, g] = TX.canvas(64, 64);
    const gr = g.createRadialGradient(32, 64, 4, 32, 64, 60); gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const soot = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, color: '#000' }));
    soot.position.set(8.0, 2.2, 2.4 - 0.12 + 0.005); scene.add(soot);
  }

  // ---- by the door: pegs with cloaks and a hat, a mat, a horseshoe for luck
  slab(7.5, 1.62, Z1 - 0.05, 9.2, 1.7, Z1, M.beam, quiet);
  ['#3d4a3a', '#5a2f24', null, '#2f3a4e', '#4a4034'].forEach((col, i) => {
    const x = 7.68 + i * 0.34;
    const peg = cyl(0.014, 0.014, 0.12, M.beam, 5); peg.rotation.x = Math.PI / 2; add(peg, x, 1.66, Z1 - 0.09, quiet);
    if (!col) { const hat = cyl(0.1, 0.13, 0.1, mat('#6a5a3a'), 10); hat.rotation.x = -Math.PI / 2 + 0.3; add(hat, x, 1.62, Z1 - 0.14, quiet); const brim = cyl(0.2, 0.2, 0.015, mat('#6a5a3a'), 12); brim.rotation.x = -Math.PI / 2 + 0.3; add(brim, x, 1.6, Z1 - 0.09, quiet); return; }
    const cl = cyl(0.07, 0.19, 1.0 + r() * 0.2, mat(col, { roughness: 1 }), 8); cl.scale.z = 0.45;
    add(cl, x, 1.66 - cl.geometry.parameters.height / 2, Z1 - 0.13);
    const hood = sph(0.085, mat(col, { roughness: 1 }), 8, 6); hood.scale.set(1, 0.9, 0.6); add(hood, x, 1.63, Z1 - 0.13, quiet);
  });
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.8), new THREE.MeshStandardMaterial({ color: '#6a5638', roughness: 1, map: K.strawTex })); m.rotation.x = -Math.PI / 2; add(m, 13 * S, 0.008, Z1 - 0.6, quiet); }
  { const hs = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.016, 5, 12, Math.PI * 1.4), M.iron); hs.rotation.z = -Math.PI * 0.2; add(hs, 13 * S, 2.52, Z1 - 0.03, quiet); }
  // corner by the door: a barrel, a sack and a crate
  {
    const bx = 19.55, bz = 11.55;
    const b = cyl(0.3, 0.26, 0.85, mat('#6b4424'), 12); add(b, bx, 0.425, bz);
    for (const y of [0.15, 0.7]) add(cyl(0.3, 0.29, 0.04, M.iron, 12), bx, y, bz, quiet);
    add(cyl(0.27, 0.27, 0.02, mat('#4e321c'), 12), bx, 0.86, bz, quiet);
    const sack = sph(0.24, mat('#a89468', { roughness: 1 }), 9, 7); sack.scale.set(1, 0.75, 0.9); add(sack, bx - 0.05, 1.02, bz);
    add(sph(0.06, rope, 6, 5), bx - 0.05, 1.22, bz, quiet);
    const sack2 = sph(0.28, mat('#9a8658', { roughness: 1 }), 9, 7); sack2.scale.set(1.1, 0.7, 0.9); add(sack2, bx - 0.55, 0.19, bz + 0.12);
    solids.push({ x: bx - 0.15, z: bz, r: 0.52 });
  }

  // ---- the bar: tankards hanging from a rack, plates, a cloth, a little cask
  {
    const x = 15.6;
    slab(x - 0.04, 2.34, 2.2, x + 0.04, 2.4, 6.6, M.beam, quiet);
    for (const z of [2.3, 4.4, 6.5]) add(cyl(0.012, 0.012, H - 2.4, M.iron, 5), x, (H + 2.4) / 2, z, quiet);
    for (let z = 2.5; z < 6.5; z += 0.31) {
      if (r() < 0.2) continue;
      const g = makeItem('empty'); g.position.set(x + (r() - 0.5) * 0.02, 2.33, z); g.rotation.set(Math.PI, r() * 6, (r() - 0.5) * 0.2); g.scale.setScalar(0.95);
      addGroup(g, false);
    }
    for (let i = 0; i < 5; i++) add(cyl(0.11, 0.09, 0.014, mat('#9a7a4e'), 12), 15.72, 1.12 + i * 0.016, 5.12, quiet);
    const cloth = box(0.3, 0.015, 0.2, mat('#d8cfb8', { roughness: 1 })); cloth.rotation.y = 0.3; add(cloth, 15.74, 1.118, 3.5, quiet);
    const cask = cyl(0.15, 0.15, 0.3, mat('#6b4424'), 12); cask.rotation.x = Math.PI / 2; add(cask, 15.62, 1.31, 6.84);
    for (const dz of [-0.11, 0.11]) { const b = cyl(0.155, 0.155, 0.025, M.iron, 12); b.rotation.x = Math.PI / 2; add(b, 15.62, 1.31, 6.84 + dz, quiet); }
    slab(15.5, 1.11, 6.7, 15.74, 1.16, 6.98, M.beam, quiet);
    // hams and onions in the rafters over the taps
    for (const [hx, hz, kind] of [[17.6, 3.2, 'ham'], [18.3, 4.4, 'onion'], [17.2, 5.0, 'ham'], [18.8, 2.9, 'onion'], [16.9, 3.9, 'garlic']]) {
      add(cyl(0.006, 0.006, 0.4, rope, 4), hx, H - 0.56, hz, quiet);
      if (kind === 'ham') { const h = sph(0.13, mat('#7a3a2a', { roughness: 0.6 }), 9, 7); h.scale.set(0.8, 1.5, 0.7); add(h, hx, H - 0.92, hz); }
      else for (let i = 0; i < 6; i++) add(sph(kind === 'onion' ? 0.045 : 0.03, mat(kind === 'onion' ? '#b8843a' : '#e0d8c0'), 6, 5), hx + Math.sin(i * 2.4) * 0.04, H - 0.78 - i * 0.055, hz + Math.cos(i * 2.4) * 0.04, quiet);
    }
  }

  // ---- the stage: a stool and a little drum for whoever plays
  add(cyl(0.16, 0.15, 0.05, M.top, 10), 1.98, 0.22 + 0.45, 2.0);
  for (let i = 0; i < 3; i++) add(cyl(0.018, 0.022, 0.45, M.beam, 5), 1.98 + Math.cos(i * 2.1) * 0.11, 0.22 + 0.225, 2.0 + Math.sin(i * 2.1) * 0.11, quiet);
  add(cyl(0.17, 0.15, 0.24, mat('#7a3a22'), 12), 4.5 * S, 0.34, 1.95); add(cyl(0.172, 0.172, 0.015, mat('#e0d4b4'), 12), 4.5 * S, 0.465, 1.95, quiet);

  // ---- walls: pictures, a tapestry, a shelf of pewter
  const framed = (x, y, w, h, seed, wall) => {
    const g = new THREE.Group();
    const fr = box(w + 0.1, h + 0.1, 0.04, mat('#4a3018')); g.add(fr);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: TX.painting(seed), roughness: 0.8 })); p.position.z = 0.022; g.add(p);
    if (wall === 'front') { g.position.set(x, y, Z1 - 0.03); g.rotation.y = Math.PI; } else { g.position.set(X1 - 0.03, y, x); g.rotation.y = -Math.PI / 2; }
    g.rotation.z = (r() - 0.5) * 0.04;
    addGroup(g, false);
  };
  framed(12.4, 1.85, 0.7, 0.5, 3, 'front'); framed(9.6, 1.9, 0.55, 0.42, 8, 'right'); framed(14.2, 1.7, 0.4, 0.5, 12, 'front');
  {
    // tapestry on the front wall, by the booth
    const [c, g] = TX.canvas(160, 128);
    g.fillStyle = '#5a1f1c'; g.fillRect(0, 0, 160, 128);
    g.fillStyle = '#c9a24a'; g.fillRect(6, 6, 148, 4); g.fillRect(6, 118, 148, 4);
    g.fillStyle = '#243a52'; g.fillRect(20, 20, 120, 88);
    g.fillStyle = '#c9a24a'; g.beginPath(); g.arc(80, 58, 20, 0, 7); g.fill();
    g.fillStyle = '#243a52'; g.beginPath(); g.arc(88, 52, 17, 0, 7); g.fill();
    g.fillStyle = '#e8dcb8'; for (let i = 0; i < 9; i++) { const a = i * 2.1; g.fillRect(80 + Math.cos(a) * (34 + (i % 3) * 6), 60 + Math.sin(a) * (26 + (i % 2) * 8), 2, 2); }
    g.fillStyle = '#2f5a3a'; g.beginPath(); g.moveTo(20, 108); for (let x = 20; x <= 140; x += 10) g.lineTo(x, 96 - Math.abs(Math.sin(x * 0.07)) * 12); g.lineTo(140, 108); g.fill();
    const id = g.getImageData(0, 0, 160, 128), d = id.data; for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 26; d[i] += n; d[i + 1] += n; d[i + 2] += n; } g.putImageData(id, 0, 0);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const tp = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.5), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })); tp.rotation.y = Math.PI; add(tp, 5.3, 1.9, Z1 - 0.03, quiet);
    const rod = cyl(0.02, 0.02, 2.1, M.beam, 6); rod.rotation.z = Math.PI / 2; add(rod, 5.3, 2.67, Z1 - 0.05, quiet);
  }
  slab(16.2, 1.7, Z1 - 0.2, 18.4, 1.74, Z1, M.beam, quiet);
  for (let i = 0; i < 5; i++) { const pl = cyl(0.14, 0.14, 0.012, i % 2 ? mat('#9a7a4e') : pewter, 14); pl.rotation.x = Math.PI / 2 + 0.2; add(pl, 16.45 + i * 0.42, 1.88, Z1 - 0.07, quiet); }

  // ---- window dressing: a curtain to each side and something on the sill
  for (const w of K.windows) {
    const rod = cyl(0.015, 0.015, w.w + 0.7, M.iron, 6); rod.rotation.z = Math.PI / 2; add(rod, w.cx, w.cy + 0.78, Z0 + 0.1, quiet);
    for (const s2 of [-1, 1]) for (let i = 0; i < 4; i++) {
      const fold = cyl(0.045, 0.05, 1.6, mat(i % 2 ? '#6a2620' : '#7c2d24', { roughness: 1 }), 6);
      add(fold, w.cx + s2 * (w.w / 2 + 0.26 - i * 0.075), w.cy - 0.03, Z0 + 0.09 + (i % 2) * 0.02, { cast: i === 0 });
    }
  }
  { const pot = cyl(0.07, 0.05, 0.1, mat('#9a5a3a'), 8); add(pot, 3.0, 1.2, Z0 - 0.08, quiet); for (let i = 0; i < 5; i++) { const lf = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.16, 4), mat('#4a6a3a')); lf.rotation.set((r() - 0.5) * 0.9, 0, (r() - 0.5) * 0.9); add(lf, 3.0 + (r() - 0.5) * 0.06, 1.32, Z0 - 0.08, quiet); } }
  { const b = cyl(0.03, 0.045, 0.2, new THREE.MeshStandardMaterial({ color: '#2f5a3a', roughness: 0.15 }), 7); add(b, 12.9, 1.25, Z0 - 0.08, quiet); const stub = cyl(0.02, 0.022, 0.06, M.wax, 6); add(stub, 11.9, 1.18, Z0 - 0.08, quiet); }

  // ---- rafters: drying herbs and flowers, and cobwebs where no broom reaches
  for (const [x, z] of [[4.4, 5.0], [9.2, 7.2], [12.6, 4.6], [6.8, 9.6], [13.8, 10.2], [10.6, 3.6]]) {
    add(cyl(0.005, 0.005, 0.2, rope, 4), x, H - 0.46, z, quiet);
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.07 + r() * 0.04, 0.3, 6), mat(['#5a7a3a', '#7a6a3a', '#4a6a3a', '#8a6a7a', '#6a7a4a'][Math.floor(r() * 5)], { roughness: 1 }));
    b.rotation.x = Math.PI; add(b, x, H - 0.7, z, quiet);
  }
  const web = new THREE.MeshBasicMaterial({ map: TX.cobweb(), transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
  for (const [x, z, ry] of [[X0 + 0.02, Z0 + 0.02, 0], [X1 - 0.02, Z0 + 0.02, -Math.PI / 2], [X1 - 0.02, Z1 - 0.02, Math.PI], [X0 + 0.02, Z1 - 0.02, Math.PI / 2]]) {
    for (const flat of [0, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), web);
      m.geometry.translate(0.45, -0.45, 0);
      m.position.set(x, H - 0.27, z); m.rotation.order = 'YXZ'; m.rotation.y = ry + (flat ? Math.PI / 4 : 0); if (flat) m.rotation.x = 0; else m.rotation.y += 0;
      if (flat) { m.rotation.x = -Math.PI / 2 + 0.25; m.rotation.y = ry; }
      scene.add(m);
    }
  }
  return { solids };
}
