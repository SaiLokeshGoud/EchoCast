// EchoCast Progressive Web App Service Worker
const CACHE_NAME = 'echocast-shell-v1';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS).catch((err) => {
        console.warn('[EchoCast SW] Initial shell cache skipped in dev:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Live streaming endpoints, WebSocket, and dynamic audio ranges must bypass service worker cache
  if (
    url.pathname.startsWith('/api/audio/stream') ||
    url.pathname.startsWith('/api/audio/upload') ||
    url.pathname.startsWith('/api/server') ||
    url.pathname.startsWith('/api/network') ||
    url.pathname.startsWith('/ws') ||
    event.request.method !== 'GET' ||
    event.request.headers.has('range')
  ) {
    return;
  }

  // Network-first strategy with cache fallback for static app assets
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Network unavailable', { status: 503, statusText: 'Offline' });
        });
      })
  );
});
