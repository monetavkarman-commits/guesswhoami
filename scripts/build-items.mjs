// Builds the item-guessing datasets from data/raw/items-raw.json (Liquipedia infobox fields, fetched slowly via the API):
//   public/data/dota-items.json  — Dota 2 heroes
//   public/data/cs-maps.json     — CS maps (CS2 pool, reserve, removed, and CS:GO maps with Liquipedia pages)
// and applies Liquipedia's weapon infobox values (price, magazine, kill award, country) to public/data/cs-items.json.
import { readFileSync, writeFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync('data/raw/items-raw.json', 'utf8'));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const write = (f, d) => { writeFileSync(f, JSON.stringify(d, null, 1) + '\n'); console.log(f, d.items.length); };

// ---------- Dota heroes ----------
const ATTR = { Strength: 'Сила', Agility: 'Ловкость', Intelligence: 'Интеллект', Universal: 'Универсал' };
const ROLE = { Carry: 'Керри', Support: 'Поддержка', Nuker: 'Нюкер', Disabler: 'Контроль', Durable: 'Танк', Escape: 'Побег', Pusher: 'Пушер', Initiator: 'Инициатор' };
const heroes = Object.entries(raw.heroes).filter(([n]) => n !== 'Spirit Bear').map(([name, o]) => {
  const melee = o.rangetype === 'Melee';
  return {
    id: slug(name), name, sub: ATTR[o.primary],
    attr: ATTR[o.primary], atk: melee ? 'Ближний бой' : 'Дальний бой',
    roles: (o.roles || '').split(',').map((r) => ROLE[r.trim()]).filter(Boolean),
    complexity: +o.complexity || null, speed: +o.movespeed || null,
    range: /^\d+$/.test(o.atkrange || '') ? +o.atkrange : melee ? 150 : null,
    year: o.released ? +o.released.slice(0, 4) : null,
    alias: { 'Anti-Mage': ['am'], 'Shadow Fiend': ['sf'], 'Queen of Pain': ['qop'], 'Outworld Destroyer': ['od'], 'Wraith King': ['wk'], 'Phantom Assassin': ['pa'], 'Phantom Lancer': ['pl'], 'Templar Assassin': ['ta'], 'Crystal Maiden': ['cm'], 'Storm Spirit': ['storm'], 'Ember Spirit': ['ember'], 'Earth Spirit': ['es'], 'Void Spirit': ['void'], 'Faceless Void': ['fv'], 'Nature\'s Prophet': ['np', 'furion'], 'Keeper of the Light': ['kotl'], 'Skywrath Mage': ['sky'], 'Dark Willow': ['dw'], 'Monkey King': ['mk'], 'Lone Druid': ['ld'], 'Naga Siren': ['naga'], 'Vengeful Spirit': ['vs'], 'Treant Protector': ['treant'], 'Ancient Apparition': ['aa'] }[name] || [],
    url: `https://liquipedia.net/dota2/${encodeURIComponent(name.replace(/ /g, '_'))}`,
  };
}).sort((a, b) => a.name.localeCompare(b.name));
write('public/data/dota-items.json', {
  modeTitle: 'Герои', nameTitle: 'Герой', placeholder: 'Имя героя…',
  intro: 'Угадайте героя Dota 2 по атрибуту, типу атаки, ролям и характеристикам. Зелёный — совпало, жёлтый — близко (роли пересекаются, скорость ±10, дальность ±100, год ±2), стрелка — больше или меньше.',
  source: `Liquipedia, инфобоксы героев (${raw.fetched.slice(0, 10)})`,
  columns: [
    { key: 'attr', title: 'Атрибут', type: 'cat' },
    { key: 'atk', title: 'Атака', type: 'cat' },
    { key: 'roles', title: 'Роли', type: 'set' },
    { key: 'complexity', title: 'Сложность', type: 'num', near: 0 },
    { key: 'speed', title: 'Скорость', type: 'num', near: 10 },
    { key: 'range', title: 'Дальность', type: 'num', near: 100 },
    { key: 'year', title: 'Год выхода', type: 'num', near: 2 },
  ],
  items: heroes,
});

