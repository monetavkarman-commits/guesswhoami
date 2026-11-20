// "Сетка" — 3x3 grid. Each row and column is a criterion; fill each cell with a player who fits both.
// Own twist: every correct answer scores "rarity" points: the fewer events a player has among all
// valid answers for that cell, the more points.
import { tr } from './i18n.js';
import { countryName, rng, shuffle, h, flag, store, share, modal, playerSearch, playerLink, roleText, toast } from './core.js';
import { recordResult, resultCard } from './stats.js';

const GUESSES = 9;
const SAME_KIND_FORBIDDEN = new Set(['country', 'age', 'events', 'status', 'pos']);

function buildCriteria(data, era) {
  // with an era filter, "played for" only counts stints inside that era
  const tset = (p) => (era ? p.eraSets[era] || new Set() : p.teamSet);
  const out = [];
  const P = data.players;
  const count = (test) => P.filter(test).length;
  const minTeam = era ? (data.game === 'cs' ? 5 : 3) : (data.game === 'cs' ? 8 : 5);

  // only teams with enough well-known players (2+ big events) become criteria, so grids stay fair
  const teamCounts = new Map();
  P.filter((p) => p.events >= 2).forEach((p) => tset(p).forEach((t) => teamCounts.set(t, (teamCounts.get(t) || 0) + 1)));
  for (const [t, n] of teamCounts) if (n >= minTeam) {
    out.push({ key: 't' + t, kind: 'team', label: data.teams[t], sub: era ? tr('играл за в эту эру') : tr('играл за'), test: (p) => tset(p).has(t) });
  }
  const countries = new Map();
  P.forEach((p) => p.cc && countries.set(p.cc, (countries.get(p.cc) || 0) + 1));
  for (const [cc, n] of countries) if (n >= 5) {
    const name = countryName(P.find((p) => p.cc === cc));
    out.push({ key: 'c' + cc, kind: 'country', label: name, sub: tr('страна'), cc, test: (p) => p.cc === cc });
  }
  if (data.game === 'cs') {
    for (const r of ['awp', 'igl', 'entry', 'lurker', 'support']) {
      const test = (p) => p.roles.includes(r);
      if (count(test) >= 15) out.push({ key: 'r' + r, kind: 'role', label: data.cfg.roleLabels[r], sub: tr('роль'), test });
    }
  } else {
    for (const pos of [1, 2, 3, 4, 5]) out.push({ key: 'p' + pos, kind: 'pos', label: data.cfg.posLabels[pos], sub: tr('позиция'), test: (p) => p.pos === pos });
  }
  out.push({ key: 'e3', kind: 'events', label: data.game === 'cs' ? tr('3+ мэйджора') : '3+ TI', sub: tr('турниры'), test: (p) => p.events >= 3 });
  out.push({ key: 'e1', kind: 'events', label: data.game === 'cs' ? tr('Ровно 1 мэйджор') : tr('Без TI или 1 TI'), sub: tr('турниры'), test: (p) => p.events <= 1 });
  out.push({ key: 'a95', kind: 'age', label: tr('Родился до 1995'), sub: tr('возраст'), test: (p) => p.byear && p.byear < 1995 });
  out.push({ key: 'a00', kind: 'age', label: tr('Родился в 2000+'), sub: tr('возраст'), test: (p) => p.byear && p.byear >= 2000 });
  out.push({ key: 'sr', kind: 'status', label: tr('Завершил карьеру'), sub: tr('статус'), test: (p) => p.status === 'retired' });
  return out;
}

