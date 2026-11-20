// Optional accounts on our own domain: sign up or log in with email (password or a one-time link).
// Playing never requires an account; it only puts your daily scores on the leaderboard.
import { tr } from './i18n.js';
import { h, modal, toast } from './core.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const accountsEnabled = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY) && !window.claude;

let clientP = null;
export function client() {
  if (!accountsEnabled()) return Promise.resolve(null);
  if (!clientP) {
    clientP = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'vendor/supabase.js';
      s.onload = () => resolve(window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, detectSessionInUrl: true } }));
      s.onerror = () => resolve(null);
      document.head.append(s);
    });
  }
  return clientP;
}

export async function currentUser() {
  const sb = await client(); if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session ? data.session.user : null;
}

const nameOf = (u) => (u && (u.user_metadata?.name || u.email?.split('@')[0])) || tr('Игрок');

// keeps the public nickname in the profiles table in step with the account
async function saveProfile(sb, user) {
  try { await sb.from('profiles').upsert({ id: user.id, name: nameOf(user).slice(0, 24) }); } catch { /* not fatal */ }
}

export async function initAccountButton(btn) {
  if (!btn || !accountsEnabled()) return;
  const sb = await client(); if (!sb) return;
  btn.hidden = false;
  const paint = (user) => { btn.textContent = user ? '👤' : tr('Войти'); btn.classList.toggle('text', !user); btn.title = user ? nameOf(user) : ''; };
  paint(await currentUser());
  sb.auth.onAuthStateChange((ev, session) => {
    paint(session && session.user);
    if (ev === 'SIGNED_IN' && session) { saveProfile(sb, session.user); document.dispatchEvent(new CustomEvent('gwai:auth')); }
  });
  btn.addEventListener('click', async () => openAccount(sb, await currentUser()));
}

function openAccount(sb, user) {
  const body = h('div', { class: 'stack account' });
  const close = modal(user ? tr('Аккаунт') : tr('Вход в аккаунт'), body);
  if (user) {
    body.append(h('p', {}, tr('Вы вошли как '), h('b', {}, nameOf(user)), h('br'), h('span', { class: 'muted' }, user.email)),
      h('p', { class: 'muted' }, tr('Ваши результаты ежедневок попадают в рейтинг.')),
      h('button', { class: 'btn ghost', onclick: async () => { await sb.auth.signOut(); close(); toast(tr('Вы вышли из аккаунта')); } }, tr('Выйти')));
    return;
  }
  let mode = 'login';
  const email = h('input', { class: 'search-input', type: 'email', autocomplete: 'email', placeholder: tr('Почта'), maxlength: 120 });
  const pass = h('input', { class: 'search-input', type: 'password', autocomplete: 'current-password', placeholder: tr('Пароль (от 8 символов)'), maxlength: 72 });
  const nick = h('input', { class: 'search-input', type: 'text', autocomplete: 'nickname', placeholder: tr('Ник в рейтинге'), maxlength: 24 });
  const msg = h('p', { class: 'muted small' });
  const submit = h('button', { class: 'btn' });
  const tabs = h('div', { class: 'seg account-seg' });
  const draw = () => {
    tabs.innerHTML = '';
    tabs.append(h('button', { class: mode === 'login' ? 'active' : '', onclick: () => { mode = 'login'; draw(); } }, tr('Вход')),
      h('button', { class: mode === 'signup' ? 'active' : '', onclick: () => { mode = 'signup'; draw(); } }, tr('Регистрация')));
    nick.style.display = mode === 'signup' ? '' : 'none';
    pass.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    submit.textContent = mode === 'signup' ? tr('Создать аккаунт') : tr('Войти');
    msg.textContent = '';
  };
  const busy = (on) => { submit.disabled = on; };
  const fail = (e) => { msg.textContent = tr('Ошибка: {0}', [e.message || e]); busy(false); };
  submit.addEventListener('click', async () => {
    const em = email.value.trim(); const pw = pass.value;
    if (!/^\S+@\S+\.\S+$/.test(em)) { msg.textContent = tr('Проверьте почту.'); return; }
    if (pw.length < 8) { msg.textContent = tr('Пароль должен быть не короче 8 символов.'); return; }
    busy(true);
    if (mode === 'signup') {
      const { data, error } = await sb.auth.signUp({ email: em, password: pw, options: { data: { name: nick.value.trim() || em.split('@')[0] }, emailRedirectTo: location.origin + location.pathname } });
      if (error) return fail(error);
      if (data.session) { close(); toast(tr('Аккаунт создан')); return; }
      msg.textContent = tr('Мы отправили письмо на {0}. Откройте ссылку в нём, чтобы подтвердить почту.', [em]); busy(false);
    } else {
      const { error } = await sb.auth.signInWithPassword({ email: em, password: pw });
      if (error) return fail(error);
      close(); toast(tr('Вы вошли'));
    }
  });
  const magic = h('button', { class: 'btn ghost small', onclick: async () => {
    const em = email.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(em)) { msg.textContent = tr('Сначала впишите почту.'); return; }
    const { error } = await sb.auth.signInWithOtp({ email: em, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) return fail(error);
    msg.textContent = tr('Ссылка для входа отправлена на {0}.', [em]);
  } }, tr('Войти по ссылке на почту, без пароля'));
  draw();
  body.append(tabs, email, nick, pass, submit, magic, msg,
    h('p', { class: 'muted small' }, tr('Аккаунт не обязателен: играть можно и без него. Он нужен, чтобы попасть в рейтинг.')));
  setTimeout(() => email.focus(), 0);
}
