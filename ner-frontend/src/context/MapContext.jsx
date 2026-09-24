import React, { createContext, useContext, useState } from 'react';

// Sidebar cards (accommodations, nearby people, alerts...) need to be
// able to say "pan the map to this point and open its popup" when
// clicked. Rather than threading the Leaflet map instance through
// props everywhere, the MapView registers itself here once and any
// feature component can pull it out with useMap().
const MapContext = createContext(null);

export function MapProvider({ children }) {
  const [map, setMap] = useState(null);
  return <MapContext.Provider value={{ map, setMap }}>{children}</MapContext.Provider>;
}

export function useMap() {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error('useMap must be used inside <MapProvider>');
  return ctx;
}
