import { tr } from './i18n.js';
import { loadGame, ensureMates, today, h, GAMES, filtersFor, store, modal, toast, gameBadge } from './core.js';
import { lang, setLang } from './i18n.js';
import * as grid from './grid.js';
import * as whoami from './whoami.js';
import * as chain from './chain.js';
import * as team from './team.js';
import * as lineup from './lineup.js';
import * as items from './items.js';
import { askConsent } from './consent.js';
import { startAnalytics, track, sendReport } from './analytics.js';
import { renderHome } from './home.js';
import { openPlayer, openProfile } from './profile.js';
import { showNotice } from './notice.js';
import { refreshAds } from './ads.js';
import { initAccountButton, accountsEnabled, currentUser, client, openAccount } from './account.js';
import { openLeaderboard, duelPanel, newDuelId, onlineReady } from './online.js';

const ctx = () => ({ game: parseHash().game, day: today().num });
document.getElementById('profile-btn').addEventListener('click', () => openPlayer('stats', ctx()));
document.addEventListener('gwai:open-player', () => openProfile());
// on our own domain the site may not be shown inside someone else's frame (clickjacking); the Claude artifact runs framed on purpose
if (window.top !== window.self && /(^|\.)guesswhoami\.eu$|github\.io$/.test(location.hostname)) {
  try { window.top.location = window.location.href; } catch { document.body.innerHTML = ''; }
}
initAccountButton(document.getElementById('account-btn'));
onlineReady().then((ok) => { if (!ok) document.getElementById('board-btn').style.display = 'none'; });
document.getElementById('board-btn').addEventListener('click', () => openPlayer('rating', ctx()));

// language, theme, footer and offline support
const langBtn = document.getElementById('lang-btn');
langBtn.textContent = lang === 'ru' ? 'EN' : 'RU';
langBtn.addEventListener('click', () => setLang(lang === 'ru' ? 'en' : 'ru'));

const THEMES = ['dark', 'light'];
const themeBtn = document.getElementById('theme-btn');
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  themeBtn.textContent = { dark: '☾', light: '☀' }[t];
  themeBtn.title = { dark: tr('Тема: тёмная'), light: tr('Тема: светлая') }[t];
}
let theme = store.get('theme', 'dark');
if (!THEMES.includes(theme)) theme = 'dark';
applyTheme(theme);
themeBtn.addEventListener('click', () => { theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]; store.set('theme', theme); applyTheme(theme); });

