// "Цепочка" — our own mode. Connect two players through teammates: each next player must have
// played on the same team at the same time as the previous one. Fewer links = better.
import { tr } from './i18n.js';
import { countryName, rng, shuffle, h, flag, store, share, playerSearch, playerLink, toast } from './core.js';
import { recordResult, resultCard } from './stats.js';

// 1000 for a shortest chain, −200 per extra link, −50 per wrong teammate, −150 per hint, at least 100
export const chainScore = (st, par) => (st.gaveUp ? 0 : Math.max(100, 1000 - 200 * Math.max(0, st.path.length - 1 - par) - 50 * st.errors - 150 * st.hints));

function bfs(data, from) {
  const dist = new Map([[from, 0]]); const prev = new Map(); const q = [from];
  while (q.length) {
    const a = q.shift();
    for (const [b] of data.players[a].mates) if (!dist.has(b)) { dist.set(b, dist.get(a) + 1); prev.set(b, a); q.push(b); }
  }
  return { dist, prev };
}

// "Fenerbahçe, 2021–2022" for the stint two players shared
function years(m) {
  if (!m || !m[2]) return '';
  if (m[3] === 0) return tr('с {0} по сей день', [m[2]]);
  return m[2] === m[3] ? String(m[2]) : `${m[2]}–${m[3]}`;
}
function linkText(data, a, b) {
  const m = data.players[a].mateInfo.get(b);
  if (!m) return '';
  const y = years(m);
  return data.teams[m[1]] + (y ? ', ' + y : '');
}

function pathTo(prev, from, to) {
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0]));
  return path;
}

export function generateChain(data, seed, filter = () => true) {
  const r = rng(seed);
  const minEvents = data.cfg.chainMin;
  let pool = data.players.filter((p) => (data.cfg.topMin == null ? p.top : p.events >= minEvents) && filter(p)).map((p) => p.idx);
  if (pool.length < 20) pool = data.players.filter(filter).map((p) => p.idx);
  for (const s of shuffle(r, pool)) {
    const { dist } = bfs(data, s);
    // 2 intermediate players (distance 3) is the sweet spot; fall back to 4
    for (const want of [3, 4]) {
      const ends = pool.filter((e) => dist.get(e) === want);
      if (ends.length) return { start: s, end: shuffle(r, ends)[0], par: want };
    }
  }
  throw new Error(tr('Не удалось собрать цепочку'));
}

