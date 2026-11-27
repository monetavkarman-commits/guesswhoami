// Offline support: everything is network-first, so a new release shows up on the next visit; the cache is only the fallback when offline.
const VERSION = 'gwai-v88';
const SHELL = ['./', 'index.html', 'style.css', 'intro.css', 'js/intro.js', 'manifest.webmanifest', 'js/app.js', 'js/home.js', 'js/consent.js', 'js/analytics.js', 'js/core.js', 'js/core-store.js', 'js/i18n.js',
  'js/grid.js', 'js/whoami.js', 'js/chain.js', 'js/team.js', 'js/lineup.js', 'js/stats.js', 'js/achievements.js', 'js/profile.js', 'js/notice.js', 'js/ads.js', 'js/online.js', 'js/items.js', 'js/account.js', 'js/config.js', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/img/')) {
    // pictures never change under the same name: cache first, so the photo grids do not revalidate hundreds of files
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); } return r; })));
  } else if (url.pathname.includes('/data/')) {
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request)));
  } else {
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); } return r; })
      .catch(() => caches.match(e.request)));
  }
});
