/* Кэш оболочки приложения. Запросы к API (script.google.com) не кэшируются никогда. */
const CACHE = 'pf-shell-1.1.3';
const SHELL = ['./', 'index.html', 'css/app.css?v=1.1.3', 'js/app.js?v=1.1.3', 'config.js?v=1.1.3', 'manifest.webmanifest', 'icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // API и шрифты — напрямую
  // сеть сначала (свежая версия после публикации), кэш — если связи нет
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
    return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
