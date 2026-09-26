import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useMap } from '../context/MapContext.jsx';
import { useChat } from '../context/ChatContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

// Ported from checkForDirectNotifications(): polls every 8s for
// anything addressed to this session_id (sent via the Notify buttons
// elsewhere in the app) and shows a dismissible toast, with an
// optional "{t('view_on_map_btn')}" if the sender included their location.
export default function NotificationsWatcher() {
  const { t } = useLanguage();
  const { sessionId } = useAuth();
  const { map } = useMap();
  const { openChat } = useChat();
  const [queue, setQueue] = useState([]);
  const markerRef = useRef(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const notifications = await api.notifications(sessionId);
        if (notifications.length > 0) setQueue((q) => [...q, ...notifications]);
      } catch {
        // best-effort background polling
      }
    };
    poll();
    const id = setInterval(poll, 8000);
    return () => clearInterval(id);
  }, [sessionId]);

  if (queue.length === 0) return null;
  const n = queue[0];

  const dismiss = () => setQueue((q) => q.slice(1));

  const chatWithSender = () => {
    openChat(n.from_session_id, n.from_name, n.from_role);
    dismiss();
  };

  const viewOnMap = () => {
    if (!n.lat || !n.lon || !map) return;
    if (markerRef.current) map.removeLayer(markerRef.current);
    markerRef.current = L.marker([n.lat, n.lon], {
      icon: L.divIcon({
        className: '',
        html: `<div style="background:#1e293b; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid #3b82f6; font-size:16px;">${n.from_role === 'field_official' ? '👮' : n.from_role === 'authority' ? '🏛️' : '🚚'}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
    }).addTo(map);
    markerRef.current.bindPopup(`<b>${n.from_name}</b><br/>${n.message || ''}${n.from_phone ? `<br/>📞 ${n.from_phone}` : ''}`).openPopup();
    map.setView([n.lat, n.lon], 13);
    dismiss();
  };

  return (
    <div
      style={{
        position: 'fixed', top: 76, right: 20, zIndex: 2050,
        background: '#1e293b', border: '2px solid var(--accent)', borderRadius: 10,
        padding: 14, maxWidth: 300, boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
      }}
    >
      <div style={{ fontWeight: 'bold', color: 'var(--accent)', marginBottom: 6 }}>{t('new_notification')}</div>
      <div>
        <b>{n.from_name || 'Someone'}</b> {n.from_role === 'field_official' ? '👮 Field Official' : '🚚 Driver'}<br />
        {n.message || 'notified you.'}{n.from_phone ? <><br />📞 {n.from_phone}</> : null}
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
        {n.lat && n.lon && (
          <button className="btn btn-primary" style={{ margin: 0 }} onClick={viewOnMap}>{t('view_on_map_btn')}</button>
        )}
        <button className="btn" style={{ margin: 0, background: 'var(--good)', color: '#0f172a' }} onClick={chatWithSender}>{t('chat_btn')}</button>
        <button className="btn" style={{ margin: 0, background: '#3a3a4a' }} onClick={dismiss}>{t('dismiss_btn')}</button>
      </div>
    </div>
  );
}
