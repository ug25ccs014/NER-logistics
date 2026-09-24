import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { api, fetchRealRoutes } from '../api.js';
import { useMap } from '../context/MapContext.jsx';
import { useSegments } from '../context/SegmentsContext.jsx';
import { riskLevelIcon } from '../utils/mapIcons.js';
import {
  findNearbyMonitoredSegments,
  computeRouteRiskChunks,
  getRiskColor,
  scoreRouteRisk,
  explainRisk,
} from '../utils/geo.js';

// Same idea as RouteSearch's map rendering, but for exactly ONE
// already-decided origin/dest/departure -- not a set of alternatives
// to pick between. The proximity/geometry logic (which monitored
// segments a route passes near) is identical to Find Route and comes
// straight from the live `segments` data; only the RISK SCORES for
// those specific segments get swapped out for a weather-FORECAST
// score at `departAt` instead of "right now", via GET /segments/forecast.
export default function TripRiskForecast({ origin, dest, departAt }) {
  const { map } = useMap();
  const { segments } = useSegments();

  const [status, setStatus] = useState('Loading forecast...');
  const [summary, setSummary] = useState(null); // { risk, chunks, forecastMeta, route }

  const layersRef = useRef([]);
  const markersRef = useRef([]);

  const clearLayers = () => {
    layersRef.current.forEach((l) => map && map.removeLayer(l));
    layersRef.current = [];
    markersRef.current.forEach((m) => map && map.removeLayer(m));
    markersRef.current = [];
  };

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!map || !segments || !origin || !dest || !departAt) return;
      setStatus('Finding the route...');
      setSummary(null);
      clearLayers();

      let routes;
      try {
        routes = await fetchRealRoutes([origin.lon, origin.lat], [dest.lon, dest.lat]);
      } catch (err) {
        if (!cancelled) setStatus(`Could not find a route: ${err.message}`);
        return;
      }
      const route = routes[0];
      const nearby = findNearbyMonitoredSegments(route.coords, segments).slice(0, 12);

      // Always draw the actual road route first. Forecasting is an overlay; a
      // weather/API failure must never make the route itself disappear.
      const baseLine = L.polyline(route.coords, { color: '#3b82f6', weight: 5, opacity: 0.85 }).addTo(map);
      baseLine.bindPopup(`<b>Planned route</b><br/>${route.distanceKm.toFixed(1)} km · ~${Math.round(route.durationMin)} min`);
      layersRef.current.push(baseLine);

      if (nearby.length === 0) {
        if (cancelled) return;
        // Nothing to forecast, but still show the plain route so the
        // driver sees SOMETHING rather than a silent empty panel.
        map.fitBounds(L.latLngBounds(route.coords), { padding: [50, 50] });
        setStatus(null);
        setSummary({ route, risk: { score: null, level: null, hasData: false }, chunks: [], forecastMeta: null });
        return;
      }

      setStatus(`Checking live forecast across ${nearby.length} route sections...`);
      let forecastResp;
      try {
        // departAt is a local (IST) "YYYY-MM-DDTHH:mm:00" string -- the
        // backend treats a bare ISO string with no offset as IST.
        forecastResp = await api.forecastSegments(departAt, nearby.map((s) => s.id), Math.round(route.durationMin));
      } catch (err) {
        if (!cancelled) {
          setStatus(`Forecast unavailable: ${err.message}`);
          map.fitBounds(L.latLngBounds(route.coords), { padding: [50, 50] });
        }
        return;
      }
      if (cancelled) return;

      const forecastById = new Map(forecastResp.features.map((f) => [f.properties.id, f.properties]));
      const forecastedNearby = nearby.map((seg) => {
        const f = forecastById.get(seg.id);
        return f ? { ...seg, ...f } : seg;
      });

      const scored = forecastedNearby.filter((s) => s.risk_score !== null && s.risk_score !== undefined);
      const maxSeg = scored.reduce((best, s) => (!best || s.risk_score > best.risk_score ? s : best), null);
      const risk = maxSeg
        ? { score: maxSeg.risk_score, level: maxSeg.risk_level, hasData: true }
        : { score: null, level: null, hasData: false };
      const chunks = computeRouteRiskChunks(route.coords, forecastedNearby);

      chunks.forEach((chunk) => {
        const line = L.polyline(chunk.coords, { color: chunk.color, weight: 6, opacity: 0.95 }).addTo(map);
        line.bindPopup(
          chunk.segment
            ? `<b>${chunk.segment.name}</b><br/>Forecast risk at section ETA: <b style="color:${chunk.color}">${
                chunk.segment.risk_level ? chunk.segment.risk_level.toUpperCase() : 'NOT YET SCORED'
              }</b> (score ${chunk.segment.risk_score})${reasonsHtml(explainRisk(chunk.segment))}`
            : 'No risk data for this stretch (unmonitored road)'
        );
        layersRef.current.push(line);
      });
      placeRiskMarkers(map, markersRef, chunks);
      map.fitBounds(L.latLngBounds(route.coords), { padding: [50, 50] });

      setStatus(null);
      setSummary({ route, risk, chunks, forecastMeta: forecastResp, nearby: forecastedNearby });
    }

    run();
    return () => {
      cancelled = true;
      clearLayers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, segments, origin?.lat, origin?.lon, dest?.lat, dest?.lon, departAt]);

  const departLabel = formatDepartAt(departAt);

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div className="section-title" style={{ marginTop: 0 }}>
        Trip risk forecast -- departing {departLabel}
      </div>
      {status && <div className="status-line">{status}</div>}
      {summary && (
        <>
          <div style={{ fontSize: 11, color: '#8f8f8f', margin: '6px 0' }}>
            Risk uses hourly weather forecast at each section ETA + terrain/infrastructure + active field alerts. It is a forecast, not a guaranteed condition.
          </div>
          {summary.risk.hasData ? (
            <div style={{ color: getRiskColor(summary.risk.score, true), fontWeight: 600 }}>
              {summary.risk.level.toUpperCase()} risk expected (score {summary.risk.score}) across the route
            </div>
          ) : (
            <div className="status-line">No monitored segment near this route -- can't forecast risk for it.</div>
          )}
          {summary.forecastMeta && (
            <div className="status-line" style={{ marginTop: 4 }}>
              {summary.route.distanceKm.toFixed(1)} km · ~{Math.round(summary.route.durationMin)} min ·{' '}
              checked {summary.forecastMeta.features.length} route sections · {summary.forecastMeta.weather_api_calls_made} weather location(s) ·{' '}
              {summary.forecastMeta.weather_model}
            </div>
          )}
          {summary.nearby?.filter((s) => s.risk_score !== null && s.risk_score !== undefined).map((s) => {
            const c = getRiskColor(s.risk_score, true);
            const reasons = explainRisk(s);
            return (
              <div key={s.id} style={{ fontSize: 12, padding: '7px 0', borderTop: '1px solid #333', marginTop: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{s.name_status === 'unnamed' ? 'Unnamed Road' : s.name}</span>
                  <span style={{ color: c, whiteSpace: 'nowrap' }}>{s.risk_level.toUpperCase()} ({s.risk_score})</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', color: '#aaa', marginTop: 5 }}>
                  <span>ETA {formatEta(s.forecast_arrival)}</span>
                  <span>Rain {num(s.forecast_rain_1h_mm)} mm/h</span>
                  <span>Rain chance {num(s.rain_probability_pct)}%</span>
                  <span>Wind {num(s.forecast_wind_kmh)} km/h</span>
                  <span>Gust {num(s.forecast_gust_kmh)} km/h</span>
                  <span>Visibility {visibilityLabel(s.forecast_visibility_m)}</span>
                </div>
                {reasons.map((r, i) => (
                  <div key={i} style={{ color: '#999', marginTop: 2 }}>• {r}</div>
                ))}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function formatDepartAt(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function reasonsHtml(reasons) {
  if (reasons.length === 0) return '';
  return `<div style="margin-top:4px; font-size:12px; color:#ccc;">${reasons.map((r) => `• ${r}`).join('<br/>')}</div>`;
}

// Same "one marker per contiguous stretch" behaviour as RouteSearch,
// so a long risky stretch doesn't get a dozen overlapping icons.
function placeRiskMarkers(map, markersRef, chunks) {
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
      `<b>${segment.name}</b><br/>Forecast risk: <b>${segment.risk_level.toUpperCase()}</b> (score ${segment.risk_score})` +
        reasonsHtml(explainRisk(segment))
    );
    markersRef.current.push(marker);
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
}


function num(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(1).replace(/\.0$/, '');
}

function formatEta(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function visibilityLabel(meters) {
  if (meters === null || meters === undefined || Number.isNaN(Number(meters))) return '—';
  const km = Number(meters) / 1000;
  return `${km >= 10 ? '10+' : km.toFixed(1)} km`;
}
