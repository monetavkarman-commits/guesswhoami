// "Цепочка" — our own mode. Connect two players through teammates: each next player must have
// played on the same team at the same time as the previous one. Fewer links = better.
import { rng, shuffle, h, flag, store, share, playerSearch, playerLink, toast } from './core.js';
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

function pathTo(prev, from, to) {
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0]));
  return path;
}

export function generateChain(data, seed, filter = () => true) {
  const r = rng(seed);
  const minEvents = data.game === 'cs' ? 3 : 2;
  let pool = data.players.filter((p) => p.events >= minEvents && filter(p)).map((p) => p.idx);
  if (pool.length < 20) pool = data.players.filter(filter).map((p) => p.idx);
  for (const s of shuffle(r, pool)) {
    const { dist } = bfs(data, s);
    // 2 intermediate players (distance 3) is the sweet spot; fall back to 4
    for (const want of [3, 4]) {
      const ends = pool.filter((e) => dist.get(e) === want);
      if (ends.length) return { start: s, end: shuffle(r, ends)[0], par: want };
    }
  }
  throw new Error('Не удалось собрать цепочку');
}

export function mount(root, data, { seed, daily, label, day, filter }) {
  const game = generateChain(data, seed, filter);
  const S = data.players[game.start]; const E = data.players[game.end];
  const saveKey = daily ? `chain:${seed}` : null;
  const state = (saveKey && store.get(saveKey)) || { path: [game.start], errors: 0, hints: 0, done: false, gaveUp: false };

  root.innerHTML = '';
  root.append(h('p', { class: 'mode-intro' }, 'Соедините двух игроков через тиммейтов. Каждый следующий игрок должен был играть в одной команде ',
    'одновременно с предыдущим. Цепочка готова, когда последний игрок — тиммейт финального. ', h('b', {}, `Минимум звеньев: ${game.par - 1}.`)));
  const ends = h('div', { class: 'chain-ends' });
  const chainEl = h('div', { class: 'chain' });
  const searchWrap = h('div', { class: 'chain-search' });
  const tools = h('div', { class: 'chain-tools' });
  const footer = h('div', { class: 'mode-footer' });
  root.append(ends, chainEl, searchWrap, tools, footer);

  ends.append(card(S, 'Старт'), h('div', { class: 'chain-arrow' }, '⟶'), card(E, 'Финиш'));
  function card(p, cap) {
    return h('div', { class: 'chain-card' }, h('small', {}, cap), h('div', { class: 'big' }, flag(p.cc), ' ', p.id), h('small', { class: 'muted' }, p.team || 'без команды'));
  }

  const save = () => saveKey && store.set(saveKey, state);
  const finish = () => {
    state.done = true;
    if (daily) recordResult(data.game, 'chain', day, { won: !state.gaveUp, score: chainScore(state, game.par), detail: { links: state.path.length - 2 } });
  };
  const last = () => data.players[state.path[state.path.length - 1]];

  const box = playerSearch(data, {
    placeholder: 'Тиммейт последнего игрока…',
    exclude: (p) => state.path.includes(p.idx) || p.idx === game.end,
    onPick: (p) => {
      const l = last();
      if (!l.mateMap.has(p.idx)) { state.errors++; save(); render(); toast(`${p.id} не играл вместе с ${l.id}`); return; }
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
        const t = data.players[state.path[i - 1]].mateMap.get(idx);
        chainEl.append(h('div', { class: 'link' }, h('span', {}, data.teams[t])));
      }
      chainEl.append(h('div', { class: 'node' + (i === 0 || (state.done && i === state.path.length - 1) ? ' end' : '') }, flag(p.cc), ' ', h('b', {}, p.id)));
    });
    if (!state.done) chainEl.append(h('div', { class: 'link pending' }, h('span', {}, '?')), h('div', { class: 'node end ghost' }, flag(E.cc), ' ', h('b', {}, E.id)));

    tools.innerHTML = '';
    searchWrap.style.display = state.done ? 'none' : '';
    if (!state.done) {
      tools.append(
        h('button', { class: 'btn ghost small', disabled: state.path.length < 2, onclick: () => { state.path.pop(); save(); render(); } }, 'Отменить шаг'),
        h('button', { class: 'btn ghost small', onclick: hint }, 'Подсказка −150'),
        h('button', { class: 'btn ghost small', onclick: () => { state.gaveUp = true; finish(); save(); render(); } }, 'Сдаться'),
        h('span', { class: 'muted' }, `Ошибок: ${state.errors} · Подсказок: ${state.hints}`));
      setTimeout(() => box.focus(), 0);
    }

    footer.innerHTML = '';
    if (state.done) {
      const links = state.path.length - 2;
      const { prev } = bfs(data, game.start);
      const best = pathTo(prev, game.start, game.end);
      footer.append(resultCard({
        title: state.gaveUp ? 'Цепочка не собрана' : links <= game.par - 1 ? 'Идеальная цепочка!' : `Готово за ${links} звен.`,
        score: chainScore(state, game.par), daily, game: data.game, mode: 'chain',
        lines: [`Ошибок: ${state.errors}, подсказок: ${state.hints}.`,
          h('span', { class: 'muted' }, 'Один из кратчайших путей: ', best.flatMap((i, k) => [k ? ' → ' : '', playerLink(data.players[i])]))],
        onShare: state.gaveUp ? null : () => share(shareText(links)),
      }));
    }
  }

  function hint() {
    const { prev, dist } = bfs(data, last().idx);
    if (!dist.has(game.end)) { toast('От этого игрока до финиша не добраться — отмените шаг'); return; }
    const path = pathTo(prev, last().idx, game.end);
    const nextP = data.players[path[1]];
    const team = data.teams[last().mateMap.get(nextP.idx)];
    state.hints++; save(); render();
    toast(`Следующий шаг: тиммейт по ${team}, ${nextP.country} (−150 очков)`);
  }

  function shareText(links) {
    return `GuessWhoAmI · ${data.cfg.short} · Цепочка ${label}\n${S.id} → ${'🔗'.repeat(links)} → ${E.id}\nЗвеньев: ${links} (минимум ${game.par - 1}) · ошибок: ${state.errors} · подсказок: ${state.hints}\nОчки: ${chainScore(state, game.par)}`;
  }

  render();
}
