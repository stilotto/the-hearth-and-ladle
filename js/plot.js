// Tonight's intrigue. Each night one mystery unfolds as scripted "beats"
// interleaved with ordinary life. Clues are only recorded if the player
// happens to be listening when a beat plays out.
import { G } from './state.js';
import * as U from './util.js';
import { lore, P, seats } from './world.js';
import {
  speak, witness, addClue, log, toast, puff, freeTile, returnToSeat, makeVisitor,
  spawnPlotAgent, endConvo,
} from './sim.js';

const at = (min) => G.dayStart + min;
const time = () => U.fmtTime(G.t);
const settled = (a) => a.present && a.seat && !a.busy && !a.path && !a.sick;

function beat(when, actor, fn, ready) {
  return {
    at: at(when),
    ready: ready || (() => settled(actor)),
    run: () => actor.interrupt(wrap(actor, fn)),
  };
}
function* wrap(a, fn) {
  a.busy = true;
  if (a.convo) endConvo(a.convo);
  try { yield* fn(a); } finally { a.busy = false; }
  if (G.t < a.depart) yield* returnToSeat(a);
}
function* goNear(a, x, y) {
  const s = freeTile(x, y, a);
  yield { walk: [s.x, s.y] };
}
function ensure(a, from = 90, to = 575) {
  if (a.arrive == null || a.arrive > at(from)) a.arrive = at(U.ri(Math.max(10, from - 70), from));
  a.depart = Math.max(a.depart === Infinity ? 0 : a.depart || 0, at(to));
  a.depart = Math.min(a.depart, at(598));
}
function pool() {
  const p = G.agents.filter((a) => (a.role === 'local' || a.role === 'visitor') && a.arrive != null);
  for (const a of U.shuffle(G.locals.filter((l) => l.arrive == null))) {
    if (p.length >= 7) break;
    a.arrive = at(U.ri(20, 120)); a.depart = at(560);
    G.agents.push(a); p.push(a);
  }
  return U.shuffle(p);
}
function roles(list, ...names) { list.forEach((a, i) => (a.plotRole = names[i] || 'suspect')); }

