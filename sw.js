const CACHE_NAME = 'gestao-cargas-v6';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
    )
  );
  self.clients.claim();
});

function isSensitiveAuthRequest(request) {
  const url = new URL(request.url);
  const authParameters = [
    'recovery',
    'code',
    'type',
    'access_token',
    'refresh_token',
    'error',
    'error_code',
    'error_description',
  ];
  return request.mode === 'navigate' || authParameters.some((parameter) => url.searchParams.has(parameter));
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (isSensitiveAuthRequest(event.request)) {
    event.respondWith(fetch(event.request).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response.ok) return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
