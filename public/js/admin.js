// Owner's panel: statistics, reports (with status), users, data health and settings (banner, notifications, backup).
// Every server call goes through functions that check that the logged-in account is an admin (supabase/admin.sql, analytics.sql).
import { h, store, toast } from './core.js';
import { client, currentUser, openAccount } from './account.js';

const root = document.getElementById('admin');
const PERIODS = [['1ч', 3600e3, 'hour'], ['24ч', 864e5, 'hour'], ['7 дней', 7 * 864e5, 'day'], ['30 дней', 30 * 864e5, 'day'], ['90 дней', 90 * 864e5, 'day']];
const TABS = [['stats', 'Статистика'], ['reports', 'Жалобы'], ['users', 'Пользователи'], ['data', 'Данные'], ['settings', 'Настройки']];
const REPO = 'monetavkarman-commits/guesswhoami';
let per = 1, timer = null, tab = store.get('adminTab', 'stats');

const fmt = (iso, bucket) => { const d = new Date(iso); return bucket === 'hour' ? d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }); };
const dt = (iso) => (iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const tile = (n, label) => h('div', { class: 'stat-tile' }, h('b', {}, String(n ?? 0)), h('span', {}, label));
const err = (e) => h('p', { class: 'error' }, /forbidden/.test(e.message) ? 'Этот аккаунт не админ. Добавьте его почту в таблицу admins (см. supabase/analytics.sql).' : 'Ошибка: ' + e.message);
const list = (rows, label, value) => (rows.length ? h('ul', { class: 'pages' }, rows.map((r) => h('li', {}, h('span', {}, label(r)), h('b', {}, value(r))))) : h('p', { class: 'muted' }, 'Пока нет данных.'));

// ---------- statistics ----------
async function statsTab(sb, box) {
  const fromI = h('input', { type: 'datetime-local', class: 'search-input' }); const toI = h('input', { type: 'datetime-local', class: 'search-input' });
  const body = h('div', {}, h('p', { class: 'muted' }, 'Загрузка…'));
  const refresh = async () => {
    const custom = fromI.value && toI.value;
    const [, ms, bucket] = PERIODS[per];
    const since = custom ? new Date(fromI.value) : new Date(Date.now() - ms); const until = custom ? new Date(toI.value) : new Date();
    const { data, error } = await sb.rpc('admin_stats', { since: since.toISOString(), until: until.toISOString(), bucket });
    body.innerHTML = '';
    if (error) { body.append(err(error)); return; }
    const max = Math.max(1, ...data.series.map((x) => x.unique));
    body.append(
      h('div', { class: 'stat-tiles' }, tile(data.online_now, 'сейчас онлайн'), tile(data.unique, 'уникальных за период'), tile(data.new_unique, 'из них новых'), tile(data.returning, 'вернулись (2+ дня)'),
        tile(data.visits, 'заходов (сессий)'), tile(data.users, 'аккаунтов всего'), tile(data.users_new, 'новых аккаунтов'), tile(data.reports_open, 'открытых жалоб')),
      h('h3', {}, 'Посетители по ' + (bucket === 'hour' ? 'часам' : 'дням')),
      h('div', { class: 'bars' }, data.series.length ? data.series.map((x) => { const b = h('div', { class: 'bar', title: `${fmt(x.t, bucket)}: ${x.unique} уникальных, ${x.visits} заходов` }, h('i', {}), h('small', {}, fmt(x.t, bucket))); b.firstChild.style.height = Math.max(3, (x.unique / max) * 100) + '%'; return b; }) : h('p', { class: 'muted' }, 'За этот период данных нет.')),
      h('h3', {}, 'Откуда приходят'), list(data.referrers, (r) => r.src, (r) => r.n),
      h('h3', {}, 'С какой игры начинают'), list(data.entry, (r) => r.page, (r) => r.n),
      h('h3', {}, 'Время в разделах (минут активности)'), list(data.pages, (p) => p.page + ' · ' + p.people + ' чел.', (p) => p.n + ' мин'),
      h('h3', {}, 'Посетители'),
      h('table', { class: 'visitors' }, h('tr', {}, ...['Имя', 'Минут', 'Заходов', 'Последний раз', 'Чаще всего'].map((t) => h('th', {}, t))),
        ...data.visitors.map((v) => h('tr', {}, h('td', {}, v.name || 'гость'), h('td', {}, String(v.minutes)), h('td', {}, String(v.visits)), h('td', {}, dt(v.last_seen)), h('td', {}, v.top_page || '—')))),
      h('p', { class: 'muted small' }, 'В статистику попадают только посетители, согласившиеся на аналитику. Реальных людей немного больше. Источники считаются с момента этого обновления.'));
  };
  const chips = h('div', { class: 'seg' }, PERIODS.map(([l], i) => h('button', { class: i === per ? 'active' : '', onclick: () => { per = i; fromI.value = toI.value = ''; show(sb); } }, l)));
  box.append(chips, h('div', { class: 'range' }, h('span', { class: 'muted' }, 'или период:'), fromI, toI, h('button', { class: 'btn small', onclick: refresh }, 'Показать')), body);
  await refresh();
  timer = setInterval(refresh, 30000);
}

// ---------- reports ----------
let repFilter = 'open';
const STATUS = { open: 'новая', progress: 'в работе', fixed: 'исправлено', wontfix: 'не баг' };
async function reportsTab(sb, box) {
  const body = h('div', {}, h('p', { class: 'muted' }, 'Загрузка…'));
  const load = async () => {
    const { data, error } = await sb.rpc('admin_reports', { p_filter: repFilter });
    body.innerHTML = '';
    if (error) { body.append(err(error)); return; }
    if (!data.length) { body.append(h('p', { class: 'muted' }, 'Пусто.')); return; }
    const set = async (id, status, note) => { const { error: e } = await sb.rpc('admin_set_report', { p_id: id, p_status: status, p_note: note || null }); if (e) toast(e.message); else load(); };
    data.forEach((r) => {
      const note = h('input', { class: 'search-input small', placeholder: 'Заметка (необязательно)', maxlength: 400, value: r.note || '' });
      body.append(h('div', { class: 'rep' },
        h('div', {}, h('span', { class: 'chip ' + r.status }, STATUS[r.status]), ' ', h('small', { class: 'muted' }, dt(r.created_at) + ' · ' + r.path)),
        h('div', {}, r.info), note,
        h('div', { class: 'acts' },
          r.status !== 'progress' ? h('button', { class: 'btn ghost small', onclick: () => set(r.id, 'progress', note.value) }, 'В работу') : null,
          h('button', { class: 'btn small', onclick: () => set(r.id, 'fixed', note.value) }, 'Исправлено'),
          h('button', { class: 'btn ghost small', onclick: () => set(r.id, 'wontfix', note.value) }, 'Не баг'),
          r.status === 'fixed' || r.status === 'wontfix' ? h('button', { class: 'btn ghost small', onclick: () => set(r.id, 'open', note.value) }, 'Вернуть') : null)));
    });
  };
  box.append(h('div', { class: 'seg' }, [['open', 'Открытые'], ['done', 'Закрытые'], ['all', 'Все']].map(([k, l]) => h('button', { class: k === repFilter ? 'active' : '', onclick: () => { repFilter = k; show(sb); } }, l))), body);
  await load();
}

// ---------- users ----------
async function usersTab(sb, box) {
  const q = h('input', { class: 'search-input', placeholder: 'Поиск по почте или нику', maxlength: 60 });
  const body = h('div', {});
  const act = async (fn, args, ok) => { const { error } = await sb.rpc(fn, args); if (error) toast(error.message); else { toast(ok); load(); } };
  const load = async () => {
    body.innerHTML = '';
    const { data, error } = await sb.rpc('admin_users', { p_q: q.value.trim() });
    if (error) { body.append(err(error)); return; }
    body.append(h('p', { class: 'muted small' }, `Показано: ${data.length} (до 100, новые сверху)`),
      h('div', { class: 'xscroll' }, h('table', { class: 'utable' }, h('tr', {}, ...['Ник', 'Почта', 'Вход', 'Регистрация', 'Очки / игры', ''].map((t) => h('th', {}, t))),
        ...data.map((u) => h('tr', {}, h('td', {}, u.name || '—', u.banned ? h('span', { class: 'chip open' }, 'бан') : null), h('td', {}, u.email || '—'), h('td', {}, u.provider),
          h('td', {}, dt(u.created_at)), h('td', {}, `${u.total} / ${u.games}`),
          h('td', {}, h('div', { class: 'acts' },
            h('button', { class: 'btn ghost small', onclick: () => { const n = prompt('Новый ник', u.name || ''); if (n) act('admin_set_nick', { p_id: u.id, p_name: n }, 'Ник изменён'); } }, 'Ник'),
            u.banned ? h('button', { class: 'btn ghost small', onclick: () => act('admin_ban', { p_id: u.id, p_ban: false }, 'Разбанен') }, 'Разбан')
              : h('button', { class: 'btn ghost small', onclick: () => { const r = prompt('Причина бана (необязательно). Игрок исчезнет из рейтинга и не сможет добавлять очки.', ''); if (r !== null) act('admin_ban', { p_id: u.id, p_ban: true, p_reason: r }, 'Забанен'); } }, 'Бан'),
            h('button', { class: 'btn ghost small', onclick: () => { if (confirm('Обнулить очки и убрать из рейтинга?')) act('admin_reset_score', { p_id: u.id }, 'Очки сброшены'); } }, 'Сброс очков'),
            h('button', { class: 'btn ghost small danger', onclick: () => { if (confirm('Удалить аккаунт ' + (u.email || u.name) + ' навсегда?')) act('admin_delete_user', { p_id: u.id }, 'Аккаунт удалён'); } }, 'Удалить'))))))));
  };
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
  box.append(h('div', { class: 'range' }, q, h('button', { class: 'btn small', onclick: load }, 'Найти')), body);
  await load();
}

// ---------- data health ----------
const DATASETS = ['cs', 'dota', 'valorant', 'lol', 'football', 'basket', 'tennis', 'hockey', 'mma', 'boxing'];
async function dataTab(sb, box) {
  box.append(h('p', { class: 'muted' }, 'Загрузка…'));
  const rows = [];
  await Promise.all(DATASETS.map(async (g) => {
    try {
      const d = await fetch(`data/${g}.json`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null));
      if (!d || !d.players) return;
      const p = d.players;
      rows.push({ g, gen: d.generated, n: p.length, noPhoto: p.filter((x) => !x.ph).length, noCountry: p.filter((x) => !x.cc).length, noTeam: p.filter((x) => !x.team && !x.last).length });
    } catch { /* missing dataset */ }
  }));
  rows.sort((a, b) => DATASETS.indexOf(a.g) - DATASETS.indexOf(b.g));
  let runs = null;
  try { const r = await fetch(`https://api.github.com/repos/${REPO}/actions/runs?per_page=10`); if (r.ok) runs = (await r.json()).workflow_runs; } catch { /* offline or private */ }
  box.innerHTML = '';
  box.append(h('h3', {}, 'Наборы данных'),
    h('div', { class: 'xscroll' }, h('table', { class: 'utable' }, h('tr', {}, ...['Игра', 'Собран', 'Игроков', 'Без фото', 'Без страны', 'Без команды'].map((t) => h('th', {}, t))),
      ...rows.map((r) => { const old = r.gen && Date.now() - new Date(r.gen).getTime() > 3 * 864e5; return h('tr', {}, h('td', {}, r.g), h('td', {}, dt(r.gen), old ? h('span', { class: 'chip open' }, 'давно') : null), h('td', {}, String(r.n)), h('td', {}, String(r.noPhoto)), h('td', {}, String(r.noCountry)), h('td', {}, String(r.noTeam))); }))),
    h('h3', {}, 'Автоматические задачи (GitHub Actions)'),
    runs ? h('ul', { class: 'pages' }, runs.map((r) => h('li', {}, h('span', {}, `${r.name} · ${dt(r.created_at)}`), h('b', { class: r.conclusion === 'success' ? '' : 'error' }, r.status !== 'completed' ? 'идёт' : r.conclusion === 'success' ? 'ок' : r.conclusion))))
      : h('p', { class: 'muted' }, 'Не удалось получить список (репозиторий закрытый или нет сети). Смотрите вкладку Actions на GitHub.'),
    h('p', { class: 'muted small' }, 'Данные CS и Dota 2 обновляются автоматически раз в 4 часа, остальные игры собираются вручную.'));
}

