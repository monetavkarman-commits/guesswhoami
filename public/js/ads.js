// Direct (sponsor) ads, managed in the admin panel (supabase/ads.sql). No third-party scripts, no cookies, no visitor ids:
// the server only counts views and clicks per ad. Every ad is labelled "Реклама" and links with rel="sponsored".
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { tr } from './i18n.js';
import { h } from './core.js';

const call = (fn, args) => fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
  method: 'POST', keepalive: true, headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
});

async function fill(el, slot) {
  el.innerHTML = ''; el.hidden = true;
  try {
    const r = await call('get_ad', { p_slot: slot });
    const ad = r.ok ? await r.json() : null;
    if (!ad || !ad.id) return;
    let counted = false;
    const link = h('a', { class: 'ad-card', href: ad.url, target: '_blank', rel: 'sponsored nofollow noopener' },
      ad.img ? h('img', { class: 'ad-img', src: ad.img, alt: '' }) : null,
      h('span', { class: 'ad-text' }, h('b', {}, ad.title), ad.body ? h('small', {}, ad.body) : null));
    const click = () => { call('ad_event', { p_id: ad.id, p_kind: 'click' }).catch(() => {}); };
    link.addEventListener('click', click); link.addEventListener('auxclick', click);
    el.append(h('span', { class: 'ad-label' }, tr('Реклама') + (ad.advertiser ? ' · ' + ad.advertiser : '')), link);
    el.hidden = false;
    // one view per showing, counted when the ad is really on screen
    const seen = () => { if (!counted) { counted = true; call('ad_event', { p_id: ad.id, p_kind: 'view' }).catch(() => {}); } };
    if ('IntersectionObserver' in window) { const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { seen(); io.disconnect(); } }, { threshold: 0.5 }); io.observe(el); } else seen();
  } catch { /* no ad is fine */ }
}

export function refreshAds(isHome) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || window.claude) return;
  const main = document.getElementById('ad-main'), foot = document.getElementById('ad-footer');
  if (main) fill(main, isHome ? 'home' : 'game');
  if (foot) fill(foot, 'footer');
}
