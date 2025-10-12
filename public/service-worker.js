// public/service-worker.js
const CACHE_NAME = 'plot-yangu-v1';
const RUNTIME_CACHE = 'plot-yangu-runtime-v1';

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// WA-SQLite WASM files to cache
 const WASM_ASSETS = [
   'https://sql.js.org/dist/sql-wasm.wasm',
 ];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install');
  
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      
      // Cache app assets
      try {
        await cache.addAll(PRECACHE_ASSETS);
        console.log('[ServiceWorker] App assets cached');
      } catch (error) {
        console.error('[ServiceWorker] Failed to cache app assets:', error);
      }
      
      // Cache WASM files separately (they may fail if not yet loaded)
      for (const url of WASM_ASSETS) {
        try {
          const response = await fetch(url, { mode: 'cors' });
          if (response.ok) {
            await cache.put(url, response);
            console.log('[ServiceWorker] Cached:', url);
          }
        } catch (error) {
          console.warn('[ServiceWorker] Failed to cache WASM:', url);
        }
      }
      
      // Skip waiting to activate immediately
      self.skipWaiting();
    })()
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate');
  
  event.waitUntil(
    (async () => {
      // Remove old caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map(name => {
            console.log('[ServiceWorker] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
      
      // Claim all clients
      await self.clients.claim();
      console.log('[ServiceWorker] Claimed clients');
    })()
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // Handle different resource types
  if (url.origin === location.origin) {
    // Same-origin requests - use cache-first strategy
    event.respondWith(cacheFirst(request));
  } else if (url.hostname.includes('jsdelivr.net')) {
    // CDN resources (WASM) - cache-first with long expiry
    event.respondWith(cacheFirst(request, 7 * 24 * 60 * 60 * 1000)); // 7 days
  } else if (url.hostname.includes('firebase')) {
    // Firebase - network-first (always fresh data)
    event.respondWith(networkFirst(request));
  } else {
    // Other resources - network-first with cache fallback
    event.respondWith(networkFirst(request));
  }
});

// Cache-first strategy
async function cacheFirst(request, maxAge = 24 * 60 * 60 * 1000) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  
  if (cached) {
    // Check if cache is still fresh
    const cachedDate = new Date(cached.headers.get('date') || 0);
    const age = Date.now() - cachedDate.getTime();
    
    if (age < maxAge) {
      console.log('[ServiceWorker] Serving from cache:', request.url);
      return cached;
    }
  }
  
  // Fetch from network and cache
  try {
    const response = await fetch(request);
    
    // Only cache successful responses
    if (response.ok) {
      const clonedResponse = response.clone();
      await cache.put(request, clonedResponse);
      console.log('[ServiceWorker] Cached from network:', request.url);
    }
    
    return response;
  } catch (error) {
    // Network failed, return stale cache if available
    if (cached) {
      console.log('[ServiceWorker] Network failed, serving stale cache:', request.url);
      return cached;
    }
    
    throw error;
  }
}

// Network-first strategy
async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  
  try {
    const response = await fetch(request);
    
    // Cache successful responses
    if (response.ok) {
      const clonedResponse = response.clone();
      await cache.put(request, clonedResponse);
    }
    
    return response;
  } catch (error) {
    // Network failed, try cache
    const cached = await cache.match(request);
    
    if (cached) {
      console.log('[ServiceWorker] Network failed, serving from cache:', request.url);
      return cached;
    }
    
    throw error;
  }
}

// Background sync for data synchronization
self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Background sync:', event.tag);
  
  if (event.tag === 'sync-properties') {
    event.waitUntil(syncProperties());
  } else if (event.tag === 'sync-invoices') {
    event.waitUntil(syncInvoices());
  } else if (event.tag === 'sync-all') {
    event.waitUntil(syncAll());
  }
});

async function syncProperties() {
  try {
    console.log('[ServiceWorker] Syncing properties...');
    // Notify all clients to perform sync
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_PROPERTIES'
      });
    });
  } catch (error) {
    console.error('[ServiceWorker] Property sync failed:', error);
  }
}

async function syncInvoices() {
  try {
    console.log('[ServiceWorker] Syncing invoices...');
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_INVOICES'
      });
    });
  } catch (error) {
    console.error('[ServiceWorker] Invoice sync failed:', error);
  }
}

async function syncAll() {
  try {
    console.log('[ServiceWorker] Syncing all data...');
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_ALL'
      });
    });
  } catch (error) {
    console.error('[ServiceWorker] Full sync failed:', error);
  }
}

// Handle messages from clients
self.addEventListener('message', (event) => {
  console.log('[ServiceWorker] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      })
    );
  }
});

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
  console.log('[ServiceWorker] Periodic sync:', event.tag);
  
  if (event.tag === 'sync-data') {
    event.waitUntil(syncAll());
  }
});

// Push notifications (for future use)
self.addEventListener('push', (event) => {
  console.log('[ServiceWorker] Push notification received');
  
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Plot Yangu';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    vibrate: [200, 100, 200],
    data: data.data || {},
    actions: data.actions || []
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('[ServiceWorker] Notification clicked');
  
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Focus existing window if available
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});