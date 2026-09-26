// Drawing: a pre-painted room, y-sorted people and furniture, particles,
// a multiplied light map (hearth, candles, windows, lightning), then
// crisp speech bubbles on a hi-res overlay.
import { G } from './state.js';
import { TS, PW, PH, kind, tables, seats, fixtures, RUG } from './world.js';
import { SW } from './sprites.js';
import { earPos, hears } from './sim.js';
import { mulberry, hourOf, clamp, lerp } from './util.js';

let cv, ctx, lc, lg, ov, og, bg;
export const view = { scale: 1, dpr: 1, w: PW, h: PH };
const WINDOWS = [{ x: 50, y: 5, w: 28, h: 19 }, { x: 226, y: 5, w: 44, h: 19 }];
const STARS = (() => { const r = mulberry(99); return Array.from({ length: 30 }, () => [r(), r(), r()]); })();

export function initRender(scene, overlay) {
  cv = scene; ctx = cv.getContext('2d');
  cv.width = PW; cv.height = PH;
  ov = overlay; og = ov.getContext('2d');
  lc = document.createElement('canvas'); lc.width = PW; lc.height = PH; lg = lc.getContext('2d');
  bg = buildBG();
}

export function resize(cssW, cssH) {
  const s = Math.min(cssW / PW, cssH / PH);
  view.scale = s >= 2 ? Math.floor(s * 4) / 4 : s;
  view.dpr = Math.min(2, window.devicePixelRatio || 1);
  view.w = Math.round(PW * view.scale); view.h = Math.round(PH * view.scale);
  for (const c of [cv, ov]) { c.style.width = view.w + 'px'; c.style.height = view.h + 'px'; }
  ov.width = Math.round(view.w * view.dpr); ov.height = Math.round(view.h * view.dpr);
}

