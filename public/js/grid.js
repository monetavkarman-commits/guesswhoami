// "Сетка" — 3x3 grid. Each row and column is a criterion; fill each cell with a player who fits both.
// Own twist: every correct answer scores "rarity" points: the fewer events a player has among all
// valid answers for that cell, the more points.
import { rng, shuffle, h, flag, store, share, modal, playerSearch, playerLink, roleText, toast } from './core.js';

const GUESSES = 9;
const SAME_KIND_FORBIDDEN = new Set(['country', 'age', 'events', 'status', 'pos']);

function buildCriteria(data) {
  const out = [];
  const P = data.players;
  const count = (test) => P.filter(test).length;
  const minTeam = data.game === 'cs' ? 8 : 5;

  // only teams with enough well-known players (2+ big events) become criteria, so grids stay fair
  const teamCounts = new Map();
  P.filter((p) => p.events >= 2).forEach((p) => p.teams.forEach((t) => teamCounts.set(t, (teamCounts.get(t) || 0) + 1)));
  for (const [t, n] of teamCounts) if (n >= minTeam) {
    out.push({ key: 't' + t, kind: 'team', label: data.teams[t], sub: 'играл за', test: (p) => p.teamSet.has(t) });
  }
  const countries = new Map();
  P.forEach((p) => p.cc && countries.set(p.cc, (countries.get(p.cc) || 0) + 1));
  for (const [cc, n] of countries) if (n >= 5) {
    const name = P.find((p) => p.cc === cc).country;
    out.push({ key: 'c' + cc, kind: 'country', label: name, sub: 'страна', cc, test: (p) => p.cc === cc });
  }
  if (data.game === 'cs') {
    for (const r of ['awp', 'igl', 'entry', 'lurker', 'support']) {
      const test = (p) => p.roles.includes(r);
      if (count(test) >= 15) out.push({ key: 'r' + r, kind: 'role', label: data.cfg.roleLabels[r], sub: 'роль', test });
    }
  } else {
    for (const pos of [1, 2, 3, 4, 5]) out.push({ key: 'p' + pos, kind: 'pos', label: data.cfg.posLabels[pos], sub: 'позиция', test: (p) => p.pos === pos });
  }
  out.push({ key: 'e3', kind: 'events', label: data.game === 'cs' ? '3+ мэйджора' : '3+ TI', sub: 'турниры', test: (p) => p.events >= 3 });
  out.push({ key: 'e1', kind: 'events', label: data.game === 'cs' ? 'Ровно 1 мэйджор' : 'Без TI или 1 TI', sub: 'турниры', test: (p) => p.events <= 1 });
  out.push({ key: 'a95', kind: 'age', label: 'Родился до 1995', sub: 'возраст', test: (p) => p.byear && p.byear < 1995 });
  out.push({ key: 'a00', kind: 'age', label: 'Родился в 2000+', sub: 'возраст', test: (p) => p.byear && p.byear >= 2000 });
  out.push({ key: 'sr', kind: 'status', label: 'Завершил карьеру', sub: 'статус', test: (p) => p.status === 'retired' });
  return out;
}

export function generateGrid(data, seed) {
  const r = rng(seed);
  const all = buildCriteria(data);
  all.forEach((c) => { c.set = new Set(data.players.filter(c.test).map((p) => p.idx)); });
  const inter = (a, b) => [...a.set].filter((i) => b.set.has(i));
  const clash = (a, b) => a.kind === b.kind && (SAME_KIND_FORBIDDEN.has(a.kind) || a.key === b.key);
  const teams = all.filter((c) => c.kind === 'team');
  const others = all.filter((c) => c.kind !== 'team');
  // non-team criteria of one kind may appear only once per grid (e.g. one age condition)
  const kindsOk = (list) => { const k = list.filter((c) => c.kind !== 'team').map((c) => c.kind); return new Set(k).size === k.length; };

  for (let attempt = 0; attempt < 3000; attempt++) {
    // rows: mostly teams, sometimes one other criterion
    const rows = r() < 0.35 ? shuffle(r, teams).slice(0, 2).concat(shuffle(r, others).slice(0, 1)) : shuffle(r, teams).slice(0, 3);
    if (!kindsOk(rows)) continue;
    const cand = all.filter((c) => !rows.includes(c) && rows.every((row) => !clash(row, c) && inter(row, c).length >= 2));
    const cols = [];
    for (const c of shuffle(r, cand)) {
      if (cols.length === 3) break;
      if (c.kind !== 'team' && rows.concat(cols).filter((x) => x.kind !== 'team').length >= 2) continue; // keep teams dominant
      if (kindsOk(rows.concat(cols, [c]))) cols.push(c);
    }
    if (cols.length < 3) continue;
    const order = shuffle(r, cols);
    const swap = r() < 0.5;
    const R = swap ? order : rows; const C = swap ? rows : order;
    const answers = [];
    for (const a of R) for (const b of C) answers.push(inter(a, b));
    return { rows: R, cols: C, answers };
  }
  throw new Error('Не удалось собрать сетку');
}

