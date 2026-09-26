import React, { useEffect, useState } from 'react';
import L from 'leaflet';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useMap } from '../context/MapContext.jsx';
import { useLocationTracking } from '../context/LocationTrackingContext.jsx';
import { useSegments } from '../context/SegmentsContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

function IdentityLayer() {
  const { map } = useMap();
  const { segments } = useSegments();
  useEffect(() => {
    if (!map || !segments) return;
    const layer = L.geoJSON(segments, {
      style: (feature) => {
        const p = feature.properties || {};
        const unnamed = ['unnamed', 'suggested', 'community_supported'].includes(p.name_status);
        return { color: unnamed ? '#F2C94C' : '#3F7FD6', weight: unnamed ? 5 : 3, opacity: unnamed ? 0.9 : 0.65, dashArray: unnamed ? '7,6' : undefined };
      },
      onEachFeature: (feature, layerItem) => {
        const p = feature.properties || {};
        const label = p.name_status === 'unnamed' ? 'Unnamed Road' : p.name;
        layerItem.bindTooltip(`${label}${p.road_code ? ` · ${p.road_code}` : ''}`, { sticky: true });
      },
    }).addTo(map);
    return () => map.removeLayer(layer);
  }, [map, segments]);
  return null;
}

export default function RoadIdentity() {
  const { t } = useLanguage();
  const { role } = useAuth();
  const { lastPosition } = useLocationTracking();
  const { refresh: refreshSegments } = useSegments();
  const [roads, setRoads] = useState([]);
  const [queue, setQueue] = useState([]);
  const [selected, setSelected] = useState(null);
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('en');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState(null);

  const load = async () => {
    if (!lastPosition) return;
    try {
      const data = await api.nearbyRoadIdentity(lastPosition.lat, lastPosition.lon, 25, 30);
      setRoads(data);
    } catch (err) { setStatus(err.message); }
  };

  useEffect(() => { load(); }, [lastPosition?.lat, lastPosition?.lon]);

  useEffect(() => {
    if (role !== 'authority') return;
    api.roadNameQueue().then(setQueue).catch((err) => setStatus(err.message));
  }, [role]);

  const choose = (road) => {
    setSelected(road);
    setName(road.suggested_name || '');
    setNote('');
  };

  const submit = async () => {
    if (!selected || !name.trim()) return;
    try {
      await api.submitRoadName({ segment_id: selected.id, submitted_name: name.trim(), language, note: note.trim() || null, source: 'road_identity' });
      setStatus(t('name_submitted_status'));
      setSelected(null);
      setName('');
      await load();
    } catch (err) { setStatus(err.message); }
  };

  const review = async (id, approve) => {
    try {
      await api.reviewRoadName(id, approve);
      setQueue((items) => items.filter((x) => x.id !== id));
      if (approve) refreshSegments();
      setStatus(approve ? t('road_verified_status') : t('submission_rejected_status'));
    } catch (err) { setStatus(err.message); }
  };

  return (
    <>
      <IdentityLayer />
      <div className="section-title">{t('road_identity')}</div>
      <div className="status-line" style={{ marginBottom: 10 }}>
        {t('road_identity_description')}
      </div>

      {!lastPosition && <div className="card">{t('road_identity_location')}</div>}

      {roads.length === 0 && lastPosition && (
        <div className="card">{t('unnamed_nearby_none')}</div>
      )}

      {roads.map((road) => (
        <div className="card" key={road.id} style={{ cursor: 'default' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div><b>{road.name_status === 'unnamed' ? 'Unnamed Road' : road.name}</b><div className="status-line">{road.road_code} · {road.distance_km} km away</div></div>
            <span style={{ color: '#F2C94C', fontSize: 12 }}>{road.name_status}</span>
          </div>
          <div className="status-line">{road.unique_passers} traveller(s) · {road.submission_count} name submission(s)</div>
          {road.suggested_name && <div style={{ marginTop: 5 }}>{t('suggested')} <b>{road.suggested_name}</b></div>}
          <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => choose(road)}>{t('suggest_confirm_local')}</button>
        </div>
      ))}

      {selected && (
        <div className="card" style={{ border: '1px solid var(--accent)' }}>
          <b>{selected.road_code}</b>
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('local_road_name_ph')} maxLength={200} />
          <select className="text-input" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="en">{t('english')}</option><option value="as">{t('assamese')}</option><option value="hi">{t('hindi')}</option><option value="local">{t('local_language')}</option>
          </select>
          <input className="text-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('road_landmark_ph')} maxLength={300} />
          <button className="btn btn-primary" onClick={submit}>{t('submit_verification')}</button>
          <button className="btn" onClick={() => setSelected(null)}>{t('cancel')}</button>
        </div>
      )}

      {role === 'authority' && (
        <>
          <div className="section-title" style={{ marginTop: 18 }}>{t('authority_verification_queue')}</div>
          {queue.length === 0 && <div className="card">{t('no_pending_submissions')}</div>}
          {queue.map((item) => (
            <div className="card" key={item.id} style={{ cursor: 'default' }}>
              <b>{item.road_code}</b> · {item.submitted_name}
              <div className="status-line">{item.same_name_votes} matching submission(s) · {item.unique_passers} unique traveller(s) · {item.submitted_by || 'User'}</div>
              {item.note && <div style={{ marginTop: 4 }}>{item.note}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary" onClick={() => review(item.id, true)}>{t('verify_activate')}</button>
                <button className="btn" onClick={() => review(item.id, false)}>{t('reject')}</button>
              </div>
            </div>
          ))}
        </>
      )}

      {status && <div className="status-line">{status}</div>}
    </>
  );
}
