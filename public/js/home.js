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
  // holographic hub: big play button in the centre, one ring per game; a game opens its mode circles behind it
  const keys = Object.keys(GAMES), R = 25, D = 21, SPREAD = 26, NS = 'http://www.w3.org/2000/svg';
  const left = total - got;
  const orbit = h('div', { class: 'hx-orbit' });
  const sheetTitle = h('h4'), sheetGrid = h('div', { class: 'hx-sgrid' });
  const sheet = h('div', { class: 'hx-sheet' }, sheetTitle, sheetGrid);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('aria-hidden', 'true');
  const el = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.append(e); return e; };
  el('circle', { class: 'hx-ringline', cx: 50, cy: 50, r: R }); el('circle', { class: 'hx-ringline', cx: 50, cy: 50, r: 22 });
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cur = -1, busy = false, uid = 0;
  // the same dashed spoke is redrawn in green, revealed from its start to its end through a mask
  const lit = (x1, y1, x2, y2) => {
    const id = 'hxm' + (++uid), defs = el('defs', {}), mask = el('mask', { id, maskUnits: 'userSpaceOnUse', x: -30, y: -30, width: 160, height: 160 }, defs);
    el('line', { class: 'hx-mline', x1, y1, x2, y2, pathLength: 100 }, mask);
    return el('line', { class: 'hx-spoke hx-lit', x1, y1, x2, y2, mask: 'url(#' + id + ')' });
  };
  const nodes = [];
  const reset = () => {
    svg.querySelectorAll('.hx-lit, defs, .hx-conn').forEach((e) => e.remove());
    orbit.querySelectorAll('.hx-sat').forEach((e) => e.remove());
    sheetGrid.textContent = ''; sheet.classList.remove('on');
    nodes.forEach((n) => n.classList.remove('open'));
    orbit.classList.remove('sel'); cur = -1;
  };
  const pts = keys.map((_, i) => { const a = (-90 + (i * 360) / keys.length) * Math.PI / 180; return { x: +(50 + R * Math.cos(a)).toFixed(2), y: +(50 + R * Math.sin(a)).toFixed(2) }; });
  const openGame = (i) => {
    if (busy) return;
    const same = cur === i; reset(); if (same) return;
    cur = i;
    const game = keys[i], p = pts[i], modes = modesOf(game), n = modes.length, out = -90 + (i * 360) / keys.length;
    nodes[i].classList.add('open'); orbit.classList.add('sel');
    lit(50, 50, p.x, p.y);
    const narrow = window.matchMedia('(max-width: 640px)').matches;
    if (narrow) { sheetTitle.textContent = GAMES[game].title; sheet.classList.add('on'); setTimeout(() => sheet.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' }), 120); }
    modes.forEach(([k, m], j) => {
      const s = h('button', { class: 'hx-sat' + (done(game, k) ? ' done' : ''), type: 'button' }, m.gameTitle ? m.gameTitle[game] : m.title);
      let cx = 0, cy = 0;
      if (!narrow) {
        const a = (out + (j - (n - 1) / 2) * SPREAD) * Math.PI / 180;
        cx = +Math.min(96, Math.max(4, p.x + D * Math.cos(a))).toFixed(2); cy = +Math.min(96, Math.max(4, p.y + D * Math.sin(a))).toFixed(2);
        s.style.left = cx + '%'; s.style.top = cy + '%'; s.style.transitionDelay = (0.4 + j * 0.05) + 's';
        const c = el('line', { class: 'hx-conn', x1: p.x, y1: p.y, x2: cx, y2: cy }); c.style.transitionDelay = (0.4 + j * 0.05) + 's';
        setTimeout(() => c.classList.add('in'), 20);
        orbit.append(s);
      } else sheetGrid.append(s);
      setTimeout(() => s.classList.add('in'), 30);
      s.addEventListener('click', (ev) => {
        ev.stopPropagation(); if (busy) return; busy = true;
        if (!narrow) lit(p.x, p.y, cx, cy);
        s.classList.add('go');
        setTimeout(() => { busy = false; nav(game, k, false); }, reduced() ? 0 : narrow ? 250 : 700);
      });
    });
  };
  // game logo above the name: the badge/picture used in the tabs, or the sport's emoji
  const shortOf = (game) => GAMES[game].short || GAMES[game].title;
  const emojiOf = (game) => { const m = shortOf(game).match(/^(\S+)\s(.+)$/u); return GAMES[game].sport && m ? m[1] : null; };
  const nameOf = (game) => { const m = shortOf(game).match(/^(\S+)\s(.+)$/u); return GAMES[game].sport && m ? m[2] : shortOf(game); };
  const logoOf = (game) => { const b = gameBadge(game, 'gico hx-logo'); return b || h('span', { class: 'hx-logo hx-emo', 'aria-hidden': 'true' }, emojiOf(game) || '?'); };
  keys.forEach((game, i) => {
    const p = pts[i], modes = modesOf(game), rest = modes.filter(([k]) => !done(game, k)).length;
    el('line', { class: 'hx-spoke', x1: 50, y1: 50, x2: p.x, y2: p.y });
    const b = h('button', { class: 'hx-node ' + (!rest ? 'done' : rest < modes.length ? 'part' : ''), type: 'button', 'aria-label': GAMES[game].title, onclick: (ev) => { ev.stopPropagation(); openGame(i); } },
      h('span', { class: 'hx-tick', 'aria-hidden': 'true' }, '✓'),
      h('span', { class: 'hx-in' }, logoOf(game), h('b', {}, nameOf(game)), h('span', { class: 'hx-st' }, rest ? tr('ещё {0}', [rest]) : '✓')));
    b.title = GAMES[game].title;
    b.style.left = p.x + '%'; b.style.top = p.y + '%';
    nodes.push(b);
  });
  const playBtn = h('button', { class: 'hx-play', type: 'button', onclick: (ev) => { ev.stopPropagation(); if (!busy) pickRandom(); } },
    h('span', { class: 'hx-in' }, h('b', {}, tr('Играть')), h('small', {}, left > 0 ? tr('осталось сегодня: {0}', [left]) : tr('сегодня всё пройдено'))));
  orbit.append(svg, playBtn, ...nodes);
  orbit.addEventListener('click', () => { if (!busy) reset(); });
  root.append(
    h('div', { class: 'hx' },
      h('div', { class: 'hx-frame' }, orbit, sheet,
        h('p', { class: 'hx-hint' }, tr('Нажми на игру, затем выбери режим')),
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
