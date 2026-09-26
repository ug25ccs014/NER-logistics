import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { scoreShipmentCandidates, hoursUntilDeparture, cargoTypeIcon } from '../utils/geo.js';

const URGENT_WINDOW_HOURS = 3;
const OTHER_WINDOW_HOURS = 72;

// Ported from autoFindShipmentMatchesForRoute(): the moment a route is
// searched, surface any open shipment-board posts on a similar trip,
// split into "departing soon" vs "later this week" -- no need to
// separately open the Shipment Board form and search again.
export default function ShipmentMatchesForRoute({ origin, dest }) {
  const { t } = useLanguage();
  const { sessionId, name, phone } = useAuth();
  const [urgent, setUrgent] = useState([]);
  const [other, setOther] = useState([]);

  useEffect(() => {
    let cancelled = false;
    api
      .shipmentBoard()
      .then((candidates) => {
        if (cancelled) return;
        const scored = scoreShipmentCandidates(origin, dest, candidates, sessionId);
        const u = [];
        const o = [];
        scored.forEach((s) => {
          const hrs = hoursUntilDeparture(s.post);
          if (hrs < 0 || hrs > OTHER_WINDOW_HOURS) return;
          (hrs <= URGENT_WINDOW_HOURS ? u : o).push(s);
        });
        setUrgent(u);
        setOther(o);
      })
      .catch(() => {
        setUrgent([]);
        setOther([]);
      });
    return () => {
      cancelled = true;
    };
  }, [origin, dest, sessionId]);

  const contact = async (post) => {
    try {
      await api.notify({
        toSessionId: post.session_id,
        fromSessionId: sessionId,
        fromName: name || 'Someone nearby',
        fromPhone: phone || null,
      });
      alert(`Notified ${post.driver_name}.`);
    } catch (err) {
      alert(`Could not send notification: ${err.message}`);
    }
  };

  const card = (s, idx) => (
    <div className="card" key={idx} style={{ borderLeft: '3px solid #7c3aed' }}>
      <b>{s.reverse ? '🔁 Return-leg match' : '➡️ Same-direction match'}</b> · {cargoTypeIcon(s.post.cargo_type)}{' '}
      {s.post.origin_text} → {s.post.dest_text}
      <div className="status-line">
        {s.post.travel_date}
        {s.post.travel_time ? ` · ${s.post.travel_time}` : ''} · {s.post.driver_name}
        {s.post.available_capacity_kg ? ` · ${s.post.available_capacity_kg} kg spare` : ''}
      </div>
      <button
        className="btn"
        style={{ background: 'var(--good)', color: '#18324A', marginTop: 6, width: 'auto', padding: '4px 10px', fontSize: 12 }}
        onClick={() => contact(s.post)}
      >
        {t('contact_merge')}
      </button>
    </div>
  );

  if (urgent.length === 0 && other.length === 0) return null;

  return (
    <div>
      {urgent.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 14 }}>{t('find_trips_urgent').replace('{h}', URGENT_WINDOW_HOURS)}</div>
          {urgent.map(card)}
        </>
      )}
      {other.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 14 }}>{t('find_other_trips')}</div>
          {other.map(card)}
        </>
      )}
    </div>
  );
}
