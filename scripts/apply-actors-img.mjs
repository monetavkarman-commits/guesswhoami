// Saves the actor photos and film pictures fetched in the owner's browser (see HANDOFF.md, "Актёры: фото и постеры").
// Input: a JSON array of jobs [{kind: 'a'|'p'|'l', key, q, file, page, artist, lic, licUrl, b64}]:
//   a = actor photo (key = actor QID, 96x96 webp), p = film poster (q = film QID, 64x96), l = film title logo (q = film QID, 128x64).
// Output: public/img/actors/<QID>.webp, public/img/films/{p,l}<QID>.webp and data/raw/actors-img.json (file names, authors, licences).
//   node scripts/apply-actors-img.mjs ~/Downloads/actors-img.json && node scripts/build-actors.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const jobs = JSON.parse(readFileSync(process.argv[2], 'utf8'));
mkdirSync(ROOT + 'public/img/actors', { recursive: true });
mkdirSync(ROOT + 'public/img/films', { recursive: true });
// checked by eye: not a picture of the film, or unreadable at icon size
const DROP = new Set(['Wall Street 2 Cannes ad.jpg', 'TotalRecall 2012 logo.PNG', '2011-12-14-missionimpossible.jpg', 'Moonfall.png', 'Interstellar-logo.jpg']);
const meta = { actors: {}, films: {} };
let bytes = 0;
for (const j of jobs) {
  if (!j.b64 || DROP.has(j.file)) continue;
  const buf = Buffer.from(j.b64, 'base64');
  bytes += buf.length;
  const info = { file: j.file, page: j.page, artist: j.artist || '', lic: j.lic || '', licUrl: j.licUrl || '' };
  if (j.kind === 'a') { writeFileSync(ROOT + `public/img/actors/${j.key}.webp`, buf); meta.actors[j.key] = { ...info, src: `img/actors/${j.key}.webp` }; }
  else { const src = `img/films/${j.kind}${j.q}.webp`; writeFileSync(ROOT + 'public/' + src, buf); meta.films[j.q] = { ...info, kind: j.kind, src }; }
}
writeFileSync(ROOT + 'data/raw/actors-img.json', JSON.stringify(meta, null, 1));
console.log(`actors ${Object.keys(meta.actors).length}, films ${Object.keys(meta.films).length}, ${(bytes / 1024).toFixed(0)} KB`);
