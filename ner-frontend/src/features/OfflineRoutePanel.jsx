import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { useMap } from '../context/MapContext.jsx';
import { useSegments } from '../context/SegmentsContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { buildRoadGraph, planOfflineRoutes } from '../utils/offlineRouter.js';

// "No signal? Plan an offline route": start/destination come from the device GPS
// or a tap on the map (offline place-name search isn't possible), then the route
// is computed ON THE DEVICE from the saved road network + last saved risk scores.
export default function OfflineRoutePanel({ onRoutes }) {
  const { t } = useLanguage();
  const { map } = useMap();
  const { segments, connections } = useSegments();
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [picking, setPicking] = useState(null);
  const [msg, setMsg] = useState(null);
  const markersRef = useRef({});
  const clickRef = useRef(null);     // our own map-click handler, so cleanup never removes anyone else's

  const graph = useMemo(
    () => (segments && connections ? buildRoadGraph(segments, connections) : null),
    [segments, connections]
  );

  const mark = (which, pt) => {
    if (!map) return;
    if (markersRef.current[which]) map.removeLayer(markersRef.current[which]);
    markersRef.current[which] = L.circleMarker([pt.lat, pt.lon], {
      radius: 9, color: '#fff', weight: 3, fillColor: which === 'start' ? '#16A34A' : '#DC2626', fillOpacity: 1,
    }).addTo(map).bindTooltip(which === 'start' ? t('off_start_label') : t('off_end_label'));
  };
  const setPoint = (which, pt) => {
    (which === 'start' ? setStart : setEnd)(pt);
    mark(which, pt);
  };

  useEffect(() => () => {
    if (map) Object.values(markersRef.current).forEach((m) => map.removeLayer(m));
    if (map) { if (clickRef.current) map.off('click', clickRef.current); map.getContainer().style.cursor = ''; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickOnMap = (which) => {
    if (!map) return;
    setPicking(which);
    setMsg(t('off_picking').replace('{what}', which === 'start' ? t('off_start_label') : t('off_end_label')));
    map.getContainer().style.cursor = 'crosshair';
    if (clickRef.current) map.off('click', clickRef.current);
    clickRef.current = (e) => {
      map.getContainer().style.cursor = '';
      setPicking(null);
      setMsg(null);
      setPoint(which, { lat: e.latlng.lat, lon: e.latlng.lng });
    };
    map.once('click', clickRef.current);
  };

  const useMyLocation = () => {
    setMsg(null);
    navigator.geolocation.getCurrentPosition(      // GPS works with no data signal
      (pos) => { const pt = { lat: pos.coords.latitude, lon: pos.coords.longitude }; setPoint('start', pt); map?.setView([pt.lat, pt.lon], 11); },
      () => setMsg('Could not get your location. Pick the start on the map instead.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const plan = () => {
    if (!graph) { setMsg(t('off_no_graph')); return; }
    if (!start || !end) { setMsg(`${t('off_start_label')} + ${t('off_end_label')}?`); return; }
    const { options, error } = planOfflineRoutes(graph, start, end);
    if (error) { setMsg(error); return; }
    setMsg(null);
    onRoutes(options);
  };

  const btn = { marginRight: 6, marginBottom: 6 };
  const fmt = (p) => (p ? `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}` : '—');
  return (
    <details style={{ marginTop: 10 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>📴 {t('off_panel_title')}</summary>
      <div style={{ marginTop: 8 }}>
        <button type="button" className="btn" style={btn} onClick={useMyLocation}>{t('off_use_my_location')}</button>
        <button type="button" className="btn" style={btn} disabled={picking === 'start'} onClick={() => pickOnMap('start')}>{t('off_pick_start')}</button>
        <button type="button" className="btn" style={btn} disabled={picking === 'end'} onClick={() => pickOnMap('end')}>{t('off_pick_end')}</button>
        <div style={{ fontSize: 12, margin: '2px 0 8px' }}>
          🟢 {t('off_start_label')}: {fmt(start)}<br />🔴 {t('off_end_label')}: {fmt(end)}
        </div>
        <button type="button" className="btn btn-primary" onClick={plan}>{t('off_plan_btn')}</button>
        {msg && <div className="status-line" style={{ marginTop: 6 }}>{msg}</div>}
        {!graph && <div className="status-line" style={{ marginTop: 6 }}>{t('off_no_graph')}</div>}
      </div>
    </details>
  );
}
