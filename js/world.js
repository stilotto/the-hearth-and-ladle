// The common room itself: tile grid, furniture, seats, light fixtures,
// pathfinding, and the lore of the town around it.
import { pick, shuffle } from './util.js';

export const W = 26, H = 16, TS = 16, PW = W * TS, PH = H * TS;
export const kind = [];
export const cost = [];     // 0 = blocked
export const tables = [];
export const seats = [];
export const fixtures = [];
export const RUG = { x0: 7, y0: 3, x1: 12, y1: 5 };
export const P = {
  door: { x: 12, y: 14 }, doorOut: { x: 12, y: 15 },
  stairsBot: { x: 1, y: 10 }, stairsTop: { x: 1, y: 5 },
  kitchen: { x: 22, y: 2 }, pour: { x: 22, y: 7 }, handoff: { x: 23, y: 7 },
  pickup: { x: 23, y: 8 }, stage: { x: 3, y: 3 }, keeper: { x: 20, y: 5 },
  hearth: { x: 10, y: 3 }, maidIdle: { x: 24, y: 9 },
};

function set(x, y, k, c) { kind[y][x] = k; cost[y][x] = c; }

function addSeat(x, y, face, table, o = {}) {
  const s = { id: seats.length, x, y, face, table, occupant: null, mug: null, bar: false, ...o };
  seats.push(s);
  set(x, y, 'seat', 3);
  if (table) table.seats.push(s);
  return s;
}

function addTable(id, x, y, w, o = {}) {
  const t = { id, x, y, w, seats: [], extra: [], ...o };
  tables.push(t);
  for (let i = 0; i < w; i++) set(x + i, y, 'table', 0);
  for (let i = 0; i < w; i++) {
    addSeat(x + i, y - 1, 'f', t, { item: [(x + i) * TS + 8, y * TS + 3] });
    addSeat(x + i, y + 1, 'b', t, { item: [(x + i) * TS + 8, y * TS + 8] });
  }
  addSeat(x - 1, y, 'f', t, { item: [x * TS + 3, y * TS + 5], side: 'w' });
  addSeat(x + w, y, 'f', t, { item: [(x + w) * TS - 4, y * TS + 5], side: 'e' });
  t.candle = addFixture('candle', x * TS + (w * TS) / 2, y * TS + 5, { x, y }, t);
}

function addFixture(type, px, py, near, table = null) {
  const f = { type, x: px, y: py, near, lit: false, table };
  fixtures.push(f);
  return f;
}

(function build() {
  for (let y = 0; y < H; y++) {
    kind.push([]); cost.push([]);
    for (let x = 0; x < W; x++) { kind[y].push('floor'); cost[y].push(1); }
  }
  for (let x = 0; x < W; x++) { set(x, 0, 'wall', 0); set(x, 1, 'wall', 0); set(x, 15, 'wall', 0); }
  for (let y = 0; y < H; y++) { set(0, y, 'wall', 0); set(25, y, 'wall', 0); }
  set(12, 15, 'door', 1); set(13, 15, 'door', 1);
  for (let x = 8; x <= 11; x++) set(x, 2, 'hearth', 0);
  for (let y = RUG.y0; y <= RUG.y1; y++) for (let x = RUG.x0; x <= RUG.x1; x++) set(x, y, 'rug', 1);
  for (let y = 2; y <= 3; y++) for (let x = 2; x <= 4; x++) set(x, y, 'stage', 1);
  for (let y = 5; y <= 9; y++) for (let x = 1; x <= 2; x++) set(x, y, 'stairs', 1);
  for (let y = 2; y <= 7; y++) for (let x = 20; x <= 24; x++) set(x, y, 'flag', 1);
  set(23, 8, 'flag', 1); set(24, 8, 'flag', 1);
  for (let y = 2; y <= 8; y++) set(19, y, 'counter', 0);
  for (let x = 19; x <= 22; x++) set(x, 8, 'counter', 0);
  for (let y = 3; y <= 6; y++) set(24, y, 'keg', 0);

  addTable('A', 6, 7, 2); addTable('B', 11, 7, 2); addTable('C', 15, 7, 2);
  addTable('D', 6, 11, 2); addTable('E', 11, 11, 2); addTable('F', 15, 11, 3, { long: true });
  addTable('G', 2, 13, 1, { booth: true });

  for (const y of [3, 5, 7]) addSeat(18, y, 'f', null, { bar: true, stool: true, item: [19 * TS + 7, y * TS + 6], behind: { x: 20, y } });
  for (const x of [20, 21, 22]) addSeat(x, 9, 'b', null, { bar: true, stool: true, item: [x * TS + 8, 8 * TS + 4], behind: { x, y: 7 } });

  addFixture('sconce', 13, 3 * TS + 2, { x: 1, y: 3 });
  addFixture('sconce', 13, 12 * TS + 2, { x: 1, y: 12 });
  addFixture('sconce', 402, 10 * TS + 2, { x: 24, y: 10 });
  addFixture('sconce', 402, 13 * TS + 2, { x: 24, y: 13 });
  addFixture('lantern', 19 * TS + 8, 3 * TS + 2, { x: 20, y: 3 });
  addFixture('lantern', 21 * TS + 8, 8 * TS + 1, { x: 21, y: 7 });

  for (const s of seats) s.serve = nearestOpen(s.x, s.y);
  for (const f of fixtures) f.serve = f.table ? nearestOpen(f.near.x, f.near.y) : f.near;
})();

