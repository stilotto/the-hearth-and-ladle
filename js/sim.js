// The simulation: people, their little routines (written as generators),
// conversations, the evening's rhythm from opening to "Time, gentles!".
import { G, emit } from './state.js';
import * as U from './util.js';
import { TS, P, RUG, seats, tables, fixtures, findPath, nearestOpen, lore, kind, walkable } from './world.js';
import { makeSprites, randomLook } from './sprites.js';
import * as T from './talk.js';
import { Sfx } from './audio.js';
import { setupPlot } from './plot.js';

// ------------------------------------------------------------------ agent
export class Agent {
  constructor(o = {}) {
    Object.assign(this, {
      id: G.nextId++, name: '', first: '', role: 'local', title: '', kind: 'person',
      x: 0, y: 0, path: null, pathI: 0, walkPhase: 0, facing: 'f', sitting: false, seat: null,
      present: false, doneToday: false, gen: null, stack: [], wait: null, lastIns: null,
      needs: { thirst: 0.4, hunger: 0.3, social: 0.5 }, drunk: 0, coin: U.ri(6, 24),
      mood: U.rf(0.45, 0.8), traits: [], rel: {}, activity: '', bubble: null, carry: null,
      hand: null, convo: null, busy: false, dance: false, shake: 0, sick: false, speed: 2.6,
    }, o);
    if (this.look) this.spr = makeSprites(this.look);
  }
  place(x, y) { this.x = x * TS + 8; this.y = y * TS + 13; this.path = null; }
  get tx() { return Math.floor(this.x / TS); }
  get ty() { return Math.floor(this.y / TS); }

  start(gen) { this.stack = []; this.gen = gen; this.wait = null; this.path = null; this._resume(undefined); }
  interrupt(gen) {
    if (this.gen) this.stack.push({ gen: this.gen, ins: this.lastIns });
    this.gen = gen; this.wait = null; this.path = null;
    this._resume(undefined);
  }
  _resume(val) {
    let guard = 0;
    while (this.gen && guard++ < 40) {
      let r;
      try { r = this.gen.next(val); } catch (e) { console.error(this.first, e); r = { done: true }; }
      if (r.done) {
        if (this.stack.length) {
          const s = this.stack.pop();
          this.gen = s.gen;
          // re-issue only waits that still make sense after an interruption
          const ins = s.ins && (s.ins.walk || s.ins.cond) ? s.ins : undefined;
          if (ins === undefined) { val = undefined; continue; }
          if (this._setWait(ins)) return;
          val = this._val; continue;
        }
        this.gen = null; return;
      }
      if (this._setWait(r.value)) return;
      val = this._val;
    }
  }
  _setWait(ins) {
    this.lastIns = ins;
    if (ins === undefined || ins === null) { this.wait = { type: 'next' }; return true; }
    if (typeof ins === 'number') { this.wait = { type: 'time', t: G.t + ins }; return true; }
    if (ins.walk) {
      const [x, y] = ins.walk;
      if (this.tx === x && this.ty === y) { this.path = null; this._val = true; return false; }
      const p = findPath(this.tx, this.ty, x, y, { stairs: ins.stairs, door: ins.door, staff: this.staff });
      if (!p) { this._val = false; return false; }
      this.sitting = false; this.dance = false;
      this.path = p; this.pathI = 0;
      this.wait = { type: 'walk' };
      return true;
    }
    if (ins.cond) {
      if (ins.cond()) { this._val = true; return false; }
      this.wait = { type: 'cond', fn: ins.cond, dl: ins.max != null ? G.t + ins.max : Infinity };
      return true;
    }
    this._val = undefined; return false;
  }
  update(dt) {
    if (this.path) this._move(dt);
    const w = this.wait;
    if (!w || !this.gen) return;
    let go = false, val;
    switch (w.type) {
      case 'next': go = true; break;
      case 'time': go = G.t >= w.t; break;
      case 'walk': if (!this.path) { go = true; val = true; } break;
      case 'cond': if (w.fn()) { go = true; val = true; } else if (G.t >= w.dl) { go = true; val = false; } break;
    }
    if (go) { this.wait = null; this._resume(val); }
  }
  _move(dt) {
    const sp = this.speed * (1 - Math.min(0.35, this.drunk * 0.3)) * dt;
    let d = sp * TS;
    while (d > 0 && this.path) {
      const n = this.path[this.pathI];
      const tx = n[0] * TS + 8, ty = n[1] * TS + 13;
      const dx = tx - this.x, dy = ty - this.y, L = Math.hypot(dx, dy);
      if (L > 0.01) this.facing = dy < -0.1 && Math.abs(dy) >= Math.abs(dx) * 0.5 ? 'b' : 'f';
      if (L <= d) {
        this.x = tx; this.y = ty; d -= L; this.pathI++;
        if (this.pathI >= this.path.length) this.path = null;
      } else { this.x += (dx / L) * d; this.y += (dy / L) * d; d = 0; }
    }
    this.walkPhase += sp * 2.4;
  }
}

// ------------------------------------------------------------------ speech & clues
export const earPos = () => (G.sel && G.sel.present ? { x: G.sel.x, y: G.sel.y - 8 } : G.ear);
export function hears(a, r = 3.6) {
  if (!a) return false;
  if (G.sel === a) return true;
  if (G.sel && a.convo && a.convo === G.sel.convo) return true;
  const e = earPos();
  if (!e) return false;
  return Math.hypot(a.x - e.x, a.y - 8 - e.y) <= r * TS;
}
export function speak(a, text, o = {}) {
  if (!a || !a.present) return false;
  const whisper = !!o.whisper;
  a.bubble = {
    text, whisper, loud: !!o.loud,
    until: performance.now() + U.clamp(1000 + text.length * 60, 1800, 5200) / Math.sqrt(Math.max(1, G.speed)),
  };
  const heard = o.loud || hears(a, whisper ? 2.6 : 3.6);
  if (heard) {
    const h = { t: G.t, who: a, text, whisper };
    G.heard.unshift(h); if (G.heard.length > 80) G.heard.pop();
    emit('heard', h);
    if (o.clue) addClue(o.clue, o.clueKey);
  }
  return heard;
}
export function witness(a, clue, key, r = 4.5) { if (a && a.present && hears(a, r)) addClue(clue, key); }
export function addClue(text, key) {
  key = key || text;
  if (G.clues.some((c) => c.key === key)) return;
  const c = { t: G.t, text, key };
  G.clues.push(c);
  emit('clue', c);
  Sfx.clue();
}
export function log(text) { const e = { t: G.t, text }; G.log.unshift(e); emit('log', e); }
export function toast(text, kind = '') { emit('toast', { text, kind }); }
export function puff(kind, x, y, n = 1, o = {}) {
  const lim = G.reduced ? Math.ceil(n / 2) : n;
  for (let i = 0; i < lim; i++) {
    G.particles.push({
      kind, x: x + U.rf(-(o.spread || 0), o.spread || 0), y: y + U.rf(-(o.spreadY || 0), o.spreadY || 0),
      vx: (o.vx ?? 0) + U.rf(-0.5, 0.5) * (o.jit ?? 4), vy: (o.vy ?? -8) * U.rf(0.6, 1.3),
      life: 0, max: o.life ?? U.rf(1, 2), col: o.col,
    });
  }
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function tvars(a, b) {
  const here = G.agents.filter((p) => p.present && p.kind === 'person');
  const others = here.filter((p) => p !== a && p !== b && (p.role === 'local' || p.role === 'visitor'));
  const advs = here.filter((p) => p.role === 'adventurer');
  return {
    a: a?.first, b: b?.first,
    x: others.length ? U.pick(others).first : 'old Tam',
    adv: advs.length ? U.pick(advs).first : 'the heroes',
    party: G.party ? G.party.name : 'the Company',
    bard: G.bard?.first, keeper: G.keeper.first, inn: lore.inn, town: lore.town, town2: lore.town2,
    lord: lore.lord, place: lore.places[0], road: lore.road, beasts: lore.beasts, drink: lore.drink,
    weather: G.weather === 'clear' ? 'cold' : 'rain',
  };
}
export const say = (a, tpl, o, b) => speak(a, cap(U.fill(tpl, tvars(a, b))), o);

// ------------------------------------------------------------------ helpers
const STAFF = ['keeper', 'maid', 'potboy', 'cook'];
const PRICE = { ale: 2, wine: 4, stew: 3 };
export const distT = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / TS;
export const patronsHere = () => G.agents.filter((a) => a.present && a.kind === 'person' && !STAFF.includes(a.role));
const removeFrom = (arr, x) => { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); };
const occupiedTile = (x, y, me) => G.agents.some((o) => o !== me && o.present && o.kind === 'person' && !o.sitting && o.tx === x && o.ty === y);

