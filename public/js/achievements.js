// Achievements unlocked from daily results, plus the profile window with stats per game and mode.
import { tr } from './i18n.js';
import { store, h, modal, toast, GAMES } from './core.js';
import { getStats } from './stats.js';

const MODES = { grid: tr('Сетка'), whoami: tr('Кто я?'), chain: tr('Цепочка'), items: tr('Предметы'), maps: tr('Карты'), gear: tr('Предметы'), team: tr('Команда'), lineup: tr('Состав') };

function allStats() {
  const out = [];
  for (const g of Object.keys(GAMES)) for (const m of Object.keys(MODES)) out.push({ g, m, s: getStats(g, m) });
  return out;
}

export const ACHIEVEMENTS = [
  { id: 'first', icon: '🎯', title: tr('Первый шаг'), desc: tr('Закончить любую ежедневную игру'), test: (e, all) => all.some((x) => x.s.played > 0) },
  { id: 'sniper', icon: '🔫', title: tr('Ваншот'), desc: tr('Угадать игрока в «Кто я?» с первой попытки'), test: (e) => e.mode === 'whoami' && e.won && e.guesses === 1 },
  { id: 'noclue', icon: '🧠', title: tr('Без подсказок'), desc: tr('Угадать игрока за 4 попытки или быстрее без подсказок'), test: (e) => e.mode === 'whoami' && e.won && e.guesses <= 4 && !e.clues },
  { id: 'fullgrid', icon: '▦', title: tr('Полная сетка'), desc: tr('Заполнить все 9 клеток'), test: (e) => e.mode === 'grid' && e.correct === 9 },
  { id: 'perfectgrid', icon: '💎', title: tr('Чистая сетка'), desc: tr('Заполнить сетку без единой ошибки'), test: (e) => e.mode === 'grid' && e.correct === 9 && e.score > 900 },
  { id: 'chainpar', icon: '⛓', title: tr('Кратчайший путь'), desc: tr('Собрать цепочку за минимальное число звеньев'), test: (e) => e.mode === 'chain' && e.won && e.links <= e.par },
  { id: 'thousand', icon: '🏆', title: tr('Тысячник'), desc: tr('Набрать 1000 очков в одной игре'), test: (e) => e.score >= 1000 },
  { id: 'streak3', icon: '🔥', title: tr('Разогрев'), desc: tr('Серия из 3 побед подряд в одном режиме'), test: (e, all) => all.some((x) => x.s.best >= 3) },
  { id: 'streak7', icon: '📅', title: tr('Неделя без пропусков'), desc: tr('Серия из 7 побед подряд'), test: (e, all) => all.some((x) => x.s.best >= 7) },
  { id: 'streak30', icon: '👑', title: tr('Легенда'), desc: tr('Серия из 30 побед подряд'), test: (e, all) => all.some((x) => x.s.best >= 30) },
  { id: 'trio', icon: '🎲', title: tr('Хет-трик'), desc: tr('Сыграть все три режима одной игры за день'),
    test: (e) => ['grid', 'whoami', 'chain'].every((m) => getStats(e.game, m).days[e.day]) },
  { id: 'both', icon: '🌍', title: tr('Универсал'), desc: tr('Сыграть ежедневки в двух разных играх'), test: (e, all) => Object.keys(GAMES).filter((g) => all.some((x) => x.g === g && x.s.played)).length >= 2 },
  { id: 'fifty', icon: '🎖', title: tr('Завсегдатай'), desc: tr('Сыграть 50 ежедневных игр'), test: (e, all) => all.reduce((n, x) => n + x.s.played, 0) >= 50 },
];

export const unlocked = () => store.get('achievements', {});

document.addEventListener('gwai:result', (ev) => {
  const e = ev.detail; const all = allStats(); const got = unlocked();
  for (const a of ACHIEVEMENTS) {
    if (got[a.id]) continue;
    let ok = false;
    try { ok = a.test(e, all); } catch { ok = false; }
    if (ok) { got[a.id] = new Date().toISOString().slice(0, 10); setTimeout(() => toast(tr('{0} Достижение: {1}', [a.icon, a.title])), 900); }
  }
  store.set('achievements', got);
});

export function localStatsBlock() {
  const rows = allStats().filter((x) => x.s.played);
  return rows.length
    ? h('div', { class: 'profile-table' },
      h('div', { class: 'pt-row head' }, [tr('Игра'), tr('Сыграно'), tr('Победы'), tr('Серия'), tr('Лучшая'), tr('Рекорд'), tr('Средний')].map((t) => h('div', {}, t))),
      rows.map(({ g, m, s }) => h('div', { class: 'pt-row' }, h('div', {}, `${GAMES[g].short} · ${MODES[m]}`),
        [s.played, `${Math.round((100 * s.wins) / s.played)}%`, s.streak, s.best, s.top, Math.round(s.total / s.played)].map((v) => h('div', {}, String(v))))))
    : h('p', { class: 'muted' }, tr('Сыграйте любую ежедневную игру, и здесь появится статистика.'));
}

export function achievementsBlock() {
  const got = unlocked();
  return h('div', { class: 'stack' }, h('h4', {}, tr('Достижения {0}/{1}', [Object.keys(got).length, ACHIEVEMENTS.length])),
    h('div', { class: 'ach-list' }, ACHIEVEMENTS.map((a) => h('div', { class: 'ach' + (got[a.id] ? ' got' : '') },
      h('span', { class: 'ach-icon' }, a.icon), h('div', {}, h('b', {}, a.title), h('small', {}, got[a.id] ? `${a.desc} · ${got[a.id]}` : a.desc))))));
}

export function overallLocal() {
  const all = allStats().map((x) => x.s);
  const played = all.reduce((n, s) => n + s.played, 0), wins = all.reduce((n, s) => n + s.wins, 0);
  return { played, wins, best: Math.max(0, ...all.map((s) => s.best)), streak: Math.max(0, ...all.map((s) => s.streak)), total: all.reduce((n, s) => n + s.total, 0) };
}