if (lang === 'en') {
  document.getElementById('license-note').innerHTML = 'Player data from <a href="https://liquipedia.net/" target="_blank" rel="noopener">Liquipedia</a>, licensed under <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC BY-SA 3.0</a>. Athletes from <a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a> (CC0). Player photos and club logos come from Wikimedia Commons (authors and licences are on each file page), some esports team logos from <a href="https://logos.fandom.com/" target="_blank" rel="noopener">Logopedia</a>; logos remain trademarks of the clubs. Dota 2 hero and item icons belong to Valve, League of Legends champion and item icons to Riot Games, loaded from their servers. Not affiliated with Liquipedia, Valve, Riot Games, leagues or tournament organisers.';
  document.title = 'GuessWhoAmI — guess the player';
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !location.hostname.endsWith('claude.ai') && !location.hostname.endsWith('claudeusercontent.com')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

const MODES = {
  grid: { title: tr('Сетка'), icon: '▦', mod: grid },
  whoami: { title: tr('Кто я?'), icon: '👤', mod: whoami },
  chain: { title: tr('Цепочка'), icon: '⛓', mod: chain, needsMates: true },
  items: { title: tr('Предметы'), icon: '◆', mod: items, set: 'items', gameTitle: { cs: tr('Оружие'), dota: tr('Герои'), lol: tr('Чемпионы'), deadlock: tr('Герои'), tennis: tr('Теннисисты'), hockey: tr('Хоккеисты'), mma: tr('Бойцы'), boxing: tr('Боксёры') } },
  team: { title: tr('Команда'), icon: '🏷', mod: team, noFilter: true, gameTitle: Object.fromEntries(['cs', 'dota', 'valorant', 'lol', 'football', 'basket'].map((g) => [g, tr('Угадай команду')])) },
  lineup: { title: tr('Состав'), icon: '👥', mod: lineup, needsMates: true, noFilter: true, gameTitle: Object.fromEntries(['cs', 'dota', 'valorant', 'lol', 'football', 'basket'].map((g) => [g, tr('Угадай состав')])) },
  maps: { title: tr('Карты'), icon: '⌖', mod: items, set: 'maps', gameTitle: { cs: tr('Карты') } },
  gear: { title: tr('Предметы'), icon: '🛡', mod: items, set: 'gear', gameTitle: { dota: tr('Предметы'), lol: tr('Предметы'), deadlock: tr('Предметы') } },
};

// Without an account only FREE_GAMES puzzles can be finished; the count is kept in the browser (a convenience limit, not a lock)
const FREE_GAMES = 3;
let signedIn = false;
currentUser().then((u) => { signedIn = !!u; });
document.addEventListener('gwai:auth', (e) => { const was = signedIn; signedIn = !!(e.detail && e.detail.user); if (signedIn !== was) render(); });
let currentSeed = null;
async function guestCheck(seed, register) {
  try {
    const sb = await client(); if (!sb) return null;
    const { data, error } = await sb.rpc('guest_play', { p_seed: seed, p_register: register });
    return error ? null : data;
  } catch { return null; }
}
// the first answer of a guest's puzzle uses up one of the free puzzles
document.addEventListener('gwai:answer', async () => {
  if (!accountsEnabled() || signedIn || !currentSeed) return;
  const seed = currentSeed; const d = store.get('guestDone', []);
  if (!d.includes(seed)) store.set('guestDone', [...d, seed]);
  await guestCheck(seed, true);
});

function gateCard() {
  return h('div', { class: 'gate' },
    h('h3', {}, tr('Бесплатные игры закончились')),
    h('p', {}, tr('Без аккаунта можно сыграть {0} раза. Создайте аккаунт (это бесплатно, хватит почты или Google, Discord), и можно играть без ограничений, а ваши очки попадут в рейтинг.', [FREE_GAMES])),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: async () => { const sb = await client(); if (sb) openAccount(sb, await currentUser(), true); } }, tr('Войти или создать аккаунт')),
      h('button', { class: 'btn ghost', onclick: () => { location.hash = ''; } }, tr('На главную'))));
}

const root = document.getElementById('mode-root');
const gameTabs = document.getElementById('game-tabs');
// section switch (esports / sports) goes right before the game tabs
const sectionTabs = h('div', { class: 'seg section-tabs', role: 'tablist', 'aria-label': tr('Раздел') });
gameTabs.before(sectionTabs);
// the game tabs scroll sideways; arrows on both ends show and scroll when they do not fit
const tabsWrap = h('div', { class: 'tabs-wrap' });
const arrowL = h('button', { class: 'tabs-arrow left', type: 'button', 'aria-label': tr('Назад'), onclick: () => gameTabs.scrollBy({ left: -240, behavior: 'smooth' }) }, '‹');
const arrowR = h('button', { class: 'tabs-arrow right', type: 'button', 'aria-label': tr('Вперёд'), onclick: () => gameTabs.scrollBy({ left: 240, behavior: 'smooth' }) }, '›');
gameTabs.before(tabsWrap); tabsWrap.append(arrowL, gameTabs, arrowR);
const updateArrows = () => {
  arrowL.style.display = gameTabs.scrollLeft > 4 ? '' : 'none';
  arrowR.style.display = gameTabs.scrollLeft + gameTabs.clientWidth < gameTabs.scrollWidth - 4 ? '' : 'none';
};
gameTabs.addEventListener('scroll', updateArrows, { passive: true });
window.addEventListener('resize', updateArrows);
const modeTabs = document.getElementById('mode-tabs');
const dayBar = document.getElementById('day-bar');
const sourceNote = document.getElementById('source-note');

let endlessSeed = null;
// Duels are switched off for now; set to true to bring back challenge links and the duel panel.
const DUELS = true;

