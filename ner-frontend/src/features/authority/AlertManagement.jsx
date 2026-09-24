import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useSegments } from '../../context/SegmentsContext.jsx';

const ALERT_TYPES = [
  ['blocked_road', 'Blocked road'],
  ['high_risk', 'High risk'],
  ['delivery_delay', 'Delivery delay'],
  ['emergency', 'Emergency'],
];
const SEVERITIES = [['info', 'Info'], ['warning', 'Warning'], ['critical', 'Critical']];

export default function AlertManagement() {
  const { segments } = useSegments();
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [segmentId, setSegmentId] = useState('');
  const [alertType, setAlertType] = useState('blocked_road');
  const [severity, setSeverity] = useState('info');
  const [message, setMessage] = useState('');

  const load = () => api.alerts().then(setAlerts).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);

  const sortedSegments = segments
    ? [...segments.features].sort((a, b) => a.properties.name.localeCompare(b.properties.name))
    : [];

  const publish = async () => {
    if (!segmentId || !message.trim()) {
      alert('Choose a segment and enter a message.');
      return;
    }
    try {
      await api.createAlert({ segment_id: parseInt(segmentId, 10), alert_type: alertType, severity, message: message.trim() });
      setMessage('');
      setFormOpen(false);
      load();
    } catch (err) {
      alert(`Could not publish alert: ${err.message}`);
    }
  };

  const resolve = async (id) => {
    try {
      await api.resolveAlert(id);
      load();
    } catch (err) {
      alert(`Could not resolve alert: ${err.message}`);
    }
  };

  return (
    <div>
      <div className="section-title">Alert Management ({alerts.length} active)</div>
      {error && <div className="status-line">Failed to load alerts: {error}</div>}
      {!error && alerts.length === 0 && <div className="status-line">No active alerts.</div>}
      {alerts.map((a) => (
        <div className="card" key={a.id} style={{ cursor: 'default', borderLeft: `3px solid ${a.severity === 'critical' ? 'var(--danger)' : a.severity === 'warning' ? 'var(--warn)' : 'var(--accent)'}` }}>
          <b>{a.segment_name}</b>
          <div className="status-line">{a.message}</div>
          <div className="status-line">{(a.alert_type || '').replace(/_/g, ' ')} · source: {a.source || 'n/a'}</div>
          <button className="btn" style={{ background: '#3a3a4a', margin: '6px 0 0', fontSize: 11, padding: '5px 10px', width: 'auto' }} onClick={() => resolve(a.id)}>
            Mark Resolved
          </button>
        </div>
      ))}

      <button className="btn" style={{ background: '#3a3a4a' }} onClick={() => setFormOpen((v) => !v)}>
        + Create Manual Alert
      </button>
      {formOpen && (
        <div style={{ marginTop: 8 }}>
          <select className="text-input" value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
            <option value="">Select a road segment...</option>
            {sortedSegments.map((f) => (
              <option key={f.properties.id} value={f.properties.id}>{f.properties.name}</option>
            ))}
          </select>
          <select className="text-input" value={alertType} onChange={(e) => setAlertType(e.target.value)}>
            {ALERT_TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <select className="text-input" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            {SEVERITIES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <textarea className="text-input" rows={2} placeholder="Alert message..." value={message} onChange={(e) => setMessage(e.target.value)} />
          <button className="btn btn-primary" onClick={publish}>Publish Alert</button>
        </div>
      )}
    </div>
  );
}
