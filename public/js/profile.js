// Player window with three tabs: profile (who you are, achievements), statistics (rating place, totals per game) and settings.
import { tr, lang, setLang } from './i18n.js';
import { h, modal, toast, store, GAMES } from './core.js';
import { client, currentUser, nameOf, openAccount } from './account.js';
import { mySummary, fillLeaderboard } from './online.js';
import { localStatsBlock, achievementsBlock, overallLocal, unlocked, ACHIEVEMENTS } from './achievements.js';
import { askConsent, consent } from './consent.js';

const AVATARS = ['🎮', '🎯', '🦊', '🐺', '🐯', '🦁', '🐼', '🦉', '🐙', '🚀', '⚡', '🔥', '👑', '🧠', '🎧', '⚽', '🏀', '🏒'];
const SITE_VERSION = '73';
const tile = (v, l) => h('div', { class: 'stat-tile' }, h('b', {}, String(v)), h('span', {}, l));
export const avatarOf = (u) => (u && u.user_metadata && u.user_metadata.avatar) || '🎮';

export async function openPlayer(startTab = 'stats', ctx = {}) {
  const sb = await client();
  let user = sb ? await currentUser() : null;
  const body = h('div', { class: 'stack player' });
  const tabs = h('div', { class: 'seg account-seg' });
  const pane = h('div', { class: 'stack' });
  modal(tr('Игрок'), h('div', { class: 'stack' }, tabs, pane), null, 'wide');
  let sum; let sumP = user ? mySummary() : Promise.resolve(null);
  const T = [['stats', tr('Моя статистика')], ['rating', tr('Рейтинг')], ['ach', tr('Достижения')]];
  let cur = startTab;
  const loginCta = () => h('div', { class: 'card-soft' }, h('p', {}, tr('Войдите, чтобы попасть в рейтинг и сохранить статистику на всех устройствах.')),
    sb ? h('button', { class: 'btn', onclick: () => openAccount(sb, null) }, tr('Войти')) : null);

  async function show(tab) {
    cur = tab; tabs.innerHTML = '';
    T.forEach(([id, label]) => tabs.append(h('button', { class: id === tab ? 'active' : '', onclick: () => show(id) }, label)));
    pane.innerHTML = '';
    if (tab === 'stats') {
      const l = overallLocal();
      pane.append(h('div', { class: 'player-head' }, h('div', { class: 'avatar-big' }, user ? avatarOf(user) : '👤'), h('h3', {}, user ? nameOf(user) : tr('Гость'))));
      pane.append(h('p', { class: 'muted' }, tr('Загрузка…')));
      sum = await sumP; if (cur !== 'stats') return;
      pane.lastChild.remove();
      if (user && sum) {
        const by = Object.entries(sum.by || {}).sort((a, b) => b[1].t - a[1].t);
        pane.append(h('h4', {}, tr('Общая статистика')),
          h('div', { class: 'stat-tiles' }, tile(sum.place ? sum.place + ' / ' + sum.of : '—', tr('место в рейтинге')), tile(sum.total || 0, tr('очков всего')), tile(sum.games || 0, tr('сыграно игр')), tile(sum.games ? Math.round(sum.total / sum.games) : 0, tr('среднее за игру'))),
          by.length ? h('ul', { class: 'pages' }, by.map(([g, v]) => h('li', {}, h('span', {}, (GAMES[g] ? GAMES[g].short : g) + ' · ' + tr('{0} игр', [v.n]) + ' · ' + tr('рекорд {0}', [v.best])), h('b', {}, String(v.t))))) : h('p', { class: 'muted small' }, tr('Разбивка по играм появится после следующих ежедневок.')));
      } else if (!user) pane.append(loginCta());
      pane.append(h('div', { class: 'stat-tiles' }, tile(l.played, tr('сыграно ежедневок')), tile(l.played ? Math.round(100 * l.wins / l.played) + '%' : '—', tr('побед')), tile(l.streak, tr('текущая серия')), tile(l.best, tr('лучшая серия'))),
        h('h4', {}, tr('Ежедневные игры на этом устройстве')), localStatsBlock());
    } else if (tab === 'rating') {
      const box = h('div', { class: 'stack' }); pane.append(box);
      await fillLeaderboard(box, ctx.game || 'cs', ctx.day || 1, false);
    } else {
      pane.append(achievementsBlock());
    }
  }

  show(startTab);
}