export function freeTile(x, y, me) {
  const k = kind[y]?.[x];
  if (walkable(x, y) && k !== 'seat' && k !== 'stairs' && k !== 'door' && !occupiedTile(x, y, me)) return { x, y };
  return nearestOpen(x, y, (xx, yy) => occupiedTile(xx, yy, me));
}

export function pay(a, amt) {
  a.coin -= amt;
  G.coin += amt;
  puff('coin', a.x, a.y - 16, 1, { vy: -14, life: 0.9, jit: 0 });
  Sfx.coin();
}

export function* sitAt(a, seat) {
  if (a.seat && a.seat !== seat && a.seat.occupant === a) a.seat.occupant = null;
  if (seat.occupant && seat.occupant !== a) return false;
  seat.occupant = a; a.seat = seat;
  if (a.tx !== seat.x || a.ty !== seat.y) {
    const ok = yield { walk: [seat.x, seat.y] };
    if (ok === false) { seat.occupant = null; a.seat = null; return false; }
  }
  a.sitting = true; a.facing = seat.face;
  return true;
}
export function releaseSeat(a) {
  if (a.seat && a.seat.occupant === a) a.seat.occupant = null;
  a.seat = null; a.sitting = false;
}
export function* returnToSeat(a) {
  if (a.seat && !a.sitting) yield* sitAt(a, a.seat);
}
function* exitDoor(a) {
  releaseSeat(a);
  a.activity = 'heading home';
  yield { walk: [P.door.x, P.door.y] };
  yield { walk: [P.doorOut.x, P.doorOut.y], door: true };
  Sfx.door();
  a.present = false;
}
function* goUpstairs(a) {
  releaseSeat(a);
  a.activity = 'going up to bed';
  yield { walk: [P.stairsBot.x, P.stairsBot.y] };
  yield { walk: [P.stairsTop.x, P.stairsTop.y], stairs: true };
  a.present = false;
}

function seatScore(a, s) {
  if (a.fixedSeat) return s === a.fixedSeat ? 100 : 0.02;
  if (s.reserved && s.reserved !== a) return 0.001;
  let w = 1;
  const t = s.table;
  if (a.role === 'adventurer') return t && t.id === 'F' ? 50 : 0.2;
  if (t && t.id === 'F' && G.party && !G.party.seated) w *= 0.05;
  if (t && t.id === 'G') w *= 0.25;
  if (s.bar) w = a.barFly ? 6 : a.role === 'bard' ? 8 : 1;
  if (a.fav && t && t.id === a.fav) w *= 6;
  const mates = t ? t.seats.map((x) => x.occupant).filter(Boolean) : [];
  for (const m of mates) {
    const r = a.rel[m.id] ?? 0;
    if (a.love === m.id) w *= 8;
    else if (r > 0.3) w *= 3;
    else if (r < -0.3) w *= 0.15;
    if (m.role === 'adventurer') w *= 0.6;
  }
  if (t && mates.length >= t.seats.length - 1) w *= 0.3;
  if (t && (t.id === 'A' || t.id === 'B') && G.weather !== 'clear') w *= 1.6;
  return Math.max(0.01, w);
}
function chooseSeat(a) {
  const free = seats.filter((s) => !s.occupant);
  return free.length ? U.weighted(free, (s) => seatScore(a, s)) : null;
}
function* findSeat(a) {
  const s = chooseSeat(a);
  if (s && (yield* sitAt(a, s))) { a.activity = s.bar ? 'propping up the bar' : 'settling in'; return true; }
  const spot = freeTile(U.ri(RUG.x0, RUG.x1), U.ri(RUG.y0 + 1, RUG.y1), a);
  yield { walk: [spot.x, spot.y] };
  a.activity = 'standing by the fire';
  return false;
}

function mutter(a) {
  let pool;
  if (a.drunk > 0.6) pool = T.SOLO.drunk;
  else if (a.needs.thirst > 0.75) pool = T.SOLO.thirsty;
  else if (a.needs.hunger > 0.75) pool = T.SOLO.hungry;
  else pool = T.SOLO[a.role] || (a.solo ? [...a.solo, ...T.SOLO.local] : T.SOLO.local);
  say(a, U.pick(pool));
}

export function deliver(o) {
  o.seat.mug = { kind: o.kind, level: 1, owner: o.a.id };
  o.a.served = true;
  pay(o.a, PRICE[o.kind] || 2);
  Sfx.clunk();
}

function* order(a, what) {
  a.served = false; a.hand = what;
  a.activity = what === 'stew' ? 'waiting for stew' : 'waiting for a drink';
  const o = { a, kind: what, seat: a.seat, state: 'wait', t: G.t };
  if (a.seat.bar) G.pours.push(o); else G.orders.push(o);
  yield { cond: () => a.served || a.seat !== o.seat, max: 70 };
  a.hand = null;
  if (!a.served) {
    o.state = 'gone'; removeFrom(G.orders, o); removeFrom(G.pours, o);
    if (a.present) say(a, U.pick(['Forget it, then.', 'Is anyone working tonight?', 'I could have brewed it myself by now.']));
    a.mood -= 0.1;
    return;
  }
  a.activity = what === 'stew' ? 'eating stew' : what === 'wine' ? 'sipping wine' : 'nursing an ale';
  if (what === 'stew') a.ate = true;
}

function* payRoom(a) {
  const spot = freeTile(18, 4, a);
  a.activity = 'asking about rooms';
  yield { walk: [spot.x, spot.y] };
  a.facing = 'f';
  if (a.role === 'adventurer') say(a, 'Rooms for {party}, and hot water if you have it.');
  else say(a, 'A room for the night, please.');
  yield 1.2;
  say(G.keeper, U.pick(['Top of the stairs. A silver a head, breakfast included.', 'Blue door and green door, top of the stairs. Mind the third step.']));
  pay(a, a.role === 'adventurer' ? 10 * G.party.members.length : 10);
  if (a.role === 'adventurer') G.party.members.forEach((m) => (m.paidRoom = true));
  a.paidRoom = true;
  yield 0.8;
}

function* dance(a) {
  const spot = freeTile(U.ri(RUG.x0, RUG.x1), U.ri(RUG.y0, RUG.y1), a);
  a.activity = 'dancing';
  yield { walk: [spot.x, spot.y] };
  a.dance = true; a.facing = 'f';
  yield { cond: () => !G.music.playing, max: U.rf(8, 16) };
  a.dance = false;
  a.mood = Math.min(1, a.mood + 0.15);
}

