import { tr } from './i18n.js';
import { loadGame, today, h, GAMES, filtersFor, store } from './core.js';
import { lang, setLang } from './i18n.js';
import * as grid from './grid.js';
import * as whoami from './whoami.js';
import * as chain from './chain.js';
import { openProfile } from './achievements.js';

document.getElementById('profile-btn').addEventListener('click', openProfile);

// language, theme, footer and offline support
const langBtn = document.getElementById('lang-btn');
langBtn.textContent = lang === 'ru' ? 'EN' : 'RU';
langBtn.addEventListener('click', () => setLang(lang === 'ru' ? 'en' : 'ru'));

const THEMES = ['auto', 'dark', 'light'];
const themeBtn = document.getElementById('theme-btn');
function applyTheme(t) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  themeBtn.textContent = { auto: '◐', dark: '☾', light: '☀' }[t];
  themeBtn.title = { auto: tr('Тема: как в системе'), dark: tr('Тема: тёмная'), light: tr('Тема: светлая') }[t];
}
let theme = store.get('theme', 'auto');
applyTheme(theme);
themeBtn.addEventListener('click', () => { theme = THEMES[(THEMES.indexOf(theme) + 1) % 3]; store.set('theme', theme); applyTheme(theme); });

if (lang === 'en') {
  document.getElementById('license-note').innerHTML = 'Player data from <a href="https://liquipedia.net/" target="_blank" rel="noopener">Liquipedia</a>, licensed under <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC BY-SA 3.0</a>. Not affiliated with Liquipedia, Valve or tournament organisers.';
  document.title = 'GuessWhoAmI — guess the esports pro';
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !location.hostname.endsWith('claude.ai') && !location.hostname.endsWith('claudeusercontent.com')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

const MODES = {
  grid: { title: tr('Сетка'), icon: '▦', mod: grid },
  whoami: { title: tr('Кто я?'), icon: '?', mod: whoami },
  chain: { title: tr('Цепочка'), icon: '⛓', mod: chain },
};

const root = document.getElementById('mode-root');
const gameTabs = document.getElementById('game-tabs');
const modeTabs = document.getElementById('mode-tabs');
const dayBar = document.getElementById('day-bar');
const sourceNote = document.getElementById('source-note');

let endlessSeed = null;

function parseHash() {
  const [g, m, e] = location.hash.replace('#', '').split(/[-/]/);
  return { game: GAMES[g] ? g : 'cs', mode: MODES[m] ? m : 'grid', endless: e === 'free' };
}

function nav(game, mode, endless) {
  endlessSeed = null;
  location.hash = `${game}-${mode}${endless ? '-free' : ''}`;
}

function currentFilter(game) {
  const f = store.get(`filter:${game}`, 'all');
  return filtersFor(game)[f] ? f : 'all';
}

function filterSelect(game) {
  const cur = currentFilter(game);
  const sel = h('select', { id: 'difficulty', class: 'select', 'aria-label': tr('Сложность и эра'),
    onchange: (e) => { store.set(`filter:${game}`, e.target.value); endlessSeed = null; render(); } },
  Object.entries(filtersFor(game)).map(([k, f]) => h('option', { value: k, selected: k === cur }, f.label)));
  return sel;
}

async function render() {
  const { game, mode, endless } = parseHash();
  gameTabs.innerHTML = '';
  for (const [k, g] of Object.entries(GAMES)) {
    gameTabs.append(h('button', { class: 'tab' + (k === game ? ' active' : ''), onclick: () => nav(k, mode, endless) }, g.title));
  }
  modeTabs.innerHTML = '';
  for (const [k, m] of Object.entries(MODES)) {
    modeTabs.append(h('button', { class: 'mode-tab' + (k === mode ? ' active' : ''), onclick: () => nav(game, k, endless) }, h('span', { class: 'mode-icon' }, m.icon), m.title));
  }

  const { key, num } = today();
  if (endless && !endlessSeed) endlessSeed = String(Math.floor(Math.random() * 1e9));
  dayBar.innerHTML = '';
  dayBar.append(
    h('div', { class: 'seg' },
      h('button', { class: endless ? '' : 'active', onclick: () => nav(game, mode, false) }, tr('Ежедневная №{0}', [num])),
      h('button', { class: endless ? 'active' : '', onclick: () => nav(game, mode, true) }, tr('Бесконечная'))),
    h('div', { class: 'bar-right' }, filterSelect(game),
      endless ? h('button', { class: 'btn small', onclick: () => { endlessSeed = null; render(); } }, tr('Новая игра')) : ''));

  root.innerHTML = tr('<div class="loading">Загрузка игроков…</div>');
  try {
    const data = await loadGame(game);
    sourceNote.textContent = tr('{0}. Обновлено {1}. {2} игроков.', [tr(data.sourceNote), data.generated, data.players.length]);
    const fid = currentFilter(game);
    const suffix = fid === 'all' ? '' : `:${fid}`;
    const seed = (endless ? `${game}:${mode}:free:${endlessSeed}` : `${game}:${mode}:${key}`) + suffix;
    MODES[mode].mod.mount(root, data, { seed, daily: !endless, day: num, label: endless ? '∞' : tr('№{0}', [num]), filter: filtersFor(game)[fid].test });
  } catch (e) {
    root.innerHTML = '';
    root.append(h('div', { class: 'error' }, tr('Ошибка: ') + e.message, h('br'), tr('Откройте сайт через локальный сервер (см. README), а не как файл.')));
    console.error(e);
  }
}

window.addEventListener('hashchange', render);
render();