export function walkable(x, y) { return x >= 0 && y >= 0 && x < W && y < H && cost[y][x] > 0; }

// Nearest plain floor tile (not a seat, stair or door) — where staff stand to serve.
export function nearestOpen(sx, sy, taken = null) {
  const seen = new Set([sy * W + sx]);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const nx = x + dx, ny = y + dy, k = ny * W + nx;
      if (seen.has(k) || !walkable(nx, ny)) continue;
      seen.add(k);
      const kd = kind[ny][nx];
      if (kd !== 'seat' && kd !== 'stairs' && kd !== 'door' && kd !== 'flag' && !(taken && taken(nx, ny))) return { x: nx, y: ny };
      q.push([nx, ny]);
    }
  }
  return { x: sx, y: sy };
}

const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];

function stepCost(x, y, o, isGoal) {
  if (x < 0 || y < 0 || x >= W || y >= H) return 0;
  const c = cost[y][x];
  if (!c) return 0;
  const k = kind[y][x];
  if (isGoal) return 1;
  if (k === 'stairs') return o.stairs ? 1 : 30;
  if (k === 'door') return o.door ? 1 : 0;
  if (k === 'flag' && !o.staff) return 12;
  return c;
}

export function findPath(sx, sy, tx, ty, o = {}) {
  if (sx === tx && sy === ty) return [];
  if (!walkable(tx, ty)) return null;
  const N = W * H;
  const g = new Float32Array(N).fill(Infinity);
  const f = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const start = sy * W + sx, goal = ty * W + tx;
  const h = (i) => {
    const dx = Math.abs((i % W) - tx), dy = Math.abs(((i / W) | 0) - ty);
    return Math.max(dx, dy) + 0.41 * Math.min(dx, dy);
  };
  g[start] = 0; f[start] = h(start);
  const open = [start];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1]; open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % W, cy = (cur / W) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (closed[ni]) continue;
      let c = stepCost(nx, ny, o, ni === goal);
      if (!c) continue;
      if (dx && dy) {
        if (!stepCost(cx + dx, cy, o, false) || !stepCost(cx, cy + dy, o, false)) continue;
        c *= 1.41;
      }
      const ng = g[cur] + c;
      if (ng < g[ni]) { g[ni] = ng; f[ni] = ng + h(ni); came[ni] = cur; open.push(ni); }
    }
  }
  if (came[goal] === -1) return null;
  const path = [];
  for (let c = goal; c !== start; c = came[c]) path.push([c % W, (c / W) | 0]);
  return path.reverse();
}

// ---------------------------------------------------------------- lore
const INN_ADJ = ['Laughing', 'Gilded', 'Drowned', 'Sleeping', 'Crooked', 'Wandering', 'Silver', 'Lame', 'Last', 'Singing', 'Blind', 'Weary'];
const INN_NOUN = ['Griffin', 'Stag', 'Rat', 'Lantern', 'Kettle', 'Boar', 'Crow', 'Harp', 'Wyvern', 'Hound', 'Goose', 'Anvil'];
const TOWNS = ['Brackenford', 'Oxley Cross', 'Thornwick', 'Harrowmere', 'Duskwater', 'Millbury', 'Greyhollow', 'Wendle', 'Coldharbour', 'Ashby Mote'];
const LORDS = ['Lord Aldric Vane', 'Lady Morwen of the Ash', 'the old Margrave', 'Baron Hollis', 'the Countess Ysolde'];
const PLACES = ['the Barrow of Kings', 'Greyfen Marsh', 'the Sunken Chapel', 'Blackroot Wood', 'the Weeping Tor', 'Wolfshead Pass', 'the Drowned Abbey', 'the Old Dwarf-road'];
const ROADS = ['the Old North Road', 'the Fen Causeway', "the Pilgrim's Way", 'the high pass', 'the river road'];
const BEASTS = ['goblins', 'wolves', 'bandits', 'marsh-lights', 'trolls', 'wyverns', 'barrow-wights'];
const DRINKS = ['brown ale', 'cider', 'stout', 'mead', 'bitter'];

export const lore = (() => {
  const towns = shuffle([...TOWNS]);
  return {
    inn: `The ${pick(INN_ADJ)} ${pick(INN_NOUN)}`,
    town: towns[0], town2: towns[1],
    lord: pick(LORDS),
    places: shuffle([...PLACES]),
    road: pick(ROADS),
    beasts: pick(BEASTS),
    drink: pick(DRINKS),
  };
})();