// ---------- settings: banner, notifications, backup ----------
async function settingsTab(sb, box) {
  const ann = (await sb.rpc('admin_get_announcement')).data || { text: '', active: false };
  const wh = (await sb.rpc('admin_webhook_state')).data || { set: false };
  const text = h('textarea', { class: 'search-input', maxlength: 240, placeholder: 'Например: Новый режим «Угадай состав»!' }); text.value = ann.text || '';
  const active = h('input', { type: 'checkbox' }); active.checked = !!ann.active;
  const hook = h('input', { class: 'search-input', type: 'password', placeholder: wh.set ? 'Уже настроено (' + wh.kind + '). Вставьте новую ссылку, чтобы заменить' : 'Ссылка вебхука Discord или Telegram', maxlength: 300, autocomplete: 'off' });
  const call = async (fn, args, ok) => { const { error } = await sb.rpc(fn, args); toast(error ? error.message : ok); return !error; };
  box.append(
    h('h3', {}, 'Объявление на сайте'),
    h('p', { class: 'muted small' }, 'Показывается плашкой над шапкой всем посетителям, пока включено. Закрыть её можно крестиком.'), text,
    h('label', {}, active, ' показывать'), h('button', { class: 'btn', onclick: () => call('admin_set_announcement', { p_text: text.value, p_active: active.checked }, 'Сохранено') }, 'Сохранить объявление'),
    h('h3', {}, 'Уведомления о новых жалобах'),
    h('p', { class: 'muted small' }, 'Discord: канал → Настройки → Интеграции → Вебхуки → скопировать URL. Telegram: ссылка вида https://api.telegram.org/bot<токен>/sendMessage?chat_id=<id>. Ссылка хранится в базе, а видна только функции отправки.'), hook,
    h('div', { class: 'acts row-acts' },
      h('button', { class: 'btn', onclick: async () => { if (await call('admin_set_webhook', { p_url: hook.value.trim() }, hook.value.trim() ? 'Ссылка сохранена' : 'Уведомления выключены')) show(sb); } }, 'Сохранить'),
      h('button', { class: 'btn ghost', onclick: () => call('admin_test_webhook', {}, 'Тест отправлен, проверьте мессенджер') }, 'Отправить тест'),
      wh.set ? h('button', { class: 'btn ghost', onclick: async () => { if (await call('admin_set_webhook', { p_url: '' }, 'Уведомления выключены')) show(sb); } }, 'Выключить') : null),
    h('h3', {}, 'Резервная копия'),
    h('p', { class: 'muted small' }, 'Файл со всеми аккаунтами, никами, очками рейтинга, жалобами и событиями за 30 дней. Автоматически копия делается раз в сутки через GitHub Actions (workflow «Backup», хранится 30 дней). Пароли в копию не попадают.'),
    h('button', { class: 'btn', onclick: async () => {
      const { data, error } = await sb.rpc('admin_export');
      if (error) { toast(error.message); return; }
      const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })), download: 'guesswhoami-backup-' + new Date().toISOString().slice(0, 10) + '.json' });
      document.body.append(a); a.click(); a.remove();
    } }, 'Скачать копию сейчас'));
}

async function show(sb) {
  clearInterval(timer);
  const box = h('div', {});
  const tabs = h('div', { class: 'seg admin-tabs' }, TABS.map(([k, l]) => h('button', { class: k === tab ? 'active' : '', onclick: () => { tab = k; store.set('adminTab', k); show(sb); } }, l)));
  root.innerHTML = '';
  root.append(h('h1', {}, 'Управление'), tabs, box);
  const fn = { stats: statsTab, reports: reportsTab, users: usersTab, data: dataTab, settings: settingsTab }[tab] || statsTab;
  await fn(sb, box);
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
  show(sb);
})();
