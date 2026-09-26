import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';
import PlaceAutocomplete from '../components/PlaceAutocomplete.jsx';
import { api, geocodePlace } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { scoreShipmentCandidates, cargoTypeIcon, SHIPMENT_MATCH_RADIUS_KM } from '../utils/geo.js';
import TripRiskForecast from './TripRiskForecast.jsx';

const CARGO_TYPES = ['general', 'medicine', 'food', 'construction', 'agriculture'];

export default function ShipmentBoard() {
  const { name, phone, sessionId } = useAuth();
  const { t } = useLanguage();
  const [formOpen, setFormOpen] = useState(false);
  const [origin, setOrigin] = useState('');
  const [originPlace, setOriginPlace] = useState(null);
  const [dest, setDest] = useState('');
  const [destPlace, setDestPlace] = useState(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [cargoType, setCargoType] = useState('general');
  const [capacity, setCapacity] = useState('');
  const [vehicleReg, setVehicleReg] = useState('');
  const [notes, setNotes] = useState('');

  const [openPostId, setOpenPostId] = useState(null);
  const [result, setResult] = useState(null); // { status } | { matches } | { error }
  const [forecastPreview, setForecastPreview] = useState(null); // { origin, dest, departAt }
  const [forecastStatus, setForecastStatus] = useState(null);

  const resolve = async (text, picked) => {
    if (picked) return picked;
    if (!text.trim()) throw new Error('Enter both From and To first.');
    return geocodePlace(text);
  };

  // "YYYY-MM-DDTHH:mm:00", no timezone suffix -- the backend treats a
  // bare ISO string like this as IST, same convention travel_date/
  // travel_time already use everywhere else in this app.
  const buildDepartAt = () => `${date}T${time || '08:00'}:00`;

  const previewRisk = async () => {
    if (!origin.trim() || !dest.trim() || !date) {
      setForecastStatus('Fill in From, To and Date first to preview the risk forecast.');
      return;
    }
    setForecastStatus('Resolving locations...');
    let o, d;
    try {
      [o, d] = await Promise.all([resolve(origin, originPlace), resolve(dest, destPlace)]);
    } catch (err) {
      setForecastStatus(`Could not resolve From/To: ${err.message}`);
      return;
    }
    setForecastStatus(null);
    setForecastPreview({ origin: o, dest: d, departAt: buildDepartAt() });
  };

  const submitPost = async () => {
    if (!name.trim() || !phone.trim()) {
      alert(t('shipment_need_identity'));
      return;
    }
    if (!origin.trim() || !dest.trim() || !date) {
      alert(t('shipment_required'));
      return;
    }
    let o, d;
    try {
      [o, d] = await Promise.all([resolve(origin, originPlace), resolve(dest, destPlace)]);
    } catch (err) {
      alert(`Could not resolve From/To: ${err.message}`);
      return;
    }
    try {
      const post = await api.postShipment({
        session_id: sessionId,
        driver_name: name,
        phone,
        vehicle_reg: vehicleReg.trim() || null,
        origin_text: origin.trim(),
        origin_lat: o.lat,
        origin_lon: o.lon,
        dest_text: dest.trim(),
        dest_lat: d.lat,
        dest_lon: d.lon,
        travel_date: date,
        travel_time: time || null,
        cargo_type: cargoType,
        available_capacity_kg: capacity ? parseInt(capacity, 10) : null,
        space_notes: notes.trim() || null,
      });
      setOpenPostId(post.id);
      setFormOpen(false);
      setOrigin(''); setDest(''); setDate(''); setTime(''); setCapacity(''); setVehicleReg(''); setNotes('');
      setForecastPreview(null);
      setResult({ posted: { originText: origin, destText: dest, date } });
    } catch (err) {
      alert(`Could not post to the shipment board: ${err.message}`);
    }
  };

  const findMatches = async () => {
    if (!origin.trim() || !dest.trim()) {
      setResult({ error: 'Enter From and To above first.' });
      return;
    }
    setResult({ loading: true });
    let myOrigin, myDest;
    try {
      [myOrigin, myDest] = await Promise.all([resolve(origin, originPlace), resolve(dest, destPlace)]);
    } catch (err) {
      setResult({ error: err.message });
      return;
    }
    try {
      const candidates = await api.shipmentBoard(date || undefined);
      const scored = scoreShipmentCandidates(myOrigin, myDest, candidates, sessionId);
      setResult({ matches: scored });
    } catch (err) {
      setResult({ error: err.message });
    }
  };

  const contact = async (post) => {
    try {
      await api.notify({ toSessionId: post.session_id, fromSessionId: sessionId, fromName: name, fromPhone: phone });
      alert(`Notified ${post.driver_name}.`);
    } catch (err) {
      alert(`Could not send notification: ${err.message}`);
    }
  };

  const markDone = async () => {
    if (!openPostId) return;
    try {
      await api.updateShipmentStatus(openPostId, sessionId, 'merged');
      setOpenPostId(null);
      setResult({ done: true });
    } catch (err) {
      alert(`Could not update the post: ${err.message}`);
    }
  };

  return (
    <div>
      <div className="section-title">{t('shipment_board_title')}</div>
      <button className="btn btn-primary" onClick={() => setFormOpen((v) => !v)}>
        {t('post_trip')}
      </button>

      {formOpen && (
        <div style={{ marginTop: 8 }}>
          <PlaceAutocomplete
            placeholder="From (e.g. Dimapur, Nagaland)"
            value={origin}
            onChange={(t, p) => { setOrigin(t); setOriginPlace(p); }}
          />
          <PlaceAutocomplete
            placeholder="To (e.g. Kohima, Nagaland)"
            value={dest}
            onChange={(t, p) => { setDest(t); setDestPlace(p); }}
          />
          <input className="text-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input
            className="text-input"
            type="time"
            placeholder="Departure time (optional)"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <select className="text-input" value={cargoType} onChange={(e) => setCargoType(e.target.value)}>
            {CARGO_TYPES.map((c) => (
              <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
          <input
            className="text-input"
            type="number"
            min="0"
            placeholder="Spare capacity (kg, optional)"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
          <input
            className="text-input"
            placeholder="Vehicle reg. no. (optional)"
            value={vehicleReg}
            onChange={(e) => setVehicleReg(e.target.value)}
          />
          <textarea
            className="text-input"
            rows={2}
            placeholder="Space available -- e.g. '2 crates worth, back of pickup'"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <button className="btn" style={{ background: '#7c3aed' }} onClick={findMatches}>
            {t('find_matches')}
          </button>
          <button className="btn" style={{ background: '#0e7490' }} onClick={previewRisk}>
            {t('preview_trip_risk')}
          </button>
          <button className="btn btn-primary" onClick={submitPost}>{t('post_to_board')}</button>
          <button className="btn" style={{ background: '#3a3a4a' }} onClick={() => { setFormOpen(false); setForecastPreview(null); }}>{t('cancel')}</button>
        </div>
      )}

      {forecastStatus && <div className="status-line" style={{ marginTop: 8 }}>{forecastStatus}</div>}
      {forecastPreview && (
        <TripRiskForecast
          origin={forecastPreview.origin}
          dest={forecastPreview.dest}
          departAt={forecastPreview.departAt}
        />
      )}

      {result?.loading && <div className="status-line" style={{ marginTop: 8 }}>{t('finding_drivers')}</div>}
      {result?.error && <div className="status-line" style={{ marginTop: 8 }}>{result.error}</div>}
      {result?.done && <div className="status-line" style={{ marginTop: 8 }}>{t('marked_merged')}</div>}
      {result?.posted && (
        <div className="card" style={{ borderLeft: '3px solid var(--good)', marginTop: 8 }}>
          <b>✅ Posted:</b> {result.posted.originText} → {result.posted.destText} ({result.posted.date})
          <button
            className="btn"
            style={{ background: '#3a3a4a', marginTop: 6, width: 'auto', padding: '4px 10px', fontSize: 12 }}
            onClick={markDone}
          >
            Mark merged / remove
          </button>
        </div>
      )}
      {result?.matches && result.matches.length === 0 && (
        <div className="status-line" style={{ marginTop: 8 }}>
          No open posts within {SHIPMENT_MATCH_RADIUS_KM}km of this route (either direction) yet.
        </div>
      )}
      {result?.matches?.map((s, idx) => (
        <div className="card" key={idx}>
          <b>{s.reverse ? '🔁 Return-leg match' : '➡️ Same-direction match'}</b> · {cargoTypeIcon(s.post.cargo_type)}{' '}
          {s.post.origin_text} → {s.post.dest_text}
          <div className="status-line">
            {s.post.travel_date}
            {s.post.travel_time ? ` · ${s.post.travel_time}` : ''} · {s.post.driver_name}
            {s.post.available_capacity_kg ? ` · ${s.post.available_capacity_kg} kg spare` : ''}
          </div>
          <button
            className="btn"
            style={{ background: 'var(--good)', color: '#0f172a', marginTop: 6, width: 'auto', padding: '4px 10px', fontSize: 12 }}
            onClick={() => contact(s.post)}
          >
            {t('contact_merge')}
          </button>
        </div>
      ))}
    </div>
  );
}
