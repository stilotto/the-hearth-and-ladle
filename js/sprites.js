// Procedural pixel-art people. Every character is drawn from a "look":
// kin, build, skin, hair, clothes, hat, weapon. Frames are cached canvases.
import { pick, chance, shade } from './util.js';

export const SW = 14, SH = 26;   // sprite canvas (12x24 inner + 1px outline margin)
const BASE = 22;                 // boot row, inner coords

export const PAL = {
  skin: ['#f1c9a5', '#e6b48f', '#d49a70', '#b07a55', '#8a5a3c', '#63402a'],
  hair: ['#2a1b12', '#4a2c18', '#6b3f1f', '#a0622a', '#c9a15a', '#8e8a84', '#d9d3c6', '#1d1d26', '#7a2e1a', '#b8452a'],
  cloth: ['#6b2f2a', '#7e5a2c', '#3f5a3a', '#2f4a5e', '#5a4a6e', '#8a6a3a', '#55504a', '#7a3d52', '#3e5f5a', '#9a7b4f', '#5d6b3a', '#8c4a2a'],
  legs: ['#3a2c22', '#4a3a2a', '#2e3438', '#4d4232', '#3b3326', '#5a4a3a'],
};

export function randomLook(o = {}) {
  const kin = o.kin || 'human';
  const L = {
    kin,
    skin: pick(PAL.skin), hair: pick(PAL.hair),
    hairStyle: pick(['short', 'short', 'long', 'bun', 'wild', 'bald']),
    beard: false,
    top: pick(PAL.cloth), legs: pick(PAL.legs), boots: pick(['#2b1d14', '#3a2616', '#241a14']),
    build: pick(['thin', 'normal', 'normal', 'stout']),
    legH: 3, bodyH: 6, hat: null,
    ...o,
  };
  if (kin === 'dwarf') { L.legH = 1; L.build = 'stout'; L.beard = o.beard ?? 'long'; L.hairStyle = o.hairStyle || pick(['short', 'wild', 'bald']); }
  if (kin === 'halfling') { L.legH = 1; L.bodyH = 5; L.build = o.build || pick(['thin', 'normal']); L.hairStyle = o.hairStyle || 'wild'; }
  if (kin === 'elf') { L.legH = 4; L.build = 'thin'; L.hair = o.hair || pick(['#e8dcb0', '#d9d3c6', '#2a1b12', '#c9a15a', '#b8452a']); L.hairStyle = o.hairStyle || 'long'; }
  if (o.beard === undefined && kin === 'human' && L.hairStyle !== 'bun' && chance(0.3)) L.beard = chance(0.3) ? 'long' : 'short';
  return L;
}

export function makeSprites(L) {
  return {
    f: [0, 1, 2].map((i) => draw(L, 'f', i)),
    b: [0, 1, 2].map((i) => draw(L, 'b', i)),
    fs: draw(L, 'f', 3),
    bs: draw(L, 'b', 3),
  };
}

