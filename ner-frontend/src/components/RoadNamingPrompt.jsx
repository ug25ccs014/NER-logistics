import React, { useState } from 'react';
import { api } from '../api.js';
import { useLocationTracking } from '../context/LocationTrackingContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

// Non-blocking prompt shown when normal GPS presence detects that the user
// has actually travelled an unnamed/suggested road. It never appears while
// the driver is required to interact with the map; naming can be skipped.
export default function RoadNamingPrompt() {
  const { t } = useLanguage();
  const { roadOpportunity, clearRoadOpportunity } = useLocationTracking();
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('en');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!roadOpportunity && !done) return null;

  const submit = async () => {
    if (!name.trim() || !roadOpportunity) return;
    setBusy(true);
    try {
      await api.submitRoadName({
        segment_id: roadOpportunity.id,
        submitted_name: name.trim(),
        language,
        note: note.trim() || null,
        source: 'driver_pass',
      });
      setDone(true);
      clearRoadOpportunity();
      setTimeout(() => setDone(false), 3500);
      setName('');
      setNote('');
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="road-name-toast">
        {t('road_name_submitted')}
      </div>
    );
  }

  return (
    <div className="road-name-prompt">
      <div className="road-name-prompt-title">{t('road_name_help')}</div>
      <div className="road-name-prompt-road">
        {t('road_name_passed')} <b>{roadOpportunity.road_code}</b>, {t('road_name_unnamed')}
      </div>
      <div className="road-name-prompt-meta">
        {roadOpportunity.length_km ? `${roadOpportunity.length_km.toFixed(1)} km · ` : ''}
        {roadOpportunity.unique_passers || 0} {t('travellers_passed')}
      </div>
      <input
        className="text-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('road_name_ph')}
        maxLength={200}
      />
      <div className="road-name-row">
        <select className="text-input" value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="en">{t('english')}</option>
          <option value="as">{t('assamese')}</option>
          <option value="hi">{t('hindi')}</option>
          <option value="local">{t('local_language')}</option>
        </select>
        <input
          className="text-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('road_name_note_ph')}
          maxLength={300}
        />
      </div>
      <div className="road-name-actions">
        <button className="btn btn-primary" onClick={submit} disabled={busy || !name.trim()}>
          {busy ? 'Submitting…' : t('submit_name')}
        </button>
        <button className="btn" onClick={clearRoadOpportunity} disabled={busy}>{t('not_now')}</button>
      </div>
    </div>
  );
}
