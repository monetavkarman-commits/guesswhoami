import { tr } from './i18n.js';
import { loadGame, today, h, GAMES, filtersFor, store } from './core.js';
import { lang, setLang } from './i18n.js';
import * as grid from './grid.js';
import * as whoami from './whoami.js';
import * as chain from './chain.js';
import * as items from './items.js';
import { openProfile } from './achievements.js';
import { openLeaderboard, duelPanel, newDuelId } from './online.js';

document.getElementById('profile-btn').addEventListener('click', openProfile);
document.getElementById('board-btn').addEventListener('click', () => openLeaderboard(parseHash().game, today().num));

// language, theme, footer and offline support
const langBtn = document.getElementById('lang-btn');
langBtn.textContent = lang === 'ru' ? 'EN' : 'RU';
langBtn.addEventListener('click', () => setLang(lang === 'ru' ? 'en' : 'ru'));

const THEMES = ['auto', 'dark', 'light'];
const themeBtn = document.getElementById('theme-btn');
function applyTheme(t) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  themeBtn.textContent = { auto: '◐', dark: '☾', light: '☀' }[t];
  themeBtn.title = { auto: tr('Тема: как в системе'), dark: tr('Тема: тёмная'), light: tr('Тема: светлая') }[t];
}
let theme = store.get('theme', 'auto');
applyTheme(theme);
themeBtn.addEventListener('click', () => { theme = THEMES[(THEMES.indexOf(theme) + 1) % 3]; store.set('theme', theme); applyTheme(theme); });

