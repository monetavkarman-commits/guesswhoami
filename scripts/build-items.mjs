// Builds the item-guessing datasets from data/raw/items-raw.json (Liquipedia infobox fields, fetched slowly via the API):
//   public/data/dota-items.json  — Dota 2 heroes
//   public/data/cs-maps.json     — CS maps (CS2 pool, reserve, removed, and CS:GO maps with Liquipedia pages)
// and applies Liquipedia's weapon infobox values (price, magazine, kill award, country) to public/data/cs-items.json.
import { readFileSync, writeFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync('data/raw/items-raw.json', 'utf8'));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Pictures are not copied: every item gets an `img` file name and the data file an `imgBase`, the official CDN the browser loads it from.
// Dota 2: Valve's CDN, names matched through data/raw/dota-img-keys.json (OpenDota constants). LoL: Riot Data Dragon.
const KEYS = JSON.parse(readFileSync('data/raw/dota-img-keys.json', 'utf8'));
const DOTA_CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/';
const NAMEFIX = { 'outworld destroyer': 'outworld devourer', ringmaster: 'ring master' };
const keyOf = (list, name) => (list.find(([n]) => n.toLowerCase() === (NAMEFIX[name.toLowerCase()] || name.toLowerCase())) || [])[1];
const write = (f, d) => {
  if (f.endsWith('dota-items.json')) { d.imgBase = DOTA_CDN + 'heroes/'; d.items.forEach((x) => { const k = keyOf(KEYS.h, x.name); if (k) x.img = `${k}.png`; else console.warn('no hero image', x.name); }); }
  if (f.endsWith('dota-gear.json')) { d.imgBase = DOTA_CDN + 'items/'; d.items.forEach((x) => { const k = keyOf(KEYS.it, x.name); if (k) x.img = `${k}.png`; else console.warn('no item image', x.name); }); }
  writeFileSync(f, JSON.stringify(d, null, 1) + '\n'); console.log(f, d.items.length);
};

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

