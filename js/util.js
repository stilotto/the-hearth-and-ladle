// Small helpers shared by every module.

export const rnd = Math.random;
export const rf = (a, b) => (b === undefined ? rnd() * a : a + rnd() * (b - a));
export const ri = (a, b) => Math.floor(a + rnd() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
export const chance = (p) => rnd() < p;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function weighted(items, w) {
  let total = 0;
  for (const it of items) total += w(it);
  let r = rnd() * total;
  for (const it of items) {
    r -= w(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

// Deterministic PRNG so the room's floorboards look the same every visit.
export function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fmtTime(min) {
  const m = ((Math.floor(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export const hourOf = (t) => (((t % 1440) + 1440) % 1440) / 60;

export function fill(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}

export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f < 1) { r *= f; g *= f; b *= f; }
  else { r += (255 - r) * (f - 1); g += (255 - g) * (f - 1); b += (255 - b) * (f - 1); }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
