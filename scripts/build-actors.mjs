// Builds the "Актёры" guessing game (item-style, like MMA) from data/raw/actors-wd.json (Wikidata, CC0).
// Raw (fetched in the owner's browser from query.wikidata.org, see the "how to refresh" note in HANDOFF.md):
//   people: [{p, en, ru, b, d, sex, bpc, img}]  one row per (person, birth-place country) pair
//   films:  [[person, film, year]]               cast member (P161) of a film, year = first publication date
//   finfo:  [[film, sitelinks, en, ru, "Q1|Q2"]] genres (P136) of each film
//   osc:    [[person, "w"|"n"]]                   acting Academy Award won / nominated
//   countries: {Q: ISO 3166-1 alpha-2}, genres: {Q: English label}
// Actors born in Russia (birth place in today's Russian Federation) are left out on purpose (owner's request).
//   node scripts/build-actors.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { COUNTRIES, REGIONS } from './countries.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const RAW = ROOT + 'data/raw/actors-wd.json';
if (!existsSync(RAW)) { console.log('no actors raw data'); process.exit(0); }
const raw = JSON.parse(readFileSync(RAW, 'utf8'));
// many famous people now keep their name only as the language-neutral ("mul") label
const MUL = existsSync(ROOT + 'data/raw/actors-mul.json') ? JSON.parse(readFileSync(ROOT + 'data/raw/actors-mul.json', 'utf8')) : {};
// birth places that Wikidata files under a former state: map to today's country
Object.assign(raw.countries, { Q713750: 'DE', Q16957: 'DE', Q2415901: 'DE' });
for (const [q, c] of Object.entries(raw.countries)) if (c === 'DD') raw.countries[q] = 'DE';
// photos and film pictures stored in the site (scripts/apply-actors-img.mjs); without them the Commons path is used
const IMG = existsSync(ROOT + 'data/raw/actors-img.json') ? JSON.parse(readFileSync(ROOT + 'data/raw/actors-img.json', 'utf8')) : { actors: {}, films: {} };
const today = new Date().toISOString().slice(0, 10);
const YEAR = +today.slice(0, 4);
const SIZE = 300;      // only the best-known actors (owner's request: "самые известные")
const TOP = 150;       // the best known of them can be the answer
const MIN_FILMS = 8;
const DRAMA_WEIGHT = 0.5;

