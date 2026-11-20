// Home hub: pick a game, see today's progress at a glance.
import { tr } from './i18n.js';
import { h } from './core.js';
import { getStats } from './stats.js';

const LOOK = {
  cs: ['#f5a524', '🔫'], dota: ['#e0463a', '🛡'], valorant: ['#ff4655', '🎯'], lol: ['#c89b3c', '⚔'], deadlock: ['#8b6cff', '👁'],
  football: ['#2fa36b', '⚽'], basket: ['#ff7a2f', '🏀'], tennis: ['#b7d63a', '🎾'],
};

export function renderHome(root, { GAMES, MODES, nav, num }) {
  const modesOf = (game) => Object.entries(MODES).filter(([, m]) => !((m.gameTitle && !m.gameTitle[game]) || (GAMES[game].itemsOnly && !m.set)));
  const done = (game, k) => !!getStats(game, k).days[num];
  let total = 0, got = 0;
  for (const g of Object.keys(GAMES)) for (const [k] of modesOf(g)) { total++; if (done(g, k)) got++; }

  const pickRandom = () => {
    const open = [];
    for (const g of Object.keys(GAMES)) for (const [k] of modesOf(g)) if (!done(g, k)) open.push([g, k]);
    const list = open.length ? open : Object.keys(GAMES).flatMap((g) => modesOf(g).map(([k]) => [g, k]));
    const [g, k] = list[Math.floor(Math.random() * list.length)];
    nav(g, k, false);
  };

  const card = (game) => {
    const [color, icon] = LOOK[game] || ['#ff5a36', '?'];
    const g = GAMES[game];
    const modes = modesOf(game);
    const left = modes.filter(([k]) => !done(game, k)).length;
    const c = h('article', { class: 'game-card' });
    c.style.setProperty('--gc', color);
    c.append(
      h('button', { class: 'gc-head', type: 'button', onclick: () => nav(game, modes[0][0], false) },
        h('span', { class: 'gc-icon' }, icon),
        h('span', { class: 'gc-title' }, g.title),
        h('span', { class: 'gc-left' + (left ? '' : ' all') }, left ? tr('ещё {0}', [left]) : '✓')),
      h('div', { class: 'gc-modes' }, modes.map(([k, m]) =>
        h('button', { type: 'button', class: 'gc-mode' + (done(game, k) ? ' done' : ''), onclick: () => nav(game, k, false) },
          h('span', {}, m.icon), m.gameTitle ? m.gameTitle[game] : m.title, done(game, k) ? h('i', {}, '✓') : ''))));
    return c;
  };
  const section = (label, sport) => h('section', { class: 'hub-sec' }, h('h2', {}, label),
    h('div', { class: 'hub-cards' }, Object.keys(GAMES).filter((k) => !!GAMES[k].sport === sport).map(card)));

  const pct = total ? Math.round((got / total) * 100) : 0;
  const bar = h('div', { class: 'hub-bar' }, h('i', {}));
  bar.firstChild.style.width = pct + '%';
  root.innerHTML = '';
  root.append(
    h('div', { class: 'hero' },
      h('div', {},
        h('h1', {}, tr('Угадай игрока')),
        h('p', {}, tr('Каждый день новые загадки по киберспорту и спорту. Выбери игру и режим.'))),
      h('div', { class: 'hero-side' },
        h('div', { class: 'hero-count' }, h('b', {}, got), ' / ' + total, h('span', {}, tr('сегодня сыграно'))),
        bar,
        h('button', { class: 'btn hero-btn', type: 'button', onclick: pickRandom }, '🎲 ' + tr('Случайная загадка')))),
    section(tr('🎮 Киберспорт'), false),
    section(tr('🏟 Спорт'), true));
}