// ------------------------------------------------------------------ static room
function buildBG() {
  const c = document.createElement('canvas'); c.width = PW; c.height = PH;
  const g = c.getContext('2d');
  const r = mulberry(7);
  const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const noise = (x0, y0, w, h, n, cols) => { for (let i = 0; i < n; i++) px(x0 + Math.floor(r() * w), y0 + Math.floor(r() * h), 1, 1, cols[Math.floor(r() * cols.length)]); };

  // floorboards
  const plank = ['#6a4629', '#633f24', '#70492b', '#5e3c22', '#674428', '#6d472a'];
  for (let py = 2 * TS; py < 15 * TS; py += 8) {
    let x = TS - Math.floor(r() * 40);
    while (x < 25 * TS) {
      const w = 26 + Math.floor(r() * 50);
      const col = plank[Math.floor(r() * plank.length)];
      px(x, py, w, 8, col);
      px(x, py, w, 1, 'rgba(255,220,170,.07)');
      px(x, py + 7, w, 1, '#3a2313');
      px(x + w - 1, py, 1, 8, '#3a2313');
      for (let k = 0; k < 3; k++) { const gy = py + 2 + Math.floor(r() * 4), gx = x + Math.floor(r() * w); px(gx, gy, 4 + Math.floor(r() * 12), 1, 'rgba(40,20,5,.22)'); }
      if (r() < 0.3) { px(x + 2, py + 3, 1, 1, '#2e1b0e'); px(x + w - 3, py + 3, 1, 1, '#2e1b0e'); }
      if (r() < 0.12) { const kx = x + 4 + Math.floor(r() * Math.max(1, w - 8)); px(kx, py + 3, 2, 2, '#4a2c16'); px(kx, py + 3, 1, 1, '#3a2010'); }
      x += w;
    }
  }
  // worn path from door to bar
  for (let i = 0; i < 400; i++) { const t = r(); px(Math.floor(lerp(200, 340, t) + (r() - 0.5) * 30), Math.floor(lerp(230, 150, t) + (r() - 0.5) * 20), 2, 1, 'rgba(255,230,190,.05)'); }

  // back wall: timber and plaster
  px(0, 0, PW, 32, '#a38b64');
  noise(0, 0, PW, 32, 2200, ['#ad9570', '#98805b', '#b39d78', '#927a55']);
  px(0, 0, PW, 3, '#3b2717'); px(0, 3, PW, 1, '#57391f');
  px(0, 26, PW, 6, '#3b2717'); px(0, 26, PW, 1, '#5a3d24');
  for (let x = 16; x < PW; x += 48) { px(x, 0, 5, 32, '#3b2717'); px(x, 0, 1, 32, '#57391f'); }
  for (let x = 16; x < PW - 48; x += 96) { for (let i = 0; i < 22; i++) px(x + 5 + i * 2, 4 + i, 2, 1, '#3b2717'); }
  px(16, 32, 384, 4, 'rgba(0,0,0,.28)');

  // side and front walls
  px(0, 32, 16, 208, '#8f7a58'); noise(0, 32, 14, 208, 500, ['#9a8563', '#84704f']);
  for (let y = 40; y < 240; y += 40) px(0, y, 16, 4, '#3b2717');
  px(12, 32, 4, 208, '#3b2717'); px(16, 32, 3, 208, 'rgba(0,0,0,.25)');
  px(400, 32, 16, 208, '#8f7a58'); noise(402, 32, 14, 208, 500, ['#9a8563', '#84704f']);
  for (let y = 40; y < 240; y += 40) px(400, y, 16, 4, '#3b2717');
  px(400, 32, 4, 208, '#3b2717'); px(397, 32, 3, 208, 'rgba(0,0,0,.2)');
  px(0, 240, PW, 16, '#3b2717'); px(0, 240, PW, 2, '#5c3e25'); px(0, 238, PW, 2, 'rgba(0,0,0,.3)');
  px(192, 240, 32, 16, '#2a1a0f');

  // hearth
  px(126, 0, 68, 48, '#4a4640');
  for (let y = 0; y < 46; y += 6) {
    let x = 126 + ((y / 6) % 2 ? 5 : 0);
    while (x < 194) { const w = 7 + Math.floor(r() * 7); px(x + 1, y + 1, Math.min(w - 1, 194 - x - 1), 5, ['#7a756c', '#6d685f', '#847e73', '#6a6358'][Math.floor(r() * 4)]); px(x + 1, y + 1, Math.min(w - 1, 194 - x - 1), 1, 'rgba(255,255,255,.08)'); x += w; }
  }
  px(140, 18, 40, 28, '#150c07'); px(143, 16, 34, 2, '#150c07'); px(148, 14, 24, 2, '#150c07');
  px(138, 18, 2, 28, '#2a2520'); px(180, 18, 2, 28, '#2a2520');
  px(130, 10, 60, 4, '#3b2616'); px(130, 10, 60, 1, '#5a3a20'); px(130, 14, 60, 1, '#241509');
  px(136, 4, 4, 6, '#8a5a3a'); px(136, 4, 4, 1, '#a0704a');
  px(158, 5, 5, 5, '#d8d0bc'); px(159, 7, 1, 1, '#222'); px(161, 7, 1, 1, '#222'); px(159, 9, 3, 1, '#b8b0a0');
  px(176, 5, 2, 5, '#efe6cf'); px(182, 6, 2, 4, '#efe6cf'); px(175, 10, 10, 1, '#8a7a5a');
  px(128, 44, 64, 4, '#8a847a'); px(128, 44, 64, 1, '#a29c90');

  // windows (sill only; the glass is animated)
  for (const w of WINDOWS) { px(w.x - 3, w.y - 2, w.w + 6, w.h + 4, '#2b1a0f'); px(w.x - 4, w.y + w.h + 1, w.w + 8, 2, '#5a3d24'); }

  // decorations
  disc(g, 103, 13, 7, '#3b2717'); disc(g, 103, 13, 6, '#7a2a22'); disc(g, 103, 13, 2, '#c9a64a');
  px(97, 13, 13, 1, '#c9a64a'); px(103, 7, 1, 13, '#c9a64a');
  const ant = '#d8ccb0';
  px(210, 12, 12, 2, '#5a3a22'); px(214, 8, 4, 4, ant);
  px(208, 3, 1, 6, ant); px(209, 8, 5, 1, ant); px(210, 5, 1, 3, ant);
  px(223, 3, 1, 6, ant); px(218, 8, 5, 1, ant); px(221, 5, 1, 3, ant);
  px(273, 5, 26, 18, '#5a3a22'); px(274, 6, 24, 16, '#6a4527');
  px(276, 7, 8, 11, '#e0d4b4'); px(277, 9, 6, 1, '#3a2a1a'); px(278, 11, 4, 4, '#8a7a6a'); px(277, 16, 6, 1, '#6a5a4a');
  px(286, 8, 10, 8, '#d8caa4'); for (let i = 0; i < 4; i++) px(287, 10 + i * 2, 8 - (i % 2) * 3, 1, '#6a5a4a');
  px(279, 6, 2, 2, '#9a2a2a'); px(290, 7, 2, 2, '#9a2a2a');
  for (let i = 0; i < 3; i++) { px(26 + i * 5, 3, 1, 5, '#6a5a3a'); px(24 + i * 5, 8, 5, 6, ['#5a7a3a', '#7a6a3a', '#4a6a3a'][i]); px(25 + i * 5, 13, 3, 2, '#3a4a2a'); }

  // bar back wall: shelves, bottles, kitchen door
  px(304, 4, 96, 22, '#3a2718');
  for (const sy of [13, 24]) {
    px(304, sy, 48, 2, '#5a3d24'); px(368, sy, 32, 2, '#5a3d24');
    for (let x = 306; x < 398; x += 4 + Math.floor(r() * 3)) {
      if (x > 348 && x < 370) continue;
      const h = 4 + Math.floor(r() * 4), col = ['#2f5a3a', '#6b2a22', '#b08a3a', '#3a4a6a', '#d8d0bc', '#5a3a22'][Math.floor(r() * 6)];
      px(x, sy - h, 2, h, col); px(x, sy - h, 1, 1, 'rgba(255,255,255,.35)');
    }
  }
  px(352, 4, 16, 28, '#241509'); px(354, 6, 12, 26, '#5a3a22');
  for (let i = 0; i < 3; i++) px(357 + i * 3, 6, 1, 26, '#4a2f1b');
  px(354, 12, 12, 1, '#2a2a2a'); px(354, 24, 12, 1, '#2a2a2a'); px(363, 18, 2, 2, '#c9a64a');

  // stage
  px(32, 32, 48, 32, '#7d5a36');
  for (let x = 32; x < 80; x += 6) px(x, 32, 1, 32, '#5a3d22');
  px(32, 32, 48, 1, 'rgba(255,230,190,.12)'); px(32, 61, 48, 3, '#3b2616'); px(32, 64, 48, 2, 'rgba(0,0,0,.3)'); px(80, 32, 2, 34, 'rgba(0,0,0,.25)');

  // stairs up to the rooms
  for (let i = 0; i < 10; i++) {
    const y = 80 + i * 8;
    px(16, y, 32, 6, '#7a5836'); px(16, y, 32, 1, '#8a6a44'); px(16, y + 6, 32, 2, '#4a321e');
    px(16, y, 32, 8, `rgba(0,0,0,${(0.55 * (1 - i / 10)).toFixed(2)})`);
  }
  px(46, 76, 2, 88, '#3b2616'); for (let y = 80; y < 164; y += 16) px(45, y, 4, 3, '#2a190d');
  px(16, 76, 32, 5, '#0d0805');

  // rug
  px(RUG.x0 * TS, RUG.y0 * TS, 96, 48, '#6e2620');
  px(RUG.x0 * TS + 3, RUG.y0 * TS + 3, 90, 42, '#b88a3a'); px(RUG.x0 * TS + 5, RUG.y0 * TS + 5, 86, 38, '#7c2d24');
  for (let i = 0; i < 5; i++) diamond(g, RUG.x0 * TS + 16 + i * 16, RUG.y0 * TS + 24, 6, i % 2 ? '#2d3f5a' : '#b88a3a');
  for (let y = RUG.y0 * TS + 2; y < RUG.y0 * TS + 46; y += 3) { px(RUG.x0 * TS - 2, y, 2, 1, '#d8c9a0'); px(RUG.x1 * TS + 16, y, 2, 1, '#d8c9a0'); }
  noise(RUG.x0 * TS, RUG.y0 * TS, 96, 48, 300, ['rgba(0,0,0,.12)', 'rgba(255,255,255,.05)']);

  // flagstones behind the bar
  px(320, 32, 80, 96, '#5f5b54'); px(368, 128, 32, 16, '#5f5b54');
  for (let y = 32; y < 144; y += 12) {
    let x = 320 + Math.floor(r() * 8);
    while (x < 400) { const w = 12 + Math.floor(r() * 10); if (y >= 128 && x < 368) { x += w; continue; } px(x, y + 1, Math.min(w - 1, 400 - x), 10, ['#6d6a62', '#66625b', '#747068'][Math.floor(r() * 3)]); x += w; }
  }

  // kegs
  for (let y = 3; y <= 6; y++) {
    const bx = 384, by = y * TS;
    px(bx, by + 1, 15, 14, '#6b4424'); px(bx, by + 1, 15, 2, '#8a5a30'); px(bx + 3, by + 1, 1, 14, '#3a3a3a'); px(bx + 11, by + 1, 1, 14, '#3a3a3a');
    px(bx - 1, by + 3, 3, 10, '#8a5a30'); px(bx - 2, by + 7, 2, 2, '#c9a64a');
  }

  // chairs, stools, benches
  for (const s of seats) {
    const x = s.x * TS, y = s.y * TS;
    if (s.stool) {
      px(x + 3, y + 13, 10, 3, 'rgba(0,0,0,.3)');
      px(x + 4, y + 7, 8, 6, '#6a4528'); px(x + 4, y + 7, 8, 1, '#86603a'); px(x + 5, y + 13, 1, 2, '#3a2616'); px(x + 10, y + 13, 1, 2, '#3a2616');
    } else if (s.table && s.table.booth) {
      px(x + 1, y + 5, 14, 9, '#4a2f1b'); px(x + 2, y + 6, 12, 6, '#5a2a2a'); px(x + 1, y + 13, 14, 2, 'rgba(0,0,0,.3)');
    } else {
      px(x + 3, y + 13, 10, 2, 'rgba(0,0,0,.3)');
      px(x + 3, y + 7, 10, 6, '#5b3b23'); px(x + 3, y + 7, 10, 1, '#74502f');
      if (s.face === 'f' && !s.side) { px(x + 3, y + 2, 10, 2, '#4a2f1b'); px(x + 3, y + 2, 1, 6, '#4a2f1b'); px(x + 12, y + 2, 1, 6, '#4a2f1b'); }
      else if (s.face === 'b') { px(x + 3, y + 13, 10, 2, '#4a2f1b'); }
      else if (s.side === 'w') px(x + 2, y + 3, 2, 10, '#4a2f1b');
      else px(x + 12, y + 3, 2, 10, '#4a2f1b');
    }
  }
  for (const t of tables) px(t.x * TS + 1, t.y * TS + 13, t.w * TS - 2, 4, 'rgba(0,0,0,.32)');
  return c;
}
function disc(g, cx, cy, r, col) { g.fillStyle = col; for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(r * r - y * y)); g.fillRect(cx - w, cy + y, w * 2 + 1, 1); } }
function diamond(g, cx, cy, r, col) { g.fillStyle = col; for (let y = -r; y <= r; y++) { const w = r - Math.abs(y); g.fillRect(cx - w, cy + y, w * 2 + 1, 1); } }