function* visitFriend(a) {
  const friends = patronsHere().filter((b) => b !== a && b.seat && b.seat.table && b.seat.table !== a.seat?.table && ((a.rel[b.id] ?? 0) > 0.4 || a.love === b.id));
  for (const f of U.shuffle(friends)) {
    const free = f.seat.table.seats.filter((s) => !s.occupant);
    if (!free.length) continue;
    const old = a.seat;
    const ok = yield* sitAt(a, U.pick(free));
    if (ok) {
      if (old && old.occupant === a) old.occupant = null;
      a.activity = `joining ${f.first}`;
      return true;
    }
  }
  return false;
}

function greet(a) {
  const k = G.keeper;
  if (!k.present || k.busy || !U.chance(0.75)) return;
  if (a.role === 'adventurer') { if (a === G.party.members[0]) say(k, U.pick(T.GREET.adventurer)); }
  else if (a.role === 'local') say(k, U.pick(T.GREET.local), {}, a);
  else if (a.role === 'stranger') say(k, '*nods toward the corner booth*');
  else say(k, U.pick(T.GREET.traveler));
}

// ------------------------------------------------------------------ patrons
function* patron(a) {
  a.present = true; a.doneToday = false;
  a.place(P.doorOut.x + (a.enterDx || 0), P.doorOut.y); a.facing = 'b';
  Sfx.door();
  if (G.weather !== 'clear') a.wetUntil = G.t + 25;
  if (a.role === 'adventurer' && a === G.party.members[0]) {
    log(`The ${G.party.name.replace(/^the /, '')} came in out of the ${G.weather === 'clear' ? 'dusk' : 'rain'}: ${G.party.members.map((m) => `${m.first} the ${m.cls}`).join(', ')}.`);
    toast(`Adventurers arrive: ${G.party.name}`);
  }
  if (a.role === 'stranger') log('A cloaked figure slipped into the corner booth. Nobody saw the door open.');
  if (a.role === 'visitor') log(`A traveler came in: ${a.first}, ${a.title}.`);
  yield { walk: [P.door.x, P.door.y - 1] };
  greet(a);
  if (a.lodger && !a.paidRoom && (a.role !== 'adventurer' || a === G.party.members[0])) yield* payRoom(a);
  yield* findSeat(a);
  if (a.role === 'adventurer') G.party.seated = true;

  while (true) {
    if (G.closing >= 2 || G.t >= a.depart) break;
    if (a.sick) { a.activity = 'slumped over the table, pale'; yield 3; continue; }
    if (!a.seat) { yield* findSeat(a); if (!a.seat) { yield U.rf(3, 6); continue; } }
    if (!a.sitting) { const ok = yield* sitAt(a, a.seat); if (!ok) { a.seat = null; } continue; }
    const m = a.seat.mug;
    const empty = !m || m.level <= 0.02 || m.owner !== a.id;
    if (empty && a.needs.hunger > 0.6 && !a.ate && a.coin >= 3 && G.closing < 1) { yield* order(a, 'stew'); continue; }
    if (empty && a.needs.thirst > 0.3 && G.closing < 1 && a.coin >= 2) { yield* order(a, a.pref || 'ale'); continue; }
    if (empty && G.closing === 1 && a.coin >= 2 && !a.lastOrders && U.chance(0.7)) { a.lastOrders = true; yield* order(a, a.pref || 'ale'); continue; }
    if (!empty) a.activity = m.kind === 'stew' ? 'eating stew' : m.kind === 'wine' ? 'sipping wine' : a.drunk > 0.6 ? 'drinking deep' : 'nursing an ale';
    if (G.music.playing && a.drunk > 0.28 && !a.convo && a.role !== 'adventurer' && U.chance(0.12)) { yield* dance(a); continue; }
    if (!a.convo && U.chance(0.04)) { if (yield* visitFriend(a)) continue; }
    if (!a.convo && U.chance(0.12) && a.role !== 'stranger') mutter(a);
    if (a.role === 'stranger' && U.chance(0.06)) say(a, U.pick(T.SOLO.stranger));
    yield U.rf(2, 5);
  }
  if (a.drunk > 0.7) log(`${a.first} weaved off into the night, singing.`);
  if (a.lodger) yield* goUpstairs(a); else yield* exitDoor(a);
  a.doneToday = true;
}

// ------------------------------------------------------------------ staff
function* keeper(a) {
  a.present = true; a.place(P.keeper.x, P.keeper.y); a.facing = 'f';
  while (true) {
    if (G.closing >= 3) { a.activity = 'locking up'; yield { walk: [P.kitchen.x, P.kitchen.y] }; a.present = false; return; }
    if (G.brawl && !G.brawl.handled) { yield* breakUp(a, G.brawl); continue; }
    const o = G.pours.find((o) => o.state === 'wait' || o.state === 'pour');
    if (o && o.state === 'wait') {
      o.state = 'pouring';
      a.activity = 'drawing a drink';
      yield { walk: [o.seat.behind.x, o.seat.behind.y] };
      a.facing = o.seat.y === 9 ? 'f' : 'f';
      yield 0.8;
      if (o.a.present && o.a.seat === o.seat) deliver(o);
      o.state = 'done'; removeFrom(G.pours, o);
      continue;
    }
    if (o && o.state === 'pour') {
      o.state = 'pouring';
      a.activity = o.kind === 'wine' ? 'decanting wine' : 'drawing ale from the barrel';
      yield { walk: [P.pour.x, P.pour.y] };
      yield 0.8;
      yield { walk: [P.handoff.x, P.handoff.y] };
      o.ready = true;
      yield { cond: () => o.picked || o.state === 'gone', max: 12 };
      removeFrom(G.pours, o);
      continue;
    }
    if (a.tx !== P.keeper.x || a.ty !== P.keeper.y) yield { walk: [P.keeper.x, P.keeper.y] };
    a.facing = 'f';
    a.activity = U.pick(['polishing a tankard', 'wiping down the bar', 'counting the till', 'keeping an eye on the room']);
    if (U.chance(0.05)) say(a, U.pick(T.SOLO.keeper));
    yield U.rf(0.8, 2);
  }
}

function* breakUp(a, br) {
  a.busy = true; a.activity = 'breaking up a fight';
  const spot = freeTile(Math.round((br.a.tx + br.b.tx) / 2), Math.round((br.a.ty + br.b.ty) / 2) + 1, a);
  a.speed = 4;
  yield { walk: [spot.x, spot.y] };
  a.speed = 2.6;
  say(a, U.pick(['Not in MY common room!', 'Enough! Both of you!', 'Oi! Break it up!']), { loud: true });
  yield 1;
  const out = br.a.drunk >= br.b.drunk ? br.a : br.b;
  say(a, `Out, ${out.first}. Go home and sleep it off.`, { loud: true });
  br.handled = true; br.ejected = out;
  log(`${a.first} threw ${out.first} out into the ${G.weather === 'clear' ? 'night' : 'rain'}.`);
  yield 2;
  G.brawl = null;
  a.busy = false;
}

function* brawler(a, foe, first) {
  a.busy = true; a.sitting = false; a.activity = `brawling with ${foe.first}`;
  if (a.convo) endConvo(a.convo);
  const spot = freeTile(a.tx + (first ? 0 : 1), a.ty + 1, a);
  yield { walk: [spot.x, spot.y] };
  a.shake = 1;
  say(a, first ? U.pick(['Say that again!', 'You want to take this outside?']) : U.pick(['Gladly!', 'Come on, then!']), { loud: true });
  for (let i = 0; i < 6 && G.brawl && !G.brawl.handled; i++) {
    puff('dust', a.x, a.y - 2, 3, { spread: 6, vy: -6 });
    if (i === 2) say(a, U.pick(['Oof!', 'Get off me!', 'My nose!', 'Hold still!', 'Not the face!']), { loud: true });
    if (i === 1) Sfx.clunk();
    yield 0.8;
  }
  yield { cond: () => !G.brawl || G.brawl.handled, max: 15 };
  a.shake = 0; a.busy = false;
  const ejected = G.brawl ? G.brawl.ejected === a : a.mood < 0.1;
  a.mood = 0.05;
  if (ejected || (G.brawlLast && G.brawlLast.ejected === a)) a.depart = G.t;
}

