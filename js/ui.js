// DOM side: header, the Listen / Journal / Guests panel, toasts, and the
// intro and dawn modals.
import { G, on } from './state.js';
import { fmtTime, hourOf } from './util.js';
import { lore } from './world.js';
import { portrait } from './sprites.js';
import { thoughtOf, patronsHere } from './sim.js';
import { Sfx } from './audio.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let tab = 'listen', lastPanel = 0, unseenClues = 0;
const hooks = {};
const COLORS = ['#e8b04a', '#9ad0c2', '#e89a7a', '#b8a8e0', '#a8d08a', '#e0c07a', '#8ab8e0', '#e08aa8'];
const nameCol = (a) => (a.role === 'stranger' ? '#9aa89a' : COLORS[a.id % COLORS.length]);

function loadStats() { try { return JSON.parse(localStorage.getItem('commonroom.stats')) || { solved: 0, played: 0 }; } catch { return { solved: 0, played: 0 }; } }
function saveStats(s) { try { localStorage.setItem('commonroom.stats', JSON.stringify(s)); } catch { /* private mode */ } }

export function initUI(h) {
  Object.assign(hooks, h);
  $('#innName').textContent = lore.inn;
  $('#townName').textContent = `${lore.town} · on ${lore.road}`;
  document.title = `${lore.inn} · The Common Room`;
  document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => hooks.setSpeed(+b.dataset.speed)));
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('#soundBtn').addEventListener('click', () => { Sfx.setOn(!Sfx.on); syncSound(); });
  $('#helpBtn').addEventListener('click', () => showIntro(false));
  on('heard', addHeard);
  on('clue', (c) => { renderJournal(); if (tab !== 'journal') { unseenClues++; syncBadge(); } toast(`Noted in your journal: ${c.text}`, 'clue'); });
  on('log', () => { if (tab === 'journal') renderJournal(); });
  on('toast', ({ text, kind }) => toast(text, kind));
  on('day', () => { $('#feed').innerHTML = ''; unseenClues = 0; syncBadge(); renderJournal(); });
  on('dawn', showDawn);
  showIntro(true);
  syncSpeed();
}

function syncSound() { $('#soundBtn').textContent = Sfx.on ? '🔊' : '🔈'; $('#soundBtn').setAttribute('aria-pressed', Sfx.on); }
export function syncSpeed() {
  document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', G.paused ? +b.dataset.speed === 0 : +b.dataset.speed === G.speed));
}
function setTab(t) {
  tab = t;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('.pane').forEach((p) => (p.hidden = p.dataset.pane !== t));
  if (t === 'journal') { unseenClues = 0; syncBadge(); renderJournal(); }
  if (t === 'guests') renderGuests();
  if (t === 'listen') renderListen();
}
function syncBadge() { const b = $('#clueBadge'); b.textContent = unseenClues; b.hidden = !unseenClues; }

export function toast(text, kind = '') {
  const t = el('div', 'toast ' + kind, esc(text));
  $('#toasts').prepend(t);
  setTimeout(() => t.classList.add('out'), 4200);
  setTimeout(() => t.remove(), 5000);
  while ($('#toasts').children.length > 4) $('#toasts').lastChild.remove();
}

function addHeard(h) {
  const row = el('div', 'said' + (h.whisper ? ' whisper' : ''));
  row.innerHTML = `<span class="t">${fmtTime(h.t)}</span><b style="color:${nameCol(h.who)}">${esc(h.who.first)}</b> ${esc(h.text)}`;
  const feed = $('#feed');
  feed.prepend(row);
  while (feed.children.length > 60) feed.lastChild.remove();
}

// ------------------------------------------------------------------ per-frame
export function uiFrame() {
  const h = hourOf(G.t);
  $('#clock').textContent = fmtTime(G.t);
  $('#dayNum').textContent = `Day ${G.day}`;
  $('#sky').textContent = h >= 6 && h < 18.5 ? '☀' : '☾';
  $('#weather').textContent = { clear: 'Clear', rain: 'Rain', storm: 'Storm' }[G.weather];
  $('#coins').textContent = G.coin;
  const now = performance.now();
  if (now - lastPanel > 300) {
    lastPanel = now;
    if (tab === 'listen') renderListen();
    if (tab === 'guests') renderGuests();
  }
}

