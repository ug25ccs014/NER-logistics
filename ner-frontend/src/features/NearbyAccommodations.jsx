import React, { useRef, useState } from 'react';
import L from 'leaflet';
import { api } from '../api.js';
import { useMap } from '../context/MapContext.jsx';
import { useGeolocation } from '../hooks/useGeolocation.js';

function accommodationIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="background:#0ea5e9; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 1px 4px rgba(0,0,0,0.5); font-size:14px;">🛏️</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function popupHtml(h) {
  return `
    <b>${h.name}</b> <span style="color:#666;text-transform:capitalize;">${(h.type || '').replace(/_/g, ' ')}</span><br/>
    ${h.distance_km.toFixed(1)} km away
    ${h.phone ? `<br/>📞 ${h.phone}` : ''}
    ${h.address ? `<br/>📍 ${h.address}` : ''}
  `;
}

export default function NearbyAccommodations() {
  const { map } = useMap();
  const { getPosition } = useGeolocation();
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState(null);
  const markersRef = useRef([]);

  const clearMarkers = () => {
    markersRef.current.forEach((m) => map && map.removeLayer(m));
    markersRef.current = [];
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
    setStatus('Looking for nearby accommodation...');
    try {
      const hotels = await api.nearbyAccommodations(pos.lat, pos.lon);
      clearMarkers();
      if (map) {
        markersRef.current = hotels.map((h) => {
          const marker = L.marker([h.lat, h.lon], { icon: accommodationIcon() }).addTo(map);
          marker.bindPopup(popupHtml(h));
          return marker;
        });
      }
      setResults(hotels);
      setStatus(hotels.length === 0 ? 'No nearby accommodation found within 15km.' : null);
    } catch (err) {
      setStatus(err.message);
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
      <div className="section-title">🛏️ Nearby Accommodations</div>
      <button className="btn" onClick={search}>Find places to rest nearby</button>
      {status && <div className="status-line">{status}</div>}
      {results.map((h, idx) => (
        <div className="card" key={idx} onClick={() => showOnMap(idx)}>
          <b>{h.name}</b>{' '}
          <span style={{ color: '#999' }}>{(h.type || '').replace(/_/g, ' ')}</span>
          <div className="status-line">
            {h.distance_km.toFixed(1)} km away
            {h.phone ? ` · 📞 ${h.phone}` : ''}
            {h.address ? ` · ${h.address}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}
