// Low-poly 3D bodies for the simulation's people, built from the same
// "look" the pixel sprites use, with jointed limbs animated in code.
import * as THREE from '../../vendor/three.module.min.js';

const mats = new Map();
export function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o }));
  return mats.get(key);
}
const box = (w, h, d, m) => { const x = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); x.castShadow = true; return x; };
const sph = (r, m, ws = 10, hs = 8, o = {}) => { const x = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, o.theta ?? Math.PI), m); x.castShadow = true; return x; };
const cyl = (rt, rb, h, m, seg = 8) => { const x = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); x.castShadow = true; return x; };
const cone = (r, h, m, seg = 8) => { const x = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m); x.castShadow = true; return x; };
const pivot = (x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); return g; };

const dark = (hex, f) => { const c = new THREE.Color(hex); c.multiplyScalar(f); return c; };

// ------------------------------------------------------------------ items held or set down
export function makeItem(kind) {
  const g = new THREE.Group();
  switch (kind) {
    case 'ale': case 'empty': case 'mug': {
      const m = cyl(0.045, 0.04, 0.11, mat('#7a5a36')); m.position.y = 0.055; g.add(m);
      const h = box(0.015, 0.06, 0.03, mat('#5a3f22')); h.position.set(0.055, 0.06, 0); g.add(h);
      if (kind !== 'empty') { const f = cyl(0.043, 0.043, 0.015, mat('#f0e2b8')); f.position.y = 0.11; g.add(f); }
      break;
    }
    case 'wine': {
      const s = cyl(0.008, 0.03, 0.08, mat('#d8d0c0', { roughness: 0.2 })); s.position.y = 0.04; g.add(s);
      const b = cyl(0.035, 0.02, 0.06, mat('#6a1020', { roughness: 0.2 })); b.position.y = 0.1; g.add(b);
      break;
    }
    case 'stew': {
      const b = cyl(0.08, 0.05, 0.05, mat('#8a5a30')); b.position.y = 0.025; g.add(b);
      const s = cyl(0.072, 0.072, 0.01, mat('#a0561e')); s.position.y = 0.045; g.add(s);
      break;
    }
    case 'purse': { const p = sph(0.05, mat('#6b4424'), 7, 5); p.scale.y = 0.8; p.position.y = 0.04; g.add(p); break; }
    case 'relic': {
      const p = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), new THREE.MeshStandardMaterial({ color: '#8fe0ff', emissive: '#4ab8ff', emissiveIntensity: 1.6, roughness: 0.1 }));
      p.position.y = 0.07; g.add(p); g.userData.spin = p;
      break;
    }
    case 'dice': { const a = box(0.03, 0.03, 0.03, mat('#efe6cf')); a.position.set(-0.03, 0.015, 0); const b = a.clone(); b.position.set(0.03, 0.015, 0.02); b.rotation.y = 0.6; g.add(a, b); break; }
    case 'log': { const l = cyl(0.07, 0.07, 0.5, mat('#5a3a1a')); l.rotation.z = Math.PI / 2; g.add(l); break; }
    case 'broom': { const s = cyl(0.015, 0.015, 1.2, mat('#7a5a30')); s.position.y = -0.2; const b = cyl(0.03, 0.09, 0.25, mat('#c9a55a')); b.position.y = -0.85; g.add(s, b); break; }
    case 'taper': { const s = cyl(0.008, 0.008, 0.35, mat('#efe6cf')); s.position.y = 0.17; g.add(s); g.userData.flameAt = 0.36; break; }
    case 'lute': {
      const b = sph(0.14, mat('#a0682c'), 10, 8); b.scale.set(1, 1.2, 0.45); g.add(b);
      const n = box(0.04, 0.4, 0.03, mat('#5a3a1a')); n.position.set(0, 0.3, 0); g.add(n);
      const h = sph(0.035, mat('#1a0d05'), 8, 6); h.position.z = 0.06; h.scale.z = 0.2; g.add(h);
      break;
    }
  }
  return g;
}

