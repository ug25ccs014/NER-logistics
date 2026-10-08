import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { saveSnapshot, loadSnapshot, announceDataStatus } from '../utils/offlineCache.js';

// Loaded once and kept in memory (thousands of segments across the
// monitored region), same as the original app's segmentsData global --
// not rendered as a layer on load, just used to score risk against
// whatever route gets searched.
const SegmentsContext = createContext(null);

export function SegmentsProvider({ children }) {
  const [segments, setSegments] = useState(null);
  const [error, setError] = useState(null);
  const [stale, setStale] = useState(false);       // true = showing saved (not live) data
  const [savedAt, setSavedAt] = useState(null);
  const segmentsRef = useRef(null);
  const [connections, setConnections] = useState(null);   // junction pairs, for offline routing

  const refresh = () => api
      .segments()
      .then((data) => {
        segmentsRef.current = data;
        setSegments(data);
        setError(null);
        setStale(false);
        const at = new Date().toISOString();
        setSavedAt(at);
        announceDataStatus({ stale: false, savedAt: at });
        saveSnapshot('segments', data);            // keep a copy for the next time there's no signal
        return data;
      })
      .catch(async (err) => {
        // No connection / server unreachable: keep what's already on screen, or
        // load the copy saved on this device. Either way, say it's saved data.
        const snap = segmentsRef.current ? null : await loadSnapshot('segments');
        const data = segmentsRef.current || snap?.data || null;
        if (data) {
          if (!segmentsRef.current) { segmentsRef.current = data; setSegments(data); }
          setStale(true);
          setError(null);
          if (snap?.savedAt) setSavedAt(snap.savedAt);
          announceDataStatus({ stale: true, savedAt: snap?.savedAt || savedAt });
          return data;
        }
        setError(`Could not reach the API. Is it running? (${err.message})`);
        return null;
      });

  // Junctions rarely change, so fetch once (again after reconnecting if it failed)
  // and keep a saved copy for offline route planning.
  const loadConnections = () => api
    .segmentConnections()
    .then((res) => { setConnections(res.connections || []); saveSnapshot('connections', res.connections || []); })
    .catch(async () => {
      const snap = await loadSnapshot('connections');
      if (snap?.data) setConnections(snap.data);
    });

  // Re-pull every 5 min so map/route scores track the server's live re-scoring.
  useEffect(() => {
    refresh();
    loadConnections();
    const id = setInterval(refresh, 5 * 60 * 1000);
    const onOnline = () => { refresh(); loadConnections(); };
    window.addEventListener('online', onOnline);
    return () => { clearInterval(id); window.removeEventListener('online', onOnline); };
  }, []);

  return <SegmentsContext.Provider value={{ segments, error, refresh, stale, savedAt, connections }}>{children}</SegmentsContext.Provider>;
}

export function useSegments() {
  const ctx = useContext(SegmentsContext);
  if (!ctx) throw new Error('useSegments must be used inside <SegmentsProvider>');
  return ctx;
}
