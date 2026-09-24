import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from './AuthContext.jsx';

// App-wide live-location presence. This is intentionally mounted at the
// authenticated app shell, not inside LiveLocationSos, so users remain
// discoverable even when they are on Home, Messages, Alerts, etc.
const LocationTrackingContext = createContext(null);

const ENABLED_KEY = 'ner_location_tracking_enabled';
const ASKED_KEY = 'ner_location_tracking_asked';
const PING_MS = 60_000;

export function LocationTrackingProvider({ children }) {
  const { isAuthenticated, name, phone, sessionId, apiRole } = useAuth();
  const [isTracking, setIsTracking] = useState(false);
  const [permission, setPermission] = useState('unknown');
  const [lastPosition, setLastPosition] = useState(null);
  const [roadOpportunity, setRoadOpportunity] = useState(null);
  const watchIdRef = useRef(null);
  const heartbeatIdRef = useRef(null);
  const positionRef = useRef(null);
  const statusRef = useRef('active');
  const activeRef = useRef(false);

  const clearTracking = async (removeServerRow = true) => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (heartbeatIdRef.current !== null) {
      clearInterval(heartbeatIdRef.current);
      heartbeatIdRef.current = null;
    }
    activeRef.current = false;
    setIsTracking(false);
    if (removeServerRow && sessionId) {
      await api.deleteLocation(sessionId).catch(() => {});
    }
  };

  const postPosition = (pos) => {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const current = { lat, lon, accuracy: pos.coords.accuracy ?? null };
    positionRef.current = current;
    setLastPosition(current);
    api.postLocation(
      sessionId,
      name || 'Unknown user',
      phone || null,
      apiRole || 'driver',
      lat,
      lon,
      statusRef.current
    ).then((result) => {
      if (result?.road_opportunity?.should_prompt) {
        setRoadOpportunity(result.road_opportunity);
      }
    }).catch(() => {});
  };

  const startTracking = () => {
    if (!navigator.geolocation || !sessionId || !isAuthenticated) return false;
    if (activeRef.current) return true;

    activeRef.current = true;
    setIsTracking(true);
    statusRef.current = 'active';
    localStorage.setItem(ENABLED_KEY, 'true');
    localStorage.setItem(ASKED_KEY, 'true');

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPermission('granted');
        postPosition(pos);
      },
      (err) => {
        if (err.code === 1) setPermission('denied');
        else setPermission('unavailable');
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 }
    );

    // watchPosition can be quiet while a device is stationary. Keep a
    // lightweight heartbeat so the backend's 15-minute freshness window
    // continues to represent an actually-online user.
    heartbeatIdRef.current = setInterval(() => {
      if (!activeRef.current) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPermission('granted');
          postPosition(pos);
        },
        () => {},
        { enableHighAccuracy: false, maximumAge: 30_000, timeout: 15_000 }
      );
    }, PING_MS);

    return true;
  };

  const setStatus = (status) => {
    statusRef.current = status;
    const pos = positionRef.current;
    if (pos && activeRef.current) {
      api.postLocation(sessionId, name || 'Unknown user', phone || null, apiRole || 'driver', pos.lat, pos.lon, status).catch(() => {});
    }
  };

  // Runs whenever authentication changes. First login asks for location;
  // later logins reuse the browser permission without showing a new prompt.
  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      if (!isAuthenticated || !navigator.geolocation || !apiRole) return;

      let state = 'prompt';
      if (navigator.permissions?.query) {
        try {
          const result = await navigator.permissions.query({ name: 'geolocation' });
          state = result.state;
          if (!cancelled) setPermission(state);
        } catch {
          // Fall through to the normal geolocation permission flow.
        }
      }
      if (cancelled) return;

      const enabled = localStorage.getItem(ENABLED_KEY) === 'true';
      const asked = localStorage.getItem(ASKED_KEY) === 'true';

      // Already granted + previously enabled: silently resume on every login.
      if (state === 'granted' && enabled) {
        startTracking();
        return;
      }

      // A permission that was granted outside this app should also activate
      // tracking even if the old localStorage flag is missing.
      if (state === 'granted' && !asked) {
        startTracking();
        return;
      }

      // First authenticated use: calling getCurrentPosition/watchPosition
      // triggers the browser's native permission prompt. If accepted,
      // startTracking's success callback persists the opt-in.
      if (!asked && state !== 'denied') {
        localStorage.setItem(ASKED_KEY, 'true');
        startTracking();
      }
    };

    boot();
    return () => { cancelled = true; };
    // Auth/session identity is intentionally the trigger; startTracking is
    // stable enough for this lifecycle and uses refs for mutable state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, sessionId, apiRole]);

  // Keep the latest account data in the location payload after login.
  useEffect(() => {
    if (!activeRef.current || !positionRef.current) return;
    const p = positionRef.current;
    api.postLocation(sessionId, name || 'Unknown user', phone || null, apiRole || 'driver', p.lat, p.lon, statusRef.current).catch(() => {});
  }, [name, phone, apiRole, sessionId]);

  // When the authenticated session disappears, stop tracking and remove the
  // user's row so the next account/browser cannot inherit stale presence.
  useEffect(() => {
    if (isAuthenticated) return;
    clearTracking(true);
    setLastPosition(null);
    setRoadOpportunity(null);
    positionRef.current = null;
  }, [isAuthenticated]);

  useEffect(() => () => { clearTracking(true); }, [sessionId]);

  const value = useMemo(() => ({
    isTracking,
    permission,
    lastPosition,
    roadOpportunity,
    startTracking,
    stopTracking: () => {
      localStorage.setItem(ENABLED_KEY, 'false');
      clearTracking(true);
    },
    setStatus,
    clearRoadOpportunity: () => setRoadOpportunity(null),
  }), [isTracking, permission, lastPosition, roadOpportunity]);

  return <LocationTrackingContext.Provider value={value}>{children}</LocationTrackingContext.Provider>;
}

export function useLocationTracking() {
  const ctx = useContext(LocationTrackingContext);
  if (!ctx) throw new Error('useLocationTracking must be used inside <LocationTrackingProvider>');
  return ctx;
}
