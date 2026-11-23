// Home hub: pick a game, see today's progress at a glance.
import { tr } from './i18n.js';
import { h, store, modal, gameBadge } from './core.js';
import { getStats } from './stats.js';

const LOOK = {
  cs: ['#f5a524', '🔫'], dota: ['#e0463a', '🛡'], valorant: ['#ff4655', '🎯'], lol: ['#c89b3c', '⚔'], deadlock: ['#8b6cff', '👁'],
  football: ['#2fa36b', '⚽'], basket: ['#ff7a2f', '🏀'], tennis: ['#b7d63a', '🎾'], hockey: ['#3a8fe0', '🏒'], mma: ['#d4373d', '🥋'], boxing: ['#c0302e', '🥊'],
};

// install prompt of the browser (Chrome/Edge/Android); iOS Safari has no event, so it gets a short hint
let installEvent = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; });
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone();

const HOWTO = () => [
  ['▦', tr('Сетка'), tr('В каждую клетку впиши игрока, который подходит и строке, и столбцу. Попыток 12.')],
  ['?', tr('Кто я?'), tr('Угадай загаданного игрока. После каждой попытки цвета подсказывают, что совпало: страна, роль, возраст, команда.')],
  ['⛓', tr('Цепочка'), tr('Соедини двух игроков через тех, с кем они играли в одной команде. Чем короче цепочка, тем больше очков.')],
  ['◆', tr('Предметы и герои'), tr('Угадай героя, оружие или предмет по подсказкам и описанию.')],
];
function howTo() {
  const body = h('div', { class: 'stack howto-list' }, HOWTO().map(([i, t, d]) => h('div', { class: 'howto-row' }, h('span', { class: 'howto-ic' }, i), h('div', {}, h('b', {}, t), h('p', { class: 'muted' }, d)))),
    h('p', { class: 'muted small' }, tr('Новые загадки каждый день в 00:00. Играть можно без аккаунта.')));
  modal(tr('Как играть'), body);
}

export function renderHome(root, { GAMES, MODES, nav, num }) {
  const modesOf = (game) => Object.entries(MODES).filter(([, m]) => !((m.gameTitle && !m.gameTitle[game]) || (GAMES[game].itemsOnly && !m.set)));
  const done = (game, k) => !!getStats(game, k).days[num];
  let total = 0, got = 0;
  for (const g of Object.keys(GAMES)) for (const [k] of modesOf(g)) { total++; if (done(g, k)) got++; }

  // day streak: consecutive days with at least one finished daily game (today may still be open)
  const playedDays = new Set();
  for (const g of Object.keys(GAMES)) for (const [k] of modesOf(g)) Object.keys(getStats(g, k).days).forEach((d) => playedDays.add(+d));
  let streak = 0; for (let d = playedDays.has(num) ? num : num - 1; playedDays.has(d); d--) streak++;

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
        h('span', { class: 'gc-icon' }, gameBadge(game, 'gico big') || icon),
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
  if (!store.get('howtoSeen', false)) { store.set('howtoSeen', true); setTimeout(() => { if (!document.querySelector('.modal-back') && /^(#?)$/.test(location.hash)) howTo(); }, 2500); }
  // holographic hub: big play button in the centre, one ring per game around it
  const keys = Object.keys(GAMES), R = 37, NS = 'http://www.w3.org/2000/svg';
  const left = total - got;
  const orbit = h('div', { class: 'hx-orbit' });
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('aria-hidden', 'true');
  const ring = (r) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('class', 'hx-ringline'); c.setAttribute('cx', 50); c.setAttribute('cy', 50); c.setAttribute('r', r); svg.append(c); };
  ring(R); ring(24);
  const nodes = keys.map((game, i) => {
    const a = (-90 + (i * 360) / keys.length) * Math.PI / 180, x = 50 + R * Math.cos(a), y = 50 + R * Math.sin(a);
    const ln = document.createElementNS(NS, 'line');
    ln.setAttribute('class', 'hx-spoke'); ln.setAttribute('x1', 50); ln.setAttribute('y1', 50); ln.setAttribute('x2', x.toFixed(2)); ln.setAttribute('y2', y.toFixed(2)); svg.append(ln);
    const modes = modesOf(game), rest = modes.filter(([k]) => !done(game, k)).length;
    const state = !rest ? 'done' : rest < modes.length ? 'part' : '';
    const b = h('button', { class: 'hx-node ' + state, type: 'button', 'aria-label': GAMES[game].title, onclick: () => nav(game, modes[0][0], false) },
      h('span', { class: 'hx-tick', 'aria-hidden': 'true' }, '✓'),
      h('span', { class: 'hx-in' }, h('b', {}, GAMES[game].short || GAMES[game].title), h('span', { class: 'hx-st' }, rest ? tr('ещё {0}', [rest]) : '✓')));
    b.title = GAMES[game].title;
    b.style.left = x.toFixed(2) + '%'; b.style.top = y.toFixed(2) + '%';
    return b;
  });
  const playBtn = h('button', { class: 'hx-play', type: 'button', onclick: pickRandom },
    h('span', { class: 'hx-in' }, h('b', {}, tr('Играть')), h('small', {}, left > 0 ? tr('осталось сегодня: {0}', [left]) : tr('сегодня всё пройдено'))));
  orbit.append(svg, playBtn, ...nodes);
  root.append(
    h('div', { class: 'hx' },
      h('div', { class: 'hx-frame' }, orbit,
        h('div', { class: 'hx-floor', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
        h('div', { class: 'hx-meta' },
          h('span', {}, '🔥 ' + tr('Серия: {0} дн.', [streak])),
          h('span', {}, h('b', {}, got), ' / ' + total + ' ', tr('сегодня сыграно')),
          h('span', { class: 'hx-links' },
            h('button', { class: 'hx-chip', type: 'button', onclick: howTo }, '❓ ' + tr('Как играть')),
            !standalone() && (installEvent || isIos()) ? h('button', { class: 'hx-chip', type: 'button', onclick: async () => {
              if (installEvent) { installEvent.prompt(); installEvent = null; }
              else modal(tr('Установка'), h('p', {}, tr('Нажмите «Поделиться» в Safari и выберите «На экран Домой»: сайт появится как приложение.')));
            } }, '📲 ' + tr('Установить')) : null)))));
}
