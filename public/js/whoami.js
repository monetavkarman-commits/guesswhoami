// "Кто я?" — Wordle-style: guess the hidden player; each guess shows per-attribute hints.
// Own twist: after 4 misses you can open a clue card (a former team, then the real-name initials).
import { rng, pick, h, flag, store, share, playerSearch, playerLink, roleText, toast } from './core.js';
import { recordResult, resultCard } from './stats.js';

// 1000 for a first-try guess, -100 per extra guess, -150 per opened clue, at least 100 for any win
export const whoScore = (st) => (st.won ? Math.max(100, 1000 - 100 * (st.guesses.length - 1) - 150 * st.clues) : 0);

const MAX = 8;

function columns(data) {
  const cs = data.game === 'cs';
  return [
    { title: 'Страна', cmp: (g, t) => (g.cc && g.cc === t.cc ? 'hit' : g.region && g.region === t.region ? 'near' : 'miss'),
      view: (g) => h('span', {}, flag(g.cc), ' ', g.country) },
    { title: data.cfg.teamLabel, cmp: (g, t) => {
        if (g.team && g.team === t.team) return 'hit';
        const ti = data.teams.indexOf(g.team); const gi = data.teams.indexOf(t.team);
        if ((ti >= 0 && t.teamSet.has(ti)) || (gi >= 0 && g.teamSet.has(gi))) return 'near';
        return 'miss';
      }, view: (g) => g.team || 'без команды' },
    cs
      ? { title: 'Роль', cmp: (g, t) => {
          const a = g.roles.join(); const b = t.roles.join();
          if (a === b) return 'hit';
          return g.roles.some((r) => t.roles.includes(r)) ? 'near' : 'miss';
        }, view: (g) => roleText(data, g) }
      : { title: 'Позиция', cmp: (g, t) => (g.pos === t.pos ? 'hit' : Math.abs(g.pos - t.pos) === 1 ? 'near' : 'miss'),
          arrow: (g, t) => (g.pos === t.pos ? '' : t.pos > g.pos ? '↑' : '↓'), view: (g) => `${g.pos} · ${roleText(data, g)}` },
    { title: 'Возраст', cmp: (g, t) => (g.age === t.age ? 'hit' : g.age != null && t.age != null && Math.abs(g.age - t.age) <= 2 ? 'near' : 'miss'),
      arrow: (g, t) => (g.age == null || t.age == null || g.age === t.age ? '' : t.age > g.age ? '↑' : '↓'), view: (g) => (g.age ?? '?') },
    { title: data.eventLabel, cmp: (g, t) => (g.events === t.events ? 'hit' : Math.abs(g.events - t.events) <= 1 ? 'near' : 'miss'),
      arrow: (g, t) => (g.events === t.events ? '' : t.events > g.events ? '↑' : '↓'), view: (g) => g.events },
  ];
}

