// The immersive common room: the same simulation as the 2D view, drawn in
// 3D and heard from where you stand.
import * as THREE from '../../vendor/three.module.min.js';
import { G, on } from '../state.js';
import { TS, kind, cost, tables, seats, fixtures, lore } from '../world.js';
import { createCast, startDay, update } from '../sim.js';
import { Sfx } from '../audio.js';
import { skyAt } from '../render.js';
import { fmtTime, hourOf, clamp, lerp, mulberry } from '../util.js';
import * as TX from './tex.js';
import { makePerson, makeCat, makeItem, mat } from './people.js';

const S = 0.8;            // metres per tile
const H = 3.4;            // ceiling height
const px2m = (p) => (p / TS) * S;
const m2px = (m) => (m / S) * TS;

// ------------------------------------------------------------------ renderer
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0a0705');
scene.fog = new THREE.FogExp2('#1b120b', 0.03);
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 60);
const quality = { high: true, ratio: Math.min(window.devicePixelRatio || 1, 1.25) };

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(quality.high ? quality.ratio : 0.7);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ------------------------------------------------------------------ materials
const floorTex = TX.toTex(TX.planks(11), [19.2 / 2.4, 10.4 / 2.4]);
const ceilTex = TX.toTex(TX.planks(12, [24, 30, 16]), [6, 4]);
const plasterTex = TX.toTex(TX.plaster(), [12, 2.2]);
const stoneTex = TX.toTex(TX.stone(5), [1.2, 1.4]);
const flagTex = TX.toTex(TX.flagstone(), [3, 4]);
const woodTex = TX.toTex(TX.planks(13, [24, 40, 30]), [1, 1]);
const M = {
  floor: new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.82 }),
  ceil: new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.95, color: '#8a7a6a' }),
  plaster: new THREE.MeshStandardMaterial({ map: plasterTex, roughness: 0.95 }),
  stone: new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.9 }),
  flag: new THREE.MeshStandardMaterial({ map: flagTex, roughness: 0.8 }),
  beam: new THREE.MeshStandardMaterial({ color: '#3a2615', roughness: 0.9 }),
  wood: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7 }),
  dark: new THREE.MeshStandardMaterial({ color: '#4a2f1b', roughness: 0.75 }),
  top: new THREE.MeshStandardMaterial({ color: '#6e4a2a', roughness: 0.45 }),
  soot: new THREE.MeshStandardMaterial({ color: '#120c08', roughness: 1 }),
  iron: new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.5, metalness: 0.7 }),
  wax: new THREE.MeshStandardMaterial({ color: '#efe6cf', roughness: 0.6, emissive: '#ffcc88', emissiveIntensity: 0.15 }),
};

function add(mesh, x, y, z, o = {}) {
  mesh.position.set(x, y, z);
  if (o.cast !== false) mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (o.ry) mesh.rotation.y = o.ry;
  (o.parent || scene).add(mesh);
  return mesh;
}
// box from min/max corners (x0,y0,z0)-(x1,y1,z1)
function slab(x0, y0, z0, x1, y1, z1, m, o) {
  return add(new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, o);
}
function plane(w, h, m) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); }