function* maid(a) {
  a.present = true; a.place(P.maidIdle.x, P.maidIdle.y);
  while (true) {
    if (G.closing >= 3) { a.activity = 'off to bed'; yield { walk: [P.kitchen.x, P.kitchen.y] }; a.present = false; return; }
    const o = G.orders.find((o) => o.state === 'wait');
    if (o) { yield* serveOrder(a, o); continue; }
    const e = seats.find((s) => s.mug && s.mug.level <= 0.02 && (!s.occupant || s.mug.owner !== s.occupant.id) && !s.clearing);
    if (e && U.chance(0.6)) { yield* clearMug(a, e); continue; }
    if (a.tx !== P.maidIdle.x || a.ty !== P.maidIdle.y) yield { walk: [P.maidIdle.x, P.maidIdle.y] };
    a.activity = U.pick(['catching a breath', 'watching the room', 'tallying the slate']);
    if (U.chance(0.04)) say(a, U.pick(T.SOLO.maid));
    yield U.rf(0.8, 2);
  }
}

function* serveOrder(a, o) {
  o.state = 'taking';
  a.activity = 'taking an order';
  const s = o.seat.serve;
  yield { walk: [s.x, s.y] };
  if (!o.a.present || o.a.seat !== o.seat || o.a.served) { o.state = 'gone'; removeFrom(G.orders, o); return; }
  say(a, U.pick(T.ORDER_ASK));
  yield 0.7;
  say(o.a, U.pick(T.ORDER_SAY[o.kind]));
  yield 0.5;
  a.activity = o.kind === 'stew' ? 'fetching stew from the kitchen' : 'fetching a drink';
  if (o.kind === 'stew') G.kitchen.push(o); else { o.state = 'pour'; G.pours.push(o); }
  yield { walk: [P.pickup.x, P.pickup.y] };
  a.facing = 'b';
  yield { cond: () => o.ready || o.state === 'gone', max: 25 };
  o.picked = true; removeFrom(G.pours, o);
  if (o.state === 'gone') { removeFrom(G.orders, o); return; }
  a.carry = o.kind;
  a.activity = o.kind === 'stew' ? 'carrying a steaming bowl' : 'carrying a brimming tankard';
  const s2 = o.seat.serve;
  yield { walk: [s2.x, s2.y] };
  a.carry = null;
  if (o.a.present && o.a.seat === o.seat && !o.a.served) {
    deliver(o);
    if (U.chance(0.3)) say(a, U.pick(['There you are.', "Mind, it's hot.", 'Enjoy.', "That's two coppers, thank you kindly."]));
  }
  o.state = 'done'; removeFrom(G.orders, o);
}

function* clearMug(a, s) {
  s.clearing = true;
  a.activity = 'clearing tankards';
  yield { walk: [s.serve.x, s.serve.y] };
  if (s.mug && s.mug.level <= 0.02) { s.mug = null; a.carry = 'empty'; }
  s.clearing = false;
  if (a.carry) { yield { walk: [P.pickup.x, P.pickup.y] }; a.carry = null; }
}

function* potboy(a) {
  a.present = true; a.place(14, 9);
  let nextFire = G.t + U.rf(30, 60);
  while (true) {
    if (G.closing >= 2 && fixtures.some((f) => f.lit) && !patronsHere().length) { yield* snuffAll(a); continue; }
    if (G.closing >= 3 && !fixtures.some((f) => f.lit)) { a.activity = 'off to bed'; yield { walk: [P.kitchen.x, P.kitchen.y] }; a.present = false; return; }
    if (!G.lit && G.t >= G.dayStart + 105) {
      G.lit = true;
      log(`${a.first} went table to table with a taper, lighting the candles.`);
      yield* lightAll(a); continue;
    }
    if (G.t >= nextFire && G.closing < 2) { yield* feedFire(a); nextFire = G.t + U.rf(60, 100); continue; }
    const waiting = G.orders.filter((o) => o.state === 'wait');
    if (waiting.length >= 2) { yield* serveOrder(a, waiting[waiting.length - 1]); continue; }
    const e = seats.find((s) => s.mug && s.mug.level <= 0.02 && (!s.occupant || s.mug.owner !== s.occupant.id) && !s.clearing);
    if (e) { yield* clearMug(a, e); continue; }
    if (U.chance(0.3)) { yield* sweep(a); continue; }
    const spot = freeTile(U.ri(7, 12), 4, a);
    yield { walk: [spot.x, spot.y] };
    a.activity = 'warming by the fire';
    if (U.chance(0.05)) say(a, U.pick(T.SOLO.potboy));
    yield U.rf(2, 4);
  }
}

function orderFixtures(a, lit) {
  const todo = fixtures.filter((f) => f.lit === lit);
  const out = [];
  let cx = a.tx, cy = a.ty;
  while (todo.length) {
    todo.sort((p, q) => Math.hypot(p.serve.x - cx, p.serve.y - cy) - Math.hypot(q.serve.x - cx, q.serve.y - cy));
    const f = todo.shift(); out.push(f); cx = f.serve.x; cy = f.serve.y;
  }
  return out;
}
function* lightAll(a) {
  a.carry = 'taper';
  for (const f of orderFixtures(a, false)) {
    a.activity = 'lighting candles';
    yield { walk: [f.serve.x, f.serve.y] };
    yield 0.35;
    f.lit = true;
    puff('spark', f.x, f.y - 3, 4, { vy: -10, spread: 1 });
  }
  a.carry = null;
}
function* snuffAll(a) {
  for (const f of orderFixtures(a, true)) {
    a.activity = 'snuffing candles';
    yield { walk: [f.serve.x, f.serve.y] };
    yield 0.3;
    f.lit = false;
    puff('smoke', f.x, f.y - 4, 3, { vy: -6, life: 2 });
  }
}
function* feedFire(a) {
  a.activity = 'hauling a log for the fire';
  a.carry = 'log';
  const spot = freeTile(U.pick([9, 10]), 3, a);
  yield { walk: [spot.x, spot.y] };
  a.facing = 'b';
  yield 0.8;
  a.carry = null;
  G.fire = Math.min(1.3, G.fire + 0.55);
  puff('spark', 160, 40, 16, { spread: 14, vy: -22, life: 1.6 });
  Sfx.whoomph();
  a.activity = 'feeding the fire';
  yield 1;
}
function* sweep(a) {
  let x, y;
  do { x = U.ri(3, 18); y = U.ri(3, 14); } while (kind[y][x] !== 'floor' && kind[y][x] !== 'rug');
  a.activity = 'sweeping';
  yield { walk: [x, y] };
  a.carry = 'broom';
  for (let i = 0; i < 4; i++) { puff('dust', a.x - 5, a.y, 2, { spread: 3, vy: -3 }); yield 0.5; }
  a.carry = null;
}

