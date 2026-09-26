// Low-poly 3D bodies for the simulation's people, built from the same
// "look" the pixel sprites use, with jointed limbs animated in code.
import * as THREE from '../../vendor/three.module.min.js';

const mats = new Map();
export function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...o }));
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
export function makePerson(a) {
  const L = a.look;
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const kin = L.kin;
  const scale = kin === 'dwarf' ? 0.74 : kin === 'halfling' ? 0.66 : kin === 'elf' ? 1.06 : L.bodyH === 5 ? 0.88 : 1;
  root.scale.setScalar(scale);
  const tw = L.build === 'thin' ? 0.34 : L.build === 'stout' ? 0.5 : 0.42;
  const skin = mat(L.skin), hair = mat(L.hair), top = mat(L.top), legs = mat(L.legs), boots = mat(L.boots || '#2b1d14');
  const sleeve = mat(L.sleeve ? L.sleeve : '#' + dark(L.top, 0.72).getHexString());

  // legs: thigh + shin, pivoted at hip and knee
  const legParts = [];
  for (const side of [-1, 1]) {
    const hip = pivot(side * 0.1, 0.84, 0);
    const thigh = box(0.14, 0.42, 0.16, L.robe ? top : legs); thigh.position.y = -0.21; hip.add(thigh);
    const knee = pivot(0, -0.42, 0); hip.add(knee);
    const shin = box(0.13, 0.36, 0.15, L.robe ? top : legs); shin.position.y = -0.18; knee.add(shin);
    const boot = box(0.15, 0.1, 0.24, boots); boot.position.set(0, -0.37, 0.04); knee.add(boot);
    body.add(hip);
    legParts.push({ hip, knee });
  }
  if (L.robe) {
    const skirt = cyl(tw * 0.5, tw * 0.72, 0.66, top, 10); skirt.position.y = 0.52; body.add(skirt);
    legParts.skirt = skirt;
  }

  // torso
  const torso = pivot(0, 0.84, 0); body.add(torso);
  const chest = box(tw, 0.6, 0.26, top); chest.position.y = 0.3; torso.add(chest);
  if (!L.robe && !L.apron) { const belt = box(tw + 0.01, 0.06, 0.27, mat(L.belt || '#34200f')); belt.position.y = 0.06; torso.add(belt); const bk = box(0.06, 0.05, 0.02, mat('#c9a64a', { metalness: 0.6, roughness: 0.4 })); bk.position.set(0, 0.06, 0.14); torso.add(bk); }
  if (L.apron) { const ap = box(tw * 0.75, 0.62, 0.02, mat('#e8dfc8')); ap.position.set(0, 0.12, 0.14); torso.add(ap); }
  if (L.chain) { const ch = box(tw + 0.02, 0.36, 0.28, mat('#8d9196', { metalness: 0.7, roughness: 0.45 })); ch.position.y = 0.4; torso.add(ch); }
  if (L.trim) { const tr = box(0.06, 0.58, 0.02, mat(L.trim)); tr.position.set(0, 0.3, 0.135); torso.add(tr); }
  if (L.holy) { const hs = box(0.05, 0.08, 0.02, mat('#e8d27a', { metalness: 0.7, roughness: 0.3 })); hs.position.set(0, 0.42, 0.15); torso.add(hs); }
  if (L.cloak) {
    const cl = box(tw + 0.1, 1.05, 0.05, mat(L.cloak)); cl.position.set(0, 0.08, -0.16); torso.add(cl);
    const clasp = box(0.06, 0.05, 0.03, mat('#c9a64a', { metalness: 0.6 })); clasp.position.set(0, 0.58, 0.14); torso.add(clasp);
  }

  // arms
  const arms = [];
  for (const side of [-1, 1]) {
    const sh = pivot(side * (tw / 2 + 0.06), 0.56, 0); torso.add(sh);
    const up = box(0.11, 0.3, 0.12, sleeve); up.position.y = -0.15; sh.add(up);
    const el = pivot(0, -0.3, 0); sh.add(el);
    const fore = box(0.1, 0.26, 0.11, sleeve); fore.position.y = -0.13; el.add(fore);
    const hand = box(0.09, 0.09, 0.1, skin); hand.position.y = -0.3; el.add(hand);
    const grip = pivot(0, -0.32, 0.03); el.add(grip);
    arms.push({ sh, el, grip });
  }

  // head
  const neck = pivot(0, 0.62, 0); torso.add(neck);
  const head = pivot(0, 0.1, 0); neck.add(head);
  const faceMat = L.shadowFace ? mat('#15100c') : skin;
  const skull = sph(0.135, faceMat, 10, 8); skull.scale.set(1, 1.12, 1.02); skull.position.y = 0.06; head.add(skull);
  const nose = box(0.04, 0.05, 0.05, faceMat); nose.position.set(0, 0.05, 0.135); head.add(nose);
  const eyeM = L.shadowFace ? new THREE.MeshBasicMaterial({ color: '#e8c070' }) : mat('#1f130c');
  for (const s of [-1, 1]) { const e = box(0.028, 0.03, 0.02, eyeM); e.position.set(s * 0.05, 0.09, 0.128); head.add(e); }
  if (kin === 'elf') for (const s of [-1, 1]) { const ear = cone(0.03, 0.12, skin, 4); ear.rotation.z = s * -1.1; ear.position.set(s * 0.15, 0.08, 0); head.add(ear); }
  if (L.hairStyle !== 'bald' || L.hat) {
    const cap = sph(0.15, hair, 10, 6, { theta: Math.PI * 0.55 }); cap.position.y = 0.07; cap.rotation.x = -0.25; head.add(cap);
    if (L.hairStyle === 'wild') cap.scale.set(1.18, 1.15, 1.18);
  }
  if (L.hairStyle === 'long') { const lh = box(0.28, 0.34, 0.1, hair); lh.position.set(0, -0.08, -0.1); head.add(lh); }
  if (L.hairStyle === 'bun') { const b = sph(0.07, hair, 8, 6); b.position.set(0, 0.16, -0.12); head.add(b); }
  if (L.hairStyle === 'bald') { for (const s of [-1, 1]) { const f = box(0.03, 0.08, 0.12, hair); f.position.set(s * 0.135, 0.04, -0.02); head.add(f); } }
  if (L.beard) {
    const bd = box(0.22, L.beard === 'long' ? 0.3 : 0.12, 0.1, hair);
    bd.position.set(0, L.beard === 'long' ? -0.1 : -0.02, 0.09); head.add(bd);
  }
  const hc = mat(L.hatCol || L.cloak || '#3a3a3a');
  switch (L.hat) {
    case 'hood': {
      const h = sph(0.19, hc, 10, 8, { theta: Math.PI * 0.62 }); h.position.set(0, 0.05, -0.02); h.rotation.x = -0.35; head.add(h);
      const pt = cone(0.08, 0.16, hc, 6); pt.position.set(0, 0.18, -0.12); pt.rotation.x = -0.9; head.add(pt);
      break;
    }
    case 'wizard': {
      const brim = cyl(0.26, 0.26, 0.02, hc, 14); brim.position.y = 0.15; head.add(brim);
      const c = cone(0.15, 0.45, hc, 10); c.position.set(0, 0.38, -0.03); c.rotation.x = -0.18; head.add(c);
      break;
    }
    case 'cap': case 'feathercap': {
      const c = sph(0.17, hc, 10, 6); c.scale.set(1, 0.38, 1); c.position.set(0.02, 0.16, 0); c.rotation.z = -0.15; head.add(c);
      const f = box(0.02, 0.26, 0.04, mat(L.hat === 'cap' ? '#ece4d4' : '#3f7a4a')); f.position.set(0.14, 0.27, -0.03); f.rotation.z = -0.4; head.add(f);
      break;
    }
    case 'helm': {
      const hm = mat('#8d9196', { metalness: 0.75, roughness: 0.35 });
      const c = sph(0.155, hm, 12, 8, { theta: Math.PI * 0.55 }); c.position.y = 0.07; head.add(c);
      const ng = box(0.03, 0.13, 0.03, hm); ng.position.set(0, 0.07, 0.15); head.add(ng);
      break;
    }
    case 'kerchief': { const c = sph(0.152, hc, 10, 6, { theta: Math.PI * 0.5 }); c.position.y = 0.08; c.rotation.x = -0.3; head.add(c); break; }
    case 'straw': {
      const sm = mat('#c9a55a'); const brim = cyl(0.28, 0.28, 0.02, sm, 14); brim.position.y = 0.16; head.add(brim);
      const cr = cyl(0.13, 0.15, 0.12, sm, 10); cr.position.y = 0.23; head.add(cr);
      const band = cyl(0.152, 0.152, 0.03, mat('#7a4a22'), 10); band.position.y = 0.19; head.add(band);
      break;
    }
    case 'coif': { const c = sph(0.165, mat('#e8e2d2'), 10, 8, { theta: Math.PI * 0.66 }); c.position.set(0, 0.06, -0.02); c.rotation.x = -0.3; head.add(c); break; }
  }

  // weapons on the back
  if (L.weapon === 'sword') {
    const bl = box(0.05, 0.8, 0.015, mat('#aab0b6', { metalness: 0.8, roughness: 0.3 })); bl.position.set(0.05, 0.3, -0.17); bl.rotation.z = 0.35; torso.add(bl);
    const hilt = box(0.18, 0.03, 0.03, mat('#c9a64a', { metalness: 0.6 })); hilt.position.set(-0.08, 0.66, -0.17); hilt.rotation.z = 0.35; torso.add(hilt);
  }
  if (L.weapon === 'bow') { const bw = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.015, 4, 16, Math.PI), mat('#7a5230')); bw.position.set(0, 0.3, -0.18); bw.rotation.z = Math.PI / 2 + 0.3; torso.add(bw); }
  if (L.weapon === 'axe') {
    const hd = cyl(0.02, 0.02, 0.7, mat('#6b4a2a')); hd.position.set(0, 0.35, -0.17); hd.rotation.z = -0.3; torso.add(hd);
    const bl = box(0.2, 0.15, 0.02, mat('#9aa0a6', { metalness: 0.7, roughness: 0.4 })); bl.position.set(0.12, 0.66, -0.17); torso.add(bl);
  }
  let staff = null;
  if (L.weapon === 'staff') {
    staff = new THREE.Group();
    const st = cyl(0.02, 0.025, 1.7, mat('#6b4a2a')); st.position.y = 0.3; staff.add(st);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), new THREE.MeshStandardMaterial({ color: '#7fd3ff', emissive: '#3aa0ff', emissiveIntensity: 1.2 }));
    gem.position.y = 1.18; staff.add(gem);
    arms[1].grip.add(staff);
  }

  root.traverse((o) => { if (o.isMesh) o.receiveShadow = false; });
  return { root, body, torso, head, neck, legs: legParts, arms, staff, scale, held: null, heldKind: null, anim: { yaw: 0, headYaw: 0, drinkT: Math.random() * 10 } };
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
