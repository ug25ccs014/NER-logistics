import { useCallback, useState } from 'react';

// One shared way to ask for GPS. Every panel that needs "my location"
// (accommodations, SOS, field reports) calls this instead of each
// re-implementing its own getCurrentPosition boilerplate.
export function useGeolocation() {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const getPosition = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (position) {
        resolve(position);
        return;
      }
      if (!navigator.geolocation) {
        const err = new Error('GPS not available on this device.');
        setError(err.message);
        reject(err);
        return;
      }
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          setPosition(p);
          setLoading(false);
          resolve(p);
        },
        (err) => {
          setError(err.message);
          setLoading(false);
          reject(err);
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    });
  }, [position]);

  return { position, error, loading, getPosition };
}