// ------------------------------------------------------------ 1. The Sealed Map
function sealedMap() {
  const party = G.party, lead = party.members[0], second = party.members[1];
  const place = lore.places[0], road = lore.road;
  const factor = makeVisitor(
    { t: 'a factor in grey, soft-spoken', look: { top: '#5e5e62', cloak: '#46464a', hat: 'hood', hatCol: '#56565a', beard: false } },
    { lodger: false, pref: 'wine' },
  );
  factor.arrive = at(U.ri(150, 185)); factor.depart = at(U.ri(410, 440));
  factor.fixedSeat = seats.find((s) => s.x === 17 && s.y === 7);
  factor.fixedSeat.reserved = factor;
  const nearFactor = function* (a) { const s = factor.seat || factor.fixedSeat; yield* goNear(a, s.serve.x, s.serve.y); };
  spawnPlotAgent(factor);

  const stranger = G.agents.includes(G.stranger) ? G.stranger : null;
  const ps = pool();
  let C, H1;
  if (stranger && U.chance(0.2)) { C = stranger; H1 = ps.pop(); }
  else { C = ps.pop(); H1 = stranger || ps.pop(); }
  const H2 = ps.pop(), X = ps.pop();
  const suspects = [C, H1, H2, X].filter(Boolean);
  suspects.forEach((s) => ensure(s));
  roles([C, H1, H2], 'culprit', 'herring', 'herring');
  C.plotThought = 'Silver. Enough silver to leave this town for good.';
  if (H1 === stranger) H1.plotThought = 'Somebody has to keep an eye on those fools.';
  else if (H1) H1.plotThought = 'That scout has a fine bow. What would they take for it?';
  if (H2) H2.plotThought = 'The factor pays poorly, but pays in coin.';

  const beats = [];
  // b1: the culprit listens in while the company talks too loudly
  beats.push(beat(U.ri(185, 215), C, function* (a) {
    a.activity = 'loitering near the adventurers';
    yield* goNear(a, 16, 13);
    a.facing = 'b';
    yield 1;
    speak(lead, `We take ${road} at first light. The map says ${place} is two days north.`, { clue: `${lead.first} told the company, too loudly: "We take ${road} at first light."`, clueKey: 'road' });
    yield 2.5;
    speak(second, 'Keep your voice down. Walls have ears.');
    yield 2.5;
    witness(a, `${a.first} loitered by the adventurers' table while they talked of their road, and didn't touch a drink.`, 'b1');
    yield 2;
  }, () => settled(C) && lead.present && lead.sitting));

  // h1: the herring watches the company too
  if (H1) beats.push(beat(U.ri(220, 250), H1, function* (a) {
    a.activity = 'watching the adventurers';
    yield* goNear(a, 14, 13);
    a.facing = 'b';
    yield 1.5;
    if (a === stranger) speak(a, 'Fools. Talking of roads in a common room.', { whisper: true, clue: `The stranger watched the adventurers, muttering: "Fools. Talking of roads in a common room."`, clueKey: 'h1' });
    else speak(a, "That's a fine bow. Wonder what they'd take for it.", { clue: `${a.first} hovered by the adventurers, admiring their gear, by the sound of it.`, clueKey: 'h1' });
    witness(a, `${a.first} spent a long while watching the adventurers.`, 'h1w');
    yield 4;
  }, () => settled(H1) && lead.present));

  // h2: an innocent haggle with the factor
  if (H2) beats.push(beat(U.ri(262, 280), H2, function* (a) {
    a.activity = 'talking business with the factor';
    yield* nearFactor(a);
    a.facing = 'f';
    speak(a, 'Three silver a bale, and not a copper less.', { clue: `${a.first} haggled with the factor in grey, over bales of wool, it sounded like.`, clueKey: 'h2' });
    yield 1.8;
    speak(factor, 'Two and six. That is my final offer.');
    yield 1.8;
    speak(a, 'Robbery! ...Fine. Two and six.');
    witness(a, `${a.first} had a word with the factor in grey.`, 'h2w');
    yield 1.5;
  }, () => settled(H2) && settled(factor)));

  // b2: the sale, in whispers
  beats.push(beat(U.ri(300, 330), C, function* (a) {
    a.activity = 'having a quiet word';
    yield* nearFactor(a);
    a.facing = 'f';
    const k = { clue: `Overheard ${a.first} whispering to the factor in grey: "They ride by ${road}. First light."`, clueKey: 'b2' };
    speak(a, `They ride by ${road}. First light.`, { whisper: true, ...k });
    yield 1.8;
    speak(factor, 'You are certain?', { whisper: true });
    yield 1.4;
    speak(a, 'Heard it from their own mouths. Now. My silver.', { whisper: true, ...k });
    yield 1.8;
    speak(factor, 'Later. Not here.', { whisper: true });
    witness(a, `${a.first} and the factor in grey put their heads together, whispering.`, 'b2w', 3);
    yield 1;
  }, () => settled(C) && settled(factor)));

  // b3: the purse
  beats.push(beat(U.ri(385, 400), factor, function* (a) {
    const seat = C.seat;
    if (!seat) return;
    a.activity = 'leaving';
    yield { walk: [seat.serve.x, seat.serve.y] };
    const item = { kind: 'purse', x: seat.item[0] + 3, y: seat.item[1] + 1 };
    G.items.push(item);
    witness(a, `On the way out, the factor in grey set a heavy purse down beside ${C.first}.`, 'b3');
    yield 0.6;
    a.depart = G.t;
    // the culprit pockets it
    C.interrupt(wrap(C, function* (c) {
      yield 1.2;
      G.items.splice(G.items.indexOf(item), 1);
      puff('coin', c.x, c.y - 14, 3, { vy: -10, life: 0.8, spread: 3 });
      c.coin += 30;
      witness(c, `${c.first} palmed the purse the factor left behind. It clinked.`, 'b3b');
    }));
  }, () => settled(factor) && settled(C)));

  return {
    title: 'The Sealed Map',
    premise: `${party.name.replace(/^the /, 'The ')} carry a sealed map to ${place}. A factor in grey means to learn their road tonight, and someone in this room is selling.`,
    question: `Who sold the company's road to the factor in grey?`,
    culprit: C, suspects: U.shuffle(suspects), beats,
    right: `At dawn you draw ${lead.first} aside and name ${C.first}. The company changes its road. Nine days later they come back from ${place}, battered and grinning, and buy the whole room a round. ${C.first} doesn't drink with them.`,
    wrong: (n) => `You named ${n}. The company rode out by ${road} at first light. Four days later word reached ${lore.town} of an ambush in the hills. ${C.first} has been buying rounds with new silver ever since.`,
    truth: `${C.first} overheard the company's road, sold it to the factor in a whisper, and pocketed a purse for it.`,
  };
}

