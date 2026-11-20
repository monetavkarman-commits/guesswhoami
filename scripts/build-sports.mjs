// Builds sport datasets (football, basketball, F1, tennis) from Wikidata query results cached in data/raw/<sport>-wd.json.
// Wikidata is CC0. Raw format: { list: [{p, sl, b}], teams: [[player, team, teamLabel, isNational, start 'YYYY-MM', end 'YYYY-MM']],
// info: [{p, en, ru, b, cc, ccs, pos, hand, start, sex?, h?}] } (several info rows per player when a property has several values).
//
//   node scripts/build-sports.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { COUNTRIES, REGIONS } from './countries.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const today = new Date().toISOString().slice(0, 10);
const SOURCE = { name: 'Wikidata', license: 'CC0', url: 'https://www.wikidata.org/' };
const BY_ISO = {};
for (const [en, [iso, ru, region]] of Object.entries(COUNTRIES)) if (!BY_ISO[iso]) BY_ISO[iso] = { en, ru, region };
const NOW = +today.slice(0, 4) * 100 + +today.slice(5, 7);
const ym = (s) => (s && /^\d{4}-\d\d/.test(s) ? +s.slice(0, 4) * 100 + +s.slice(5, 7) : null);

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
    const p = posOf ? posOf(r.pos) : null; if (p) o.pos[p] = (o.pos[p] || 0) + 1;
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
  const stintsBy = new Map();
  for (const [p, team, label, nat, s, e] of raw.teams) {
    if (nat || !label || /^Q\d+$/.test(label) || /national|olympic/i.test(label) || YOUTH.test(label) || !keepTeam(label)) continue;
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
    if (needPos && !Object.keys(o.pos).length) continue; // e.g. officials or actors listed as footballers
    const stints = uniq.map((x) => [T(x.team), x.s, x.e]);
    const current = uniq.filter((x) => x.e >= NOW).sort((a, b) => b.s - a.s)[0];
    const best = Object.entries(o.pos).sort((a, b) => b[1] - a[1])[0];
    players.push({
      id: o.en, name: o.ru && o.ru !== o.en ? o.ru : '', url: `https://www.wikidata.org/wiki/${o.p}`,
      ...country(o, missing), birth: o.b || null,
      status: current || uniq.some((x) => x.e >= NOW - 100) ? 'active' : 'retired',
      team: current ? current.team : null, ...(best ? { pos: +best[0] } : {}), roles: [],
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
      const hit = a._stints.find(([t, s, e]) => b._stints.some(([t2, s2, e2]) => t === t2 && monthsBetween(Math.max(s, s2), Math.min(e, e2)) >= minOverlap));
      if (hit) a.mates.push([j, hit[0]]);
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
  return { missing, out: { game: sport, title, eventLabel, generated: today, source: SOURCE, sourceNote, regions: REGIONS, teams: teamList, players } };
}
// club names: drop legal suffixes so "Real Madrid Club de Fútbol" and "Real Madrid CF" become one club
const CLUB = { 'Real Madrid Club de Fútbol': 'Real Madrid', 'Paris Saint-Germain FC': 'Paris Saint-Germain', 'Clube de Regatas do Flamengo': 'Flamengo',
  'S.C. Corinthians Paulista': 'Corinthians', 'Club Atlético River Plate': 'River Plate', 'Club Atlético Boca Juniors': 'Boca Juniors',
  'Fenerbahçe Istanbul': 'Fenerbahçe', 'Parma Calcio 1913': 'Parma', 'S.L. Benfica': 'Benfica', 'U.C. Sampdoria': 'Sampdoria',
  'FC Bayern Munich': 'Bayern Munich', 'Inter Milan': 'Inter', 'Genoa CFC': 'Genoa', 'Galatasaray S.K.': 'Galatasaray', 'Beşiktaş J.K.': 'Beşiktaş' };
const clubName = (l) => CLUB[l] || l.replace(/\s+(F\.C\.|FC|A\.F\.C\.|AFC|C\.F\.|CF|S\.K\.|J\.K\.)$/, '').trim();
const YOUTH = /\b(II|III|B|C)$|youth|academy|reserve|juvenil|castilla|atlètic|^jong |primavera|under-?\d|\bU-?\d{2}\b|amateur|men's basketball|college|university/i;
const monthsBetween = (a, b) => (Math.floor(b / 100) - Math.floor(a / 100)) * 12 + (b % 100) - (a % 100);

const footballPos = (l) => { l = (l || '').toLowerCase(); if (!l) return null;
  if (l.includes('goalkeeper')) return 1; if (/back|defender|sweeper|libero/.test(l)) return 2;
  if (/midfield|playmaker/.test(l)) return 3; if (/forward|striker|winger|attacker/.test(l)) return 4; return null; };
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
        id: o.p, name: o.en, sub: [c.country, o.ru && o.ru !== o.en ? o.ru : ''].filter((x) => x && x !== '—').join(' · '),
        alias: o.ru && o.ru !== o.en ? [o.ru] : [],
        tour: o.sex === 'Q6581072' ? 'WTA' : o.sex === 'Q6581097' ? 'ATP' : null,
        country: c.country === '—' ? null : c.country, region: c.region || null,
        hand: [...o.hands].map((x) => HAND[x]).find(Boolean) || null, backhand: [...o.hands].map((x) => BACKHAND[x]).find(Boolean) || null, byear: +o.b.slice(0, 4),
        height: o.h ? Math.round(+o.h < 3 ? +o.h * 100 : +o.h) : null,
        pro: o.start ? +o.start : null, fame: o.sl,
        url: `https://www.wikidata.org/wiki/${o.p}`,
      });
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
    writeFileSync(ROOT + 'public/data/tennis-items.json', JSON.stringify(data));
    console.log(`tennis: ${items.length} players, with hand ${items.filter((x) => x.hand).length}, height ${items.filter((x) => x.height).length}, pro ${items.filter((x) => x.pro).length}`);
    if (missing.size) console.warn('  ISO codes missing from countries.mjs:', [...missing].join(', '));
  }
}

