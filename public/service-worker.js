// public/service-worker.js — Plot Yangu
//
// BUILD_ID and PRECACHE_ASSETS are stamped at build time by tools/vite-plugin-pwa-sw.ts.
// The placeholders below stay as-is in source (and in `vite dev`, where this file is not registered).
//
// Update policy: a new worker installs in the background and WAITS. It only takes over when the
// app posts SKIP_WAITING after the user taps "Update" (see src/pwa/pwaManager.ts). It never calls
// skipWaiting() on its own, so nobody gets a new version swapped in under them mid-entry.
const BUILD_ID = /*__BUILD_ID__*/ 'dev';
const PRECACHE_ASSETS = /*__PRECACHE_ASSETS__*/ [];

const STATIC_CACHE = `plotyangu-static-${BUILD_ID}`; // app shell + hashed build files, replaced per build
const RUNTIME_CACHE = 'plotyangu-runtime-v3';          // icons, sql.js WASM, other runtime fetches
const LEGACY_CACHES = ['plot-yangu-v2', 'plot-yangu-runtime-v2'];

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/manifest-icon-192.maskable.png',
  '/icons/manifest-icon-512.maskable.png',
  '/icons/apple-icon-180.png'
];

// sql.js loads its WASM from this CDN (UniversalSQLiteAdapter.locateFile)
const SQLJS_HOST = 'sql.js.org';
const SQLJS_WASM = 'https://sql.js.org/dist/sql-wasm.wasm';

// ───────────────────────────── lifecycle ─────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    // allSettled: one missing optional file must not abort the whole install
    await Promise.allSettled(
      [...APP_SHELL, ...PRECACHE_ASSETS].map((url) => cache.add(new Request(url, { cache: 'reload' })))
    );

    // Warm the offline database engine in the background. Deliberately NOT awaited: a slow or blocked
    // CDN must never hold up installing (and therefore updating) the app itself.
    warmSqlWasm();
    // No skipWaiting() here on purpose — see the update policy above.
  })());
});

async function warmSqlWasm() {
  try {
    const runtime = await caches.open(RUNTIME_CACHE);
    if (await runtime.match(SQLJS_WASM)) return;
    const res = await fetch(SQLJS_WASM, { mode: 'cors' });
    if (res.ok) await runtime.put(SQLJS_WASM, res);
  } catch (_) { /* best effort; the first real request is cached by the fetch handler */ }
}

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([STATIC_CACHE, RUNTIME_CACHE]);
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((n) => !keep.has(n) && (n.startsWith('plotyangu-static-') || LEGACY_CACHES.includes(n)))
        .map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (type === 'GET_VERSION') {
    event.ports[0] && event.ports[0].postMessage({ buildId: BUILD_ID });
  } else if (type === 'CLEAR_CACHE') {
    event.waitUntil(caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))));
  }
});

// ─────────────────────────────── fetch ───────────────────────────────

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!url.protocol.startsWith('http')) return;

  if (url.origin === self.location.origin) {
    // Short invoice links (/i/<code>) are redirected by a Cloud Function — never serve them from the shell cache
    if (url.pathname.startsWith('/i/')) return;
    // Firebase Auth helper pages and the worker script itself always go to the network
    if (url.pathname.startsWith('/__/') || url.pathname === '/service-worker.js') return;

    if (req.mode === 'navigate') {
      event.respondWith(handleNavigation(req));
    } else if (url.pathname.startsWith('/assets/')) {
      // Hashed, immutable build files
      event.respondWith(cacheFirst(req, STATIC_CACHE));
    } else if (['image', 'font', 'manifest'].includes(req.destination)) {
      event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
    }
    return;
  }

  // sql.js WASM — large, versioned by URL, needed for the offline database
  if (url.hostname === SQLJS_HOST && url.pathname.startsWith('/dist/')) {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE));
  }
  // Everything else cross-origin (Firebase, Paystack, APIs, storage) goes straight to the network.
});

// Navigations: network first so a deploy is seen immediately; the cached shell is the offline fallback.
async function handleNavigation(req) {
  try {
    return await fetch(req);
  } catch (_) {
    const cache = await caches.open(STATIC_CACHE);
    return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const refresh = fetch(req)
    .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
    .catch(() => null);
  return hit || (await refresh) || Response.error();
}

// ──────────────────────── background sync ────────────────────────

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-properties') event.waitUntil(notifyClients('SYNC_PROPERTIES'));
  else if (event.tag === 'sync-invoices') event.waitUntil(notifyClients('SYNC_INVOICES'));
  else if (event.tag === 'sync-all') event.waitUntil(notifyClients('SYNC_ALL'));
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'sync-data') event.waitUntil(notifyClients('SYNC_ALL'));
});

async function notifyClients(type) {
  try {
    const all = await self.clients.matchAll();
    all.forEach((client) => client.postMessage({ type }));
  } catch (error) {
    console.error('[ServiceWorker] notify failed:', type, error);
  }
}

// ───────────────────────── push notifications ─────────────────────────

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Plot Yangu', {
      body: data.body || 'You have a new notification',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      vibrate: [200, 100, 200],
      data: data.data || {},
      actions: data.actions || []
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url === urlToOpen && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});