// ------------------------------------------------------------------ the room
const X0 = S, X1 = 25 * S, Z0 = 2 * S, Z1 = 15 * S;
{
  const f = plane(X1 - X0, Z1 - Z0, M.floor); f.rotation.x = -Math.PI / 2; add(f, (X0 + X1) / 2, 0, (Z0 + Z1) / 2, { cast: false });
  const fl = plane(5 * S, 6 * S, M.flag); fl.rotation.x = -Math.PI / 2; add(fl, 22.5 * S, 0.004, 5 * S, { cast: false });
  const fl2 = plane(2 * S, S, M.flag); fl2.rotation.x = -Math.PI / 2; add(fl2, 24 * S, 0.004, 8.5 * S, { cast: false });
  const c = plane(X1 - X0, Z1 - Z0, M.ceil); c.rotation.x = Math.PI / 2; add(c, (X0 + X1) / 2, H, (Z0 + Z1) / 2, { cast: false });
  // walls
  const back = plane(X1 - X0, H, M.plaster); add(back, (X0 + X1) / 2, H / 2, Z0, { cast: false });
  const front = plane(X1 - X0, H, M.plaster); front.rotation.y = Math.PI; add(front, (X0 + X1) / 2, H / 2, Z1, { cast: false });
  const left = plane(Z1 - Z0, H, M.plaster); left.rotation.y = Math.PI / 2; add(left, X0, H / 2, (Z0 + Z1) / 2, { cast: false });
  const right = plane(Z1 - Z0, H, M.plaster); right.rotation.y = -Math.PI / 2; add(right, X1, H / 2, (Z0 + Z1) / 2, { cast: false });
  // timber framing
  for (let x = X0 + 0.1; x < X1; x += 2.4) { slab(x - 0.1, 0, Z0, x + 0.1, H, Z0 + 0.12, M.beam); slab(x - 0.1, 0, Z1 - 0.12, x + 0.1, H, Z1, M.beam); }
  for (let z = Z0 + 2.4; z < Z1; z += 2.4) { slab(X0, 0, z - 0.1, X0 + 0.12, H, z + 0.1, M.beam); slab(X1 - 0.12, 0, z - 0.1, X1, H, z + 0.1, M.beam); }
  for (const [a, b] of [[Z0, Z0 + 0.14], [Z1 - 0.14, Z1]]) { slab(X0, H - 0.25, a, X1, H, b, M.beam); slab(X0, 0, a, X1, 0.18, b, M.beam); slab(X0, 1.0, a, X1, 1.08, b, M.beam); }
  for (const [a, b] of [[X0, X0 + 0.14], [X1 - 0.14, X1]]) { slab(a, H - 0.25, Z0, b, H, Z1, M.beam); slab(a, 0, Z0, b, 0.18, Z1, M.beam); slab(a, 1.0, Z0, b, 1.08, Z1, M.beam); }
  // ceiling beams
  for (let x = X0 + 1.2; x < X1; x += 2.4) slab(x - 0.14, H - 0.36, Z0, x + 0.14, H, Z1, M.beam);
  slab(X0, H - 0.5, 7 * S - 0.2, X1, H - 0.34, 7 * S + 0.2, M.beam);
  // stairwell opening
  const hole = plane(2 * S, 2.5 * S, new THREE.MeshBasicMaterial({ color: '#050302' })); hole.rotation.x = Math.PI / 2; add(hole, X0 + S, H - 0.01, 6.25 * S, { cast: false });
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
  const sword = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.02), mat('#aab0b6', { metalness: 0.8, roughness: 0.3 })); add(sword, 8.0, 2.1, Z0 + 0.14);
  // logs
  for (const [dx, r] of [[-0.2, 0.3], [0.2, -0.3], [0, 0]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.9, 7), mat('#2a1a0c')); l.rotation.z = Math.PI / 2; l.rotation.y = r; add(l, 8.0 + dx, 0.14 + (dx === 0 ? 0.1 : 0), 2.05); }
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
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, h, 7), new THREE.MeshStandardMaterial({ color: bottleCols[Math.floor(r() * 6)], roughness: 0.15, metalness: 0.1 }));
      add(b, x, y + h / 2, Z0 + 0.15);
    }
  }
  // kitchen door
  slab(22 * S + 0.05, 0, Z0, 23 * S - 0.05, 2.1, Z0 + 0.06, mat('#5a3a22'));
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

// windows: glass is a live canvas (sky, stars, rain, lightning)
const windows = [];
for (const [x0, x1] of [[3 * S, 5 * S], [14 * S, 17 * S]]) {
  const w = x1 - x0 - 0.2, hgt = 1.3, cx = (x0 + x1) / 2, cy = 1.85;
  const [cv, g] = TX.canvas(128, 128);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const glass = plane(w, hgt, new THREE.MeshBasicMaterial({ map: tex, fog: false }));
  add(glass, cx, cy, Z0 + 0.02, { cast: false });
  for (const [a, b, c2, d] of [[-w / 2 - 0.08, -hgt / 2 - 0.08, w / 2 + 0.08, -hgt / 2], [-w / 2 - 0.08, hgt / 2, w / 2 + 0.08, hgt / 2 + 0.08], [-w / 2 - 0.08, -hgt / 2, -w / 2, hgt / 2], [w / 2, -hgt / 2, w / 2 + 0.08, hgt / 2], [-0.03, -hgt / 2, 0.03, hgt / 2], [-w / 2, -0.03, w / 2, 0.03]]) slab(cx + a, cy + b, Z0, cx + c2, cy + d, Z0 + 0.1, M.beam);
  slab(cx - w / 2 - 0.12, cy - hgt / 2 - 0.12, Z0, cx + w / 2 + 0.12, cy - hgt / 2 - 0.08, Z0 + 0.2, M.beam);
  // light shaft for daytime
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, 3.2), new THREE.MeshBasicMaterial({ color: '#ffe9c0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  shaft.geometry.translate(0, 0, 1.6);
  shaft.position.set(cx, cy, Z0); shaft.rotation.x = 0.55;
  scene.add(shaft);
  windows.push({ cv, g, tex, w, cx, cy, shaft, drops: Array.from({ length: 30 }, () => [Math.random() * 128, Math.random() * 128, 0.5 + Math.random()]) });
}

// front door: swings open when someone passes
const door = new THREE.Group();
{
  door.position.set(12 * S, 0, Z1 - 0.06);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(2 * S, 2.2, 0.08), mat('#4e321c'));
  leaf.position.x = S; leaf.castShadow = true; door.add(leaf);
  for (const y of [0.4, 1.8]) { const b = new THREE.Mesh(new THREE.BoxGeometry(2 * S, 0.06, 0.1), M.iron); b.position.set(S, y - 1.1, 0.01); leaf.add(b); }
  leaf.position.y = 1.1;
  scene.add(door);
  slab(12 * S - 0.12, 0, Z1 - 0.15, 12 * S, 2.35, Z1, M.beam); slab(14 * S, 0, Z1 - 0.15, 14 * S + 0.12, 2.35, Z1, M.beam);
  slab(12 * S - 0.12, 2.2, Z1 - 0.15, 14 * S + 0.12, 2.35, Z1, M.beam);
}
const outside = plane(2 * S, 2.2, new THREE.MeshBasicMaterial({ color: '#0b0f1a', fog: false }));
outside.rotation.y = Math.PI; add(outside, 13 * S, 1.1, Z1 + 0.02, { cast: false });

