import React, { createContext, useContext, useState } from 'react';

// Whatever route is currently selected in RouteSearch, shared with
// RidePanel (Start/Simulate Ride needs to know the route to follow).
// Same relationship as the original app's currentRouteCoords global.
const ActiveRouteContext = createContext(null);

export function ActiveRouteProvider({ children }) {
  const [routeCoords, setRouteCoords] = useState(null);
  return (
    <ActiveRouteContext.Provider value={{ routeCoords, setRouteCoords }}>
      {children}
    </ActiveRouteContext.Provider>
  );
}

export function useActiveRoute() {
  const ctx = useContext(ActiveRouteContext);
  if (!ctx) throw new Error('useActiveRoute must be used inside <ActiveRouteProvider>');
  return ctx;
}
