// "Предметы": Wordle-style guessing of game items (Dota 2 heroes, CS weapons) from data/<game>-items.json.
// Columns are declared in the data file: 'cat' (exact match), 'set' (overlap is yellow), 'num' (arrows, yellow when close),
// 'shared' (how many entries of the list the guess shares with the answer, e.g. films two actors made together; any is yellow).
// A column with `flag` shows the flag of that field (a country code) before the value.
import { tr } from './i18n.js';
import { rng, pick, h, store, share, pic, imgSrc, fold, flag } from './core.js';
import { recordResult, resultCard } from './stats.js';

const MAX = 7;
const cache = {};
export async function loadItems(game, set = 'items') {
  const f = `data/${game}-${set}.json`;
  if (!cache[f]) cache[f] = fetch(f).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });
  return cache[f];
}

const sharedCount = (col, g, t) => { const B = new Set(t[col.key] || []); return (g[col.key] || []).filter((x) => B.has(x)).length; };
function cmp(col, g, t) {
  const a = g[col.key]; const b = t[col.key];
  if (col.type === 'shared') return { res: g.id === t.id ? 'hit' : sharedCount(col, g, t) ? 'near' : 'miss', arrow: '' };
  if (col.type === 'num') {
    if (a == null || b == null) return { res: 'miss', arrow: '' };
    if (a === b) return { res: 'hit', arrow: '' };
    return { res: Math.abs(a - b) <= (col.near ?? 0) ? 'near' : 'miss', arrow: b > a ? '↑' : '↓' };
  }
  if (col.type === 'set') {
    const A = a || []; const B = b || [];
    if (A.length === B.length && A.every((x) => B.includes(x))) return { res: 'hit', arrow: '' };
    return { res: A.some((x) => B.includes(x)) ? 'near' : 'miss', arrow: '' };
  }
  if (a != null && a === b) return { res: 'hit', arrow: '' };
  return { res: col.nearKey && g[col.nearKey] && g[col.nearKey] === t[col.nearKey] ? 'near' : 'miss', arrow: '' };
}
const show = (col, v) => (Array.isArray(v) ? (v.length ? v.map((x) => tr(x)).join(', ') : '—') : v == null ? '—' : col.type === 'num' && col.unit ? (col.unit === '$' ? `$${v}` : `${v}${col.unit}`) : tr(String(v)));

export const itemScore = (st) => (st.won ? Math.max(100, 1000 - 125 * (st.guesses.length - 1)) : 0);

