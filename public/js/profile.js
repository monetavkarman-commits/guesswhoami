// Player window with three tabs: profile (who you are, achievements), statistics (rating place, totals per game) and settings.
import { tr, lang, setLang } from './i18n.js';
import { h, modal, toast, store, GAMES } from './core.js';
import { client, currentUser, nameOf, openAccount } from './account.js';
import { mySummary } from './online.js';
import { localStatsBlock, achievementsBlock, overallLocal, unlocked, ACHIEVEMENTS } from './achievements.js';
import { askConsent, consent } from './consent.js';

const AVATARS = ['🎮', '🎯', '🦊', '🐺', '🐯', '🦁', '🐼', '🦉', '🐙', '🚀', '⚡', '🔥', '👑', '🧠', '🎧', '⚽', '🏀', '🏒'];
const tile = (v, l) => h('div', { class: 'stat-tile' }, h('b', {}, String(v)), h('span', {}, l));
export const avatarOf = (u) => (u && u.user_metadata && u.user_metadata.avatar) || '🎮';

export async function openPlayer(startTab = 'profile') {
  const sb = await client();
  let user = sb ? await currentUser() : null;
  const body = h('div', { class: 'stack player' });
  const tabs = h('div', { class: 'seg account-seg' });
  const pane = h('div', { class: 'stack' });
  modal(tr('Игрок'), h('div', { class: 'stack' }, tabs, pane), null, 'wide');
  let sum; let sumP = user ? mySummary() : Promise.resolve(null);
  const T = [['profile', tr('Профиль')], ['stats', tr('Статистика')], ['settings', tr('Настройки')]];
  let cur = startTab;
  const loginCta = () => h('div', { class: 'card-soft' }, h('p', {}, tr('Войдите, чтобы попасть в рейтинг и сохранить статистику на всех устройствах.')),
    sb ? h('button', { class: 'btn', onclick: () => openAccount(sb, null) }, tr('Войти')) : null);

  async function show(tab) {
    cur = tab; tabs.innerHTML = '';
    T.forEach(([id, label]) => tabs.append(h('button', { class: id === tab ? 'active' : '', onclick: () => show(id) }, label)));
    pane.innerHTML = '';
    if (tab === 'profile') {
      const got = Object.keys(unlocked()).length;
      pane.append(h('div', { class: 'player-head' }, h('div', { class: 'avatar-big' }, user ? avatarOf(user) : '👤'),
        h('div', {}, h('h3', {}, user ? nameOf(user) : tr('Гость')), user ? h('div', { class: 'muted small' }, user.email, ' · ', tr('с {0}', [new Date(user.created_at).toLocaleDateString(lang === 'en' ? 'en-GB' : 'ru-RU')])) : h('div', { class: 'muted small' }, tr('Вы играете без аккаунта')))));
      if (!user) pane.append(loginCta());
      const l = overallLocal();
      pane.append(h('div', { class: 'stat-tiles' }, tile(l.played, tr('сыграно ежедневок')), tile(l.played ? Math.round(100 * l.wins / l.played) + '%' : '—', tr('побед')), tile(l.streak, tr('текущая серия')), tile(l.best, tr('лучшая серия')), tile(got + '/' + ACHIEVEMENTS.length, tr('достижений'))),
        achievementsBlock());
    } else if (tab === 'stats') {
      pane.append(h('p', { class: 'muted' }, tr('Загрузка…')));
      sum = await sumP; if (cur !== 'stats') return;
      pane.innerHTML = '';
      if (user && sum) {
        const by = Object.entries(sum.by || {}).sort((a, b) => b[1].t - a[1].t);
        pane.append(h('h4', {}, tr('Общий рейтинг')),
          h('div', { class: 'stat-tiles' }, tile(sum.place ? sum.place + ' / ' + sum.of : '—', tr('место в рейтинге')), tile(sum.total || 0, tr('очков всего')), tile(sum.games || 0, tr('сыграно игр')), tile(sum.games ? Math.round(sum.total / sum.games) : 0, tr('среднее за игру'))),
          by.length ? h('ul', { class: 'pages' }, by.map(([g, v]) => h('li', {}, h('span', {}, (GAMES[g] ? GAMES[g].short : g) + ' · ' + tr('{0} игр', [v.n]) + ' · ' + tr('рекорд {0}', [v.best])), h('b', {}, String(v.t))))) : h('p', { class: 'muted small' }, tr('Разбивка по играм появится после следующих ежедневок.')));
      } else if (!user) pane.append(loginCta());
      pane.append(h('h4', {}, tr('Ежедневные игры на этом устройстве')), localStatsBlock());
    } else {
      pane.append(...settings());
    }
  }

  function settings() {
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
        toast(tr('Сохранено')); show('settings');
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
  show(startTab);
}
