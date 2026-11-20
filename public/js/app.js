import { loadGame, today, h, GAMES, filtersFor, store } from './core.js';
import * as grid from './grid.js';
import * as whoami from './whoami.js';
import * as chain from './chain.js';

const MODES = {
  grid: { title: 'Сетка', icon: '▦', mod: grid },
  whoami: { title: 'Кто я?', icon: '?', mod: whoami },
  chain: { title: 'Цепочка', icon: '⛓', mod: chain },
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
  const sel = h('select', { id: 'difficulty', class: 'select', 'aria-label': 'Сложность и эра',
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
      h('button', { class: endless ? '' : 'active', onclick: () => nav(game, mode, false) }, `Ежедневная №${num}`),
      h('button', { class: endless ? 'active' : '', onclick: () => nav(game, mode, true) }, 'Бесконечная')),
    h('div', { class: 'bar-right' }, filterSelect(game),
      endless ? h('button', { class: 'btn small', onclick: () => { endlessSeed = null; render(); } }, 'Новая игра') : ''));

  root.innerHTML = '<div class="loading">Загрузка игроков…</div>';
  try {
    const data = await loadGame(game);
    sourceNote.textContent = `${data.sourceNote}. Обновлено ${data.generated}. ${data.players.length} игроков.`;
    const fid = currentFilter(game);
    const suffix = fid === 'all' ? '' : `:${fid}`;
    const seed = (endless ? `${game}:${mode}:free:${endlessSeed}` : `${game}:${mode}:${key}`) + suffix;
    MODES[mode].mod.mount(root, data, { seed, daily: !endless, day: num, label: endless ? '∞' : `№${num}`, filter: filtersFor(game)[fid].test });
  } catch (e) {
    root.innerHTML = '';
    root.append(h('div', { class: 'error' }, 'Ошибка: ' + e.message, h('br'), 'Откройте сайт через локальный сервер (см. README), а не как файл.'));
    console.error(e);
  }
}

window.addEventListener('hashchange', render);
render();