// ------------------------------------------------------------------ sky & light
const KEYS = [ // hour, sky top, sky bottom, ambient rgb, daylight 0..1
  [0, '#070a18', '#10152a', [26, 26, 44], 0],
  [5, '#0b1024', '#1b1f3a', [30, 30, 48], 0],
  [6.5, '#4a4a7a', '#e0936a', [120, 105, 110], 0.4],
  [8, '#6f9ac8', '#c9d8e0', [205, 190, 170], 1],
  [16.5, '#6f9ac8', '#d8d2b8', [200, 185, 165], 1],
  [17.7, '#50558a', '#e88a4a', [150, 115, 100], 0.6],
  [18.7, '#252a55', '#8a4a5a', [75, 62, 78], 0.2],
  [19.8, '#0c1024', '#1c1a38', [30, 29, 48], 0],
  [24, '#070a18', '#10152a', [26, 26, 44], 0],
];
function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = (s) => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, t));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}
export function skyAt(h) {
  let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
  const a = KEYS[i], b = KEYS[i + 1], t = clamp((h - a[0]) / (b[0] - a[0]), 0, 1);
  const cloud = G.weather === 'clear' ? 1 : G.weather === 'rain' ? 0.75 : 0.6;
  return {
    top: mixHex(a[1], b[1], t), bot: mixHex(a[2], b[2], t),
    amb: a[3].map((v, k) => lerp(v, b[3][k], t) * (0.75 + 0.25 * cloud)),
    day: lerp(a[4], b[4], t) * cloud,
  };
}

