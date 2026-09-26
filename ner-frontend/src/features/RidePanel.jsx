import React, { useRef, useState } from 'react';
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

  const realGpsWatchRef = useRef(null);
  const realGpsMarkerRef = useRef(null);
  const rideWatchRef = useRef(null);
  const simMarkerRef = useRef(null);
  const simIntervalRef = useRef(null);

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
        const pos = [position.coords.latitude, position.coords.longitude];
        if (!realGpsMarkerRef.current) {
          realGpsMarkerRef.current = L.marker(pos, { icon: pulsingDotIcon() }).addTo(map);
        } else {
          realGpsMarkerRef.current.setLatLng(pos);
        }
      },
      (err) => console.warn('GPS watch error:', err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  };

  const stopRealGpsWatch = () => {
    if (realGpsWatchRef.current !== null) {
      navigator.geolocation.clearWatch(realGpsWatchRef.current);
      realGpsWatchRef.current = null;
    }
    if (realGpsMarkerRef.current) {
      map.removeLayer(realGpsMarkerRef.current);
      realGpsMarkerRef.current = null;
    }
  };

  const stopRide = () => {
    if (rideWatchRef.current !== null) {
      navigator.geolocation.clearWatch(rideWatchRef.current);
      rideWatchRef.current = null;
    }
    if (simIntervalRef.current !== null) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
    if (simMarkerRef.current) {
      map.removeLayer(simMarkerRef.current);
      simMarkerRef.current = null;
    }
    stopRealGpsWatch();
    setActive(false);
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
    rideWatchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const pos = [position.coords.latitude, position.coords.longitude];
        if (!realGpsMarkerRef.current) {
          realGpsMarkerRef.current = L.marker(pos, { icon: pulsingDotIcon() }).addTo(map);
        } else {
          realGpsMarkerRef.current.setLatLng(pos);
        }
        map.panTo(pos);
        updatePanel(pos, '📍 Live GPS tracking (your real device location)');
      },
      (err) => alert(`Could not get your location: ${err.message}. Check that location permission is granted for this site.`),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
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
