import React, { useEffect, useRef, useState } from 'react';
import { api, resolvePhotoUrl } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

function formatPct(v) {
  return `${Math.round((Number(v) || 0) * 100)}%`;
}

// risk_score -> 'emergency' | 'high_risk' | null, using the SAME two
// thresholds the backend just told us about (via /ai/session's
// response) rather than a hardcoded number here -- so if you tune
// AI_RISK_THRESHOLD/AI_HIGH_RISK_THRESHOLD in api/.env, this UI stays
// in sync without a rebuild.
function tierFor(riskScore, thresholds) {
  if (riskScore >= thresholds.high) return 'emergency';
  if (riskScore >= thresholds.medium) return 'high_risk';
  return null;
}

export default function LiveDashcamAI() {
  const { t } = useLanguage();
  const { sessionId, name, role } = useAuth();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const busyRef = useRef(false);

  const [mode, setMode] = useState('demo');
  const [cameraOn, setCameraOn] = useState(false);
  const [lat, setLat] = useState(25.7450);
  const [lon, setLon] = useState(93.9800);
  const [locationStatus, setLocationStatus] = useState('Demo coordinates');
  const [last, setLast] = useState(null);
  const [events, setEvents] = useState([]);
  const [videoFile, setVideoFile] = useState(null);
  const [busyVideo, setBusyVideo] = useState(false);
  const [error, setError] = useState('');
  // Sensible defaults matching config.py's own defaults, overwritten
  // as soon as /ai/session responds -- so the UI is never stuck on a
  // stale hardcoded number if the backend's env vars are tuned.
  const [thresholds, setThresholds] = useState({ medium: 35, high: 70 });
  // Once true, the GPS watch below stops overwriting lat/lon -- without
  // this, typing a manual override was pointless: watchPosition fires
  // continuously and would snap the fields straight back to your real
  // location before you could ever trigger a detection with the typed
  // value. This is exactly why "I edited it but got no alert" happened.
  const manualOverrideRef = useRef(false);
  const geoWatchIdRef = useRef(null);

  const setManualCoord = (setter) => (value) => {
    manualOverrideRef.current = true;
    if (geoWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(geoWatchIdRef.current);
      geoWatchIdRef.current = null;
    }
    setter(value);
    setLocationStatus('Manual override (GPS watch stopped)');
  };

  useEffect(() => {
    api.registerAISession(sessionId)
      .then((res) => {
        if (res?.threshold != null && res?.high_risk_threshold != null) {
          setThresholds({ medium: Number(res.threshold), high: Number(res.high_risk_threshold) });
        }
      })
      .catch(() => {});
    if (!navigator.geolocation) return;
    geoWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (manualOverrideRef.current) return; // don't clobber a manual override
        setLat(pos.coords.latitude);
        setLon(pos.coords.longitude);
        setLocationStatus('Live GPS');
      },
      () => setLocationStatus('GPS unavailable — using last coordinates'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => {
      if (geoWatchIdRef.current !== null) navigator.geolocation.clearWatch(geoWatchIdRef.current);
    };
  }, [sessionId]);

  useEffect(() => () => stopCamera(), []);

  async function startCamera() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraOn(true);

      timerRef.current = setInterval(async () => {
        if (busyRef.current || !videoRef.current || videoRef.current.readyState < 2) return;
        busyRef.current = true;
        try {
          const canvas = canvasRef.current;
          canvas.width = videoRef.current.videoWidth || 1280;
          canvas.height = videoRef.current.videoHeight || 720;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.78));
          if (!blob) return;

          const result = await api.detectAIFrame({
            sessionId, lat, lon, imageBlob: blob,
          });
          setLast(result);
          setEvents((old) => [result, ...old].slice(0, 8));
        } catch (e) {
          setError(e.message);
        } finally {
          busyRef.current = false;
        }
      }, 1500);
    } catch (e) {
      setError(`Camera could not start: ${e.message}`);
    }
  }

  function stopCamera() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }

  async function analyzeDemoVideo() {
    if (!videoFile) return;
    setBusyVideo(true);
    setError('');
    try {
      const result = await api.analyzeAIVideo({
        sessionId, lat, lon, videoFile, sampleEvery: 0.5,
      });
      const list = result.results || [];
      setEvents(list.slice().reverse().slice(0, 8));
      setLast(list[list.length - 1] || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyVideo(false);
    }
  }

  const risk = Number(last?.risk_score || 0);
  const tier = last?.tier || tierFor(risk, thresholds); // prefer the backend's own tier when we have one
  const alert = tier !== null;
  const isEmergency = tier === 'emergency';

  return (
    <div className="ai-dashcam">
      <div className="ai-status-card">
        <div>
          <div className="section-title">Live AI hazard detection</div>
          <div className="status-line">
            Dashcam → image frame → AI hazard detection → risk score → alert routing
          </div>
        </div>
        <div className={`ai-live-pill ${cameraOn ? 'is-live' : ''}`}>
          {cameraOn ? '● LIVE' : '● READY'}
        </div>
      </div>

      <div className="ai-video-card">
        <video ref={videoRef} className="ai-video" muted playsInline />
        {!cameraOn && (
          <div className="ai-video-placeholder">
            <div className="ai-camera-icon">📷</div>
            <b>Dashcam feed</b>
            <span>Use your laptop/phone camera or analyze the supplied demo clip.</span>
          </div>
        )}
        {alert && (
          <div
            className={`ai-danger-overlay ${isEmergency ? 'is-emergency' : 'is-medium'}`}
            style={{ background: isEmergency ? 'rgba(220,38,38,0.92)' : 'rgba(245,158,11,0.92)' }}
          >
            {isEmergency ? '🚨 EMERGENCY — HAZARD AHEAD' : '⚠️ HAZARD AHEAD'} · RISK {Math.round(risk)}
          </div>
        )}
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div className="ai-grid">
        <div className="card">
          <b>Detection mode</b>
          <div className="ai-mode-row">
            <button className={`btn ${mode === 'demo' ? 'btn-primary' : ''}`} onClick={() => setMode('demo')}>Demo</button>
            <button className={`btn ${mode === 'live' ? 'btn-primary' : ''}`} onClick={() => setMode('live')}>Live camera</button>
          </div>
          <div className="status-line">
            Backend provider is selected by <code>AI_PROVIDER</code>. Demo runs without a model key.
          </div>
        </div>

        <div className="card">
          <b>GPS</b>
          <div className="status-line">{locationStatus}</div>
          <div className="ai-coords-edit">
            <input
              className="text-input"
              type="number"
              step="0.0001"
              value={lat}
              onChange={(e) => setManualCoord(setLat)(Number(e.target.value))}
              style={{ width: 110, display: 'inline-block' }}
            />
            <input
              className="text-input"
              type="number"
              step="0.0001"
              value={lon}
              onChange={(e) => setManualCoord(setLon)(Number(e.target.value))}
              style={{ width: 110, display: 'inline-block', marginLeft: 6 }}
            />
            <span className="status-line" style={{ marginLeft: 6 }}>
              (editing stops the live GPS watch so your typed value sticks)
            </span>
          </div>
        </div>
      </div>

      {mode === 'live' && (
        <div className="card">
          <b>Live camera</b>
          <div className="status-line">Frames are sampled every 1.5 seconds to avoid flooding the API.</div>
          <button className={`btn ${cameraOn ? 'btn-stop' : 'btn-primary'}`} onClick={cameraOn ? stopCamera : startCamera}>
            {cameraOn ? 'Stop dashcam AI' : 'Start dashcam AI'}
          </button>
        </div>
      )}

      <div className="card">
        <b>Test with dashcam video</b>
        <div className="status-line">Upload a short clip; the backend samples about two frames per second.</div>
        <input
          className="text-input"
          type="file"
          accept="video/*"
          onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
        />
        <button className="btn btn-primary" disabled={!videoFile || busyVideo} onClick={analyzeDemoVideo}>
          {busyVideo ? 'Analyzing frames…' : 'Analyze video'}
        </button>
      </div>

      {last && (
        <div className={`ai-result-card ${alert ? 'is-alert' : ''}`} style={alert ? { borderColor: isEmergency ? '#dc2626' : '#f59e0b' } : undefined}>
          <div className="ai-result-top">
            <div>
              <div className="ai-hazard">{last.hazard === 'none' ? 'No hazard detected' : last.hazard.replaceAll('_', ' ')}</div>
              <div className="status-line">{last.description}</div>
            </div>
            <div className="ai-risk-number">{Math.round(last.risk_score || 0)}</div>
          </div>
          <div className="ai-metrics">
            <span>AI confidence <b>{formatPct(last.confidence)}</b></span>
            <span>Hazard score <b>{Math.round(last.hazard_score || 0)}</b></span>
            <span>Medium threshold <b>{last.threshold ?? thresholds.medium}</b></span>
            <span>Emergency threshold <b>{last.high_risk_threshold ?? thresholds.high}</b></span>
            <span>Confirmed <b>{last.confirmed ? 'YES' : 'NO'}</b></span>
            <span>Road segment <b>{last.segment_name || 'none matched nearby'}</b></span>
          </div>
          {!last.alert_created && last.suppression_reason && (
            <div className="ai-alert-created" style={{ color: '#f59e0b' }}>
              {{
                no_segment: last.nearest_segment_name
                  ? `⚠️ Nearest monitored road is "${last.nearest_segment_name}", ${last.nearest_segment_distance_km} km away -- too far for an alert (limit is 20 km). These GPS coordinates (${lat.toFixed(4)}, ${lon.toFixed(4)}) aren't near your road network's coverage area.`
                  : '⚠️ No road segments exist in the database at all -- check that road data has been imported.',
                not_confirmed: '⚠️ Not confirmed yet — needs a second matching detection within 30 seconds before an alert fires (this avoids one-off false positives).',
                below_threshold: `⚠️ Risk score ${Math.round(last.risk_score || 0)} hasn't crossed the medium threshold (${last.threshold ?? thresholds.medium}) yet.`,
                cooldown_same_tier: `⚠️ This road + hazard already triggered a same-or-higher tier alert recently (recorded risk ${Math.round(last.recent_alert_risk || 0)}), so this one is suppressed to avoid duplicate alerts. It'll fire again once it escalates to a higher tier, or after the cooldown window passes.`,
              }[last.suppression_reason] || `⚠️ No alert created (reason: ${last.suppression_reason}).`}
            </div>
          )}
          {last.alert_created && (
            <div className="ai-alert-created" style={{ color: isEmergency ? '#dc2626' : '#f59e0b' }}>
              {isEmergency
                ? '🚨 EMERGENCY alert created.'
                : '⚠️ Medium-risk alert created.'}
              {' '}
              {last.notified_officer
                ? `Sent to ${last.notified_officer.name} (${last.notified_officer.distance_km} km away) and active authority sessions.`
                : 'No field officer is currently within range and sharing live location -- sent to active authority sessions only. Ask a field officer to press "Start Sharing" in Live Location & SOS.'}
            </div>
          )}
          {last.evidence_url && (
            <a className="status-line" href={resolvePhotoUrl(last.evidence_url)} target="_blank" rel="noreferrer">
              View evidence frame
            </a>
          )}
        </div>
      )}

      {error && <div className="status-line" style={{ color: 'var(--danger)' }}>{error}</div>}

      <div className="section-title">Recent AI frames</div>
      {events.length === 0 && <div className="status-line">No detections yet.</div>}
      {events.map((e, i) => {
        const eventTier = e.tier || tierFor(Number(e.risk_score) || 0, thresholds);
        return (
          <div className="card ai-event" key={`${e.evidence_url}-${i}`}>
            <div>
              <b>{e.hazard === 'none' ? 'Clear' : e.hazard.replaceAll('_', ' ')}</b>
              <div className="status-line">confidence {formatPct(e.confidence)} · risk {Math.round(e.risk_score || 0)}</div>
            </div>
            <span
              className={`ai-mini-score ${eventTier ? 'danger' : ''}`}
              style={eventTier === 'emergency' ? { background: '#dc2626', color: 'white' } : eventTier === 'high_risk' ? { background: '#f59e0b', color: '#1a1a1a' } : undefined}
            >
              {Math.round(e.risk_score || 0)}
            </span>
          </div>
        );
      })}

      {role === 'authority' && (
        <div className="status-line">
          Authority view: AI events are also written to the normal alert and field-report review pipeline.
        </div>
      )}
    </div>
  );
}