function rarity(data, cellAnswers, idx) {
  const evs = cellAnswers.map((i) => data.players[i].events);
  const mine = data.players[idx].events;
  const more = evs.filter((e) => e > mine).length;
  return Math.round(10 + 90 * (more / Math.max(1, evs.length - 1)));
}

export function mount(root, data, { seed, daily, label }) {
  const grid = generateGrid(data, seed);
  const saveKey = daily ? `grid:${seed}` : null;
  const state = (saveKey && store.get(saveKey)) || { cells: Array(9).fill(null), left: GUESSES, wrong: [], done: false };

  root.innerHTML = '';
  const status = h('div', { class: 'status-line' });
  const board = h('div', { class: 'grid-board' });
  const footer = h('div', { class: 'mode-footer' });
  root.append(h('p', { class: 'mode-intro' }, 'Впишите в каждую клетку игрока, который подходит под условие строки и столбца. ',
    'У вас 9 попыток, каждый игрок только один раз. Чем менее «очевидный» игрок, тем больше очков уникальности.'), status, board, footer);

  const head = (c) => h('div', { class: 'grid-head' }, c.cc ? flag(c.cc) : null, h('small', {}, c.sub), h('span', {}, c.label));

  const save = () => saveKey && store.set(saveKey, state);
  const score = () => state.cells.reduce((s, c) => s + (c ? c.pts : 0), 0);

  function render() {
    board.innerHTML = '';
    board.append(h('div', { class: 'grid-corner' }, label));
    grid.cols.forEach((c) => board.append(head(c)));
    grid.rows.forEach((row, ri) => {
      board.append(head(row));
      grid.cols.forEach((col, ci) => {
        const k = ri * 3 + ci; const cell = state.cells[k];
        if (cell) {
          const p = data.players[cell.idx];
          board.append(h('div', { class: 'grid-cell filled' }, flag(p.cc), h('b', {}, p.id), h('small', {}, `+${cell.pts}`)));
        } else if (state.done) {
          board.append(h('button', { class: 'grid-cell revealed', onclick: () => showAnswers(k) }, h('small', {}, `${grid.answers[k].length} вариантов`), 'показать'));
        } else {
          board.append(h('button', { class: 'grid-cell', onclick: () => ask(k, row, col) }, '+'));
        }
      });
    });
    const correct = state.cells.filter(Boolean).length;
    status.innerHTML = '';
    status.append(h('span', {}, `Попытки: `, h('b', {}, String(state.left))), h('span', {}, `Угадано: `, h('b', {}, `${correct}/9`)),
      h('span', {}, `Уникальность: `, h('b', {}, String(score()))));
    footer.innerHTML = '';
    if (state.done) {
      footer.append(h('div', { class: 'result' }, h('h3', {}, correct === 9 ? 'Идеальная сетка!' : `Готово: ${correct}/9`),
        h('p', {}, `Очки уникальности: ${score()} из 900. Нажмите на пустую клетку, чтобы увидеть ответы.`),
        h('button', { class: 'btn', onclick: () => share(shareText()) }, 'Поделиться')));
    } else {
      footer.append(h('button', { class: 'btn ghost', onclick: giveUp }, 'Сдаться'));
    }
  }

  function shareText() {
    const rows = [0, 1, 2].map((r) => [0, 1, 2].map((c) => (state.cells[r * 3 + c] ? '🟩' : '⬛')).join('')).join('\n');
    return `GuessWhoAmI · ${data.cfg.short} · Сетка ${label}\n${rows}\nУникальность: ${score()}`;
  }

  function ask(k, row, col) {
    const used = new Set(state.cells.filter(Boolean).map((c) => c.idx));
    const box = playerSearch(data, {
      exclude: (p) => used.has(p.idx),
      onPick: (p) => {
        close();
        state.left--;
        if (row.test(p) && col.test(p)) state.cells[k] = { idx: p.idx, pts: rarity(data, grid.answers[k], p.idx) };
        else state.wrong.push(p.idx), flash(`${p.id} не подходит`);
        if (state.left <= 0 || state.cells.every(Boolean)) state.done = true;
        save(); render();
      },
    });
    const close = modal(`${row.sub}: ${row.label} × ${col.sub}: ${col.label}`, h('div', {}, box.el));
    box.focus();
  }

  function flash(msg) { status.classList.add('shake'); setTimeout(() => status.classList.remove('shake'), 500); toast(msg); }

  function giveUp() { state.done = true; save(); render(); }

  function showAnswers(k) {
    const list = grid.answers[k].map((i) => data.players[i]).sort((a, b) => b.events - a.events);
    modal('Возможные ответы', h('ul', { class: 'answer-list' }, list.map((p) => h('li', {}, flag(p.cc), playerLink(p), h('span', { class: 'muted' }, `${roleText(data, p)} · ${p.events} ${data.eventLabel.toLowerCase()}`)))));
  }

  render();
}
