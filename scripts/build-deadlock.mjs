// Builds the Deadlock datasets from data/raw/deadlock-raw.json (Liquipedia Deadlock: hero and item infoboxes, the item
// list and tiers come from the items navbox; fetched slowly through the API, titles in batches):
//   public/data/deadlock-items.json — heroes   public/data/deadlock-gear.json — shop items
import { readFileSync, writeFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync('data/raw/deadlock-raw.json', 'utf8'));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const url = (n) => `https://liquipedia.net/deadlock/${encodeURIComponent(n.replace(/ /g, '_'))}`;
const box = (text, name) => {
  const m = text.match(new RegExp(`\\{\\{Infobox ${name}([\\s\\S]*?)\\n\\s*\\}\\}`));
  const o = {};
  if (m) for (const line of m[1].split('\n')) { const k = line.match(/^\s*\|\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/); if (k) o[k[1].toLowerCase()] = k[2].replace(/<!--.*?-->/g, '').trim(); }
  return o;
};
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : null; };

// ---------- heroes ----------
const heroes = Object.entries(raw.heroes).map(([name, text]) => {
  const b = box(text, 'hero');
  const labs = /\|\s*playable\s*=\s*false/i.test(text);
  return {
    id: slug(name), name, sub: labs ? 'Hero Labs' : '', alias: name === 'Doorman' ? ['The Doorman'] : name === 'The Magnificent Sinclair' ? ['Sinclair'] : [],
    status: labs ? 'Hero Labs' : 'Основной состав',
    year: b.releasedate ? +b.releasedate.slice(0, 4) : null,
    health: num(b.basehealth), speed: num(b.speedmove), stamina: num(b.stamina), bullet: num(b.damagebullet), ammo: num(b.ammo), dps: num(b.dps) ?? (num(b.damagebullet) && num(b.bps) ? Math.round(num(b.damagebullet) * num(b.bps)) : null), // the wiki leaves a few DPS blank: estimate = bullet damage x bullets per second
    url: url(name),
  };
}).filter((h) => h.health != null).sort((a, b) => a.name.localeCompare(b.name));
const write = (f, d) => { writeFileSync(f, JSON.stringify(d, null, 1) + '\n'); console.log(f, d.items.length); };
write('public/data/deadlock-items.json', {
  modeTitle: 'Герои', nameTitle: 'Герой', placeholder: 'Имя героя…',
  intro: 'Угадайте героя Deadlock по статусу, году выхода и базовым характеристикам. Зелёный — совпало, жёлтый — близко (здоровье ±50, скорость ±0,3, выносливость ±1, урон пули ±1, магазин ±3, DPS ±5, год ±1), стрелка — больше или меньше.',
  source: `Liquipedia Deadlock, инфобоксы героев (${raw.fetched.slice(0, 10)})`,
  columns: [
    { key: 'status', title: 'Статус', type: 'cat' },
    { key: 'year', title: 'Год выхода', type: 'num', near: 1 },
    { key: 'health', title: 'Здоровье', type: 'num', near: 50 },
    { key: 'speed', title: 'Скорость', type: 'num', near: 0.3 },
    { key: 'stamina', title: 'Выносливость', type: 'num', near: 1 },
    { key: 'bullet', title: 'Урон пули', type: 'num', near: 1 },
    { key: 'ammo', title: 'Магазин', type: 'num', near: 3 },
    { key: 'dps', title: 'DPS', type: 'num', near: 5 },
  ],
  items: heroes,
});

// ---------- shop items ----------
const CAT = { Weapon: 'Оружие', Vitality: 'Живучесть', Spirit: 'Дух' };
const TIER = { 800: 1, 1600: 2, 3200: 3, 6400: 4 };
const STAT = [['bonushp', 'Здоровье'], ['hp', 'Здоровье'], ['maxhp', 'Здоровье'], ['hpbonus', 'Здоровье'], ['hpregen', 'Реген здоровья'], ['outofcombatregen', 'Реген здоровья'],
  ['spiritpower', 'Сила духа'], ['weapondmg', 'Урон оружия'], ['firerate', 'Скорострельность'], ['ammo', 'Боезапас'], ['reload', 'Перезарядка'], ['movespeed', 'Скорость'], ['sprintspeed', 'Скорость'],
  ['bulletresist', 'Защита от пуль'], ['bulletressist', 'Защита от пуль'], ['spiritresist', 'Защита от духа'], ['bulletshield', 'Щит'], ['spiritshield', 'Щит'],
  ['bulletlifesteal', 'Вампиризм'], ['spiritlifesteal', 'Вампиризм'], ['sprinlifesteal', 'Вампиризм'], ['cdreduction', 'Откат умений'], ['stamina', 'Выносливость'], ['staminarecov', 'Выносливость'], ['staminarecovery', 'Выносливость'],
  ['meleedamage', 'Ближний бой'], ['meleedmg', 'Ближний бой'], ['velocity', 'Скорость пули'], ['debuffresist', 'Стойкость']];
const items = [];
const names = new Set(Object.keys(raw.items));
for (const it of raw.itemList) {
  const text = raw.items[it.name]; if (!text) continue;
  const b = box(text, 'item');
  // tier and price are the ones on the item's own page (the navbox list still carries old prices); components = what the item is built from (its recipe)
  const tier = num(b.tier) || TIER[it.cost]; const price = num(b.itemcost) || it.cost;
  if (!tier || !CAT[it.cat]) continue;
  const stats = [...new Set(STAT.filter(([k]) => b[k] !== undefined && b[k] !== '').map(([, l]) => l))];
  const from = [...text.matchAll(/\|\s*bottomitem\d+\s*=\s*([^\n|}]+)/g)].map((m) => m[1].trim()).filter((n) => names.has(n));
  items.push({
    id: slug(it.name), name: it.name, sub: CAT[it.cat], alias: [], cat: CAT[it.cat], tier, price, stats,
    active: /'''''Active'''''/i.test(text) ? 'Да' : 'Нет', parts: from.length, from, url: url(it.name),
  });
}
items.sort((a, b) => a.name.localeCompare(b.name));
write('public/data/deadlock-gear.json', {
  modeTitle: 'Предметы', nameTitle: 'Предмет', placeholder: 'Название предмета…',
  intro: 'Угадайте предмет Deadlock по категории, уровню, бонусам, активной способности, цене и тому, из каких предметов он собирается. Зелёный — совпало, жёлтый — близко (бонусы или компоненты пересекаются, уровень ±1, цена ±500), стрелка — больше или меньше.',
  source: `Liquipedia Deadlock, инфобоксы предметов (${raw.fetched.slice(0, 10)}; цена и уровень со страницы предмета)`,
  columns: [
    { key: 'cat', title: 'Категория', type: 'cat' },
    { key: 'tier', title: 'Уровень', type: 'num', near: 1 },
    { key: 'stats', title: 'Бонусы', type: 'set' },
    { key: 'active', title: 'Активка', type: 'cat' },
    { key: 'price', title: 'Цена', type: 'num', near: 500 },
    { key: 'parts', title: 'Компонентов', type: 'num', near: 0 },
    { key: 'from', title: 'Собирается из', type: 'set' },
  ],
  items,
});
