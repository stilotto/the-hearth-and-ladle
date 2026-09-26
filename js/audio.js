// Procedural ambience: fire crackle, rain, room murmur, thunder, a bell,
// and a Karplus-Strong lute that noodles in D dorian while the bard plays.
import { G } from './state.js';

let ctx = null, master, fireG, rainG, murmurG, noiseBuf;
const ks = new Map();
let nextNote = 0, step = 0, phrase = [];

function noiseBuffer() {
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function loop(filterType, freq, q, gainNode) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filterType; f.frequency.value = freq; f.Q.value = q;
  src.connect(f).connect(gainNode);
  src.start();
  return f;
}

export const Sfx = {
  on: false,
  spatial: false,     // 3D view: fire and rain come from positional sources instead
  get ctx() { return ctx; },
  get out() { return master; },
  get noise() { return noiseBuf; },
  init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // iOS: treat this like media playback so the silent switch doesn't mute it
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older Safari */ }
    ctx = new AC();
    // iOS unlocks audio only for sound started inside a tap: play one silent sample now
    const unlock = ctx.createBufferSource(); unlock.buffer = ctx.createBuffer(1, 1, 22050); unlock.connect(ctx.destination); unlock.start(0);
    // iOS suspends audio when the page is backgrounded or a call comes in; wake it on the next touch
    const wake = () => { if (this.on && ctx.state !== 'running') ctx.resume(); };
    for (const ev of ['touchend', 'click', 'keydown']) window.addEventListener(ev, wake, true);
    document.addEventListener('visibilitychange', wake);
    master = ctx.createGain(); master.gain.value = 0;
    master.connect(ctx.destination);
    noiseBuf = noiseBuffer();
    fireG = ctx.createGain(); fireG.gain.value = 0; fireG.connect(master);
    rainG = ctx.createGain(); rainG.gain.value = 0; rainG.connect(master);
    murmurG = ctx.createGain(); murmurG.gain.value = 0; murmurG.connect(master);
    loop('lowpass', 380, 0.7, fireG);
    const r1 = loop('bandpass', 2600, 0.5, rainG); r1.frequency.value = 2400;
    loop('highpass', 6000, 0.3, rainG);
    const m = loop('bandpass', 420, 1.4, murmurG);
    // murmur swells and ebbs like conversation
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.23;
    const lg = ctx.createGain(); lg.gain.value = 140;
    lfo.connect(lg).connect(m.frequency); lfo.start();
  },
  setOn(v) {
    this.on = v;
    if (v) this.init();
    if (!ctx) return;
    if (v && ctx.state !== 'running') ctx.resume();
    master.gain.setTargetAtTime(v ? 0.8 : 0, ctx.currentTime, 0.3);
  },
  update(dt) {
    if (!ctx || !this.on) return;
    const t = ctx.currentTime;
    const patrons = G.agents.filter((a) => a.present && a.kind === 'person').length;
    fireG.gain.setTargetAtTime(this.spatial ? 0 : 0.05 + 0.1 * G.fire, t, 0.5);
    rainG.gain.setTargetAtTime(this.spatial ? 0 : G.weather === 'storm' ? 0.07 : G.weather === 'rain' ? 0.04 : 0, t, 1);
    murmurG.gain.setTargetAtTime(Math.min(0.09, patrons * 0.006), t, 1);
    if (Math.random() < dt * 9 * G.fire) this.crackle(this.fireOut);
    if (G.music.playing && !G.paused) this.lute(t);
    else { nextNote = 0; }
  },
  crackle(dest) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1200 + Math.random() * 2500;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.05 + Math.random() * 0.09, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.03 + Math.random() * 0.04);
    s.connect(f).connect(g).connect(dest || fireG);
    s.start(t, Math.random() * 1.5, 0.1);
  },
  pluck(midi, when, vel = 0.3) {
    let buf = ks.get(midi);
    if (!buf) {
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const sr = ctx.sampleRate, N = Math.round(sr / freq), len = Math.floor(sr * 1.8);
      buf = ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0), ring = new Float32Array(N);
      let prev = 0;
      for (let i = 0; i < N; i++) { const r = Math.random() * 2 - 1; ring[i] = (r + prev) * 0.5; prev = r; }
      let idx = 0;
      for (let i = 0; i < len; i++) {
        const cur = ring[idx], nxt = ring[(idx + 1) % N];
        ring[idx] = 0.996 * 0.5 * (cur + nxt);
        d[i] = cur;
        idx = (idx + 1) % N;
      }
      ks.set(midi, buf);
    }
    const s = ctx.createBufferSource(); s.buffer = buf;
    const g = ctx.createGain(); g.gain.value = vel;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
    s.connect(f).connect(g).connect(this.luteOut || master);
    s.start(when);
  },
  lute(t) {
    const beat = 60 / (96 * Math.min(2, Math.sqrt(G.speed))) / 2;   // eighth notes
    if (!nextNote || nextNote < t) nextNote = t + 0.05;
    // D dorian, chord roots cycling Dm C Bb C
    const chords = [[50, 53, 57, 62], [48, 52, 55, 60], [46, 50, 53, 58], [48, 52, 55, 60]];
    const scale = [62, 64, 65, 67, 69, 71, 72, 74, 76, 77];
    while (nextNote < t + 0.25) {
      const bar = Math.floor(step / 6) % 4, pos = step % 6, ch = chords[bar];
      if (pos === 0) this.pluck(ch[0] - 12, nextNote, 0.35);
      this.pluck(ch[[1, 2, 3, 2, 1, 2][pos]], nextNote, 0.14);
      if (!phrase.length) phrase = Array.from({ length: 12 }, () => (Math.random() < 0.7 ? scale[Math.floor(Math.random() * scale.length)] : 0));
      const mel = phrase[step % 12];
      if (mel && (pos === 0 || pos === 3 || Math.random() < 0.3)) this.pluck(mel, nextNote + 0.005, 0.22);
      step++;
      if (step % 24 === 0) phrase = [];
      nextNote += beat;
    }
  },
  tone(freq, dur, vol, type = 'sine', when = 0) {
    if (!ctx || !this.on) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
  },
  bell() { for (const [f, d, v] of [[660, 2.4, 0.12], [1822, 1.4, 0.05], [3564, 0.8, 0.03]]) { this.tone(f, d, v); this.tone(f, d, v * 0.8, 'sine', 0.5); } },
  coin() { this.tone(2350, 0.18, 0.04); this.tone(3150, 0.22, 0.03, 'sine', 0.05); },
  clunk() { this.tone(170, 0.14, 0.12, 'triangle'); },
  dice() { for (let i = 0; i < 4; i++) this.tone(900 + Math.random() * 600, 0.05, 0.05, 'square', i * 0.07); },
  clue() { this.tone(784, 0.5, 0.06); this.tone(1175, 0.7, 0.05, 'sine', 0.12); },
  door() {
    if (!ctx || !this.on) return;
    const t = ctx.currentTime;
    this.tone(95, 0.35, 0.18, 'triangle');
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 6;
    f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(900, t + 0.4);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.15); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    s.connect(f).connect(g).connect(master); s.start(t, 0, 0.6);
  },
  whoomph() {
    if (!ctx || !this.on) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(200, t); f.frequency.linearRampToValueAtTime(900, t + 0.3);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1);
    s.connect(f).connect(g).connect(master); s.start(t, 0, 1.1);
  },
  thunder() {
    if (!ctx || !this.on) return;
    const t = ctx.currentTime + 0.4 + Math.random() * 1.2;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(420, t); f.frequency.exponentialRampToValueAtTime(50, t + 3);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 3.5);
    s.connect(f).connect(g).connect(master); s.start(t, 0, 1.9);
  },
};
