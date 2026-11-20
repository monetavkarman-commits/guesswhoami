// Offline support: app shell is cache-first, player data is network-first (falls back to cache offline).
const VERSION = 'gwai-v18';
const SHELL = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'js/app.js', 'js/core.js', 'js/core-store.js', 'js/i18n.js',
  'js/grid.js', 'js/whoami.js', 'js/chain.js', 'js/stats.js', 'js/achievements.js', 'js/online.js', 'js/items.js', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/data/')) {
    e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request)));
  } else {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
  }
});
