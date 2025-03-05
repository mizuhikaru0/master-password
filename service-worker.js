const CACHE_NAME = 'password-manager-cache-v1';
const URLS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './js/app.js',
  './js/config.js',
  './js/crypto.js',
  './js/db.js',
  'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js'
];

self.addEventListener('install', event => {
  // Pasang file-file ke cache
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(URLS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', event => {
  // Hapus cache lama bila ada
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // Jika ada di cache, kembalikan; jika tidak, fetch dari jaringan
      return response || fetch(event.request);
    })
  );
});