function* cook(a) {
  a.present = false;
  while (true) {
    if (!G.kitchen.length) { yield { cond: () => G.kitchen.length > 0 }; continue; }
    const o = G.kitchen.shift();
    yield U.rf(2, 4);
    a.present = true; a.place(P.kitchen.x, P.kitchen.y); a.carry = 'stew'; a.facing = 'f';
    a.activity = 'bringing out stew';
    yield { walk: [P.handoff.x, P.handoff.y] };
    o.ready = true;
    say(a, U.pick(['Stew up!', 'Order up!', 'Hot bowl!']));
    yield { cond: () => o.picked || o.state === 'gone', max: 15 };
    a.carry = null;
    if (U.chance(0.25)) say(a, U.pick(['If they complain, they can cook it themselves.', 'Has anyone seen my good knife?', "There's more where that came from."]));
    yield { walk: [P.kitchen.x, P.kitchen.y] };
    a.present = false;
  }
}

const SONGS = ['The Ballad of the Drowned King', 'Nine Barrels Down', 'Where the Wyvern Sleeps', "The Miller's Three Daughters", 'Lantern on the Moor', 'Last Ferry to {town2}', 'The Crooked Crown', "Old Gammer's Goose", 'The Maid of {place}'];

function* bard(a) {
  a.present = true; a.place(P.doorOut.x, P.doorOut.y); a.facing = 'b';
  Sfx.door();
  log(`${a.first} the bard arrived, lute on their back.`);
  yield { walk: [P.door.x, P.door.y - 1] };
  greet(a);
  yield* findSeat(a);
  yield* order(a, 'ale');
  yield { cond: () => G.t >= G.dayStart + 240 || G.closing > 0 };
  while (G.t < G.dayStart + 460 && G.closing < 1) {
    a.carry = 'lute'; a.activity = 'tuning up';
    yield { walk: [P.stage.x, P.stage.y] };
    a.facing = 'f'; a.sitting = false;
    const song = U.fill(U.pick(SONGS), tvars(a));
    G.music = { playing: true, bard: a, song, start: G.t };
    log(`${a.first} struck up “${song}”.`);
    say(a, `This one's called “${song}”.`, { loud: true });
    a.activity = `playing “${song}”`;
    yield U.rf(28, 42);
    G.music = { playing: false };
    say(a, U.pick(['Thank you, thank you! A short rest for these fingers.', "You've been lovely. Back shortly.", 'A drink for the bard, and then another song!']), { loud: true });
    // tips
    for (const p of patronsHere()) if (p !== a && p.mood > 0.5 && p.coin > 2 && U.chance(0.35)) { p.coin -= 1; a.coin += 1; puff('coin', p.x, p.y - 16, 1, { vy: -12, life: 0.8, jit: 0 }); }
    a.carry = null;
    if (a.seat) yield* sitAt(a, a.seat); else yield* findSeat(a);
    a.activity = 'resting between sets';
    yield U.rf(12, 18);
  }
  a.activity = 'counting tips';
  yield { cond: () => G.t >= a.depart || G.closing >= 2 };
  yield* exitDoor(a);
  a.doneToday = true;
}

function* cat(a) {
  a.present = true; a.place(9, 4); a.pose = 'sleep';
  while (true) {
    const r = Math.random();
    if (r < 0.35) {
      const spot = freeTile(U.ri(8, 11), U.ri(3, 4), a);
      a.pose = null; yield { walk: [spot.x, spot.y] };
      a.pose = 'sleep'; a.activity = 'asleep by the hearth';
      yield U.rf(20, 50);
    } else if (r < 0.55) {
      const free = seats.filter((s) => !s.occupant && !s.bar);
      if (free.length) {
        const s = U.pick(free);
        a.pose = null; yield { walk: [s.x, s.y] };
        a.pose = 'sit'; a.activity = 'claiming an empty chair';
        yield { cond: () => !!s.occupant, max: U.rf(8, 20) };
      }
    } else if (r < 0.7 && G.music.playing) {
      const spot = freeTile(4, 4, a);
      a.pose = null; yield { walk: [spot.x, spot.y] };
      a.pose = 'sit'; a.activity = 'listening to the music, tail twitching';
      yield U.rf(8, 14);
    } else {
      let x, y;
      do { x = U.ri(2, 23); y = U.ri(3, 14); } while (!walkable(x, y) || kind[y][x] === 'stairs' || kind[y][x] === 'flag');
      a.pose = null; a.activity = 'prowling';
      yield { walk: [x, y] };
      a.pose = 'sit'; a.activity = U.pick(['washing a paw', 'staring at nothing', 'judging everyone']);
      yield U.rf(3, 8);
    }
  }
}

// ------------------------------------------------------------------ conversations
function talkCtx() {
  const h = U.hourOf(G.t);
  return {
    weather: G.weather, music: G.music.playing, late: G.t - G.dayStart > 480, dark: h >= 19 || h < 6,
    strangerHere: G.stranger && G.stranger.present, advHere: G.agents.some((a) => a.present && a.role === 'adventurer'),
    hasX: patronsHere().filter((p) => p.role === 'local' || p.role === 'visitor').length >= 3,
    bard: !!(G.bard && G.bard.present),
    rel: (p, q) => p.rel[q.id] ?? 0,
  };
}
function canTalk(a) {
  return a.present && a.kind === 'person' && !a.convo && !a.busy && !a.path && !a.sick && !a.dance && a.role !== 'cook'
    && !(a.role === 'bard' && G.music.playing) && a.role !== 'stranger';
}
function convoTick(dt) {
  const people = G.agents.filter(canTalk);
  const ctx = talkCtx();
  for (const a of people) {
    if (a.convo) continue;
    const staffish = STAFF.includes(a.role);
    const rate = staffish ? 0.025 : 0.04 + a.needs.social * 0.12;
    if (!U.chance(rate * dt)) continue;
    const partners = people.filter((b) => b !== a && !b.convo && distT(a, b) <= 2.35);
    if (!partners.length) continue;
    const b = U.pick(partners);
    const ex = T.pickExchange(a, b, ctx);
    if (!ex) continue;
    startConvo(ex.first, ex.second, ex.e);
  }
  for (const c of [...G.convos]) {
    const { a, b } = c;
    if (!a.present || !b.present || a.path || b.path || a.busy || b.busy || distT(a, b) > 3) { endConvo(c); continue; }
    if (G.t < c.next) continue;
    if (c.i >= c.e.lines.length) { endConvo(c, true); continue; }
    const sp = c.i % 2 === 0 ? a : b;
    const text = cap(U.fill(c.e.lines[c.i], c.vars));
    speak(sp, text, { loud: c.e.loud });
    if (c.e.tags.includes('dice') && c.i === c.e.lines.length - 1 && a.seat?.table) {
      const t = a.seat.table;
      if (!t.extra.includes('dice')) t.extra.push('dice');
      Sfx.dice();
    }
    c.i++;
    c.next = G.t + 0.9 + text.length / 24;
  }
}
function startConvo(a, b, e) {
  const c = { a, b, e, i: 0, next: G.t + 0.2, vars: tvars(a, b) };
  a.convo = c; b.convo = c; e.used = true;
  G.convos.push(c);
}
export function endConvo(c, completed = false) {
  if (c.a.convo === c) c.a.convo = null;
  if (c.b.convo === c) c.b.convo = null;
  removeFrom(G.convos, c);
  if (!completed) return;
  const d = c.e.sour ? -0.1 : 0.05;
  for (const [p, q] of [[c.a, c.b], [c.b, c.a]]) {
    p.needs.social = Math.max(0, p.needs.social - 0.35);
    p.rel[q.id] = U.clamp((p.rel[q.id] ?? 0) + d, -1, 1);
    p.mood = U.clamp(p.mood + (c.e.sour ? -0.1 : 0.04), 0, 1);
  }
  if (c.e.tags.includes('rom')) puff('heart', (c.a.x + c.b.x) / 2, Math.min(c.a.y, c.b.y) - 20, 1, { vy: -8, life: 1.6, jit: 1 });
  if (c.e.sour && c.a.drunk > 0.45 && c.b.drunk > 0.45 && !G.brawl && U.chance(0.55)) startBrawl(c.a, c.b);
}
function startBrawl(a, b) {
  if (a.busy || b.busy || a.plotRole || b.plotRole) return;
  G.brawl = { a, b, handled: false };
  G.brawlLast = G.brawl;
  log(`${a.first} and ${b.first} came to blows. Tankards went flying.`);
  toast(`A brawl! ${a.first} and ${b.first} are at it`, 'alarm');
  a.interrupt(brawler(a, b, true));
  b.interrupt(brawler(b, a, false));
}

