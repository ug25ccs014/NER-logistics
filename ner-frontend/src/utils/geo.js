// Ported 1:1 from the original index.html's geometry helpers.

export function haversineKm(a, b) {
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Continuous risk gradient, same stops as the original app: blue (no
// data) -> green -> yellow -> orange -> red as risk_score climbs 0-100.
const RISK_GRADIENT_STOPS = [
  [0, [59, 130, 246]],
  [1, [34, 197, 94]],
  [35, [234, 179, 8]],
  [65, [249, 115, 22]],
  [100, [220, 38, 38]],
];

export function getRiskColor(score, hasData = true) {
  if (!hasData || score === null || score === undefined) return '#3F7FD6';
  const s = Math.max(0, Math.min(100, score));
  for (let i = 0; i < RISK_GRADIENT_STOPS.length - 1; i++) {
    const [s0, c0] = RISK_GRADIENT_STOPS[i];
    const [s1, c1] = RISK_GRADIENT_STOPS[i + 1];
    if (s >= s0 && s <= s1) {
      const t = s1 === s0 ? 0 : (s - s0) / (s1 - s0);
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * t);
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * t);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * t);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  return '#D9534F';
}

// n evenly-spaced points along a polyline's actual length (not just endpoints).
export function sampleAlongLine(coords, n) {
  if (coords.length <= 1) return coords;
  if (n <= 1) return [coords[0]];
  const dists = [0];
  for (let i = 1; i < coords.length; i++) dists.push(dists[i - 1] + haversineKm(coords[i - 1], coords[i]));
  const total = dists[dists.length - 1];
  if (total === 0) return [coords[0]];

  const samples = [];
  for (let k = 0; k < n; k++) {
    const target = (k / (n - 1)) * total;
    let idx = 0;
    while (idx < dists.length - 2 && dists[idx + 1] < target) idx++;
    const segStart = coords[idx];
    const segEnd = coords[Math.min(idx + 1, coords.length - 1)];
    const segLen = dists[Math.min(idx + 1, dists.length - 1)] - dists[idx];
    const t = segLen > 0 ? (target - dists[idx]) / segLen : 0;
    samples.push([segStart[0] + (segEnd[0] - segStart[0]) * t, segStart[1] + (segEnd[1] - segStart[1]) * t]);
  }
  return samples;
}

export function findNearbyMonitoredSegments(routeCoords, segmentsData, thresholdKm = 7) {
  if (!segmentsData?.features?.length || !routeCoords?.length) return [];

  // Do not depend on OSRM's vertex density. Sample by distance so a route
  // with very long/short geometry vertices is treated consistently.
  const sampled = sampleAlongLine(routeCoords, Math.max(24, Math.min(80, Math.ceil(routeCoords.length / 2))));
  const candidates = [];

  segmentsData.features.forEach((f) => {
    if (!f.geometry?.coordinates?.length) return;
    const segCoords = f.geometry.coordinates.map((c) => [c[1], c[0]]);
    const segSample = sampleAlongLine(segCoords, 10);
    let bestDistanceKm = Infinity;
    let bestRouteIndex = Infinity;

    sampled.forEach((routePt, routeIndex) => {
      segSample.forEach((segPt) => {
        const d = haversineKm(routePt, segPt);
        if (d < bestDistanceKm) {
          bestDistanceKm = d;
          bestRouteIndex = routeIndex;
        }
      });
    });

    candidates.push({
      ...f.properties,
      coords: segCoords,
      _routeOrder: bestRouteIndex,
      _distanceKm: bestDistanceKm,
    });
  });

  // Normal case: use every monitored segment that is actually close to the
  // real route. If the imported OSM geometry is slightly offset, keep the
  // nearest few segments instead of returning no forecast at all. This is a
  // matching fallback, not a claim that an unrelated road is on the route.
  const nearby = candidates.filter((s) => s._distanceKm <= thresholdKm);
  if (nearby.length > 0) return nearby.sort((a, b) => a._routeOrder - b._routeOrder);

  return candidates
    .sort((a, b) => a._distanceKm - b._distanceKm)
    .slice(0, 8)
    .sort((a, b) => a._routeOrder - b._routeOrder);
}

// Splits a route into short stretches and colors each by the nearest
// monitored segment's risk score, like a live-traffic layer.
export function computeRouteRiskChunks(routeCoords, nearbySegments, chunkPoints = 8, thresholdKm = 3) {
  const chunks = [];
  // Cumulative distance so each chunk knows how far along the trip it is (for ETA).
  const cum = [0];
  for (let k = 1; k < routeCoords.length; k++) cum.push(cum[k - 1] + haversineKm(routeCoords[k - 1], routeCoords[k]));
  const totalKm = cum[cum.length - 1] || 1;
  for (let i = 0; i < routeCoords.length - 1; i += chunkPoints) {
    const chunkCoords = routeCoords.slice(i, Math.min(i + chunkPoints + 1, routeCoords.length));
    if (chunkCoords.length < 2) continue;
    const midpoint = chunkCoords[Math.floor(chunkCoords.length / 2)];

    let closestSegment = null;
    let closestDist = Infinity;
    nearbySegments.forEach((seg) => {
      const samplePts = sampleAlongLine(seg.coords, 6);
      samplePts.forEach((pt) => {
        const d = haversineKm(midpoint, pt);
        if (d < closestDist) {
          closestDist = d;
          closestSegment = seg;
        }
      });
    });

    const hasData =
      closestSegment && closestDist <= thresholdKm && closestSegment.risk_score !== null && closestSegment.risk_score !== undefined;
    chunks.push({
      coords: chunkCoords,
      color: getRiskColor(hasData ? closestSegment.risk_score : null, hasData),
      segment: hasData ? closestSegment : null,
      // Extra info used to fill unmonitored stretches with a live estimate.
      midpoint,
      startFrac: cum[i] / totalKm,
      // Slope inherited from the nearest monitored road, only if reasonably close.
      nearSlope: closestSegment && closestDist <= 15 ? closestSegment.avg_slope_deg ?? null : null,
    });
  }
  return chunks;
}

// Unmonitored stretches (no segment in the database near them) get a LIVE
// weather-based estimate from the backend instead of a blank "no data" line.
// `fetchPoints(body)` is api.forecastPoints. Never throws: on failure the
// chunks are returned unchanged (still shown as "no data").
export async function fillGapChunks(chunks, { departIso, durationMin, fetchPoints }) {
  const gaps = [];
  chunks.forEach((c, i) => { if (!c.segment && c.midpoint) gaps.push(i); });
  if (!gaps.length) return chunks;
  const step = Math.ceil(gaps.length / 60);
  const sampled = gaps.filter((_, k) => k % step === 0);
  try {
    const resp = await fetchPoints({
      depart_at: departIso,
      chunk_minutes: Math.max(5, Math.round(durationMin / Math.max(1, chunks.length))),
      points: sampled.map((i) => ({
        lat: chunks[i].midpoint[0], lon: chunks[i].midpoint[1],
        offset_min: chunks[i].startFrac * durationMin, slope: chunks[i].nearSlope, index: i,
      })),
    });
    const byIdx = new Map((resp.points || []).filter((p) => p.risk_score != null).map((p) => [p.index, p]));
    if (!byIdx.size) return chunks;
    const keys = [...byIdx.keys()];
    // Contiguous gap runs share one id so lists/markers collapse them.
    let runId = null;
    return chunks.map((c, i) => {
      if (c.segment || !c.midpoint) { runId = null; return c; }
      if (runId === null) runId = i;
      const nearest = keys.reduce((b, k) => (Math.abs(k - i) < Math.abs(b - i) ? k : b), keys[0]);
      const r = byIdx.get(nearest);
      return { ...c, color: getRiskColor(r.risk_score, true), segment: { ...r, id: `est-${runId}`, name_status: 'named', road_code: null } };
    });
  } catch (err) {
    console.error('Gap forecast failed:', err);
    return chunks;
  }
}

// Turns raw contributing factors into human-readable reasons, e.g.
// "Heavy rainfall in the last 24h (52mm)".
export function explainRisk(p) {
  const reasons = [];
  if (p.forecast_rain_1h_mm >= 5) reasons.push(`Rain forecast at arrival (${p.forecast_rain_1h_mm}mm/h)`);
  else if (p.forecast_rain_1h_mm >= 2) reasons.push(`Light rain forecast at arrival (${p.forecast_rain_1h_mm}mm/h)`);
  if (p.forecast_to_departure_mm >= 5) reasons.push(`Forecast rain before this section (${p.forecast_to_departure_mm}mm)`);
  if (p.forecast_during_trip_mm >= 2) reasons.push(`Forecast rain during trip (${p.forecast_during_trip_mm}mm)`);
  if (p.rain_probability_pct >= 60) reasons.push(`Rain probability at arrival (${p.rain_probability_pct}%)`);
  if (p.thunder_probability_pct >= 30) reasons.push(`Thunderstorm probability near arrival (${Math.round(p.thunder_probability_pct)}%)`);
  else if (p.thunderstorm_expected) reasons.push('Thunderstorm signal near arrival');
  if (p.estimated) reasons.push('Estimated from live weather only — this road is not in the monitored network');
  if (p.forecast_gust_kmh >= 50) reasons.push(`Strong wind gusts forecast (${p.forecast_gust_kmh}km/h)`);
  if (p.forecast_visibility_m > 0 && p.forecast_visibility_m < 3000) reasons.push(`Reduced visibility forecast (${(p.forecast_visibility_m / 1000).toFixed(1)}km)`);
  if (p.avg_slope_deg !== null && p.avg_slope_deg !== undefined && p.avg_slope_deg >= 15) {
    const steep = p.avg_slope_deg >= 25 ? 'Very steep' : 'Steep';
    reasons.push(`${steep} terrain (avg ${p.avg_slope_deg}° slope)`);
  }
  if (p.seasonal_restriction) reasons.push(`Known seasonal risk: ${p.seasonal_restriction}`);
  if (p.has_bridge) reasons.push('Includes a bridge crossing');
  if (p.active_hazard_reports > 0) reasons.push(`Active field hazard reports (${p.active_hazard_reports})`);
  if (p.verified_hazard_reports > 0) reasons.push(`Verified hazard reports (${p.verified_hazard_reports})`);
  if (p.active_alerts > 0) reasons.push(`Active alerts (${p.active_alerts})`);
  return reasons;
}

// Aggregate risk for a route from whichever monitored segments it
// passes near -- max score wins (one bad stretch makes the whole
// route risky); no monitored segments nearby = "no data", not "safe".
export function scoreRouteRisk(nearbySegments) {
  const scored = nearbySegments.filter((s) => s.risk_score !== null && s.risk_score !== undefined);
  if (scored.length === 0) return { score: null, level: null, hasData: false };
  let maxScore = 0;
  let level = 'low';
  scored.forEach((s) => {
    if (s.risk_score > maxScore) {
      maxScore = s.risk_score;
      level = s.risk_level || level;
    }
  });
  return { score: maxScore, level, hasData: true };
}

export const SHIPMENT_MATCH_RADIUS_KM = 10;


export function scoreShipmentCandidates(myOrigin, myDest, candidates, excludeSessionId) {
  const scored = [];
  candidates.forEach((p) => {
    if (p.session_id === excludeSessionId || p.origin_lat == null || p.dest_lat == null) return;
    const originToOrigin = haversineKm([myOrigin.lat, myOrigin.lon], [p.origin_lat, p.origin_lon]);
    const destToDest = haversineKm([myDest.lat, myDest.lon], [p.dest_lat, p.dest_lon]);
    const originToDest = haversineKm([myOrigin.lat, myOrigin.lon], [p.dest_lat, p.dest_lon]);
    const destToOrigin = haversineKm([myDest.lat, myDest.lon], [p.origin_lat, p.origin_lon]);

    const sameDirection = originToOrigin <= SHIPMENT_MATCH_RADIUS_KM && destToDest <= SHIPMENT_MATCH_RADIUS_KM;
    const reverseDirection = originToDest <= SHIPMENT_MATCH_RADIUS_KM && destToOrigin <= SHIPMENT_MATCH_RADIUS_KM;
    if (!sameDirection && !reverseDirection) return;

    const closeness = sameDirection ? originToOrigin + destToDest : originToDest + destToOrigin;
    scored.push({ post: p, reverse: reverseDirection && !sameDirection, closeness });
  });
  scored.sort((a, b) => a.closeness - b.closeness);
  return scored;
}

export function hoursUntilDeparture(post) {
  const timeStr = post.travel_time || '23:59';
  const departure = new Date(`${post.travel_date}T${timeStr}:00`);
  return (departure.getTime() - Date.now()) / (1000 * 60 * 60);
}

export function cargoTypeIcon(t) {
  return { medicine: '💊', food: '🌾', construction: '🧱', agriculture: '🚜' }[t] || '📦';
}

export function timeAgo(isoString) {
  if (!isoString) return '';
  const diffMin = Math.round((Date.now() - new Date(isoString).getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.round(diffMin / 60)}h ago`;
  return `${Math.round(diffMin / 1440)}d ago`;
}
