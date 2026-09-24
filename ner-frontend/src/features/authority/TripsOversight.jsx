import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';

const STATUS_COLORS = {
  in_transit: 'var(--accent)',
  delayed: '#f97316',
  planned: 'var(--muted)',
  completed: 'var(--good)',
};

export default function TripsOversight() {
  const [trips, setTrips] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.trips().then(setTrips).catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <div className="section-title">Trip / Vehicle Oversight ({trips.length})</div>
      {error && <div className="status-line">Failed to load trips: {error}</div>}
      {!error && trips.length === 0 && <div className="status-line">No trips on file.</div>}
      {trips.map((t, idx) => (
        <div className="card" key={idx} style={{ cursor: 'default' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <b>{t.registration_no || 'Unregistered vehicle'}</b>
            <span style={{ background: STATUS_COLORS[t.status] || '#666', color: '#0f172a', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>
              {(t.status || '').replace(/_/g, ' ')}
            </span>
          </div>
          <div className="status-line">{t.cargo_type || 'cargo'} · {t.vehicle_type || 'n/a'}</div>
          <div className="status-line">{t.origin_district || '?'} → {t.dest_district || '?'}</div>
          {t.eta && <div className="status-line">ETA: {new Date(t.eta).toLocaleString()}</div>}
        </div>
      ))}
    </div>
  );
}
