import React, { useState } from 'react';
import { useSegments } from '../context/SegmentsContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { haversineKm } from '../utils/geo.js';

// Emergency help that does NOT need a data connection:
//  - GPS works with no signal at all
//  - the nearest road comes from the road data saved on the device
//  - SMS and phone calls ride on the voice network, which often survives where mobile data doesn't
// The app can't send an SMS by itself (browsers can't), so it opens the phone's own
// SMS / dialer with everything pre-filled -- the person only taps Send / Call.
const EMERGENCY = [['112', 'Emergency'], ['108', 'Ambulance'], ['100', 'Police'], ['101', 'Fire']];
const CONTACT_KEY = 'ner_sos_contact';
const isiOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

function nearestSavedRoad(segments, lat, lon) {
  let best = null;
  (segments?.features || []).forEach((f) => {
    (f.geometry?.coordinates || []).forEach((c) => {
      if (!Array.isArray(c) || typeof c[0] !== 'number') return;      // (MultiLineString ignored)
      const d = haversineKm([lat, lon], [c[1], c[0]]);
      if (!best || d < best.km) best = { km: d, name: f.properties.road_code || f.properties.name };
    });
  });
  return best;
}

export default function OfflineSosCard({ name, phone }) {
  const { t } = useLanguage();
  const { segments } = useSegments();
  const [fix, setFix] = useState(null);
  const [gpsMsg, setGpsMsg] = useState(null);
  const [contact, setContact] = useState(() => localStorage.getItem(CONTACT_KEY) || '');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  const build = (f) => {
    const road = nearestSavedRoad(segments, f.lat, f.lon);
    const when = new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    return [
      'EMERGENCY - I need help.',
      name ? `Name: ${name}${phone ? `, phone: ${phone}` : ''}.` : phone ? `Phone: ${phone}.` : null,
      `Location: ${f.lat.toFixed(5)}, ${f.lon.toFixed(5)}${f.acc ? ` (accuracy ~${Math.round(f.acc)} m)` : ''}.`,
      road ? `Near: ${road.name} (~${road.km < 1 ? '<1' : road.km.toFixed(1)} km).` : null,
      `Map: https://maps.google.com/?q=${f.lat.toFixed(5)},${f.lon.toFixed(5)}`,
      `Time: ${when}.`,
    ].filter(Boolean).join(' ');
  };

  const getGps = () => {
    setGpsMsg('…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const f = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy };
        setFix(f); setMessage(build(f)); setGpsMsg(null);
      },
      () => setGpsMsg('Could not get GPS. Move to open sky and allow location access, then try again.'),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const saveContact = (v) => { setContact(v); try { localStorage.setItem(CONTACT_KEY, v); } catch { /* ignore */ } };
  const digits = contact.replace(/[^\d+]/g, '');
  const smsHref = `sms:${digits}${isiOS() ? '&' : '?'}body=${encodeURIComponent(message)}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* ignore */ }
  };

  const btn = { marginRight: 6, marginBottom: 6, display: 'inline-block', textDecoration: 'none' };
  return (
    <div style={{ border: '2px solid #C0392B', borderRadius: 10, padding: 10, margin: '8px 0 14px', background: 'rgba(192,57,43,0.08)' }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>🆘 {t('off_sos_title')}</div>
      <div style={{ marginBottom: 6 }}>
        {EMERGENCY.map(([num, label]) => (
          <a key={num} href={`tel:${num}`} className="btn" style={btn}>📞 {num} {label}</a>
        ))}
      </div>
      <button type="button" className="btn btn-primary" style={btn} onClick={getGps}>{t('off_sos_get_gps')}</button>
      {gpsMsg && <div className="status-line">{gpsMsg}</div>}
      {fix && (
        <>
          <div style={{ fontSize: 12, margin: '4px 0' }}>{t('off_sos_msg_label')}</div>
          <textarea className="text-input" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          <input className="text-input" inputMode="tel" placeholder={t('off_sos_contact_ph')} value={contact} onChange={(e) => saveContact(e.target.value)} />
          <a href={digits ? smsHref : undefined} className="btn btn-primary" style={{ ...btn, opacity: digits ? 1 : 0.5 }}>{t('off_sos_sms')}</a>
          <button type="button" className="btn" style={btn} onClick={copy}>{copied ? '✓' : t('off_sos_copy')}</button>
        </>
      )}
      <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4 }}>{t('off_sos_note')}</div>
    </div>
  );
}
