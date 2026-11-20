// Shared helpers: data loading, seeded randomness, storage, player search, UI bits.
import { tr } from './i18n.js';

export const GAMES = {
  cs: {
    title: 'Counter-Strike', short: 'CS', kind: 'roles',
    roleLabels: { awp: 'AWP', igl: tr('Капитан'), rifle: tr('Райфлер'), entry: tr('Энтри'), lurker: tr('Люркер'), support: tr('Саппорт'), coach: tr('Тренер') },
    teamLabel: tr('Команда'), ev3: tr('3+ мэйджора'), ev1: tr('Ровно 1 мэйджор'), topMin: 3, chainMin: 3, minTeam: [8, 5],
    eras: { csgo: tr('Эра CS:GO'), cs2: tr('Эра CS2') }, activeEra: 'cs2',
  },
  dota: {
    title: 'Dota 2', short: 'Dota', kind: 'pos',
    posLabels: { 1: tr('Керри'), 2: tr('Мид'), 3: tr('Оффлейн'), 4: tr('Саппорт 4'), 5: tr('Саппорт 5') },
    teamLabel: tr('Команда*'), ev3: '3+ TI', ev1: tr('Без TI или 1 TI'), topMin: 2, chainMin: 2, minTeam: [5, 3],
    eras: { early: 'TI 2019–2022', late: 'TI 2023–2025' }, activeEra: 'late',
    teamNote: tr('* Команда — с последнего турнира игрока в базе (TI / EWC / Riyadh Masters).'),
  },
  valorant: {
    title: 'VALORANT', short: 'VALORANT', kind: null,
    teamLabel: tr('Команда*'), ev3: '3+ Champions', ev1: tr('Не больше 1 Champions'), topMin: 2, chainMin: 2, minTeam: [5, 3],
    eras: { early: 'VCT 2021–2023', late: 'VCT 2024–2026' }, activeEra: 'late',
    teamNote: tr('* Команда — с последнего турнира игрока в базе (Champions / Masters).'),
  },
  lol: {
    title: 'League of Legends', tab: 'LoL', short: 'LoL', kind: 'pos',
    posLabels: { 1: tr('Топ'), 2: tr('Лесник'), 3: tr('Мид'), 4: tr('Бот'), 5: tr('Саппорт') },
    teamLabel: tr('Команда*'), ev3: '3+ Worlds', ev1: tr('Не больше 1 Worlds'), topMin: 2, chainMin: 2, minTeam: [5, 3],
    eras: { early: 'Worlds 2021–2023', late: 'Worlds 2024–2026' }, activeEra: 'late',
    teamNote: tr('* Команда — с последнего турнира игрока в базе (Worlds / MSI).'),
  },
  // sports (Wikidata): no event counts, so "top" means well-known (many Wikipedia articles), "events" = number of clubs
  football: {
    title: tr('Футбол'), tab: '⚽ ' + tr('Футбол'), short: '⚽ ' + tr('Футбол'), sport: true, kind: 'pos',
    posLabels: { 1: tr('Вратарь'), 2: tr('Защитник'), 3: tr('Полузащитник'), 4: tr('Нападающий') },
    teamLabel: tr('Клуб'), ev3: tr('6+ клубов'), ev1: tr('Один клуб за карьеру'), evHi: 6, evLo: 1, topMin: null, minTeam: [8, 5],
    eras: { early: tr('Играли до 2010'), late: tr('Играли с 2016') }, activeEra: 'late',
    teamNote: tr('* Клубы и даты переходов — из Wikidata, там бывают пробелы.'),
  },
  basket: {
    title: tr('Баскетбол'), tab: '🏀 ' + tr('Баскетбол'), short: '🏀 ' + tr('Баскет'), sport: true, kind: 'pos',
    posLabels: { 1: tr('Разыгрывающий'), 2: tr('Атакующий защитник'), 3: tr('Лёгкий форвард'), 4: tr('Тяжёлый форвард'), 5: tr('Центровой') },
    teamLabel: tr('Клуб'), ev3: tr('5+ клубов'), ev1: tr('Один клуб за карьеру'), evHi: 5, evLo: 1, topMin: null, minTeam: [6, 4],
    eras: { early: tr('Играли до 2010'), late: tr('Играли с 2016') }, activeEra: 'late',
    teamNote: tr('* Клубы и даты переходов — из Wikidata, там бывают пробелы.'),
  },
  hockey: { title: tr('Хоккей'), tab: '🏒 ' + tr('Хоккей'), short: '🏒 ' + tr('Хоккей'), sport: true, itemsOnly: true, eras: {} },
  deadlock: { title: 'Deadlock', tab: 'Deadlock', short: 'Deadlock', itemsOnly: true, eras: {} },
  mma: { title: 'MMA', tab: '🥋 MMA', short: '🥋 MMA', sport: true, itemsOnly: true, eras: {} },
  boxing: { title: tr('Бокс'), tab: '🥊 ' + tr('Бокс'), short: '🥊 ' + tr('Бокс'), sport: true, itemsOnly: true, eras: {} },
  tennis: { title: tr('Теннис'), tab: '🎾 ' + tr('Теннис'), short: '🎾 ' + tr('Теннис'), sport: true, itemsOnly: true, eras: {} },
};