// ---------- Formula 1: season standings 1990–2026 from the jolpica-f1 API (Ergast successor, CC BY-NC-SA 4.0) ----------
{
  const f = ROOT + 'data/raw/f1-jolpica.json';
  if (existsSync(f)) {
    const seasons = JSON.parse(readFileSync(f, 'utf8'));
    const NAT = { Brazilian: 'BR', French: 'FR', Austrian: 'AT', British: 'GB', Belgian: 'BE', Italian: 'IT', Japanese: 'JP', Swiss: 'CH', Finnish: 'FI',
      German: 'DE', Australian: 'AU', Swedish: 'SE', Dutch: 'NL', American: 'US', Portuguese: 'PT', Monegasque: 'MC', Danish: 'DK', Canadian: 'CA',
      Argentine: 'AR', Spanish: 'ES', Colombian: 'CO', Czech: 'CZ', Malaysian: 'MY', Irish: 'IE', Hungarian: 'HU', Indian: 'IN', Polish: 'PL',
      Russian: 'RU', Mexican: 'MX', Venezuelan: 'VE', Indonesian: 'ID', 'New Zealander': 'NZ', Thai: 'TH', Chinese: 'CN' };
    const missing = new Set();
    const teamList = []; const teamIdx = new Map();
    const T = (n) => { if (!teamIdx.has(n)) { teamIdx.set(n, teamList.length); teamList.push(n); } return teamIdx.get(n); };
    const by = new Map();
    const years = Object.keys(seasons).map(Number).sort();
    const last = years[years.length - 1];
    for (const y of years) for (const d of seasons[y]) {
      const p = by.get(d.id) || { d, seasons: [], wins: 0, titles: 0, best: 99 };
      p.d = d; p.seasons.push({ y, teams: d.teams.map(T) }); p.wins += d.wins; if (d.pos === 1) p.titles++; if (d.pos && d.pos < p.best) p.best = d.pos;
      by.set(d.id, p);
    }
    const ids = [...by.keys()]; const index = new Map(ids.map((k, i) => [k, i]));
    const players = ids.map((k) => {
      const { d, seasons: ss, wins, titles } = by.get(k);
      const iso = NAT[d.nat]; const c = iso && BY_ISO[iso]; if (!c) missing.add(d.nat);
      const lastS = ss[ss.length - 1];
      return {
        id: `${d.given} ${d.family}`, name: d.code || '', url: d.url || '', cc: iso || '', country: c ? c.ru : d.nat, countryEn: c ? c.en : d.nat, region: c ? c.region : '',
        birth: d.dob || null, status: lastS.y === last ? 'active' : 'retired', team: lastS.y === last ? teamList[lastS.teams[lastS.teams.length - 1]] : null,
        roles: [], events: ss.length, wins, titles, top: ss.length >= 4 || wins > 0,
        teams: [...new Set(ss.flatMap((x) => x.teams))],
        era: [...new Set(ss.map((x) => (x.y < 2010 ? 'early' : x.y >= 2014 ? 'late' : null)).filter(Boolean))],
        eraTeams: {
          early: [...new Set(ss.filter((x) => x.y < 2010).flatMap((x) => x.teams))],
          late: [...new Set(ss.filter((x) => x.y >= 2014).flatMap((x) => x.teams))],
        },
        _ss: ss, mates: [],
      };
    });
    // teammates: same team in the same season
    for (const y of years) {
      const byTeam = new Map();
      for (const d of seasons[y]) for (const t of d.teams.map((n) => teamIdx.get(n))) { const l = byTeam.get(t) || []; l.push(index.get(d.id)); byTeam.set(t, l); }
      for (const [t, l] of byTeam) for (const a of l) for (const b of l) if (a !== b && !players[a].mates.some((m) => m[0] === b)) players[a].mates.push([b, t]);
    }
    players.forEach((p) => delete p._ss);
    const out = { game: 'f1', title: 'Формула-1', eventLabel: 'Сезонов', generated: today,
      source: { name: 'jolpica-f1 (Ergast)', license: 'CC BY-NC-SA 4.0', url: 'https://github.com/jolpica/jolpica-f1' },
      sourceNote: `Пилоты Формулы-1, сезоны ${years[0]}–${last} (jolpica-f1, CC BY-NC-SA 4.0)`, regions: REGIONS, teams: teamList, players };
    writeFileSync(ROOT + 'public/data/f1.json', JSON.stringify(out));
    console.log(`f1: ${players.length} drivers, ${teamList.length} teams, top ${players.filter((p) => p.top).length}, champions ${players.filter((p) => p.titles).length}`);
    if (missing.size) console.warn('  nationalities missing:', [...missing].join(', '));
  }
}
