// Downloads player data from the Liquipedia MediaWiki API into data/raw/*.json.
// Follows the Liquipedia API terms (https://liquipedia.net/api-terms-of-use):
//  - descriptive User-Agent with contact info (set LIQUIPEDIA_UA)
//  - gzip, batched queries (50 titles per request), at most 1 request per ~2.5 s
//  - every response is cached in data/cache/, so re-runs don't hit the API again
//
//   LIQUIPEDIA_UA="GuessWhoAmI/1.0 (https://your-site; you@example.com)" node scripts/fetch-liquipedia.mjs [cs|dota]
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

async function pages(wiki, titles) {
  const out = [];
  for (let i = 0; i < titles.length; i += 50) {
    const r = await api(wiki, { action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', redirects: '1', titles: titles.slice(i, i + 50).join('|') });
    const redir = Object.fromEntries((r.query.redirects || []).map((x) => [x.to, x.from]));
    const norm = Object.fromEntries((r.query.normalized || []).map((x) => [x.to, x.from]));
    for (const p of r.query.pages) {
      const from = redir[p.title] || p.title;
      out.push({ title: p.title, from: norm[from] || from, text: p.missing ? null : p.revisions[0].slots.main.content });
    }
  }
  return out;
}

const field = (c, k) => { const m = c.match(new RegExp('\\n\\|' + k + '=([^\\n]*)')); return m ? m[1].replace(/<!--.*?-->/g, '').trim() : ''; };
const up = (s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

// ---------- CS: players of these Majors, with full team history from the infobox ----------
const CS_MAJORS = ['ELEAGUE/2018/Major', 'IEM Katowice 2019', 'StarLadder/2019/Major', 'PGL/2021/Stockholm', 'PGL/2022/Antwerp',
  'BLAST/Major/2023/Paris', 'PGL/2024/Copenhagen', 'Perfect World/Major/2024/Shanghai', 'BLAST/Major/2025/Austin'];

async function cs() {
  const majors = await pages('counterstrike', CS_MAJORS);
  const count = new Map();
  for (const m of majors) {
    if (!m.text) { console.warn('missing major page', m.from); continue; }
    const seen = new Set();
    for (const card of m.text.split('{{TeamCard\n').slice(1)) {
      const body = card.split('\n}}')[0];
      for (let k = 1; k <= 5; k++) {
        const p = body.match(new RegExp('\\|p' + k + '=([^|\\n}]+)')); if (!p) continue;
        const l = body.match(new RegExp('\\|p' + k + 'link=([^|\\n}]+)'));
        seen.add(up((l ? l[1] : p[1]).trim()));
      }
    }
    seen.forEach((n) => count.set(n, (count.get(n) || 0) + 1));
  }
  const keep = (n) => ['', 'inactive', 'loan', 'substitute', 'inactive loan', 'sub'].includes(n.replace(/^link=[^|]*\|?/, '').toLowerCase());
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
      m: Math.max(count.get(up(p.from)) || 0, count.get(p.title) || 0) || 1, h });
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
