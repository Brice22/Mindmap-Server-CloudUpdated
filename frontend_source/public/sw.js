const CACHE_NAME = 'hserver-v2';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
];

// Install: cache shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for static
self.addEventListener('fetch', (event) => {
   const url = new URL(event.request.url);

  // Only handle normal GET requests from this site (skips chrome-extension://, POST, other sites)
  if (event.request.method !== 'GET' || !url.protocol.startsWith('http') || url.origin !== self.location.origin) {
    return;
  }

  // Never cache API calls, pages, or app code — caching these served stale versions after edits
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/') ||
      event.request.mode === 'navigate' || url.hostname === 'localhost') {
    return;
  }

  // Cache-first for everything else (only cache GET requests)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        if (event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});