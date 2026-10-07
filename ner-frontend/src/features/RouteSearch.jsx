import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';
import L from 'leaflet';
import PlaceAutocomplete from '../components/PlaceAutocomplete.jsx';
import { api, fetchRealRoutes, geocodePlace } from '../api.js';
import { useMap } from '../context/MapContext.jsx';
import { useSegments } from '../context/SegmentsContext.jsx';
import { useActiveRoute } from '../context/ActiveRouteContext.jsx';
import { riskLevelIcon } from '../utils/mapIcons.js';
import {
  findNearbyMonitoredSegments,
  computeRouteRiskChunks,
  getRiskColor,
  scoreRouteRisk,
  explainRisk,
} from '../utils/geo.js';
import ShipmentMatchesForRoute from './ShipmentMatchesForRoute.jsx';
import WeatherReportCard from './WeatherReportCard.jsx';

// Re-check live weather this often while a route is open and departing "now".
const AUTO_REFRESH_MS = 10 * 60 * 1000;

// Ported from findCustomRoute() / renderCustomRouteResults() /
// renderCustomRouteLines(): resolves From/To, fetches OSRM
// alternatives, scores + colors each one against monitored segments,
// and shows a per-route risk summary with a stretch-by-stretch
// breakdown -- same as the original app, including the marker
// de-duplication (one marker per contiguous risky STRETCH, not one
// per small chunk, which is what caused the marker pile-up you saw).
export default function RouteSearch({ onRouteFound }) {
  const { t } = useLanguage();
  const { map } = useMap();
  const { segments, refresh: refreshSegments } = useSegments();
  const scoresUpdated = segments?.scores_updated_at;
  const { setRouteCoords } = useActiveRoute();

  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [fromPlace, setFromPlace] = useState(null);
  const [toPlace, setToPlace] = useState(null);
  const [status, setStatus] = useState(null);
  const [routeOptions, setRouteOptions] = useState([]); // [{ route, nearbySegments, risk, chunks }]
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [forecastStatus, setForecastStatus] = useState(null);
  const [departAtInput, setDepartAtInput] = useState(''); // '' = leave now; else 'YYYY-MM-DDTHH:mm' local (IST)
  const [lastSearch, setLastSearch] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const baseOptionsRef = useRef([]);

  const routeLayersRef = useRef([]);
  const riskMarkersRef = useRef([]);

  const clearRouteLayers = () => {
    routeLayersRef.current.forEach((l) => map && map.removeLayer(l));
    routeLayersRef.current = [];
    riskMarkersRef.current.forEach((m) => map && map.removeLayer(m));
    riskMarkersRef.current = [];
  };

  const resolvePlace = async (text, picked) => {
    if (picked) return picked;
    if (!text.trim()) throw new Error('Enter both From and To first.');
    return geocodePlace(text);
  };

  // One marker per contiguous run of chunks belonging to the SAME
  // segment (not one per chunk) -- this is what was missing before
  // and caused a dozen overlapping circles along one risky stretch.
  const placeRiskMarkers = (chunks) => {
    let runStart = null;
    let runSegmentId = null;

    const placeFor = (segment, startIdx, endIdx) => {
      if (!segment || !['moderate', 'high', 'severe'].includes(segment.risk_level)) return;
      const icon = riskLevelIcon(segment.risk_level);
      if (!icon) return;
      const midChunk = chunks[Math.floor((startIdx + endIdx) / 2)];
      const midPos = midChunk.coords[Math.floor(midChunk.coords.length / 2)];
      const marker = L.marker(midPos, { icon }).addTo(map);
      marker.bindPopup(
        `<b>${segment.name_status === 'unnamed' ? t('unnamed_road') : segment.name}</b><br/>Road ID: ${segment.road_code || '—'}<br/>${t('popup_risk_label')} <b>${segment.risk_level.toUpperCase()}</b> (score ${segment.risk_score})` +
          reasonsHtml(explainRisk(segment))
      );
      riskMarkersRef.current.push(marker);
    };

    chunks.forEach((chunk, idx) => {
      const key = chunk.segment ? chunk.segment.id : null;
      if (key !== runSegmentId) {
        if (runStart !== null) placeFor(chunks[runStart].segment, runStart, idx - 1);
        runStart = idx;
        runSegmentId = key;
      }
    });
    if (runStart !== null) placeFor(chunks[runStart].segment, runStart, chunks.length - 1);
  };

  const renderRoute = (options, idx) => {
    clearRouteLayers();
    const selected = options[idx];
    setRouteCoords(selected.route.coords); // publish for RidePanel's Start/Simulate Ride

    options.forEach((opt, i) => {
      if (i === idx) {
        opt.chunks.forEach((chunk) => {
          const line = L.polyline(chunk.coords, { color: chunk.color, weight: 6, opacity: 0.95 }).addTo(map);
          line.bindPopup(
            chunk.segment
              ? `<b>${chunk.segment.name_status === 'unnamed' ? t('unnamed_road') : chunk.segment.name}</b><br/>Road ID: ${chunk.segment.road_code || '—'}<br/>${t('popup_risk_label')} <b style="color:${chunk.color}">${
                  chunk.segment.risk_level ? chunk.segment.risk_level.toUpperCase() : 'NOT YET SCORED'
                }</b> (score ${chunk.segment.risk_score})${reasonsHtml(explainRisk(chunk.segment))}`
              : 'No risk data for this stretch (unmonitored road)'
          );
          routeLayersRef.current.push(line);
        });
        placeRiskMarkers(opt.chunks);
      } else {
        const line = L.polyline(opt.route.coords, {
          color: getRiskColor(opt.risk.score, opt.risk.hasData),
          weight: 4,
          opacity: 0.35,
          dashArray: '4,6',
        })
          .addTo(map)
          .on('click', () => selectRoute(i));
        routeLayersRef.current.push(line);
      }
    });

    map.fitBounds(L.latLngBounds(selected.route.coords), { padding: [50, 50] });
  };

  const search = async () => {
    setStatus('Finding route...');
    setForecastStatus(null);
    // Refresh identity/risk data before each planned trip so a road name
    // verified by an authority is immediately used by the next route.
    const refreshed = await refreshSegments();
    const freshSegments = refreshed || segments;
    setRouteOptions([]);
    let origin, dest;
    try {
      [origin, dest] = await Promise.all([resolvePlace(fromText, fromPlace), resolvePlace(toText, toPlace)]);
    } catch (err) {
      setStatus(err.message);
      return;
    }
    try {
      const routes = await fetchRealRoutes([origin.lon, origin.lat], [dest.lon, dest.lat]);
      const baseOptions = routes.map((route) => {
        const nearbySegments = freshSegments ? findNearbyMonitoredSegments(route.coords, freshSegments).slice(0, 12) : [];
        const risk = scoreRouteRisk(nearbySegments);
        const chunks = computeRouteRiskChunks(route.coords, nearbySegments);
        return { route, nearbySegments, risk, chunks, forecasted: false, forecastMeta: null };
      });

      baseOptionsRef.current = baseOptions;
      setLastSearch({ origin, dest });
      const forecastedOptions = await applyForecast(baseOptions, departAtInput);
      setRouteOptions(forecastedOptions);
      setSelectedIndex(0);
      renderRoute(forecastedOptions, 0);
      setStatus(null);
      onRouteFound?.({ origin, dest });
    } catch (err) {
      setStatus(err.message);
    }
  };

  // Departure time sent to the backend: "now" unless the user picked one.
  const departIso = (input) => (input ? `${input}:00` : localIsoMinute(new Date()));

  // Runs the live multi-source forecast for every route option. Options are
  // done one after another (the backend caches + batches weather cells, so the
  // 2nd/3rd option are nearly free). If it fails we keep the route usable but
  // say WHY, instead of silently showing old saved scores.
  const applyForecast = async (baseOptions, input) => {
    setForecastStatus('Checking live weather along the route...');
    const out = [];
    const errors = [];
    for (const opt of baseOptions) {
      if (opt.nearbySegments.length === 0) { out.push(opt); continue; }
      try {
        const forecast = await api.forecastSegments(
          departIso(input),
          opt.nearbySegments.map((s) => s.id),
          Math.round(opt.route.durationMin)
        );
        const byId = new Map((forecast.features || []).map((f) => [f.properties.id, f.properties]));
        const nearbySegments = opt.nearbySegments.map((seg) => {
          const f = byId.get(seg.id);
          return f ? { ...seg, ...f } : seg;
        });
        out.push({
          ...opt,
          nearbySegments,
          risk: scoreRouteRisk(nearbySegments),
          chunks: computeRouteRiskChunks(opt.route.coords, nearbySegments),
          forecasted: true,
          forecastMeta: forecast,
        });
      } catch (err) {
        console.error('Forecast failed for route option:', err);
        errors.push(err.message);
        out.push({ ...opt, forecasted: false, forecastMeta: null });
      }
    }
    const ok = out.filter((o) => o.forecasted).length;
    if (ok > 0) {
      const when = input ? `departing ${new Date(input).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : 'leaving now';
      setForecastStatus(`Live forecast risk updated (${when}).`);
    } else if (errors.length) {
      setForecastStatus(`Live weather unavailable (${errors[0]}). Showing last saved road data instead -- it may be out of date.`);
    } else {
      setForecastStatus(null);
    }
    return out;
  };

  // Re-run only the forecast for the current routes (new departure time or periodic refresh).
  const refreshForecast = async (input = departAtInput) => {
    if (!baseOptionsRef.current.length || refreshing) return;
    setRefreshing(true);
    try {
      const updated = await applyForecast(baseOptionsRef.current, input);
      setRouteOptions(updated);
      const idx = Math.min(selectedIndex, updated.length - 1);
      renderRoute(updated, idx);
    } finally {
      setRefreshing(false);
    }
  };

  // Auto-refresh while a route is open and the trip departs "now".
  useEffect(() => {
    if (!routeOptions.length || departAtInput) return undefined;
    const id = setInterval(() => refreshForecast(''), AUTO_REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeOptions.length, departAtInput, selectedIndex]);

  const pickDeparture = (isoUtc) => {
    // Convert the suggested UTC instant to the input's local 'YYYY-MM-DDTHH:mm'.
    const d = new Date(isoUtc);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    const local = d.toISOString().slice(0, 16);
    setDepartAtInput(local);
    refreshForecast(local);
  };

  const localIsoMinute = (date) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
  };

  const selectRoute = (idx) => {
    setSelectedIndex(idx);
    renderRoute(routeOptions, idx);
  };

  return (
    <div>
      <div className="section-title">{t('route_search_title')}</div>
      <PlaceAutocomplete
        placeholder={t('route_from_ph')}
        value={fromText}
        onChange={(text, picked) => { setFromText(text); setFromPlace(picked); }}
      />
      <PlaceAutocomplete
        placeholder={t('route_to_ph')}
        value={toText}
        onChange={(text, picked) => { setToText(text); setToPlace(picked); }}
      />
      <label style={{ display: 'block', fontSize: 12, color: '#aaa', margin: '8px 0 4px' }}>
        Departure time <span style={{ opacity: 0.7 }}>(blank = leave now, live weather)</span>
      </label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input
          type="datetime-local"
          value={departAtInput}
          min={nowInputValue()}
          onChange={(e) => { setDepartAtInput(e.target.value); if (routeOptions.length) refreshForecast(e.target.value); }}
          style={{ flex: 1 }}
        />
        {departAtInput && <button type="button" className="btn" onClick={() => { setDepartAtInput(''); if (routeOptions.length) refreshForecast(''); }}>Now</button>}
      </div>
      <button className="btn btn-primary" onClick={search}>{t('find_route_btn')}</button>
      {routeOptions.length > 0 && (
        <button type="button" className="btn" style={{ marginLeft: 6 }} disabled={refreshing} onClick={() => refreshForecast()}>
          {refreshing ? 'Updating…' : '↻ Refresh weather'}
        </button>
      )}
      {status && <div className="status-line">{status}</div>}
      {scoresUpdated && (
        <div className="status-line" style={{ marginTop: 5, fontSize: 11 }}>
          Saved road scores updated {new Date(scoresUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}{segments?.scores_stale ? ' (refreshing from live weather…)' : ''}
        </div>
      )}
      {forecastStatus && <div className="status-line" style={{ marginTop: 5 }}>{forecastStatus}</div>}

      {routeOptions.map((opt, i) => (
        <RouteResultCard
          key={i}
          opt={opt}
          index={i}
          selected={i === selectedIndex}
          onSelect={() => selectRoute(i)}
        />
      ))}

      {routeOptions[selectedIndex]?.forecastMeta?.report && (
        <WeatherReportCard
          report={routeOptions[selectedIndex].forecastMeta.report}
          updatedAt={routeOptions[selectedIndex].forecastMeta.generated_at}
          onPickDeparture={pickDeparture}
        />
      )}

      {routeOptions.length > 0 && fromPlace && toPlace && (
        <ShipmentMatchesForRoute origin={fromPlace} dest={toPlace} />
      )}
    </div>
  );
}

// 'YYYY-MM-DDTHH:mm' for the browser's local time (matches datetime-local).
function nowInputValue() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function reasonsHtml(reasons) {
  if (reasons.length === 0) return '';
  return `<div style="margin-top:4px; font-size:12px; color:#ccc;">${reasons.map((r) => `• ${r}`).join('<br/>')}</div>`;
}

// One row per contiguous stretch of the SAME segment (collapsed, same
// logic as the map markers) -- matches the original's breakdown list.
function RouteResultCard({ opt, index, selected, onSelect }) {
  const { t } = useLanguage();
  const { route, risk, nearbySegments, chunks } = opt;
  const riskLabel = !risk.hasData ? t('risk_no_data') : 'Overall: ' + t('risk_level_score_template').replace('{level}', t(`risk_level_${risk.level}`) || risk.level).replace('{score}', risk.score);
  const riskMode = opt.forecasted ? t('live_forecast') : t('current_road_data');
  const riskColor = getRiskColor(risk.score, risk.hasData);

  const rows = [];
  if (selected) {
    chunks.forEach((chunk) => {
      const key = chunk.segment ? chunk.segment.id : 'none';
      const prev = rows[rows.length - 1];
      if (prev && prev.key === key) return;
      rows.push({ key, segment: chunk.segment });
    });
  }
  const scoredRows = rows.filter((r) => r.segment);

  return (
    <div
      className="card"
      onClick={onSelect}
      style={{ border: selected ? '1px solid var(--accent)' : undefined }}
    >
      <b>{selected ? '● ' : ''}Option {index + 1}{index === 0 ? ' (fastest)' : ''}</b> — {route.distanceKm.toFixed(1)} km · ~{Math.round(route.durationMin)} min
      <div style={{ color: riskColor, marginTop: 4 }}>
        {riskLabel} <span style={{ fontSize: 10, opacity: 0.75 }}>· {riskMode}</span>
        {nearbySegments.length > 0 ? ` · ${t('passes_segments_template').replace('{n}', nearbySegments.length)}` : ''}
      </div>
      {opt.forecastMeta && (
        <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
          Weather: {opt.forecastMeta.weather_model || 'live hourly forecast'} · sections evaluated at estimated arrival time
        </div>
      )}
      {scoredRows.length > 0 && (
        <div style={{ marginTop: 6, borderTop: '1px solid #333', paddingTop: 6 }}>
          {scoredRows.map((row, i) => {
            const c = getRiskColor(row.segment.risk_score, row.segment.risk_score !== null);
            const reasons = explainRisk(row.segment);
            return (
              <div key={i} style={{ fontSize: 12, padding: '3px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{row.segment.name_status === 'unnamed' ? t('unnamed_road') : row.segment.name}{row.segment.road_code ? ` · ${row.segment.road_code}` : ''}</span>
                  <span style={{ color: c }}>{row.segment.risk_level ? row.segment.risk_level.toUpperCase() : t('risk_level_na')} ({row.segment.risk_score})</span>
                </div>
                {row.segment.weather_score !== undefined && (
                  <div style={{ color: '#888', marginTop: 2, fontSize: 11 }}>
                    Weather {row.segment.weather_score} · Terrain {row.segment.terrain_score} · Field hazards {row.segment.hazard_score}
                    {row.segment.thunder_probability_pct !== undefined ? ` · Thunder ${Math.round(row.segment.thunder_probability_pct)}%` : ''}
                    {row.segment.risk_driver ? ` — mainly ${row.segment.risk_driver}` : ''}
                  </div>
                )}
                {reasons.length > 0 && <div style={{ color: '#999', marginTop: 2 }}>{reasons[0]}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
