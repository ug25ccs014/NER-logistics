import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useMap } from '../context/MapContext.jsx';
import { useChat } from '../context/ChatContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useLocationTracking } from '../context/LocationTrackingContext.jsx';

// This replaces the old "Nearby Help (Live Location)" panel that had
// a <select id="driverRole"> letting a Field Reporter re-declare
// themselves as "Driver / Transporter". Role now comes from
// useAuth() -- the same role the person logged in as -- full stop.
// There is nothing left to pick here.

function personIcon(role, status) {
  const emoji = role === 'field_official' ? '👮' : role === 'authority' ? '🏛️' : '🚚';
  const bg = status === 'stuck' ? '#dc2626' : '#2563eb';
  return L.divIcon({
    className: '',
    html: `<div style="background:${bg}; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; font-size:16px;">${emoji}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export default function LiveLocationSos() {
  const { name, setName, phone, setPhone, sessionId, apiRole } = useAuth();
  const { map } = useMap();
  const { openChat } = useChat();
  const { t } = useLanguage();
  const { isTracking: sharing, permission, lastPosition, startTracking, stopTracking, setStatus: setTrackingStatus } = useLocationTracking();
  const [shareStatus, setShareStatus] = useState(t('not_sharing'));

  // Keep the SOS page status synchronized with the app-wide location tracker.
  // The tracker can start/stop outside this page, so local button state alone
  // must not be treated as the source of truth.
  useEffect(() => {
    if (sharing) {
      setShareStatus(t('sharing_as_template').replace('{name}', name || 'Unknown user'));
    } else if (permission === 'denied') {
      setShareStatus(t('sos_gps_not_available'));
    } else {
      setShareStatus(t('not_sharing'));
    }
  }, [sharing, permission, name, t]);
  const [stuckResults, setStuckResults] = useState(null);
  const [stuckAlert, setStuckAlert] = useState(null); // { driver } -- "someone nearby needs help" toast
  const markersRef = useRef([]);
  const myPosRef = useRef(null); // own last-known position, sent along with a Notify so the recipient can view it on the map
  const pollIdRef = useRef(null);
  const stuckAlertPollRef = useRef(null);
  const notifiedStuckIdsRef = useRef(new Set());

  // role -> translated display label, used everywhere a person's
  // role is shown (nearby list, stuck alert toast, map popups stay
  // in personIcon()'s own emoji-only rendering).
  const roleLabel = (role) => (role === 'field_official' ? t('role_field_official') : role === 'authority' ? 'Authority' : t('role_driver'));

  // Location tracking is app-wide; navigating away from this tool must not
  // remove the user's presence from the nearby-help directory.
  useEffect(() => {
    if (!lastPosition) return;
    myPosRef.current = lastPosition;
    // Once app-wide tracking has a position, the SOS/help panel can
    // immediately discover other logged-in users nearby. No manual
    // Start Sharing or SOS action is required just to populate contacts.
    refreshNearbyPeople(lastPosition.lat, lastPosition.lon);
  }, [lastPosition]);

  const focusPersonOnMap = (d) => {
    if (!map || !d || d.lat == null || d.lon == null) return;
    map.invalidateSize();
    map.setView([d.lat, d.lon], 15, { animate: true });

    // Reuse the existing marker when possible; otherwise create a temporary
    // one so a person can always be located immediately from the help list.
    const existing = markersRef.current.find((m) => {
      const ll = m.getLatLng();
      return Math.abs(ll.lat - Number(d.lat)) < 0.00001 && Math.abs(ll.lng - Number(d.lon)) < 0.00001;
    });
    const marker = existing || L.marker([d.lat, d.lon], { icon: personIcon(d.role, d.status) }).addTo(map);
    marker.bindPopup(
      `<b>${d.driver_name}</b><br/>${roleLabel(d.role)}<br/>${t('km_away_template').replace('{km}', d.distance_km)}${d.phone ? `<br/>📞 ${d.phone}` : ''}`
    ).openPopup();
    if (!existing) markersRef.current.push(marker);
  };

  const refreshNearbyPeople = async (lat, lon) => {
    try {
      const nearby = await api.nearbyPeople(lat, lon, sessionId, 25);
      markersRef.current.forEach((m) => map && map.removeLayer(m));
      if (map) {
        markersRef.current = nearby.map((d) => {
          const marker = L.marker([d.lat, d.lon], { icon: personIcon(d.role, d.status) }).addTo(map);
          marker.bindPopup(`<b>${d.driver_name}</b><br/>${roleLabel(d.role)}<br/>${t('km_away_template').replace('{km}', d.distance_km)}${d.phone ? `<br/>📞 ${d.phone}` : ''}`);
          marker.on('click', () => {
            map.setView([d.lat, d.lon], 15, { animate: true });
            marker.openPopup();
          });
          return marker;
        });
      }
      setStuckResults({ people: nearby });
    } catch (err) {
      setStuckResults({ error: err.message });
    }
  };

  // While actively sharing, periodically check whether anyone newly
  // "stuck" has appeared nearby, and pop an alert the first time each
  // one is seen (tracked so it doesn't re-alert every poll).
  const checkForNearbyStuckAlerts = async () => {
    if (!myPosRef.current) return;
    try {
      const nearby = await api.nearbyPeople(myPosRef.current.lat, myPosRef.current.lon, sessionId, 25);
      const newlyStuck = nearby.find((d) => d.status === 'stuck' && !notifiedStuckIdsRef.current.has(d.session_id));
      if (newlyStuck) {
        notifiedStuckIdsRef.current.add(newlyStuck.session_id);
        setStuckAlert(newlyStuck);
      }
    } catch {
      // best-effort background polling
    }
  };

  const toggleSharing = () => {
    if (sharing) {
      localStorage.setItem('ner_location_tracking_enabled', 'false');
      stopTracking();
      setShareStatus(t('not_sharing'));
      return;
    }
    if (!navigator.geolocation) {
      setShareStatus(t('sos_gps_not_available'));
      return;
    }
    const started = startTracking();
    if (started) setShareStatus(t('sharing_as_template').replace('{name}', name));
  };

  const notifyPerson = async (idx) => {
    const d = stuckResults?.people?.[idx];
    if (!d) return;
    try {
      await api.notify({
        toSessionId: d.session_id,
        fromSessionId: sessionId,
        fromName: name || 'Someone nearby',
        fromPhone: phone || null,
        fromRole: apiRole,
        lat: myPosRef.current?.lat,
        lon: myPosRef.current?.lon,
      });
      alert(t('notified_person_template').replace('{name}', d.driver_name));
    } catch (err) {
      alert(t('could_not_notify_template').replace('{err}', err.message));
    }
  };

  const findHelp = () => {
    if (!name.trim() || !phone.trim()) {
      setStuckResults({ error: t('err_enter_name_phone') });
      return;
    }
    if (!navigator.geolocation) {
      setStuckResults({ error: t('sos_gps_not_available') });
      return;
    }

    const search = async (lat, lon) => {
      myPosRef.current = { lat, lon };
      setTrackingStatus('stuck');
      await api.postLocation(sessionId, name, phone, apiRole, lat, lon, 'stuck').catch(() => {});
      if (map) map.setView([lat, lon], 11);
      await refreshNearbyPeople(lat, lon);
      if (pollIdRef.current !== null) clearInterval(pollIdRef.current);
      pollIdRef.current = setInterval(() => refreshNearbyPeople(lat, lon), 45000);
    };

    setStuckResults({ loading: true });
    if (lastPosition) {
      search(lastPosition.lat, lastPosition.lon);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => search(pos.coords.latitude, pos.coords.longitude),
      (err) => setStuckResults({ error: err.message }),
      { enableHighAccuracy: true }
    );
  };

  const viewStuckOnMap = () => {
    if (!stuckAlert || !map) return;
    const marker = L.marker([stuckAlert.lat, stuckAlert.lon], { icon: personIcon(stuckAlert.role, 'stuck') }).addTo(map);
    marker.bindPopup(`<b>${stuckAlert.driver_name}</b><br/>${t('km_away_template').replace('{km}', stuckAlert.distance_km)}${stuckAlert.phone ? `<br/>📞 ${stuckAlert.phone}` : ''}`).openPopup();
    map.setView([stuckAlert.lat, stuckAlert.lon], 13);
    setStuckAlert(null);
  };

  const chatFromStuckAlert = () => {
    if (!stuckAlert) return;
    openChat(stuckAlert.session_id, stuckAlert.driver_name, stuckAlert.role);
    setStuckAlert(null);
  };

  return (
    <div>
      <div className="section-title">{t('sos_title')}</div>
      <input
        className="text-input"
        placeholder={t('your_name_required_ph')}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="text-input"
        placeholder={t('phone_required_ph')}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <button className="btn btn-primary" onClick={toggleSharing}>
        {sharing ? t('stop_sharing_btn') : t('start_sharing_btn')}
      </button>
      <div className="status-line">{shareStatus}</div>
      <button
        className="btn"
        style={{ background: 'var(--danger)', marginTop: 6 }}
        onClick={findHelp}
      >
        {t('im_stuck_btn')}
      </button>
      {stuckResults?.loading && <div className="status-line">{t('searching_nearby')}</div>}
      {stuckResults?.error && <div className="status-line">{stuckResults.error}</div>}
      {stuckResults?.people && stuckResults.people.length === 0 && (
        <div className="status-line">{t('no_one_nearby')}</div>
      )}
      {stuckResults?.people?.map((d, idx) => (
        <div className="card" key={idx} style={{ cursor: 'pointer' }} onClick={() => focusPersonOnMap(d)}>
          <b>{d.driver_name}</b> {d.role === 'field_official' ? '👮' : d.role === 'authority' ? '🏛️' : '🚚'} {roleLabel(d.role)}
          <div className="status-line">
            {t('km_away_template').replace('{km}', d.distance_km)}{d.phone ? ` · 📞 ${d.phone}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button
              className="btn"
              style={{ background: 'var(--accent)', color: 'white', margin: 0, width: 'auto', padding: '4px 10px', fontSize: 12 }}
              onClick={(e) => { e.stopPropagation(); notifyPerson(idx); }}
            >
              {t('notify_btn')}
            </button>
            <button
              className="btn"
              style={{ background: 'var(--good)', color: '#0f172a', margin: 0, width: 'auto', padding: '4px 10px', fontSize: 12 }}
              onClick={(e) => { e.stopPropagation(); openChat(d.session_id, d.driver_name, d.role); }}
            >
              {t('chat_btn')}
            </button>
          </div>
        </div>
      ))}

      {stuckAlert && (
        <div
          style={{
            position: 'fixed', top: 76, right: 20, zIndex: 2000,
            background: '#1e293b', border: '2px solid var(--danger)', borderRadius: 10,
            padding: 14, maxWidth: 300, boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
          }}
        >
          <div style={{ fontWeight: 'bold', color: 'var(--danger)', marginBottom: 6 }}>{t('someone_needs_help_heading')}</div>
          <div>
            <b>{stuckAlert.driver_name}</b> ({roleLabel(stuckAlert.role)})
            <br />
            {t('km_away_template').replace('{km}', stuckAlert.distance_km)}{stuckAlert.phone ? <><br />📞 {stuckAlert.phone}</> : null}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" style={{ margin: 0 }} onClick={viewStuckOnMap}>{t('view_on_map_btn')}</button>
            <button className="btn" style={{ margin: 0, background: 'var(--good)', color: '#0f172a' }} onClick={chatFromStuckAlert}>{t('chat_btn')}</button>
            <button className="btn" style={{ margin: 0, background: '#3a3a4a' }} onClick={() => setStuckAlert(null)}>{t('dismiss_btn')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
