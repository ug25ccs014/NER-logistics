import React, { useRef, useState } from 'react';
import L from 'leaflet';
import { useMap } from '../context/MapContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { buildFieldReportPayload, submitOrQueue } from '../utils/offlineQueue.js';

// Downscales + JPEG-compresses the photo client-side before it goes
// over (often very slow) NER mobile networks. Returns a base64 data
// URL string, capped so requests stay small even at full DB traffic.
function readAndCompressPhoto(file, maxDim = 1280, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read photo'));
    reader.onload = () => {
      img.onerror = () => reject(new Error('Could not decode photo'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// report_type option labels are resolved through t() at render time
// (see REPORT_TYPES usage below) rather than stored as literal text,
// so the dropdown re-translates when the language changes.
const REPORT_TYPE_KEYS = [
  ['landslide', 'report_type_landslide'],
  ['flood', 'report_type_flood'],
  ['road_damage', 'report_type_road_damage'],
  ['bridge_damage', 'report_type_bridge_damage'],
  ['congestion', 'report_type_congestion'],
  ['clear', 'report_type_clear'],
];

export default function FieldReportForm({ onSubmitted }) {
  const { map } = useMap();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('landslide');
  const [description, setDescription] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [locationStatus, setLocationStatus] = useState(t('locating_you'));
  const [photoDataUrl, setPhotoDataUrl] = useState(null);
  const [photoError, setPhotoError] = useState(null);
  const posRef = useRef(null);
  const pinRef = useRef(null);
  const clickHandlerRef = useRef(null);

  const onPhotoSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    try {
      setPhotoDataUrl(await readAndCompressPhoto(file));
    } catch (err) {
      setPhotoError(err.message);
    }
  };

  const setPin = (lat, lon) => {
    posRef.current = { lat, lon };
    if (pinRef.current) map.removeLayer(pinRef.current);
    pinRef.current = L.marker([lat, lon], {
      icon: L.divIcon({ className: '', html: `<div style="font-size:28px;">📍</div>`, iconSize: [28, 28], iconAnchor: [14, 28] }),
    }).addTo(map);
    map.setView([lat, lon], Math.max(map.getZoom(), 12));
  };

  const start = () => {
    setOpen(true);
    setLocationStatus(t('locating_you'));

    // Clicking the map also sets/adjusts the pin, same as the original.
    if (map) {
      clickHandlerRef.current = (e) => setPin(e.latlng.lat, e.latlng.lng);
      map.on('click', clickHandlerRef.current);
    }

    if (!navigator.geolocation) {
      setLocationStatus(t('gps_unavailable_click_map'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPin(pos.coords.latitude, pos.coords.longitude);
        setLocationStatus(t('location_set_from_gps'));
      },
      () => setLocationStatus(t('could_not_get_gps_click_map')),
      { timeout: 8000 }
    );
  };

  const cancel = () => {
    setOpen(false);
    if (pinRef.current) { map.removeLayer(pinRef.current); pinRef.current = null; }
    if (clickHandlerRef.current && map) map.off('click', clickHandlerRef.current);
    posRef.current = null;
    setDescription('');
    setPhotoDataUrl(null);
    setPhotoError(null);
  };

  const submit = async () => {
    if (!posRef.current) {
      setLocationStatus(t('set_location_first'));
      return;
    }
    const payload = buildFieldReportPayload({
      lat: posRef.current.lat,
      lon: posRef.current.lon,
      report_type: type,
      description: description.trim(),
      reporter_name: reporterName.trim() || null,
      photo_base64: photoDataUrl || undefined,
    });
    try {
      const { queued } = await submitOrQueue(payload);
      if (queued) {
        // Still counts as submitted from the user's point of view --
        // it's saved on-device and will send itself once back online.
        alert(t('queued_offline'));
      }
      cancel();
      onSubmitted?.();
    } catch (err) {
      setLocationStatus(t('could_not_submit_template').replace('{err}', err.message));
    }
  };

  return (
    <div>
      <div className="section-title">{t('report_issue_title')}</div>
      <button className="btn btn-primary" onClick={start} disabled={open}>📍 {t('report_issue')}</button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <select className="text-input" value={type} onChange={(e) => setType(e.target.value)}>
            {REPORT_TYPE_KEYS.map(([v, key]) => (
              <option key={v} value={v}>{t(key)}</option>
            ))}
          </select>
          <textarea
            className="text-input"
            rows={3}
            placeholder={t('describe_seeing_ph')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <input
            className="text-input"
            placeholder={t('your_name_optional_ph')}
            value={reporterName}
            onChange={(e) => setReporterName(e.target.value)}
          />
          <label className="status-line" style={{ display: 'block', marginTop: 6 }}>{t('add_photo')}</label>
          <input
            className="text-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPhotoSelected}
          />
          {photoError && <div className="status-line" style={{ color: 'var(--danger, #ef4444)' }}>{photoError}</div>}
          {photoDataUrl && (
            <img
              src={photoDataUrl}
              alt="Report preview"
              style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 6, marginTop: 6 }}
            />
          )}
          <div className="status-line">{locationStatus}</div>
          <button className="btn btn-primary" onClick={submit}>{t('submit_report')}</button>
          <button className="btn" style={{ background: '#3a3a4a', marginTop: 6 }} onClick={cancel}>{t('cancel')}</button>
        </div>
      )}
    </div>
  );
}
