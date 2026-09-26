// Entry point: wire the sim, renderer, audio and UI into one loop.
import { G } from './state.js';
import { TS } from './world.js';
import { createCast, startDay, update } from './sim.js';
import { initRender, resize, draw, pick, view } from './render.js';
import { initUI, uiFrame, syncSpeed } from './ui.js';
import { Sfx } from './audio.js';

const scene = document.getElementById('scene');
const overlay = document.getElementById('overlay');
const stage = document.getElementById('stage');

createCast();
startDay(1);
G.ear = { x: 10 * TS, y: 8 * TS };
initRender(scene, overlay);

function fit() {
  const r = stage.getBoundingClientRect();
  const maxH = window.innerWidth <= 820 ? r.width * 0.62 : window.innerHeight - stage.offsetTop - 12;
  resize(r.width, Math.max(160, maxH));
  stage.style.height = view.h + 'px';
}
new ResizeObserver(fit).observe(stage);
window.addEventListener('resize', fit);
fit();

initUI({
  setSpeed(s) { if (s === 0) G.paused = true; else { G.paused = false; G.speed = s; } syncSpeed(); },
  pause(p) { G.paused = p; syncSpeed(); },
  nextDay() { startDay(G.day + 1); G.ear = { x: 10 * TS, y: 8 * TS }; G.paused = false; syncSpeed(); },
});

// input
function local(e) { const r = overlay.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
overlay.addEventListener('pointermove', (e) => { const [x, y] = local(e); G.hover = pick(x, y).agent; overlay.style.cursor = G.hover ? 'pointer' : 'crosshair'; });
overlay.addEventListener('pointerleave', () => { G.hover = null; });
overlay.addEventListener('click', (e) => {
  const [x, y] = local(e);
  const p = pick(x, y);
  if (p.agent) G.sel = p.agent;
  else { G.sel = null; G.ear = { x: p.x, y: p.y }; }
});
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input,textarea') || !document.getElementById('modal').hidden) return;
  if (e.key === ' ') { e.preventDefault(); G.paused = !G.paused; syncSpeed(); }
  else if (e.key >= '1' && e.key <= '4') { G.paused = false; G.speed = [1, 2, 4, 8][+e.key - 1]; syncSpeed(); }
  else if (e.key === 'Escape') G.sel = null;
});

// loop
let last = performance.now();
function frame(now) {
  const real = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!G.paused) {
    let dt = real * G.speed;
    while (dt > 0) { const s = Math.min(0.25, dt); update(s); dt -= s; }
  }
  Sfx.update(real);
  draw(G.paused ? 0 : real);
  uiFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.G = G; // handy for poking at the room from the console
