import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useLanguage } from '../context/LanguageContext.jsx';

export default function AlertsList() {
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState(null);
  const { lang, t } = useLanguage();

  useEffect(() => {
    const load = () => api.alerts(lang).then(setAlerts).catch((err) => setError(err.message));
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [lang]);

  return (
    <div>
      <div className="section-title">{t('active_alerts')} ({alerts.length})</div>
      {error && <div className="status-line">{error}</div>}
      {!error && alerts.length === 0 && <div className="status-line">{t('no_active_alerts')}</div>}
      {alerts.map((a) => (
        <div className="card" key={a.id} style={{ cursor: 'default' }}>
          <b>{a.segment_name}</b>
          <div className="status-line">{a.message}</div>
          <div className="status-line">{a.alert_type_label || (a.alert_type || '').replace(/_/g, ' ')} · {a.severity_label || a.severity}</div>
        </div>
      ))}
    </div>
  );
}
