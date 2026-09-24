import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

// Loaded once and kept in memory (thousands of segments across the
// monitored region), same as the original app's segmentsData global --
// not rendered as a layer on load, just used to score risk against
// whatever route gets searched.
const SegmentsContext = createContext(null);

export function SegmentsProvider({ children }) {
  const [segments, setSegments] = useState(null);
  const [error, setError] = useState(null);

  const refresh = () => api
      .segments()
      .then((data) => {
        setSegments(data);
        setError(null);
        return data;
      })
      .catch((err) => {
        setError(`Could not reach the API. Is it running? (${err.message})`);
        return null;
      });

  useEffect(() => { refresh(); }, []);

  return <SegmentsContext.Provider value={{ segments, error, refresh }}>{children}</SegmentsContext.Provider>;
}

export function useSegments() {
  const ctx = useContext(SegmentsContext);
  if (!ctx) throw new Error('useSegments must be used inside <SegmentsProvider>');
  return ctx;
}
