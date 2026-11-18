import { useCallback, useState } from 'react';
import { getBestFix, gpsErrorMessage, fixAge } from '../utils/gps.js';

// One shared way to ask for GPS. Every panel that needs "my location"
// (accommodations, ...) calls this instead of re-implementing getCurrentPosition.
//
// Resolves { lat, lon, fromCache, at }. `fromCache` is true when no live fix
// could be had (typical with no signal indoors) and the last position saved on
// this device was used instead. A fix is NOT held in state for reuse any more:
// the old version returned the very first position forever, even after the
// person had driven 50 km.
export function useGeolocation() {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const getPosition = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pos = await getBestFix();
      const p = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        fromCache: Boolean(pos.fromCache),
        at: pos.fixedAt || pos.timestamp || Date.now(),
      };
      setPosition(p);
      return p;
    } catch (err) {
      const msg = gpsErrorMessage(err);
      setError(msg);
      const e = new Error(msg); e.code = err?.code;
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { position, error, loading, getPosition, fixAge };
}