export function generateGrid(data, seed, filter = () => true, era = null) {
  const r = rng(seed);
  const all = buildCriteria(data, era);
  // cells need 2+ answers among the players allowed by the difficulty filter
  all.forEach((c) => { c.set = new Set(data.players.filter((p) => filter(p) && c.test(p)).map((p) => p.idx)); });
  const inter = (a, b) => [...a.set].filter((i) => b.set.has(i));
  const clash = (a, b) => a.kind === b.kind && (SAME_KIND_FORBIDDEN.has(a.kind) || a.key === b.key);
  const teams = all.filter((c) => c.kind === 'team');
  const others = all.filter((c) => c.kind !== 'team');
  // non-team criteria of one kind may appear only once per grid (e.g. one age condition)
  const kindsOk = (list) => { const k = list.filter((c) => c.kind !== 'team').map((c) => c.kind); return new Set(k).size === k.length; };

  for (let attempt = 0; attempt < 4000; attempt++) {
    // first try team-heavy grids; if the pool is small (e.g. a narrow era) allow more non-team criteria
    const relaxed = attempt >= 2000;
    const maxOther = relaxed ? 4 : 2;
    const nRowTeams = relaxed ? 1 + Math.floor(r() * 2) : r() < 0.35 ? 2 : 3;
    const rows = shuffle(r, teams).slice(0, nRowTeams).concat(shuffle(r, others).slice(0, 3 - nRowTeams));
    if (rows.length < 3 || !kindsOk(rows)) continue;
    const cand = all.filter((c) => !rows.includes(c) && rows.every((row) => !clash(row, c) && inter(row, c).length >= 2));
    const cols = [];
    for (const c of shuffle(r, cand)) {
      if (cols.length === 3) break;
      if (c.kind !== 'team' && rows.concat(cols).filter((x) => x.kind !== 'team').length >= maxOther) continue; // keep teams dominant
      if (relaxed ? kindsOk(cols.concat([c])) : kindsOk(rows.concat(cols, [c]))) cols.push(c);
    }
    if (cols.length < 3) continue;
    const order = shuffle(r, cols);
    const swap = r() < 0.5;
    const R = swap ? order : rows; const C = swap ? rows : order;
    const answers = [];
    for (const a of R) for (const b of C) answers.push(inter(a, b));
    return { rows: R, cols: C, answers };
  }
  throw new Error(tr('Не удалось собрать сетку'));
}

function rarity(data, cellAnswers, idx) {
  const evs = cellAnswers.map((i) => data.players[i].events);
  const mine = data.players[idx].events;
  const more = evs.filter((e) => e > mine).length;
  return Math.round(10 + 90 * (more / Math.max(1, evs.length - 1)));
}

