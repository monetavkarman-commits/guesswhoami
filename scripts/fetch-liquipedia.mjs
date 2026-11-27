// Downloads player data from the Liquipedia MediaWiki API into data/raw/*.json.
// Follows the Liquipedia API terms (https://liquipedia.net/api-terms-of-use):
//  - descriptive User-Agent with contact info (set LIQUIPEDIA_UA)
//  - gzip, batched queries (50 titles per request), at most 1 request per ~2.5 s
//  - every response is cached in data/cache/, so re-runs don't hit the API again
//
//   LIQUIPEDIA_UA="WhoAmIGuess/1.0 (https://your-site; you@example.com)" node scripts/fetch-liquipedia.mjs [cs|dota]
//   then: node scripts/build-dataset.mjs
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = new URL('..', import.meta.url).pathname;
const UA = process.env.LIQUIPEDIA_UA;
if (!UA) { console.error('Set LIQUIPEDIA_UA to a descriptive User-Agent with contact info.'); process.exit(1); }
mkdirSync(ROOT + 'data/cache', { recursive: true });
mkdirSync(ROOT + 'data/raw', { recursive: true });

let last = 0;
async function api(wiki, params) {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params }).toString();
  const file = ROOT + 'data/cache/' + createHash('sha1').update(wiki + qs).digest('hex') + '.json';
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const wait = last + 2500 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch(`https://liquipedia.net/${wiki}/api.php?${qs}`, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip' } });
  if (!res.ok) throw new Error(`${res.status} for ${qs}`);
  const json = await res.json();
  writeFileSync(file, JSON.stringify(json));
  return json;
}

