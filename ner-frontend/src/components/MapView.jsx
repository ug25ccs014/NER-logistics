import React, { useEffect } from 'react';
import { MapContainer, TileLayer, useMap as useLeafletMap } from 'react-leaflet';
import { useMap as useAppMap } from '../context/MapContext.jsx';
import MapLegend from './MapLegend.jsx';

// Bridges react-leaflet's internal map instance out to our MapContext
// so any sidebar feature can call map.setView(...) / open a popup.
function MapRegistrar() {
  const leafletMap = useLeafletMap();
  const { setMap } = useAppMap();

  useEffect(() => {
    setMap(leafletMap);
    return () => setMap(null);
  }, [leafletMap, setMap]);

  // The map now mounts inside an animated workspace panel (fading /
  // scaling in) instead of always occupying the full viewport, so
  // Leaflet's cached container size can be stale for a moment after
  // it appears. invalidateSize() re-measures it once the entrance
  // animation has settled, which stops the classic "half-grey tiles"
  // glitch on a resized/re-shown map.
  useEffect(() => {
    const id = setTimeout(() => leafletMap.invalidateSize(), 260);
    return () => clearTimeout(id);
  }, [leafletMap]);

  return null;
}

export default function MapView() {
  return (
    <div className="map-pane">
      <MapContainer
        center={[25.75, 93.95]}
        zoom={10}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapRegistrar />
      </MapContainer>
      <MapLegend />
    </div>
  );
}
