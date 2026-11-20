// Adds Wikimedia Commons photos (players) and logos (teams) to the esports datasets, matched by nickname / team name
// from data/raw/esports-wd.json (Wikidata: professional gamers with a photo, esports teams with a logo; see HANDOFF.md).
// A nickname must match exactly one Wikidata person, and birth years must agree when both are known.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = new URL('..', import.meta.url).pathname;
const RAW = ROOT + 'data/raw/esports-wd.json';
if (!existsSync(RAW)) process.exit(0);
const wd = JSON.parse(readFileSync(RAW, 'utf8'));
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9Ѐ-ӿ]/g, '');
const path = (file) => { const n = decodeURIComponent(file).replace(/ /g, '_'); const m = createHash('md5').update(n).digest('hex'); return `${m[0]}/${m.slice(0, 2)}/${n}`; };

const byLabel = new Map();
for (const [q, file, labels, birth] of wd.p) {
  for (const l of new Set(labels.split('|').map(fold).filter((x) => x.length >= 2))) {
    if (!byLabel.has(l)) byLabel.set(l, new Map());
    byLabel.get(l).set(q, { file, birth });
  }
}
const teamBy = new Map();
for (const [q, file, labels] of wd.t) {
  for (const l of new Set(labels.split('|').map(fold).filter((x) => x.length >= 2))) if (!teamBy.has(l)) teamBy.set(l, file);
}

for (const game of ['cs', 'dota', 'valorant', 'lol']) {
  const f = ROOT + `public/data/${game}.json`;
  const d = JSON.parse(readFileSync(f, 'utf8'));
  let pn = 0;
  for (const p of d.players) {
    delete p.ph;
    const cands = [...(byLabel.get(fold(p.id)) || new Map()).entries()].filter(([, c]) => !p.birth || !c.birth || p.birth.slice(0, 4) === c.birth.slice(0, 4));
    if (cands.length === 1) { p.ph = path(cands[0][1].file); pn++; }
  }
  d.logos = {};
  d.teams.forEach((t, i) => { const file = teamBy.get(fold(t)); if (file) d.logos[i] = path(file); });
  // logos supplied by hand (files under public/img/teams, listed in data/logos-local.json); Commons logos win where both exist
  const local = existsSync(ROOT + 'data/logos-local.json') ? JSON.parse(readFileSync(ROOT + 'data/logos-local.json', 'utf8'))[game] || {} : {};
  d.teams.forEach((t, i) => { if (!d.logos[i] && local[t]) d.logos[i] = local[t]; });
  writeFileSync(f, JSON.stringify(d));
  console.log(`  ${game}: photos ${pn}/${d.players.length}, logos ${Object.keys(d.logos).length}/${d.teams.length}`);
}
