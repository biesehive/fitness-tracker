self.addEventListener('install', (event) => {
  event.waitUntil(
      caches.open('fit-tracker-cache').then((cache) => {
          return cache.addAll([
              './',
              './index.html',
              './css/styles.css',
              './js/app.js',
              './js/chart.js',
              './js/data.js',
              './images/exercise.png',
              './images/water.png',
              './images/settings.png',
              './images/graph.png',
              './images/trash-can.png',
              './images/water.png',
              '/images/sad.png',
              '/images/neutral.png',
              '/images/happy.png',
          ]);
      })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
      caches.match(event.request).then((response) => {
          return response || fetch(event.request);
      })
  );
});

// Define a cache name, use versioning for cache management
const CACHE_NAME = 'fitness-tracker-cache-v1';

// List of files to cache
const urlsToCache = [
  '/fitness-tracker/',
  '/fitness-tracker/index.html',
  '/fitness-tracker/css/styles.css',
  '/fitness-tracker/js/app.js',
  '/fitness-tracker/manifest.json',
  '/fitness-tracker/images/icon.png',
  '/fitness-tracker/images/settings.png',
  '/fitness-tracker/images/graph.png',
  '/fitness-tracker/images/sad.png',
  '/fitness-tracker/images/neutral.png',
  '/fitness-tracker/images/happy.png',
];

// Intercept fetch requests and serve cached assets if available
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return the cached response if found, otherwise fetch from the network
        return response || fetch(event.request).catch(() => {
          // If the fetch fails (e.g., offline), serve a fallback page
          if (event.request.mode === 'navigate') {
            return caches.match('/fitness-tracker/index.html');
          }
        });
      })
  );
});

// Activate the service worker and remove old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
