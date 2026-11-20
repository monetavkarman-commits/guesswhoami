// Achievements unlocked from daily results, plus the profile window with stats per game and mode.
import { store, h, modal, toast, GAMES } from './core.js';
import { getStats } from './stats.js';

const MODES = { grid: 'Сетка', whoami: 'Кто я?', chain: 'Цепочка' };

function allStats() {
  const out = [];
  for (const g of Object.keys(GAMES)) for (const m of Object.keys(MODES)) out.push({ g, m, s: getStats(g, m) });
  return out;
}

export const ACHIEVEMENTS = [
  { id: 'first', icon: '🎯', title: 'Первый шаг', desc: 'Закончить любую ежедневную игру', test: (e, all) => all.some((x) => x.s.played > 0) },
  { id: 'sniper', icon: '🔫', title: 'Ваншот', desc: 'Угадать игрока в «Кто я?» с первой попытки', test: (e) => e.mode === 'whoami' && e.won && e.guesses === 1 },
  { id: 'noclue', icon: '🧠', title: 'Без подсказок', desc: 'Угадать игрока за 4 попытки или быстрее без подсказок', test: (e) => e.mode === 'whoami' && e.won && e.guesses <= 4 && !e.clues },
  { id: 'fullgrid', icon: '▦', title: 'Полная сетка', desc: 'Заполнить все 9 клеток', test: (e) => e.mode === 'grid' && e.correct === 9 },
  { id: 'perfectgrid', icon: '💎', title: 'Чистая сетка', desc: 'Заполнить сетку без единой ошибки', test: (e) => e.mode === 'grid' && e.correct === 9 && e.score > 900 },
  { id: 'chainpar', icon: '⛓', title: 'Кратчайший путь', desc: 'Собрать цепочку за минимальное число звеньев', test: (e) => e.mode === 'chain' && e.won && e.links <= e.par },
  { id: 'thousand', icon: '🏆', title: 'Тысячник', desc: 'Набрать 1000 очков в одной игре', test: (e) => e.score >= 1000 },
  { id: 'streak3', icon: '🔥', title: 'Разогрев', desc: 'Серия из 3 побед подряд в одном режиме', test: (e, all) => all.some((x) => x.s.best >= 3) },
  { id: 'streak7', icon: '📅', title: 'Неделя без пропусков', desc: 'Серия из 7 побед подряд', test: (e, all) => all.some((x) => x.s.best >= 7) },
  { id: 'streak30', icon: '👑', title: 'Легенда', desc: 'Серия из 30 побед подряд', test: (e, all) => all.some((x) => x.s.best >= 30) },
  { id: 'trio', icon: '🎲', title: 'Хет-трик', desc: 'Сыграть все три режима одной игры за день',
    test: (e) => Object.keys(MODES).every((m) => getStats(e.game, m).days[e.day]) },
  { id: 'both', icon: '🌍', title: 'Универсал', desc: 'Сыграть ежедневки и в CS, и в Dota 2', test: (e, all) => Object.keys(GAMES).every((g) => all.some((x) => x.g === g && x.s.played)) },
  { id: 'fifty', icon: '🎖', title: 'Завсегдатай', desc: 'Сыграть 50 ежедневных игр', test: (e, all) => all.reduce((n, x) => n + x.s.played, 0) >= 50 },
];

export const unlocked = () => store.get('achievements', {});

document.addEventListener('gwai:result', (ev) => {
  const e = ev.detail; const all = allStats(); const got = unlocked();
  for (const a of ACHIEVEMENTS) {
    if (got[a.id]) continue;
    let ok = false;
    try { ok = a.test(e, all); } catch { ok = false; }
    if (ok) { got[a.id] = new Date().toISOString().slice(0, 10); setTimeout(() => toast(`${a.icon} Достижение: ${a.title}`), 900); }
  }
  store.set('achievements', got);
});

export function openProfile() {
  const got = unlocked();
  const rows = allStats().filter((x) => x.s.played);
  const table = rows.length
    ? h('div', { class: 'profile-table' },
      h('div', { class: 'pt-row head' }, ['Игра', 'Сыграно', 'Победы', 'Серия', 'Лучшая', 'Рекорд', 'Средний'].map((t) => h('div', {}, t))),
      rows.map(({ g, m, s }) => h('div', { class: 'pt-row' }, h('div', {}, `${GAMES[g].short} · ${MODES[m]}`),
        [s.played, `${Math.round((100 * s.wins) / s.played)}%`, s.streak, s.best, s.top, Math.round(s.total / s.played)].map((v) => h('div', {}, String(v))))))
    : h('p', { class: 'muted' }, 'Сыграйте любую ежедневную игру, и здесь появится статистика.');
  const list = h('div', { class: 'ach-list' }, ACHIEVEMENTS.map((a) => h('div', { class: 'ach' + (got[a.id] ? ' got' : '') },
    h('span', { class: 'ach-icon' }, a.icon), h('div', {}, h('b', {}, a.title), h('small', {}, got[a.id] ? `${a.desc} · ${got[a.id]}` : a.desc)))));
  modal('Профиль', h('div', { class: 'stack' }, h('h4', {}, 'Статистика ежедневных игр'), table,
    h('h4', {}, `Достижения ${Object.keys(got).length}/${ACHIEVEMENTS.length}`), list), null, 'wide');
}