const bar = (label, v, cls = '') => `<div class="need ${cls}"><span>${label}</span><i><em style="width:${Math.round(Math.min(1, Math.max(0, v)) * 100)}%"></em></i></div>`;
function moodWord(a) { return a.mood > 0.8 ? 'merry' : a.mood > 0.55 ? 'content' : a.mood > 0.3 ? 'glum' : 'sour'; }
function drunkWord(a) { return a.drunk > 0.85 ? 'three sheets to the wind' : a.drunk > 0.55 ? 'well oiled' : a.drunk > 0.25 ? 'tipsy' : 'sober'; }

let lastSel = null;
function renderListen() {
  const box = $('#who');
  const a = G.sel;
  if (!a || !a.present) {
    if (lastSel !== null || !box.dataset.empty) {
      box.dataset.empty = '1'; lastSel = null;
      box.innerHTML = `<p class="hint">${G.ear ? 'Your ear is on that corner of the room (the gold circle). Anything said inside it lands here.' : 'Click anywhere in the room to listen there.'} <b>Click a person</b> to follow them and hear everything they say.</p>`;
    }
    return;
  }
  delete box.dataset.empty;
  if (lastSel !== a) {
    lastSel = a;
    box.innerHTML = `<div class="card"><canvas class="portrait" width="56" height="64"></canvas><div class="id"><h3></h3><p class="title"></p><p class="state"></p></div><button class="x" title="Stop following">✕</button></div><p class="doing"></p><p class="thought"></p><div class="needs"></div><p class="rels"></p>`;
    box.querySelector('.x').onclick = () => { G.sel = null; };
    if (a.spr) portrait(box.querySelector('.portrait'), a.spr, 4);
    else box.querySelector('.portrait').replaceWith(el('div', 'catpic', '🐈'));
    box.querySelector('h3').textContent = a.name;
    box.querySelector('.title').textContent = a.title;
    a._thought = thoughtOf(a); a._thoughtAt = G.t;
  }
  if (G.t - (a._thoughtAt || 0) > 12) { a._thought = thoughtOf(a); a._thoughtAt = G.t; }
  const person = a.kind === 'person';
  const patron = person && !['keeper', 'maid', 'potboy', 'cook'].includes(a.role);
  box.querySelector('.state').textContent = person ? `${moodWord(a)}${patron ? ', ' + drunkWord(a) : ''} · ${a.coin} coppers` : '';
  box.querySelector('.doing').textContent = a.activity ? `Now: ${a.activity}` : '';
  box.querySelector('.thought').textContent = `“${a._thought}”`;
  box.querySelector('.needs').innerHTML = patron ? bar('Thirst', a.needs.thirst) + bar('Hunger', a.needs.hunger) + bar('Company', a.needs.social) + bar('Drink', a.drunk / 1.1, 'drink') : '';
  if (person) {
    const here = G.agents.filter((b) => b !== a && b.present && a.rel[b.id] !== undefined);
    const fond = here.filter((b) => a.rel[b.id] > 0.45 || a.love === b.id).map((b) => (a.love === b.id ? `<b class="love">${esc(b.first)} ♥</b>` : esc(b.first)));
    const odds = here.filter((b) => a.rel[b.id] < -0.3).map((b) => esc(b.first));
    box.querySelector('.rels').innerHTML = [fond.length ? `Fond of ${fond.join(', ')}` : '', odds.length ? `At odds with ${odds.join(', ')}` : ''].filter(Boolean).join(' · ');
  }
}

function renderJournal() {
  const p = G.plot;
  const box = $('#journal');
  let html = '';
  if (p) {
    html += `<section class="mystery"><h3>${esc(p.title)}</h3><p>${esc(p.premise)}</p><p class="q">${esc(p.question)}</p><p class="small">At dawn you'll be asked to name the guilty. Clues only reach this page if you're listening when things happen.</p></section>`;
    html += `<h4>Clues</h4>`;
    html += G.clues.length ? `<ul class="clues">${G.clues.map((c) => `<li><span class="t">${fmtTime(c.t)}</span>${esc(c.text)}</li>`).join('')}</ul>` : `<p class="small">Nothing yet. Keep your ears open.</p>`;
  }
  html += `<h4>Chronicle</h4><ul class="chron">${G.log.slice(0, 40).map((e) => `<li><span class="t">${fmtTime(e.t)}</span>${esc(e.text)}</li>`).join('')}</ul>`;
  box.innerHTML = html;
}

