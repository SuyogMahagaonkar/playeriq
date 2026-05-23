const CACHE_NAME = 'playeriq-v6';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/src/main.js',
  '/manifest.json',
  '/icon.svg',
  '/src/styles/variables.css',
  '/src/styles/base.css',
  '/src/styles/animations.css',
  '/src/styles/sidebar.css',
  '/src/styles/navbar.css',
  '/src/styles/responsive.css'
];

// Install Event — cache structural app shell files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[PWA Service Worker] Caching standard app shell assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event — clear outdated app versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[PWA Service Worker] Clearing old cache version:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event — server cache-first for static elements, direct bypass for APIs
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Bypass caching entirely for dynamic API nodes, TMDB queries, or Firebase
  if (
    url.pathname.startsWith('/api/') || 
    url.hostname.includes('themoviedb.org') || 
    url.hostname.includes('firebase') || 
    req.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      // Otherwise fetch dynamically over network
      return fetch(req)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          // Cache on-the-fly secondary assets
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseToCache);
          });

          return networkResponse;
        })
        .catch(() => {
          // If offline and navigating to a page, serve the index html shell
          if (req.mode === 'navigate') {
            return caches.match('/');
          }
        });
    })
  );
});