// ------------------------------------------------------------------ the cast
const FIRST = ['Hobb', 'Marta', 'Tobin', 'Wenna', 'Aldo', 'Bree', 'Cedric', 'Elsa', 'Garrick', 'Hilde', 'Jory', 'Kestrel', 'Lotte', 'Merek', 'Nell', 'Osric', 'Pell', 'Rosamund', 'Sten', 'Tamsin', 'Ulf', 'Wat', 'Yara', 'Anselm', 'Brannoc', 'Dagna', 'Ewan', 'Fenna', 'Gil', 'Isolde', 'Joss', 'Maudie', 'Nym', 'Rook', 'Agnes', 'Bram', 'Cora', 'Dunstan', 'Edda', 'Firth', 'Gwen', 'Hal', 'Ivo', 'Jutta', 'Kit', 'Lark', 'Mabyn', 'Ned', 'Orla', 'Piers', 'Quill', 'Rhys', 'Signe', 'Tam', 'Una', 'Wyn', 'Ottilie', 'Bertil', 'Senna', 'Crispin'];
const SUR = ['Tallowmere', 'Applecross', 'Thatchwell', 'Cobble', 'Haycock', 'Pennywhistle', 'Marsh', 'Oakes', 'Greaves', 'Hollin', 'Swale', 'Tanner', 'Wick', 'Fennimore', 'Brackwater', 'Stoat', 'Mossbank', 'Crewe', 'Fairweather', 'Oddsock', 'Ramsbottom', 'Ashdown', 'Nettlebed', 'Quarrie'];
const TRADES = [
  { t: 'the smith', look: { top: '#4e4a44', build: 'stout', sleeve: '#b07a55', apron: false }, solo: ['Horseshoes tomorrow. Always horseshoes.', 'My arms ache.'] },
  { t: 'the miller', look: { top: '#d6cdb8', legs: '#8a8070' }, solo: ['Flour in my ears again.'] },
  { t: 'a shepherd', look: { top: '#7e5a2c', hat: 'straw' }, solo: ['Sheep are stupid. Lovely, but stupid.'] },
  { t: 'the chandler', look: { top: '#9a7b4f' }, solo: ['Candle wax under my nails, as always.'] },
  { t: 'a weaver', look: { top: '#5a4a6e' }, solo: ['Three bolts by Friday. Hah.'] },
  { t: 'the tanner', look: { top: '#6b4424' }, solo: ['Nobody sits near me. It is the smell.'] },
  { t: 'a fisher', look: { top: '#3e5f5a', hat: 'kerchief', hatCol: '#8c4a2a' }, solo: ['River was generous today.'] },
  { t: 'the ferryman', look: { top: '#2f4a5e', cloak: '#3a3226' }, solo: ['Two coppers to cross. Always two coppers.'] },
  { t: 'an old soldier', look: { top: '#6b2f2a', hairStyle: 'bald', beard: 'short' }, solo: ['My leg aches. Rain coming.', 'I remember the siege at {town2}.'] },
  { t: 'the herbalist', look: { top: '#3f5a3a', hairStyle: 'long' }, solo: ['Nettle, dock, feverfew...'] },
  { t: 'the baker', look: { apron: true, top: '#8a6a3a' }, solo: ['Up before the sun tomorrow. Why do I do this.'] },
  { t: 'the cooper', look: { top: '#7e5a2c' }, solo: ['That keg is warped. I can tell from here.'] },
  { t: 'a hunter', look: { top: '#3f5a3a', hat: 'feathercap', hatCol: '#3a4a2a', weapon: 'bow' }, solo: ['Tracks by the mere. Big ones.'] },
  { t: 'the carter', look: { top: '#5d6b3a', hat: 'straw' }, solo: ['That axle will not last the winter.'] },
  { t: 'the gravedigger', look: { top: '#2e3438', hatCol: '#2e3438' }, solo: ['Quiet week. Good for them, bad for me.'] },
  { t: 'the reeve', look: { top: '#2f4a5e', hat: 'cap', hatCol: '#2f4a5e' }, solo: ['Somebody owes the manor three geese.'] },
  { t: 'the village priest', look: { robe: true, top: '#3a3a3a', trim: '#d9d3c6' }, solo: ['Bless this ale. Especially this ale.'] },
  { t: 'a goatherd', look: { top: '#9a7b4f', hairStyle: 'wild' }, solo: ['The brown goat ate my hat.'] },
];

const usedNames = new Set();
function newName() {
  let f; do f = U.pick(FIRST); while (usedNames.has(f) && usedNames.size < FIRST.length - 1);
  usedNames.add(f);
  return { first: f, name: `${f} ${U.pick(SUR)}` };
}

function makeLocal(trade) {
  const n = newName();
  const kin = U.chance(0.12) ? U.pick(['dwarf', 'halfling']) : 'human';
  const look = randomLook({ kin, ...trade.look });
  return new Agent({
    ...n, role: 'local', title: trade.t, look, solo: trade.solo,
    fav: U.pick(['A', 'B', 'C', 'D', 'E']), barFly: U.chance(0.3), pref: U.chance(0.2) ? 'wine' : 'ale',
    attend: U.rf(0.55, 0.9), tolerance: U.rf(0.7, 1.4),
    traits: U.shuffle(['gossip', 'grumbler', 'merry', 'pious', 'greedy', 'shy', 'sharp-eyed', 'thirsty', 'romantic', 'storyteller', 'nervous', 'honest']).slice(0, 2),
  });
}

export function createCast() {
  G.keeper = new Agent({ ...newName(), role: 'keeper', title: 'the innkeeper', staff: true, look: randomLook({ build: 'stout', apron: true, top: '#7a3d52', hairStyle: U.pick(['bald', 'short', 'bun']) }) });
  G.maid = new Agent({ ...newName(), role: 'maid', title: 'who serves the tables', staff: true, speed: 3, look: randomLook({ apron: true, hat: 'kerchief', hatCol: '#b8452a', build: 'thin', beard: false }) });
  G.potboy = new Agent({ ...newName(), role: 'potboy', title: 'the pot-boy', staff: true, speed: 3, look: randomLook({ build: 'thin', bodyH: 5, hairStyle: 'wild', beard: false, top: '#8a6a3a' }) });
  G.cook = new Agent({ ...newName(), role: 'cook', title: 'the cook', staff: true, look: randomLook({ apron: true, hat: 'coif', build: 'stout', top: '#55504a' }) });
  G.bard = new Agent({ ...newName(), role: 'bard', title: 'a wandering bard', look: randomLook({ hat: 'cap', hatCol: '#2f4a5e', top: '#8c4a2a', sleeve: '#c9a64a', cloak: '#5a2a3a', beard: false }) });
  G.stranger = new Agent({ name: 'The Stranger', first: 'the stranger', role: 'stranger', title: 'a hooded figure in the corner', look: randomLook({ kin: 'human', hat: 'hood', shadowFace: true, cloak: '#2c3a2c', hatCol: '#2c3a2c', top: '#3a3226', weapon: 'sword', build: 'thin', legH: 4 }) });
  G.cat = new Agent({ name: U.pick(['Old Pudding', 'Sir Whiskers', 'Mogg', 'Cinders', 'Ratbane', 'The Duchess']), role: 'cat', kind: 'cat', title: 'the inn cat', speed: 3.2, catCol: U.pick(['#c8752f', '#6a6a6a', '#2a2420', '#d8cfc0']) });
  G.cat.first = G.cat.name;

  G.locals = U.shuffle([...TRADES]).slice(0, 13).map(makeLocal);
  const L = G.locals;
  for (const a of L) for (const b of L) if (a !== b && a.rel[b.id] === undefined) { const r = U.rf(-0.15, 0.5); a.rel[b.id] = r; b.rel[a.id] = r + U.rf(-0.1, 0.1); }
  const sh = U.shuffle([...L]);
  sh[0].love = sh[1].id; sh[1].love = sh[0].id; sh[0].rel[sh[1].id] = sh[1].rel[sh[0].id] = 0.9;
  for (const [a, b] of [[sh[2], sh[3]], [sh[4], sh[5]]]) { a.rel[b.id] = b.rel[a.id] = -0.7; a.rival = b.id; b.rival = a.id; a.tolerance = b.tolerance = 1.5; }
  for (const [a, b] of [[sh[6], sh[7]], [sh[8], sh[9]]]) { a.rel[b.id] = b.rel[a.id] = 0.75; }
}

