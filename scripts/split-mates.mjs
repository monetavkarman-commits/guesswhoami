// The teammate lists make up ~85% of the football file but only the chain and lineup modes need them.
// This moves them into <game>-mates.json, which the site loads on demand. Run by build-sports.mjs; safe to run again.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export function splitMates(game, root = new URL('..', import.meta.url).pathname) {
  const file = `${root}public/data/${game}.json`;
  const d = JSON.parse(readFileSync(file, 'utf8'));
  const matesFile = `${root}public/data/${game}-mates.json`;
  if (d.players.some((p) => p.mates)) {
    writeFileSync(matesFile, JSON.stringify(d.players.map((p) => p.mates || [])));
    d.players.forEach((p) => { delete p.mates; });
    d.matesFile = `data/${game}-mates.json`;
    writeFileSync(file, JSON.stringify(d));
  }
  return existsSync(matesFile);
}

if (process.argv[1] === new URL(import.meta.url).pathname) { const g = process.argv[2] || 'football'; console.log(g, 'split:', splitMates(g)); }
