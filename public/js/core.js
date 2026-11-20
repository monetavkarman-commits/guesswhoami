// Shared helpers: data loading, seeded randomness, storage, player search, UI bits.

export const GAMES = {
  cs: {
    title: 'Counter-Strike',
    short: 'CS',
    roleLabels: { awp: 'AWP', igl: 'Капитан', rifle: 'Райфлер', entry: 'Энтри', lurker: 'Люркер', support: 'Саппорт', coach: 'Тренер' },
    teamLabel: 'Команда',
  },
  dota: {
    title: 'Dota 2',
    short: 'Dota 2',
    posLabels: { 1: 'Керри', 2: 'Мид', 3: 'Оффлейн', 4: 'Саппорт 4', 5: 'Саппорт 5' },
    teamLabel: 'Команда*',
  },
};

// Difficulty / era filters: they narrow who can be the answer, any matching player is still accepted.
export function filtersFor(game) {
  const cs = game === 'cs';
  return {
    all: { label: 'Все игроки', test: () => true },
    top: { label: 'Только звёзды', test: (p) => p.events >= (cs ? 3 : 2) },
    active: { label: 'Актуальные составы', test: cs ? (p) => p.status === 'active' && !!p.team && p.era.includes('cs2') : (p) => p.status === 'active' && p.era.includes('late') },
    ...(cs
      ? { csgo: { label: 'Эра CS:GO', test: (p) => p.era.includes('csgo') }, cs2: { label: 'Эра CS2', test: (p) => p.era.includes('cs2') } }
      : { early: { label: 'TI 2019–2022', test: (p) => p.era.includes('early') }, late: { label: 'TI 2023–2025', test: (p) => p.era.includes('late') } }),
  };
}

const cache = {};
export async function loadGame(game) {
  if (cache[game]) return cache[game];
  const res = await fetch(`data/${game}.json`);
  if (!res.ok) throw new Error(`Не удалось загрузить data/${game}.json`);
  const data = await res.json();
  const now = new Date();
  data.players.forEach((p, i) => {
    p.idx = i;
    p.teamSet = new Set(p.teams);
    p.mateMap = new Map(p.mates);
    p.age = p.birth ? ageOn(p.birth, now) : null;
    p.byear = p.birth ? +p.birth.slice(0, 4) : null;
    p.search = (p.id + ' ' + p.name).toLowerCase();
  });
  data.cfg = GAMES[game];
  cache[game] = data;
  return data;
}

function ageOn(birth, now) {
  const [y, m, d] = birth.split('-').map(Number);
  let a = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) a--;
  return a;
}

export function roleText(data, p) {
  if (data.game === 'dota') return data.cfg.posLabels[p.pos] || '—';
  if (!p.roles.length) return '—';
  return p.roles.map((r) => data.cfg.roleLabels[r] || r).join(', ');
}

// ---------- seeded randomness ----------
export function hashStr(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return (h >>> 0);
}
export function rng(seed) {
  let a = typeof seed === 'string' ? hashStr(seed) : seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
export function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const EPOCH = Date.UTC(2026, 10, 17);
export function today() {
  const d = new Date();
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const num = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH) / 864e5) + 1;
  return { key, num };
}

// ---------- storage (never required for the game to work) ----------
export const store = {
  get(k, def = null) { try { const v = localStorage.getItem('gwai:' + k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(k, v) { try { localStorage.setItem('gwai:' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};

// ---------- small DOM helpers ----------
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

export function flag(cc) {
  if (!cc || cc.length !== 2 || cc === 'XK') return h('span', { class: 'flag flag-text' }, cc || '?');
  const emoji = String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0)));
  return h('span', { class: 'flag', title: cc }, emoji);
}

export function toast(msg) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2200);
}

export async function share(text) {
  try { await navigator.clipboard.writeText(text); toast('Результат скопирован'); }
  catch { prompt('Скопируйте результат:', text); }
}

export function playerLink(p) {
  return h('a', { href: p.url, target: '_blank', rel: 'noopener', class: 'plink' }, p.id);
}

// ---------- player search box with autocomplete ----------
export function playerSearch(data, { placeholder = 'Введите ник игрока…', exclude = () => false, onPick }) {
  const input = h('input', { type: 'text', class: 'search-input', placeholder, autocomplete: 'off', spellcheck: 'false' });
  const list = h('ul', { class: 'search-list', role: 'listbox' });
  const wrap = h('div', { class: 'search' }, input, list);
  let items = []; let active = 0;

  const render = () => {
    list.innerHTML = '';
    items.forEach((p, i) => {
      const li = h('li', { class: i === active ? 'active' : '', role: 'option' },
        flag(p.cc), h('b', {}, p.id), h('span', { class: 'muted' }, p.name));
      li.addEventListener('mousedown', (e) => { e.preventDefault(); choose(p); });
      list.append(li);
    });
    list.style.display = items.length ? 'block' : 'none';
  };
  const update = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { items = []; render(); return; }
    const starts = []; const contains = [];
    for (const p of data.players) {
      if (exclude(p)) continue;
      const id = p.id.toLowerCase();
      if (id.startsWith(q)) starts.push(p); else if (p.search.includes(q)) contains.push(p);
    }
    starts.sort((a, b) => a.id.length - b.id.length);
    items = starts.concat(contains).slice(0, 8); active = 0; render();
  };
  const choose = (p) => { input.value = ''; items = []; render(); onPick(p); };
  input.addEventListener('input', update);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { active = Math.min(active + 1, items.length - 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); render(); e.preventDefault(); }
    else if (e.key === 'Enter' && items[active]) { choose(items[active]); e.preventDefault(); }
    else if (e.key === 'Escape') { items = []; render(); }
  });
  input.addEventListener('blur', () => setTimeout(() => { items = []; render(); }, 100));
  return { el: wrap, focus: () => input.focus(), input };
}

export function modal(title, body, onClose, cls = '') {
  const close = () => { back.remove(); document.removeEventListener('keydown', esc); onClose && onClose(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(); } },
    h('div', { class: 'modal ' + cls }, h('div', { class: 'modal-head' }, h('h3', {}, title), h('button', { class: 'icon-btn', onclick: close, 'aria-label': 'Закрыть' }, '×')), body));
  document.addEventListener('keydown', esc);
  document.body.append(back);
  return close;
}
