import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { useMap } from '../context/MapContext.jsx';
import { useActiveRoute } from '../context/ActiveRouteContext.jsx';
import { pulsingDotIcon, simPositionIcon } from '../utils/mapIcons.js';
import { haversineKm } from '../utils/geo.js';
import { useLanguage } from '../context/LanguageContext.jsx';

// Ported from startRealRide() / startSimulatedRide() / stopRide().
// "Start Ride" follows your actual device GPS (green pulsing dot);
// "Simulate Ride" walks a marker along the searched route for demos,
// while the green dot keeps tracking your real position underneath.
export default function RidePanel() {
  const { t } = useLanguage();
  const { map } = useMap();
  const { routeCoords } = useActiveRoute();
  const [active, setActive] = useState(false);
  const [eta, setEta] = useState(null);
  const [distance, setDistance] = useState(null);
  const [mode, setMode] = useState('');
  const [gpsStatus, setGpsStatus] = useState(null);

  const realGpsWatchRef = useRef(null);
  const realGpsMarkerRef = useRef(null);
  const rideWatchRef = useRef(null);
  const simMarkerRef = useRef(null);
  const simIntervalRef = useRef(null);
  // watchPosition retries on its own after a timeout, so a plain
  // "Timeout expired" is usually not the end of the world (common
  // indoors/under tree cover, which is frequent in NER terrain) --
  // only permission-denied is unrecoverable and worth a one-time alert.
  const permissionDeniedAlertedRef = useRef(false);

  const stopRide = () => {
    if (rideWatchRef.current !== null) {
      navigator.geolocation.clearWatch(rideWatchRef.current);
      rideWatchRef.current = null;
    }
    if (simIntervalRef.current !== null) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
    if (simMarkerRef.current && map) {
      map.removeLayer(simMarkerRef.current);
      simMarkerRef.current = null;
    }
    stopRealGpsWatch();
    setActive(false);
  };

  // Kept up to date every render so the unmount cleanup below always
  // calls the CURRENT stopRide (with the current `map`), never a stale
  // one captured back on first mount before `map` was even ready.
  const stopRideRef = useRef(stopRide);
  stopRideRef.current = stopRide;

  // Nothing was ever calling stopRide() when this component unmounts --
  // e.g. navigating to a different tool without pressing "Stop" first.
  // The watchPosition callback kept running in the background against a
  // Leaflet map that Workspace had already torn down (each tool switch
  // mounts a fresh <MapView/>), throwing on every GPS update from then
  // on -- which is what made a fresh "Start Ride" look broken until you
  // switched away and back again (a brand-new RidePanel instance, with
  // its own fresh refs, finally got a valid map to work with).
  useEffect(() => {
    return () => stopRideRef.current();
  }, []);

  const updatePanel = (pos, modeLabel) => {
    if (!routeCoords) return;
    const dest = routeCoords[routeCoords.length - 1];
    const remainingKm = haversineKm(pos, dest);
    const etaMin = (remainingKm / 40) * 60;
    setEta(etaMin < 1 ? t('arrived_label') : Math.round(etaMin));
    setDistance(remainingKm.toFixed(1));
    setMode(modeLabel);
  };

  const startRealGpsWatch = () => {
    if (realGpsWatchRef.current !== null || !navigator.geolocation) return;
    realGpsWatchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        if (!map) return;
        const pos = [position.coords.latitude, position.coords.longitude];
        if (!realGpsMarkerRef.current) {
          realGpsMarkerRef.current = L.marker(pos, { icon: pulsingDotIcon() }).addTo(map);
        } else {
          realGpsMarkerRef.current.setLatLng(pos);
        }
      },
      (err) => console.warn('GPS watch error:', err.message),
      // A stale fix up to 20s old and a 30s timeout (up from 5s/15s)
      // means far fewer timeouts to begin with, on top of no longer
      // treating each one as fatal.
      { enableHighAccuracy: true, maximumAge: 20000, timeout: 30000 }
    );
  };

  const stopRealGpsWatch = () => {
    if (realGpsWatchRef.current !== null) {
      navigator.geolocation.clearWatch(realGpsWatchRef.current);
      realGpsWatchRef.current = null;
    }
    if (realGpsMarkerRef.current && map) {
      map.removeLayer(realGpsMarkerRef.current);
      realGpsMarkerRef.current = null;
    }
  };

  const startRealRide = () => {
    if (!navigator.geolocation) {
      alert(t('err_geo_unsupported'));
      return;
    }
    if (!window.isSecureContext) {
      alert(t('err_geo_https'));
      return;
    }
    stopRide();
    permissionDeniedAlertedRef.current = false;
    // Give immediate feedback instead of the button just silently going
    // to "Stop" with nothing else on screen for up to 30s while a real
    // GPS fix comes in -- that dead air is what made this look hung.
    setGpsStatus('Getting your location…');
    rideWatchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        if (!map) return; // MapView between mounts (tool-switch race) -- next fix will retry
        const pos = [position.coords.latitude, position.coords.longitude];
        if (!realGpsMarkerRef.current) {
          realGpsMarkerRef.current = L.marker(pos, { icon: pulsingDotIcon() }).addTo(map);
        } else {
          realGpsMarkerRef.current.setLatLng(pos);
        }
        map.panTo(pos);
        updatePanel(pos, '📍 Live GPS tracking (your real device location)');
        setGpsStatus(null);
      },
      (err) => {
        // Permission denied won't fix itself -- watchPosition will just
        // keep failing the same way, so tell the person once and stop.
        if (err.code === err.PERMISSION_DENIED) {
          setGpsStatus('Location permission denied. Check your browser/site settings.');
          if (!permissionDeniedAlertedRef.current) {
            permissionDeniedAlertedRef.current = true;
            alert(`Could not get your location: ${err.message}. Check that location permission is granted for this site.`);
          }
          return;
        }
        // Timeouts (and "position unavailable") are common indoors/under
        // tree cover, and watchPosition keeps retrying on its own -- a
        // quiet inline status instead of a blocking alert on every retry
        // is what actually made this look "broken/frozen" before.
        setGpsStatus('Waiting for a GPS signal… this can take a moment indoors or under tree cover.');
      },
      // A stale fix up to 20s old and a 30s timeout (up from 5s/15s)
      // means far fewer timeouts to begin with.
      { enableHighAccuracy: true, maximumAge: 20000, timeout: 30000 }
    );
    setActive(true);
  };

  const startSimulatedRide = () => {
    if (!routeCoords) return;
    stopRide();
    startRealGpsWatch(); // green dot keeps tracking your actual position throughout the demo
    let i = 0;
    const stepEvery = 300;
    simIntervalRef.current = setInterval(() => {
      if (!map) return;
      if (i >= routeCoords.length) {
        stopRide();
        return;
      }
      const pos = routeCoords[i];
      if (!simMarkerRef.current) {
        simMarkerRef.current = L.marker(pos, { icon: simPositionIcon() }).addTo(map);
      } else {
        simMarkerRef.current.setLatLng(pos);
      }
      map.panTo(pos);
      updatePanel(pos, '▶ Simulated ride (for demo purposes)');
      i += Math.max(1, Math.floor(routeCoords.length / 200));
    }, stepEvery);
    setActive(true);
  };

  return (
    <div>
      {!active ? (
        <>
          <button className="btn btn-ride" onClick={startRealRide} disabled={!routeCoords}>
            {t('start_ride_btn')}
          </button>
          <button className="btn btn-sim" onClick={startSimulatedRide} disabled={!routeCoords}>
            {t('simulate_ride_btn')}
          </button>
        </>
      ) : (
        <button className="btn btn-stop" onClick={stopRide}>{t('stop_btn')}</button>
      )}

      {active && gpsStatus && <div className="status-line">{gpsStatus}</div>}

      {eta !== null && (
        <div className="ride-panel">
          <div className="big">{eta}</div>
          <div className="status-line">{t('min_remaining_km_left_template').replace('{km}', distance)}</div>
          <div className="status-line">{mode}</div>
        </div>
      )}
    </div>
  );
}
