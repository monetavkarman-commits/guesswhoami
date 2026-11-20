// Anonymous visit statistics for the owner's dashboard. Runs only with consent: a random id (no email, no IP stored by us; the nickname of a logged-in user is attached),
// one "visit" per browser session and a "ping" every minute while the page is open (that is how "online now" is counted).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { store } from './core.js';
import { consent } from './consent.js';
import { currentUser, nameOf } from './account.js';

const ok = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY) && !window.claude && consent() === 'yes';
let timer = null, uname = null;
const setName = (u) => { uname = u ? String(nameOf(u)).slice(0, 40) : null; };
document.addEventListener('gwai:auth', (e) => setName(e.detail && e.detail.user));

function vid() {
  let v = store.get('vid', null);
  if (!v) { v = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)); store.set('vid', v); }
  return v;
}

export function track(kind, path, info) {
  if (!ok()) return;
  fetch(SUPABASE_URL + '/rest/v1/events', {
    method: 'POST', keepalive: true,
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ vid: vid(), kind, path: (path || location.hash || '#').slice(0, 120), info: info ? String(info).slice(0, 400) : null, uname }),
  }).catch(() => {});
}

export async function startAnalytics() {
  if (!ok()) return;
  try { setName(await currentUser()); } catch { /* ignore */ }
  let seen = false;
  try { seen = sessionStorage.getItem('gwai:sess') === '1'; sessionStorage.setItem('gwai:sess', '1'); } catch { /* ignore */ }
  if (!seen) track('visit');
  if (!timer) timer = setInterval(() => { if (document.visibilityState === 'visible') track('ping'); }, 60000);
}
document.addEventListener('gwai:consent', startAnalytics);

// a visitor's own message about wrong data; sent on request, so it needs no consent and carries no id
export async function sendReport(text) {
  if (!SUPABASE_URL || window.claude) return false;
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/events', { method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ vid: 'report-' + Math.random().toString(36).slice(2, 12), kind: 'report', path: (location.hash || '#').slice(0, 120), info: text.slice(0, 400) }) });
    return r.ok;
  } catch { return false; }
}