// furniture from the simulation's own map
for (const t of tables) {
  const x0 = t.x * S + 0.05, x1 = (t.x + t.w) * S - 0.05, z0 = t.y * S + 0.06, z1 = (t.y + 1) * S - 0.06;
  slab(x0, 0.72, z0, x1, 0.78, z1, t.booth ? M.dark : M.top);
  for (const [x, z] of [[x0 + 0.08, z0 + 0.08], [x1 - 0.08, z0 + 0.08], [x0 + 0.08, z1 - 0.08], [x1 - 0.08, z1 - 0.08]]) slab(x - 0.04, 0, z - 0.04, x + 0.04, 0.72, z + 0.04, M.beam);
}
function seatYaw(s) {
  if (s.bar) return s.x === 18 ? Math.PI / 2 : Math.PI;
  if (s.side === 'w') return Math.PI / 2;
  if (s.side === 'e') return -Math.PI / 2;
  return s.face === 'f' ? 0 : Math.PI;
}
for (const s of seats) {
  s.yaw = seatYaw(s);
  const cx = (s.x + 0.5) * S, cz = (s.y + 0.5) * S;
  if (s.stool) {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.17, 0.06, 10), M.top); add(top, cx, 0.7, cz);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.7, 5), M.beam); add(l, cx + Math.cos(a) * 0.12, 0.35, cz + Math.sin(a) * 0.12); }
    s.h = 0.72;
  } else {
    const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = s.yaw; scene.add(g);
    const seatMesh = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.42), M.dark); seatMesh.position.y = 0.45; g.add(seatMesh);
    for (const [x, z] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), M.beam); l.position.set(x, 0.225, z); g.add(l); }
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, s.table && s.table.booth ? 0.9 : 0.5, 0.05), s.table && s.table.booth ? M.dark : M.beam);
    back.position.set(0, s.table && s.table.booth ? 0.9 : 0.72, -0.2); g.add(back);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    s.h = 0.47;
  }
}

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
function sprite(tex, s, color = '#ffffff', opacity = 1) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: false }));
  sp.scale.set(s, s, 1);
  return sp;
}

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
    g.userData.flameY = 0.19;
  } else if (f.type === 'sconce') {
    const x = f.x < 100 ? X0 + 0.14 : X1 - 0.14;
    pos = new THREE.Vector3(x, 1.75, (f.y / TS) * S + 0.3);
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.06), M.iron); br.position.x = f.x < 100 ? -0.06 : 0.06; g.add(br);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 8), M.wax); c.position.y = 0.09; g.add(c);
    g.userData.flameY = 0.2;
  } else {
    pos = new THREE.Vector3((f.x / TS) * S, 1.11, (f.y / TS) * S);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.14), new THREE.MeshStandardMaterial({ color: '#ffcf80', emissive: '#ff9a30', emissiveIntensity: 0, transparent: true, opacity: 0.85 }));
    fr.position.y = 0.13; g.add(fr); g.userData.glass = fr;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.08, 4), M.iron); cap.position.y = 0.28; cap.rotation.y = Math.PI / 4; g.add(cap);
    g.userData.flameY = 0.12;
  }
  g.position.copy(pos);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);
  const fl = sprite(flameTex, 0.07); fl.position.y = g.userData.flameY; fl.center.set(0.5, 0.15); g.add(fl);
  const gl = sprite(glowTex, 0.35, '#ffb060', 0.6); gl.position.y = g.userData.flameY + 0.02; g.add(gl);
  const light = new THREE.PointLight('#ffc080', 0, 0, 2);
  light.position.set(0, g.userData.flameY + 0.1, 0);
  g.add(light);
  lamps.push({ f, g, fl, gl, light, base: f.type === 'candle' ? 1.6 : f.type === 'sconce' ? 2.2 : 3, phase: Math.random() * 10 });
}

