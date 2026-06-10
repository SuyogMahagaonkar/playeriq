const CACHE_NAME = 'playeriq-v18';
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

  // 1. Cache-First for TMDB images (immutable poster/backdrop paths)
  if (url.hostname.includes('image.tmdb.org')) {
    event.respondWith(
      caches.open('playeriq-images').then((cache) => {
        return cache.match(req).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return fetch(req).then((networkResponse) => {
            if (networkResponse && (networkResponse.status === 200 || networkResponse.status === 0)) {
              cache.put(req, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => null);
        });
      })
    );
    return;
  }

  // 2. Stale-While-Revalidate for TMDB metadata API calls
  if (url.hostname.includes('api.themoviedb.org')) {
    event.respondWith(
      caches.open('playeriq-tmdb-metadata').then((cache) => {
        return cache.match(req).then((cachedResponse) => {
          const fetchPromise = fetch(req).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(req, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => null);
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // 3. Stale-While-Revalidate for MovieBox metadata (info & seasons)
  if (
    url.pathname.startsWith('/api/moviebox/info/') || 
    url.pathname.startsWith('/api/moviebox/seasons/')
  ) {
    event.respondWith(
      caches.open('playeriq-moviebox-metadata').then((cache) => {
        return cache.match(req).then((cachedResponse) => {
          const fetchPromise = fetch(req).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(req, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => null);
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // Bypass caching entirely for other dynamic API nodes, TMDB queries, or Firebase
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
