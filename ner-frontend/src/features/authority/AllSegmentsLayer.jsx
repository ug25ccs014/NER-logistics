import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap } from '../../context/MapContext.jsx';
import { useSegments } from '../../context/SegmentsContext.jsx';
import { getRiskColor } from '../../utils/geo.js';

// Authority sees the whole monitored network at once (drivers/reporters
// only see risk on their searched route -- an authority user needs the
// full picture). Renders once when segments load, cleans up on unmount
// so switching away from the Authority dashboard clears it.
export default function AllSegmentsLayer() {
  const { map } = useMap();
  const { segments } = useSegments();
  const layerRef = useRef(null);

  useEffect(() => {
    if (!map || !segments) return;
    layerRef.current = L.geoJSON(segments, {
      style: (feature) => ({
        color: getRiskColor(feature.properties.risk_score, feature.properties.risk_score !== null),
        weight: 4,
        opacity: 0.8,
      }),
      onEachFeature: (feature, layer) => {
        const p = feature.properties;
        const identity = p.name_status === 'unnamed' ? 'Unnamed Road' : p.name;
        layer.bindPopup(`<b>${identity}</b><br/>Road ID: ${p.road_code || '—'}<br/>Name status: ${p.name_status || 'named'}<br/>Risk: ${p.risk_level ? p.risk_level.toUpperCase() : 'NOT YET SCORED'}${p.risk_score !== null ? ` (score ${p.risk_score})` : ''}<br/>Status: ${p.status}`);
      },
    }).addTo(map);

    return () => {
      if (layerRef.current) map.removeLayer(layerRef.current);
    };
  }, [map, segments]);

  return null;
}