// famous people who have "actor" in Wikidata but are known for something else (directors, musicians, hosts, athletes, politicians)
const NOT_ACTORS = new Set(`Donald Trump|Alfred Hitchcock|Steven Spielberg|George Lucas|Ingmar Bergman|Harold Pinter|Peter Jackson|Stan Lee|François Truffaut|Luis Buñuel
|Leni Riefenstahl|John Ford|Sergio Leone|Miloš Forman|Oliver Stone|Mike Tyson|Shaquille O'Neal|Larry King|Naomi Campbell|Hugh Hefner|Eric Cantona|Plácido Domingo
|Gore Vidal|Jacques Prévert|Wim Wenders|Sydney Pollack|Werner Herzog|Pedro Almodóvar|Emir Kusturica|Sofia Rotaru|Philipp Kirkorov|Claudia Schiffer|Tyra Banks
|Jenna Jameson|Sasha Grey|O. J. Simpson|Michael Bay|Jim Jarmusch|Cecil B. DeMille|Ernst Lubitsch|Claude Chabrol|John Carpenter|Aki Kaurismäki|David Cronenberg
|Wes Craven|Sam Raimi|M. Night Shyamalan|Jean Renoir|Rainer Werner Fassbinder|Alejandro Jodorowsky|Sofia Coppola|Terry Gilliam|Martin Scorsese|Roman Polanski
|David Lynch|Quentin Tarantino|Dario Fo|Mick Jagger|Sting|Snoop Dogg|John Cale|Lou Reed|Iggy Pop|Jon Bon Jovi|Lenny Kravitz|Nick Cave|Domenico Modugno|Paula Abdul
|Fergie|Rita Ora|Sean Combs|Coolio|Willie Nelson|Françoise Hardy|Jay Leno|Conan O'Brien|Jimmy Kimmel|Garry Marshall|Spike Lee|Taylor Swift|Britney Spears|Ariana Grande
|Bob Dylan|Paul McCartney|John Lennon|George Harrison|Elton John|Eminem|Johnny Cash|Stephen King|Walt Disney|James Cameron|Jean Cocteau|Pablo Picasso|Salvador Dalí
|Kareem Abdul-Jabbar|Ronald Reagan|Nancy Reagan|Louis Armstrong|Édith Piaf|Beyoncé|50 Cent|Prince|Dolly Parton|Charles Aznavour|George Carlin|Corbin Bleu|Madonna|Miley|Miley Cyrus|Kylie Minogue|Mariah Carey|Janet Jackson|Tupac Shakur|David Bowie|Ellen DeGeneres|Oprah Winfrey|Paris Hilton`.split('|').map((x) => x.trim()));
const BY_ISO = {};
for (const [en, [iso, ru, region]] of Object.entries(COUNTRIES)) if (!BY_ISO[iso]) BY_ISO[iso] = { en, ru, region };
const commonsPath = (file) => {
  const name = decodeURIComponent(String(file).replace(/^.*Special:FilePath\//, '')).replace(/ /g, '_');
  if (!/\.(jpe?g|png|svg|webp|gif|tiff?)$/i.test(name)) return null;
  const md5 = createHash('md5').update(name).digest('hex');
  return `${md5[0]}/${md5.slice(0, 2)}/${name}`;
};

// genre labels (English, from Wikidata) -> one of our genres; the order breaks ties
const GENRES = [
  ['Мультфильм', /animat|anime|cartoon/i], ['Ужасы', /horror|slasher|zombie|vampire/i], ['Фантастика', /science fiction|sci-fi|cyberpunk|superhero|space opera|dystopi/i],
  ['Фэнтези', /fantasy|sword and sorcery/i], ['Вестерн', /western/i], ['Военный', /\bwar\b|military/i], ['Мюзикл', /musical|music film|dance film/i],
  ['Криминал', /crime|gangster|heist|mafia|noir|detective|police/i], ['Триллер', /thriller|suspense|mystery|spy/i], ['Боевик', /action|martial arts|wuxia|disaster/i],
  ['Приключения', /adventure|swashbuckler/i], ['Мелодрама', /romance|romantic|melodrama/i], ['Комедия', /comedy|comedic|parody|satir|farce|black humor/i],
  ['Драма', /drama/i],
];
const ORDER = GENRES.map((g) => g[0]);
const genreOf = (q) => { const l = raw.genres[q]; if (!l) return null; const m = GENRES.find(([, re]) => re.test(l)); return m ? m[0] : null; };

const filmInfo = new Map();
// documentaries and concert films are left out: politicians, artists and singers appear there as themselves (or in archive footage)
const NOT_ACTING = /documentary|concert|mockumentary|reality|newsreel|compilation/i;
for (const [f, sl, en, ru, gs] of raw.finfo) {
  const qs = String(gs || '').split('|').filter(Boolean);
  if (qs.some((q) => NOT_ACTING.test(raw.genres[q] || '') && !/mockumentary/i.test(raw.genres[q]))) continue;
  filmInfo.set(f, { sl: +sl, en, ru, genres: [...new Set(qs.map(genreOf).filter(Boolean))] });
}

const people = new Map();
for (const r of raw.people) {
  const o = people.get(r.p) || { ...r, bpcs: new Set() };
  if (r.bpc) o.bpcs.add(r.bpc);
  if (!r.en && MUL[r.p]) r.en = MUL[r.p];
  for (const k of ['en', 'ru', 'b', 'd', 'sex', 'img']) if (!o[k] && r[k]) o[k] = r[k];
  people.set(r.p, o);
}
const filmsOf = new Map();
for (const [p, f, y] of raw.films) { if (!filmsOf.has(p)) filmsOf.set(p, []); filmsOf.get(p).push([f, y ? +y : null]); }
const oscar = new Map();
for (const [p, k] of raw.osc) if (k === 'w' || !oscar.has(p)) oscar.set(p, k);

// non-binary and genderfluid people (as Wikidata gives them) are "Другое"
const SEX = { Q6581097: 'М', Q6581072: 'Ж', Q2449503: 'М', Q1052281: 'Ж', Q48270: 'Другое', Q18116794: 'Другое', Q12964198: 'Другое' };
const RUSSIA = 'Q159', USSR = ['Q15180', 'Q34266', 'Q2184', 'Q2305208'];  // USSR, Russian Empire, RSFSR, Russian SFSR (birth country unclear)
const skipped = { russia: 0, country: 0, films: 0, notActor: 0, other: 0 };
const list = [];
for (const o of people.values()) {
  if (o.bpcs.has(RUSSIA)) { skipped.russia++; continue; }
  const isos = [...o.bpcs].filter((q) => !USSR.includes(q)).map((q) => raw.countries[q]).filter((c) => c && BY_ISO[c]);
  // several countries for one birth place (border changes): the first known one wins; only Soviet/imperial names = unclear, skip
  if (!isos.length) { skipped.country++; continue; }
  const sex = SEX[o.sex];
  const byear = o.b ? +String(o.b).slice(0, 4) : null;
  if (NOT_ACTORS.has(o.en)) { skipped.notActor++; continue; }
  if (!sex || !byear || byear < 1880 || byear > YEAR - 8 || !o.en) { skipped.other++; continue; }
  const fl = (filmsOf.get(o.p) || []).filter(([f]) => filmInfo.has(f));
  // films after this year are only announced, and films long after the actor's death use archive footage: neither is counted
  const dyear = o.d ? +String(o.d).slice(0, 4) : null;
  const done = fl.filter(([, y]) => !y || (y <= YEAR && (!dyear || y <= dyear + 2)));
  const years = done.map(([, y]) => y).filter((y) => y && y >= byear + 2);
  if (done.length < MIN_FILMS || !years.length) { skipped.films++; continue; }
  const cnt = {};
  // well-known films count more (Wikipedia articles), so the genre is the one people remember the actor for
  for (const [f] of done) { const fi = filmInfo.get(f); for (const g of fi.genres) cnt[g] = (cnt[g] || 0) + Math.sqrt(fi.sl + 1); }
  // "drama" is given to almost every film, so it only wins when it clearly leads
  if (cnt['Драма']) cnt['Драма'] *= DRAMA_WEIGHT;
  const genre = Object.entries(cnt).sort((a, b) => b[1] - a[1] || ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]))[0]?.[0] || 'Драма';
  const c = BY_ISO[isos[0]];
  const known = [...done].sort((a, b) => filmInfo.get(b[0]).sl - filmInfo.get(a[0]).sl).slice(0, 3).map(([f]) => filmInfo.get(f).ru || filmInfo.get(f).en).filter(Boolean);
  list.push({
    id: o.p, name: o.en, ru: o.ru && o.ru !== o.en ? o.ru : '', cc: isos[0], country: c.ru, region: c.region || null, sex, byear,
    birth: String(o.b).slice(0, 10), dead: !!o.d, films: done.map(([f]) => f), count: done.length, debut: Math.min(...years), last: Math.max(...years), genre,
    oscar: oscar.get(o.p) === 'w' ? 'Есть' : oscar.get(o.p) === 'n' ? 'Номинация' : 'Нет', known,
    fame: +o.sl, img: o.img && commonsPath(o.img),
  });
}
list.sort((a, b) => b.fame - a.fame || a.id.localeCompare(b.id));
const chosen = list.slice(0, SIZE);
// films as small numbers: only the films of the chosen actors, so "shared films" can be compared in the browser
const fidx = new Map();
for (const a of chosen) for (const f of a.films) if (!fidx.has(f)) fidx.set(f, fidx.size);
const items = chosen.map((a) => ({
  id: a.id, name: a.name, sub: [a.country, a.ru].filter(Boolean).join(' · '), alias: a.ru ? [a.ru] : [],
  sex: a.sex, cc: a.cc, country: a.country, region: a.region, byear: a.byear, count: a.count, debut: a.debut, last: a.last, genre: a.genre, oscar: a.oscar,
  films: [...new Set(a.films.map((f) => fidx.get(f)))], fame: a.fame, url: `https://www.wikidata.org/wiki/${a.id}`,
  ...(IMG.actors[a.id] ? { img: IMG.actors[a.id].src } : a.img ? { img: a.img } : {}),
}));
// film pictures for the "shared films" column: index -> [path, name, rank by fame]
const filmImg = {};
for (const [f, i] of fidx) if (IMG.films[f]) { const fi = filmInfo.get(f); filmImg[i] = [IMG.films[f].src, fi.ru || fi.en, -fi.sl]; }
const HOW = 'Зелёный — совпало, жёлтый — близко (тот же регион мира, ±2 года, ±5 фильмов, есть общие фильмы), стрелка — больше или меньше.';
const data = {
  modeTitle: 'Актёры', nameTitle: 'Актёр', placeholder: 'Имя актёра или актрисы…',
  intro: `Угадайте актёра или актрису по полу, стране рождения, году рождения, числу фильмов, году дебюта и последнего фильма, главному жанру, «Оскару» и общим фильмам с загаданным. ${HOW}`,
  source: `Wikidata (CC0), ${today}`, pool: 'top', topCount: TOP, imgWm: true,
  columns: [
    { key: 'sex', title: 'Пол', type: 'cat' },
    { key: 'country', title: 'Страна рождения', type: 'cat', nearKey: 'region', flag: 'cc' },
    { key: 'byear', title: 'Год рождения', type: 'num', near: 2 },
    { key: 'count', title: 'Фильмов', type: 'num', near: 5 },
    { key: 'debut', title: 'Дебют', type: 'num', near: 2 },
    { key: 'last', title: 'Последний фильм', type: 'num', near: 2 },
    { key: 'genre', title: 'Главный жанр', type: 'cat' },
    { key: 'oscar', title: '«Оскар»', type: 'cat' },
    { key: 'films', title: 'Общих фильмов', type: 'shared' },
  ],
  filmImg,
  items,
};
writeFileSync(ROOT + 'public/data/actors-items.json', JSON.stringify(data));
const by = (k) => Object.entries(items.reduce((m, x) => ((m[x[k]] = (m[x[k]] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
console.log(`actors: ${items.length} of ${list.length} candidates, photos ${items.filter((x) => x.img).length}, films ${fidx.size}; skipped`, skipped);
console.log('sex', by('sex'), '\noscar', by('oscar'), '\ngenre', by('genre'), '\ncountries', by('country').slice(0, 25));

// ---------- the same actors as a "player" dataset for the grid and the chain: films play the part of teams ----------
// Only films with two or more of the chosen actors matter (a shared film links two actors; a grid row needs several).
{
  const cast = new Map();
  for (const a of chosen) for (const f of new Set(a.films)) { if (!cast.has(f)) cast.set(f, []); cast.get(f).push(a); }
  const shared = [...cast.entries()].filter(([f, l]) => l.length >= 2 && (filmInfo.get(f).ru || filmInfo.get(f).en)).sort((x, y) => filmInfo.get(y[0]).sl - filmInfo.get(x[0]).sl);
  const tidx = new Map(shared.map(([f], i) => [f, i]));
  const teams = shared.map(([f]) => { const fi = filmInfo.get(f); return fi.ru || fi.en || f; });
  writeFileSync(ROOT + 'data/raw/actors-film-qids.json', JSON.stringify(shared.map(([f]) => f)));
  const logos = {};
  shared.forEach(([f], i) => { if (IMG.films[f]) logos[i] = IMG.films[f].src; });
  const year = new Map();
  for (const [p, f, y] of raw.films) if (tidx.has(f) && y && (!year.has(f) || y < year.get(f))) year.set(f, +y);
  const pidx = new Map(chosen.map((a, i) => [a.id, i]));
  const genreNo = Object.fromEntries(ORDER.map((g, i) => [g, i + 1]));
  const players = chosen.map((a, i) => {
    const films = [...new Set(a.films)].filter((f) => tidx.has(f));
    const mates = [];
    for (const f of films) for (const b of cast.get(f)) if (b.id !== a.id) { const y = year.get(f) || 0; mates.push([pidx.get(b.id), tidx.get(f), y, y]); }
    // one link per co-star: their best-known shared film
    const best = new Map();
    for (const m of mates) if (!best.has(m[0]) || m[1] < best.get(m[0])[1]) best.set(m[0], m);
    const c = BY_ISO[a.cc];
    return {
      id: a.name, name: a.ru || a.name, url: `https://www.wikidata.org/wiki/${a.id}`, cc: a.cc, country: a.country, countryEn: c.en, region: a.region,
      birth: a.birth, status: a.dead ? 'retired' : 'active', team: null, last: null, pos: genreNo[a.genre], roles: [], events: a.count, fame: a.fame,
      oscar: a.oscar === 'Есть' ? 2 : a.oscar === 'Номинация' ? 1 : 0, sex: a.sex, teams: films.map((f) => tidx.get(f)).sort((x, y) => x - y), top: i < TOP,
      mates: [...best.values()].sort((x, y) => x[0] - y[0]), era: [], eraTeams: {}, ...(IMG.actors[a.id] ? { ph: IMG.actors[a.id].src } : a.img ? { ph: a.img } : {}),
    };
  });
  const out = { game: 'actors', title: 'Актёры', eventLabel: 'Фильмов', generated: today, source: { name: 'Wikidata', license: 'CC0', url: 'https://www.wikidata.org/' },
    sourceNote: 'Самые известные актёры и актрисы (Wikidata)', regions: REGIONS, genres: ORDER, teams, logos, players };
  writeFileSync(ROOT + 'public/data/actors.json', JSON.stringify(out));
  const links = players.reduce((n, p) => n + p.mates.length, 0) / 2;
  console.log(`actors (grid/chain): ${players.length} actors, ${teams.length} shared films, ${links} co-star links, alone ${players.filter((p) => !p.mates.length).length}`);
}

// ---------- credits page for the photos and film pictures stored in the site (authors and licences, as Commons asks) ----------
{
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const byQ = new Map(list.map((a) => [a.id, a]));
  const row = (who, m) => `<li><b>${esc(who)}</b>: <a href="${esc(m.page)}" rel="noopener">${esc(m.file)}</a>${m.artist ? `, ${esc(m.artist)}` : ''}${m.lic ? `, ${m.licUrl ? `<a href="${esc(m.licUrl)}" rel="noopener">${esc(m.lic)}</a>` : esc(m.lic)}` : ''}</li>`;
  const actors = Object.entries(IMG.actors).filter(([q]) => byQ.has(q)).map(([q, m]) => row(byQ.get(q).name, m));
  const films = Object.entries(IMG.films).filter(([q]) => filmInfo.has(q)).map(([q, m]) => row(filmInfo.get(q).en || filmInfo.get(q).ru || q, m));
  if (actors.length || films.length) {
    const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'none'">
  <title>Фото актёров и картинки фильмов / Actor photos and film images — WhoAmIGuess</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="top"><div class="wrap top-inner"><a class="logo" href="./"><span class="logo-mark">?</span><span>Who Am I <b>Guess</b></span></a><a class="muted" href="./">← На сайт / Back</a></div></header>
  <main class="wrap legal">
    <h1>Фото актёров и картинки фильмов</h1>
    <p>Все изображения взяты с <a href="https://commons.wikimedia.org/" rel="noopener">Wikimedia Commons</a> (выбраны через Wikidata), уменьшены и хранятся на сайте. Ниже для каждого файла указаны страница на Commons, автор и лицензия. Логотипы и постеры фильмов остаются товарными знаками или произведениями их правообладателей и показываются только для узнавания фильма. Если вы правообладатель и хотите убрать изображение, напишите нам (контакты на странице <a href="terms.html">Условия</a>).</p>
    <p class="muted">All images come from Wikimedia Commons (selected via Wikidata), downsized and stored on this site. The Commons page, author and licence of each file are listed below. Updated ${today}.</p>
    <h2>Актёры / Actors (${actors.length})</h2>
    <ul>${actors.join('\n')}</ul>
    <h2>Фильмы / Films (${films.length})</h2>
    <ul>${films.join('\n')}</ul>
  </main>
</body>
</html>
`;
    writeFileSync(ROOT + 'public/credits-actors.html', html);
    console.log(`credits: ${actors.length} actor photos, ${films.length} film images`);
  }
}
