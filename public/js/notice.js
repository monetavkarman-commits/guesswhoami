// Announcement banner: the owner switches it on in the admin panel (table announcements); shown until the visitor closes it.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { store } from './core.js';

export async function showNotice() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || window.claude) return;
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/announcements?select=text&active=eq.true&limit=1', { headers: { apikey: SUPABASE_ANON_KEY } });
    const rows = r.ok ? await r.json() : [];
    const text = rows[0] && rows[0].text;
    if (!text || store.get('noticeClosed', '') === text) return;
    const bar = document.createElement('div'); bar.className = 'notice-bar'; bar.setAttribute('role', 'status');
    const span = document.createElement('span'); span.textContent = text;
    const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Закрыть');
    x.addEventListener('click', () => { store.set('noticeClosed', text); bar.remove(); });
    bar.append(span, x);
    document.body.prepend(bar);
  } catch { /* the banner is optional */ }
}