export function mount(root, data, { seed, daily, label, day, filter, era, onFinish }) {
  const grid = generateGrid(data, seed, filter, era);
  const saveKey = daily ? `grid:${seed}` : null;
  const state = (saveKey && store.get(saveKey)) || { cells: Array(9).fill(null), left: GUESSES, wrong: [], hints: {}, done: false };
  state.hints = state.hints || {};

  root.innerHTML = '';
  const status = h('div', { class: 'status-line' });
  const board = h('div', { class: 'grid-board' });
  const footer = h('div', { class: 'mode-footer' });
  root.append(h('p', { class: 'mode-intro' }, tr('Впишите в каждую клетку игрока, который подходит под условие строки и столбца. '),
    tr('У вас 9 попыток, каждый игрок только один раз. Очки: до 100 за клетку (чем менее очевидный игрок, тем больше), +100 за сетку без ошибок. Подсказка в клетке стоит одну попытку.')), status, board, footer);

  const head = (c) => h('div', { class: 'grid-head' }, c.cc ? flag(c.cc) : null, h('small', {}, c.sub), h('span', {}, c.label));

  const save = () => saveKey && store.set(saveKey, state);
  const correctN = () => state.cells.filter(Boolean).length;
  const bonus = () => (correctN() === 9 && !state.wrong.length ? 100 : 0);
  const score = () => state.cells.reduce((s, c) => s + (c ? c.pts : 0), 0) + bonus();
  const finish = () => {
    state.done = true;
    if (daily) recordResult(data.game, 'grid', day, { won: correctN() >= 5, score: score(), detail: { correct: correctN() } });
    onFinish?.({ won: correctN() >= 5, score: score() });
  };

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
          board.append(h('button', { class: 'grid-cell revealed', onclick: () => showAnswers(k) }, h('small', {}, tr('{0} вариантов', [grid.answers[k].length])), tr('показать')));
        } else {
          board.append(h('button', { class: 'grid-cell', onclick: () => ask(k, row, col) }, '+'));
        }
      });
    });
    const correct = state.cells.filter(Boolean).length;
    status.innerHTML = '';
    status.append(h('span', {}, tr('Попытки: '), h('b', {}, String(state.left))), h('span', {}, tr('Угадано: '), h('b', {}, `${correct}/9`)),
      h('span', {}, tr('Очки: '), h('b', {}, String(score()))));
    footer.innerHTML = '';
    if (state.done) {
      footer.append(resultCard({
        title: correct === 9 ? (bonus() ? tr('Идеальная сетка!') : tr('Сетка собрана!')) : tr('Готово: {0}/9', [correct]),
        score: score(), daily, game: data.game, mode: 'grid',
        lines: [bonus() ? tr('Без единой ошибки: +100 очков.') : null, correct < 9 ? tr('Нажмите на пустую клетку, чтобы увидеть ответы.') : null],
        onShare: () => share(shareText()),
      }));
    } else {
      footer.append(h('button', { class: 'btn ghost', onclick: giveUp }, tr('Сдаться')));
    }
  }

  function shareText() {
    const rows = [0, 1, 2].map((r) => [0, 1, 2].map((c) => (state.cells[r * 3 + c] ? '🟩' : '⬛')).join('')).join('\n');
    return tr('GuessWhoAmI · {0} · Сетка {1}\n{2}\nОчки: {3} · ошибок: {4}', [data.cfg.short, label, rows, score(), state.wrong.length]);
  }

  function ask(k, row, col) {
    const used = new Set(state.cells.filter(Boolean).map((c) => c.idx));
    const box = playerSearch(data, {
      exclude: (p) => used.has(p.idx),
      onPick: (p) => {
        close();
        state.left--;
        if (row.test(p) && col.test(p)) state.cells[k] = { idx: p.idx, pts: rarity(data, grid.answers[k], p.idx) };
        else state.wrong.push(p.idx), flash(tr('{0} не подходит', [p.id]));
        if (state.left <= 0 || state.cells.every(Boolean)) finish();
        save(); render();
      },
    });
    const hintBox = h('div', { class: 'hint-box' });
    const showHint = () => {
      const p = data.players[grid.answers[k][state.hints[k]]];
      hintBox.innerHTML = '';
      hintBox.append(h('div', { class: 'clue' }, tr('💡 Один из ответов: ник на «'), h('b', {}, p.id[0].toUpperCase()), tr('», {0} симв., страна ', [p.id.length]), flag(p.cc), ' ', countryName(p)));
    };
    if (state.hints[k] != null) showHint();
    else if (state.left > 1) hintBox.append(h('button', { class: 'btn ghost small', onclick: () => {
      const unused = grid.answers[k].filter((i) => !used.has(i));
      if (!unused.length) return;
      state.hints[k] = grid.answers[k].indexOf(unused[unused.length - 1]); state.left--; save(); render(); showHint();
    } }, tr('Подсказка (−1 попытка)')));
    const close = modal(`${row.sub}: ${row.label} × ${col.sub}: ${col.label}`, h('div', { class: 'stack' }, box.el, hintBox));
    box.focus();
  }

  function flash(msg) { status.classList.add('shake'); setTimeout(() => status.classList.remove('shake'), 500); toast(msg); }

  function giveUp() { finish(); save(); render(); }

  function showAnswers(k) {
    const list = grid.answers[k].map((i) => data.players[i]).sort((a, b) => b.events - a.events);
    modal(tr('Возможные ответы'), h('ul', { class: 'answer-list' }, list.map((p) => h('li', {}, flag(p.cc), playerLink(p), h('span', { class: 'muted' }, `${roleText(data, p)} · ${p.events} ${tr(data.eventLabel).toLowerCase()}`)))));
  }

  render();
}
