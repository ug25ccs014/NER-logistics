import React, { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import L from 'leaflet';
import { api, resolvePhotoUrl } from '../api.js';
import { useMap } from '../context/MapContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { pendingCount } from '../utils/offlineQueue.js';
import { timeAgo } from '../utils/geo.js';

const FIELD_REPORT_EMOJI = {
  landslide: '🏔️', flood: '🌊', road_damage: '🕳️',
  bridge_damage: '🌉', congestion: '🚗', clear: '✅',
};

function reportIcon(report) {
  const emoji = FIELD_REPORT_EMOJI[report.report_type] || '❓';
  const border = report.verified ? '#22c55e' : '#94a3b8';
  return L.divIcon({
    className: '',
    html: `<div style="background:#1e293b; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:3px solid ${border}; box-shadow:0 1px 4px rgba(0,0,0,0.5); font-size:15px;">${emoji}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

// report_type_label/verified text already come translated where
// possible (report_type_label from the backend's ?lang= param); the
// surrounding words ("Near:", "By", "Anonymous", "Corroborated by")
// are translated here via t() before being spliced into the popup's
// raw HTML string (Leaflet popups aren't React, so this has to be a
// plain string rather than JSX).
function popupHtml(r, t) {
  const photo = r.photo_url
    ? `<br/><img src="${resolvePhotoUrl(r.photo_url)}" style="width:100%;max-width:220px;border-radius:4px;margin-top:4px;" />`
    : '';
  return `
    <b>${(r.report_type_label || r.report_type || '').replace(/_/g, ' ').toUpperCase()}</b> ${r.verified ? `✅ ${t('verified_tag')}` : ''}<br/>
    ${r.description ? `${r.description}<br/>` : ''}
    ${r.segment_name ? `${t('near_prefix')} ${r.segment_name}<br/>` : ''}
    ${t('by_reporter_template').replace('{name}', r.reporter_name || t('anonymous_reporter'))} · ${timeAgo(r.captured_at)}
    ${r.corroborated_by > 0 ? `<br/>${t('corroborated_by_template').replace('{n}', r.corroborated_by)}` : ''}
    ${photo}
  `;
}

// forwardRef so a parent (e.g. FieldReportForm's onSubmitted) can
// trigger a reload without lifting all this state up.
const FieldReportsList = forwardRef(function FieldReportsList(_props, ref) {
  const { map } = useMap();
  const { lang, t } = useLanguage();
  const [reports, setReports] = useState([]);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(0);
  const adhocMarkerRef = useRef(null);

  const load = async () => {
    try {
      const data = await api.fieldReports(30, lang);
      setReports(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
    setPending(pendingCount());
  };

  useImperativeHandle(ref, () => ({ reload: load }));

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [lang]);

  const showOnMap = (idx) => {
    const r = reports[idx];
    if (!r || !map) return;
    if (adhocMarkerRef.current) map.removeLayer(adhocMarkerRef.current);
    adhocMarkerRef.current = L.marker([r.lat, r.lon], { icon: reportIcon(r) }).addTo(map);
    adhocMarkerRef.current.bindPopup(popupHtml(r, t)).openPopup();
    map.setView([r.lat, r.lon], 13);
  };

  return (
    <div>
      <div className="section-title">{t('recent_field_reports_template').replace('{n}', reports.length)}</div>
      {pending > 0 && (
        <div className="status-line" style={{ color: 'var(--warn, #f59e0b)' }}>
          {t('reports_pending_sync_template').replace('{n}', pending)}
        </div>
      )}
      {error && <div className="status-line">{error}</div>}
      {!error && reports.length === 0 && <div className="status-line">{t('no_field_reports_yet')}</div>}
      {reports.slice(0, 10).map((r, idx) => (
        <div className="card" key={r.id ?? idx} onClick={() => showOnMap(idx)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{FIELD_REPORT_EMOJI[r.report_type] || ''} {(r.report_type_label || r.report_type || '').replace(/_/g, ' ')}</span>
            {r.verified
              ? <span style={{ color: 'var(--good)', fontSize: 12 }}>✅ {t('verified_tag')}</span>
              : <span style={{ color: 'var(--muted)', fontSize: 12 }}>{t('unverified_tag')}</span>}
          </div>
          {r.photo_url && (
            <img
              src={resolvePhotoUrl(r.photo_url)}
              alt=""
              style={{ width: '100%', maxHeight: 100, objectFit: 'cover', borderRadius: 4, marginTop: 4 }}
            />
          )}
          <div className="status-line">
            {r.segment_name ? `${t('near_prefix')} ${r.segment_name} · ` : ''}
            {t('by_reporter_template').replace('{name}', r.reporter_name || t('anonymous_reporter'))} · {timeAgo(r.captured_at)}
          </div>
        </div>
      ))}
    </div>
  );
});

export default FieldReportsList;