// ------------------------------------------------------------------ bodies
// Rounded limbs and a real face: eyes that blink, brows, a mouth that moves.
const cap = (r, len, m, cast = true) => { const x = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 8), m); x.castShadow = cast; return x; };
const quiet = (mesh) => { mesh.castShadow = false; return mesh; };

export function makePerson(a) {
  const L = a.look;
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const kin = L.kin;
  // No two people are built alike: height, girth, shoulders, limbs, head and bearing all
  // vary, seeded by who they are so each keeps their shape from night to night.
  let seed = (a.id * 2654435761) >>> 0;
  const rr = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const bell = () => (rr() + rr() + rr()) / 3;
  const tall = 0.9 + bell() * 0.22;
  const scale = (kin === 'dwarf' ? 0.74 : kin === 'halfling' ? 0.66 : kin === 'elf' ? 1.06 : L.bodyH === 5 ? 0.88 : 1) * tall;
  root.scale.setScalar(scale);
  const girth = L.build === 'thin' ? 0.8 + rr() * 0.14 : L.build === 'stout' ? 1.16 + rr() * 0.3 : 0.92 + rr() * 0.2;
  const shoulders = (kin === 'dwarf' ? 1.12 : 1) * (0.9 + rr() * 0.24);
  const limb = 0.8 + (girth - 0.8) * 0.55 + rr() * 0.1;
  const stoop = rr() < 0.22 ? 0.07 + rr() * 0.13 : rr() * 0.03;
  const headK = (0.94 + rr() * 0.12) / Math.pow(tall, 0.7);
  const tw = 0.4 * girth;
  const skin = mat(L.skin, { roughness: 0.7 }), hair = mat(L.hair, { roughness: 0.95 }), top = mat(L.top), legs = mat(L.legs), boots = mat(L.boots || '#2b1d14', { roughness: 0.6 });
  const sleeve = mat(L.sleeve ? L.sleeve : '#' + dark(L.top, 0.72).getHexString());
  const gold = mat('#c9a64a', { metalness: 0.6, roughness: 0.4 });

  // legs: thigh + shin, pivoted at hip and knee
  const legParts = [];
  for (const side of [-1, 1]) {
    const hip = pivot(side * 0.1, 0.84, 0);
    const thigh = cyl(0.088, 0.068, 0.42, L.robe ? top : legs, 10); thigh.position.y = -0.21; thigh.scale.set(limb, 1, limb); hip.add(thigh);
    const kn = quiet(sph(0.067, L.robe ? top : legs, 8, 6)); kn.position.y = -0.42; hip.add(kn);
    const knee = pivot(0, -0.42, 0); hip.add(knee);
    const shin = cyl(0.066, 0.05, 0.36, L.robe ? top : legs, 10); shin.position.y = -0.18; shin.scale.set(limb, 1, limb); knee.add(shin);
    const boot = cap(0.062, 0.12, boots, false); boot.rotation.x = Math.PI / 2; boot.scale.set(1.15, 1, 0.85); boot.position.set(0, -0.375, 0.045); knee.add(boot);
    const cuff = quiet(cyl(0.07, 0.066, 0.1, boots, 10)); cuff.position.y = -0.29; knee.add(cuff);
    body.add(hip);
    legParts.push({ hip, knee });
  }
  if (L.robe) {
    const skirt = cyl(tw * 0.46, tw * 0.74, 0.7, top, 12); skirt.position.y = 0.5; skirt.scale.z = 0.8; body.add(skirt);
    legParts.skirt = skirt;
  }

  // torso: tapered, with rounded shoulders, a waist and the hem of a tunic
  const torso = pivot(0, 0.84, 0); body.add(torso);
  const sw = 0.42 * shoulders * (0.75 + girth * 0.25);     // shoulder breadth is its own thing, not just girth
  const chest = cyl(sw * 0.52, tw * 0.46, 0.52, top, 12); chest.position.y = 0.3; chest.scale.z = 0.6 * (0.8 + girth * 0.2) * (tw / sw > 1 ? 1.1 : 1); torso.add(chest);
  const yoke = sph(sw * 0.52, top, 12, 8); yoke.scale.set(1, 0.34, 0.6); yoke.position.y = 0.56; torso.add(yoke);
  const pelvis = sph(tw * 0.45, L.robe ? top : legs, 12, 8); pelvis.scale.set(1, 0.5, 0.62); pelvis.position.y = 0.03; torso.add(pelvis);
  if (girth > 1.05) { const belly = sph(tw * 0.5, top, 12, 8), bk2 = (girth - 1.05) * 1.6; belly.scale.set(0.98, 0.7 + bk2 * 0.25, 0.66 + bk2 * 0.45); belly.position.set(0, 0.2 - bk2 * 0.04, 0.03 + bk2 * 0.06); torso.add(belly); }
  if (!L.robe) { const hem = quiet(cyl(tw * 0.45, tw * 0.54, 0.16, top, 12)); hem.position.y = -0.02; hem.scale.z = 0.64; torso.add(hem); }
  const fz = Math.max(sw, tw) * 0.52 * 0.62;    // how far the chest stands out in front
  if (!L.robe && !L.apron) {
    const belt = quiet(cyl(tw * 0.455, tw * 0.455, 0.055, mat(L.belt || '#34200f'), 12)); belt.position.y = 0.07; belt.scale.z = 0.64; torso.add(belt);
    const bk = quiet(box(0.055, 0.05, 0.02, gold)); bk.position.set(0, 0.07, tw * 0.455 * 0.64); torso.add(bk);
  }
  if (L.apron) { const ap = quiet(box(tw * 0.7, 0.66, 0.02, mat('#e8dfc8'))); ap.position.set(0, 0.1, fz - 0.015); ap.rotation.x = -0.04; torso.add(ap); }
  if (L.chain) { const ch = cyl(tw * 0.54, tw * 0.47, 0.36, mat('#8d9196', { metalness: 0.7, roughness: 0.45 }), 12); ch.position.y = 0.38; ch.scale.z = 0.64; torso.add(ch); }
  if (L.trim) { const tr = quiet(box(0.05, 0.5, 0.02, mat(L.trim))); tr.position.set(0, 0.3, fz - 0.005); tr.rotation.x = -0.05; torso.add(tr); }
  if (L.holy) { const hs = quiet(box(0.05, 0.08, 0.02, mat('#e8d27a', { metalness: 0.7, roughness: 0.3 }))); hs.position.set(0, 0.42, fz + 0.01); torso.add(hs); }
  let cloak = null;
  if (L.cloak) {
    cloak = pivot(0, 0.6, -0.1); torso.add(cloak);
    const cl = cyl(tw * 0.5, tw * 0.78, 1.08, mat(L.cloak, { side: THREE.DoubleSide }), 10); cl.geometry = new THREE.CylinderGeometry(tw * 0.5, tw * 0.78, 1.08, 10, 1, true, Math.PI * 0.5, Math.PI);
    cl.position.set(0, -0.52, 0.06); cl.scale.z = 0.55; cloak.add(cl);
    const clasp = quiet(box(0.06, 0.05, 0.03, gold)); clasp.position.set(0, 0.58, fz); torso.add(clasp);
  }
  const collar = quiet(cyl(0.075, 0.1, 0.05, sleeve, 10)); collar.position.y = 0.6; torso.add(collar);

  // arms
  const arms = [];
  for (const side of [-1, 1]) {
    const sh = pivot(side * (sw / 2 + 0.035), 0.55, 0); torso.add(sh);
    const ball = quiet(sph(0.062, sleeve, 8, 6)); sh.add(ball);
    const up = cyl(0.058, 0.046, 0.3, sleeve, 8); up.position.y = -0.15; up.scale.set(limb, 1, limb); sh.add(up);
    const el = pivot(0, -0.3, 0); sh.add(el);
    const elb = quiet(sph(0.046, sleeve, 8, 6)); el.add(elb);
    const fore = cyl(0.046, 0.036, 0.27, sleeve, 8); fore.position.y = -0.135; fore.scale.set(limb, 1, limb); el.add(fore);
    const hand = quiet(sph(0.05, skin, 8, 6)); hand.scale.set(0.75, 1.15, 0.95); hand.position.y = -0.3; el.add(hand);
    const grip = pivot(0, -0.32, 0.03); el.add(grip);
    arms.push({ sh, el, grip, side });
  }

  // head
  const neck = pivot(0, 0.62, 0); torso.add(neck);
  const nk = quiet(cyl(0.05, 0.058, 0.1, skin, 8)); nk.position.y = 0.03; neck.add(nk);
  const head = pivot(0, 0.1, 0); neck.add(head); head.scale.setScalar(headK);
  const faceMat = L.shadowFace ? mat('#15100c') : skin;
  const skull = sph(0.135, faceMat, 16, 12); skull.scale.set(0.97, 1.12, 1.02); skull.position.y = 0.06; head.add(skull);
  const jaw = quiet(sph(0.1, faceMat, 12, 8)); jaw.scale.set(0.95, 0.8, 0.95); jaw.position.set(0, -0.03, 0.025); head.add(jaw);
  const nose = quiet(sph(0.028, faceMat, 8, 6)); nose.scale.set(0.8, 1.2, 1.2); nose.position.set(0, 0.045, 0.14); head.add(nose);
  for (const s of [-1, 1]) { const ear = quiet(sph(0.03, faceMat, 6, 5)); ear.scale.set(0.5, 1, 0.8); ear.position.set(s * 0.13, 0.06, 0); head.add(ear); }
  const eyes = [], brows = [];
  for (const s of [-1, 1]) {
    const eye = pivot(s * 0.05, 0.085, 0.118); head.add(eye);
    if (L.shadowFace) { eye.add(quiet(sph(0.014, new THREE.MeshBasicMaterial({ color: '#f0c470' }), 6, 5))); }
    else {
      const white = quiet(sph(0.021, mat('#cfc8ba', { roughness: 0.7 }), 8, 6)); white.scale.set(1.15, 0.85, 0.5); eye.add(white);
      const iris = quiet(sph(0.012, mat('#20140c', { roughness: 0.2 }), 6, 5)); iris.scale.z = 0.5; iris.position.z = 0.008; eye.add(iris);
      const brow = quiet(box(0.05, 0.012, 0.015, hair)); brow.position.set(s * 0.05, 0.118, 0.126); brow.rotation.z = s * -0.12; head.add(brow); brows.push(brow);
    }
    eyes.push(eye);
  }
  const mouth = quiet(box(0.05, 0.01, 0.012, mat(L.shadowFace ? '#000000' : '#4a1f1a')));
  mouth.position.set(0, -0.02, 0.118); head.add(mouth);
  if (kin === 'elf') for (const s of [-1, 1]) { const ear = quiet(cone(0.03, 0.12, skin, 4)); ear.rotation.z = s * -1.1; ear.position.set(s * 0.15, 0.08, 0); head.add(ear); }
  if (L.hairStyle !== 'bald' || L.hat) {
    const hc2 = sph(0.148, hair, 14, 8, { theta: Math.PI * 0.56 }); hc2.position.y = 0.068; hc2.rotation.x = -0.32; hc2.scale.set(1, 1.1, 1.05); head.add(hc2);
    if (L.hairStyle === 'wild') { hc2.scale.set(1.2, 1.22, 1.2); for (let i = 0; i < 5; i++) { const tuft = quiet(cone(0.045, 0.1, hair, 5)); const an = i * 1.3; tuft.position.set(Math.sin(an) * 0.11, 0.2, Math.cos(an) * 0.1 - 0.03); tuft.rotation.set(Math.cos(an) * 0.7, 0, -Math.sin(an) * 0.7); head.add(tuft); } }
  }
  if (L.hairStyle === 'long') { const lh = sph(0.15, hair, 10, 8); lh.scale.set(1.02, 1.5, 0.6); lh.position.set(0, -0.06, -0.075); head.add(lh); }
  if (L.hairStyle === 'bun') { const bn = quiet(sph(0.07, hair, 8, 6)); bn.position.set(0, 0.17, -0.12); head.add(bn); }
  if (L.hairStyle === 'bald') { for (const s of [-1, 1]) { const f = quiet(sph(0.05, hair, 6, 5)); f.scale.set(0.4, 0.9, 1.3); f.position.set(s * 0.125, 0.05, -0.03); head.add(f); } }
  if (L.beard) {
    const long = L.beard === 'long';
    const bd = quiet(sph(0.1, hair, 10, 8)); bd.scale.set(1.05, long ? 1.9 : 0.85, 0.75); bd.position.set(0, long ? -0.13 : -0.055, 0.05); head.add(bd);
    const mo = quiet(box(0.09, 0.022, 0.03, hair)); mo.position.set(0, -0.002, 0.125); head.add(mo);
    mouth.position.z = 0.127; mouth.position.y = -0.024;
  }
  const hc = mat(L.hatCol || L.cloak || '#3a3a3a');
  switch (L.hat) {
    case 'hood': {
      const h = sph(0.19, hc, 12, 8, { theta: Math.PI * 0.62 }); h.position.set(0, 0.05, -0.02); h.rotation.x = -0.35; head.add(h);
      const pt = quiet(cone(0.08, 0.16, hc, 6)); pt.position.set(0, 0.18, -0.12); pt.rotation.x = -0.9; head.add(pt);
      break;
    }
    case 'wizard': {
      const brim = cyl(0.26, 0.27, 0.02, hc, 16); brim.position.y = 0.15; head.add(brim);
      const c = cone(0.15, 0.45, hc, 12); c.position.set(0, 0.38, -0.03); c.rotation.x = -0.18; head.add(c);
      break;
    }
    case 'cap': case 'feathercap': {
      const c = sph(0.17, hc, 12, 6); c.scale.set(1, 0.38, 1); c.position.set(0.02, 0.16, 0); c.rotation.z = -0.15; head.add(c);
      const f = quiet(box(0.02, 0.26, 0.04, mat(L.hat === 'cap' ? '#ece4d4' : '#3f7a4a'))); f.position.set(0.14, 0.27, -0.03); f.rotation.z = -0.4; head.add(f);
      break;
    }
    case 'helm': {
      const hm = mat('#8d9196', { metalness: 0.75, roughness: 0.35 });
      const c = sph(0.155, hm, 14, 8, { theta: Math.PI * 0.55 }); c.position.y = 0.07; head.add(c);
      const ng = quiet(box(0.03, 0.13, 0.03, hm)); ng.position.set(0, 0.07, 0.15); head.add(ng);
      break;
    }
    case 'kerchief': { const c = sph(0.152, hc, 12, 6, { theta: Math.PI * 0.5 }); c.position.y = 0.08; c.rotation.x = -0.3; head.add(c); break; }
    case 'straw': {
      const sm = mat('#c9a55a'); const brim = cyl(0.28, 0.29, 0.02, sm, 16); brim.position.y = 0.16; head.add(brim);
      const cr = quiet(cyl(0.13, 0.15, 0.12, sm, 12)); cr.position.y = 0.23; head.add(cr);
      const band = quiet(cyl(0.152, 0.152, 0.03, mat('#7a4a22'), 12)); band.position.y = 0.19; head.add(band);
      break;
    }
    case 'coif': { const c = sph(0.165, mat('#e8e2d2'), 12, 8, { theta: Math.PI * 0.66 }); c.position.set(0, 0.06, -0.02); c.rotation.x = -0.3; head.add(c); break; }
  }

  // weapons on the back
  if (L.weapon === 'sword') {
    const bl = quiet(box(0.05, 0.8, 0.015, mat('#aab0b6', { metalness: 0.8, roughness: 0.3 }))); bl.position.set(0.05, 0.3, -0.19); bl.rotation.z = 0.35; torso.add(bl);
    const hilt = quiet(box(0.18, 0.03, 0.03, gold)); hilt.position.set(-0.08, 0.66, -0.19); hilt.rotation.z = 0.35; torso.add(hilt);
  }
  if (L.weapon === 'bow') { const bw = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.015, 4, 16, Math.PI), mat('#7a5230')); bw.position.set(0, 0.3, -0.2); bw.rotation.z = Math.PI / 2 + 0.3; torso.add(bw); }
  if (L.weapon === 'axe') {
    const hd = quiet(cyl(0.02, 0.02, 0.7, mat('#6b4a2a'))); hd.position.set(0, 0.35, -0.19); hd.rotation.z = -0.3; torso.add(hd);
    const bl = quiet(box(0.2, 0.15, 0.02, mat('#9aa0a6', { metalness: 0.7, roughness: 0.4 }))); bl.position.set(0.12, 0.66, -0.19); torso.add(bl);
  }
  let staff = null;
  if (L.weapon === 'staff') {
    staff = new THREE.Group();
    const st = cyl(0.02, 0.025, 1.7, mat('#6b4a2a')); st.position.y = 0.3; staff.add(st);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), new THREE.MeshStandardMaterial({ color: '#7fd3ff', emissive: '#3aa0ff', emissiveIntensity: 2.4 }));
    gem.position.y = 1.18; staff.add(gem);
    arms[1].grip.add(staff);
  }

  root.traverse((o) => { if (o.isMesh) o.receiveShadow = false; });
  const joints = [torso, neck, head, arms[0].sh, arms[0].el, arms[1].sh, arms[1].el, legParts[0].hip, legParts[0].knee, legParts[1].hip, legParts[1].knee];
  const r = Math.random;
  return {
    root, body, torso, chest, head, neck, legs: legParts, arms, staff, cloak, scale, eyes, brows, mouth, joints,
    stoop, stride: 0.94 + rr() * 0.14, pace: Math.max(0.74, Math.min(1.14, 1.1 - (girth - 1) * 0.4 - stoop * 1.2 + (rr() - 0.5) * 0.14)),
    prev: joints.map(() => new THREE.Vector3()), fresh: true,
    held: null, heldKind: null,
    anim: { yaw: 0, headYaw: 0, headPitch: 0, drinkT: r() * 10, blinkT: 1 + r() * 4, glanceT: r() * 5, glance: 0, glanceP: 0, laugh: 0, sat: 0, ph: r() * 20, stepI: 0, gait: 0, fidget: r() * 12 },
  };
}

export function makeCat(color) {
  const root = new THREE.Group();
  const m = mat(color);
  const body = box(0.14, 0.13, 0.34, m); body.position.y = 0.16; root.add(body);
  const head = pivot(0, 0.26, 0.19); root.add(head);
  const hd = box(0.13, 0.11, 0.11, m); head.add(hd);
  for (const s of [-1, 1]) { const ear = cone(0.03, 0.06, m, 4); ear.position.set(s * 0.04, 0.08, 0); head.add(ear); const e = box(0.02, 0.02, 0.01, new THREE.MeshBasicMaterial({ color: '#d8e070' })); e.position.set(s * 0.03, 0.01, 0.056); head.add(e); }
  const tail = pivot(0, 0.2, -0.17); root.add(tail);
  const t = box(0.03, 0.03, 0.26, m); t.position.z = -0.13; tail.add(t);
  const legs = [];
  for (const [x, z] of [[-0.05, 0.12], [0.05, 0.12], [-0.05, -0.12], [0.05, -0.12]]) { const l = box(0.04, 0.12, 0.04, m); l.position.set(x, 0.06, z); root.add(l); legs.push(l); }
  return { root, body, head, tail, legs, cat: true, anim: { yaw: 0 } };
}