// small badge for the esports games (own monogram in the game's colour; sports use an emoji instead)
export const GAME_BADGE = { cs: ['CS', '#f5a524'], dota: ['D2', '#e0463a'], valorant: ['V', '#ff4655'], lol: ['LoL', '#c89b3c'], deadlock: ['DL', '#8b6cff'] };
// official icons where they are freely available (Steam's own app icons, Commons for VALORANT and LoL); the monogram is the fallback
const STEAM = 'https://shared.fastly.steamstatic.com/community_assets/images/apps/';
const GAME_IMG = {
  cs: () => STEAM + '730/8dbc71957312bbd3baea65848b545be9eae2a355.jpg', dota: () => STEAM + '570/48eb825bb93787945065b460bdc109e395384ebf.jpg',
  deadlock: () => STEAM + '1422450/f6da1420a173324d49bcd470fa3eee781ad0fa5e.jpg',
  valorant: () => wmUrl('f/fc/Valorant_logo_-_pink_color_version.svg', 120), lol: () => wmUrl('d/d8/League_of_Legends_2019_vector.svg', 120),
};
export function gameBadge(game, cls = 'gico') {
  const b = GAME_BADGE[game]; if (!b) return null;
  const el = h('span', { class: cls, 'aria-hidden': 'true' }, b[0]); el.style.setProperty('--gc', b[1]);
  if (GAME_IMG[game]) {
    const img = new Image(); img.className = 'gimg'; img.alt = ''; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
    img.onload = () => { el.textContent = ''; el.classList.add('has-img', 'g-' + game); el.append(img); }; // until the picture arrives the monogram shows
    img.src = GAME_IMG[game]();
  }
  return el;
}

// Difficulty / era filters: they narrow who can be the answer, any matching player is still accepted.
export function filtersFor(game) {
  const cfg = GAMES[game];
  return {
    all: { label: tr('Все игроки'), test: () => true },
    top: { label: tr('Только звёзды'), test: (p) => (cfg.topMin == null ? p.top : p.events >= cfg.topMin) },
    active: { label: tr('Актуальные составы'), era: cfg.activeEra, test: (p) => p.status === 'active' && !!p.team && p.era.includes(cfg.activeEra) },
    ...Object.fromEntries(Object.entries(cfg.eras).map(([k, label]) => [k, { label, era: k, test: (p) => p.era.includes(k) }])),
  };
}

