// The room as you'd hear it from where you stand: a wooden-room reverb,
// mumbled voices coming from whoever is speaking, footsteps on boards and
// flagstones, the kitchen behind its door, weather and night outside.
import { G } from '../state.js';
import { Sfx } from '../audio.js';

const rnd = Math.random;
const rf = (a, b) => a + rnd() * (b - a);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const VOWELS = [[730, 1090], [270, 2290], [300, 870], [530, 1840], [570, 840], [440, 1020], [660, 1720], [390, 1990]];

export function createSound(P) {
  let ctx = null, out, dry, send, sky;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const S = { on: false };
  let voices = 0;
  const ear = { x: 0, y: 1.6, z: 0 };
  let gust = 0, gustT = 0, gustTarget = 0.3, lastHour = -1, owlT = rf(30, 80), chirpT = [0, 0.3], doorOpen = 0;
  let fire, rumble, rains = [], roof, wind, windF, doorWind, purr, purrPan, lutePan;

  const now = () => ctx.currentTime;
  const dist = (p) => Math.hypot(p.x - ear.x, p.z - ear.z);

  function impulse(sec) {
    const sr = ctx.sampleRate, len = Math.floor(sr * sec), b = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let y = 0;
      for (let i = 0; i < len; i++) {
        const k = i / len, env = Math.pow(1 - k, 2.8) * (i < sr * 0.012 ? i / (sr * 0.012) : 1);
        y += ((rnd() * 2 - 1) - y) * (0.5 - 0.3 * k);       // darker as it decays, like soft wood and bodies
        d[i] = y * env;
      }
    }
    return b;
  }
  function bus() { const g = ctx.createGain(); g.connect(dry); g.connect(send); return g; }
  function panner(p, ref = 1.2, roll = 1.3, hrtf = false) {
    const pn = ctx.createPanner();
    pn.panningModel = hrtf && !coarse ? 'HRTF' : 'equalpower'; pn.distanceModel = 'inverse'; pn.refDistance = ref; pn.rolloffFactor = roll;
    place(pn, p);
    pn.connect(dry); pn.connect(send);
    return pn;
  }
  function place(pn, p) {
    if (pn.positionX) { pn.positionX.value = p.x; pn.positionY.value = p.y ?? 1.2; pn.positionZ.value = p.z; }
    else pn.setPosition(p.x, p.y ?? 1.2, p.z);
  }
  function loop(type, freq, q, dest) {
    const src = ctx.createBufferSource(); src.buffer = Sfx.noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(dest); src.start(now(), rnd() * 1.5);
    return { g, f };
  }
  function tone(dest, freq, dur, vol, type = 'sine', when = 0, to = 0) {
    const t = now() + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function burst(dest, o) {
    const t = now() + (o.when || 0), dur = o.dur || 0.08;
    const s = ctx.createBufferSource(); s.buffer = Sfx.noise;
    const f = ctx.createBiquadFilter(); f.type = o.type || 'lowpass'; f.frequency.setValueAtTime(o.freq || 600, t); f.Q.value = o.q || 0.7;
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.vol || 0.1, t + (o.attack || 0.004)); g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    s.connect(f).connect(g).connect(dest); s.start(t, rnd() * 1.6, dur + 0.1);
  }

  S.start = () => {
    ctx = Sfx.ctx;
    if (!ctx || S.on) return;
    S.on = true; out = Sfx.out;
    dry = ctx.createGain(); dry.gain.value = 1.7; dry.connect(out);
    send = ctx.createGain(); send.gain.value = 0.5;
    const conv = ctx.createConvolver(); conv.buffer = impulse(0.95);
    const wet = ctx.createGain(); wet.gain.value = 0.42;
    send.connect(conv).connect(wet).connect(out);
    sky = ctx.createBiquadFilter(); sky.type = 'lowpass'; sky.frequency.value = 900; sky.connect(dry); sky.connect(send);

    const fp = panner(P.hearth, 1.0, 1.3, true);
    fire = loop('lowpass', 420, 0.7, fp).g;
    rumble = loop('lowpass', 95, 0.5, fp).g;
    Sfx.fireOut = fp;
    rains = P.windows.map((w) => loop('bandpass', 2600, 0.5, panner(w, 1.5, 1.3, true)).g);
    const dp = panner(P.door, 1.5, 1.2, true);
    rains.door = loop('highpass', 2600, 0.4, dp).g;
    doorWind = loop('bandpass', 520, 1.6, dp).g;
    roof = loop('lowpass', 1100, 0.4, bus()).g;
    const wl = loop('bandpass', 420, 2.4, panner({ x: P.hearth.x, y: 2.6, z: P.hearth.z }, 2.5, 0.8));
    wind = wl.g; windF = wl.f;
    lutePan = panner(P.stage, 2.0, 1.1, true);
    Sfx.luteOut = lutePan;

    // the cat's purr: a low rattle at about 24 beats a second
    purrPan = panner(P.hearth, 0.5, 2.2);
    const pg = ctx.createGain(); pg.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 24;
    const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg).connect(pg.gain); lfo.start();
    purr = loop('lowpass', 210, 1.2, pg).g; pg.connect(purrPan);

    // the simulation's own cues, moved to where they happen
    Sfx.door = () => {
      const d = panner(P.door, 1.4, 1.2);
      tone(d, 95, 0.35, 0.3, 'triangle');
      burst(d, { type: 'bandpass', freq: 480, to: 950, q: 9, vol: 0.14, attack: 0.15, dur: 0.55 });
      burst(d, { type: 'lowpass', freq: 300, vol: 0.3, dur: 0.12, when: 0.9 });
      tone(d, 1900, 0.05, 0.03, 'square', 0.92);
    };
    Sfx.clunk = () => {};
    Sfx.coin = () => { const d = panner(P.bar, 1, 1.4); tone(d, 2350, 0.18, 0.09); tone(d, 3150, 0.22, 0.07, 'sine', 0.05); };
    Sfx.dice = () => {
      const a = G.agents.find((x) => x.present && /dic/.test(x.activity || ''));
      const d = panner(a ? { x: (a.x / 16) * 0.8, y: 0.8, z: ((a.y - 5) / 16) * 0.8 } : P.bar, 1, 1.5);
      for (let i = 0; i < 5; i++) burst(d, { type: 'bandpass', freq: rf(1800, 3200), q: 3, vol: 0.2, dur: 0.035, when: i * rf(0.05, 0.09) });
    };
    Sfx.bell = () => { const d = panner(P.bar, 1.6, 1); for (const [f, du, v] of [[660, 2.4, 0.3], [1822, 1.4, 0.12], [3564, 0.8, 0.07]]) { tone(d, f, du, v); tone(d, f, du, v * 0.8, 'sine', 0.5); } };
    Sfx.whoomph = () => { const d = panner(P.hearth, 1.2, 1.2); burst(d, { freq: 200, to: 900, vol: 0.7, dur: 1.0, attack: 0.05 }); for (let i = 0; i < 9; i++) Sfx.crackle(fp); };
    Sfx.thunder = () => {
      const w = rf(0.4, 1.6);
      burst(sky, { freq: 2400, to: 300, vol: 0.5, dur: 0.25, when: w, attack: 0.01 });
      burst(sky, { freq: 420, to: 45, vol: 1.1, dur: 3.6, when: w + 0.05, attack: 0.08 });
      burst(sky, { freq: 160, to: 40, vol: 0.6, dur: 5, when: w + 1.2, attack: 0.6 });
    };
  };

  S.listener = (p, dir) => {
    if (!S.on) return;
    ear.x = p.x; ear.y = p.y; ear.z = p.z;
    const l = ctx.listener;
    if (l.positionX) {
      l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
      l.forwardX.value = dir.x; l.forwardY.value = dir.y; l.forwardZ.value = dir.z;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else { l.setPosition(p.x, p.y, p.z); l.setOrientation(dir.x, dir.y, dir.z, 0, 1, 0); }
  };

  // ---------------------------------------------------------------- people
  const pitchOf = (a) => {
    const h = ((a.id * 2654435761) >>> 0) / 4294967296, L = a.look || {};
    return (100 + h * 115) * (L.kin === 'dwarf' ? 0.78 : L.kin === 'halfling' ? 1.25 : 1) * (L.build === 'stout' ? 0.93 : 1);
  };
  // Wordless speech with the rhythm and tune of the line being said.
  S.voice = (a, p, text, dur, o = {}) => {
    if (!S.on || !Sfx.on || voices >= 7 || dist(p) > 12) return;
    const f0 = pitchOf(a) * (o.laugh ? 1.45 : 1), t0 = now() + 0.03;
    const pn = panner({ x: p.x, y: p.y ?? 1.4, z: p.z }, 0.9, 1.5);
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.whisper ? 5200 : 3000;
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 4.5;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 7;
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    let src, osc = null;
    if (o.whisper) { src = ctx.createBufferSource(); src.buffer = Sfx.noise; src.loop = true; }
    else { osc = src = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = f0; }
    src.connect(f1).connect(g); src.connect(f2).connect(g2).connect(g); g.connect(lp).connect(pn);
    if (o.laugh || !o.whisper) {   // a little breath in the voice
      const br = ctx.createBufferSource(); br.buffer = Sfx.noise; br.loop = true;
      const bg = ctx.createGain(); bg.gain.value = o.laugh ? 0.25 : 0.05;
      br.connect(bg).connect(f2); br.start(t0, rnd()); br.stop(t0 + dur + 0.5);
    }
    const words = String(text).split(/\s+/).length;
    const n = o.laugh ? Math.floor(rf(4, 8)) : Math.max(1, Math.min(Math.round(words * 1.45), Math.floor(dur * 5)));
    const vol = (o.whisper ? 0.5 : o.loud || /!/.test(text) ? 1.5 : 1.0) * (o.laugh ? 1.2 : 1);
    const rise = /\?\s*$/.test(text);
    let t = t0;
    for (let i = 0; i < n && t < t0 + dur; i++) {
      const len = o.laugh ? 0.085 : rf(0.1, 0.19), k = i / Math.max(1, n - 1);
      const v = o.laugh ? VOWELS[0] : pick(VOWELS);
      f1.frequency.setTargetAtTime(v[0], t, 0.025); f2.frequency.setTargetAtTime(v[1], t, 0.025);
      if (osc) osc.frequency.setTargetAtTime(f0 * (o.laugh ? 1.25 - 0.4 * k : 1.1 - 0.2 * k + (rise && i >= n - 2 ? 0.3 : 0)) * rf(0.95, 1.07), t, 0.03);
      g.gain.setTargetAtTime(vol * rf(0.65, 1), t, 0.014);
      g.gain.setTargetAtTime(0.0001, t + len, 0.022);
      t += len + (o.laugh ? 0.075 : rf(0.03, 0.07) + (rnd() < 0.3 ? rf(0.05, 0.14) : 0));
    }
    voices++;
    src.onended = () => { voices--; pn.disconnect(); };
    src.start(t0, o.whisper ? rnd() : 0); src.stop(t + 0.25);
  };
  S.laugh = (a, p) => S.voice(a, p, '', 1.2, { laugh: true });

  S.step = (p, surf = 'wood', vol = 1) => {
    if (!S.on || !Sfx.on) return;
    if (p && dist(p) > 9) return;
    const d = p ? panner({ x: p.x, y: 0.1, z: p.z }, 1, 1.7) : bus();
    const v = vol * (p ? 1 : 0.5);
    if (surf === 'rug') { burst(d, { freq: 260, vol: 0.2 * v, dur: 0.09 }); return; }
    if (surf === 'flag') { burst(d, { freq: 1900, vol: 0.2 * v, dur: 0.035 }); burst(d, { freq: 500, vol: 0.2 * v, dur: 0.06 }); return; }
    burst(d, { freq: rf(600, 900), vol: 0.3 * v, dur: 0.05 });
    tone(d, rf(82, 100), 0.09, 0.3 * v, 'sine', 0, 52);
    if (rnd() < 0.1) burst(d, { type: 'bandpass', freq: rf(380, 520), to: rf(250, 340), q: 14, vol: 0.5 * v, dur: 0.3, attack: 0.08, when: 0.05 });
  };
  S.scrape = (p) => { if (S.on && Sfx.on && dist(p) < 9) burst(panner({ x: p.x, y: 0.2, z: p.z }, 1, 1.6), { type: 'bandpass', freq: rf(240, 330), to: rf(170, 230), q: 6, vol: 0.5, dur: rf(0.18, 0.3), attack: 0.03 }); };
  S.clunk = (p) => { if (!S.on || !Sfx.on || dist(p) > 10) return; const d = panner(p, 1, 1.5); tone(d, rf(160, 200), 0.12, 0.4, 'triangle'); burst(d, { freq: 1400, vol: 0.2, dur: 0.03 }); };
  S.claps = (list) => {
    if (!S.on || !Sfx.on) return;
    for (const p of list.slice(0, 8)) {
      const d = panner(p, 1.2, 1.3), n = Math.floor(rf(5, 11)), rate = rf(0.2, 0.28);
      for (let i = 0; i < n; i++) burst(d, { type: 'bandpass', freq: rf(1100, 1800), q: 1.2, vol: 0.35, dur: 0.03, when: rf(0, 0.3) + i * rate });
    }
  };
  S.lute = (p) => { if (S.on) place(lutePan, p); };

  // ---------------------------------------------------------------- the room itself
  const kitchenNoise = () => {
    const d = panner(P.kitchen, 1.2, 1.2), r = rnd();
    if (r < 0.4) { const f = rf(520, 900); for (const [m, v] of [[1, 0.2], [2.76, 0.12], [5.4, 0.06]]) tone(d, f * m, rf(0.25, 0.5), v); }
    else if (r < 0.75) { const n = Math.floor(rf(4, 9)), rate = rf(0.16, 0.22); for (let i = 0; i < n; i++) { burst(d, { freq: 900, vol: 0.3, dur: 0.03, when: i * rate }); tone(d, 170, 0.05, 0.2, 'sine', i * rate); } }
    else burst(d, { type: 'highpass', freq: 5200, vol: 0.12, dur: rf(1.5, 3), attack: 0.4 });
  };
  const creak = () => burst(panner({ x: rf(2, 18), y: 3.2, z: rf(2, 11) }, 2, 1), { type: 'bandpass', freq: rf(220, 300), to: rf(150, 200), q: 16, vol: 0.9, dur: rf(0.4, 0.8), attack: 0.15 });
  const toll = (n) => { for (let i = 0; i < n; i++) for (const [m, v, du] of [[0.5, 0.25, 3.2], [1, 0.3, 2.6], [1.19, 0.14, 2], [1.5, 0.1, 1.6], [2, 0.09, 1.2], [2.74, 0.04, 0.8]]) tone(sky, 392 * m, du, v, 'sine', i * 2.1); };
  const chirp = (w, f) => { const d = panner(P.windows[w], 1.8, 1.2); for (let i = 0; i < 3; i++) tone(d, f, 0.022, 0.09, 'sine', i * 0.034); };
  const hoot = () => { const d = panner(pick(P.windows), 2.2, 1); tone(d, 392, 0.3, 0.2, 'sine', 0, 350); tone(d, 370, 0.5, 0.22, 'sine', 0.5, 330); };

  S.update = (dt, st) => {
    if (!S.on) return;
    const t = now(), on = Sfx.on;
    doorOpen = st.door;
    const storm = G.weather === 'storm', wet = G.weather !== 'clear';
    fire.gain.setTargetAtTime(0.16 + 0.3 * G.fire, t, 0.4);
    rumble.gain.setTargetAtTime(0.25 + 0.5 * G.fire, t, 0.6);
    const rv = storm ? 0.17 : wet ? 0.1 : 0;
    for (const g of rains) g.gain.setTargetAtTime(rv, t, 1);
    rains.door.gain.setTargetAtTime(rv * (0.25 + 2.2 * doorOpen), t, 0.15);
    roof.gain.setTargetAtTime(rv * 0.3, t, 1);
    // wind comes in gusts: down the chimney, and through the door whenever it opens
    gustT -= dt;
    if (gustT < 0) { gustT = rf(2, 6); gustTarget = rnd() * rnd() * (storm ? 1 : 0.6) + (storm ? 0.3 : 0.05); }
    gust += (gustTarget - gust) * Math.min(1, dt * 0.5);
    S.gust = gust;
    const base = storm ? 0.5 : wet ? 0.22 : 0.09;
    wind.gain.setTargetAtTime(base * gust, t, 0.5);
    windF.frequency.setTargetAtTime(300 + gust * 420, t, 0.6);
    doorWind.gain.setTargetAtTime(doorOpen * (0.06 + base * (0.3 + gust)), t, 0.15);
    purrPan && place(purrPan, st.cat || P.hearth);
    purr.gain.setTargetAtTime(st.cat && st.catNear ? 0.5 : 0, t, 0.6);
    if (!on || G.paused) return;

    if (rnd() < dt * 0.3 * G.fire) { burst(Sfx.fireOut, { type: 'highpass', freq: 900, vol: rf(0.25, 0.5), dur: 0.03 }); tone(Sfx.fireOut, rf(120, 170), 0.06, 0.25); }
    if (G.closing < 3 && rnd() < dt * 0.1) kitchenNoise();
    if (rnd() < dt * (storm ? 0.05 : 0.018)) creak();
    if (wet && rnd() < dt * 0.8) tone(panner(pick(P.windows), 1, 1.6), rf(1400, 2600), 0.05, 0.05, 'sine', 0, 700);
    const h = Math.floor(st.hour);
    if (lastHour >= 0 && h !== lastHour && !st.fast) toll(h % 12 || 12);
    lastHour = h;
    const night = st.hour >= 18.5 || st.hour < 5;
    if (night && !wet) {
      for (let i = 0; i < 2; i++) { chirpT[i] -= dt; if (chirpT[i] < 0) { chirpT[i] = rnd() < 0.12 ? rf(2, 6) : rf(0.5, 0.75); chirp(i, i ? 4650 : 4200); } }
      owlT -= dt; if (owlT < 0) { owlT = rf(50, 140); hoot(); }
    }
  };
  return S;
}
