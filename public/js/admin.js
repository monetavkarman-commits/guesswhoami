// Owner's dashboard: online now, unique visitors, visits, sign-ups and wrong-data reports for a chosen period.
import { h, store } from './core.js';
import { client, currentUser, openAccount } from './account.js';

const root = document.getElementById('admin');
const PERIODS = [['1ч', 3600e3, 'hour'], ['24ч', 864e5, 'hour'], ['7 дней', 7 * 864e5, 'day'], ['30 дней', 30 * 864e5, 'day'], ['90 дней', 90 * 864e5, 'day']];
let per = 1, timer = null;

const fmt = (iso, bucket) => { const d = new Date(iso); return bucket === 'hour' ? d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }); };
const tile = (n, label) => h('div', { class: 'stat-tile' }, h('b', {}, String(n ?? 0)), h('span', {}, label));

async function load(sb, from, to) {
  const [, ms, bucket] = PERIODS[per];
  const since = from ? new Date(from) : new Date(Date.now() - ms);
  const until = to ? new Date(to) : new Date();
  const { data, error } = await sb.rpc('admin_stats', { since: since.toISOString(), until: until.toISOString(), bucket });
  return { data, error, bucket };
}

async function draw(sb) {
  const fromI = h('input', { type: 'datetime-local', class: 'search-input' }); const toI = h('input', { type: 'datetime-local', class: 'search-input' });
  const body = h('div', {}, h('p', { class: 'muted' }, 'Загрузка…'));
  const refresh = async () => {
    const custom = fromI.value && toI.value;
    const { data, error, bucket } = await load(sb, custom ? fromI.value : null, custom ? toI.value : null);
    body.innerHTML = '';
    if (error) { body.append(h('p', { class: 'error' }, /forbidden/.test(error.message) ? 'Этот аккаунт не админ. Добавьте его почту в таблицу admins (см. supabase/analytics.sql).' : 'Ошибка: ' + error.message)); return; }
    const max = Math.max(1, ...data.series.map((x) => x.unique));
    body.append(
      h('div', { class: 'stat-tiles' }, tile(data.online_now, 'сейчас онлайн'), tile(data.unique, 'уникальных за период'), tile(data.new_unique, 'из них новых'),
        tile(data.visits, 'заходов (сессий)'), tile(data.users, 'аккаунтов всего'), tile(data.users_new, 'новых аккаунтов')),
      h('h3', {}, 'Посетители по ' + (bucket === 'hour' ? 'часам' : 'дням')),
      h('div', { class: 'bars' }, data.series.length ? data.series.map((x) => { const b = h('div', { class: 'bar', title: `${fmt(x.t, bucket)}: ${x.unique} уникальных, ${x.visits} заходов` }, h('i', {}), h('small', {}, fmt(x.t, bucket))); b.firstChild.style.height = Math.max(3, (x.unique / max) * 100) + '%'; return b; }) : h('p', { class: 'muted' }, 'За этот период данных нет.')),
      h('h3', {}, 'Время в разделах (минут активности)'),
      h('ul', { class: 'pages' }, data.pages.map((p) => h('li', {}, h('span', {}, p.page + ' · ' + p.people + ' чел.'), h('b', {}, p.n + ' мин')))),
      h('h3', {}, 'Посетители'),
      h('table', { class: 'visitors' }, h('tr', {}, ...['Имя', 'Минут', 'Заходов', 'Последний раз', 'Чаще всего'].map((t) => h('th', {}, t))),
        ...data.visitors.map((v) => h('tr', {}, h('td', {}, v.name || 'гость'), h('td', {}, String(v.minutes)), h('td', {}, String(v.visits)), h('td', {}, new Date(v.last_seen).toLocaleString('ru-RU')), h('td', {}, v.top_page || '—')))),
      h('h3', {}, 'Сообщения об ошибках в данных'),
      data.reports.length ? h('ul', { class: 'reports' }, data.reports.map((r) => h('li', {}, h('small', { class: 'muted' }, new Date(r.created_at).toLocaleString('ru-RU') + ' · ' + r.path), h('div', {}, r.info)))) : h('p', { class: 'muted' }, 'Пока нет.'),
      h('p', { class: 'muted small' }, 'В статистику попадают только посетители, согласившиеся на аналитику. Реальных людей немного больше.'));
  };
  const chips = h('div', { class: 'seg' }, PERIODS.map(([l], i) => h('button', { class: i === per ? 'active' : '', onclick: () => { per = i; fromI.value = toI.value = ''; draw(sb); } }, l)));
  root.innerHTML = '';
  root.append(h('h1', {}, 'Статистика'), chips,
    h('div', { class: 'range' }, h('span', { class: 'muted' }, 'или период:'), fromI, toI, h('button', { class: 'btn small', onclick: refresh }, 'Показать')), body);
  await refresh();
  clearInterval(timer); timer = setInterval(refresh, 30000);
}

(async () => {
  const sb = await client();
  if (!sb) { root.innerHTML = 'Аккаунты выключены.'; return; }
  const user = await currentUser();
  if (!user) {
    root.innerHTML = '';
    root.append(h('h1', {}, 'Админка'), h('p', { class: 'muted' }, 'Войдите аккаунтом владельца.'), h('button', { class: 'btn', onclick: () => openAccount(sb, null) }, 'Войти'));
    sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN') location.reload(); });
    return;
  }
  draw(sb);
})();
