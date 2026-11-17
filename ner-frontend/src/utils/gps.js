// One tolerant "where am I?" helper for the offline panels.
//
// Why the old calls failed: they asked for a brand-new high-accuracy fix only
// (maximumAge: 0) and then showed the same message for EVERY failure.
//  - A phone gets a fix from its GPS chip with no data signal at all.
//  - A laptop/desktop has no GPS chip. Chrome/Edge locate it from nearby Wi-Fi
//    via an online service, so with the internet really off it often fails.
// Strategy: try a precise fix, then fall back to a coarse / recently cached one.

const once = (opts) =>
  new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, opts));

export async function getBestFix() {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    const e = new Error('unsupported'); e.code = 0; throw e;
  }
  try {
    return await once({ enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  } catch (err) {
    if (err && err.code === 1) throw err;            // permission denied: retrying won't help
    return once({ enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 });
  }
}

export function gpsErrorMessage(err) {
  const code = err && err.code;
  if (code === 1) return 'Location is blocked for this site. Click the lock icon next to the address bar, set Location to Allow, then try again.';
  if (code === 2) return 'This device could not work out its position. Computers have no GPS chip and need Wi-Fi/internet for location, so try on a phone, or move outdoors.';
  if (code === 3) return 'Timed out waiting for GPS. Move to open sky and try again.';
  if (code === 0) return 'Location is not available here. Open the app over https:// (or localhost) and use a device with GPS.';
  return 'Could not get GPS. Move to open sky and allow location access, then try again.';
}