// ------------------------------------------------------------ 2. The Stolen Relic
function stolenRelic() {
  const party = G.party;
  const owner = party.members.find((m) => m.cls === 'hedge-wizard') || party.members[0];
  const place = lore.places[1] || lore.places[0];
  const relic = U.pick([`the Moonstone of ${place.replace(/^the /, '')}`, 'the Wyrmglass', 'the Circlet of Saint Ebba', "the Drowned King's Ring"]);
  const ps = pool();
  const C = ps.pop(), H1 = ps.pop();
  let H2 = G.agents.find((a) => a.role === 'visitor' && a.lodger && a !== C && a !== H1 && a.arrive != null) || ps.pop();
  if (H2) H2.lodger = true;
  const X = ps.pop();
  const suspects = [C, H1, H2, X].filter(Boolean);
  suspects.forEach((s) => ensure(s));
  roles([C, H1, H2], 'culprit', 'herring', 'herring');
  C.plotThought = 'Such a light in that stone. Such a light...';
  if (H1) H1.plotThought = 'Worth a farm, that trinket. Two farms.';
  if (H2) H2.plotThought = 'An early night. Long road tomorrow.';
  const beats = [];

  beats.push(beat(U.ri(150, 170), owner, function* (a) {
    const t = a.seat && a.seat.table;
    if (t && !t.extra.includes('relic')) t.extra.push('relic');
    speak(a, `Behold: ${relic}, pulled from the dark under ${place}!`, { loud: true });
    log(`${a.first} of ${party.name} showed ${relic} to the whole room.`);
    yield 2;
  }, () => settled(owner)));

  beats.push(beat(U.ri(180, 205), C, function* (a) {
    a.activity = 'admiring the adventurers\' treasure';
    yield* goNear(a, 16, 13);
    a.facing = 'b';
    const k = { clue: `${a.first} asked to hold ${relic}, and didn't want to give it back.`, clueKey: 'b1' };
    speak(a, `Is that ${relic}? May I hold it?`, k);
    yield 1.8;
    speak(owner, 'Look with your eyes, friend.');
    yield 1.6;
    speak(a, 'Only a look. Such a light in it...', k);
    yield 2;
  }, () => settled(C) && owner.present && owner.sitting));

  if (H1) beats.push(beat(U.ri(210, 235), H1, function* (a) {
    a.activity = 'eyeing the relic';
    yield* goNear(a, 14, 13);
    a.facing = 'b';
    speak(a, 'Pretty trinket. Worth a farm, that.', { clue: `${a.first} remarked that ${relic} was "worth a farm".`, clueKey: 'h1' });
    yield 2.5;
  }, () => settled(H1)));

  beats.push(beat(U.ri(250, 270), owner, function* (a) {
    const t = a.seat && a.seat.table;
    speak(a, 'Best put this somewhere safe.');
    if (t) t.extra = t.extra.filter((e) => e !== 'relic');
    a.carry = 'relic';
    yield { walk: [P.stairsBot.x, P.stairsBot.y] };
    yield { walk: [1, 6], stairs: true };
    a.present = false;
    yield 3;
    a.present = true; a.place(1, 6); a.carry = null;
    yield { walk: [P.stairsBot.x, P.stairsBot.y], stairs: true };
    log(`${a.first} carried ${relic} up to their room.`);
  }, () => settled(owner)));

  beats.push(beat(U.ri(300, 340), C, function* (a) {
    a.activity = 'chatting at the bar';
    yield* goNear(a, 18, 4);
    a.facing = 'f';
    const k = { clue: `${a.first} quietly asked ${G.keeper.first} which room ${owner.first} was sleeping in.`, clueKey: 'b2' };
    speak(a, `Which room is the ${owner.cls} in? I have a message for them.`, { whisper: true, ...k });
    yield 1.6;
    speak(G.keeper, 'Top of the stairs, the blue door. Why?', k);
    yield 1.4;
    speak(a, 'No reason.', { whisper: true });
    yield 1.5;
  }, () => settled(C)));

  if (H2) beats.push(beat(U.ri(380, 400), H2, function* (a) {
    speak(a, 'Early night for me. Long road tomorrow.');
    witness(a, `${a.first} went up the stairs early, at ${time()}.`, 'h2');
    a.depart = G.t;
    yield 0.5;
  }, () => settled(H2)));

  beats.push(beat(U.ri(420, 460), C, function* (a) {
    a.activity = 'slipping away';
    yield { walk: [P.stairsBot.x, P.stairsBot.y] };
    witness(a, `At ${time()}, ${a.first} slipped up the stairs, though ${a.first} has no room here.`, 'b3', 5);
    yield { walk: [P.stairsTop.x, P.stairsTop.y], stairs: true };
    a.present = false;
    yield 4;
    a.present = true; a.place(P.stairsTop.x, P.stairsTop.y);
    yield { walk: [P.stairsBot.x, P.stairsBot.y], stairs: true };
    witness(a, `${a.first} came back down the stairs a few minutes later, one hand in a pocket.`, 'b3b', 5);
  }, () => settled(C) && owner.present));

  return {
    title: 'The Stolen Relic',
    premise: `${owner.first}, ${owner.cls} of ${party.name}, is flaunting ${relic}. By morning it will be gone from their room.`,
    question: `Who stole ${relic}?`,
    culprit: C, suspects: U.shuffle(suspects), beats,
    right: `The keeper's boy finds ${relic} wrapped in a rag in ${C.first}'s coat. ${owner.first} is so relieved they pay for everyone's breakfast. ${C.first} is not invited.`,
    wrong: (n) => `You named ${n}, but ${n}'s pockets turn out empty. ${party.name.replace(/^the /, 'The ')} ride off grim and poorer. A month later ${relic} turns up for sale in ${lore.town2}, sold by ${C.first}.`,
    truth: `${C.first} coveted the relic, learned which room it was in, and crept up the stairs while its owner drank below.`,
  };
}