// ---------- Dota 2 shop items (Liquipedia item infoboxes) and LoL items (Riot Data Dragon) ----------
{
  const raw2 = JSON.parse(readFileSync('data/raw/items2-raw.json', 'utf8'));
  const D = Object.fromEntries(Object.entries(raw2.dota).filter(([, v]) => v));
  // total cost: own price, or components + recipe
  const costMemo = {};
  const cost = (n, seen = new Set()) => {
    if (n in costMemo) return costMemo[n];
    const v = D[n]; if (!v || seen.has(n)) return 0; seen.add(n);
    let c = +v['item cost'] || 0;
    if (!c) { for (let i = 1; v[`recipe ${i}`]; i++) c += cost(v[`recipe ${i}`], seen); c += +v['recipe cost'] || 0; }
    return (costMemo[n] = c);
  };
  const TYPE = { Consumables: 'Расходники', Attributes: 'Атрибуты', Equipment: 'Снаряжение', Miscellaneous: 'Разное', Secret: 'Секретная лавка',
    Accessories: 'Аксессуары', Support: 'Поддержка', Magical: 'Магические', Armor: 'Броня', Weapons: 'Оружие', Armaments: 'Вооружение' };
  const BONUS = [[/strength|universal attributes|primary attribute/, 'Сила'], [/agility|universal attributes|primary attribute/, 'Ловкость'], [/intelligence|universal attributes|primary attribute/, 'Интеллект'],
    [/attack damage/, 'Урон'], [/attack speed|base attack time/, 'Скорость атаки'], [/bonus armor/, 'Броня'], [/bonus health$|max hp|bonus health restoration/, 'Здоровье'],
    [/bonus mana$|mana loss/, 'Мана'], [/regen/, 'Регенерация'], [/movement speed/, 'Скорость бега'], [/magic resistance|status resistance|slow resistance/, 'Сопротивление'],
    [/lifesteal/, 'Вампиризм'], [/spell damage|cast range|aoe|cooldown/, 'Усиление умений'], [/evasion/, 'Уклонение'], [/attack range/, 'Дальность атаки']];
  const SKIP = /^(Aegis|Cheese|Refresher Shard|Roshan's Banner|Bag of Gold|Tango \(Shared\)|Power Treads \(|Aghanim's Blessing)/;
  const items = [];
  for (const [n, v] of Object.entries(D)) {
    if (!TYPE[v.type] || v.neutral === 'True' || SKIP.test(n)) continue;
    const price = cost(n); if (!price) continue;
    let parts = 0; for (let i = 1; v[`recipe ${i}`]; i++) parts++;
    const bonus = [...new Set(Object.keys(v).filter((k) => k.startsWith('bonus ')).flatMap((k) => BONUS.filter(([re]) => re.test(k)).map(([, l]) => l)))];
    items.push({ id: slug(n), name: n, sub: TYPE[v.type], type: TYPE[v.type], price, parts, bonus,
      active: v.active ? 'Да' : 'Нет', upgrade: v['used in 1'] ? 'Да' : 'Нет',
      alias: (v.alias || '').split(',').map((x) => x.trim()).filter(Boolean),
      url: `https://liquipedia.net/dota2/${encodeURIComponent(n.replace(/ /g, '_'))}` });
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  write('public/data/dota-gear.json', {
    modeTitle: 'Предметы', nameTitle: 'Предмет', placeholder: 'Название предмета…',
    intro: 'Угадайте предмет из лавки Dota 2 по разделу магазина, цене, числу компонентов, бонусам, активной способности и тому, собирается ли он дальше. Зелёный — совпало, жёлтый — близко (цена ±300, бонусы пересекаются), стрелка — больше или меньше.',
    source: 'Liquipedia, инфобоксы предметов (цена с учётом компонентов и рецепта)',
    columns: [
      { key: 'type', title: 'Раздел лавки', type: 'cat' },
      { key: 'price', title: 'Цена', type: 'num', near: 300 },
      { key: 'parts', title: 'Компонентов', type: 'num', near: 0 },
      { key: 'bonus', title: 'Бонусы', type: 'set' },
      { key: 'active', title: 'Активка', type: 'cat' },
      { key: 'upgrade', title: 'Собирается дальше', type: 'cat' },
    ],
    items,
  });

  const TAG = { Health: 'Здоровье', Damage: 'Урон', CriticalStrike: 'Крит', SpellDamage: 'Сила умений', Mana: 'Мана', ManaRegen: 'Реген маны',
    HealthRegen: 'Реген здоровья', Armor: 'Броня', SpellBlock: 'Маг. сопротивление', MagicResist: 'Маг. сопротивление', AttackSpeed: 'Скорость атаки',
    OnHit: 'При попадании', LifeSteal: 'Вампиризм', SpellVamp: 'Вампиризм', CooldownReduction: 'Ускорение умений', AbilityHaste: 'Ускорение умений',
    ArmorPenetration: 'Пробивание брони', MagicPenetration: 'Маг. пробивание', NonbootsMovement: 'Скорость', Boots: 'Скорость', Tenacity: 'Стойкость',
    Active: 'Активка', Aura: 'Аура', Slow: 'Замедление', Vision: 'Обзор', Stealth: 'Невидимость', GoldPer: 'Золото' };
  const lol = raw2.lol.items.filter((x) => x.gold > 0 && !x.tags.some((t) => ['Consumable', 'Trinket'].includes(t)))
    .map((x) => ({ id: x.id, name: x.name, sub: x.ru || '', alias: x.ru ? [x.ru] : [],
      // tier from the build tree: no components = basic, builds further = epic, final item = legendary
      tier: x.boots ? 'Ботинки' : x.tags.includes('Lane') || x.tags.includes('Jungle') ? 'Стартовый' : !x.from ? 'Базовый' : x.into ? 'Эпический' : 'Легендарный',
      price: x.gold, parts: x.from,
      stats: [...new Set(x.tags.filter((t) => t !== 'Active').map((t) => TAG[t]).filter(Boolean))],
      active: x.tags.includes('Active') ? 'Да' : 'Нет', img: `${x.id}.png`,
      url: `https://wiki.leagueoflegends.com/en-us/${encodeURIComponent(x.name.replace(/ /g, '_'))}` }))
    .sort((a, b) => a.name.localeCompare(b.name));
  write('public/data/lol-gear.json', {
    imgBase: `https://ddragon.leagueoflegends.com/cdn/${raw2.lol.version}/img/item/`,
    modeTitle: 'Предметы', nameTitle: 'Предмет', placeholder: 'Название предмета (англ. или рус.)…',
    intro: 'Угадайте предмет League of Legends (Ущелье призывателей) по уровню, цене, числу компонентов, характеристикам и активной способности. Зелёный — совпало, жёлтый — близко (цена ±300, характеристики пересекаются), стрелка — больше или меньше.',
    source: `Riot Games Data Dragon, патч ${raw2.lol.version}`,
    columns: [
      { key: 'tier', title: 'Уровень', type: 'cat' },
      { key: 'price', title: 'Цена', type: 'num', near: 300 },
      { key: 'parts', title: 'Компонентов', type: 'num', near: 0 },
      { key: 'stats', title: 'Характеристики', type: 'set' },
      { key: 'active', title: 'Активка', type: 'cat' },
    ],
    items: lol,
  });
}

// ---------- LoL champions (Riot Data Dragon) ----------
{
  const raw = JSON.parse(readFileSync('data/raw/lol-champions-raw.json', 'utf8'));
  const CLASS = { Fighter: 'Боец', Tank: 'Танк', Mage: 'Маг', Assassin: 'Убийца', Marksman: 'Стрелок', Support: 'Поддержка' };
  const res = (p) => (p === 'Mana' ? 'Мана' : p === 'Energy' ? 'Энергия' : !p || p === 'None' ? 'Без ресурса' : 'Особый ресурс');
  const items = raw.champs.map((c) => ({
    id: c.id.toLowerCase(), name: c.name, sub: [c.ru, c.titleRu].filter(Boolean).join(', '), alias: c.ru && c.ru !== c.name ? [c.ru] : [],
    classes: c.tags.map((t) => CLASS[t]).filter(Boolean), resource: res(c.par), atk: c.range <= 250 ? 'Ближний бой' : 'Дальний бой',
    range: c.range, ms: c.ms, hp: Math.round(c.hp), diff: c.diff, img: `${c.id}.png`,
    url: `https://wiki.leagueoflegends.com/en-us/${encodeURIComponent(c.name.replace(/ /g, '_'))}`,
  })).sort((a, b) => a.name.localeCompare(b.name));
  write('public/data/lol-items.json', {
    imgBase: `https://ddragon.leagueoflegends.com/cdn/${raw.version}/img/champion/`,
    modeTitle: 'Чемпионы', nameTitle: 'Чемпион', placeholder: 'Имя чемпиона (англ. или рус.)…',
    intro: 'Угадайте чемпиона League of Legends по классу, ресурсу, типу атаки, дальности, скорости, здоровью на 1 уровне и сложности. Зелёный — совпало, жёлтый — близко (классы пересекаются, дальность ±50, скорость ±5, здоровье ±20, сложность ±1), стрелка — больше или меньше.',
    source: `Riot Games Data Dragon, патч ${raw.version}`,
    columns: [
      { key: 'classes', title: 'Класс', type: 'set' },
      { key: 'resource', title: 'Ресурс', type: 'cat' },
      { key: 'atk', title: 'Атака', type: 'cat' },
      { key: 'range', title: 'Дальность', type: 'num', near: 50 },
      { key: 'ms', title: 'Скорость', type: 'num', near: 5 },
      { key: 'hp', title: 'Здоровье', type: 'num', near: 20 },
      { key: 'diff', title: 'Сложность', type: 'num', near: 1 },
    ],
    items,
  });
}
