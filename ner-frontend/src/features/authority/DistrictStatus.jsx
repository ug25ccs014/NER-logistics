import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const STATUS_LABELS = {
  normal: 'Normal',
  watch: 'Watch',
  at_risk: 'At risk',
  disrupted: 'Disrupted',
};
const STATUS_COLORS = {
  normal: 'var(--good)',
  watch: 'var(--warn)',
  at_risk: '#f97316',
  disrupted: 'var(--danger)',
};

export default function DistrictStatus() {
  const { t } = useLanguage();
  const [districts, setDistricts] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.districtStatus().then(setDistricts).catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <div className="section-title">District Connectivity ({districts.length})</div>
      {error && <div className="status-line">Failed to load district status: {error}</div>}
      {!error && districts.length === 0 && <div className="status-line">{t('no_districts')}</div>}
      {districts.map((d, idx) => (
        <div className="card" key={idx} style={{ cursor: 'default' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <b>{d.name}</b>
            <span
              style={{
                background: STATUS_COLORS[d.connectivity_status] || '#666',
                color: '#0f172a',
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {STATUS_LABELS[d.connectivity_status] || d.connectivity_status}
            </span>
          </div>
          <div className="status-line">
            {d.state}{d.is_remote ? ' · remote' : ''} · {d.total_segments} monitored segment(s)
          </div>
          <div className="status-line">
            {d.blocked_segments} blocked · {d.restricted_segments} restricted · {d.active_alerts} active alert(s)
          </div>
        </div>
      ))}
    </div>
  );
}