// ------------------------------------------------------------ 3. The Bitter Cup
function bitterCup() {
  const ps = pool();
  const T = ps.pop();
  const C = ps.pop(), H1 = ps.pop(), H2 = ps.pop(), X = ps.pop();
  const suspects = [C, H1, H2, X].filter(Boolean);
  [T, ...suspects].forEach((s) => ensure(s));
  T.plotRole = 'victim';
  roles([C, H1, H2], 'culprit', 'herring', 'herring');
  const thing = U.pick(['that horse', 'the boundary stone', 'a barrel of salt fish', 'a hand of cards', 'my mother\'s ring']);
  C.plotThought = 'Tonight. It has to be tonight.';
  if (H1) H1.plotThought = `${T.first} owes me. ${T.first} owes everybody.`;
  if (H2) H2.plotThought = 'Where did I leave my pipe?';
  const healerOf = () => [G.party.members.find((m) => m.cls === 'cleric of the Dawn'), G.agents.find((a) => a.title === 'the herbalist' && a !== T)].find((h) => h && h.present && !h.busy) || G.keeper;
  const beats = [];

  beats.push(beat(U.ri(170, 210), C, function* (a) {
    a.activity = `having words with ${T.first}`;
    const s = T.seat;
    yield* goNear(a, s.x, s.y + (s.face === 'f' ? -1 : 1));
    const k = { clue: `${a.first} quarreled with ${T.first} over ${thing}: "I'll settle it. One way or another."`, clueKey: 'b1' };
    speak(a, `You cheated me on ${thing}, ${T.first}, and all ${lore.town} knows it.`, k);
    yield 2;
    speak(T, 'Prove it, or hold your tongue.');
    yield 1.6;
    speak(a, "Oh, I'll settle it. One way or another.", k);
    yield 2;
  }, () => settled(C) && settled(T)));

  if (H1) beats.push(beat(U.ri(225, 260), H1, function* (a) {
    a.activity = `dunning ${T.first}`;
    const s = T.seat;
    yield* goNear(a, s.x, s.y + (s.face === 'f' ? -1 : 1));
    const k = { clue: `${a.first} pressed ${T.first} hard over an unpaid debt.`, clueKey: 'h1' };
    speak(a, `You still owe me for that pig, ${T.first}.`, k);
    yield 1.8;
    speak(T, 'Next week. I swear it.');
    yield 1.6;
    speak(a, 'You said that at harvest.', k);
    yield 1.5;
  }, () => settled(H1) && settled(T)));

  let away = false;
  beats.push(beat(U.ri(350, 370), T, function* (a) {
    const s = a.seat;
    if (!s.mug || s.mug.owner !== a.id) s.mug = { kind: 'ale', level: 0.8, owner: a.id };
    s.mug.level = Math.max(s.mug.level, 0.6);
    a.activity = G.music.playing ? 'watching the bard' : 'stretching their legs';
    yield* goNear(a, U.ri(8, 11), 4);
    away = true;
    a.facing = 'b';
    yield 11;
    away = false;
  }, () => settled(T)));

  beats.push(beat(0, C, function* (a) {
    const s = T.seat;
    a.activity = 'passing by';
    yield { walk: [s.serve.x, s.serve.y] };
    yield 0.8;
    puff('poison', s.item[0], s.item[1] - 2, 6, { vy: -5, life: 1.5, spread: 2 });
    if (s.mug) s.mug.poisoned = true;
    witness(a, `While ${T.first} was away, ${a.first} lingered over ${T.first}'s cup. A faint green shimmer rose from it.`, 'b2', 4);
    yield 0.5;
  }, () => away && C.present && !C.busy && !C.path));
  beats[beats.length - 1].at = at(352);

  if (H2) {
    beats.push(beat(0, H2, function* (a) {
      const s = T.seat;
      yield { walk: [s.serve.x, s.serve.y] };
      speak(a, 'Has anyone seen my pipe? Ah. There it is.', { clue: `${a.first} rummaged around ${T.first}'s table while ${T.first} was away, looking for a pipe, apparently.`, clueKey: 'h2' });
      witness(a, `${a.first} went poking around ${T.first}'s table while ${T.first} was away.`, 'h2w', 4);
      yield 1;
    }, () => away && H2.present && !H2.busy && !H2.path && !C.busy));
    beats[beats.length - 1].at = at(356);
  }

  beats.push(beat(0, T, function* (a) {
    yield 4;
    speak(a, "I don't... feel...", { loud: true });
    yield 0.6;
    a.sick = true;
    a.activity = 'collapsed over the table';
    toast(`${a.first} has collapsed!`, 'alarm');
    log(`${a.first} drank deep, went grey, and slumped across the table.`);
    speak(G.keeper, 'Give them air! Somebody fetch a healer!', { loud: true });
    const healer = healerOf();
    healer.interrupt(wrap(healer, function* (h) {
      h.activity = `tending to ${a.first}`;
      yield { walk: [a.seat.serve.x, a.seat.serve.y] };
      yield 1.5;
      speak(h, `Nightshade, in the cup. ${a.first} will live, but someone meant harm.`, { loud: true });
      addClue(`${h.first}: "Nightshade, in the cup. Someone meant harm."`, 'public');
      yield 2;
    }));
  }, () => T.present && T.sitting && !T.busy && G.t > at(366)));
  beats[beats.length - 1].at = at(368);

  return {
    title: 'The Bitter Cup',
    premise: `There's bad blood in ${lore.inn} tonight. Before the candles gutter, someone will try to settle an old grudge with something worse than fists.`,
    question: `Who poisoned ${T.first}'s cup?`,
    culprit: C, suspects: U.shuffle(suspects), beats, victim: T,
    right: `Confronted at dawn, ${C.first} breaks down and confesses. The reeve takes ${C.first} to ${lore.lord}. ${T.first}, pale but alive, buys you a cup. You check it first.`,
    wrong: (n) => `You named ${n}, and ${n} spends a week in the stocks for nothing. ${C.first} watches from the crowd and says nothing, and ${T.first} starts drinking somewhere else.`,
    truth: `${C.first} quarreled with ${T.first}, then dosed ${T.first}'s cup with nightshade while ${T.first} was away from the table.`,
  };
}

const TEMPLATES = [sealedMap, stolenRelic, bitterCup];

export function setupPlot() {
  const order = G.plotOrder ||= U.shuffle([0, 1, 2]);
  const idx = order[(G.day - 1) % order.length];
  try {
    const p = TEMPLATES[idx]();
    p.beats.sort((a, b) => a.at - b.at);
    return p;
  } catch (e) {
    console.error('plot setup failed', e);
    return null;
  }
}
