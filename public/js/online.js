// Online features: leaderboard and duels. Two backends behind one small interface (db.doc / db.collection / user.profiles):
// the shared database the page gets as a Claude artifact (claude.use("db")), or Supabase on our own domain
// (see js/config.js and supabase/schema.sql). Without either everything here quietly reports "offline".
import { tr } from './i18n.js';
import { h, modal, toast, GAMES } from './core.js';
import { accountsEnabled, client, currentUser } from './account.js';

const MODE_NAMES = () => ({ grid: tr('Сетка'), whoami: tr('Кто я?'), chain: tr('Цепочка'), items: tr('Предметы'), maps: tr('Карты'), gear: tr('Предметы'), team: tr('Команда'), lineup: tr('Состав') });
// claude.ai link of the published artifact, used for challenge links when the page runs inside it
const ARTIFACT_URL = 'https://claude.ai/artifact/XEQV83uqdWp7RRhgZFTYHa';

let ready = null;
function init() {
  if (ready) return ready;
  ready = (async () => {
    const c = window.claude;
    if (!c || typeof c.use !== 'function') return accountsEnabled() ? supabaseBackend() : null;
    const [db, user] = await Promise.all([c.use('db'), c.use('user')]);
    if (!db || !user) return null;
    const uid = await user.id();
    if (!uid) return null;
    return { db, user, uid };
  })().catch(() => null);
  return ready;
}

// Supabase stores every document in one "docs" table (collection, id, owner, data); profiles hold public nicknames.
// uid is null for a visitor who has not logged in: they can read the leaderboard but not write to it.
async function supabaseBackend() {
  const sb = await client(); if (!sb) return null;
  const user = await currentUser();
  const query = (col, filters = []) => ({
    where: (field, _op, value) => query(col, [...filters, [field, value]]),
    limit: (n) => ({ get: async () => {
      let q = sb.from('docs').select('id,data').eq('collection', col).limit(n);
      for (const [f, v] of filters) q = q.eq(`data->>${f}`, String(v));
      const { data, error } = await q; if (error) throw error;
      return { docs: data.map((r) => ({ id: r.id, data: () => r.data })) };
    } }),
  });
  const db = {
    doc: (path) => {
      const [col, id] = path.split('/');
      return {
        get: async () => {
          const { data, error } = await sb.from('docs').select('data').eq('collection', col).eq('id', id).maybeSingle();
          if (error) throw error;
          return { exists: !!data, data: () => data && data.data };
        },
        set: async (value) => {
          const { error } = await sb.from('docs').upsert({ collection: col, id, owner: user.id, data: value }); if (error) throw error;
        },
      };
    },
    collection: (col) => query(col),
  };
  const profiles = async (ids) => {
    const { data } = await sb.from('profiles').select('id,name').in('id', [...new Set(ids)].slice(0, 500));
    return Object.fromEntries((data || []).map((p) => [p.id, { name: p.name }]));
  };
  // scores are written by a server function that checks them (supabase/scores.sql); the old direct write stays as a fallback until that is installed
  const rpc = (fn, args) => sb.rpc(fn, args);
  return { db, user: { profiles }, uid: user ? user.id : null, rpc };
}
// logging in or out changes who writes, so the backend is rebuilt
document.addEventListener('gwai:auth', () => { ready = null; });

// true when the shared database is available (inside the Claude artifact); on plain hosting the leaderboard is hidden
export const onlineReady = () => init().then(Boolean);

// ---------- leaderboard: board/<uid> holds one player's recent daily scores ----------
let writing = Promise.resolve();
export function submitDaily({ game, mode, day, score }) {
  writing = writing.then(async () => {
    const on = await init(); if (!on || !on.uid) return;
    const ref = on.db.doc(`board/${on.uid}`);
    const snap = await ref.get();
    const cur = snap.exists ? structuredClone(snap.data()) : { scores: {}, total: 0, games: 0 };
    const k = `${game}:${mode}:${day}`;
    if (cur.scores[k] != null) return;
    cur.scores[k] = score;
    cur.total = (cur.total || 0) + score;
    cur.games = (cur.games || 0) + 1;
    cur.by = cur.by || {}; const g = cur.by[game] || { t: 0, n: 0, best: 0 }; cur.by[game] = { t: g.t + score, n: g.n + 1, best: Math.max(g.best, score) };
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
  if (!on) { body.append(h('p', { class: 'muted' }, tr('Рейтинг сейчас недоступен.'))); return; }
  if (!on.uid) body.append(h('p', { class: 'muted' }, tr('Войдите в аккаунт, чтобы ваши ежедневки попадали в рейтинг.')));
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

  // personal card: place among everyone, total, games played, average and the split by game
  const ranked = rows.filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  const mine = on.uid && ranked.find((r) => r.id === on.uid);
  if (mine) {
    const place = ranked.indexOf(mine) + 1;
    const stat = (v, l) => h('div', { class: 'stat-tile' }, h('b', {}, String(v)), h('span', {}, l));
    const by = Object.entries(mine.by || {}).sort((a, b) => b[1].t - a[1].t);
    body.append(h('h4', {}, tr('Моя статистика')),
      h('div', { class: 'stat-tiles' }, stat(place + ' / ' + ranked.length, tr('место в рейтинге')), stat(mine.total, tr('очков всего')), stat(mine.games || 0, tr('сыграно игр')), stat(Math.round(mine.total / Math.max(1, mine.games || 1)), tr('среднее за игру'))),
      by.length ? h('ul', { class: 'pages' }, by.map(([g, v]) => h('li', {}, h('span', {}, (GAMES[g] ? GAMES[g].short : g) + ' · ' + tr('{0} игр', [v.n]) + ' · ' + tr('рекорд {0}', [v.best])), h('b', {}, String(v.t))))) : null);
  }
  body.append(h('h4', {}, tr('Сегодня · {0} · все режимы', [GAMES[game].short])), table(todayRows, 'score'),
    h('h4', {}, tr('Общий рейтинг · все игры')), table(allRows, 'total', (r) => tr('{0} игр · ср. {1}', [r.games || 0, Math.round(r.total / Math.max(1, r.games || 1))])));
}

// the player's own place and totals (for the profile window); null when logged out or the board is unavailable
export async function mySummary() {
  const on = await init(); if (!on || !on.uid) return null;
  try {
    const rows = (await on.db.collection('board').limit(500).get()).docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
    const mine = rows.find((r) => r.id === on.uid);
    return mine ? { ...mine, place: rows.indexOf(mine) + 1, of: rows.length } : { total: 0, games: 0, by: {}, place: 0, of: rows.length };
  } catch { return null; }
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
    if (!on || !on.uid) return;
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
