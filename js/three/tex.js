// Procedural canvas textures: planks, plaster, stone, rug, flame and glow.
import * as THREE from '../../vendor/three.module.min.js';
import { mulberry } from '../util.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function toTex(c, repeat = [1, 1], srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const hsl = (h, s, l) => `hsl(${h},${s}%,${l}%)`;

export function planks(seed = 1, base = [26, 38, 24]) {
  const [c, g] = canvas(512, 512);
  const r = mulberry(seed);
  const rows = 8, rh = 512 / rows;
  for (let i = 0; i < rows; i++) {
    let x = -Math.floor(r() * 200);
    while (x < 512) {
      const w = 140 + Math.floor(r() * 220);
      const l = base[2] + (r() - 0.5) * 7;
      g.fillStyle = hsl(base[0] + (r() - 0.5) * 6, base[1], l);
      g.fillRect(x, i * rh, w, rh);
      // grain
      for (let k = 0; k < 26; k++) {
        const y = i * rh + 3 + r() * (rh - 6);
        g.strokeStyle = `rgba(${r() < 0.5 ? '30,15,5' : '255,220,170'},${0.05 + r() * 0.08})`;
        g.lineWidth = 1 + r() * 1.5;
        g.beginPath(); g.moveTo(x, y);
        for (let s = 0; s <= w; s += 20) g.lineTo(x + s, y + Math.sin((s + k * 30) * 0.02) * 2);
        g.stroke();
      }
      if (r() < 0.35) { g.fillStyle = 'rgba(40,20,8,.5)'; g.beginPath(); g.ellipse(x + r() * w, i * rh + rh / 2, 6, 3, 0, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(20,10,4,.8)'; g.fillRect(x + w - 2, i * rh, 2, rh);
      g.fillStyle = '#1a0d05';
      g.fillRect(x + 6, i * rh + 8, 3, 3); g.fillRect(x + 6, i * rh + rh - 11, 3, 3);
      x += w;
    }
    g.fillStyle = 'rgba(15,8,3,.9)'; g.fillRect(0, i * rh + rh - 3, 512, 3);
  }
  return c;
}

export function plaster(seed = 2) {
  const [c, g] = canvas(256, 256);
  const r = mulberry(seed);
  g.fillStyle = '#c8b99c'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) {
    const x = r() * 256, y = r() * 256, rad = 10 + r() * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const d = r() < 0.5;
    gr.addColorStop(0, d ? 'rgba(90,70,40,.06)' : 'rgba(255,245,220,.07)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const id = g.getImageData(0, 0, 256, 256), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(id, 0, 0);
  return c;
}

export function stone(seed = 3, light = 1) {
  const [c, g] = canvas(256, 256);
  const r = mulberry(seed);
  g.fillStyle = '#3e3a34'; g.fillRect(0, 0, 256, 256);
  const rh = 32;
  for (let row = 0; row < 8; row++) {
    let x = row % 2 ? -20 : 0;
    while (x < 256) {
      const w = 36 + Math.floor(r() * 36);
      const l = (38 + r() * 14) * light;
      g.fillStyle = hsl(30 + r() * 10, 6 + r() * 6, l);
      g.beginPath();
      g.roundRect(x + 2, row * rh + 2, w - 4, rh - 4, 5);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x + 4, row * rh + 3, w - 8, 3);
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + 4, row * rh + rh - 7, w - 8, 3);
      x += w;
    }
  }
  return c;
}

export function flagstone(seed = 4) {
  const [c, g] = canvas(256, 256);
  const r = mulberry(seed);
  g.fillStyle = '#34312c'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 64) for (let x = (y / 64) % 2 ? -32 : 0; x < 256; x += 64 + Math.floor(r() * 10)) {
    g.fillStyle = hsl(35, 5, 34 + r() * 10);
    g.fillRect(x + 3, y + 3, 58, 58);
  }
  return c;
}

export function rug() {
  const [c, g] = canvas(384, 192);
  g.fillStyle = '#5e1f19'; g.fillRect(0, 0, 384, 192);
  g.fillStyle = '#b88a3a'; g.fillRect(10, 10, 364, 172);
  g.fillStyle = '#7c2d24'; g.fillRect(18, 18, 348, 156);
  const dia = (cx, cy, s, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s, cy); g.lineTo(cx, cy + s); g.lineTo(cx - s, cy); g.fill(); };
  for (let i = 0; i < 5; i++) { dia(64 + i * 64, 96, 30, i % 2 ? '#2d3f5a' : '#b88a3a'); dia(64 + i * 64, 96, 14, '#5e1f19'); }
  for (let x = 24; x < 360; x += 12) { dia(x, 26, 4, '#d8b060'); dia(x, 166, 4, '#d8b060'); }
  const id = g.getImageData(0, 0, 384, 192), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 22; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(id, 0, 0);
  return c;
}

export function glowSprite(inner = 'rgba(255,220,150,1)', outer = 'rgba(255,120,30,0)') {
  const [c, g] = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '.35)')); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function flameSprite() {
  const [c, g] = canvas(64, 128);
  const gr = g.createRadialGradient(32, 90, 2, 32, 80, 60);
  gr.addColorStop(0, 'rgba(255,250,220,1)');
  gr.addColorStop(0.25, 'rgba(255,190,70,.9)');
  gr.addColorStop(0.6, 'rgba(240,90,20,.45)');
  gr.addColorStop(1, 'rgba(120,20,0,0)');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(32, 4); g.bezierCurveTo(60, 60, 58, 120, 32, 124); g.bezierCurveTo(6, 120, 4, 60, 32, 4); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export { toTex, canvas };
