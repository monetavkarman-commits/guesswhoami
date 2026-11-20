// Sanity checks for the player datasets. Exits with code 1 on errors, so a bad automatic refresh is never published.
// Usage: node scripts/validate-data.mjs [game ...]   (default: all player datasets)
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const GAMES = process.argv.slice(2).length ? process.argv.slice(2) : ['cs', 'dota', 'valorant', 'lol', 'football', 'basket'];
const YEAR = new Date().getFullYear();
const ESPORTS = new Set(['cs', 'dota', 'valorant', 'lol']);
let errors = 0;
const report = (game, level, msg) => { if (level === 'ERROR') errors++; console.log(`${level.padEnd(5)} ${game}: ${msg}`); };

for (const game of GAMES) {
  const file = `${ROOT}public/data/${game}.json`;
  if (!existsSync(file)) { report(game, 'WARN', 'file missing, skipped'); continue; }
  const d = JSON.parse(readFileSync(file, 'utf8'));
  const P = d.players || [];
  if (d.matesFile) { const all = JSON.parse(readFileSync(`${ROOT}public/${d.matesFile}`, 'utf8')); P.forEach((p, i) => { p.mates = all[i] || []; }); }
  const T = d.teams || [];
  if (P.length < 50) report(game, 'ERROR', `only ${P.length} players`);

  // the dataset must not shrink suddenly compared with the version in git
  try {
    const prev = JSON.parse(execSync(`git show HEAD:public/data/${game}.json`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 }).toString());
    const before = (prev.players || []).length;
    if (before && P.length < before * 0.9) report(game, 'ERROR', `players dropped from ${before} to ${P.length}`);
  } catch { /* no previous version (first run) */ }

  const minYear = ESPORTS.has(game) ? 1995 : 1900;
  const seen = new Set(), seenFull = new Set(); let noId = 0, dup = 0, dupSame = 0, badTeam = 0, young = 0, badYear = 0, asym = 0, mateTotal = 0, noName = 0;
  const youngEx = [];
  P.forEach((p, i) => {
    if (!p.id) noId++;
    if (!p.name) noName++;
    const key = p.id + '|' + (p.birth || '');
    if (seen.has(p.id)) dup++; seen.add(p.id);
    if (seenFull.has(key)) dupSame++; seenFull.add(key);
    (p.teams || []).forEach((t) => { if (!Number.isInteger(t) || t < 0 || t >= T.length) badTeam++; });
    const by = p.birth ? +String(p.birth).slice(0, 4) : null;
    for (const m of p.mates || []) {
      mateTotal++;
      const [j, t, from, to] = m;
      if (!P[j] || t < 0 || t >= T.length) { badTeam++; continue; }
      if ((from && (from < minYear || from > YEAR + 1)) || (to && (to < minYear || to > YEAR + 1))) badYear++;
      if (by && from && from - by < 14) { young++; if (youngEx.length < 5) youngEx.push(`${p.id} (b. ${by}) in ${from}`); }
      if (!(P[j].mates || []).some((x) => x[0] === i && x[1] === t)) asym++;
    }
  });
  if (noId) report(game, 'ERROR', `${noId} players without id`);
  if (noName) report(game, 'WARN', `${noName} players without a display name (the id is shown instead)`);
  if (dupSame) report(game, 'ERROR', `${dupSame} players appear twice (same id and birth date)`);
  else if (dup) report(game, 'WARN', `${dup} players share an id with a different person (different birth date)`);
  if (badTeam) report(game, 'ERROR', `${badTeam} broken team or player references`);
  if (badYear) report(game, 'ERROR', `${badYear} stints with impossible years`);
  if (young) report(game, ESPORTS.has(game) && young > 0 ? 'ERROR' : 'WARN', `${young} stints that began before the player was 14 (academy spells in sports are fine), e.g. ${youngEx.join('; ')}`);
  if (asym && asym > mateTotal * 0.02) report(game, 'ERROR', `${asym} of ${mateTotal} teammate links are one-sided`);
  else if (asym) report(game, 'WARN', `${asym} of ${mateTotal} teammate links are one-sided`);
  report(game, 'OK', `${P.length} players, ${T.length} teams checked`);
}
if (errors) { console.error(`\n${errors} error(s): the data must not be published.`); process.exit(1); }
console.log('\nAll checks passed.');
