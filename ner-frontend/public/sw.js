/* NER Logistics service worker -- lets the app open and show saved data with no signal.
 *
 * Strategy
 *  - App shell (HTML):   network-first (fresh when online), cached copy when offline.
 *  - /assets/* (hashed): cache-first -- file names change on every build, so they never go stale.
 *  - Map tiles:          cache-first, only tiles the user actually viewed, capped (OSM tile policy
 *                        forbids bulk-downloading tiles, so we never prefetch regions).
 *  - Leaflet CSS / fonts: stale-while-revalidate.
 *  - API calls:          NEVER touched here -- the app caches its own data (utils/offlineCache.js)
 *                        so auth and error handling stay in one place.
 * Bump VERSION to force every client to drop old caches.
 */
const VERSION = 'v1';
const SHELL = `ner-shell-${VERSION}`;
const ASSETS = `ner-assets-${VERSION}`;
const TILES = `ner-tiles-${VERSION}`;
const EXTERNAL = `ner-external-${VERSION}`;
const DATA = 'ner-data-v1';               // owned by the page (utils/offlineCache.js) -- keep on cleanup
const KEEP = [SHELL, ASSETS, TILES, EXTERNAL, DATA];
const TILE_LIMIT = 800;
const ASSET_LIMIT = 80;
const PRECACHE = ['/', '/manifest.webmanifest', '/icons/icon-192.png'];
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.addAll(PRECACHE).catch(() => {});
    // index.html pulls Leaflet's stylesheet from unpkg -- without it the map breaks offline.
    const ext = await caches.open(EXTERNAL);
    await ext.add(new Request(LEAFLET_CSS, { mode: 'no-cors' })).catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('ner-') && !KEEP.includes(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - limit; i += 1) await cache.delete(keys[i]);   // oldest first
}

const cacheable = (res) => res && (res.ok || res.type === 'opaque');

async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (cacheable(res)) {
    cache.put(request, res.clone()).then(() => limit && trim(cacheName, limit)).catch(() => {});
  }
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const network = fetch(request).then((res) => { if (cacheable(res)) cache.put(request, res.clone()); return res; }).catch(() => null);
  return hit || (await network) || Response.error();
}

async function networkFirstPage(request) {
  const cache = await caches.open(SHELL);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 4000)),   // weak signal -> use saved copy
    ]);
    if (res && res.ok) { cache.put('/', res.clone()); return res; }   // SPA: every route is the same index.html
    // Host answered with an error (5xx / gateway) -> a saved copy of the app beats an error page.
    return (await cache.match('/')) || res;
  } catch {
    return (await cache.match('/')) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api') || url.pathname.startsWith('/uploads')) return;   // app handles its own data
    if (request.mode === 'navigate') { event.respondWith(networkFirstPage(request)); return; }
    if (url.pathname.startsWith('/assets/')) { event.respondWith(cacheFirst(request, ASSETS, ASSET_LIMIT)); return; }
    event.respondWith(staleWhileRevalidate(request, SHELL));
    return;
  }

  if (url.hostname.endsWith('tile.openstreetmap.org')) { event.respondWith(cacheFirst(request, TILES, TILE_LIMIT)); return; }
  if (['unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, EXTERNAL));
  }
  // anything else (the backend API, weather providers, routing...) goes straight to the network
});