export function mount(root, data, { seed, daily, label, day }) {
  const pool = data.players.filter((p) => p.top && p.age != null);
  const target = pick(rng(seed), pool);
  const cols = columns(data);
  const saveKey = daily ? `who:${seed}` : null;
  const state = (saveKey && store.get(saveKey)) || { guesses: [], done: false, won: false, clues: 0 };

  root.innerHTML = '';
  const intro = h('p', { class: 'mode-intro' }, `Угадайте загаданного игрока за ${MAX} попыток. `,
    h('span', { class: 'chip hit' }, 'зелёный'), ' — совпадает, ', h('span', { class: 'chip near' }, 'жёлтый'), ' — близко (тот же регион, бывшая команда, ±2 года, ±1 турнир), стрелка показывает, больше или меньше.');
  const searchWrap = h('div', { class: 'who-search' });
  const table = h('div', { class: 'who-table' });
  const clueBox = h('div', { class: 'clues' });
  const footer = h('div', { class: 'mode-footer' });
  root.append(intro, searchWrap, clueBox, table, footer);
  if (data.game === 'dota') root.append(h('p', { class: 'muted small' }, '* Команда — с последнего турнира игрока в базе (TI / EWC / Riyadh Masters).'));

  const save = () => saveKey && store.set(saveKey, state);
  const box = playerSearch(data, {
    placeholder: 'Ваша догадка…',
    exclude: (p) => state.guesses.includes(p.idx),
    onPick: (p) => {
      state.guesses.push(p.idx);
      if (p.idx === target.idx) { state.done = true; state.won = true; }
      else if (state.guesses.length >= MAX) state.done = true;
      if (state.done && daily) recordResult(data.game, 'whoami', day, { won: state.won, score: whoScore(state), detail: { guesses: state.guesses.length, clues: state.clues } });
      save(); render();
    },
  });
  searchWrap.append(box.el);

  function clueList() {
    const former = target.teams.map((t) => data.teams[t]).filter((t) => t !== target.team);
    const initials = target.name.split(/\s+/).filter(Boolean).map((w) => w[0] + '.').join(' ');
    return [
      former.length ? `Играл за ${former[Math.floor(former.length / 2)]}` : 'Всю карьеру в базе — в одной команде',
      `Настоящее имя: ${initials}`,
    ];
  }

  function render() {
    table.innerHTML = '';
    table.append(h('div', { class: 'who-row head' }, h('div', {}, 'Игрок'), cols.map((c) => h('div', {}, c.title))));
    [...state.guesses].reverse().forEach((gi) => {
      const g = data.players[gi];
      table.append(h('div', { class: 'who-row' }, h('div', { class: 'who-name ' + (gi === target.idx ? 'hit' : '') }, g.id),
        cols.map((c) => {
          const res = c.cmp(g, target); const arrow = c.arrow ? c.arrow(g, target) : '';
          return h('div', { class: 'who-cell ' + res }, c.view(g), arrow ? h('span', { class: 'arrow' }, arrow) : null);
        })));
    });

    clueBox.innerHTML = '';
    const misses = state.guesses.length - (state.won ? 1 : 0);
    const clues = clueList();
    if (!state.done && misses >= 4 && state.clues < clues.length) {
      clueBox.append(h('button', { class: 'btn ghost small', onclick: () => { state.clues++; save(); render(); } }, `Открыть подсказку ${state.clues + 1}/${clues.length} (−150 очков)`));
    }
    clues.slice(0, state.clues).forEach((c) => clueBox.append(h('div', { class: 'clue' }, '💡 ', c)));

    footer.innerHTML = '';
    searchWrap.style.display = state.done ? 'none' : '';
    if (state.done) {
      footer.append(resultCard({
        title: state.won ? `Угадано за ${state.guesses.length}!` : 'Не угадали',
        score: whoScore(state), daily, game: data.game, mode: 'whoami',
        lines: [h('span', {}, 'Это ', flag(target.cc), ' ', playerLink(target), ` — ${target.name}, ${target.team || 'без команды'}.`),
          state.clues ? `Подсказок открыто: ${state.clues} (−${150 * state.clues} очков)` : null],
        onShare: () => share(shareText()),
      }));
    } else {
      footer.append(h('span', { class: 'muted' }, `Попытка ${state.guesses.length + 1} из ${MAX} · сейчас на кону ${Math.max(100, 1000 - 100 * state.guesses.length - 150 * state.clues)} очков`));
      setTimeout(() => box.focus(), 0);
    }
  }

  function shareText() {
    const em = { hit: '🟩', near: '🟨', miss: '⬛' };
    const lines = state.guesses.map((gi) => cols.map((c) => em[c.cmp(data.players[gi], target)]).join(''));
    return `GuessWhoAmI · ${data.cfg.short} · Кто я? ${label} ${state.won ? state.guesses.length : 'X'}/${MAX}${state.clues ? ' 💡'.repeat(state.clues) : ''}\n${lines.join('\n')}\nОчки: ${whoScore(state)}`;
  }

  render();
  if (!state.done && state.guesses.length === 0) toast('Загадан новый игрок');
}
