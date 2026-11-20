// "Угадай состав": a team is shown, its best players are hidden behind flag and role; name them all with at most 5 mistakes.
import { tr } from './i18n.js';
import { countryName, rng, pick, h, flag, store, share, playerSearch, roleText, photo, logoAt, toast } from './core.js';
import { recordResult, resultCard } from './stats.js';

const MISTAKES = 5;
const SLOTS = 5;
export const lineupScore = (st, n) => (st.found.length ? Math.max(50, Math.round((1000 * st.found.length) / n) - 100 * st.wrong.length) : 0);

export function mount(root, data, opts) {
  const { seed, daily, label, day, onFinish } = opts;
  // who played for a team in a given year: rebuilt from the teammate overlaps (player, team, from, to; to 0 = still there)
  const pres = new Map(); // team -> year -> Set(player idx)
  const thisYear = new Date().getFullYear();
  data.players.forEach((p) => {
    for (const [j, t, from, to] of p.mates) {
      if (!pres.has(t)) pres.set(t, new Map());
      const ys = pres.get(t);
      for (let y = from; y <= (to || thisYear); y++) {
        if (!ys.has(y)) ys.set(y, new Set());
        // sanity: nobody under 14 in that year (youth stints and bad source dates)
        for (const i of [p.idx, j]) { const b = data.players[i].byear; if (!b || y - b >= 14) ys.get(y).add(i); }
      }
    }
  });
  const pairs = [];
  for (const [t, ys] of pres) for (const [y, set] of ys) if (set.size >= SLOTS) pairs.push([t, y]);
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const years = [...new Set(pairs.map((x) => x[1]))].sort((a, b) => b - a);
  const yearKey = `lineupYear:${data.game}`;
  let year = +store.get(yearKey, 0);
  if (!years.includes(year)) year = 0; // 0 = a random year
  const pickable = year ? pairs.filter((x) => x[1] === year) : pairs;
  const [team, yr] = pick(rng(seed + (year ? ':y' + year : '')), pickable);
  const rosterSet = pres.get(team).get(yr);
  const roster = [...rosterSet].map((i) => data.players[i]);
  const fame = (p) => p.fame ?? p.events ?? 0;
  const lineup = [...roster].sort((a, b) => fame(b) - fame(a)).slice(0, SLOTS);
  const n = lineup.length;
  const inLineup = new Set(lineup.map((p) => p.idx));
  const inRoster = rosterSet;
  const record = daily && !year; // a chosen year is practice: it does not count for the daily score

  const saveKey = daily ? `lineup:${seed}${year ? ':y' + year : ''}` : null;
  const state = (saveKey && store.get(saveKey)) || { found: [], wrong: [], done: false };
  const save = () => saveKey && store.set(saveKey, state);

  root.innerHTML = '';
  const yearSel = h('select', { class: 'select', 'aria-label': tr('Год состава'), onchange: (e) => { store.set(yearKey, e.target.value); mount(root, data, opts); } },
    h('option', { value: 0, selected: !year }, tr('Случайный год')), years.map((y) => h('option', { value: y, selected: y === year }, String(y))));
  const head = h('div', { class: 'lineup-team with-logo' }, logoAt(data, team, 'pic logo big'), h('b', {}, data.teams[team]), h('span', { class: 'chip near' }, String(yr)), h('span', { class: 'muted small' }, tr('Год состава:')), yearSel);
  const intro = h('p', { class: 'mode-intro' }, tr('Назовите {0} лучших игроков команды в {1} году (по данным базы). Допускается {2} ошибок.', [n, yr, MISTAKES]));
  const searchWrap = h('div', { class: 'who-search' });
  const slots = h('div', { class: 'lineup-slots' });
  const wrongBox = h('div', { class: 'team-guesses' });
  const footer = h('div', { class: 'mode-footer' });
  root.append(intro, head, searchWrap, slots, wrongBox, footer);

  const box = playerSearch(data, {
    placeholder: tr('Ник игрока…'),
    exclude: (p) => state.found.includes(p.idx) || state.wrong.includes(p.idx),
    onPick: (p) => {
      document.dispatchEvent(new CustomEvent('gwai:answer'));
      if (inLineup.has(p.idx)) state.found.push(p.idx);
      else if (inRoster.has(p.idx)) toast(tr('{0} играет в команде, но в этой подборке его нет', [p.id]));
      else state.wrong.push(p.idx);
      if (state.found.length === n || state.wrong.length >= MISTAKES) finish();
      save(); render();
    },
  });
  searchWrap.append(box.el);

  function finish() {
    state.done = true;
    if (record) recordResult(data.game, 'lineup', day, { won: state.found.length === n, score: lineupScore(state, n), detail: { found: state.found.length } });
    setTimeout(() => onFinish?.({ won: state.found.length === n, score: lineupScore(state, n) }), 0);
  }

  function render() {
    slots.innerHTML = '';
    lineup.forEach((p) => {
      const ok = state.found.includes(p.idx);
      const open = ok || state.done;
      slots.append(h('div', { class: 'lineup-slot ' + (ok ? 'hit' : state.done ? 'miss' : '') },
        open ? photo(p) : null, h('span', { class: 'slot-country' }, flag(p.cc), ' ', countryName(p)), h('b', {}, open ? p.id : '?'),
        h('small', { class: 'muted' }, roleText(data, p) || '')));
    });
    wrongBox.innerHTML = '';
    state.wrong.forEach((i) => wrongBox.append(h('span', { class: 'chip miss' }, data.players[i].id)));
    footer.innerHTML = '';
    searchWrap.style.display = state.done ? 'none' : '';
    if (state.done) {
      const all = state.found.length === n;
      footer.append(resultCard({
        title: all ? tr('Весь состав угадан!') : tr('Угадано {0} из {1}', [state.found.length, n]),
        score: lineupScore(state, n), daily: record, game: data.game, mode: 'lineup',
        lines: [tr('Ошибок: {0}', [state.wrong.length])],
        onShare: () => share(shareText()),
      }));
    } else {
      footer.append(h('span', { class: 'muted' }, tr('Угадано {0} из {1} · ошибок {2} из {3}', [state.found.length, n, state.wrong.length, MISTAKES])), ' ',
        h('button', { class: 'btn ghost small', onclick: () => { finish(); save(); render(); } }, tr('Сдаться')));
      setTimeout(() => box.focus(), 0);
    }
  }

  function shareText() {
    const row = '🟩'.repeat(state.found.length) + '⬜'.repeat(n - state.found.length) + ' ' + '🟥'.repeat(state.wrong.length);
    return tr('GuessWhoAmI · {0} · Состав {1} · {2}\n{3}\nОчки: {4}', [data.cfg.short, label, yr, row, lineupScore(state, n)]);
  }

  render();
}
