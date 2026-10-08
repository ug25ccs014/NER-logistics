// Saves "last known good" server data on the device so the app still has
// something useful to show with no signal (road-risk map, last planned route).
// Uses the Cache Storage API (large quota, unlike localStorage's ~5 MB) and
// falls back to localStorage where it isn't available.
const CACHE_NAME = 'ner-data-v1';       // keep in sync with sw.js (its cleanup must not delete this)
const LS_PREFIX = 'ner_snap_';

export async function saveSnapshot(key, data) {
  const savedAt = new Date().toISOString();
  const body = JSON.stringify({ savedAt, data });
  try {
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(`/__snapshot/${key}`, new Response(body, { headers: { 'Content-Type': 'application/json' } }));
      return savedAt;
    }
  } catch { /* fall through to localStorage */ }
  try { localStorage.setItem(LS_PREFIX + key, body); return savedAt; } catch { return null; }
}

// -> { savedAt, data } | null
export async function loadSnapshot(key) {
  try {
    if (typeof caches !== 'undefined') {
      const hit = await (await caches.open(CACHE_NAME)).match(`/__snapshot/${key}`);
      if (hit) return await hit.json();
    }
  } catch { /* try localStorage */ }
  try { return JSON.parse(localStorage.getItem(LS_PREFIX + key)); } catch { return null; }
}

// Called on logout so saved routes/places don't linger on a shared phone.
export async function clearSnapshots() {
  try { if (typeof caches !== 'undefined') await caches.delete(CACHE_NAME); } catch { /* ignore */ }
  try { Object.keys(localStorage).filter((k) => k.startsWith(LS_PREFIX)).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
}

// Broadcasts data freshness so the status banner (outside the React data providers) can show it.
export function announceDataStatus(detail) {
  window.dispatchEvent(new CustomEvent('ner-data-status', { detail }));
}