const cache = {};
export async function loadGame(game) {
  if (cache[game]) return cache[game];
  const res = await fetch(`data/${game}.json`);
  if (!res.ok) throw new Error(tr('Не удалось загрузить data/{0}.json', [game]));
  const data = await res.json();
  const now = new Date();
  data.players.forEach((p, i) => {
    p.idx = i;
    p.teamSet = new Set(p.teams);
    p.eraSets = Object.fromEntries(Object.entries(p.eraTeams || {}).map(([k, v]) => [k, new Set(v)]));
    // mates: [playerIndex, teamIndex, fromYear, toYear]; toYear 0 = still together
    p.mateMap = new Map(p.mates.map((m) => [m[0], m[1]]));
    p.mateInfo = new Map(p.mates.map((m) => [m[0], m]));
    p.age = p.birth ? ageOn(p.birth, now) : null;
    p.byear = p.birth ? +p.birth.slice(0, 4) : null;
    p.search = fold(p.id + ' ' + p.name);
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
  if (data.cfg.kind === 'pos') return data.cfg.posLabels[p.pos] || '—';
  if (!p.roles?.length) return '—';
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

export { store } from './core-store.js';
import { lang } from './i18n.js';

export const countryName = (p) => (lang === 'en' ? p.countryEn || p.country : p.country);

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

// A small picture (item icon, player photo, club logo). A broken or blocked image removes itself, so the text stays alone.
export function pic(src, cls = 'pic') {
  if (!src) return null;
  return h('img', { class: cls, src, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', onerror: (e) => e.target.remove() });
}

// Wikimedia Commons thumbnails: a stored path "a/ab/File.jpg" becomes https://upload.wikimedia.org/.../thumb/a/ab/File.jpg/120px-File.jpg
const WM = 'https://upload.wikimedia.org/wikipedia/commons/thumb/';
export function wmUrl(path, w = 120) {
  if (!path) return null;
  const name = path.split('/').pop();
  return `${WM}${path}/${w}px-${name}${/\.svg$/i.test(name) ? '.png' : ''}`;
}
export const photo = (p, cls = 'pic round') => (p && p.ph ? pic(wmUrl(p.ph, 120), cls) : null);
// Club badge: the Commons logo when the club has one there, otherwise a round badge with the club's initials
// (the logos of many big clubs are not free, so they are not on Commons).
function badge(name, cls) {
  const words = name.replace(/\b(FC|CF|AC|AS|SC|SK|AFC|Club|de|del|of|the)\b\.?/gi, '').trim().split(/[\s.-]+/).filter(Boolean);
  const ini = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2)).toUpperCase();
  let hue = 0; for (const c of name) hue = (hue * 31 + c.charCodeAt(0)) % 360;
  const el = h('span', { class: `${cls} badge`, title: name }, ini);
  el.style.background = `hsl(${hue} 42% 36%)`; // set through CSSOM: inline style attributes are blocked by the page's CSP
  return el;
}
const teamLogo = (data, i, cls) => {
  if (i == null || i < 0 || !data.teams[i]) return null;
  return data.logos && data.logos[i] ? pic(/^img\//.test(data.logos[i]) ? data.logos[i] : wmUrl(data.logos[i], 60), cls) : badge(data.teams[i], cls);
};
export const logo = (data, name, cls = 'pic logo') => (name ? teamLogo(data, data.teams.indexOf(name), cls) : null);
export const logoAt = (data, i, cls = 'pic logo') => teamLogo(data, i, cls);

// "Arsenal" for a player with a team; without one: the last club and a note, or just "retired"
export function teamText(p) {
  if (p.team) return p.team;
  if (p.last) return `${p.last} · ${p.status === 'retired' ? tr('на пенсии') : tr('последняя команда')}`;
  return tr('на пенсии');
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

// draws the result as a picture (for Telegram, Instagram, X …) from the same text that is copied
export function shareImage(text) {
  const lines = text.split('\n'); const W = 1080; const H = 1080;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, W, H); grad.addColorStop(0, '#0b0e17'); grad.addColorStop(1, '#2a1630'); g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.fillStyle = '#ff5a36'; g.fillRect(0, 0, W, 14);
  g.fillStyle = '#ff5a36'; g.beginPath(); g.roundRect(70, 70, 90, 90, 22); g.fill();
  g.fillStyle = '#fff'; g.font = '800 64px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('?', 115, 136);
  g.textAlign = 'left'; g.font = '800 54px system-ui, sans-serif'; g.fillStyle = '#eef1fa'; g.fillText('GuessWhoAmI', 185, 130);
  let y = 290; g.font = '600 46px system-ui, sans-serif';
  lines.forEach((l, i) => {
    const emoji = /^[\u2B1B\u2B1C\u{1F7E5}-\u{1F7EB}]+$/u.test(l.trim());
    g.font = emoji ? '88px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif' : (i === 0 ? '700 44px system-ui, sans-serif' : '600 46px system-ui, sans-serif');
    g.fillStyle = i === 0 ? '#ffc247' : '#eef1fa';
    if (g.measureText(l).width > W - 140 && !emoji) { g.font = '600 34px system-ui, sans-serif'; }
    if (emoji && !/^[\u2B1B\u2B1C\u{1F7E5}-\u{1F7EB}]+$/u.test((lines[i - 1] || '').trim())) y += 40;
    if (!emoji && /^[\u2B1B\u2B1C\u{1F7E5}-\u{1F7EB}]+$/u.test((lines[i - 1] || '').trim())) y += 50;
    g.fillText(i === 0 ? l.replace(/^GuessWhoAmI · /, '') : l, 70, y); y += emoji ? 66 : 72;
  });
  g.font = '700 44px system-ui, sans-serif'; g.fillStyle = '#8f9bb8'; g.fillText('guesswhoami.eu', 70, H - 70);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

export async function share(text) {
  const link = 'https://guesswhoami.eu';
  const full = text + '\n' + link;
  try {
    const blob = await shareImage(text);
    const file = blob && new File([blob], 'guesswhoami.png', { type: 'image/png' });
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: full }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(full); toast(tr('Результат скопирован')); }
  catch { prompt(tr('Скопируйте результат:'), full); }
}

export function playerLink(p) {
  return h('a', { href: p.url, target: '_blank', rel: 'noopener', class: 'plink' }, p.id);
}

// ---------- player search box with autocomplete ----------
// search ignores case and accents: "ozil" finds Özil, "gueler" is not needed, "guler" finds Güler
export const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/ø/g, 'o').replace(/ß/g, 'ss').replace(/đ/g, 'd').replace(/ł/g, 'l').toLowerCase();

export function playerSearch(data, { placeholder = tr('Введите ник игрока…'), exclude = () => false, onPick }) {
  const input = h('input', { type: 'text', class: 'search-input', placeholder, autocomplete: 'off', spellcheck: 'false' });
  const list = h('ul', { class: 'search-list', role: 'listbox' });
  const wrap = h('div', { class: 'search' }, input, list);
  let items = []; let active = 0;

  const render = () => {
    list.innerHTML = '';
    items.forEach((p, i) => {
      const li = h('li', { class: i === active ? 'active' : '', role: 'option' },
        photo(p), flag(p.cc), h('b', {}, p.id), h('span', { class: 'muted' }, p.name));
      li.addEventListener('mousedown', (e) => { e.preventDefault(); choose(p); });
      list.append(li);
    });
    list.style.display = items.length ? 'block' : 'none';
  };
  const update = () => {
    const q = fold(input.value.trim());
    if (!q) { items = []; render(); return; }
    const starts = []; const contains = [];
    for (const p of data.players) {
      if (exclude(p)) continue;
      const id = fold(p.id);
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
    h('div', { class: 'modal ' + cls }, h('div', { class: 'modal-head' }, h('h3', {}, title), h('button', { class: 'icon-btn', onclick: close, 'aria-label': tr('Закрыть') }, '×')), body));
  document.addEventListener('keydown', esc);
  document.body.append(back);
  return close;
}
