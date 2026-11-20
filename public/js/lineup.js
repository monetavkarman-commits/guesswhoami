// "Угадай состав": a team is shown, its best players are hidden behind flag and role; name them all with at most 5 mistakes.
import { tr } from './i18n.js';
import { rng, pick, h, flag, store, share, playerSearch, roleText, photo, logoAt, toast } from './core.js';
import { recordResult, resultCard } from './stats.js';

const MISTAKES = 5;
const SLOTS = 5;
export const lineupScore = (st, n) => (st.found.length ? Math.max(50, Math.round((1000 * st.found.length) / n) - 100 * st.wrong.length) : 0);

export function mount(root, data, { seed, daily, label, day, onFinish }) {
  const rosters = new Map();
  for (const p of data.players) {
    if (!p.team) continue;
    const i = data.teams.indexOf(p.team);
    if (i < 0) continue;
    if (!rosters.has(i)) rosters.set(i, []);
    rosters.get(i).push(p);
  }
  const fame = (p) => p.fame ?? p.events ?? 0;
  const pool = [...rosters.keys()].filter((i) => rosters.get(i).length >= SLOTS).sort((a, b) => a - b);
  const team = pick(rng(seed), pool);
  const roster = rosters.get(team);
  const lineup = [...roster].sort((a, b) => fame(b) - fame(a)).slice(0, SLOTS);
  const n = lineup.length;
  const inLineup = new Set(lineup.map((p) => p.idx));
  const inRoster = new Set(roster.map((p) => p.idx));

  const saveKey = daily ? `lineup:${seed}` : null;
  const state = (saveKey && store.get(saveKey)) || { found: [], wrong: [], done: false };
  const save = () => saveKey && store.set(saveKey, state);

  root.innerHTML = '';
  const head = h('div', { class: 'lineup-team with-logo' }, logoAt(data, team, 'pic logo big'), h('b', {}, data.teams[team]));
  const intro = h('p', { class: 'mode-intro' }, tr('Назовите {0} лучших игроков команды (по данным базы). Допускается {1} ошибок.', [n, MISTAKES]));
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
    if (daily) recordResult(data.game, 'lineup', day, { won: state.found.length === n, score: lineupScore(state, n), detail: { found: state.found.length } });
    setTimeout(() => onFinish?.({ won: state.found.length === n, score: lineupScore(state, n) }), 0);
  }

  function render() {
    slots.innerHTML = '';
    lineup.forEach((p) => {
      const ok = state.found.includes(p.idx);
      const open = ok || state.done;
      slots.append(h('div', { class: 'lineup-slot ' + (ok ? 'hit' : state.done ? 'miss' : '') },
        open ? photo(p) : null, flag(p.cc), h('b', {}, open ? p.id : '?'),
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
        score: lineupScore(state, n), daily, game: data.game, mode: 'lineup',
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
    return tr('GuessWhoAmI · {0} · Состав {1}\n{2}\nОчки: {3}', [data.cfg.short, label, row, lineupScore(state, n)]);
  }

  render();
}