const CLASSES = [
  { cls: 'sellsword', kin: ['human', 'human', 'dwarf'], look: { hat: 'helm', chain: true, weapon: 'sword', build: 'stout' } },
  { cls: 'hedge-wizard', kin: ['human', 'elf'], look: { robe: true, hat: 'wizard', weapon: 'staff' }, colors: ['#2f3a6e', '#5a2a6e', '#2a4a4a'] },
  { cls: 'scout', kin: ['elf', 'halfling', 'human'], look: { hat: 'hood', weapon: 'bow', cloak: '#3a4a2a', hatCol: '#3a4a2a' } },
  { cls: 'cleric of the Dawn', kin: ['human', 'dwarf'], look: { robe: true, top: '#d6cdb8', trim: '#c9a64a', holy: true, hat: 'coif' } },
  { cls: 'axe-sworn', kin: ['dwarf'], look: { weapon: 'axe', hat: 'helm', chain: true } },
  { cls: 'duelist', kin: ['human', 'elf', 'halfling'], look: { hat: 'feathercap', weapon: 'sword', cloak: '#6b2f2a', hatCol: '#6b2f2a' } },
];
const PARTY_ADJ = ['Broken', 'Seventh', 'Last', 'Silver', 'Wandering', 'Crimson', 'Lucky', 'Unwashed', 'Tarnished'];
const PARTY_NOUN = ['Spur', 'Lantern', 'Oath', 'Hound', 'Crown', 'Candle', 'Road', 'Kettle', 'Shield'];

function makeParty() {
  const n = U.ri(3, 4);
  const classes = U.shuffle([...CLASSES]).slice(0, n);
  if (!classes.some((c) => c.cls === 'sellsword' || c.cls === 'axe-sworn')) classes[0] = CLASSES[0];
  const party = { name: `the Company of the ${U.pick(PARTY_ADJ)} ${U.pick(PARTY_NOUN)}`, members: [], seated: false };
  const arrive = G.dayStart + U.ri(80, 180);
  const depart = G.dayStart + U.ri(470, 560);
  classes.forEach((c, i) => {
    const kin = U.pick(c.kin);
    const look = randomLook({ kin, ...c.look, ...(c.colors ? { top: U.pick(c.colors), hatCol: U.pick(c.colors) } : {}) });
    const a = new Agent({
      ...newName(), role: 'adventurer', cls: c.cls, title: `${kin === 'human' ? '' : kin + ' '}${c.cls} of ${party.name}`,
      look, arrive: arrive + i * 0.6, depart: depart + i * 3, lodger: true, enterDx: 0, coin: U.ri(20, 60),
      pref: c.cls === 'hedge-wizard' ? 'wine' : 'ale', tolerance: U.rf(0.8, 1.2), brain: patron,
    });
    party.members.push(a);
  });
  for (const a of party.members) for (const b of party.members) if (a !== b) a.rel[b.id] = U.rf(0.3, 0.8);
  return party;
}

const VISITORS = [
  { t: 'a wool merchant from {town2}', look: { top: '#7a3d52', hat: 'cap', hatCol: '#7a3d52', cloak: '#3a2a3a' }, pref: 'wine' },
  { t: 'a pilgrim bound for {place}', look: { robe: true, top: '#6b4424', hat: 'hood', hatCol: '#6b4424' } },
  { t: 'a tinker with a clanking pack', look: { top: '#5d6b3a', hairStyle: 'wild' } },
  { t: "a courier in the Margrave's colors", look: { top: '#2f4a5e', cloak: '#c9a64a', hat: 'cap', hatCol: '#c9a64a' } },
  { t: 'a traveling physician', look: { top: '#2e3438', cloak: '#2e3438', hat: 'wizard', hatCol: '#2e3438' } },
  { t: 'a drover bringing cattle south', look: { top: '#7e5a2c', hat: 'straw' } },
];

export function makeVisitor(spec = U.pick(VISITORS), o = {}) {
  const look = randomLook({ ...spec.look });
  return new Agent({
    ...newName(), role: 'visitor', title: U.fill(spec.t, tvars()), look, pref: spec.pref || 'ale',
    lodger: U.chance(0.5), brain: patron, tolerance: 1, ...o,
  });
}

// ------------------------------------------------------------------ the day
export function startDay(d) {
  G.day = d;
  G.dayStart = (d - 1) * 1440 + 960;
  G.t = G.dayStart;
  Object.assign(G, { closing: 0, lit: false, music: { playing: false }, orders: [], pours: [], kitchen: [], convos: [], brawl: null, brawlLast: null, clues: [], heard: [], fire: 0.85, dawnAt: null, dawnShown: false, items: [], sel: null, ear: null });
  G.weather = U.weighted(['clear', 'rain', 'storm'], (w) => ({ clear: 5, rain: 3.5, storm: 1.5 })[w]);
  for (const f of fixtures) f.lit = false;
  for (const s of seats) { s.occupant = null; s.mug = null; s.clearing = false; s.reserved = null; }
  for (const t of tables) t.extra = [];

  const reset = (a) => Object.assign(a, {
    present: false, doneToday: false, gen: null, stack: [], wait: null, path: null, seat: null, sitting: false,
    drunk: 0, served: false, ate: false, hand: null, carry: null, convo: null, busy: false, dance: false, shake: 0,
    sick: false, bubble: null, paidRoom: false, lastOrders: false, plotRole: null, depart: Infinity,
    needs: { thirst: U.rf(0.35, 0.8), hunger: U.rf(0.1, 0.7), social: U.rf(0.3, 0.9) }, mood: U.rf(0.45, 0.8),
  });

  G.agents = [];
  for (const s of [G.keeper, G.maid, G.potboy, G.cook, G.cat]) { reset(s); G.agents.push(s); }
  G.keeper.start(keeper(G.keeper));
  G.maid.start(maid(G.maid));
  G.potboy.start(potboy(G.potboy));
  G.cook.start(cook(G.cook));
  G.cat.start(cat(G.cat));

  let early = 0;
  for (const a of G.locals) {
    reset(a);
    a.brain = patron;
    if (!U.chance(a.attend)) { a.arrive = null; continue; }
    a.arrive = G.dayStart + (early < 2 && U.chance(0.4) ? (early++, U.ri(0, 12)) : U.ri(15, 270));
    a.depart = Math.min(G.dayStart + 598, a.arrive + U.ri(150, 430));
    a.coin = U.ri(6, 24);
    a.brain = patron;
    G.agents.push(a);
  }
  G.party = makeParty();
  G.agents.push(...G.party.members);
  for (const v of Array.from({ length: U.ri(1, 2) }, () => makeVisitor())) {
    v.arrive = G.dayStart + U.ri(40, 300);
    v.depart = G.dayStart + U.ri(420, 590);
    G.agents.push(v);
  }
  reset(G.stranger);
  if (d === 1 || U.chance(0.7)) {
    G.stranger.arrive = G.dayStart + U.ri(40, 170);
    G.stranger.depart = G.dayStart + U.ri(470, 590);
    G.stranger.fixedSeat = seats.find((s) => s.x === 1 && s.y === 13);
    G.stranger.fixedSeat.reserved = G.stranger;
    G.stranger.brain = patron; G.stranger.pref = 'ale'; G.stranger.pipe = true;
    G.agents.push(G.stranger);
  }
  reset(G.bard);
  if (d === 1 || U.chance(0.85)) {
    G.bard.arrive = G.dayStart + U.ri(150, 200);
    G.bard.depart = G.dayStart + U.ri(500, 590);
    G.bard.brain = bard;
    G.agents.push(G.bard);
  }
  G.plot = setupPlot();
  emit('day', d);
  log(`Evening of day ${d} in ${lore.town}. ${{ clear: 'A cold, clear night coming on.', rain: 'Rain drumming on the shutters.', storm: 'A storm rolling in off the hills.' }[G.weather]}`);
}