// ------------------------------------------------------------------ frame
let T = 0;
export function draw(realDt) {
  T += realDt;
  const h = hourOf(G.t);
  const sky = skyAt(h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(bg, 0, 0);
  for (const w of WINDOWS) drawWindow(w, sky, h);
  drawFire();
  drawDoor(sky);
  for (const f of fixtures) if (f.type === 'sconce') drawSconce(f);

  // y-sorted world
  const list = [];
  for (const t of tables) list.push({ y: t.y * TS + 8, d: () => drawTable(t) });
  for (let y = 2; y <= 8; y++) list.push({ y: y * TS + 9, d: () => drawCounter(19, y) });
  for (let x = 20; x <= 22; x++) list.push({ y: 8 * TS + 9, d: () => drawCounter(x, 8) });
  for (const it of G.items) list.push({ y: it.y + 6, d: () => drawItem(it.kind, it.x, it.y) });
  for (const a of G.agents) if (a.present) list.push({ y: a.y + (a.sitting ? (a.seat && a.seat.face === 'b' ? 4 : -2) : 0), d: () => (a.kind === 'cat' ? drawCat(a) : drawAgent(a)) });
  list.sort((p, q) => p.y - q.y);
  for (const o of list) o.d();

  updateParticles(realDt);
  drawParticles(false);
  lighting(sky);
  drawParticles(true);
  drawIcons();
  drawOverlay();
}

function drawWindow(w, sky, h) {
  const gr = ctx.createLinearGradient(0, w.y, 0, w.y + w.h);
  gr.addColorStop(0, sky.top); gr.addColorStop(1, sky.bot);
  ctx.fillStyle = gr; ctx.fillRect(w.x, w.y, w.w, w.h);
  const night = h >= 19.5 || h < 6;
  if (night && G.weather === 'clear') {
    for (const [sx, sy, tw] of STARS) {
      const a = 0.4 + 0.6 * Math.abs(Math.sin(T * (0.5 + tw) + tw * 9));
      ctx.fillStyle = `rgba(230,230,255,${a.toFixed(2)})`;
      ctx.fillRect(w.x + Math.floor(sx * w.w), w.y + Math.floor(sy * w.h * 0.8), 1, 1);
    }
    if (w.w > 30) { disc(ctx, w.x + 32, w.y + 6, 3, '#e8e4cc'); ctx.fillStyle = sky.top; ctx.fillRect(w.x + 33, w.y + 3, 3, 3); }
  }
  if (G.weather !== 'clear' && !G.reduced) {
    ctx.fillStyle = 'rgba(170,190,215,.5)';
    const n = G.weather === 'storm' ? 16 : 10;
    for (let i = 0; i < n; i++) {
      const x = w.x + ((i * 37 + T * 26) % w.w), y = w.y + ((i * 53 + T * 90) % w.h);
      ctx.fillRect(Math.floor(x), Math.floor(y), 1, 3);
    }
  } else if (G.weather !== 'clear') {
    ctx.fillStyle = 'rgba(170,190,215,.25)'; ctx.fillRect(w.x, w.y, w.w, w.h);
  }
  if (G.flash > 0) { ctx.fillStyle = `rgba(235,240,255,${(G.flash * 0.9).toFixed(2)})`; ctx.fillRect(w.x, w.y, w.w, w.h); }
  ctx.fillStyle = '#2b1a0f';
  const mx = w.x + Math.floor(w.w / 2);
  ctx.fillRect(mx - 1, w.y, 2, w.h); ctx.fillRect(w.x, w.y + Math.floor(w.h / 2), w.w, 1);
  if (w.w > 30) { ctx.fillRect(w.x + Math.floor(w.w / 4), w.y, 1, w.h); ctx.fillRect(w.x + Math.floor((3 * w.w) / 4), w.y, 1, w.h); }
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  for (let i = 0; i < 5; i++) ctx.fillRect(w.x + 3 + i, w.y + 8 - i, 1, 1);
}

function drawFire() {
  const f = G.fire, x0 = 142, x1 = 178, yb = 43, sp = G.reduced ? 0.35 : 1;
  ctx.fillStyle = '#2a170b'; ctx.fillRect(146, 40, 28, 3); ctx.fillRect(151, 38, 18, 2);
  for (let x = x0; x < x1; x++) {
    const u = (x - x0) / (x1 - x0);
    const env = Math.pow(Math.sin(Math.PI * u), 0.7);
    const n = 0.5 + 0.25 * Math.sin(x * 0.9 + T * 9 * sp) + 0.25 * Math.sin(x * 0.37 - T * 5.3 * sp + Math.sin(T * 2 * sp));
    const hgt = Math.max(0, Math.floor((4 + 20 * f) * env * n));
    for (let y = 0; y < hgt; y++) {
      const q = y / Math.max(1, hgt);
      ctx.fillStyle = q < 0.2 ? '#fff0b0' : q < 0.45 ? '#ffc040' : q < 0.75 ? '#f26a18' : '#b3280c';
      ctx.fillRect(x, yb - y, 1, 1);
    }
  }
  ctx.fillStyle = '#ff6a1a';
  for (let i = 0; i < 6; i++) ctx.fillRect(147 + ((i * 7 + Math.floor(T * 3 * sp)) % 25), 42, 1, 1);
}

function drawDoor(sky) {
  const open = G.agents.some((a) => a.present && a.kind === 'person' && a.ty >= 14 && a.tx >= 11 && a.tx <= 14);
  if (open) {
    ctx.fillStyle = sky.day > 0.3 ? sky.bot : '#0b0f1a'; ctx.fillRect(193, 241, 30, 15);
    if (G.weather !== 'clear') { ctx.fillStyle = 'rgba(170,190,215,.6)'; for (let i = 0; i < 6; i++) ctx.fillRect(195 + ((i * 11 + T * 30) % 26), 242 + ((i * 7 + T * 80) % 12), 1, 3); }
    ctx.fillStyle = '#5a3a22'; ctx.fillRect(193, 226, 4, 16); ctx.fillStyle = '#3a2616'; ctx.fillRect(196, 226, 1, 16);
  } else {
    ctx.fillStyle = '#4e321c'; ctx.fillRect(193, 241, 30, 15);
    ctx.fillStyle = '#3a2414'; for (let x = 197; x < 222; x += 5) ctx.fillRect(x, 241, 1, 15);
    ctx.fillStyle = '#262626'; ctx.fillRect(193, 244, 30, 1); ctx.fillRect(193, 251, 30, 1);
    ctx.fillStyle = '#c9a64a'; ctx.fillRect(218, 247, 2, 2);
  }
}

function flame(x, y, big = false) {
  const fl = G.reduced ? 0 : Math.sin(T * 13 + x) > 0.3 ? 1 : 0;
  ctx.fillStyle = '#ffb030'; ctx.fillRect(x, y - 2 - fl, 1, 2 + fl);
  ctx.fillStyle = '#fff4c0'; ctx.fillRect(x, y - 1, 1, 1);
  if (big) { ctx.fillStyle = '#ff8a20'; ctx.fillRect(x - 1, y - 1, 3, 1); }
}
function drawSconce(f) {
  ctx.fillStyle = '#2a2a2a'; ctx.fillRect(f.x - 2, f.y + 2, 4, 2); ctx.fillRect(f.x - 1, f.y + 4, 2, 2);
  ctx.fillStyle = '#efe6cf'; ctx.fillRect(f.x - 1, f.y - 1, 2, 3);
  if (f.lit) flame(f.x, f.y - 1);
}

function drawItem(k, x, y) {
  switch (k) {
    case 'ale': case 'empty':
      ctx.fillStyle = '#7a5a36'; ctx.fillRect(x - 2, y - 3, 4, 5); ctx.fillStyle = '#5a3f22'; ctx.fillRect(x + 1, y - 3, 1, 5); ctx.fillRect(x + 2, y - 2, 1, 2);
      if (k === 'ale') { ctx.fillStyle = '#f0e2b8'; ctx.fillRect(x - 2, y - 4, 4, 1); }
      break;
    case 'wine': ctx.fillStyle = '#c8c0b0'; ctx.fillRect(x - 1, y - 4, 3, 3); ctx.fillRect(x, y - 1, 1, 2); ctx.fillRect(x - 1, y + 1, 3, 1); ctx.fillStyle = '#7a1a2a'; ctx.fillRect(x - 1, y - 3, 3, 2); break;
    case 'stew': ctx.fillStyle = '#8a5a30'; ctx.fillRect(x - 3, y - 2, 6, 3); ctx.fillStyle = '#b86a2a'; ctx.fillRect(x - 2, y - 2, 4, 1); ctx.fillStyle = '#e0d8c8'; ctx.fillRect(x + 2, y - 4, 1, 3); break;
    case 'purse': ctx.fillStyle = '#6b4424'; ctx.fillRect(x - 2, y - 3, 5, 4); ctx.fillStyle = '#4a2f1b'; ctx.fillRect(x - 1, y - 4, 3, 1); ctx.fillStyle = '#e8c45a'; ctx.fillRect(x, y - 2, 1, 1); break;
    case 'relic': {
      const tw = Math.sin(T * 4) > 0.6;
      ctx.fillStyle = '#c9a64a'; ctx.fillRect(x - 2, y - 1, 5, 2); ctx.fillStyle = '#7fd3ff'; ctx.fillRect(x - 1, y - 3, 3, 3); ctx.fillStyle = '#e8f8ff'; ctx.fillRect(x, y - 3, 1, 1);
      if (tw) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 3, y - 6, 1, 3); ctx.fillRect(x + 2, y - 5, 3, 1); }
      break;
    }
    case 'dice': ctx.fillStyle = '#efe6cf'; ctx.fillRect(x - 3, y - 1, 2, 2); ctx.fillRect(x + 1, y, 2, 2); ctx.fillStyle = '#222'; ctx.fillRect(x - 3, y - 1, 1, 1); ctx.fillRect(x + 2, y + 1, 1, 1); break;
    case 'log': ctx.fillStyle = '#5a3a1a'; ctx.fillRect(x - 4, y - 2, 8, 3); ctx.fillStyle = '#c8a070'; ctx.fillRect(x + 3, y - 2, 1, 3); break;
    case 'taper': ctx.fillStyle = '#efe6cf'; ctx.fillRect(x, y - 5, 1, 5); flame(x, y - 5); break;
    case 'broom': ctx.fillStyle = '#7a5a30'; ctx.fillRect(x - 6, y - 10, 1, 10); ctx.fillStyle = '#c9a55a'; ctx.fillRect(x - 8, y, 5, 2); break;
    case 'lute': ctx.fillStyle = '#a0682c'; ctx.fillRect(x - 3, y - 2, 5, 4); ctx.fillStyle = '#3a2616'; ctx.fillRect(x - 1, y - 1, 1, 1); ctx.fillStyle = '#7a4a1a'; ctx.fillRect(x + 2, y - 5, 1, 4); break;
  }
}