export async function mount(root, gameData, { seed, daily, label, day, onFinish, mode = 'items', set = 'items' }) {
  const data = await loadItems(gameData.game, set);
  // optional: only the best-known items can be the answer (all of them can be guessed)
  const target = pick(rng(seed), data.pool === 'top' ? data.items.slice(0, data.topCount || 100) : data.items);
  const saveKey = daily ? `${mode}:${seed}` : null;
  const state = (saveKey && store.get(saveKey)) || { guesses: [], done: false, won: false };
  const save = () => saveKey && store.set(saveKey, state);
  const byId = new Map(data.items.map((x) => [x.id, x]));
  // item icons come from the official CDN named in the data file (imgBase)
  // (tennis players carry Wikimedia Commons photos instead: data.imgWm)
  const icon = (it, cls = 'pic') => (!it.img ? null : data.imgWm ? pic(imgSrc(it.img, 120), `${cls} round`) : data.imgBase ? pic(data.imgBase + it.img, cls) : null);

  // "shared" column: the picture of the best-known shared film, when the data file has one (data.filmImg: index -> [path, name, rank])
  const sharedPic = (col, g, t) => {
    if (!data.filmImg) return null;
    const B = new Set(t[col.key] || []);
    const best = (g[col.key] || []).filter((x) => B.has(x) && data.filmImg[x]).sort((a, b) => data.filmImg[a][2] - data.filmImg[b][2])[0];
    if (best == null) return null;
    const [src, name] = data.filmImg[best];
    const el = pic(src, 'pic logo ' + (/^img\/films\/p/.test(src) ? 'poster' : 'wordmark'));
    if (el) el.title = name;
    return el;
  };

  root.innerHTML = '';
  const input = h('input', { type: 'text', id: 'item-input', class: 'search-input', placeholder: tr(data.placeholder), autocomplete: 'off', spellcheck: 'false' });
  const list = h('ul', { class: 'search-list' });
  const table = h('div', { class: 'who-table' });
  const footer = h('div', { class: 'mode-footer' });
  root.append(h('p', { class: 'mode-intro' }, tr(data.intro), ' ', tr('{0} попыток.', [MAX])), h('div', { class: 'who-search' }, h('div', { class: 'search' }, input, list)), table, footer);

  let items = []; let active = 0;
  const renderList = () => {
    list.innerHTML = '';
    items.forEach((it, i) => { const li = h('li', { class: i === active ? 'active' : '' }, icon(it), h('b', {}, it.name), it.sub ? h('span', { class: 'muted' }, tr(it.sub)) : null); li.addEventListener('mousedown', (e) => { e.preventDefault(); choose(it); }); list.append(li); });
    list.style.display = items.length ? 'block' : 'none';
  };
  input.addEventListener('input', () => {
    const q = fold(input.value.trim());
    items = q ? data.items.filter((x) => !state.guesses.includes(x.id) && (fold(x.name).includes(q) || (x.alias || []).some((a) => fold(a).includes(q))))
      .sort((a, b) => fold(a.name).indexOf(q) - fold(b.name).indexOf(q)).slice(0, 8) : [];
    active = 0; renderList();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { active = Math.min(active + 1, items.length - 1); renderList(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); renderList(); e.preventDefault(); }
    else if (e.key === 'Enter' && items[active]) { choose(items[active]); e.preventDefault(); }
  });
  input.addEventListener('blur', () => setTimeout(() => { items = []; renderList(); }, 100));

  function choose(it) {
    input.value = ''; items = []; renderList();
    state.guesses.push(it.id); document.dispatchEvent(new CustomEvent('gwai:answer'));
    if (it.id === target.id) { state.done = true; state.won = true; } else if (state.guesses.length >= MAX) state.done = true;
    if (state.done) {
      if (daily) recordResult(gameData.game, mode, day, { won: state.won, score: itemScore(state), detail: { guesses: state.guesses.length } });
      setTimeout(() => onFinish?.({ won: state.won, score: itemScore(state) }), 0);
    }
    save(); render();
  }

  function render() {
    table.innerHTML = '';
    table.style.setProperty('--cols', data.columns.length);
    table.append(h('div', { class: 'who-row head items' }, h('div', {}, tr(data.nameTitle)), data.columns.map((c) => h('div', {}, tr(c.title)))));
    [...state.guesses].reverse().forEach((id) => {
      const g = byId.get(id); if (!g) return;
      table.append(h('div', { class: 'who-row items' }, h('div', { class: 'who-name ' + (id === target.id ? 'hit' : '') }, icon(g), g.name),
        data.columns.map((c) => {
          const { res, arrow } = cmp(c, g, target);
          const val = c.type === 'shared' ? (g.id === target.id ? '✓' : String(sharedCount(c, g, target))) : show(c, g[c.key]);
          return h('div', { class: 'who-cell ' + res }, c.flag && g[c.flag] ? flag(g[c.flag]) : null, c.type === 'shared' && g.id !== target.id ? sharedPic(c, g, target) : null, val, arrow ? h('span', { class: 'arrow' }, arrow) : null);
        })));
    });
    footer.innerHTML = '';
    input.closest('.who-search').style.display = state.done ? 'none' : '';
    if (state.done) {
      footer.append(resultCard({
        title: state.won ? tr('Угадано за {0}!', [state.guesses.length]) : tr('Не угадали'),
        score: itemScore(state), daily, game: gameData.game, mode,
        lines: [h('span', { class: 'answer' }, icon(target, 'pic big'), tr('Ответ: '), target.url ? h('a', { href: target.url, target: '_blank', rel: 'noopener' }, target.name) : target.name), data.source ? h('span', { class: 'muted' }, tr(data.source)) : null].filter(Boolean),
        onShare: () => share(shareText()),
      }));
    } else footer.append(h('span', { class: 'muted' }, tr('Попытка {0} из {1}', [state.guesses.length + 1, MAX])));
  }

  function shareText() {
    const em = { hit: '🟩', near: '🟨', miss: '⬛' };
    const lines = state.guesses.map((id) => data.columns.map((c) => em[cmp(c, byId.get(id), target).res]).join(''));
    return tr('WhoAmIGuess · {0} · {1} {2} {3}/{4}\n{5}', [gameData.cfg.short, tr(data.modeTitle), label, state.won ? state.guesses.length : 'X', MAX, lines.join('\n')]);
  }

  render();
}
