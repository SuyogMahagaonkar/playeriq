const CACHE_NAME = 'playeriq-v19';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg'
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

  // 0. Network-First for HTML documents (index.html, root) to prevent stale chunk errors on updates
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const cacheCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, cacheCopy);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(req).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            return caches.match('/');
          });
        })
    );
    return;
  }

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

  // 2. Stale-While-Revalidate with 24-hour expiration for TMDB metadata API calls
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

          if (cachedResponse) {
            const dateHeader = cachedResponse.headers.get('date');
            let isExpired = false;
            if (dateHeader) {
              const cachedTime = new Date(dateHeader).getTime();
              if (!isNaN(cachedTime)) {
                isExpired = (Date.now() - cachedTime) > 24 * 60 * 60 * 1000;
              }
            }
            if (!isExpired) {
              return cachedResponse;
            }
            // If expired, wait for network, fallback to cache if offline
            return fetchPromise.then(res => res || cachedResponse);
          }

          return fetchPromise;
        });
      })
    );
    return;
  }

  // 3. Stale-While-Revalidate with 24-hour expiration for MovieBox metadata (info & seasons)
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

          if (cachedResponse) {
            const dateHeader = cachedResponse.headers.get('date');
            let isExpired = false;
            if (dateHeader) {
              const cachedTime = new Date(dateHeader).getTime();
              if (!isNaN(cachedTime)) {
                isExpired = (Date.now() - cachedTime) > 24 * 60 * 60 * 1000;
              }
            }
            if (!isExpired) {
              return cachedResponse;
            }
            // If expired, wait for network, fallback to cache if offline
            return fetchPromise.then(res => res || cachedResponse);
          }

          return fetchPromise;
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
          if (!networkResponse || networkResponse.status !== 200 || (networkResponse.type !== 'basic' && networkResponse.type !== 'cors')) {
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
