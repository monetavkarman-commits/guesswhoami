// Turns cached raw Liquipedia data (data/raw/*.json) into the compact datasets the site loads
// (public/data/*.json). Never touches the network: run fetch-liquipedia.mjs first to refresh raw data.
//
//   node scripts/build-dataset.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { COUNTRIES, REGIONS } from './countries.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const today = new Date().toISOString().slice(0, 10);
const SOURCE = { name: 'Liquipedia', license: 'CC BY-SA 3.0', url: 'https://liquipedia.net/' };

const clean = (s) => (s || '').replace(/<!--.*?-->/gs, '').replace(/'''/g, '').trim();
const teamLabel = (t) => t.replace(/\s*\((?:[^)]*team|[^)]*esports)\)$/i, '').trim();

function normBirth(b) {
  const m = clean(b).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function countryOf(name, missing) {
  const n = clean(name);
  const c = COUNTRIES[n];
  if (!c) { if (n) missing.add(n); return { cc: '', country: n || '—', countryEn: n || '—', region: '' }; }
  return { cc: c[0], country: c[1], countryEn: n, region: c[2] };
}

function status(s) {
  s = clean(s).toLowerCase();
  return s === 'retired' ? 'retired' : s === 'inactive' ? 'inactive' : 'active';
}

class TeamTable {
  constructor(aliases = {}) { this.list = []; this.idx = new Map(); this.aliases = aliases; }
  id(raw) {
    const name = teamLabel(this.aliases[raw] || raw);
    if (!this.idx.has(name)) { this.idx.set(name, this.list.length); this.list.push(name); }
    return this.idx.get(name);
  }
}

// ---------- Counter-Strike ----------
function buildCS() {
  const raw = JSON.parse(readFileSync(ROOT + 'data/raw/cs.json', 'utf8'));
  const missing = new Set();
  const teams = new TeamTable({ 'mousesports': 'MOUZ', 'Team EnVyUs': 'Team Envy', 'Heroic': 'HEROIC', 'Complexity': 'Complexity Gaming' });
  const PLAYER_ROLES = ['awp', 'igl', 'rifle', 'entry', 'lurker', 'support'];

  // Team history with stint notes (data/raw/cs-th.json, {{TH|dates|team|note}} per player page).
  // Benched ("Inactive") stints are dropped: a benched player did not play for the team then.
  const th = existsSync(ROOT + 'data/raw/cs-th.json') ? JSON.parse(readFileSync(ROOT + 'data/raw/cs-th.json', 'utf8')) : {};
  const pd = (s, end) => {
    s = (s || '').trim(); if (/present/i.test(s)) return 0;
    const m = s.match(/(\d{4})-(\d\d|\?\?)/); if (!m) return end ? 0 : null;
    return +m[1] * 100 + (m[2] === '??' ? (end ? 12 : 1) : +m[2]);
  };
  let benched = 0;
  const history = (p) => {
    const lines = th[p.p]; if (!lines) return p.h.map(([t, s, e]) => [raw.teams[t], s, e]);
    const out = [];
    for (const line of lines) {
      const [dates, team, ...rest] = line.split('|');
      const note = rest.join('|').replace(/^link=[^|]*\|?/, '').trim().toLowerCase();
      const link = (rest.join('|').match(/^link=([^|]+)/) || [])[1];
      if (!['', 'loan', 'substitute', 'sub'].includes(note)) { if (note.includes('inactive')) benched++; continue; }
      const [a, b] = dates.split('—'); const st = pd(a, false); if (st === null) continue;
      out.push([(link || team).trim(), st, pd(b, true)]);
    }
    return out;
  };

  const seen = new Set();
  const players = raw.players.filter((p) => !seen.has(p.p) && seen.add(p.p)).map((p) => {
    const stints = history(p).map(([t, s, e]) => [teams.id(t), s, e || 209912]);
    let roles = p.r.filter((r) => PLAYER_ROLES.includes(r));
    if (!roles.length && p.r.some((r) => r.includes('coach'))) roles = ['coach'];
    return {
      id: p.id, name: clean(p.n), url: 'https://liquipedia.net/counterstrike/' + encodeURI(p.p.replace(/ /g, '_')),
      ...countryOf(p.c, missing), birth: normBirth(p.b), status: status(p.s),
      team: p.t ? teamLabel(clean(p.t)) : null, roles, events: p.m,
      teams: [...new Set(stints.map((s) => s[0]))], _stints: stints,
    };
  });

  // teammates: overlapping stints (at least one month) on the same team; stored as [playerIndex, teamIndex]
  players.forEach((a, i) => {
    a.mates = [];
    players.forEach((b, j) => {
      if (i === j) return;
      const hit = a._stints.find(([t, s, e]) => b._stints.some(([t2, s2, e2]) => t === t2 && Math.min(e, e2) - Math.max(s, s2) >= 1));
      if (hit) a.mates.push([j, hit[0]]);
    });
  });
  // eras: CS:GO up to Sep 2023, CS2 from Oct 2023 (a stint must last past October 2023 to count for CS2) (only real playing stints count)
  players.forEach((p) => {
    p.era = [];
    if (p._stints.some(([, st]) => st <= 202309)) p.era.push('csgo');
    if (p._stints.some(([, , e]) => e >= 202311)) p.era.push('cs2');
    // teams per era, so era filters only ask about teams the player was on during that era
    p.eraTeams = {
      csgo: [...new Set(p._stints.filter(([, st]) => st <= 202309).map(([t]) => t))],
      cs2: [...new Set(p._stints.filter(([, , e]) => e >= 202311).map(([t]) => t))],
    };
    p.top = p.events >= 2; delete p._stints;
  });

  console.log('cs: dropped', benched, 'benched stints;', Object.keys(th).length, 'histories with notes');
  return { missing, out: {
    game: 'cs', title: 'Counter-Strike', eventLabel: 'Мэйджоры', generated: today, source: SOURCE,
    sourceNote: 'Игроки 9 мэйджоров CS:GO/CS2 (Бостон 2018 – Остин 2025)', regions: REGIONS,
    teams: teams.list, players,
  } };
}

// ---------- Dota 2 ----------
const EVENT_ORDER = { 'The International/2019': 201908, 'The International/2021': 202110, 'The International/2022': 202210,
  'Riyadh Masters/2023': 202307, 'The International/2023': 202310, 'The International/2024': 202409,
  'Esports World Cup/2025': 202507, 'The International/2025': 202509 };

function buildDota() {
  const raw = JSON.parse(readFileSync(ROOT + 'data/raw/dota.json', 'utf8'));
  const missing = new Set();
  const teams = new TeamTable({ 'nouns': 'Nouns Esports', 'PVISION': 'PARIVISION' });
  const byFrom = new Map(raw.players.filter((p) => !p.missing && p.id).map((p) => [p.from, p]));
  const apps = raw.appearances.filter((a) => byFrom.has(a.pl))
    .map((a) => ({ ...a, t: teams.id(a.team), when: EVENT_ORDER[a.ev] || a.yr * 100 }));

  const keys = [...byFrom.keys()];
  const index = new Map(keys.map((k, i) => [k, i]));
  const players = keys.map((k) => {
    const p = byFrom.get(k);
    const mine = apps.filter((a) => a.pl === k).sort((x, y) => x.when - y.when);
    const posCount = {};
    mine.forEach((a) => { posCount[a.pos] = (posCount[a.pos] || 0) + 1; });
    const pos = +Object.entries(posCount).sort((a, b) => b[1] - a[1])[0][0];
    const hero = clean(p.hero);
    return {
      id: p.id, name: clean(p.name), url: 'https://liquipedia.net/dota2/' + encodeURI(p.page.replace(/ /g, '_')),
      ...countryOf(p.country, missing), birth: normBirth(p.birth), status: status(p.status),
      team: teams.list[mine[mine.length - 1].t], pos,
      hero: hero ? hero[0].toUpperCase() + hero.slice(1) : null,
      events: new Set(mine.filter((a) => a.ev.startsWith('The International')).map((a) => a.ev)).size,
      teams: [...new Set(mine.map((a) => a.t))],
      era: [...new Set(mine.map((a) => (a.yr <= 2022 ? 'early' : 'late')))],
      eraTeams: {
        early: [...new Set(mine.filter((a) => a.yr <= 2022).map((a) => a.t))],
        late: [...new Set(mine.filter((a) => a.yr > 2022).map((a) => a.t))],
      },
      mates: [],
    };
  });
  // teammates: same team at the same event; stored as [playerIndex, teamIndex]
  apps.forEach((a) => apps.forEach((b) => {
    if (a.ev === b.ev && a.t === b.t && a.pl !== b.pl) {
      const m = players[index.get(a.pl)].mates; const j = index.get(b.pl);
      if (!m.some((x) => x[0] === j)) m.push([j, a.t]);
    }
  }));
  players.forEach((p) => { p.top = p.events >= 2; });

  return { missing, out: {
    game: 'dota', title: 'Dota 2', eventLabel: 'TI', generated: today, source: SOURCE,
    sourceNote: 'Игроки TI 2019–2025, Riyadh Masters 2023 и EWC 2025', regions: REGIONS,
    teams: teams.list, players,
  } };
}

for (const [name, fn] of [['cs', buildCS], ['dota', buildDota]]) {
  const { out, missing } = fn();
  writeFileSync(ROOT + `public/data/${name}.json`, JSON.stringify(out));
  console.log(`${name}: ${out.players.length} players, ${out.teams.length} teams, daily pool ${out.players.filter((p) => p.top).length}`);
  if (missing.size) console.warn(`  countries missing from countries.mjs: ${[...missing].join(', ')}`);
}