function renderGuests() {
  const box = $('#guests');
  const groups = [['Staff', (a) => ['keeper', 'maid', 'potboy', 'cook', 'cat'].includes(a.role)], ['Adventurers', (a) => a.role === 'adventurer'], ['Travelers', (a) => ['visitor', 'bard', 'stranger'].includes(a.role)], ['Locals', (a) => a.role === 'local']];
  const here = G.agents.filter((a) => a.present);
  const sig = here.map((a) => a.id + (a.activity || '')).join('|');
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.innerHTML = `<p class="small">${patronsHere().length} guests in the room.</p>`;
  for (const [label, f] of groups) {
    const list = here.filter(f);
    if (!list.length) continue;
    box.appendChild(el('h4', null, label));
    for (const a of list) {
      const row = el('button', 'guest' + (G.sel === a ? ' on' : ''));
      const c = el('canvas'); c.width = 28; c.height = 28;
      if (a.spr) portrait(c, a.spr, 2); else { c.replaceWith(); }
      row.appendChild(a.spr ? c : el('span', 'catpic sm', '🐈'));
      row.appendChild(el('span', 'gname', `<b>${esc(a.name)}</b><small>${esc(a.activity || a.title)}</small>`));
      row.onclick = () => { G.sel = a; setTab('listen'); };
      box.appendChild(row);
    }
  }
}

// ------------------------------------------------------------------ modals
function modal(html) {
  const m = $('#modal');
  m.innerHTML = `<div class="sheet">${html}</div>`;
  m.hidden = false;
  return m;
}
function closeModal() { $('#modal').hidden = true; }

function showIntro(first) {
  hooks.pause(true);
  const m = modal(`
    <div class="signboard"><div class="chains"></div><div class="board"><span>${esc(lore.inn)}</span></div></div>
    <p class="lede">Evening settles over ${esc(lore.town)}. Rain or no rain, the common room of <b>${esc(lore.inn)}</b> is filling up: locals, travelers, a company of adventurers, and at least one person with something to hide.</p>
    <ul class="how">
      <li><b>Click a person</b> to follow them and hear everything they say.</li>
      <li><b>Click anywhere else</b> to rest your ear on that spot.</li>
      <li>Something is afoot tonight. What you overhear goes into your <b>Journal</b>.</li>
      <li>At dawn, <b>name the guilty</b>.</li>
    </ul>
    <p class="keys">Space pauses · 1–4 set the speed · Esc stops following</p>
    <div class="btns">${first ? `<button class="primary" data-go="sound">Enter, with sound</button><button data-go="quiet">Enter quietly</button>` : `<button class="primary" data-go="back">Back to the room</button>`}</div>
    <p class="step3d"><a href="3d.html">Or step inside the room in 3D →</a></p>
    <p class="home-link"><a href="https://stilotto.github.io/">More games from Stilotto</a></p>`);
  m.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.go === 'sound') { Sfx.setOn(true); }
    syncSound();
    closeModal();
    hooks.pause(false);
  }));
}

function showDawn() {
  hooks.pause(true);
  const p = G.plot;
  if (!p) { hooks.nextDay(); return; }
  const stats = loadStats();
  const m = modal(`
    <h2>Dawn</h2>
    <p class="lede">Grey light creeps under the shutters of ${esc(lore.inn)}. ${esc(p.question)}</p>
    ${G.clues.length ? `<details open><summary>Your journal (${G.clues.length} clue${G.clues.length > 1 ? 's' : ''})</summary><ul class="clues">${G.clues.map((c) => `<li><span class="t">${fmtTime(c.t)}</span>${esc(c.text)}</li>`).join('')}</ul></details>` : `<p class="small">Your journal is empty. You'll have to trust your gut.</p>`}
    <div class="suspects"></div>`);
  const box = m.querySelector('.suspects');
  for (const s of p.suspects) {
    const b = el('button', 'suspect');
    const c = el('canvas'); c.width = 56; c.height = 64; portrait(c, s.spr, 4);
    b.appendChild(c);
    b.appendChild(el('span', null, `<b>${esc(s.name)}</b><small>${esc(s.title)}</small>`));
    b.onclick = () => {
      const right = s === p.culprit;
      stats.played++; if (right) stats.solved++;
      saveStats(stats);
      modal(`
        <h2>${right ? 'You named the right one.' : 'You named the wrong one.'}</h2>
        <p class="lede">${esc(right ? p.right : p.wrong(s.first))}</p>
        <p class="truth"><b>What really happened:</b> ${esc(p.truth)}</p>
        <p class="small">Mysteries solved: ${stats.solved} of ${stats.played}.</p>
        <div class="btns"><button class="primary" data-go>Another evening →</button></div>`)
        .querySelector('[data-go]').onclick = () => { closeModal(); hooks.nextDay(); };
    };
    box.appendChild(b);
  }
}
