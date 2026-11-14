const CACHE = 'daily-log-life-v5';
const ASSETS = ['./', './index.html', './app.js', './core.js', './style.css', './manifest.webmanifest', './apple-touch-icon-v3.png', './icon-192-v3.png', './icon-512-v3.png'];
const urls = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(path => new Request(new URL(path, self.registration.scope), { cache: 'reload' })))));
  // Existing clients retain their version until the user chooses to update.
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('daily-log-') && key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Navigation queries (e.g. an old icon bookmark) map to the same cached shell.
  const navigation = event.request.mode === 'navigate' && url.pathname.startsWith(new URL(self.registration.scope).pathname);
  if (!navigation && !urls.has(url.href)) return;
  // Atomic shell: all scripts and styles come from the same installed version.
  event.respondWith(caches.open(CACHE).then(async cache => {
    const response = await cache.match(navigation ? './index.html' : event.request);
    return response || fetch(event.request);
  }));
});
