// Builds the MMA and boxing guessing games (item-style, like tennis) from data/raw/fighters-wd.json (Wikidata, CC0).
// Raw: { mma: [{p, en, ru, b, sl, h, m, sex, iso, img, cls}], boxing: [...] }  (cls = "|"-joined English weight-class labels)
//   node scripts/build-fighters.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { COUNTRIES } from './countries.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const RAW = ROOT + 'data/raw/fighters-wd.json';
if (!existsSync(RAW)) { console.log('no fighters raw data'); process.exit(0); }
const raw = JSON.parse(readFileSync(RAW, 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const BY_ISO = {};
for (const [en, [iso, ru, region]] of Object.entries(COUNTRIES)) if (!BY_ISO[iso]) BY_ISO[iso] = { en, ru, region };
const commonsPath = (file) => {
  const name = decodeURIComponent(String(file)).replace(/ /g, '_');
  if (!/\.(jpe?g|png|svg|webp|gif)$/i.test(name)) return null;
  const md5 = createHash('md5').update(name).digest('hex');
  return `${md5[0]}/${md5.slice(0, 2)}/${name}`;
};
const GLYPHS = { 'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X', 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X' };
const latin = (s) => (s && /[A-Za-z]/.test(s) ? s.replace(/[Ͱ-ϿЀ-ӿ]/g, (c) => GLYPHS[c] || c) : s);

// weight classes, light to heavy: [name, group, upper limit in kg]
const MMA = [['Соломенный', 'Лёгкие', 52.5], ['Наилегчайший', 'Лёгкие', 57], ['Легчайший', 'Лёгкие', 61.5], ['Полулёгкий', 'Лёгкие', 66], ['Лёгкий', 'Средние', 70.5],
  ['Полусредний', 'Средние', 77.5], ['Средний', 'Средние', 84], ['Полутяжёлый', 'Тяжёлые', 93], ['Тяжёлый', 'Тяжёлые', 1e9]];
const BOX = { minimumweight: ['Минимальный', 'Лёгкие'], 'light flyweight': ['Первый наилегчайший', 'Лёгкие'], flyweight: ['Наилегчайший', 'Лёгкие'], 'super flyweight': ['Второй наилегчайший', 'Лёгкие'],
  bantamweight: ['Легчайший', 'Лёгкие'], 'super bantamweight': ['Второй легчайший', 'Лёгкие'], featherweight: ['Полулёгкий', 'Лёгкие'], 'super featherweight': ['Второй полулёгкий', 'Лёгкие'],
  lightweight: ['Лёгкий', 'Средние'], 'light welterweight': ['Первый полусредний', 'Средние'], welterweight: ['Полусредний', 'Средние'], 'light middleweight': ['Второй полусредний', 'Средние'],
  middleweight: ['Средний', 'Средние'], 'super middleweight': ['Второй средний', 'Средние'], 'light heavyweight': ['Полутяжёлый', 'Тяжёлые'], cruiserweight: ['Первый тяжёлый', 'Тяжёлые'],
  heavyweight: ['Тяжёлый', 'Тяжёлые'], 'super heavyweight': ['Тяжёлый', 'Тяжёлые'], 'heavyweight in boxing': ['Тяжёлый', 'Тяжёлые'] };
const BOX_KG = [[47.6, 'minimumweight'], [49, 'light flyweight'], [50.8, 'flyweight'], [52.2, 'super flyweight'], [53.5, 'bantamweight'], [55.3, 'super bantamweight'], [57.2, 'featherweight'], [59, 'super featherweight'],
  [61.2, 'lightweight'], [63.5, 'light welterweight'], [66.7, 'welterweight'], [69.9, 'light middleweight'], [72.6, 'middleweight'], [76.2, 'super middleweight'], [79.4, 'light heavyweight'], [90.7, 'cruiserweight'], [1e9, 'heavyweight']];
const BOX_ORDER = Object.keys(BOX);

function build(game, { title, minSl, useLabels, intro, topCount }) {
  const items = [];
  for (const r of raw[game]) {
    if (!r.en || !r.iso || !r.b || !BY_ISO[r.iso] || !r.sex || !r.h || r.sl < minSl) continue;
    // some entries give the weight in pounds (e.g. 170 for Conor McGregor): nobody in these sports is over 135 kg except super heavyweights
    let mass = r.m ? Math.round(+r.m > 135 ? +r.m * 0.4536 : +r.m) : null;
    if (mass && (mass < 40 || mass > 175)) mass = null;
    let cls = null;
    if (useLabels) {
      const hit = r.cls.split('|').filter((l) => BOX[l]).sort((a, b) => BOX_ORDER.indexOf(b) - BOX_ORDER.indexOf(a))[0];
      if (hit) cls = BOX[hit];
    }
    if (!cls && mass && useLabels) { const c = BOX_KG.find((x) => mass <= x[0]); cls = BOX[c[1]]; }
    if (!cls && mass && !useLabels) { const c = MMA.find((x) => mass <= x[2]); cls = [c[0], c[1]]; }
    if (!cls) continue;
    const h = Math.round(+r.h < 3 ? +r.h * 100 : +r.h);
    if (h < 140 || h > 225) continue;
    const c = BY_ISO[r.iso];
    items.push({
      id: r.p, name: latin(r.en), sub: [c.ru, r.ru && r.ru !== r.en ? r.ru : ''].filter(Boolean).join(' · '), alias: r.ru && r.ru !== r.en ? [r.ru] : [],
      sex: r.sex === 'Q6581072' ? 'Ж' : 'М', country: c.ru, region: c.region || null, division: cls[0], wgroup: cls[1], byear: +r.b.slice(0, 4), height: h,
      ...(game === 'mma' && mass ? { weight: mass } : {}), fame: r.sl, url: `https://www.wikidata.org/wiki/${r.p}`,
      ...(r.img && commonsPath(r.img) ? { img: commonsPath(r.img) } : {}),
    });
  }
  items.sort((a, b) => b.fame - a.fame);
  const columns = [
    { key: 'sex', title: 'Пол', type: 'cat' },
    { key: 'country', title: 'Страна', type: 'cat', nearKey: 'region' },
    { key: 'division', title: 'Весовая категория', type: 'cat', nearKey: 'wgroup' },
    { key: 'height', title: 'Рост', type: 'num', near: 5, unit: ' см' },
    ...(game === 'mma' ? [{ key: 'weight', title: 'Вес', type: 'num', near: 5, unit: ' кг' }] : []),
    { key: 'byear', title: 'Год рождения', type: 'num', near: 2 },
  ];
  const data = { modeTitle: 'Бойцы', nameTitle: title, placeholder: game === 'mma' ? 'Имя бойца…' : 'Имя боксёра…', intro, source: `Wikidata (CC0), ${today}`, pool: 'top', topCount, columns, items, imgWm: true };
  writeFileSync(ROOT + `public/data/${game}-items.json`, JSON.stringify(data));
  console.log(`${game}: ${items.length} fighters, photos ${items.filter((x) => x.img).length}`);
}
const HOW = 'Зелёный — совпало, жёлтый — близко (тот же регион или группа весов, ±2 года, ±5 см), стрелка — больше или меньше.';
build('mma', { title: 'Боец', minSl: 8, useLabels: false, topCount: 150, intro: `Угадайте бойца MMA по полу, стране, весовой категории, росту, весу и году рождения. ${HOW}` });
build('boxing', { title: 'Боксёр', minSl: 12, useLabels: true, topCount: 150, intro: `Угадайте боксёра по полу, стране, весовой категории, росту и году рождения. ${HOW}` });

// ---------- hockey: Wikidata has club careers without dates, so it is an item-style game too (no chain / grid) ----------
{
  const HW = ROOT + 'data/raw/hockey-wd.json'; const HX = ROOT + 'data/raw/hockey-extra.json';
  if (existsSync(HW) && existsSync(HX)) {
    const wd = JSON.parse(readFileSync(HW, 'utf8'));
    const extra = new Map(JSON.parse(readFileSync(HX, 'utf8')).map(([p, h, hand, w]) => [p, { h, w }]));
    const sl = new Map(wd.list.map((x) => [x.p, +x.sl]));
    const images = JSON.parse(readFileSync(ROOT + 'data/raw/sport-images.json', 'utf8')).p;
    const clubs = new Map();
    for (const [p, , label, nat] of wd.teams) {
      if (nat || /national|olympic|junior|youth|under-?\d|\bU-?\d\d\b/i.test(label)) continue;
      if (!clubs.has(p)) clubs.set(p, new Set()); clubs.get(p).add(label.replace(/\s+(HC|IF|SC|HK)$/, ''));
    }
    const POS = (l) => (/goal/i.test(l || '') ? 'Вратарь' : /defen[cs]e/i.test(l || '') ? 'Защитник' : /cent|wing|forward|attack/i.test(l || '') ? 'Нападающий' : null);
    const people = new Map();
    for (const r of wd.info) {
      const o = people.get(r.p) || { ...r, poss: {}, ccs: new Set() };
      if (r.cc) o.ccs.add(r.cc);
      const pos = POS(r.pos); if (pos) o.poss[pos] = (o.poss[pos] || 0) + 1;
      people.set(r.p, o);
    }
    const items = [];
    for (const o of people.values()) {
      // several citizenships: the first of the main hockey countries wins
      const HN = ['CA', 'US', 'SE', 'FI', 'CZ', 'RU', 'SK', 'CH', 'DE', 'LV', 'NO', 'DK'];
      const iso = HN.find((x) => o.ccs.has(x)) || [...o.ccs][0];
      const ex = extra.get(o.p) || {}; const c = BY_ISO[iso];
      const pos = Object.entries(o.poss).sort((a, b) => b[1] - a[1])[0]?.[0];
      const h = ex.h ? Math.round(+ex.h < 3 ? +ex.h * 100 : +ex.h) : null;
      if (!o.en || !c || !pos || !h || h < 150 || h > 225) continue;
      let w = ex.w ? Math.round(+ex.w) : null; if (w && (w < 50 || w > 150)) w = null;
      items.push({
        id: o.p, name: latin(o.en), sub: [c.ru, o.ru && o.ru !== o.en ? o.ru : ''].filter(Boolean).join(' · '), alias: o.ru && o.ru !== o.en ? [o.ru] : [],
        position: pos, country: c.ru, region: c.region || null, height: h, weight: w, byear: +o.b.slice(0, 4), clubs: clubs.get(o.p)?.size || null, fame: sl.get(o.p) || 0,
        url: `https://www.wikidata.org/wiki/${o.p}`, ...(images[o.p] && commonsPath(images[o.p]) ? { img: commonsPath(images[o.p]) } : {}),
      });
    }
    items.sort((a, b) => b.fame - a.fame);
    const data = { modeTitle: 'Хоккеисты', nameTitle: 'Хоккеист', placeholder: 'Имя хоккеиста…',
      intro: `Угадайте хоккеиста по позиции, стране, росту, весу, году рождения и числу клубов. ${HOW}`, source: `Wikidata (CC0), ${today}`, pool: 'top', topCount: 150, imgWm: true,
      columns: [
        { key: 'position', title: 'Позиция', type: 'cat' }, { key: 'country', title: 'Страна', type: 'cat', nearKey: 'region' },
        { key: 'height', title: 'Рост', type: 'num', near: 5, unit: ' см' }, { key: 'weight', title: 'Вес', type: 'num', near: 5, unit: ' кг' },
        { key: 'byear', title: 'Год рождения', type: 'num', near: 2 }, { key: 'clubs', title: 'Клубов', type: 'num', near: 1 },
      ], items };
    writeFileSync(ROOT + 'public/data/hockey-items.json', JSON.stringify(data));
    console.log(`hockey: ${items.length} players, photos ${items.filter((x) => x.img).length}`);
  }
}