// the fire itself
const flames = [];
for (let i = 0; i < 16; i++) {
  const sp = sprite(flameTex, 0.4, i % 3 === 0 ? '#ffd080' : '#ff8030', 0.85);
  sp.center.set(0.5, 0.05);
  sp.userData = { x: (Math.random() - 0.5) * 0.9, z: (Math.random() - 0.5) * 0.25, ph: Math.random() * 10, sp: 5 + Math.random() * 6 };
  scene.add(sp); flames.push(sp);
}
const fireGlow = sprite(glowTex, 2.4, '#ff9040', 0.5); fireGlow.position.set(8.0, 0.55, 2.2); scene.add(fireGlow);
const SPARKS = 60;
const sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
const sparkLife = new Float32Array(SPARKS).map(() => Math.random());
const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: '#ffb050', size: 0.025, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
scene.add(sparks);

// dust drifting in the air
const DUST = 400;
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(DUST * 3);
for (let i = 0; i < DUST; i++) { dustPos[i * 3] = X0 + Math.random() * (X1 - X0); dustPos[i * 3 + 1] = Math.random() * H; dustPos[i * 3 + 2] = Z0 + Math.random() * (Z1 - Z0); }
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#ffe0b0', size: 0.012, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
scene.add(dust);

// ------------------------------------------------------------------ people
const bodies = new Map();
function bodyFor(a) {
  let b = bodies.get(a);
  if (!b) {
    b = a.kind === 'cat' ? makeCat(a.catCol) : makePerson(a);
    b.root.userData.agent = a;
    scene.add(b.root);
    bodies.set(a, b);
    b.last = { x: a.x, y: a.y };
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
function syncPeople(dt, t) {
  for (const it of tableItems.values()) it.userData.seen = false;
  for (const a of G.agents) {
    const b = bodies.get(a);
    if (!a.present) { if (b) b.root.visible = false; continue; }
    const B = bodyFor(a);
    B.root.visible = true;
    const X = px2m(a.x), Z = px2m(a.y - 5);
    const onStairs = kind[a.ty] && kind[a.ty][a.tx] === 'stairs';
    const elev = onStairs ? stairElev(Z) : 0;
    const moving = !!a.path;
    const dx = a.x - B.last.x, dz = a.y - B.last.y;
    B.last = { x: a.x, y: a.y };
    let yaw = B.anim.yaw;
    if (moving && Math.hypot(dx, dz) > 0.01) yaw = Math.atan2(dx, dz);
    if (a.sitting && a.seat) yaw = a.seat.yaw;
    const partner = a.convo ? (a.convo.a === a ? a.convo.b : a.convo.a) : null;
    if (!moving && !a.sitting && partner) yaw = Math.atan2(partner.x - a.x, partner.y - a.y);
    let d = yaw - B.anim.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    B.anim.yaw += d * Math.min(1, dt * 8);
    B.root.rotation.y = B.anim.yaw;

    if (B.cat) {
      B.root.position.set(X, elev, Z);
      const sleep = a.pose === 'sleep', sit = a.pose === 'sit';
      B.body.scale.set(1, sleep ? 0.6 : 1, sleep ? 0.7 : 1);
      B.body.position.y = sleep ? 0.08 : 0.16;
      B.head.position.y = sleep ? 0.12 : sit ? 0.32 : 0.26;
      B.tail.rotation.y = Math.sin(t * 2 + a.id) * (sleep ? 0.1 : 0.6);
      B.tail.rotation.x = sit ? -0.6 : 0.3;
      B.legs.forEach((l, i) => { l.visible = !sleep; l.rotation.x = moving ? Math.sin(a.walkPhase * Math.PI + i * Math.PI) * 0.6 : 0; });
      if (a.sitting === false && a.pose === 'sit' && kind[a.ty]?.[a.tx] === 'seat') B.root.position.y = 0.47;
      continue;
    }

    const sc = B.scale;
    let rootY = elev;
    const [L, R] = B.legs;
    const [AL, AR] = B.arms;
    const ph = a.walkPhase * Math.PI;
    // reset pose
    B.torso.rotation.set(0, 0, 0); B.head.rotation.set(0, 0, 0);
    for (const arm of B.arms) { arm.sh.rotation.set(0, 0, 0); arm.el.rotation.set(0, 0, 0); }
    if (a.sitting) {
      const s = a.seat;
      rootY = (s ? s.h : 0.47) - 0.84 * sc + 0.02;
      for (const l of B.legs) { l.hip.rotation.x = -Math.PI / 2 + 0.1; l.knee.rotation.x = Math.PI / 2 - 0.1; }
      const fwd = 0.08;
      B.root.position.set((s ? (s.x + 0.5) * S : X) - Math.sin(yaw) * -fwd, rootY, (s ? (s.y + 0.5) * S : Z) - Math.cos(yaw) * -fwd);
      if (B.legs.skirt) B.legs.skirt.visible = false;
      AL.sh.rotation.x = -0.5; AL.el.rotation.x = -0.6; AR.sh.rotation.x = -0.5; AR.el.rotation.x = -0.6;
    } else {
      const swing = moving ? Math.sin(ph) * 0.55 : 0;
      L.hip.rotation.x = swing; R.hip.rotation.x = -swing;
      L.knee.rotation.x = moving ? Math.max(0, Math.sin(ph + 1.2)) * 0.8 : 0;
      R.knee.rotation.x = moving ? Math.max(0, Math.sin(ph + 1.2 + Math.PI)) * 0.8 : 0;
      AL.sh.rotation.x = -swing * 0.7; AR.sh.rotation.x = swing * 0.7;
      AL.el.rotation.x = AR.el.rotation.x = moving ? -0.3 : -0.1;
      if (moving) rootY += Math.abs(Math.cos(ph)) * 0.035;
      if (B.legs.skirt) B.legs.skirt.visible = true;
      B.root.position.set(X, rootY, Z);
    }
    // breathing and drunken sway
    B.torso.rotation.z = Math.sin(t * 1.3 + a.id) * 0.015 + (a.drunk > 0.6 ? Math.sin(t * 0.9 + a.id) * 0.06 : 0);
    if (a.dance) {
      B.root.position.y += Math.abs(Math.sin(t * 6 + a.id)) * 0.08;
      AL.sh.rotation.z = -2.4 + Math.sin(t * 6) * 0.3; AR.sh.rotation.z = 2.4 + Math.sin(t * 6 + 1) * 0.3;
      B.root.rotation.y += Math.sin(t * 2 + a.id) * 0.5;
    }
    if (a.shake) { AR.sh.rotation.x = -1.4 + Math.sin(t * 14 + a.id) * 0.6; AL.sh.rotation.x = -1.2; B.torso.rotation.x = 0.2; }
    if (a.sick) { B.torso.rotation.x = 0.9; B.head.rotation.x = 0.4; AL.sh.rotation.x = AR.sh.rotation.x = -1.2; }
    if (a.hand) { AR.sh.rotation.x = -2.8; AR.el.rotation.x = -0.2; }

    // talking: small nods and hand gestures
    const talking = a.bubble && performance.now() < a.bubble.until;
    if (talking) {
      B.head.rotation.x = Math.sin(t * 7 + a.id) * 0.06;
      if (!a.hand && !a.shake) { AL.sh.rotation.x += -0.5 + Math.sin(t * 3 + a.id) * 0.3; AL.el.rotation.x = -0.9; }
    }
    // look at their partner, or at you if you're close
    let lookYaw = null;
    const pdx = player.x - B.root.position.x, pdz = player.z - B.root.position.z;
    const pd = Math.hypot(pdx, pdz);
    if (partner) lookYaw = Math.atan2(partner.x - a.x, partner.y - a.y);
    else if (pd < 2.6) lookYaw = Math.atan2(pdx, pdz);
    let hy = 0;
    if (lookYaw !== null) { hy = lookYaw - B.anim.yaw; while (hy > Math.PI) hy -= Math.PI * 2; while (hy < -Math.PI) hy += Math.PI * 2; hy = clamp(hy, -1.1, 1.1); }
    B.anim.headYaw += (hy - B.anim.headYaw) * Math.min(1, dt * 4);
    B.head.rotation.y = B.anim.headYaw;
    if (!partner && pd < 2.6) B.head.rotation.x = clamp((camera.position.y - (B.root.position.y + 1.55 * sc)) / pd * -0.8, -0.4, 0.3);

    // held things and drinking
    const mug = a.seat && a.seat.mug && a.seat.mug.owner === a.id && a.seat.mug.level > 0.02 ? a.seat.mug : null;
    let holdKind = a.carry && a.carry !== 'relic' ? a.carry : a.carry === 'relic' ? 'relic' : null;
    let drinking = false;
    if (!holdKind && a.sitting && mug && mug.kind !== 'stew') {
      B.anim.drinkT -= dt;
      if (B.anim.drinkT < 0) { drinking = true; if (B.anim.drinkT < -1.6) B.anim.drinkT = 6 + Math.random() * 8; }
      if (drinking) { holdKind = mug.kind; AR.sh.rotation.x = -1.2; AR.el.rotation.x = -1.6; AR.sh.rotation.z = 0.35; B.head.rotation.x = -0.25; }
    }
    if (a.carry === 'lute') { AL.sh.rotation.x = -0.9; AL.el.rotation.x = -1.2; AR.sh.rotation.x = -0.6; AR.el.rotation.x = -1.0 + (G.music.playing && G.music.bard === a ? Math.sin(t * 12) * 0.25 : 0); }
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
      B.held.userData.flame ||= (() => { const f = sprite(flameTex, 0.06); f.position.y = B.held.userData.flameAt; f.center.set(0.5, 0.15); B.held.add(f); return f; })();
    }
    // the mug on the table, unless it's in hand right now
    if (a.seat && a.seat.mug && !(drinking && mug === a.seat.mug)) {
      /* drawn by syncTable */
    }
    a._drinking = drinking;
  }
  syncTable();
  for (const it of tableItems.values()) if (!it.userData.seen) it.visible = false;
}
function syncTable() {
  for (const s of seats) {
    if (!s.mug) continue;
    const occ = s.occupant;
    if (occ && occ._drinking && s.mug.owner === occ.id) continue;
    const k = s.mug.level > 0.02 ? s.mug.kind : 'empty';
    const ix = px2m(s.item[0]), iz = px2m(s.item[1] + 2);
    placeItem('seat' + s.id, k, s.bar ? ix : ix, s.bar ? 1.11 : 0.78, iz);
  }
  for (const t of tables) t.extra.forEach((e, i) => { const it = placeItem(`tx${t.id}${i}`, e, (t.x + 0.3 + i * 0.25) * S, 0.78, (t.y + 0.55) * S); if (it.userData.spin) it.userData.spin.rotation.y += 0.02; });
  G.items.forEach((e, i) => placeItem('item' + i, e.kind, px2m(e.x), 0.78, px2m(e.y)));
}

// ------------------------------------------------------------------ you
const player = { x: 15.5 * S, z: 13.2 * S, yaw: 0.62, pitch: -0.08, bob: 0, elev: 0 };
const keys = new Set();
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
function movePlayer(dt) {
  let f = 0, s = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
  f += touch.move.y; s += touch.move.x;
  const len = Math.hypot(f, s);
  const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2.6 : 1.5;
  if (len > 0.05) {
    f /= Math.max(1, len); s /= Math.max(1, len);
    const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
    const vx = (-sin * f + cos * s) * speed * dt, vz = (-cos * f - sin * s) * speed * dt;
    if (canStand(player.x + vx, player.z)) player.x += vx;
    if (canStand(player.x, player.z + vz)) player.z += vz;
    player.bob += dt * speed * 5.5;
  }
  const onStairs = kind[Math.floor(player.z / S)]?.[Math.floor(player.x / S)] === 'stairs';
  player.elev = lerp(player.elev, onStairs ? stairElev(player.z) : 0, Math.min(1, dt * 10));
}

// ------------------------------------------------------------------ sound
const audio = { on: false };
function startAudio() {
  Sfx.spatial = true;
  Sfx.setOn(true);
  const ctx = Sfx.ctx;
  if (!ctx || audio.on) return;
  audio.on = true;
  const panner = (p, ref = 1.2) => {
    const n = new THREE.Vector3().copy(p);
    const pn = ctx.createPanner();
    pn.panningModel = 'HRTF'; pn.distanceModel = 'inverse'; pn.refDistance = ref; pn.rolloffFactor = 1.3;
    pn.positionX.value = n.x; pn.positionY.value = n.y; pn.positionZ.value = n.z;
    pn.connect(Sfx.out);
    return pn;
  };
  const loop = (type, freq, q, dest) => {
    const src = ctx.createBufferSource(); src.buffer = Sfx.noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(dest); src.start(ctx.currentTime, Math.random() * 1.5);
    return g;
  };
  const fp = panner(HEARTH, 1.0);
  audio.fire = loop('lowpass', 420, 0.7, fp);
  Sfx.fireOut = fp;
  audio.rain = windows.map((w) => loop('bandpass', 2600, 0.5, panner(new THREE.Vector3(w.cx, w.cy, Z0), 1.5)));
  audio.rain.push(loop('highpass', 3000, 0.4, panner(new THREE.Vector3(13 * S, 1.2, Z1), 1.5)));
  Sfx.luteOut = panner(new THREE.Vector3(3.5 * S, 1.2, 3 * S), 2.2);
}
function updateAudio() {
  if (!audio.on) return;
  const ctx = Sfx.ctx, l = ctx.listener, t = ctx.currentTime;
  const p = camera.position, dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  if (l.positionX) {
    l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
    l.forwardX.value = dir.x; l.forwardY.value = dir.y; l.forwardZ.value = dir.z;
    l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
  } else { l.setPosition(p.x, p.y, p.z); l.setOrientation(dir.x, dir.y, dir.z, 0, 1, 0); }
  audio.fire.gain.setTargetAtTime(0.18 + 0.3 * G.fire, t, 0.4);
  const rv = G.weather === 'storm' ? 0.16 : G.weather === 'rain' ? 0.09 : 0;
  for (const g of audio.rain) g.gain.setTargetAtTime(rv, t, 1);
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
on('clue', () => toast('You overheard something that matters. It’s in your journal in the 2D view.'));
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

const touch = { move: { x: 0, y: 0 }, id: null, lookId: null, sx: 0, sy: 0, lx: 0, ly: 0 };
let entered = false, locked = false;
function enter(withSound) {
  $('#intro').hidden = true;
  entered = true;
  G.paused = false;
  if (withSound) startAudio();
  if (!matchMedia('(pointer: coarse)').matches) canvas.requestPointerLock?.()?.catch?.(() => {});
}
$('#enterSound').addEventListener('click', () => enter(true));
$('#enterQuiet').addEventListener('click', () => enter(false));
$('#again').addEventListener('click', () => { $('#dawn').hidden = true; startDay(G.day + 1); G.paused = false; captions.length = 0; });
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
  if (e.code === 'KeyM') { if (!audio.on) startAudio(); else Sfx.setOn(!Sfx.on); }
  if (e.code === 'KeyQ') { quality.high = !quality.high; applyQuality(); toast(quality.high ? 'High quality' : 'Low quality: faster on older machines'); }
  if (e.code === 'Space') { e.preventDefault(); G.paused = !G.paused; }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
// touch: left half moves, right half looks
canvas.addEventListener('touchstart', (e) => {
  for (const t of e.changedTouches) {
    if (t.clientX < window.innerWidth / 2 && touch.id === null) { touch.id = t.identifier; touch.sx = t.clientX; touch.sy = t.clientY; }
    else if (touch.lookId === null) { touch.lookId = t.identifier; touch.lx = t.clientX; touch.ly = t.clientY; }
  }
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === touch.id) { touch.move.x = clamp((t.clientX - touch.sx) / 50, -1, 1); touch.move.y = clamp(-(t.clientY - touch.sy) / 50, -1, 1); }
    if (t.identifier === touch.lookId) { player.yaw -= (t.clientX - touch.lx) * 0.005; player.pitch = clamp(player.pitch - (t.clientY - touch.ly) * 0.005, -1.2, 1.2); touch.lx = t.clientX; touch.ly = t.clientY; }
  }
}, { passive: true });
canvas.addEventListener('touchend', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === touch.id) { touch.id = null; touch.move.x = touch.move.y = 0; }
    if (t.identifier === touch.lookId) touch.lookId = null;
  }
});

