// "Угадай команду": a ladder of clues about a hidden team (countries of the roster, experience, a player, the stars, the logo).
// Every wrong guess (or a skip) opens the next clue; fewer clues means more points.
import { tr } from './i18n.js';
import { rng, pick, h, flag, store, share, fold, countryName, logoAt, photo, toast } from './core.js';
import { recordResult, resultCard } from './stats.js';

const MAX = 6;
export const teamScore = (st) => (st.won ? Math.max(100, 1000 - 150 * (st.used - 1)) : 0);

export function mount(root, data, { seed, daily, label, day, onFinish }) {
  const sport = !!data.cfg.sport;
  const minRoster = data.game === 'basket' ? 3 : 4;
  const rosters = new Map(); // team index -> current players
  for (const p of data.players) {
    if (!p.team) continue;
    const i = data.teams.indexOf(p.team);
    if (i < 0) continue;
    if (!rosters.has(i)) rosters.set(i, []);
    rosters.get(i).push(p);
  }
  const pool = [...rosters.keys()].filter((i) => rosters.get(i).length >= minRoster).sort((a, b) => a - b);
  const r = rng(seed);
  const target = pick(r, pool);
  const roster = rosters.get(target);
  const fame = (p) => p.fame ?? p.events ?? 0;
  const byFame = [...roster].sort((a, b) => fame(b) - fame(a));
  const odd = pick(r, byFame.slice(Math.floor(byFame.length / 2)).length ? byFame.slice(Math.floor(byFame.length / 2)) : byFame);

  const countries = (() => {
    const m = new Map();
    roster.forEach((p) => m.set(p.cc, [(m.get(p.cc) || [0])[0] + 1, p]));
    return [...m.entries()].sort((a, b) => b[1][0] - a[1][0]);
  })();
  const ages = roster.filter((p) => p.age != null).map((p) => p.age);
  const avgAge = ages.length ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length) : null;
  const evSum = roster.reduce((s, p) => s + (p.events || 0), 0);
  // the region most of the roster comes from (the first player alone made the Lakers a European team)
  const mainRegion = (list) => {
    const n = new Map(); list.forEach((p) => p.region && n.set(p.region, (n.get(p.region) || 0) + 1));
    const top = [...n].sort((a, b) => b[1] - a[1])[0]; return top ? data.regions[top[0]] || '' : '';
  };
  const region = mainRegion(roster);
  const regionOf = (i) => (rosters.has(i) ? mainRegion(rosters.get(i)) : '');

  const clues = [
    () => tr('Регион: {0}. В базе игроков этой команды: {1}.', [region || '—', roster.length]),
    () => h('span', {}, tr('Страны состава: '), countries.map(([cc, [n, p]]) => h('span', { class: 'cclue' }, flag(cc), ` ${n}  `))),
    () => (sport
      ? tr('Средний возраст состава: {0}. Самый «клубный» игрок сменил клубов: {1}.', [avgAge ?? '?', Math.max(...roster.map((p) => p.events || 0))])
      : tr('Средний возраст состава: {0}. Суммарно {1} участий в турнирах: {2}.', [avgAge ?? '?', evSum, tr(data.eventLabel)])),
    () => h('span', {}, tr('Один из игроков: '), photo(odd), ' ', flag(odd.cc), ' ', h('b', {}, odd.id)),
    () => h('span', {}, tr('Лучшие игроки: '), byFame.slice(0, 3).map((p) => h('b', { class: 'cclue' }, p.id))),
    () => h('span', { class: 'with-logo' }, tr('Логотип: '), logoAt(data, target, 'pic logo big')),
  ];

  const saveKey = daily ? `team:${seed}` : null;
  const state = (saveKey && store.get(saveKey)) || { guesses: [], skips: 0, done: false, won: false, used: 0 };
  const save = () => saveKey && store.set(saveKey, state);

  root.innerHTML = '';
  const intro = h('p', { class: 'mode-intro' }, tr('Угадайте команду по подсказкам. Каждая ошибка или пропуск открывает следующую подсказку: чем раньше угадаете, тем больше очков.'));
  const searchWrap = h('div', { class: 'who-search' });
  const clueBox = h('div', { class: 'clues' });
  const guessBox = h('div', { class: 'team-guesses' });
  const footer = h('div', { class: 'mode-footer' });
  root.append(intro, clueBox, searchWrap, guessBox, footer);

  // team search
  const input = h('input', { type: 'text', class: 'search-input', placeholder: tr('Название команды…'), autocomplete: 'off', spellcheck: 'false' });
  const list = h('ul', { class: 'search-list', role: 'listbox' });
  const wrap = h('div', { class: 'search' }, input, list);
  let items = []; let active = 0;
  // short names people type: "navi", "vp", "nip", "eg", "psg"…
  const SHORT = { 'Natus Vincere': 'navi', 'Virtus.pro': 'vp', 'Ninjas in Pyjamas': 'nip', 'Evil Geniuses': 'eg', 'Paris Saint-Germain F.C.': 'psg',
    'Paris Saint-Germain': 'psg', 'Manchester United F.C.': 'mu manutd', 'Manchester United': 'mu manutd', 'Team Spirit': 'ts', 'Gambit Esports': 'gmb',
    'Los Angeles Lakers': 'lal', 'Golden State Warriors': 'gsw' };
  const names = data.teams.map((t, i) => ({ i, t, f: fold(t) + (SHORT[t] ? ' ' + SHORT[t] : '') }));
  const draw = () => {
    list.innerHTML = '';
    items.forEach((x, k) => {
      const li = h('li', { class: k === active ? 'active' : '', role: 'option' }, logoAt(data, x.i), h('b', {}, x.t), h('span', { class: 'muted' }, regionOf(x.i)));
      li.addEventListener('mousedown', (e) => { e.preventDefault(); choose(x.i); });
      list.append(li);
    });
    list.style.display = items.length ? 'block' : 'none';
  };
  input.addEventListener('input', () => {
    const q = fold(input.value.trim());
    if (!q) { items = []; draw(); return; }
    const taken = new Set(state.guesses);
    const a = names.filter((x) => !taken.has(x.i) && (x.f.startsWith(q) || x.f.split(' ').includes(q))); const b = names.filter((x) => !taken.has(x.i) && !x.f.startsWith(q) && x.f.includes(q));
    // teams with a roster in the base come first
    const rank = (x) => (rosters.has(x.i) ? 0 : 1);
    items = [...a.sort((x, y) => rank(x) - rank(y)), ...b.sort((x, y) => rank(x) - rank(y))].slice(0, 8); active = 0; draw();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { active = Math.min(active + 1, items.length - 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); draw(); e.preventDefault(); }
    else if (e.key === 'Enter' && items[active]) { choose(items[active].i); e.preventDefault(); }
    else if (e.key === 'Escape') { items = []; draw(); }
  });
  input.addEventListener('blur', () => setTimeout(() => { items = []; draw(); }, 100));
  searchWrap.append(wrap);

  function finish(won) {
    state.done = true; state.won = won;
    if (daily) recordResult(data.game, 'team', day, { won, score: teamScore(state), detail: { guesses: state.used } });
    setTimeout(() => onFinish?.({ won, score: teamScore(state) }), 0);
  }
  function choose(i) {
    input.value = ''; items = []; draw();
    state.guesses.push(i); state.used++;
    document.dispatchEvent(new CustomEvent('gwai:answer'));
    if (i === target) finish(true); else if (state.used >= MAX) finish(false);
    save(); render();
  }
  function skip() {
    state.skips++; state.used++;
    if (state.used >= MAX) finish(false);
    save(); render();
  }

  function render() {
    const open = state.done ? MAX : Math.min(MAX, state.used + 1);
    clueBox.innerHTML = '';
    clues.slice(0, open).forEach((c, k) => clueBox.append(h('div', { class: 'clue' }, `${k + 1}. `, c())));
    guessBox.innerHTML = '';
    state.guesses.forEach((i) => guessBox.append(h('span', { class: 'chip ' + (i === target ? 'hit' : 'miss') }, logoAt(data, i), ' ', data.teams[i])));
    footer.innerHTML = '';
    searchWrap.style.display = state.done ? 'none' : '';
    if (state.done) {
      footer.append(resultCard({
        title: state.won ? tr('Угадано с {0}-й подсказки!', [state.used]) : tr('Не угадали'),
        score: teamScore(state), daily, game: data.game, mode: 'team',
        lines: [h('span', { class: 'answer' }, tr('Это '), logoAt(data, target, 'pic logo big'), ' ', h('b', {}, data.teams[target]), `. ${tr('В составе в базе')}: ${roster.map((p) => p.id).join(', ')}.`)],
        onShare: () => share(shareText()),
      }));
    } else {
      footer.append(
        h('span', { class: 'muted' }, tr('Подсказка {0} из {1} · сейчас на кону {2} очков', [state.used + 1, MAX, Math.max(100, 1000 - 150 * state.used)])), ' ',
        state.used < MAX - 1 ? h('button', { class: 'btn ghost small', onclick: skip }, tr('Следующая подсказка (−150)')) : null);
      setTimeout(() => input.focus(), 0);
    }
  }

  function shareText() {
    const squares = Array.from({ length: MAX }, (_, k) => (k < state.used - 1 ? '🟥' : k === state.used - 1 ? (state.won ? '🟩' : '🟥') : '⬜')).join('');
    return tr('GuessWhoAmI · {0} · Команда {1} {2}/{3}\n{4}\nОчки: {5}', [data.cfg.short, label, state.won ? state.used : 'X', MAX, squares, teamScore(state)]);
  }

  render();
}
