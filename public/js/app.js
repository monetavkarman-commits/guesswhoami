import { loadGame, today, h, GAMES } from './core.js';
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
  const [g, m, e] = location.hash.replace('#', '').split('/');
  return { game: GAMES[g] ? g : 'cs', mode: MODES[m] ? m : 'grid', endless: e === 'free' };
}

function nav(game, mode, endless) {
  endlessSeed = null;
  location.hash = `${game}/${mode}${endless ? '/free' : ''}`;
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
    endless ? h('button', { class: 'btn small', onclick: () => { endlessSeed = null; render(); } }, 'Новая игра') : '');

  root.innerHTML = '<div class="loading">Загрузка игроков…</div>';
  try {
    const data = await loadGame(game);
    sourceNote.textContent = `${data.sourceNote}. Обновлено ${data.generated}. ${data.players.length} игроков.`;
    const seed = endless ? `${game}:${mode}:free:${endlessSeed}` : `${game}:${mode}:${key}`;
    MODES[mode].mod.mount(root, data, { seed, daily: !endless, label: endless ? '∞' : `№${num}` });
  } catch (e) {
    root.innerHTML = '';
    root.append(h('div', { class: 'error' }, 'Ошибка: ' + e.message, h('br'), 'Откройте сайт через локальный сервер (см. README), а не как файл.'));
    console.error(e);
  }
}

window.addEventListener('hashchange', render);
render();
