const CACHE_NAME = 'workforce-cache-v28';
const ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/auth.js',
  '/js/db.js',
  '/js/storage.js',
  '/js/utils.js',
  '/js/components/modal.js',
  '/js/components/toast.js',
  '/js/components/icon.js',
  '/js/views/dashboard.js',
  '/js/views/admin.js',
  '/js/views/planner.js',
  '/js/views/labour.js',
  '/js/views/sites.js',
  '/js/views/site-detail.js',
  '/js/views/engineers.js',
  '/js/views/completions.js',
  '/js/views/shift-detail.js',
  '/js/views/mobile-jobs.js',
  '/js/views/mobile-card.js',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).catch(err => console.log('SW Cache error:', err))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // Network-First with cache fallback strategy
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseCopy);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(e.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (e.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// Push notification handling
self.addEventListener('push', (e) => {
  let data = { title: 'New Notification', body: 'Workforce Platform update.' };
  if (e.data) {
    try {
      data = e.data.json();
    } catch (err) {
      data = { title: 'Notification', body: e.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: 'https://img.icons8.com/color/192/000000/worker-card.png',
    badge: 'https://img.icons8.com/color/192/000000/worker-card.png',
    data: data.url || '/'
  };

  e.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle push message clicks
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === e.notification.data && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(e.notification.data);
      }
    })
  );
});
