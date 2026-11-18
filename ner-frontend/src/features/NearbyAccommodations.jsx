import React, { useRef, useState } from 'react';
import L from 'leaflet';
import { api } from '../api.js';
import { useMap } from '../context/MapContext.jsx';
import { useGeolocation } from '../hooks/useGeolocation.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { placeCurrentLocationMarker } from '../utils/mapIcons.js';
import { rememberStays, nearbyStaysOffline } from '../utils/offlineStays.js';
import { fixAge } from '../utils/gps.js';

function accommodationIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="background:#0ea5e9; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 1px 4px rgba(0,0,0,0.5); font-size:14px;">🛏️</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function popupHtml(h, t) {
  return `
    <b>${h.name}</b> <span style="color:#666;text-transform:capitalize;">${(h.type || '').replace(/_/g, ' ')}</span><br/>
    ${t('km_away_template').replace('{km}', h.distance_km.toFixed(1))}
    ${h.phone ? `<br/>📞 ${h.phone}` : ''}
    ${h.address ? `<br/>📍 ${h.address}` : ''}
  `;
}

export default function NearbyAccommodations() {
  const { t } = useLanguage();
  const { map } = useMap();
  const { getPosition } = useGeolocation();
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState(null);
  const markersRef = useRef([]);

  const clearMarkers = () => {
    markersRef.current.forEach((m) => map && map.removeLayer(m));
    markersRef.current = [];
  };

  const showStays = (hotels, note) => {
    clearMarkers();
    if (map) {
      markersRef.current = hotels.map((h) => {
        const marker = L.marker([h.lat, h.lon], { icon: accommodationIcon() }).addTo(map);
        marker.bindPopup(popupHtml(h, t));
        return marker;
      });
    }
    setResults(hotels);
    setStatus(note);
  };

  // Offline (or server unreachable): use the stays saved on this device.
  const showSaved = async (pos, prefix) => {
    const saved = await nearbyStaysOffline(pos.lat, pos.lon);
    if (saved.items.length === 0) {
      setStatus(`${prefix} No saved stays near here yet. Open Nearby Stays once while you have a signal in the area you will travel through, and they will be saved for offline use.`);
      return;
    }
    const when = saved.savedAt ? fixAge(new Date(saved.savedAt).getTime()) : 'earlier';
    showStays(saved.items, `${prefix} Showing stays saved on this device (updated ${when}). Phone numbers and availability may have changed.`);
  };

  const search = async () => {
    setStatus('Getting your location...');
    setResults([]);
    let pos;
    try {
      pos = await getPosition();
    } catch (err) {
      setStatus(err.message);
      return;
    }
    placeCurrentLocationMarker(map, pos.lat, pos.lon);
    const gpsNote = pos.fromCache ? ` (no live GPS - using your last known position from ${fixAge(pos.at)})` : '';

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await showSaved(pos, `You are offline${gpsNote}.`);
      return;
    }

    setStatus(pos.fromCache ? `No live GPS - searching around your last known position (${fixAge(pos.at)})...` : 'Looking for nearby accommodation...');
    try {
      const hotels = await api.nearbyAccommodations(pos.lat, pos.lon);
      if (hotels.length === 0) {
        // The free map service sometimes answers with nothing when it is busy: fall back to saved stays if there are any.
        const saved = await nearbyStaysOffline(pos.lat, pos.lon);
        if (saved.items.length) { await showSaved(pos, 'Live search found nothing.'); return; }
        showStays([], 'No nearby accommodation found within 15km.');
        return;
      }
      rememberStays(hotels);
      showStays(hotels, null);
    } catch (err) {
      if (err?.isNetworkError || [502, 503, 504].includes(err?.status)) {
        await showSaved(pos, 'Could not reach the server.');
      } else {
        setStatus(err.message);
      }
    }
  };

  const showOnMap = (idx) => {
    const h = results[idx];
    const marker = markersRef.current[idx];
    if (!h || !map) return;
    map.setView([h.lat, h.lon], 14);
    if (marker) marker.openPopup();
  };

  return (
    <div>
      <div className="section-title">{t('nearby_accommodations')}</div>
      <button className="btn" onClick={search}>{t('nearby_rest')}</button>
      {status && <div className="status-line">{status}</div>}
      {results.map((h, idx) => (
        <div className="card" key={idx} onClick={() => showOnMap(idx)}>
          <b>{h.name}</b>{' '}
          <span style={{ color: '#999' }}>{(h.type || '').replace(/_/g, ' ')}</span>
          <div className="status-line">
            {t('km_away_template').replace('{km}', h.distance_km.toFixed(1))}
            {h.phone ? ` · 📞 ${h.phone}` : ''}
            {h.address ? ` · ${h.address}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}
