// Online features: leaderboard and duels. They use the shared database the page gets when it runs as a
// Claude artifact (claude.use("db")). Anywhere else everything here quietly reports "offline" and the
// duel still works through the link alone (the challenger's score travels in the link).
import { tr } from './i18n.js';
import { h, modal, toast, GAMES } from './core.js';

const MODE_NAMES = () => ({ grid: tr('Сетка'), whoami: tr('Кто я?'), chain: tr('Цепочка'), items: tr('Предметы') });
// claude.ai link of the published artifact, used for challenge links when the page runs inside it
const ARTIFACT_URL = 'https://claude.ai/artifact/XEQV83uqdWp7RRhgZFTYHa';

let ready = null;
function init() {
  if (ready) return ready;
  ready = (async () => {
    const c = window.claude;
    if (!c || typeof c.use !== 'function') return null;
    const [db, user] = await Promise.all([c.use('db'), c.use('user')]);
    if (!db || !user) return null;
    const uid = await user.id();
    if (!uid) return null;
    return { db, user, uid };
  })().catch(() => null);
  return ready;
}

// ---------- leaderboard: board/<uid> holds one player's recent daily scores ----------
let writing = Promise.resolve();
export function submitDaily({ game, mode, day, score }) {
  writing = writing.then(async () => {
    const on = await init(); if (!on) return;
    const ref = on.db.doc(`board/${on.uid}`);
    const snap = await ref.get();
    const cur = snap.exists ? structuredClone(snap.data()) : { scores: {}, total: 0, games: 0 };
    const k = `${game}:${mode}:${day}`;
    if (cur.scores[k] != null) return;
    cur.scores[k] = score;
    cur.total = (cur.total || 0) + score;
    cur.games = (cur.games || 0) + 1;
    // keep the last 14 days of per-game scores; the totals keep everything
    for (const key of Object.keys(cur.scores)) if (+key.split(':')[2] < day - 14) delete cur.scores[key];
    cur.updated = new Date().toISOString();
    await ref.set(cur);
  }).catch((e) => console.warn('leaderboard write failed', e));
  return writing;
}

document.addEventListener('gwai:result', (e) => submitDaily(e.detail));

async function names(on, ids) {
  try { const ps = await on.user.profiles(ids); return (id) => (ps[id] && ps[id].name) || tr('Игрок'); }
  catch { return () => tr('Игрок'); }
}

export async function openLeaderboard(game, day) {
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, tr('Загрузка…')));
  modal(tr('Рейтинг'), body, null, 'wide');
  const on = await init();
  body.innerHTML = '';
  if (!on) { body.append(h('p', { class: 'muted' }, tr('Рейтинг работает, когда сайт открыт как артефакт Claude и вы вошли в аккаунт.'))); return; }
  let rows;
  try { rows = (await on.db.collection('board').limit(500).get()).docs.map((d) => ({ id: d.id, ...d.data() })); }
  catch { body.append(h('p', { class: 'muted' }, tr('Не получилось загрузить рейтинг. Попробуйте позже.'))); return; }
  const name = await names(on, rows.map((r) => r.id));

  const todayRows = rows.map((r) => ({ id: r.id, score: Object.keys(MODE_NAMES()).reduce((s, m) => s + (r.scores?.[`${game}:${m}:${day}`] || 0), 0) }))
    .filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 20);
  const allRows = rows.filter((r) => r.total > 0).sort((a, b) => b.total - a.total).slice(0, 20);

  const table = (list, field, sub) => (list.length
    ? h('ol', { class: 'board' }, list.map((r, i) => h('li', { class: r.id === on.uid ? 'me' : '' },
      h('span', { class: 'rank' }, String(i + 1)), h('span', { class: 'who' }, name(r.id), r.id === on.uid ? tr(' (вы)') : ''),
      sub ? h('small', { class: 'muted' }, sub(r)) : null, h('b', {}, String(r[field])))))
    : h('p', { class: 'muted' }, tr('Пока никого. Сыграйте ежедневку, и вы будете первым.')));

  body.append(h('h4', {}, tr('Сегодня · {0} · все режимы', [GAMES[game].short])), table(todayRows, 'score'),
    h('h4', {}, tr('За всё время')), table(allRows, 'total', (r) => tr('{0} игр', [r.games || 0])));
}

// ---------- duels ----------
export function newDuelId() { return Math.random().toString(36).slice(2, 10); }

export function duelLink(game, mode, id, score, filter = 'all') {
  const hash = `#${game}-${mode}-duel-${id}-s${score}${filter !== 'all' ? `-f${filter}` : ''}`;
  const inFrame = (() => { try { return window.top !== window; } catch { return true; } })();
  return (inFrame ? ARTIFACT_URL : location.href.split('#')[0]) + hash;
}

async function saveDuel(on, { id, game, mode, score }) {
  try { await on.db.doc(`duels/${id}-${on.uid}`).set({ duel: id, uid: on.uid, game, mode, score, at: new Date().toISOString() }); }
  catch (e) { console.warn('duel write failed', e); }
}

// Panel shown under a finished endless or duel game.
export function duelPanel({ game, mode, id, score, rival, filter }) {
  const box = h('div', { class: 'duel' });
  const link = duelLink(game, mode, id, score, filter);
  const linkInput = h('input', { class: 'search-input small', id: 'duel-link', readonly: true, value: link, onfocus: (e) => e.target.select() });
  const copy = async () => {
    try { await navigator.clipboard.writeText(tr('Сыграй со мной в GuessWhoAmI ({0} · {1}). Я набрал {2}. Побьёшь? {3}', [GAMES[game].short, MODE_NAMES()[mode], score, link])); toast(tr('Ссылка скопирована')); }
    catch { linkInput.focus(); linkInput.select(); }
  };
  box.append(h('h3', {}, '⚔ ', tr('Дуэль')));
  if (rival != null) {
    const verdict = score > rival ? tr('Вы победили!') : score < rival ? tr('Соперник оказался сильнее.') : tr('Ничья!');
    box.append(h('p', { class: 'duel-vs' }, h('span', {}, tr('Вы'), h('b', {}, String(score))), h('span', { class: 'muted' }, 'vs'), h('span', {}, tr('Соперник'), h('b', {}, String(rival)))), h('p', {}, verdict));
  } else {
    box.append(h('p', { class: 'muted' }, tr('Отправьте другу ссылку: у него будет точно такая же игра, а в конце вы увидите, кто набрал больше.')));
  }
  box.append(h('div', { class: 'duel-link' }, linkInput, h('button', { class: 'btn small', onclick: copy }, tr('Скопировать вызов'))));
  const list = h('div', { class: 'duel-table' });
  box.append(list);
  init().then(async (on) => {
    if (!on) return;
    await saveDuel(on, { id, game, mode, score });
    let rows = [];
    try { rows = (await on.db.collection('duels').where('duel', '==', id).limit(100).get()).docs.map((d) => d.data()); } catch { return; }
    if (rows.length < 2) return;
    const name = await names(on, rows.map((r) => r.uid));
    rows.sort((a, b) => b.score - a.score);
    list.append(h('h4', {}, tr('Все участники дуэли')), h('ol', { class: 'board' }, rows.map((r, i) => h('li', { class: r.uid === on.uid ? 'me' : '' },
      h('span', { class: 'rank' }, String(i + 1)), h('span', { class: 'who' }, name(r.uid)), h('b', {}, String(r.score))))));
  });
  return box;
}