export function spawnPlotAgent(a) { G.agents.push(a); }

// ------------------------------------------------------------------ tick
export function update(dt) {
  G.t += dt;
  const m = G.t - G.dayStart;

  for (const a of G.agents) {
    if (!a.present && !a.gen && !a.doneToday && a.arrive != null && G.t >= a.arrive && a.brain) a.start(a.brain(a));
  }
  for (const a of G.agents) if (a.gen || a.present) a.update(dt);

  // bodies: drinking, eating, thirst
  for (const a of G.agents) {
    if (!a.present || a.kind !== 'person' || STAFF.includes(a.role)) continue;
    a.needs.thirst = Math.min(1, a.needs.thirst + dt * 0.007);
    a.needs.hunger = Math.min(1, a.needs.hunger + dt * 0.0022);
    a.needs.social = Math.min(1, a.needs.social + dt * 0.004);
    const mg = a.seat && a.seat.mug;
    if (a.sitting && mg && mg.owner === a.id && mg.level > 0) {
      const rate = mg.kind === 'stew' ? 1 / 14 : 1 / 22;
      mg.level = Math.max(0, mg.level - dt * rate);
      if (mg.kind === 'stew') a.needs.hunger = Math.max(0, a.needs.hunger - dt * 0.07);
      else {
        a.needs.thirst = Math.max(0, a.needs.thirst - dt * 0.045);
        a.drunk = Math.min(1.2, a.drunk + dt * (mg.kind === 'wine' ? 0.009 : 0.0068) * (a.tolerance || 1));
      }
      if (mg.kind === 'stew' && U.chance(dt * 0.6)) puff('steam', a.seat.item[0], a.seat.item[1] - 2, 1, { vy: -5, life: 1.4, jit: 1.5 });
    }
    a.drunk = Math.max(0, a.drunk - dt * 0.0012);
    if (a.pipe && a.sitting && U.chance(dt * 0.5)) puff('smoke', a.x + 4, a.y - 17, 1, { vy: -4, vx: 1.5, life: 2.6, jit: 1.5 });
    if (a.wetUntil > G.t && U.chance(dt * 1.5)) puff('drip', a.x + U.rf(-4, 4), a.y - 10, 1, { vy: 6, life: 0.5, jit: 0 });
  }

  // fire burns down; the room gets music notes
  G.fire = Math.max(G.closing >= 3 ? 0.12 : 0.3, G.fire - dt * (G.closing >= 3 ? 0.02 : 0.0035));
  if (U.chance(dt * 2 * G.fire)) puff('spark', U.rf(146, 174), 38, 1, { vy: -18, life: 1.1, jit: 3 });
  if (G.music.playing && U.chance(dt * 1.2)) puff('note', G.music.bard.x + U.rf(-4, 6), G.music.bard.y - 20, 1, { vy: -10, vx: U.rf(-3, 3), life: 2.2, jit: 1 });

  // weather
  if (G.weather === 'storm' && G.flash <= 0 && U.chance(dt * 0.12)) { G.flash = 1; Sfx.thunder(); }

  convoTick(dt);

  // the plot
  if (G.plot) for (const b of G.plot.beats) {
    if (b.done || G.t < b.at) continue;
    if (b.ready && !b.ready()) { b.at += 5; if (b.at > G.dayStart + 590) b.done = true; continue; }
    b.done = true;
    try { b.run(); } catch (e) { console.error('beat', e); }
  }

  // closing time
  if (G.closing === 0 && m >= 570) {
    G.closing = 1; Sfx.bell();
    speak(G.keeper, 'Last orders, friends! Last orders!', { loud: true });
    log('Last orders rang out over the room.');
  }
  if (G.closing === 1 && m >= 600) {
    G.closing = 2; Sfx.bell();
    speak(G.keeper, 'Time, gentles, time! Have you no homes to go to?', { loud: true });
  }
  if (G.closing === 2 && !patronsHere().length && m >= 603) {
    G.closing = 3;
    log('The last guest gone, the staff banked the fire and went up to bed.');
  }
  if (G.closing === 3 && !G.agents.some((a) => a.present && a.kind === 'person')) {
    if (G.dawnAt == null) G.dawnAt = G.t + 12;
    if (G.t >= G.dawnAt && !G.dawnShown) { G.dawnShown = true; emit('dawn'); }
  }
}

export function thoughtOf(a) {
  if (a.kind === 'cat') return U.pick(['...', 'Mrrp.', 'Fish?']);
  if (a.plotThought && U.chance(0.6)) return a.plotThought;
  if (a.hand) return a.hand === 'stew' ? 'Where is that stew?' : 'Where has my drink got to?';
  if (a.sick) return 'The room is spinning...';
  if (a.drunk > 0.8) return 'Everything is lovely. Everyone is lovely.';
  if (a.love) { const l = G.agents.find((x) => x.id === a.love); if (l && l.present) return `${l.first} is here. Don't stare. Don't stare.`; }
  if (a.rival) { const r = G.agents.find((x) => x.id === a.rival); if (r && r.present) return `${r.first} is here. Wonderful.`; }
  if (G.music.playing && a.role !== 'bard') return 'Now this is a tune.';
  if (a.needs.hunger > 0.7) return 'Could eat a horse. Might be one, in that stew.';
  if (a.needs.thirst > 0.7) return 'Throat dry as a crypt.';
  if (a.role === 'keeper') return G.orders.length > 2 ? 'Busy, busy. Good.' : 'Roof needs mending before winter.';
  if (a.role === 'maid') return 'My feet. Oh, my feet.';
  if (a.role === 'potboy') return 'One day I will have an inn of my own.';
  if (a.role === 'stranger') return 'Watching. Always watching.';
  if (a.role === 'adventurer') return U.pick([`Two days to ${lore.places[0]}.`, 'A real bed tonight.', 'I hope the map is right.']);
  if (a.solo) return U.fill(a.solo[0], tvars(a));
  return 'A good fire, a full cup. What more is there?';
}