function drawTable(t) {
  const x = t.x * TS, y = t.y * TS, w = t.w * TS;
  ctx.fillStyle = '#2e1d10'; ctx.fillRect(x + 2, y + 11, 2, 5); ctx.fillRect(x + w - 4, y + 11, 2, 5);
  ctx.fillStyle = '#4a2f1a'; ctx.fillRect(x + 1, y + 10, w - 2, 3);
  ctx.fillStyle = t.booth ? '#6a4527' : '#7a5431'; ctx.fillRect(x + 1, y, w - 2, 10);
  ctx.fillStyle = '#8c6239'; ctx.fillRect(x + 1, y, w - 2, 1);
  ctx.fillStyle = 'rgba(40,20,5,.25)'; ctx.fillRect(x + 4, y + 3, w - 12, 1); ctx.fillRect(x + 8, y + 6, w - 14, 1);
  const c = t.candle;
  ctx.fillStyle = '#b8a47a'; ctx.fillRect(c.x - 2, c.y + 2, 4, 1);
  ctx.fillStyle = '#efe6cf'; ctx.fillRect(c.x - 1, c.y - 1, 2, 3);
  if (c.lit) flame(c.x, c.y - 1);
  for (const s of t.seats) if (s.mug) drawItem(s.mug.level > 0.02 ? s.mug.kind : 'empty', s.item[0], s.item[1]);
  t.extra.forEach((e, i) => drawItem(e, x + 5 + i * 6, y + 6));
}

function drawCounter(tx, ty) {
  const x = tx * TS, y = ty * TS;
  if (ty < 8) {
    ctx.fillStyle = '#6a4527'; ctx.fillRect(x + 1, y, 14, 16);
    ctx.fillStyle = '#8a5e36'; ctx.fillRect(x + 1, y, 1, 16);
    ctx.fillStyle = '#4a2f1b'; ctx.fillRect(x + 14, y, 1, 16);
    ctx.fillStyle = 'rgba(40,20,5,.3)'; ctx.fillRect(x + 5, y + 3, 1, 10);
  } else {
    ctx.fillStyle = '#6a4527'; ctx.fillRect(x + (tx === 19 ? 1 : 0), y - 2, tx === 19 ? 15 : 16, 12);
    ctx.fillStyle = '#8a5e36'; ctx.fillRect(x, y + 9, 16, 1);
    ctx.fillStyle = '#3d2616'; ctx.fillRect(x + (tx === 19 ? 1 : 0), y + 10, tx === 19 ? 15 : 16, 6);
    ctx.fillStyle = '#2a190d'; ctx.fillRect(x + 7, y + 11, 1, 4);
  }
  for (const s of seats) if (s.bar && s.mug && Math.floor(s.item[0] / TS) === tx && Math.floor(s.item[1] / TS) === ty) drawItem(s.mug.level > 0.02 ? s.mug.kind : 'empty', s.item[0], s.item[1]);
  for (const f of fixtures) if (f.type === 'lantern' && Math.floor(f.x / TS) === tx && Math.floor(f.y / TS) === ty) {
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(f.x - 2, f.y - 3, 5, 6); ctx.fillStyle = f.lit ? '#ffcf70' : '#6a6050'; ctx.fillRect(f.x - 1, f.y - 2, 3, 4);
    if (f.lit) flame(f.x, f.y);
  }
}

