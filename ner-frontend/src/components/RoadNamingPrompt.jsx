import React, { useState } from 'react';
import { api } from '../api.js';
import { useLocationTracking } from '../context/LocationTrackingContext.jsx';

// Non-blocking prompt shown when normal GPS presence detects that the user
// has actually travelled an unnamed/suggested road. It never appears while
// the driver is required to interact with the map; naming can be skipped.
export default function RoadNamingPrompt() {
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
        ✓ Thanks — your road name suggestion was submitted for verification.
      </div>
    );
  }

  return (
    <div className="road-name-prompt">
      <div className="road-name-prompt-title">🛣️ Help map the NER</div>
      <div className="road-name-prompt-road">
        You recently passed <b>{roadOpportunity.road_code}</b>, currently shown as an unnamed road.
      </div>
      <div className="road-name-prompt-meta">
        {roadOpportunity.length_km ? `${roadOpportunity.length_km.toFixed(1)} km · ` : ''}
        {roadOpportunity.unique_passers || 0} traveller(s) have passed this road.
      </div>
      <input
        className="text-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="What do locals call this road?"
        maxLength={200}
      />
      <div className="road-name-row">
        <select className="text-input" value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="en">English</option>
          <option value="as">Assamese</option>
          <option value="hi">Hindi</option>
          <option value="local">Local language</option>
        </select>
        <input
          className="text-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional landmark/context"
          maxLength={300}
        />
      </div>
      <div className="road-name-actions">
        <button className="btn btn-primary" onClick={submit} disabled={busy || !name.trim()}>
          {busy ? 'Submitting…' : 'Submit Name'}
        </button>
        <button className="btn" onClick={clearRoadOpportunity} disabled={busy}>Not now</button>
      </div>
    </div>
  );
}
