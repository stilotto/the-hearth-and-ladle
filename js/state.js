// The one shared world state, plus a tiny event bus between sim and UI.

export const G = {
  t: 0,            // absolute game minutes
  day: 1,
  dayStart: 960,   // 16:00 of the current inn-day
  speed: 1,
  paused: true,
  agents: [],
  cast: [],
  convos: [],
  orders: [], pours: [], kitchen: [],
  particles: [],
  heard: [], clues: [], log: [],
  coin: 0,
  fire: 0.8,
  weather: 'clear',
  flash: 0,
  music: { playing: false },
  closing: 0,
  lit: false,
  sel: null,
  ear: null,
  hover: null,
  plot: null,
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  nextId: 1,
};

const handlers = {};
export function on(type, fn) { (handlers[type] ||= []).push(fn); }
export function emit(type, data) { for (const fn of handlers[type] || []) fn(data); }