function drawAgent(a) {
  const spr = a.spr;
  const moving = !!a.path;
  let img;
  if (a.sitting) img = a.facing === 'b' ? spr.bs : spr.fs;
  else img = (a.facing === 'b' ? spr.b : spr.f)[moving ? 1 + (Math.floor(a.walkPhase) % 2) : 0];
  let dx = a.x - SW / 2, dy = a.y - 24;
  if (a.sitting) dy += a.facing === 'b' ? -1 : 1;
  if (a.sick) dy += 2;
  if (moving && Math.floor(a.walkPhase) % 2) dy -= 1;
  if (a.dance && !G.reduced) { dy -= Math.abs(Math.sin(T * 7 + a.id)) * 2; dx += Math.sin(T * 3.5 + a.id) * 1.5; }
  if (a.shake && !G.reduced) { dx += Math.round(Math.sin(T * 40 + a.id) * 1.5); }
  if (a.drunk > 0.6 && moving && !G.reduced) dx += Math.sin(T * 4 + a.id) * 1.5;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.fillRect(a.x - 4, a.y - 1, 8, 2); ctx.fillRect(a.x - 3, a.y + 1, 6, 1);
  if (G.sel === a) { ctx.fillStyle = '#e8c45a'; ctx.fillRect(a.x - 5, a.y + 1, 10, 1); ctx.fillRect(a.x - 6, a.y, 1, 1); ctx.fillRect(a.x + 5, a.y, 1, 1); }
  let alpha = 1;
  if (kind[a.ty] && kind[a.ty][a.tx] === 'stairs') alpha = clamp((a.y - 80) / 90, 0.15, 1);
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.drawImage(img, Math.round(dx), Math.round(dy));
  if (a.carry) drawItem(a.carry === 'empty' ? 'empty' : a.carry, Math.round(a.x + 6), Math.round(a.y - (a.sitting ? 8 : 10)));
  ctx.globalAlpha = 1;
}

function drawCat(a) {
  const x = Math.round(a.x), y = Math.round(a.y) - 1, c = a.catCol, d = '#1b120c';
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x - 4, y, 8, 2);
  ctx.fillStyle = c;
  if (a.pose === 'sleep') {
    ctx.fillRect(x - 4, y - 3, 8, 3); ctx.fillRect(x - 3, y - 4, 6, 1); ctx.fillRect(x + 3, y - 2, 2, 2);
    ctx.fillStyle = d; ctx.fillRect(x - 4, y - 1, 1, 1);
  } else if (a.pose === 'sit' || !a.path) {
    ctx.fillRect(x - 2, y - 5, 4, 5); ctx.fillRect(x - 2, y - 8, 4, 3); ctx.fillRect(x - 2, y - 9, 1, 1); ctx.fillRect(x + 1, y - 9, 1, 1);
    const tw = G.reduced ? 0 : Math.round(Math.sin(T * 2 + a.id) * 1);
    ctx.fillRect(x + 2, y - 2 + tw, 3, 1);
    ctx.fillStyle = '#d8e070'; ctx.fillRect(x - 1, y - 7, 1, 1); ctx.fillRect(x + 1, y - 7, 1, 1);
  } else {
    const st = Math.floor(a.walkPhase) % 2;
    const dir = a.path && a.path[a.pathI] && a.path[a.pathI][0] * TS + 8 < a.x ? -1 : 1;
    ctx.fillRect(x - 3, y - 4, 6, 3); ctx.fillRect(x + dir * 3 - (dir < 0 ? 2 : 0), y - 6, 3, 3);
    ctx.fillRect(x - 3 + st, y - 1, 1, 1); ctx.fillRect(x + 2 - st, y - 1, 1, 1);
    ctx.fillRect(x - dir * 4 - (dir > 0 ? 1 : 0), y - 6, 1, 3);
  }
}

