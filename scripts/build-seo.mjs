// Builds plain static pages for search engines at deploy time (public/catalog/**, public/sitemap.xml): one hub per game,
// a page per team with at least 3 players in the data and a page per well-known player. The site itself is a single page,
// so without these the search engines would see almost nothing. The generated files are not committed (see .gitignore).
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const SITE = 'https://guesswhoami.eu';
const GAMES = [
  ['cs', 'Counter-Strike', 'liquipedia'], ['dota', 'Dota 2', 'liquipedia'], ['valorant', 'VALORANT', 'liquipedia'], ['lol', 'League of Legends', 'liquipedia'],
  ['football', 'Футбол', 'wikidata'], ['basket', 'Баскетбол', 'wikidata'],
];
const SRC = {
  liquipedia: 'Данные об игроках: <a href="https://liquipedia.net/" rel="noopener">Liquipedia</a>, лицензия <a href="https://creativecommons.org/licenses/by-sa/3.0/" rel="noopener">CC BY-SA 3.0</a>.',
  wikidata: 'Данные о спортсменах: <a href="https://www.wikidata.org/" rel="noopener">Wikidata</a> (CC0).',
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9а-яё]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'x';
const OUT = ROOT + 'public/catalog/';
if (existsSync(OUT)) rmSync(OUT, { recursive: true });
const urls = [SITE + '/'];

const page = ({ dir, file, title, desc, h1, body, source }) => {
  const depth = dir.split('/').length;     // catalog/<game> → ../../
  const up = '../'.repeat(depth + 1);
  const path = `catalog/${dir}/${file}`;
  mkdirSync(OUT + dir, { recursive: true });
  writeFileSync(OUT + dir + '/' + file, `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'none'">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}/${path}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="website">
<link rel="stylesheet" href="${up}style.css"></head>
<body><header class="top"><div class="wrap top-inner"><a class="logo" href="${up}index.html"><span>Guess<b>Who</b>AmI</span></a></div></header>
<main class="wrap seo"><h1>${esc(h1)}</h1>${body}
<p><a class="btn" href="${up}index.html#${dir.split('/')[0]}-whoami">Сыграть в GuessWhoAmI: угадай игрока</a></p>
<p class="muted small">${source}</p></main></body></html>`);
  urls.push(`${SITE}/${path}`);
};

for (const [game, gtitle, src] of GAMES) {
  const file = ROOT + `public/data/${game}.json`;
  if (!existsSync(file)) continue;
  const d = JSON.parse(readFileSync(file, 'utf8'));
  const P = d.players, T = d.teams;
  if (d.matesFile) { const all = JSON.parse(readFileSync(ROOT + 'public/' + d.matesFile, 'utf8')); P.forEach((p, i) => { p.mates = all[i] || []; }); }
  const used = new Set();
  const unique = (base) => { let s = base, n = 2; while (used.has(s)) s = base + '-' + n++; used.add(s); return s; };
  // players with a page: the well-known ones
  const pslug = new Map(); P.forEach((p, i) => { if (p.top) pslug.set(i, 'player-' + unique(slug(p.id))); });
  const count = new Map(); P.forEach((p) => p.teams.forEach((t) => count.set(t, (count.get(t) || 0) + 1)));
  const tslug = new Map(); [...count].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).forEach(([t]) => tslug.set(t, 'team-' + unique(slug(T[t]))));
  const link = (i) => (pslug.has(i) ? `<a href="${pslug.get(i)}.html">${esc(P[i].id)}</a>` : esc(P[i].id));
  const tlink = (t) => (tslug.has(t) ? `<a href="${tslug.get(t)}.html">${esc(T[t])}</a>` : esc(T[t]));

  for (const [i, s] of pslug) {
    const p = P[i];
    const teams = [...new Set(p.teams)].slice(0, 15);
    const mates = [...new Set((p.mates || []).map((m) => m[0]))].slice(0, 12);
    const bits = [`${p.id}${p.name && p.name !== p.id ? ` (${p.name})` : ''}: игрок в категории «${gtitle}»${p.country ? `, ${p.country}` : ''}${p.birth ? `, год рождения ${String(p.birth).slice(0, 4)}` : ''}.`];
    if (p.team) bits.push(`Последняя команда: ${p.team}.`);
    const body = `<p>${esc(bits.join(' '))}</p>` +
      (teams.length ? `<h2>Команды</h2><p>${teams.map(tlink).join(', ')}</p>` : '') +
      (mates.length ? `<h2>Играл вместе с</h2><p>${mates.map(link).join(', ')}</p>` : '');
    page({ dir: game, file: s + '.html', title: `${p.id}${p.name && p.name !== p.id ? ` (${p.name})` : ''} — ${gtitle}: команды и партнёры | GuessWhoAmI`, desc: bits.join(' ').slice(0, 200), h1: p.id, body, source: SRC[src] });
  }
  for (const [t, s] of tslug) {
    const now = P.map((p, i) => [p, i]).filter(([p]) => p.team === T[t]);
    const before = P.map((p, i) => [p, i]).filter(([p]) => p.team !== T[t] && p.teams.includes(t)).slice(0, 40);
    const cc = {}; for (const [p] of [...now, ...before]) if (p.country) cc[p.country] = (cc[p.country] || 0) + 1;
    const top3 = Object.entries(cc).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${c} (${n})`).join(', ');
    const intro = `${T[t]} — команда в категории «${gtitle}». В нашей базе ${count.get(t)} игроков, связанных с этой командой${top3 ? `; чаще всего это игроки из стран: ${top3}` : ''}.`;
    const body = `<p>${esc(intro)}</p>` + (now.length ? `<h2>Сейчас в команде</h2><p>${now.map(([, i]) => link(i)).join(', ')}</p>` : '') +
      (before.length ? `<h2>Выступали за команду</h2><p>${before.map(([, i]) => link(i)).join(', ')}</p>` : '');
    page({ dir: game, file: s + '.html', title: `${T[t]} — состав и игроки (${gtitle}) | GuessWhoAmI`, desc: intro.slice(0, 200), h1: T[t], body, source: SRC[src] });
  }
  const topTeams = [...tslug].slice(0, 80);
  const hub = `<p>Каталог игроков и команд «${esc(gtitle)}» из базы GuessWhoAmI: ${tslug.size} команд и ${pslug.size} известных игроков.</p><h2>Команды</h2><p>${topTeams.map(([t, s]) => `<a href="${s}.html">${esc(T[t])}</a>`).join(', ')}</p>` +
    `<h2>Игроки</h2><p>${[...pslug].map(([i, s]) => `<a href="${s}.html">${esc(P[i].id)}</a>`).join(', ')}</p>` +
    `<h2>Другие игры</h2><p>${GAMES.filter((g) => g[0] !== game).map(([g, n]) => `<a href="../${g}/index.html">${esc(n)}</a>`).join(', ')}</p>`;
  page({ dir: game, file: 'index.html', title: `${gtitle}: игроки и команды — каталог | GuessWhoAmI`, desc: `Каталог игроков и команд: ${gtitle}. Составы, партнёры по командам и ежедневная игра «Угадай игрока».`, h1: `${gtitle}: игроки и команды`, body: hub, source: SRC[src] });
  console.log(game, pslug.size, 'players,', tslug.size, 'teams');
}

const today = new Date().toISOString().slice(0, 10);
writeFileSync(ROOT + 'public/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(u)}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`);
console.log(urls.length, 'URLs in sitemap.xml');
