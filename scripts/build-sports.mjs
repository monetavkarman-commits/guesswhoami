// Builds sport datasets (football, basketball, tennis) from Wikidata query results cached in data/raw/<sport>-wd.json.
// Wikidata is CC0. Raw format: { list: [{p, sl, b}], teams: [[player, team, teamLabel, isNational, start 'YYYY-MM', end 'YYYY-MM']],
// info: [{p, en, ru, b, cc, ccs, pos, hand, start, sex?, h?}] } (several info rows per player when a property has several values).
//
//   node scripts/build-sports.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { COUNTRIES, REGIONS } from './countries.mjs';
import { bestOverlap } from './overlap.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const today = new Date().toISOString().slice(0, 10);
const SOURCE = { name: 'Wikidata', license: 'CC0', url: 'https://www.wikidata.org/' };
const BY_ISO = {};
for (const [en, [iso, ru, region]] of Object.entries(COUNTRIES)) if (!BY_ISO[iso]) BY_ISO[iso] = { en, ru, region };
const NOW = +today.slice(0, 4) * 100 + +today.slice(5, 7);
const ym = (s) => (s && /^\d{4}-\d\d/.test(s) ? +s.slice(0, 4) * 100 + +s.slice(5, 7) : null);

// Pictures are never copied: Wikidata gives the Commons file (P18 photo, P154 logo) and the page loads a small thumbnail from
// upload.wikimedia.org. A path "a/ab/File.jpg" is where Commons keeps the file (first characters of the MD5 of its name).
// data/raw/sport-images.json = { p: {playerQ: file}, t: {teamQ: file} } is fetched from Wikidata by the queries in data/raw/sport-qids.json.
const IMGS = existsSync(ROOT + 'data/raw/sport-images.json') ? JSON.parse(readFileSync(ROOT + 'data/raw/sport-images.json', 'utf8')) : { p: {}, t: {} };
const commonsPath = (file) => {
  const name = decodeURIComponent(String(file).replace(/^.*Special:FilePath\//, '')).replace(/ /g, '_');
  if (!/\.(jpe?g|png|svg|webp|gif)$/i.test(name)) return null;
  const md5 = createHash('md5').update(name).digest('hex');
  return `${md5[0]}/${md5.slice(0, 2)}/${name}`;
};
const QIDS = { football: { p: [], t: {} }, hockey: { p: [], t: {} }, basket: { p: [], t: {} }, tennis: { p: [], t: {} } };

function load(sport) {
  const f = ROOT + `data/raw/${sport}-wd.json`;
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
}

// one record per player from the (possibly repeated) info rows
// labels that only exist as the language-neutral "mul" label on Wikidata (e.g. Stephen Curry, Roger Federer)
const MUL = existsSync(ROOT + 'data/raw/mul-labels.json') ? JSON.parse(readFileSync(ROOT + 'data/raw/mul-labels.json', 'utf8')) : {};

function merge(raw, posOf) {
  const sl = new Map(raw.list.map((x) => [x.p, +x.sl]));
  const out = new Map();
  for (const r of raw.info) {
    const o = out.get(r.p) || { p: r.p, en: r.en || MUL[r.p], ru: r.ru, b: r.b, ccs: new Set(), cc: new Set(), pos: {}, hands: new Set(), start: r.start, sex: r.sex, h: r.h, sl: sl.get(r.p) || 0 };
    if (r.hand) o.hands.add(r.hand);
    if (r.ccs) o.ccs.add(r.ccs); if (r.cc) o.cc.add(r.cc);
    const p = posOf ? POS_FIX[r.p] || posOf(r.pos) : null; if (p) o.pos[p] = (o.pos[p] || 0) + 1;
    if (r.start && (!o.start || r.start < o.start)) o.start = r.start;
    out.set(r.p, o);
  }
  return out;
}

function country(o, missing) {
  const iso = [...o.ccs][0] || [...o.cc][0];
  const c = iso && BY_ISO[iso];
  if (!c) { if (iso) missing.add(iso); return { cc: (iso || '').toLowerCase() === 'xx' ? '' : iso || '', country: '—', countryEn: '—', region: '' }; }
  return { cc: iso, country: c.ru, countryEn: c.en, region: c.region };
}

function buildTeamSport({ sport, title, sourceNote, eventLabel, posOf, topShare, eras, minOverlap = 6, keepTeam = () => true, needPos = false }) {
  const raw = load(sport); if (!raw) return null;
  const missing = new Set();
  const people = merge(raw, posOf);
  const teamList = []; const teamIdx = new Map();
  const T = (label) => { if (!teamIdx.has(label)) { teamIdx.set(label, teamList.length); teamList.push(label); } return teamIdx.get(label); };

  // stints per player: clubs only (national and youth teams are left out: "country" already covers them)
  const stintsBy = new Map(); const nameQ = new Map();
  for (const [p, team, label, nat, s, e] of raw.teams) {
    if (nat || !label || /^Q\d+$/.test(label) || /national|olympic/i.test(label) || YOUTH.test(label) || !keepTeam(label)) continue;
    if (!nameQ.has(clubName(label))) nameQ.set(clubName(label), team);
    const list = stintsBy.get(p) || []; list.push({ team: clubName(label), s: ym(s), e: ym(e) }); stintsBy.set(p, list);
  }
  const players = [];
  for (const o of people.values()) {
    const raw = (stintsBy.get(o.p) || []).filter((x) => x.s);
    // de-duplicate repeated rows, then close open-ended old stints at the player's next stint
    const uniq = [...new Map(raw.map((x) => [`${x.team}|${x.s}|${x.e}`, x])).values()].sort((a, b) => a.s - b.s);
    // open-ended stints: closed by the next stint; the last one counts as current only for players young enough to still play
    const young = o.b && +o.b.slice(0, 4) >= 1984;
    // later stints that have an end date are usually loans, so they do not end the parent contract
    // (e.g. Saliba: Arsenal from 2019, loans to Saint-Étienne, Nice and Marseille, still at Arsenal)
    uniq.forEach((x) => {
      if (x.e) return;
      const later = uniq.filter((y) => y.s > x.s);
      const nextOpen = later.find((y) => !y.e);
      if (nextOpen) x.e = nextOpen.s;
      else if (young || x.s >= 201600) x.e = 209912;
      else x.e = Math.max(x.s + 200, ...later.map((y) => y.e || 0));
    });
    if (!uniq.length || !o.en) continue;
    if (sport === 'football' && ([...o.ccs][0] || [...o.cc][0]) === 'JP') continue; // owner's request: no Japanese footballers
    if (needPos && !Object.keys(o.pos).length) continue; // e.g. officials or actors listed as footballers
    const stints = uniq.map((x) => [T(x.team), x.s, x.e]);
    const current = uniq.filter((x) => x.e >= NOW).sort((a, b) => b.s - a.s)[0];
    const best = Object.entries(o.pos).sort((a, b) => b[1] - a[1])[0];
    players.push({
      id: latin(o.en), name: o.ru && o.ru !== o.en ? o.ru : '', url: `https://www.wikidata.org/wiki/${o.p}`,
      ...country(o, missing), birth: o.b || null,
      status: current || uniq.some((x) => x.e >= NOW - 100) ? 'active' : 'retired',
      team: current ? current.team : null, last: uniq.length ? uniq[uniq.length - 1].team : null, ...(best ? { pos: +best[0] } : {}), roles: [],
      events: new Set(stints.map((x) => x[0])).size, fame: o.sl,
      teams: [...new Set(stints.map((x) => x[0]))], _stints: stints,
    });
  }
  // the daily pool ("top") is the best-known share of players, by number of Wikipedia articles about them
  const cut = [...players].sort((a, b) => b.fame - a.fame)[Math.floor(players.length * topShare)]?.fame ?? 0;
  players.forEach((p) => { p.top = p.fame > cut; });
  players.forEach((a) => {
    a.mates = [];
    players.forEach((b, j) => {
      if (a === b) return;
      const hit = bestOverlap(a._stints, b._stints, (s, e) => monthsBetween(s, e) >= minOverlap);
      if (hit) a.mates.push(hit.map((x, k) => (k ? x : j)));
    });
  });
  players.forEach((p) => {
    p.era = []; p.eraTeams = {};
    for (const [k, { test }] of Object.entries(eras)) {
      const ts = [...new Set(p._stints.filter(([, s, e]) => test(s, e)).map(([t]) => t))];
      p.eraTeams[k] = ts; if (ts.length) p.era.push(k);
    }
    delete p._stints;
  });
  // photos and club logos (when data/raw/sport-images.json has them)
  players.forEach((p) => {
    const q = p.url.split('/').pop(); QIDS[sport].p.push(q);
    const ph = IMGS.p[q] && commonsPath(IMGS.p[q]); if (ph) p.ph = ph;
  });
  const logos = {};
  teamList.forEach((n, i) => {
    const q = nameQ.get(n); if (!q) return; QIDS[sport].t[q] = n;
    const lg = IMGS.t[q] && commonsPath(IMGS.t[q]); if (lg) logos[i] = lg;
  });
  // hand-supplied logos (public/img/teams, data/logos-local.json) where Commons has none
  const local = existsSync(ROOT + 'data/logos-local.json') ? JSON.parse(readFileSync(ROOT + 'data/logos-local.json', 'utf8'))[sport] || {} : {};
  teamList.forEach((t, i) => { if (!logos[i] && local[t]) logos[i] = local[t]; });
  console.log(`  ${sport}: photos ${players.filter((p) => p.ph).length}/${players.length}, logos ${Object.keys(logos).length}/${teamList.length}`);
  return { missing, out: { game: sport, title, eventLabel, generated: today, source: SOURCE, sourceNote, regions: REGIONS, teams: teamList, logos, players } };
}
// club names: drop legal suffixes so "Real Madrid Club de Fútbol" and "Real Madrid CF" become one club
const CLUB = { 'Real Madrid Club de Fútbol': 'Real Madrid', 'Paris Saint-Germain FC': 'Paris Saint-Germain', 'Clube de Regatas do Flamengo': 'Flamengo',
  'S.C. Corinthians Paulista': 'Corinthians', 'Club Atlético River Plate': 'River Plate', 'Club Atlético Boca Juniors': 'Boca Juniors',
  'Fenerbahçe Istanbul': 'Fenerbahçe', 'Parma Calcio 1913': 'Parma', 'S.L. Benfica': 'Benfica', 'U.C. Sampdoria': 'Sampdoria',
  'FC Bayern Munich': 'Bayern Munich', 'Inter Milan': 'Inter', 'Genoa CFC': 'Genoa', 'Galatasaray S.K.': 'Galatasaray', 'Beşiktaş J.K.': 'Beşiktaş' };
const clubName = (l) => CLUB[l] || l.replace(/\s+(F\.C\.|FC|A\.F\.C\.|AFC|C\.F\.|CF|S\.K\.|J\.K\.|F\.K\.|FK)$/, '').trim();
const YOUTH = /\b(II|III|B|C)$|youth|academy|reserve|juvenil|castilla|atlètic|^jong |primavera|under-?\d|\bU-?\d{2}\b|amateur|men's basketball|college|university/i;
// Wikidata labels sometimes carry Greek or Cyrillic look-alike letters (e.g. a Greek capital alpha in "Arda Güler"),
// which break search; in a Latin name they are swapped for the Latin letter.
const GLYPHS = { 'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X',
  'ο': 'o', 'ν': 'v', 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X',
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i' };
function latin(s) {
  if (!s || !/[A-Za-z]/.test(s)) return s;
  return s.replace(/[\u0370-\u03ff\u0400-\u04ff]/g, (c) => GLYPHS[c] || c);
}
const monthsBetween = (a, b) => (Math.floor(b / 100) - Math.floor(a / 100)) * 12 + (b % 100) - (a % 100);

const footballPos = (l) => { l = (l || '').toLowerCase(); if (!l) return null;
  if (/goalkeeper|goaltender/.test(l)) return 1; if (/back|defender|sweeper|libero|stopper/.test(l)) return 2;
  if (/midfield|playmaker|centerhalf/.test(l)) return 3;
  // Wikidata labels the winger position of many modern players (Neymar, Bale, Di María) as "wing half"
  if (/forward|striker|winger|attacker|wing half/.test(l)) return 4; return null; };
// a few star players whose position on Wikidata is broken (e.g. Lewandowski's reads "gate")
const POS_FIX = { Q151269: 4, Q196219: 3 };
const basketPos = (l) => { l = (l || '').toLowerCase(); if (!l) return null;
  if (l.includes('point guard')) return 1; if (l.includes('shooting guard')) return 2; if (l.includes('small forward')) return 3;
  if (l.includes('power forward')) return 4; if (l.includes('center') || l.includes('centre')) return 5;
  if (l.includes('guard')) return 2; if (l.includes('forward')) return 3; return null; };

const builds = [
  ['football', () => buildTeamSport({
    sport: 'football', title: 'Футбол', eventLabel: 'Клубов', posOf: footballPos, topShare: 0.3, needPos: true,
    sourceNote: 'Известные футболисты 1965 г. р. и младше (Wikidata)',
    eras: { early: { test: (s) => s < 201000 }, late: { test: (s, e) => e >= 201600 } },
  })],
  ['basket', () => buildTeamSport({
    sport: 'basket', title: 'Баскетбол', eventLabel: 'Клубов', posOf: basketPos, topShare: 0.5, needPos: true,
    sourceNote: 'Известные баскетболисты 1965 г. р. и младше (Wikidata)',
    eras: { early: { test: (s) => s < 201000 }, late: { test: (s, e) => e >= 201600 } },
  })],
];
for (const [name, fn] of builds) {
  const r = fn(); if (!r) { console.log(name, 'no raw data'); continue; }
  writeFileSync(ROOT + `public/data/${name}.json`, JSON.stringify(r.out));
  const P = r.out.players;
  console.log(`${name}: ${P.length} players, ${r.out.teams.length} teams, top ${P.filter((p) => p.top).length}, with team now ${P.filter((p) => p.team).length}, with pos ${P.filter((p) => p.pos).length}`);
  if (r.missing.size) console.warn('  ISO codes missing from countries.mjs:', [...r.missing].join(', '));
}

// ---------- tennis: no teams, so it is an item-style guessing game ----------
{
  const raw = load('tennis');
  if (raw) {
    const missing = new Set();
    const people = merge(raw, null);
    const HAND = { Q3039938: 'Правая', Q789447: 'Левая' };
    const BACKHAND = { Q14420039: 'Одноручный', Q14420068: 'Двуручный' };
    const items = [];
    for (const o of people.values()) {
      if (!o.en || !o.b || !o.sex || !(o.hands.size || o.start)) continue;
      const c = country(o, missing);
      items.push({
        id: o.p, name: latin(o.en), sub: [c.country, o.ru && o.ru !== o.en ? o.ru : ''].filter((x) => x && x !== '—').join(' · '),
        alias: o.ru && o.ru !== o.en ? [o.ru] : [],
        tour: o.sex === 'Q6581072' ? 'WTA' : o.sex === 'Q6581097' ? 'ATP' : null,
        country: c.country === '—' ? null : c.country, region: c.region || null,
        hand: [...o.hands].map((x) => HAND[x]).find(Boolean) || null, backhand: [...o.hands].map((x) => BACKHAND[x]).find(Boolean) || null, byear: +o.b.slice(0, 4),
        height: o.h ? Math.round(+o.h < 3 ? +o.h * 100 : +o.h) : null,
        pro: o.start ? +o.start : null, fame: o.sl,
        url: `https://www.wikidata.org/wiki/${o.p}`,
        ...(IMGS.p[o.p] && commonsPath(IMGS.p[o.p]) ? { img: commonsPath(IMGS.p[o.p]) } : {}),
      });
      QIDS.tennis.p.push(o.p);
    }
    items.sort((a, b) => b.fame - a.fame);
    const data = {
      modeTitle: 'Игроки', nameTitle: 'Теннисист', placeholder: 'Имя теннисиста…',
      intro: 'Угадайте теннисиста по туру, стране, рабочей руке, бэкхенду, году рождения, росту и началу карьеры. Зелёный — совпало, жёлтый — близко (тот же регион, ±2 года, ±5 см), стрелка — больше или меньше.',
      source: `Wikidata (CC0), ${today}`,
      pool: 'top', topCount: 150,
      columns: [
        { key: 'tour', title: 'Тур', type: 'cat' },
        { key: 'country', title: 'Страна', type: 'cat', nearKey: 'region' },
        { key: 'hand', title: 'Рука', type: 'cat' },
        { key: 'backhand', title: 'Бэкхенд', type: 'cat' },
        { key: 'byear', title: 'Год рождения', type: 'num', near: 2 },
        { key: 'height', title: 'Рост', type: 'num', near: 5, unit: ' см' },
        { key: 'pro', title: 'Начало карьеры', type: 'num', near: 2 },
      ],
      items,
    };
    data.imgWm = true; // item pictures are Wikimedia Commons paths
    writeFileSync(ROOT + 'public/data/tennis-items.json', JSON.stringify(data));
    console.log(`  tennis photos ${items.filter((x) => x.img).length}/${items.length}`);
    console.log(`tennis: ${items.length} players, with hand ${items.filter((x) => x.hand).length}, height ${items.filter((x) => x.height).length}, pro ${items.filter((x) => x.pro).length}`);
    if (missing.size) console.warn('  ISO codes missing from countries.mjs:', [...missing].join(', '));
  }
}
writeFileSync(ROOT + 'data/raw/sport-qids.json', JSON.stringify(QIDS));