if (lang === 'en') {
  document.getElementById('license-note').innerHTML = 'Player data from <a href="https://liquipedia.net/" target="_blank" rel="noopener">Liquipedia</a>, licensed under <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC BY-SA 3.0</a>. Athletes from <a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a> (CC0). Not affiliated with Liquipedia, Valve, Riot Games, leagues or tournament organisers.';
  document.title = 'GuessWhoAmI — guess the player';
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !location.hostname.endsWith('claude.ai') && !location.hostname.endsWith('claudeusercontent.com')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

const MODES = {
  grid: { title: tr('Сетка'), icon: '▦', mod: grid },
  whoami: { title: tr('Кто я?'), icon: '?', mod: whoami },
  chain: { title: tr('Цепочка'), icon: '⛓', mod: chain },
  items: { title: tr('Предметы'), icon: '◆', mod: items, set: 'items', gameTitle: { cs: tr('Оружие'), dota: tr('Герои'), lol: tr('Чемпионы'), tennis: tr('Теннисисты') } },
  maps: { title: tr('Карты'), icon: '⌖', mod: items, set: 'maps', gameTitle: { cs: tr('Карты') } },
  gear: { title: tr('Предметы'), icon: '🛡', mod: items, set: 'gear', gameTitle: { dota: tr('Предметы'), lol: tr('Предметы') } },
};

const root = document.getElementById('mode-root');
const gameTabs = document.getElementById('game-tabs');
// section switch (esports / sports) goes right before the game tabs
const sectionTabs = h('div', { class: 'seg section-tabs', role: 'tablist', 'aria-label': tr('Раздел') });
gameTabs.before(sectionTabs);
const modeTabs = document.getElementById('mode-tabs');
const dayBar = document.getElementById('day-bar');
const sourceNote = document.getElementById('source-note');

let endlessSeed = null;

// #cs-grid · #cs-grid-free · #cs-grid-duel-<id>[-s<rival score>][-f<filter>]
function parseHash() {
  const [g, m, e, id, ...rest] = location.hash.replace('#', '').split(/[-/]/);
  const duel = e === 'duel' && /^[a-z0-9]{4,16}$/.test(id || '') ? id : null;
  const s = rest.find((x) => /^s\d+$/.test(x)); const f = rest.find((x) => /^f\w+$/.test(x));
  const game = GAMES[g] ? g : 'cs';
  const okMode = (k) => MODES[k] && (!MODES[k].gameTitle || MODES[k].gameTitle[game]) && (!GAMES[game].itemsOnly || MODES[k].set);
  return { game, mode: okMode(m) ? m : GAMES[game].itemsOnly ? 'items' : 'grid', endless: e === 'free' || !!duel, duel,
    rival: s ? +s.slice(1) : null, duelFilter: f ? f.slice(1) : null };
}

function nav(game, mode, endless) {
  endlessSeed = null;
  location.hash = `${game}-${mode}${endless ? '-free' : ''}`;
}

function currentFilter(game) {
  const f = store.get(`filter:${game}`, 'all');
  return filtersFor(game)[f] ? f : 'all';
}

function filterSelect(game) {
  const cur = currentFilter(game);
  const sel = h('select', { id: 'difficulty', class: 'select', 'aria-label': tr('Сложность и эра'),
    onchange: (e) => { store.set(`filter:${game}`, e.target.value); endlessSeed = null; render(); } },
  Object.entries(filtersFor(game)).map(([k, f]) => h('option', { value: k, selected: k === cur }, f.label)));
  return sel;
}

async function render() {
  const { game, mode, endless, duel, rival, duelFilter } = parseHash();
  // two sections, esports and sports; only the games of the current section are listed
  const section = GAMES[game].sport ? 'sport' : 'esport';
  store.set(`lastGame:${section}`, game);
  sectionTabs.innerHTML = '';
  for (const [sec, label] of [['esport', tr('🎮 Киберспорт')], ['sport', tr('🏟 Спорт')]]) {
    const first = Object.keys(GAMES).find((k) => !!GAMES[k].sport === (sec === 'sport'));
    const target = store.get(`lastGame:${sec}`, first);
    sectionTabs.append(h('button', { class: sec === section ? 'active' : '', onclick: () => sec !== section && nav(GAMES[target] ? target : first, mode, endless) }, label));
  }
  gameTabs.innerHTML = '';
  gameTabs.classList.toggle('sport', section === 'sport');
  for (const [k, g] of Object.entries(GAMES)) {
    if (!!g.sport !== (section === 'sport')) continue;
    gameTabs.append(h('button', { class: 'tab' + (k === game ? ' active' : ''), title: g.title, onclick: () => nav(k, mode, endless) }, h('span', { class: 'full' }, g.tab || g.title), h('span', { class: 'short' }, g.short)));
  }
  modeTabs.innerHTML = '';
  for (const [k, m] of Object.entries(MODES)) {
    if ((m.gameTitle && !m.gameTitle[game]) || (GAMES[game].itemsOnly && !m.set)) continue;
    modeTabs.append(h('button', { class: 'mode-tab' + (k === mode ? ' active' : ''), onclick: () => nav(game, k, endless) }, h('span', { class: 'mode-icon' }, m.icon), m.gameTitle ? m.gameTitle[game] : m.title));
  }

  const { key, num } = today();
  if (duel) endlessSeed = duel;
  else if (endless && !endlessSeed) endlessSeed = newDuelId();
  dayBar.innerHTML = '';
  dayBar.append(
    h('div', { class: 'seg' },
      h('button', { class: endless ? '' : 'active', onclick: () => nav(game, mode, false) }, tr('Ежедневная №{0}', [num])),
      h('button', { class: endless && !duel ? 'active' : '', onclick: () => nav(game, mode, true) }, tr('Бесконечная')),
      duel ? h('button', { class: 'active' }, '⚔ ', tr('Дуэль')) : ''),
    h('div', { class: 'bar-right' }, duel || MODES[mode].set ? '' : filterSelect(game),
      endless ? h('button', { class: 'btn small', onclick: () => { if (duel) nav(game, mode, true); else { endlessSeed = null; render(); } } }, tr('Новая игра')) : ''));

  root.innerHTML = tr('<div class="loading">Загрузка игроков…</div>');
  try {
    const data = GAMES[game].itemsOnly ? { game, cfg: GAMES[game] } : await loadGame(game);
    sourceNote.textContent = data.players ? tr('{0}. Обновлено {1}. {2} игроков.', [tr(data.sourceNote), data.generated, data.players.length]) : '';
    const fid = GAMES[game].itemsOnly ? 'all' : duel ? (filtersFor(game)[duelFilter] ? duelFilter : 'all') : currentFilter(game);
    const suffix = fid === 'all' ? '' : `:${fid}`;
    const seed = (endless ? `${game}:${mode}:free:${endlessSeed}` : `${game}:${mode}:${key}`) + suffix;
    const id = endlessSeed;
    MODES[mode].mod.mount(root, data, {
      seed, daily: !endless, day: num, mode, set: MODES[mode].set, label: duel ? '⚔' : endless ? '∞' : tr('№{0}', [num]), filter: filtersFor(game)[fid].test, era: filtersFor(game)[fid].era,
      // endless and duel games end with a challenge link carrying the same puzzle id
      onFinish: endless ? ({ score }) => {
        root.querySelector('.duel')?.remove();
        root.append(duelPanel({ game, mode, id, filter: fid, score, rival: duel ? rival : null }));
      } : null,
    });
  } catch (e) {
    root.innerHTML = '';
    root.append(h('div', { class: 'error' }, tr('Ошибка: ') + e.message, h('br'), tr('Откройте сайт через локальный сервер (см. README), а не как файл.')));
    console.error(e);
  }
}

window.addEventListener('hashchange', render);
render();