function draw(L, view, frame) {
  const c = document.createElement('canvas');
  c.width = SW; c.height = SH;
  const g = c.getContext('2d');
  const p = (x, y, w, h, col) => { if (!col || w <= 0 || h <= 0) return; g.fillStyle = col; g.fillRect(x + 1, y + 1, w, h); };
  const back = view === 'b';
  const sit = frame === 3;
  const legH = sit ? 1 : L.legH;
  const bodyH = L.bodyH;
  const bodyTop = sit ? BASE - 1 - bodyH : BASE - legH - bodyH;
  const headTop = bodyTop - 6;
  const bw = L.build === 'thin' ? 6 : L.build === 'stout' ? 10 : 8;
  const bx = 6 - bw / 2;
  const hx = 3;
  const skin = L.skin, skinD = shade(L.skin, 0.8);
  const hair = L.hair, hairD = shade(L.hair, 0.72);
  const top = L.top, topD = shade(L.top, 0.7), topL = shade(L.top, 1.18);
  const eye = '#1f130c';

  // cloak behind, seen from the back
  if (L.cloak && back) {
    p(bx - 1, bodyTop, bw + 2, bodyH + (sit ? 1 : legH), L.cloak);
    p(bx + bw, bodyTop, 1, bodyH + (sit ? 1 : legH), shade(L.cloak, 0.7));
  }

  // legs / robe
  if (!sit) {
    const lA = frame === 1 ? 1 : 0, lB = frame === 2 ? 1 : 0;
    if (L.robe) {
      p(bx, BASE - legH, bw, legH, top);
      p(bx + bw - 1, BASE - legH, 1, legH, topD);
      p(bx, BASE - 1, bw, 1, topD);
      p(4 + lA, BASE, 2, 1, L.boots); p(6 - lB, BASE, 2, 1, L.boots);
    } else {
      p(4, BASE - legH, 2, legH - lA, L.legs); p(6, BASE - legH, 2, legH - lB, shade(L.legs, 0.8));
      p(4, BASE - lA, 2, 1, L.boots); p(6, BASE - lB, 2, 1, L.boots);
    }
  } else {
    p(bx + 1, BASE - 1, bw - 2, 1, L.robe ? topD : L.legs);
  }

  // body
  p(bx, bodyTop, bw, bodyH, top);
  p(bx + bw - 1, bodyTop, 1, bodyH, topD);
  p(bx, bodyTop, bw, 1, topL);
  if (!L.robe && !back) p(bx, bodyTop + bodyH - 2, bw, 1, L.belt || '#34200f');
  if (!L.robe && !back && L.buckle !== false) p(5, bodyTop + bodyH - 2, 2, 1, '#c9a64a');
  if (L.robe && L.trim) { p(5, bodyTop + 1, 2, bodyH - 1, L.trim); }
  if (L.apron && !back) { p(4, bodyTop + 2, 4, bodyH - 2 + (sit ? 0 : 1), '#e8dfc8'); p(bx, bodyTop + 2, bw, 1, '#d6cab0'); }
  if (L.chain && !back) { p(bx + 1, bodyTop + 1, bw - 2, 3, '#8d9196'); p(bx + 1, bodyTop + 1, bw - 2, 1, '#b8bcc0'); }

  // arms
  const arm = L.sleeve || topD;
  const hlY = bodyTop + bodyH - 1 - (frame === 1 ? 1 : 0);
  const hrY = bodyTop + bodyH - 1 - (frame === 2 ? 1 : 0);
  p(bx - 1, bodyTop + 1, 1, hlY - bodyTop - 1, arm); p(bx - 1, hlY, 1, 1, skin);
  p(bx + bw, bodyTop + 1, 1, hrY - bodyTop - 1, arm); p(bx + bw, hrY, 1, 1, skin);

  // cloak edges in front
  if (L.cloak && !back) {
    p(bx - 1, bodyTop, 1, bodyH + (sit ? 0 : 1), L.cloak);
    p(bx + bw, bodyTop, 1, bodyH + (sit ? 0 : 1), shade(L.cloak, 0.75));
    p(bx, bodyTop, bw, 1, L.cloak);
    p(5, bodyTop, 2, 1, '#c9a64a');
  }

  // head
  if (!back) {
    p(hx, headTop + 1, 6, 5, skin);
    p(hx + 5, headTop + 1, 1, 5, skinD);
    p(hx + 1, headTop + 3, 1, 1, eye); p(hx + 4, headTop + 3, 1, 1, eye);
    if (!L.beard) p(hx + 2, headTop + 5, 2, 1, skinD);
    switch (L.hairStyle) {
      case 'bald': p(hx, headTop + 1, 6, 1, skinD); p(hx, headTop + 2, 1, 2, hair); p(hx + 5, headTop + 2, 1, 2, hair); break;
      case 'long': p(hx, headTop, 6, 2, hair); p(hx - 1, headTop + 1, 1, 7, hair); p(hx + 6, headTop + 1, 1, 7, hairD); p(hx, headTop + 2, 1, 2, hair); p(hx + 5, headTop + 2, 1, 2, hair); break;
      case 'bun': p(hx, headTop, 6, 2, hair); p(hx + 2, headTop - 1, 2, 1, hair); p(hx, headTop + 2, 1, 1, hair); p(hx + 5, headTop + 2, 1, 1, hair); break;
      case 'wild': p(hx - 1, headTop - 1, 8, 2, hair); p(hx - 1, headTop + 1, 1, 3, hair); p(hx + 6, headTop + 1, 1, 3, hairD); p(hx + 1, headTop + 1, 3, 1, hair); break;
      default: p(hx, headTop, 6, 2, hair); p(hx, headTop + 2, 1, 1, hair); p(hx + 5, headTop + 2, 1, 1, hairD);
    }
    if (L.beard) {
      p(hx, headTop + 4, 6, 2, hair); p(hx + 2, headTop + 4, 2, 1, skinD);
      p(hx + 1, headTop + 6, 4, L.beard === 'long' ? 3 : 1, hair);
    }
    if (L.kin === 'elf') { p(hx - 1, headTop + 2, 1, 2, skin); p(hx + 6, headTop + 2, 1, 2, skinD); }
  } else {
    const col = L.hairStyle === 'bald' ? skin : hair;
    p(hx, headTop, 6, 6, col);
    p(hx + 5, headTop, 1, 6, L.hairStyle === 'bald' ? skinD : hairD);
    if (L.hairStyle === 'long') p(hx - 1, headTop + 1, 8, 7, hair);
    if (L.hairStyle === 'bun') p(hx + 2, headTop - 1, 2, 1, hair);
    if (L.hairStyle === 'wild') p(hx - 1, headTop - 1, 8, 3, hair);
    if (L.kin === 'elf') { p(hx - 1, headTop + 2, 1, 2, skin); p(hx + 6, headTop + 2, 1, 2, skinD); }
  }

  // hats
  const hc = L.hatCol || L.cloak || '#3a3a3a';
  switch (L.hat) {
    case 'hood': {
      const hd = shade(hc, 0.65);
      p(hx - 1, headTop - 1, 8, 3, hc); p(hx + 2, headTop - 2, 2, 1, hc);
      p(hx - 1, headTop + 2, 1, 5, hc); p(hx + 6, headTop + 2, 1, 5, hd);
      if (back) p(hx, headTop + 2, 6, 5, hc);
      else if (L.shadowFace) {
        p(hx, headTop + 2, 6, 4, '#171210');
        p(hx + 1, headTop + 3, 1, 1, '#c9b27a'); p(hx + 4, headTop + 3, 1, 1, '#c9b27a');
      } else p(hx, headTop + 2, 6, 1, hd);
      break;
    }
    case 'wizard':
      p(hx - 2, headTop, 10, 1, hc); p(hx, headTop - 1, 6, 1, hc); p(hx + 1, headTop - 2, 4, 1, hc);
      p(hx + 1, headTop - 3, 3, 1, hc); p(hx + 2, headTop - 4, 2, 1, hc); p(hx + 3, headTop - 5, 1, 1, hc);
      p(hx + 2, headTop - 1, 1, 1, '#e8d27a');
      break;
    case 'cap':
      p(hx - 1, headTop - 1, 7, 2, hc); p(hx + 5, headTop - 3, 1, 3, '#ece4d4'); p(hx + 6, headTop - 4, 1, 2, '#c23a2a');
      break;
    case 'helm':
      p(hx, headTop - 1, 6, 3, '#8d9196'); p(hx + 1, headTop - 1, 2, 1, '#c3c7cc');
      if (!back) p(hx + 2, headTop + 2, 2, 2, '#7a7e84'); else p(hx, headTop + 2, 6, 2, '#8d9196');
      break;
    case 'kerchief':
      p(hx, headTop - 1, 6, 2, hc); if (back) p(hx + 2, headTop + 1, 2, 2, hc);
      break;
    case 'straw':
      p(hx - 2, headTop, 10, 1, '#c9a55a'); p(hx, headTop - 2, 6, 2, '#d9b86c'); p(hx, headTop - 1, 6, 1, '#7a4a22');
      break;
    case 'coif':
      p(hx - 1, headTop - 1, 8, 2, '#e8e2d2'); p(hx - 1, headTop + 1, 1, 5, '#e8e2d2'); p(hx + 6, headTop + 1, 1, 5, '#d0c8b4');
      if (back) p(hx, headTop + 1, 6, 5, '#e8e2d2');
      break;
    case 'feathercap':
      p(hx - 1, headTop - 1, 8, 2, hc); p(hx + 6, headTop - 4, 1, 4, '#3f7a4a'); p(hx + 7, headTop - 5, 1, 2, '#3f7a4a');
      break;
  }

  // weapons
  const wx = Math.min(11, bx + bw + 1);
  if (L.weapon === 'staff') { p(wx, headTop - 3, 1, BASE - headTop + 3 - (sit ? 4 : 0), '#6b4a2a'); p(wx, headTop - 4, 1, 1, '#7fd3ff'); }
  if (L.weapon === 'sword') {
    if (back) { p(5, bodyTop - 2, 1, bodyH + 3, '#9aa0a6'); p(4, bodyTop - 2, 3, 1, '#c9a64a'); }
    else { p(bx + bw - 1, bodyTop - 3, 1, 3, '#5a3a22'); p(bx + bw - 2, bodyTop - 1, 3, 1, '#c9a64a'); }
  }
  if (L.weapon === 'bow') {
    if (back) { p(bx + 1, bodyTop - 2, 1, bodyH + 4, '#7a5230'); p(bx + 2, bodyTop - 2, 1, 1, '#7a5230'); }
    else p(bx - 2, bodyTop - 1, 1, bodyH + 2, '#7a5230');
  }
  if (L.weapon === 'axe') {
    if (back) { p(6, bodyTop - 2, 1, bodyH + 2, '#6b4a2a'); p(4, bodyTop - 2, 2, 3, '#9aa0a6'); }
    else { p(bx + bw, bodyTop - 3, 1, 3, '#6b4a2a'); p(bx + bw, bodyTop - 4, 2, 2, '#9aa0a6'); }
  }
  if (L.holy && !back) { p(5, bodyTop + 2, 2, 1, '#e8d27a'); p(5, bodyTop + 1, 1, 3, '#e8d27a'); }

  outline(g);
  return c;
}

function outline(g) {
  const d = g.getImageData(0, 0, SW, SH);
  const a = d.data, out = new Uint8ClampedArray(a);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const i = (y * SW + x) * 4;
    if (a[i + 3]) continue;
    const solid = (xx, yy) => xx >= 0 && yy >= 0 && xx < SW && yy < SH && a[(yy * SW + xx) * 4 + 3] > 0;
    if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
      out[i] = 24; out[i + 1] = 15; out[i + 2] = 9; out[i + 3] = 235;
    }
  }
  g.putImageData(new ImageData(out, SW, SH), 0, 0);
}

// Head-and-shoulders portrait for the UI.
export function portrait(canvas, spr, scale = 4) {
  const g = canvas.getContext('2d');
  const src = spr.f[0];
  // find top-most opaque row to frame the head
  const d = src.getContext('2d').getImageData(0, 0, SW, SH).data;
  let top = 0;
  outer: for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) if (d[(y * SW + x) * 4 + 3]) { top = y; break outer; }
  const rows = Math.min(SH - top, Math.ceil(canvas.height / scale));
  canvas.width = SW * scale;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.drawImage(src, 0, top, SW, rows, 0, Math.max(0, canvas.height - rows * scale) / 2 | 0, SW * scale, rows * scale);
}
