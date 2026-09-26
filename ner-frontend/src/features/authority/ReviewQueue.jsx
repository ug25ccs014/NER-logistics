import React, { useEffect, useState } from 'react';
import { api, resolvePhotoUrl } from '../../api.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { timeAgo } from '../../utils/geo.js';

const FIELD_REPORT_EMOJI = {
  landslide: '🏔️', flood: '🌊', road_damage: '🕳️',
  bridge_damage: '🌉', congestion: '🚗', clear: '✅',
};

export default function ReviewQueue() {
  const [reports, setReports] = useState([]);
  const [error, setError] = useState(null);
  const { lang, t } = useLanguage();

  const load = () => api.fieldReports(30, lang).then(setReports).catch((err) => setError(err.message));
  useEffect(() => { load(); }, [lang]);

  const verify = async (id) => {
    try {
      await api.verifyFieldReport(id, true);
      load();
    } catch (err) {
      alert(`Could not update report: ${err.message}`);
    }
  };

  const clear = async (id) => {
    try {
      await api.resolveFieldReport(id);
      load();
    } catch (err) {
      alert(`Could not clear report: ${err.message}`);
    }
  };

  return (
    <div>
      <div className="section-title">{t('review_queue')}</div>
      {error && <div className="status-line">Failed to load review queue: {error}</div>}
      {!error && reports.length === 0 && <div className="status-line">{t('no_field_reports')}</div>}
      {reports.map((r) => (
        <div className="card" key={r.id} style={{ cursor: 'default' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{FIELD_REPORT_EMOJI[r.report_type] || ''} {(r.report_type_label || r.report_type || '').replace(/_/g, ' ')}</span>
            {r.verified
              ? <span style={{ color: 'var(--good)', fontSize: 12 }}>✅ {t('verified')}</span>
              : <span style={{ color: 'var(--muted)', fontSize: 12 }}>{t('pending')}</span>}
          </div>
          <div className="status-line">{r.description || t('no_description')}</div>
          {r.photo_url && (
            <img
              src={resolvePhotoUrl(r.photo_url)}
              alt={t('field_report_photo')}
              style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 6, marginTop: 6, cursor: 'zoom-in' }}
              onClick={() => window.open(resolvePhotoUrl(r.photo_url), '_blank')}
            />
          )}
          <div className="status-line">
            {r.segment_name ? `Near: ${r.segment_name} · ` : ''}By {r.reporter_name || 'Anonymous'} ({r.reporter_role || 'citizen'}) · {timeAgo(r.captured_at)}
          </div>
          {r.corroborated_by > 0 && (
            <div className="status-line">Corroborated by {r.corroborated_by} other report(s) · confidence {r.confidence_score ?? 'n/a'}</div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {!r.verified && (
              <button className="btn" style={{ background: 'var(--good)', color: '#18324A', margin: 0, fontSize: 12, padding: '6px 10px' }} onClick={() => verify(r.id)}>
                Verify
              </button>
            )}
            <button className="btn" style={{ background: 'var(--danger)', margin: 0, fontSize: 12, padding: '6px 10px' }} onClick={() => clear(r.id)}>
              Clear
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
