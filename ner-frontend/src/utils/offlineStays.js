// Offline "Nearby Stays": hotels / guest houses / lodges saved on the device.
//
// The list comes from OpenStreetMap through the backend, so it can't be fetched with
// no signal. Instead the app SAVES it while online:
//  - every successful Nearby Stays search is merged into one saved list, and
//  - while the person has a signal, a wider area around them (30 km) is quietly saved
//    in the background (at most once per 12 h, or after moving 15+ km), so the list is
//    already on the phone before they drive into a dead zone.
// Offline, the list is filtered by distance from the phone's GPS position.
import { api } from '../api.js';
import { saveSnapshot, loadSnapshot } from './offlineCache.js';
import { haversineKm } from './geo.js';

const SNAP_KEY = 'stays';
const MAX_SAVED = 600;
const PREFETCH_KEY = 'ner_stays_prefetch';
const PREFETCH_RADIUS_KM = 30;
const PREFETCH_LIMIT = 60;
const PREFETCH_EVERY_MS = 12 * 60 * 60 * 1000;
const PREFETCH_MOVE_KM = 15;

const idOf = (s) => `${String(s.name || '').toLowerCase()}|${Number(s.lat).toFixed(4)}|${Number(s.lon).toFixed(4)}`;

// Merge a fresh server result into the saved list (newest wins, capped).
export async function rememberStays(list) {
  if (!Array.isArray(list) || list.length === 0) return;
  try {
    const snap = await loadSnapshot(SNAP_KEY);
    const map = new Map((snap?.data?.items || []).map((s) => [idOf(s), s]));
    list.forEach((s) => {
      if (typeof s.lat !== 'number' || typeof s.lon !== 'number') return;
      const { distance_km, ...rest } = s;      // distance depends on where you stand: recomputed offline
      map.delete(idOf(s));                      // re-insert so fresh entries sit at the end
      map.set(idOf(s), rest);
    });
    const items = Array.from(map.values()).slice(-MAX_SAVED);
    await saveSnapshot(SNAP_KEY, { items });
  } catch { /* saving is best-effort */ }
}

// -> { items: [...with distance_km], savedAt: ISO | null }
export async function nearbyStaysOffline(lat, lon, radiusKm = 50, limit = 30) {
  const snap = await loadSnapshot(SNAP_KEY);
  const all = snap?.data?.items || [];
  const items = all
    .map((s) => ({ ...s, distance_km: haversineKm([lat, lon], [s.lat, s.lon]) }))
    .filter((s) => s.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, limit);
  return { items, savedAt: snap?.savedAt || null, totalSaved: all.length };
}

// Fire-and-forget background save. Safe to call on every GPS update (it throttles itself).
export async function prefetchStays(lat, lon) {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const prev = JSON.parse(localStorage.getItem(PREFETCH_KEY) || 'null');
    if (prev && (Date.now() - prev.at) < PREFETCH_EVERY_MS && haversineKm([lat, lon], [prev.lat, prev.lon]) < PREFETCH_MOVE_KM) return;
    // Claim the slot first so a burst of GPS updates doesn't start several downloads.
    localStorage.setItem(PREFETCH_KEY, JSON.stringify({ lat, lon, at: Date.now() }));
    const list = await api.nearbyAccommodations(lat, lon, PREFETCH_RADIUS_KM, PREFETCH_LIMIT);
    if (Array.isArray(list) && list.length) {
      await rememberStays(list);
    } else {
      // Empty usually means the free OSM service was busy: try again in ~30 min, not 12 h.
      localStorage.setItem(PREFETCH_KEY, JSON.stringify({ lat, lon, at: Date.now() - PREFETCH_EVERY_MS + 30 * 60 * 1000 }));
    }
  } catch {
    try { localStorage.removeItem(PREFETCH_KEY); } catch { /* ignore */ }   // failed: allow a retry on the next fix
  }
}