function applyQuality() {
  renderer.shadowMap.enabled = quality.high;
  fireLight.castShadow = quality.high;
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
let last = performance.now(), fpsT = 0, fpsN = 0, autoQ = false, uiT = 0;
function frame(nowMs) {
  const dt = Math.min(0.1, (nowMs - last) / 1000); last = nowMs;
  const t = nowMs / 1000;
  if (!G.paused) {
    let sdt = dt * (keys.has('KeyF') ? 12 : 1);
    while (sdt > 0) { const s = Math.min(0.25, sdt); update(s); sdt -= s; }
  }
  if (entered) movePlayer(dt);
  G.sel = null;
  G.ear = { x: m2px(player.x), y: m2px(player.z) - 3 };

  // camera
  const bob = Math.sin(player.bob) * 0.025, sway = Math.sin(t * 0.6) * 0.004;
  camera.position.set(player.x, 1.62 + player.elev + bob, player.z);
  camera.rotation.set(player.pitch + sway, player.yaw, 0, 'YXZ');

  // time of day
  const h = hourOf(G.t);
  const sky = skyAt(h);
  hemi.intensity = 0.06 + sky.day * 0.55;
  hemi.color.setRGB(...sky.amb.map((v) => clamp(v / 200, 0, 1.2)));
  sun.intensity = sky.day * 0.7;
  scene.fog.color.setRGB(0.1 + sky.day * 0.18, 0.07 + sky.day * 0.15, 0.045 + sky.day * 0.12);
  scene.fog.density = 0.022 + (1 - sky.day) * 0.012;
  for (const w of windows) { drawWindow(w, sky, h, t); w.shaft.material.opacity = sky.day * 0.07; }
  if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 2.5);
  lightning.intensity = G.reduced ? 0 : G.flash * 3;

  // fire
  const fire = G.fire;
  const flick = G.reduced ? 1 : 1 + 0.12 * Math.sin(t * 11) + 0.08 * Math.sin(t * 17.3) + 0.06 * Math.sin(t * 5.1);
  fireLight.intensity = (12 + 26 * fire) * flick;
  fireLight.position.x = 8.0 + (G.reduced ? 0 : Math.sin(t * 7) * 0.04);
  fireGlow.material.opacity = 0.3 + 0.35 * fire * flick;
  for (const f of flames) {
    const u = f.userData, k = (t * 0.8 + u.ph) % 1;
    const hgt = (0.35 + 0.55 * fire) * (1 - k * 0.6) * (0.8 + 0.3 * Math.sin(t * u.sp + u.ph));
    f.scale.set(hgt * 0.55, hgt, 1);
    f.position.set(HEARTH.x + u.x * (0.7 + 0.3 * fire) + Math.sin(t * 3 + u.ph) * 0.03, 0.18, HEARTH.z + u.z);
    f.material.opacity = 0.55 + 0.35 * Math.sin(t * u.sp + u.ph);
  }
  const sp = sparkGeo.attributes.position.array;
  for (let i = 0; i < SPARKS; i++) {
    sparkLife[i] += dt * (0.4 + fire * 0.5);
    if (sparkLife[i] > 1) { sparkLife[i] = 0; sp[i * 3] = HEARTH.x + (Math.random() - 0.5) * 0.6; sp[i * 3 + 2] = HEARTH.z + (Math.random() - 0.5) * 0.2; }
    sp[i * 3 + 1] = 0.25 + sparkLife[i] * 1.1;
    sp[i * 3] += Math.sin(t * 5 + i) * 0.003;
  }
  sparkGeo.attributes.position.needsUpdate = true;
  const dp = dustGeo.attributes.position.array;
  for (let i = 0; i < DUST; i++) { dp[i * 3 + 1] += Math.sin(t * 0.3 + i) * 0.0008; dp[i * 3] += Math.cos(t * 0.2 + i * 1.3) * 0.0006; }
  dustGeo.attributes.position.needsUpdate = true;

  // candles, sconces, lanterns follow the simulation (the pot-boy lights them)
  for (const l of lamps) {
    const lit = l.f.lit;
    const fl = G.reduced ? 1 : 1 + 0.1 * Math.sin(t * 13 + l.phase) + 0.05 * Math.sin(t * 23 + l.phase);
    l.light.intensity = lit && quality.high ? l.base * fl : lit ? l.base * 0.7 : 0;
    l.fl.visible = l.gl.visible = lit;
    l.fl.scale.set(0.05 * fl, 0.09 * fl, 1);
    if (l.g.userData.glass) l.g.userData.glass.material.emissiveIntensity = lit ? 1.2 : 0;
  }

  // the door opens for anyone near it
  const near = G.agents.some((a) => a.present && a.kind === 'person' && a.ty >= 14 && a.tx >= 11 && a.tx <= 14);
  door.rotation.y = lerp(door.rotation.y, near ? -1.5 : 0, Math.min(1, dt * 4));
  outside.material.color.set(sky.day > 0.3 ? sky.bot : '#0b0f1a');

  syncPeople(dt, t);
  updateAudio();
  Sfx.update(dt);
  renderer.render(scene, camera);

  // HUD
  uiT += dt;
  if (uiT > 0.2) {
    uiT = 0;
    $('#clock').textContent = `${fmtTime(G.t)} · ${{ clear: 'clear', rain: 'rain', storm: 'storm' }[G.weather]}${G.paused && entered ? ' · paused' : ''}`;
    const who = entered ? lookTarget() : null;
    $('#look').innerHTML = who ? `<b>${esc(who.name)}</b><span>${esc(who.activity || who.title)}</span>` : '';
    renderCaptions();
  }
  // drop to low quality automatically if the machine is struggling
  if (entered && !autoQ) {
    fpsT += dt; fpsN++;
    if (fpsT > 4) { autoQ = true; if (fpsN / fpsT < 28 && quality.high) { quality.high = false; applyQuality(); toast('Switched to low quality to keep things smooth. Press Q to switch back.'); } }
  }
  requestAnimationFrame(frame);
}