// Big pages (event pages are often several MB) can push a response over the API size limit: the API then returns
// some pages without their content. Those are fetched again in smaller batches, down to one page per request.
async function pages(wiki, titles, size = 50) {
  const out = []; const again = [];
  for (let i = 0; i < titles.length; i += size) {
    const batch = titles.slice(i, i + size);
    const r = await api(wiki, { action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', redirects: '1', titles: batch.join('|') });
    const redir = Object.fromEntries((r.query.redirects || []).map((x) => [x.to, x.from]));
    const norm = Object.fromEntries((r.query.normalized || []).map((x) => [x.to, x.from]));
    for (const p of r.query.pages) {
      const from = redir[p.title] || p.title; const asked = norm[from] || from;
      if (p.missing || p.invalid) { out.push({ title: p.title, from: asked, text: null }); continue; }
      if (!p.revisions) { if (size > 1) again.push(asked); else out.push({ title: p.title, from: asked, text: null }); continue; }
      out.push({ title: p.title, from: asked, text: p.revisions[0].slots.main.content });
    }
  }
  if (again.length) out.push(...await pages(wiki, again, Math.max(1, Math.floor(size / 5))));
  return out;
}

const field = (c, k) => { const m = c.match(new RegExp('\\n\\|' + k + '=([^\\n]*)')); return m ? m[1].replace(/<!--.*?-->/g, '').trim() : ''; };
const up = (s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

// ---------- CS: every player of the CS:GO/CS2 pro scene since 2014, with full team history from the infobox ----------
// All Majors from Katowice 2014 on (only these count for the "Majors" column).
const CS_MAJORS = ['ESL/Major Series One/2014/Katowice', 'ESL/One/2014/Cologne', 'DreamHack/2014/Winter', 'ESL/One/2015/Katowice',
  'ESL/One/2015/Cologne', 'DreamHack/2015/Cluj-Napoca', 'MLG/2016/Columbus', 'ESL/One/2016/Cologne', 'ELEAGUE/2017/Major', 'PGL/2017/Krakow',
  'ELEAGUE/2018/Major', 'FACEIT/2018/Major', 'IEM Katowice 2019', 'StarLadder/2019/Major', 'PGL/2021/Stockholm', 'PGL/2022/Antwerp',
  'Intel Extreme Masters/2022/Rio', 'BLAST/Major/2023/Paris', 'PGL/2024/Copenhagen', 'Perfect World/Major/2024/Shanghai', 'BLAST/Major/2025/Austin',
  'StarLadder/2025/Major', 'Intel Extreme Masters/2026/Cologne', 'PGL/2026/Singapore'];
// Every other S-tier event since 2014 plus the Valve qualifiers (Minors, Major regional stages, RMR), from Liquipedia's
// "S-Tier Tournaments" (2012-2023, Post 2023) and "Valve Tournaments" lists. Their players are added with the Majors they have
// (0 if none). Add new events here (and new Majors above) as they are played.
const CS_EVENTS = (await import('./cs-events.mjs')).CS_EVENTS;
// Players of an event page. Older pages list rosters as {{TeamCard|p1=..}}, newer ones as
// {{Opponent|Team|players={{Persons|{{Person|name|link=..|role=sub|played=false}}..}}}}: coaches and players who did not play are skipped.
function eventPlayers(text) {
  const seen = new Set();
  for (const card of text.split('{{TeamCard\n').slice(1)) {
    const body = card.split('\n}}')[0];
    for (let k = 1; k <= 5; k++) {
      const p = body.match(new RegExp('\\|p' + k + '=([^|\\n}]+)')); if (!p) continue;
      const l = body.match(new RegExp('\\|p' + k + 'link=([^|\\n}]+)'));
      seen.add(up((l ? l[1] : p[1]).trim()));
    }
  }
  for (const blk of text.split('{{Opponent|').slice(1)) {
    const i = blk.indexOf('players={{Persons'); if (i < 0) continue;
    for (const m of blk.slice(i).split('\n}}')[0].matchAll(/\{\{Person\|([^{}]*)\}\}/g)) {
      const kv = {}; const pos = [];
      for (const a of m[1].split('|').map((x) => x.trim())) { const j = a.indexOf('='); if (j > 0) kv[a.slice(0, j).trim()] = a.slice(j + 1).trim(); else pos.push(a); }
      if (!pos[0] || kv.played === 'false' || (kv.role && kv.role !== 'sub')) continue;
      seen.add(up(kv.link || pos[0]));
    }
  }
  return seen;
}

async function cs() {
  const count = new Map();
  for (const m of await pages('counterstrike', CS_MAJORS)) {
    if (!m.text) { console.warn('missing major page', m.from); continue; }
    const ps = eventPlayers(m.text); console.log('major', m.title, ps.size, 'players', ps.has('ZywOo') ? '(ZywOo)' : '');
    ps.forEach((n) => count.set(n, (count.get(n) || 0) + 1));
  }
  for (const e of await pages('counterstrike', CS_EVENTS)) {
    if (!e.text) { console.warn('missing event page', e.from); continue; }
    eventPlayers(e.text).forEach((n) => { if (!count.has(n)) count.set(n, 0); });
  }
  const keep = (n) => ['', 'loan', 'substitute', 'sub'].includes(n.replace(/^link=[^|]*\|?/, '').toLowerCase());
  const pd = (s, end) => {
    s = (s || '').replace(/'''/g, '').trim(); if (/present/i.test(s)) return 0;
    const m = s.match(/(\d{4})-(\d\d|\?\?)/); if (!m) return end ? 0 : null;
    return +m[1] * 100 + (m[2] === '??' ? (end ? 12 : 1) : +m[2]);
  };
  const teams = []; const ti = {};
  const T = (n) => { if (!(n in ti)) { ti[n] = teams.length; teams.push(n); } return ti[n]; };
  const players = [];
  for (const p of await pages('counterstrike', [...count.keys()])) {
    if (!p.text || !field(p.text, 'id')) continue;
    const c = p.text;
    const h = [];
    for (const m of c.matchAll(/\{\{TH\|([^|}]*)\|([^|}]+)(?:\|([^}]*))?\}\}/g)) {
      const note = (m[3] || '').trim(); if (!keep(note)) continue;
      const link = (note.match(/^link=([^|]+)/) || [])[1];
      const [a, b] = m[1].split('—'); const s = pd(a, false); if (s === null) continue;
      h.push([T((link || m[2]).trim()), s, pd(b, true)]);
    }
    const roles = [...new Set((field(c, 'roles') || field(c, 'role')).toLowerCase().split(',').map((x) => x.trim())
      .map((x) => ({ rifler: 'rifle', awper: 'awp', lurk: 'lurker', entryfragger: 'entry' }[x] || x)).filter(Boolean))];
    players.push({ p: p.title, id: field(c, 'id'), n: field(c, 'romanized_name') || field(c, 'name'), c: field(c, 'country'),
      b: field(c, 'birth_date'), s: field(c, 'status').toLowerCase(), t: field(c, 'team') || undefined, r: roles,
      m: Math.max(count.get(up(p.from)) || 0, count.get(p.title) || 0), h });
  }
  writeFileSync(ROOT + 'data/raw/cs.json', JSON.stringify({ teams, players }));
  console.log('cs:', players.length, 'players');
}

// ---------- Dota 2: rosters of these events (team history in Dota infoboxes is auto-generated) ----------
const DOTA_EVENTS = ['The International/2019', 'The International/2021', 'The International/2022', 'The International/2023',
  'Riyadh Masters/2023', 'The International/2024', 'Esports World Cup/2025', 'The International/2025'];

async function dota() {
  const appearances = [];
  for (const ev of await pages('dota2', DOTA_EVENTS)) {
    if (!ev.text) { console.warn('missing event page', ev.from); continue; }
    const yr = +ev.title.match(/\d{4}/)[0];
    for (const blk of ev.text.split('{{Opponent|').slice(1)) {
      const team = blk.split(/\n|\|/)[0].trim();
      for (const m of blk.split('|qualification')[0].matchAll(/\{\{Person\|role=([1-5])\|([^|}]+)((?:\|[^}]*)?)\}\}/g)) {
        const l = (m[3].match(/link=([^|}]+)/) || [])[1];
        appearances.push({ pl: (l || m[2]).trim(), team, ev: ev.title, yr, pos: +m[1] });
      }
    }
  }
  const players = [];
  for (const p of await pages('dota2', [...new Set(appearances.map((a) => a.pl))])) {
    if (!p.text) { players.push({ page: p.title, from: p.from, missing: true }); continue; }
    const c = p.text; const g = (k) => field(c, k);
    players.push({ page: p.title, from: p.from, id: g('id'), name: g('romanized_name') || g('name'), birth: g('birth_date'),
      country: g('country'), country2: g('country2'), status: g('status'), team: g('team'), roles: g('roles') || g('role'),
      hero: g('hero'), hero2: g('hero2'), hero3: g('hero3') });
  }
  writeFileSync(ROOT + 'data/raw/dota.json', JSON.stringify({ players, appearances }));
  console.log('dota:', players.length, 'players');
}

const which = process.argv[2];
if (!which || which === 'cs') await cs();
if (!which || which === 'dota') await dota();