export function mount(root, data, { seed, daily, label, day, filter, onFinish }) {
  const game = generateChain(data, seed, filter);
  const S = data.players[game.start]; const E = data.players[game.end];
  const saveKey = daily ? `chain:${seed}` : null;
  const state = (saveKey && store.get(saveKey)) || { path: [game.start], errors: 0, hints: 0, done: false, gaveUp: false };

  root.innerHTML = '';
  root.append(h('p', { class: 'mode-intro' }, tr('Соедините двух игроков через тиммейтов. Каждый следующий игрок должен был играть в одной команде '),
    tr('одновременно с предыдущим. Цепочка готова, когда последний игрок — тиммейт финального. '), h('b', {}, tr('Минимум звеньев: {0}.', [game.par - 1]))));
  const ends = h('div', { class: 'chain-ends' });
  const chainEl = h('div', { class: 'chain' });
  const searchWrap = h('div', { class: 'chain-search' });
  const tools = h('div', { class: 'chain-tools' });
  const footer = h('div', { class: 'mode-footer' });
  root.append(ends, chainEl, searchWrap, tools, footer);

  ends.append(card(S, tr('Старт')), h('div', { class: 'chain-arrow' }, '⟶'), card(E, tr('Финиш')));
  function card(p, cap) {
    return h('div', { class: 'chain-card' }, h('small', {}, cap), h('div', { class: 'big' }, flag(p.cc), ' ', p.id), h('small', { class: 'muted' }, p.team || tr('без команды')));
  }

  const save = () => saveKey && store.set(saveKey, state);
  const finish = () => {
    state.done = true;
    if (daily) recordResult(data.game, 'chain', day, { won: !state.gaveUp, score: chainScore(state, game.par), detail: { links: state.path.length - 2, par: game.par - 1 } });
    setTimeout(() => onFinish?.({ won: !state.gaveUp, score: chainScore(state, game.par) }), 0);
  };
  const last = () => data.players[state.path[state.path.length - 1]];

  const box = playerSearch(data, {
    placeholder: tr('Тиммейт последнего игрока…'),
    exclude: (p) => state.path.includes(p.idx) || p.idx === game.end,
    onPick: (p) => {
      const l = last();
      if (!l.mateMap.has(p.idx)) { state.errors++; save(); render(); toast(tr('{0} не играл вместе с {1}', [p.id, l.id])); return; }
      state.path.push(p.idx);
      if (p.mateMap.has(game.end)) { state.path.push(game.end); finish(); }
      save(); render();
    },
  });
  searchWrap.append(box.el);

  function render() {
    chainEl.innerHTML = '';
    state.path.forEach((idx, i) => {
      const p = data.players[idx];
      if (i > 0) {
        chainEl.append(h('div', { class: 'link' }, h('span', {}, linkText(data, state.path[i - 1], idx))));
      }
      chainEl.append(h('div', { class: 'node' + (i === 0 || (state.done && i === state.path.length - 1) ? ' end' : '') }, flag(p.cc), ' ', h('b', {}, p.id)));
    });
    if (!state.done) chainEl.append(h('div', { class: 'link pending' }, h('span', {}, '?')), h('div', { class: 'node end ghost' }, flag(E.cc), ' ', h('b', {}, E.id)));

    tools.innerHTML = '';
    searchWrap.style.display = state.done ? 'none' : '';
    if (!state.done) {
      tools.append(
        h('button', { class: 'btn ghost small', disabled: state.path.length < 2, onclick: () => { state.path.pop(); save(); render(); } }, tr('Отменить шаг')),
        h('button', { class: 'btn ghost small', onclick: hint }, tr('Подсказка −150')),
        h('button', { class: 'btn ghost small', onclick: () => { state.gaveUp = true; finish(); save(); render(); } }, tr('Сдаться')),
        h('span', { class: 'muted' }, tr('Ошибок: {0} · Подсказок: {1}', [state.errors, state.hints])));
      setTimeout(() => box.focus(), 0);
    }

    footer.innerHTML = '';
    if (state.done) {
      const links = state.path.length - 2;
      const { prev } = bfs(data, game.start);
      const best = pathTo(prev, game.start, game.end);
      footer.append(resultCard({
        title: state.gaveUp ? tr('Цепочка не собрана') : links <= game.par - 1 ? tr('Идеальная цепочка!') : tr('Готово за {0} звен.', [links]),
        score: chainScore(state, game.par), daily, game: data.game, mode: 'chain',
        lines: [tr('Ошибок: {0}, подсказок: {1}.', [state.errors, state.hints]),
          h('div', { class: 'best-path' }, h('span', { class: 'muted' }, tr('Один из кратчайших путей:')),
            h('ol', {}, best.slice(1).map((b, k) => {
              const a = best[k];
              return h('li', {}, playerLink(data.players[a]), ' → ', playerLink(data.players[b]),
                h('span', { class: 'muted' }, ' · ', tr('вместе в {0}', [linkText(data, a, b)])));
            })))],
        onShare: state.gaveUp ? null : () => share(shareText(links)),
      }));
    }
  }

  function hint() {
    const { prev, dist } = bfs(data, last().idx);
    if (!dist.has(game.end)) { toast(tr('От этого игрока до финиша не добраться — отмените шаг')); return; }
    const path = pathTo(prev, last().idx, game.end);
    const nextP = data.players[path[1]];
    const team = linkText(data, last().idx, nextP.idx);
    state.hints++; save(); render();
    toast(tr('Следующий шаг: тиммейт по {0}, {1} (−150 очков)', [team, countryName(nextP)]));
  }

  function shareText(links) {
    return tr('GuessWhoAmI · {0} · Цепочка {1}\n{2} → {3} → {4}\nЗвеньев: {5} (минимум {6}) · ошибок: {7} · подсказок: {8}\nОчки: {9}', [data.cfg.short, label, S.id, '🔗'.repeat(links), E.id, links, game.par - 1, state.errors, state.hints, chainScore(state, game.par)]);
  }

  render();
}