// ------------------------------------------------------------------ particles
function updateParticles(dt) {
  const ps = G.particles;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.life += dt;
    if (p.life >= p.max) { ps.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 'coin') p.vy += 30 * dt;
    if (p.kind === 'spark') p.vx += Math.sin(p.life * 8 + i) * 12 * dt;
    if (p.kind === 'smoke' || p.kind === 'steam') p.vx += Math.sin(p.life * 3 + i) * 3 * dt;
  }
  if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 2.5);
}
const UNLIT = { note: 1, heart: 1, coin: 1, spark: 1, poison: 1 };
function drawParticles(lit) {
  for (const p of G.particles) {
    if (!!UNLIT[p.kind] !== lit) continue;
    const k = 1 - p.life / p.max, x = Math.round(p.x), y = Math.round(p.y);
    switch (p.kind) {
      case 'spark': ctx.fillStyle = k > 0.5 ? '#ffe08a' : '#ff7a2a'; ctx.globalAlpha = k; ctx.fillRect(x, y, 1, 1); break;
      case 'smoke': ctx.fillStyle = `rgba(180,175,170,${(0.35 * k).toFixed(2)})`; ctx.fillRect(x, y, 2, 2); break;
      case 'steam': ctx.fillStyle = `rgba(230,230,230,${(0.35 * k).toFixed(2)})`; ctx.fillRect(x, y, 1, 2); break;
      case 'dust': ctx.fillStyle = `rgba(190,160,120,${(0.5 * k).toFixed(2)})`; ctx.fillRect(x, y, 1, 1); break;
      case 'drip': ctx.fillStyle = `rgba(160,190,230,${(0.8 * k).toFixed(2)})`; ctx.fillRect(x, y, 1, 2); break;
      case 'coin': ctx.globalAlpha = Math.min(1, k * 2); ctx.fillStyle = '#e8c45a'; ctx.fillRect(x - 1, y - 1, 3, 3); ctx.fillStyle = '#fff2b0'; ctx.fillRect(x - 1, y - 1, 1, 1); break;
      case 'note':
        ctx.globalAlpha = Math.min(1, k * 1.5); ctx.fillStyle = '#f3e6c4';
        ctx.fillRect(x, y, 2, 2); ctx.fillRect(x + 1, y - 4, 1, 4); ctx.fillRect(x + 2, y - 4, 1, 1); ctx.fillRect(x + 3, y - 3, 1, 1);
        break;
      case 'heart':
        ctx.globalAlpha = Math.min(1, k * 1.5); ctx.fillStyle = '#e8506a';
        ctx.fillRect(x - 2, y, 2, 2); ctx.fillRect(x + 1, y, 2, 2); ctx.fillRect(x - 2, y + 1, 5, 2); ctx.fillRect(x - 1, y + 3, 3, 1); ctx.fillRect(x, y + 4, 1, 1);
        break;
      case 'poison': ctx.fillStyle = `rgba(120,230,110,${(0.7 * k).toFixed(2)})`; ctx.fillRect(x, y, 1, 1); break;
    }
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ lighting
function light(x, y, r, col, i) {
  const gr = lg.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(${col},${i.toFixed(3)})`);
  gr.addColorStop(0.55, `rgba(${col},${(i * 0.35).toFixed(3)})`);
  gr.addColorStop(1, `rgba(${col},0)`);
  lg.fillStyle = gr;
  lg.fillRect(x - r, y - r, r * 2, r * 2);
}
function lighting(sky) {
  const fl = G.reduced ? 0.3 : 1;
  const [r, g, b] = sky.amb;
  lg.globalCompositeOperation = 'source-over';
  lg.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
  lg.fillRect(0, 0, PW, PH);
  lg.globalCompositeOperation = 'lighter';
  // daylight through the windows
  if (sky.day > 0.02) {
    for (const w of WINDOWS) {
      lg.fillStyle = `rgba(255,236,196,${(0.28 * sky.day).toFixed(3)})`;
      lg.beginPath();
      lg.moveTo(w.x, w.y + w.h); lg.lineTo(w.x + w.w, w.y + w.h);
      lg.lineTo(w.x + w.w + 40, w.y + w.h + 90); lg.lineTo(w.x + 30, w.y + w.h + 90);
      lg.closePath(); lg.fill();
      light(w.x + w.w / 2, w.y + 10, 40, '255,240,210', 0.5 * sky.day);
    }
  } else if (G.weather === 'clear') {
    const w = WINDOWS[1];
    lg.fillStyle = 'rgba(90,110,170,.12)';
    lg.beginPath(); lg.moveTo(w.x, w.y + w.h); lg.lineTo(w.x + w.w, w.y + w.h); lg.lineTo(w.x + w.w + 30, w.y + w.h + 70); lg.lineTo(w.x + 20, w.y + w.h + 70); lg.closePath(); lg.fill();
  }
  // hearth
  const flick = 1 + fl * (0.06 * Math.sin(T * 11) + 0.04 * Math.sin(T * 17.3) + 0.03 * Math.sin(T * 5.1));
  light(160, 40, (120 + 70 * G.fire) * flick, '255,140,60', Math.min(1, 0.55 + 0.45 * G.fire));
  light(160, 36, 36 * flick, '255,190,100', 0.7 * G.fire);
  // candles, sconces, lanterns
  for (const f of fixtures) {
    if (!f.lit) continue;
    const ff = 1 + fl * 0.08 * Math.sin(T * 13 + f.x * 0.7);
    if (f.type === 'candle') light(f.x, f.y, 44 * ff, '255,176,96', 0.8);
    else if (f.type === 'sconce') light(f.x + (f.x < 100 ? 6 : -6), f.y, 52 * ff, '255,170,90', 0.75);
    else light(f.x, f.y, 60 * ff, '255,196,120', 0.85);
  }
  // door opening
  if (G.agents.some((a) => a.present && a.kind === 'person' && a.ty >= 14 && a.tx >= 11 && a.tx <= 14)) {
    light(208, 250, 46, sky.day > 0.3 ? '255,240,210' : '80,100,150', 0.5);
  }
  // lightning
  if (G.flash > 0) { lg.fillStyle = `rgba(200,210,255,${(G.flash * 0.55).toFixed(3)})`; lg.fillRect(0, 0, PW, PH); }

  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(lc, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  const glow = (x, y, rr, a) => { const gr = ctx.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, `rgba(255,170,80,${a})`); gr.addColorStop(1, 'rgba(255,170,80,0)'); ctx.fillStyle = gr; ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2); };
  glow(160, 36, 30, (0.22 * G.fire).toFixed(3));
  for (const f of fixtures) if (f.lit) glow(f.x, f.y - 2, 7, 0.35);
  ctx.globalCompositeOperation = 'source-over';
  // vignette
  const v = ctx.createRadialGradient(PW / 2, PH / 2, PH * 0.45, PW / 2, PH / 2, PW * 0.62);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(8,4,2,.45)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, PW, PH);
}

// ------------------------------------------------------------------ icons over heads (unlit)
function drawIcons() {
  for (const a of G.agents) {
    if (!a.present) continue;
    const hy = Math.round(a.y - (a.kind === 'cat' ? 12 : a.sitting ? 25 : 28)), x = Math.round(a.x);
    if (a.hand) {
      ctx.fillStyle = '#f3e6c4'; ctx.fillRect(x - 4, hy - 7, 9, 8); ctx.fillRect(x - 1, hy + 1, 2, 1);
      ctx.fillStyle = '#3a2616'; ctx.fillRect(x - 4, hy - 7, 9, 1);
      drawItem(a.hand === 'stew' ? 'stew' : 'ale', x, hy - 1);
    }
    if ((a.sick || (a.kind === 'cat' && a.pose === 'sleep')) && !G.reduced) {
      const k = (T * 0.8 + a.id * 0.3) % 1;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = a.sick ? '#9ae07a' : '#f3e6c4';
      const zx = x + 4 + Math.round(k * 4), zy = hy + 6 - Math.round(k * 8);
      ctx.fillRect(zx, zy, 3, 1); ctx.fillRect(zx + 1, zy + 1, 1, 1); ctx.fillRect(zx, zy + 2, 3, 1);
      ctx.globalAlpha = 1;
    }
    if (G.sel === a) {
      const bob = G.reduced ? 0 : Math.round(Math.sin(T * 4) * 1);
      ctx.fillStyle = '#e8c45a';
      ctx.fillRect(x - 2, hy - 3 + bob, 5, 1); ctx.fillRect(x - 1, hy - 2 + bob, 3, 1); ctx.fillRect(x, hy - 1 + bob, 1, 1);
    }
  }
}

// ------------------------------------------------------------------ overlay: bubbles, labels
function wrap(text, maxW) {
  const words = text.split(' '), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (og.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}
function rrect(x, y, w, h, r) {
  og.beginPath();
  og.moveTo(x + r, y); og.lineTo(x + w - r, y); og.quadraticCurveTo(x + w, y, x + w, y + r);
  og.lineTo(x + w, y + h - r); og.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  og.lineTo(x + r, y + h); og.quadraticCurveTo(x, y + h, x, y + h - r);
  og.lineTo(x, y + r); og.quadraticCurveTo(x, y, x + r, y); og.closePath();
}
function drawOverlay() {
  const k = view.scale * view.dpr, d = view.dpr;
  og.clearRect(0, 0, ov.width, ov.height);
  const e = earPos();
  if (e) {
    og.save();
    og.strokeStyle = 'rgba(232,196,90,.45)'; og.lineWidth = 1.5 * d;
    og.setLineDash([4 * d, 6 * d]);
    og.beginPath(); og.arc(e.x * k, e.y * k, 3.6 * TS * k, 0, Math.PI * 2); og.stroke();
    og.restore();
    if (!G.sel) {
      og.font = `${16 * d}px serif`; og.textAlign = 'center'; og.textBaseline = 'middle';
      og.fillStyle = 'rgba(232,196,90,.9)'; og.fillText('👂', e.x * k, e.y * k);
    }
  }
  const now = performance.now();
  const fs = Math.max(11, Math.min(14, 12 * view.scale / 2.2)) * d;
  const items = [];
  for (const a of G.agents) {
    const b = a.bubble;
    if (!a.present || !b) continue;
    if (now > b.until) { a.bubble = null; continue; }
    const heard = b.loud || hears(a, b.whisper ? 2.6 : 3.6);
    const text = heard ? b.text : b.whisper ? '(whispering)' : '···';
    items.push({ a, text, heard, whisper: b.whisper, loud: b.loud, ax: a.x * k, ay: (a.y - (a.sitting ? 24 : 28)) * k });
  }
  items.sort((p, q) => (p.heard === q.heard ? q.ay - p.ay : p.heard ? 1 : -1));
  const placed = [];
  for (const it of items) {
    og.font = `${it.whisper ? 'italic ' : ''}${it.heard ? fs : fs * 0.9}px "IM Fell English", Georgia, serif`;
    const lines = it.heard ? wrap(it.text, 170 * d) : [it.text];
    const lh = fs * 1.2;
    const w = Math.max(...lines.map((l) => og.measureText(l).width)) + 12 * d;
    const h = lines.length * lh + 8 * d;
    let x = clamp(it.ax - w / 2, 2 * d, ov.width - w - 2 * d), y = it.ay - h - 6 * d;
    for (let n = 0; n < 12; n++) {
      const hit = placed.find((p) => x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y);
      if (!hit) break;
      y = hit.y - h - 3 * d;
    }
    y = Math.max(2 * d, y);
    placed.push({ x, y, w, h });
    og.globalAlpha = it.heard ? 0.96 : 0.5;
    og.fillStyle = it.whisper ? '#e2d6f0' : it.loud ? '#fff4d6' : '#f3e6c4';
    og.strokeStyle = it.whisper ? '#4a3a6a' : '#3a2616'; og.lineWidth = (it.loud ? 2 : 1.2) * d;
    rrect(x, y, w, h, 5 * d); og.fill(); og.stroke();
    const tx = clamp(it.ax, x + 6 * d, x + w - 6 * d);
    if (y + h < it.ay) {
      og.beginPath(); og.moveTo(tx - 4 * d, y + h - 0.5); og.lineTo(tx, Math.min(it.ay, y + h + 6 * d)); og.lineTo(tx + 4 * d, y + h - 0.5); og.closePath(); og.fill();
      og.beginPath(); og.moveTo(tx - 4 * d, y + h); og.lineTo(tx, Math.min(it.ay, y + h + 6 * d)); og.lineTo(tx + 4 * d, y + h); og.stroke();
    }
    og.fillStyle = it.whisper ? '#3a2a5a' : '#2a1a0e';
    og.textAlign = 'left'; og.textBaseline = 'top';
    lines.forEach((l, i) => og.fillText(l, x + 6 * d, y + 4 * d + i * lh));
    og.globalAlpha = 1;
  }
  // hover label
  const hv = G.hover;
  if (hv && hv.present && hv !== G.sel) {
    og.font = `${fs}px "IM Fell English SC", Georgia, serif`;
    const t = hv.name, w = og.measureText(t).width + 10 * d;
    const x = hv.x * k - w / 2, y = (hv.y + 3) * k;
    og.fillStyle = 'rgba(20,12,6,.85)'; rrect(x, y, w, fs + 6 * d, 4 * d); og.fill();
    og.fillStyle = '#f3e6c4'; og.textAlign = 'center'; og.textBaseline = 'top'; og.fillText(t, hv.x * k, y + 3 * d);
  }
}

// ------------------------------------------------------------------ picking
export function pick(cssX, cssY) {
  const wx = cssX / view.scale, wy = cssY / view.scale;
  let best = null, bd = Infinity;
  for (const a of G.agents) {
    if (!a.present) continue;
    const top = a.kind === 'cat' ? 10 : a.sitting ? 18 : 22;
    if (wx < a.x - 7 || wx > a.x + 7 || wy < a.y - top || wy > a.y + 3) continue;
    const dd = Math.abs(wx - a.x) + Math.abs(wy - (a.y - top / 2)) * 0.5 - a.y * 0.01;
    if (dd < bd) { bd = dd; best = a; }
  }
  return { agent: best, x: wx, y: wy };
}