function profileSettings(sb, user, loginCta, rerender) {
  {
    const out = [];
    const msg = h('p', { class: 'muted small' });
    if (user) {
      const nick = h('input', { class: 'search-input', maxlength: 24, value: user.user_metadata?.name || nameOf(user) });
      let avatar = avatarOf(user);
      const av = h('div', { class: 'avatar-pick' }, AVATARS.map((a) => { const b = h('button', { type: 'button', class: a === avatar ? 'on' : '', onclick: () => { avatar = a; av.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.textContent === a)); } }, a); return b; }));
      const save = h('button', { class: 'btn', onclick: async () => {
        const name = nick.value.trim().slice(0, 24);
        if (name.length < 2) { msg.textContent = tr('Ник должен быть не короче 2 символов.'); return; }
        save.disabled = true;
        const { data, error } = await sb.auth.updateUser({ data: { name, avatar } });
        save.disabled = false;
        if (error) { msg.textContent = tr('Ошибка: {0}', [error.message]); return; }
        user = data.user;
        try { await sb.from('profiles').upsert({ id: user.id, name }); } catch { /* not fatal */ }
        toast(tr('Сохранено')); rerender(user);
      } }, tr('Сохранить'));
      const p1 = h('input', { class: 'search-input', type: 'password', autocomplete: 'new-password', placeholder: tr('Новый пароль (от 8 символов)'), maxlength: 72 });
      const pbtn = h('button', { class: 'btn ghost', onclick: async () => {
        if (p1.value.length < 8) { msg.textContent = tr('Пароль должен быть не короче 8 символов.'); return; }
        const { error } = await sb.auth.updateUser({ password: p1.value });
        if (error) { msg.textContent = tr('Ошибка: {0}', [error.message]); return; }
        p1.value = ''; toast(tr('Пароль изменён'));
      } }, tr('Сменить пароль'));
      out.push(h('h4', {}, tr('Профиль')), h('label', { class: 'muted small' }, tr('Ник в рейтинге')), nick, h('label', { class: 'muted small' }, tr('Аватар')), av, save,
        h('h4', {}, tr('Безопасность')), p1, pbtn);
    } else out.push(loginCta());
    const themeBtn = document.getElementById('theme-btn');
    out.push(h('h4', {}, tr('Сайт')),
      h('div', { class: 'row-between' }, h('span', {}, tr('Язык')), h('button', { class: 'btn ghost small', onclick: () => setLang(lang === 'ru' ? 'en' : 'ru') }, lang === 'ru' ? 'Русский → English' : 'English → Русский')),
      h('div', { class: 'row-between' }, h('span', {}, tr('Тема')), h('button', { class: 'btn ghost small', onclick: () => { themeBtn.click(); toast(themeBtn.title); } }, tr('Переключить'))),
      h('div', { class: 'row-between' }, h('span', {}, tr('Анонимная статистика') + ': ' + (consent() === 'yes' ? tr('включена') : tr('выключена'))), h('button', { class: 'btn ghost small', onclick: () => askConsent(true) }, tr('Изменить'))));
    if (user) {
      out.push(h('h4', {}, tr('Аккаунт')),
        h('button', { class: 'btn ghost', onclick: async () => { await sb.auth.signOut(); document.querySelector('.modal-back')?.remove(); toast(tr('Вы вышли из аккаунта')); } }, tr('Выйти')),
        h('button', { class: 'btn ghost danger', onclick: async () => {
          if (!confirm(tr('Удалить аккаунт, ник и очки в рейтинге навсегда? Отменить нельзя.'))) return;
          const { error } = await sb.rpc('delete_my_account');
          if (error) { msg.textContent = tr('Не получилось удалить: {0}', [error.message]); return; }
          await sb.auth.signOut(); document.querySelector('.modal-back')?.remove(); toast(tr('Аккаунт удалён'));
        } }, tr('Удалить аккаунт')));
    }
    out.push(msg);
    return out;
  }
}

// the "Профиль" button: who you are and the settings
export async function openProfile() {
  const sb = await client();
  const user = sb ? await currentUser() : null;
  const pane = h('div', { class: 'stack' });
  const close = modal(tr('Профиль'), pane, null, 'wide');
  const draw = (u) => {
    pane.innerHTML = '';
    const loginCta = () => h('div', { class: 'card-soft' }, h('p', {}, tr('Войдите, чтобы попасть в рейтинг и сохранить статистику на всех устройствах.')),
      sb ? h('button', { class: 'btn', onclick: () => { close(); openAccount(sb, null); } }, tr('Войти')) : null);
    pane.append(h('div', { class: 'player-head' }, h('div', { class: 'avatar-big' }, u ? avatarOf(u) : '👤'),
      h('div', {}, h('h3', {}, u ? nameOf(u) : tr('Гость')), u ? h('div', { class: 'muted small' }, u.email, ' · ', tr('с {0}', [new Date(u.created_at).toLocaleDateString(lang === 'en' ? 'en-GB' : 'ru-RU')])) : h('div', { class: 'muted small' }, tr('Вы играете без аккаунта')))),
      ...profileSettings(sb, u, loginCta, draw));
    // owner and staff get a shortcut to the panel (the server decides who may open it, this only hides the link)
    const adminLink = (role) => h('a', { class: 'btn', href: 'admin.html' }, tr('Открыть админку') + (role === 'owner' ? '' : ' (' + tr('сотрудник') + ')'));
    const place = (el) => { if (pane.isConnected) pane.insertBefore(el, pane.children[1] || null); };
    if (u && sb) {
      let shown = null;
      if (store.get('isAdmin', null)) { shown = adminLink(store.get('isAdmin')); place(shown); }   // instant on later visits
      sb.rpc('admin_me').then(({ data, error }) => {
        if (data) { store.set('isAdmin', data.role); if (!shown) place(adminLink(data.role)); }
        else { store.set('isAdmin', null); if (shown) shown.remove(); if (error && !/forbidden/.test(error.message)) place(h('p', { class: 'muted small' }, 'admin_me: ' + error.message)); }
      });
    }
    pane.append(h('p', { class: 'muted small' }, tr('Версия сайта') + ': ' + SITE_VERSION));
  };
  draw(user);
}