// ---------- CS maps ----------
const FLAG = { fr: 'Франция', jp: 'Япония', mx: 'Мексика', us: 'США', ma: 'Марокко', it: 'Италия', egypt: 'Египет', de: 'Германия', gr: 'Греция', nl: 'Нидерланды', ru: 'Россия', ua: 'Украина', co: 'Колумбия' };
const PLACE = { Africa: 'Африка', Namibia: 'Намибия', Madagascar: 'Мадагаскар' };
const THEME = { Castle: 'Замок', Desert: 'Пустыня', 'High-Tech': 'Хай-тек', 'Rain Forest': 'Джунгли', Rainforest: 'Джунгли', Urban: 'Город', Suburban: 'Пригород', 'Live Village': 'Город', Industrial: 'Промзона', Santorini: 'Курорт', Town: 'Город', Modern: 'Город', Tropical: 'Тропики' };
const SIZE = { Small: 'Маленькая', Medium: 'Средняя', Large: 'Большая' };
const SCEN = { 'Bomb defusal': 'Закладка бомбы', 'Hostage rescue': 'Спасение заложников' };
const g = raw.groups;
const status = {};
for (const [t] of g.removed) status[t.split('/')[0]] = 'Убрана';
for (const [t] of g.reserve) status[t.split('/')[0]] = 'Резерв';
for (const [t] of g.active) status[t.split('/')[0]] = 'Active Duty';
const csgoAD = new Set([...g.csgoAD].map(([t]) => t.split('/')[0]));
const country = (loc) => {
  if (!loc) return null;
  const m = loc.match(/\{\{Flag\|(\w+)\}\}/i);
  if (m) return FLAG[m[1].toLowerCase()] || null;
  return PLACE[loc.trim()] || null;
};
const byName = new Map();
for (const o of Object.values(raw.maps)) {
  const [name, ver] = o.title.split('/');
  if (name === 'Breach') continue; // infobox is malformed
  const prev = byName.get(name);
  if (prev && prev.ver === 'cs2') continue;
  byName.set(name, { ...o, ver, name });
}
const maps = [...byName.values()].map((o) => {
  const valve = /^Valve/.test(o.creator || '');
  return {
    id: slug(o.name), name: o.name, sub: status[o.name] || 'Только CS:GO',
    status: status[o.name] || 'Только CS:GO',
    scen: SCEN[o.scenario] || null, theme: THEME[o.theme] || null,
    country: country(o.location), author: valve ? 'Valve' : o.creator ? 'Сообщество' : null,
    size: SIZE[o.size] || null, csgoAD: csgoAD.has(o.name) ? 'Да' : 'Нет',
    alias: { 'Dust II': ['dust2', 'd2', 'даст'], Mirage: ['мираж'], Inferno: ['инферно'], Nuke: ['нюк'], Cobblestone: ['cbble'] }[o.name] || [],
    url: `https://liquipedia.net/counterstrike/${encodeURIComponent(o.title.replace(/ /g, '_'))}`,
  };
}).sort((a, b) => a.name.localeCompare(b.name));
write('public/data/cs-maps.json', {
  modeTitle: 'Карты', nameTitle: 'Карта', placeholder: 'Название карты…',
  intro: 'Угадайте карту CS по статусу в маппуле CS2, сценарию, теме, стране, автору и размеру. Зелёный — совпало.',
  source: `Liquipedia, инфобоксы карт и шаблон Maps Navbox (${raw.fetched.slice(0, 10)})`,
  columns: [
    { key: 'status', title: 'Статус в CS2', type: 'cat' },
    { key: 'csgoAD', title: 'В последнем пуле CS:GO', type: 'cat' },
    { key: 'scen', title: 'Сценарий', type: 'cat' },
    { key: 'theme', title: 'Тема', type: 'cat' },
    { key: 'country', title: 'Страна', type: 'cat' },
    { key: 'author', title: 'Автор', type: 'cat' },
    { key: 'size', title: 'Размер', type: 'cat' },
  ],
  items: maps,
});

// ---------- CS weapons: Liquipedia infobox values ----------
// [price, magazine, kill award, country of origin]
const W = {
  'Glock-18': [200, 20, 300, 'Австрия'], 'USP-S': [200, 12, 300, 'Германия'], P2000: [200, 13, 300, 'Германия'], P250: [300, 13, 300, 'Германия'],
  'Dual Berettas': [300, 30, 300, 'Италия'], 'CZ75-Auto': [500, 12, 300, 'Чехия'], 'Five-SeveN': [500, 20, 300, 'Бельгия'], 'Tec-9': [500, 18, 300, 'Швеция'],
  'Desert Eagle': [700, 7, 300, 'Израиль'], 'R8 Revolver': [600, 8, 300, 'США'], 'MAC-10': [1050, 30, 600, 'США'], MP9: [1250, 30, 600, 'Швейцария'],
  MP7: [1400, 30, 600, 'Германия'], 'MP5-SD': [1500, 30, 600, 'Германия'], 'UMP-45': [1200, 25, 600, 'Германия'], P90: [2350, 50, 300, 'Бельгия'],
  'PP-Bizon': [1300, 64, 600, 'Россия'], Nova: [1050, 8, 900, 'Италия'], XM1014: [2000, 7, 600, 'Италия'], 'Sawed-Off': [1100, 7, 900, 'США'],
  'MAG-7': [1300, 5, 900, 'ЮАР'], M249: [5200, 100, 300, 'Бельгия'], Negev: [1700, 150, 300, 'Израиль'], 'Galil AR': [1800, 35, 300, 'Израиль'],
  FAMAS: [1950, 25, 300, 'Франция'], 'AK-47': [2700, 30, 300, 'СССР'], M4A4: [2900, 30, 300, 'США'], 'M4A1-S': [2900, 20, 300, 'США'],
  'SG 553': [3000, 30, 300, 'Швейцария'], AUG: [3300, 30, 300, 'Австрия'], 'SSG 08': [1700, 10, 300, 'Австрия'], AWP: [4750, 5, 100, 'Великобритания'],
  G3SG1: [5000, 20, 300, 'Германия'], 'SCAR-20': [5000, 20, 300, 'Бельгия'],
};
const cs = JSON.parse(readFileSync('public/data/cs-items.json', 'utf8'));
for (const it of cs.items) {
  const v = W[it.name]; if (!v) throw new Error('no weapon data: ' + it.name);
  [it.price, it.mag, it.reward, it.origin] = v;
}
if (!cs.columns.some((c) => c.key === 'origin')) cs.columns.push({ key: 'origin', title: 'Страна', type: 'cat' });
cs.intro = 'Угадайте оружие CS2 по типу, стороне, цене, магазину, награде за убийство и стране-производителю. Зелёный — совпало, жёлтый — близко (цена ±$300, магазин ±5, награда ±$300), стрелка — больше или меньше.';
cs.source = `Liquipedia, инфобоксы оружия (${raw.fetched.slice(0, 10)})`;
write('public/data/cs-items.json', cs);
