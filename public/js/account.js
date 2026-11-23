// Optional accounts on our own domain: sign up or log in with email (password or a one-time link).
// Playing never requires an account; it only puts your daily scores on the leaderboard.
import { tr } from './i18n.js';
import { h, modal, toast, store } from './core.js';
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

export const nameOf = (u) => (u && (u.user_metadata?.name || u.email?.split('@')[0])) || tr('Игрок');

// keeps the public nickname in the profiles table in step with the account
async function saveProfile(sb, user) {
  try { await sb.from('profiles').upsert({ id: user.id, name: nameOf(user).slice(0, 24) }); } catch { /* not fatal */ }
}

export async function initAccountButton(btn) {
  if (!btn || !accountsEnabled()) return;
  const sb = await client(); if (!sb) return;
  btn.hidden = false;
  // the button is highlighted while nobody is logged in
  const paint = (user) => { btn.textContent = user ? ((user.user_metadata && user.user_metadata.avatar) || '👤') + ' ' + nameOf(user).slice(0, 12) : tr('Войти'); btn.classList.toggle('cta', !user); btn.title = user ? nameOf(user) : ''; };
  const first = await currentUser();
  paint(first);
  sb.auth.onAuthStateChange((ev, session) => {
    paint(session && session.user);
    if (ev === 'SIGNED_IN' && session) saveProfile(sb, session.user);
    document.dispatchEvent(new CustomEvent('gwai:auth', { detail: { user: session ? session.user : null } }));
  });
  btn.addEventListener('click', async () => { const u = await currentUser(); if (u) document.dispatchEvent(new CustomEvent('gwai:open-player')); else openAccount(sb, null); });
  // a visitor who plays without an account is offered one after the third answer (any game); not again for 3 days once it was closed
  let asked = false;
  document.addEventListener('gwai:answer', async () => {
    if (asked || !accountsEnabled()) return;
    const n = +store.get('answers', 0) + 1; store.set('answers', n);
    if (n < 3 || (await currentUser())) return;
    if (Date.now() - +store.get('loginPrompt', 0) < 3 * 86400000 || document.querySelector('.modal-back')) return;
    asked = true; setTimeout(() => { if (!document.querySelector('.modal-back')) openAccount(sb, null, true); }, 900);
  });
  // on entry: a visitor without an account is invited to log in or sign up (skipped right after an OAuth redirect; not again for 3 days once closed)
  if (!first && !/access_token|refresh_token|error_description|[?&]code=/.test(location.hash + location.search)) {
    setTimeout(async () => {
      if (asked || document.querySelector('.modal-back') || (await currentUser())) return;
      if (Date.now() - +store.get('loginPrompt', 0) < 3 * 86400000) return;
      asked = true; openAccount(sb, null, true);
    }, 1200);
  }
}

export function openAccount(sb, user, welcome = false) {
  const body = h('div', { class: 'stack account' });
  const close = modal(user ? tr('Аккаунт') : welcome ? tr('Добро пожаловать!') : tr('Вход в аккаунт'), body, () => { if (welcome) store.set('loginPrompt', Date.now()); });
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
  const social = h('div', { class: 'stack social' });
  providers().then((list) => list.forEach((pv) => social.append(h('button', { class: 'btn ghost social-btn', type: 'button', onclick: async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: pv.id, options: { redirectTo: location.origin + '/' } });
    if (error) msg.textContent = tr('Ошибка: {0}', [error.message]);
  } }, h('b', {}, pv.icon), ' ' + tr('Продолжить через {0}', [pv.name])))));
  if (welcome) body.append(h('p', {}, tr('Создайте аккаунт или войдите: ваши результаты попадут в общий рейтинг и сохранятся на всех устройствах.')));
  body.append(social, tabs, email, nick, pass, submit, magic, msg,
    h('p', { class: 'muted small' }, tr('Аккаунт не обязателен: играть можно и без него. Он нужен, чтобы попасть в рейтинг.')));
  if (welcome) body.append(h('button', { class: 'btn ghost', onclick: close }, tr('Играть без входа')));
  setTimeout(() => email.focus(), 0);
}

// only the sign-in providers that are switched on in Supabase get a button
const KNOWN = { google: ['Google', 'G'], discord: ['Discord', '◆'], github: ['GitHub', '⌥'] };
let provP = null;
function providers() {
  if (!provP) provP = fetch(SUPABASE_URL + '/auth/v1/settings', { headers: { apikey: SUPABASE_ANON_KEY } }).then((r) => r.json())
    .then((j) => Object.keys(KNOWN).filter((k) => j.external && j.external[k]).map((k) => ({ id: k, name: KNOWN[k][0], icon: KNOWN[k][1] }))).catch(() => []);
  return provP;
}