// #cs-grid · #cs-grid-free · #cs-grid-duel-<id>[-s<rival score>][-f<filter>]
function parseHash() {
  const [g, m, e, id, ...rest] = location.hash.replace('#', '').split(/[-/]/);
  const duel = DUELS && e === 'duel' && /^[a-z0-9]{4,16}$/.test(id || '') ? id : null;
  const s = rest.find((x) => /^s\d+$/.test(x)); const f = rest.find((x) => /^f\w+$/.test(x));
  const home = !GAMES[g];
  const game = GAMES[g] ? g : 'cs';
  const okMode = (k) => MODES[k] && (!MODES[k].gameTitle || MODES[k].gameTitle[game]) && (!GAMES[game].itemsOnly || MODES[k].set);
  return { home, game, mode: okMode(m) ? m : GAMES[game].itemsOnly ? 'items' : 'grid', endless: e === 'free' || e === 'duel' || !!duel, duel,
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

// short rules for every mode: the ? button next to the day switch, shown once by itself the first time a mode is opened
const HELP = () => ({
  grid: [tr('Сетка'), [tr('В каждую клетку впиши игрока, который подходит и строке, и столбцу сразу.'), tr('У вас 12 попыток, каждый игрок только один раз. Очки: до 100 за клетку (чем менее очевидный игрок, тем больше), +100 за сетку без ошибок.'), tr('Подсказка в клетке стоит одну попытку.')]],
  whoami: [tr('Кто я?'), [tr('Угадай загаданного игрока. После каждой попытки цвета показывают, что совпало: страна, роль, возраст, команда.'), tr('Зелёный: совпадает, жёлтый: близко, серый: нет. Стрелки показывают, больше или меньше.'), tr('1000 очков за угадывание с первой попытки, −100 за каждую следующую. После 4 промахов можно открыть подсказку, она стоит 150 очков.')]],
  chain: [tr('Цепочка'), [tr('Соедини двух игроков через тех, с кем они играли в одной команде.'), tr('Чем короче цепочка, тем больше очков.')]],
  items: [tr('Предметы и герои'), [tr('Угадай героя, оружие или предмет по подсказкам и описанию.')]],
  maps: [tr('Карты'), [tr('Угадай карту по подсказкам.')]],
  gear: [tr('Предметы'), [tr('Угадай предмет по подсказкам.')]],
  team: [tr('Угадай команду'), [tr('По подсказкам об игроках и командах угадай, о какой команде идёт речь.')]],
  lineup: [tr('Угадай состав'), [tr('Собери состав команды: впиши игроков, которые за неё играли.'), tr('Можно выбрать год состава: тогда нужны игроки, которые были в команде в этом году.')]],
});
function showHelp(mode) {
  const [title, lines] = HELP()[mode] || [tr('Как играть'), []];
  modal(tr('Как играть') + ': ' + title, h('div', { class: 'stack' }, lines.map((l) => h('p', {}, l)), h('p', { class: 'muted small' }, tr('Новые загадки каждый день в 00:00. Играть можно без аккаунта.'))));
}

function filterSelect(game) {
  const cur = currentFilter(game);
  const sel = h('select', { id: 'difficulty', class: 'select', 'aria-label': tr('Сложность и эра'),
    onchange: (e) => { store.set(`filter:${game}`, e.target.value); endlessSeed = null; render(); } },
  Object.entries(filtersFor(game)).map(([k, f]) => h('option', { value: k, selected: k === cur }, f.label)));
  return sel;
}

async function render() {
  const { home, game, mode, endless, duel, rival, duelFilter } = parseHash();
  document.body.classList.toggle('is-home', home);
  refreshAds(home);
  window.scrollTo(0, 0);
  if (home) {
    document.title = lang === 'en' ? 'GuessWhoAmI — guess the player' : 'GuessWhoAmI — угадай игрока';
    sourceNote.textContent = '';
    renderHome(root, { GAMES, MODES, nav, num: today().num });
    return;
  }
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
    gameTabs.append(h('button', { class: 'tab' + (k === game ? ' active' : ''), title: g.title, onclick: () => nav(k, mode, endless) }, gameBadge(k), h('span', { class: 'full' }, g.tab || g.title), h('span', { class: 'short' }, g.short)));
  }
  requestAnimationFrame(() => { gameTabs.querySelector('.tab.active')?.scrollIntoView({ inline: 'center', block: 'nearest' }); updateArrows(); });
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
    h('div', { class: 'bar-right' }, HELP()[mode] ? h('button', { class: 'btn ghost small', type: 'button', 'aria-label': tr('Как играть'), title: tr('Как играть'), onclick: () => showHelp(mode) }, '?') : '', duel || MODES[mode].set || MODES[mode].noFilter ? '' : filterSelect(game),
      endless ? h('button', { class: 'btn small', onclick: () => { if (duel) nav(game, mode, true); else { endlessSeed = null; render(); } } }, tr('Новая игра')) : ''));

  if (!endless && HELP()[mode] && !store.get('helpSeen:' + mode, false) && store.get('howtoSeen', false)) { store.set('helpSeen:' + mode, true); setTimeout(() => { if (!document.querySelector('.modal-back')) showHelp(mode); }, 700); }
  root.innerHTML = tr('<div class="loading">Загрузка игроков…</div>');
  try {
    const data = GAMES[game].itemsOnly ? { game, cfg: GAMES[game] } : await loadGame(game);
    sourceNote.textContent = data.players ? tr('{0}. Обновлено {1}. {2} игроков.', [tr(data.sourceNote), data.generated, data.players.length]) : '';
    const fid = GAMES[game].itemsOnly ? 'all' : duel ? (filtersFor(game)[duelFilter] ? duelFilter : 'all') : currentFilter(game);
    const suffix = fid === 'all' ? '' : `:${fid}`;
    const seed = (endless ? `${game}:${mode}:free:${endlessSeed}` : `${game}:${mode}:${key}`) + suffix;
    const id = endlessSeed;
    currentSeed = seed;
    if (accountsEnabled() && !signedIn) {
      // the server counts guest puzzles per network + browser; if it cannot be reached, the browser's own count is used
      const r = await guestCheck(seed, false);
      const done = store.get('guestDone', []);
      const blocked = r ? !r.ok : done.length >= FREE_GAMES && !done.includes(seed);
      if (blocked) { root.innerHTML = ''; root.append(gateCard()); return; }
    }
    if (MODES[mode].needsMates) await ensureMates(data);
    MODES[mode].mod.mount(root, data, {
      seed, daily: !endless, day: num, mode, set: MODES[mode].set, label: duel ? '⚔' : endless ? '∞' : tr('№{0}', [num]), filter: filtersFor(game)[fid].test, era: filtersFor(game)[fid].era,
      // endless and duel games end with a challenge link carrying the same puzzle id
      onFinish: endless && DUELS ? ({ score }) => {
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

// legal links, cookie settings and the "wrong data" report
const foot = h('p', { class: 'foot-links' },
  h('a', { href: 'privacy.html' }, tr('Политика конфиденциальности')), ' · ',
  h('a', { href: 'terms.html' }, tr('Условия использования')), ' · ',
  h('a', { href: 'advertise.html' }, tr('Реклама на сайте')), ' · ',
  h('a', { href: '#', onclick: (e) => { e.preventDefault(); askConsent(true); } }, tr('Настройки cookies')), ' · ',
  h('a', { href: '#', onclick: (e) => { e.preventDefault(); openReport(); } }, tr('Сообщить об ошибке в данных')));
document.querySelector('.site-footer').prepend(foot);
function openReport() {
  const box = h('textarea', { class: 'search-input report-box', maxlength: 380, rows: 4, placeholder: tr('Что не так? Укажите игрока и что неверно (клуб, страна, года…)') });
  const close = modal(tr('Сообщить об ошибке в данных'), h('div', { class: 'stack' }, box,
    h('button', { class: 'btn', type: 'button', onclick: async () => { if (box.value.trim().length < 5) return; if (await sendReport(box.value.trim())) { close(); toast(tr('Спасибо, мы проверим!')); } else toast(tr('Не удалось отправить')); } }, tr('Отправить'))));
}
askConsent(); startAnalytics(); showNotice();
window.addEventListener('hashchange', render);
render();
