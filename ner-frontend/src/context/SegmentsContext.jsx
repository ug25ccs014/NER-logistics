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

  // Re-pull every 5 min so map/route scores track the server's live re-scoring.
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return <SegmentsContext.Provider value={{ segments, error, refresh, stale, savedAt }}>{children}</SegmentsContext.Provider>;
}

export function useSegments() {
  const ctx = useContext(SegmentsContext);
  if (!ctx) throw new Error('useSegments must be used inside <SegmentsProvider>');
  return ctx;
}
