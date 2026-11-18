// ONE shared "where am I?" layer for the whole app (offline SOS, offline route,
// field reports, ride, live tracking, accommodations ...).
//
// Why GPS used to fail offline:
//  - A phone's GPS chip works with NO data signal, but every screen asked for
//    a position its own way: some demanded a brand-new high-accuracy fix with
//    no fallback, some gave up after 8 s, some never timed out.
//  - Nothing remembered the last position, so one weak/failed fix = "no location".
//  - A laptop has no GPS chip; browsers locate it through an online service, so
//    with the internet off it simply can't get a fix.
//
// Strategy (getBestFix): precise fix -> coarse/recent fix -> LAST KNOWN position
// saved on this device (clearly flagged as `fromCache` with its age).
const FIX_KEY = 'ner_last_fix';
const DEFAULT_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;   // a last-known fix older than a day is not offered

const toCoords = (pos) => (pos?.coords
  ? { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy ?? null }
  : { lat: pos.lat, lon: pos.lon, acc: pos.acc ?? null });

// Save the newest real fix (GeolocationPosition or {lat, lon, acc}).
export function rememberFix(pos) {
  try {
    const c = toCoords(pos);
    if (typeof c.lat !== 'number' || typeof c.lon !== 'number' || Number.isNaN(c.lat) || Number.isNaN(c.lon)) return;
    localStorage.setItem(FIX_KEY, JSON.stringify({ ...c, at: Date.now() }));
  } catch { /* storage full / blocked: not fatal */ }
}

// -> { lat, lon, acc, at } | null
export function getLastKnownFix(maxAgeMs = DEFAULT_CACHE_MAX_AGE_MS) {
  try {
    const f = JSON.parse(localStorage.getItem(FIX_KEY));
    if (!f || typeof f.lat !== 'number' || typeof f.lon !== 'number' || typeof f.at !== 'number') return null;
    if (Date.now() - f.at > maxAgeMs) return null;
    return f;
  } catch { return null; }
}

export const clearLastFix = () => { try { localStorage.removeItem(FIX_KEY); } catch { /* ignore */ } };

// "just now", "12 min ago", "3 h ago"
export function fixAge(at) {
  const min = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  return `${Math.round(min / 60)} h ago`;
}

const once = (opts) =>
  new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, opts));

// Same shape as a browser GeolocationPosition, so callers keep using pos.coords.latitude etc.
// Extra fields: fromCache (true = last known position, NOT live) and fixedAt (ms timestamp).
function fromRemembered(f) {
  return { coords: { latitude: f.lat, longitude: f.lon, accuracy: f.acc }, timestamp: f.at, fixedAt: f.at, fromCache: true };
}

export async function getBestFix({ allowCached = true } = {}) {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    const e = new Error('unsupported'); e.code = 0; throw e;
  }
  let lastErr = null;
  try {
    const pos = await once({ enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
    rememberFix(pos);
    return pos;
  } catch (err) {
    if (err && err.code === 1) throw err;            // permission denied: retrying / cached data would hide the real problem
    lastErr = err;
  }
  try {
    const pos = await once({ enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 });
    rememberFix(pos);
    return pos;
  } catch (err) {
    if (err && err.code === 1) throw err;
    lastErr = err;
  }
  const cached = allowCached ? getLastKnownFix() : null;
  if (cached) return fromRemembered(cached);
  throw lastErr || new Error('no fix');
}

// watchPosition that also remembers every fix. Returns the watch id (use navigator.geolocation.clearWatch).
export function watchFix(onFix, onError, options = {}) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  return navigator.geolocation.watchPosition(
    (pos) => { rememberFix(pos); onFix(pos); },
    (err) => { if (onError) onError(err); },
    { enableHighAccuracy: true, maximumAge: 20000, timeout: 30000, ...options },
  );
}

export function gpsErrorMessage(err) {
  const code = err && err.code;
  if (code === 1) return 'Location is blocked for this site. Click the lock icon next to the address bar, set Location to Allow, then try again.';
  if (code === 2) return 'This device could not work out its position. Computers have no GPS chip and need Wi-Fi/internet for location, so try on a phone, or move outdoors.';
  if (code === 3) return 'Timed out waiting for GPS. Move to open sky and try again.';
  if (code === 0) return 'Location is not available here. Open the app over https:// (or localhost) and use a device with GPS.';
  return 'Could not get GPS. Move to open sky and allow location access, then try again.';
}