function drawWindow(w, sky, h, t) {
  const g = w.g;
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, sky.top); gr.addColorStop(1, sky.bot);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  if ((h >= 19.5 || h < 6) && G.weather === 'clear') {
    const r = mulberry(7);
    for (let i = 0; i < 22; i++) { g.fillStyle = `rgba(230,230,255,${(0.35 + 0.4 * Math.abs(Math.sin(t * (0.3 + r() * 0.5) + i))).toFixed(2)})`; g.fillRect(Math.floor(r() * 128), Math.floor(r() * 80), 1, 1); }
    g.fillStyle = '#e8e4cc'; g.beginPath(); g.arc(96, 26, 7, 0, 7); g.fill(); g.fillStyle = sky.top; g.beginPath(); g.arc(100, 23, 6, 0, 7); g.fill();
  }
  if (G.weather !== 'clear') {
    g.fillStyle = 'rgba(160,180,210,.18)'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(190,210,235,.55)'; g.lineWidth = 1;
    for (const d of w.drops) {
      d[1] += d[2] * (G.weather === 'storm' ? 3 : 2);
      if (d[1] > 128) { d[1] = -10; d[0] = Math.random() * 128; }
      g.beginPath(); g.moveTo(d[0], d[1]); g.lineTo(d[0] - 1, d[1] + 6); g.stroke();
    }
  }
  if (G.flash > 0) { g.fillStyle = `rgba(235,240,255,${(G.flash * 0.9).toFixed(2)})`; g.fillRect(0, 0, 128, 128); }
  w.tex.needsUpdate = true;
}

// ------------------------------------------------------------------ go
createCast();
startDay(1);
G.paused = true;
$('#innName').textContent = lore.inn;
$('#signName').textContent = lore.inn;
document.title = `${lore.inn} · Step Inside`;
resize();
requestAnimationFrame(frame);
window.G = G;
window.__room = { player, advance(min) { while (min > 0) { const s = Math.min(0.25, min); update(s); min -= s; } } };
