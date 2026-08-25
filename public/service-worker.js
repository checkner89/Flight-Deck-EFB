const CACHE_NAME = 'flight-deck-efb-v179';
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css?v=1.7.9',
  '/si-operations.css?v=1.7.9',
  '/app.js?v=1.7.9',
  '/live-traffic.js?v=1.7.9',
  '/si-operations.js?v=1.7.9',
  '/i18n.js?v=1.7.9',
  '/flight-phases.js?v=1.7.9',
  '/manifest.webmanifest',
  '/assets/app-icon.svg',
  '/assets/app-icon-192.png',
  '/assets/app-icon-512.png',
  '/vendor/leaflet/leaflet.css',
  '/vendor/leaflet/leaflet.js',
  '/vendor/leaflet/images/marker-icon.png',
  '/vendor/leaflet/images/marker-shadow.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME && !key.startsWith('flight-deck-airport-maps-')).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match(event.request).then(async (cached) => (
      cached
      || await caches.match(url.pathname)
      || new Response('Flight Deck EFB is offline and this resource is not cached.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    ))),
  );
});
