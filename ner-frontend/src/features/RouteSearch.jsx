import React, { useRef, useState } from 'react';
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
  const { setRouteCoords } = useActiveRoute();

  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [fromPlace, setFromPlace] = useState(null);
  const [toPlace, setToPlace] = useState(null);
  const [status, setStatus] = useState(null);
  const [routeOptions, setRouteOptions] = useState([]); // [{ route, nearbySegments, risk, chunks }]
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [forecastStatus, setForecastStatus] = useState(null);

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
        `<b>${segment.name_status === 'unnamed' ? t('unnamed_road') : segment.name}</b><br/>Road ID: ${segment.road_code || '—'}<br/>{t('popup_risk_label')} <b>${segment.risk_level.toUpperCase()}</b> (score ${segment.risk_score})` +
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
              ? `<b>${chunk.segment.name_status === 'unnamed' ? t('unnamed_road') : chunk.segment.name}</b><br/>Road ID: ${chunk.segment.road_code || '—'}<br/>{t('popup_risk_label')} <b style="color:${chunk.color}">${
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

      // Route & Ride now uses the same live forecast engine as Trip Risk Forecast.
      // The backend evaluates each monitored section at its estimated ETA, so the
      // risk shown here is not just the static database risk.
      setForecastStatus('Checking live weather along the route...');
      const departAt = localIsoMinute(new Date());
      const forecastedOptions = await Promise.all(baseOptions.map(async (opt) => {
        if (opt.nearbySegments.length === 0) return opt;
        try {
          const forecast = await api.forecastSegments(
            departAt,
            opt.nearbySegments.map((s) => s.id),
            Math.round(opt.route.durationMin)
          );
          const byId = new Map((forecast.features || []).map((f) => [f.properties.id, f.properties]));
          const nearbySegments = opt.nearbySegments.map((seg) => {
            const f = byId.get(seg.id);
            return f ? { ...seg, ...f } : seg;
          });
          return {
            ...opt,
            nearbySegments,
            risk: scoreRouteRisk(nearbySegments),
            chunks: computeRouteRiskChunks(opt.route.coords, nearbySegments),
            forecasted: true,
            forecastMeta: forecast,
          };
        } catch {
          // Keep the route usable if weather service is temporarily unavailable.
          return opt;
        }
      }));

      setRouteOptions(forecastedOptions);
      setSelectedIndex(0);
      renderRoute(forecastedOptions, 0);
      setForecastStatus(forecastedOptions.some((o) => o.forecasted)
        ? 'Live forecast risk updated for route sections.'
        : 'Live forecast unavailable — showing current road risk data.');
      setStatus(null);
      onRouteFound?.({ origin, dest });
    } catch (err) {
      setStatus(err.message);
    }
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
      <button className="btn btn-primary" onClick={search}>{t('find_route_btn')}</button>
      {status && <div className="status-line">{status}</div>}
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

      {routeOptions.length > 0 && fromPlace && toPlace && (
        <ShipmentMatchesForRoute origin={fromPlace} dest={toPlace} />
      )}
    </div>
  );
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
  const riskLabel = !risk.hasData ? t('risk_no_data') : t('risk_level_score_template').replace('{level}', t(`risk_level_${risk.level}`) || risk.level).replace('{score}', risk.score);
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
                {reasons.length > 0 && <div style={{ color: '#999', marginTop: 2 }}>{reasons[0]}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
