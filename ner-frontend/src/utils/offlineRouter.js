// Offline, risk-aware routing over the road network saved on the device.
//
// Inputs are the SAME data the online app already loads: the /segments GeoJSON
// (geometry + last risk scores) and the /segments/connections list. Nothing
// extra has to be built or shipped -- whatever was last saved is what you can
// route on. Roads are nodes, junctions are edges (same model as routing_engine/).
//
// Two options are returned like the online router does: "fastest" (ignores
// risk) and "safest" (avoids blocked / severe segments, penalises risky ones).
// Times are ESTIMATES from distance and slope (no live traffic, no weather).
import { haversineKm, scoreRouteRisk, computeRouteRiskChunks } from './geo.js';

const SEVERE_CUTOFF = 75;       // safest mode refuses roads at or above this risk (same as routing_engine)
const RISK_DELAY_FACTOR = 2.0;  // risk 100 => 3x the travel time in "safest" mode
const MAX_SNAP_KM = 10;         // how far a start/end may be from any monitored road

export const speedKmh = (slopeDeg) => Math.max(15, Math.min(40, 40 - 0.7 * (Number(slopeDeg) || 0)));

// ---- graph ---------------------------------------------------------------
export function buildRoadGraph(segmentsGeoJson, connections) {
  const segs = new Map();
  (segmentsGeoJson?.features || []).forEach((f) => {
    const raw = f.geometry?.coordinates;
    if (!raw || raw.length < 2 || f.geometry.type === 'MultiLineString') return;
    const coords = raw.map((c) => [c[1], c[0]]);                    // -> [lat, lon]
    let lengthKm = 0;
    for (let i = 1; i < coords.length; i++) lengthKm += haversineKm(coords[i - 1], coords[i]);
    segs.set(f.properties.id, { id: f.properties.id, props: f.properties, coords, lengthKm });
  });
  const adj = new Map([...segs.keys()].map((id) => [id, new Set()]));
  (connections || []).forEach((pair) => {
    const [a, b] = Array.isArray(pair) ? pair : [pair.segment_a_id, pair.segment_b_id];
    if (adj.has(a) && adj.has(b) && a !== b) { adj.get(a).add(b); adj.get(b).add(a); }
  });
  return { segs, adj };
}

function nearestVertex(coords, pt) {
  let best = 0; let bestD = Infinity;
  coords.forEach((c, i) => { const d = haversineKm(c, pt); if (d < bestD) { bestD = d; best = i; } });
  return { index: best, distKm: bestD };
}

export function snapToRoad(graph, pt) {
  let best = null;
  graph.segs.forEach((s) => {
    const v = nearestVertex(s.coords, pt);
    if (!best || v.distKm < best.distKm) best = { id: s.id, index: v.index, distKm: v.distKm };
  });
  return best;
}

// ---- shortest path (binary-heap Dijkstra over segments) --------------------
class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(item) { const a = this.a; a.push(item); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2 * i + 1; const r = l + 1; if (l >= a.length) break; if (r < a.length && a[r][0] < a[l][0]) l = r; if (a[i][0] <= a[l][0]) break; [a[i], a[l]] = [a[l], a[i]]; i = l; } }
    return top;
  }
}

function segmentCost(seg, mode, allowSevere) {
  const hours = seg.lengthKm / speedKmh(seg.props.avg_slope_deg);
  if (mode === 'fastest') return hours;
  const risk = Number(seg.props.risk_score) || 0;
  if (seg.props.status === 'blocked') return allowSevere ? hours * 10 : null;
  if (risk >= SEVERE_CUTOFF && !allowSevere) return null;
  return hours * (1 + (risk / 100) * RISK_DELAY_FACTOR);
}

function shortestPath(graph, startId, endId, mode, allowSevere) {
  const dist = new Map([[startId, segmentCost(graph.segs.get(startId), mode, true) ?? 0]]);
  const prev = new Map();
  const heap = new MinHeap();
  heap.push([dist.get(startId), startId]);
  const done = new Set();
  while (heap.size) {
    const [d, u] = heap.pop();
    if (done.has(u)) continue;
    done.add(u);
    if (u === endId) break;
    graph.adj.get(u).forEach((v) => {
      const c = segmentCost(graph.segs.get(v), mode, allowSevere || v === endId);
      if (c === null) return;
      const nd = d + c;
      if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); heap.push([nd, v]); }
    });
  }
  if (!done.has(endId)) return null;
  const path = [endId];
  while (path[0] !== startId) path.unshift(prev.get(path[0]));
  return path;
}

// ---- turn a segment path into one continuous polyline ----------------------
// Segments meet where roads cross, which for T-junctions is NOT necessarily at
// an endpoint -- so each hand-over uses the closest pair of vertices.
function closestVertexPair(A, B) {
  let best = { i: 0, j: 0, d: Infinity };
  A.forEach((a, i) => B.forEach((b, j) => { const d = haversineKm(a, b); if (d < best.d) best = { i, j, d }; }));
  return best;
}
const slice = (coords, from, to) => (from <= to ? coords.slice(from, to + 1) : coords.slice(to, from + 1).reverse());

function assemble(graph, path, startPt, endPt) {
  const segs = path.map((id) => graph.segs.get(id));
  const entry = []; const exit = [];
  for (let k = 0; k < segs.length; k++) {
    entry[k] = k === 0 ? nearestVertex(segs[0].coords, startPt).index : null;
    exit[k] = k === segs.length - 1 ? nearestVertex(segs[k].coords, endPt).index : null;
  }
  for (let k = 0; k < segs.length - 1; k++) {
    const { i, j } = closestVertexPair(segs[k].coords, segs[k + 1].coords);
    exit[k] = i; entry[k + 1] = j;
  }
  const coords = [];
  let km = 0; let minutes = 0;
  segs.forEach((s, k) => {
    const piece = slice(s.coords, entry[k], exit[k]);
    let len = 0;
    for (let i = 1; i < piece.length; i++) len += haversineKm(piece[i - 1], piece[i]);
    km += len; minutes += (len / speedKmh(s.props.avg_slope_deg)) * 60;
    piece.forEach((p) => { const last = coords[coords.length - 1]; if (!last || last[0] !== p[0] || last[1] !== p[1]) coords.push(p); });
  });
  return { coords, distanceKm: km, durationMin: minutes };
}

// ---- public API ------------------------------------------------------------
// start/end: { lat, lon }. Returns { options, error }. `options` match the shape
// RouteSearch already renders for online routes.
export function planOfflineRoutes(graph, start, end) {
  if (!graph || graph.segs.size === 0) return { options: [], error: 'No saved road data on this device yet. Open the app once with a connection.' };
  if (graph.adj.size && ![...graph.adj.values()].some((s) => s.size)) {
    return { options: [], error: 'Saved road connections are missing. Open the app once with a connection.' };
  }
  const s = snapToRoad(graph, [start.lat, start.lon]);
  const e = snapToRoad(graph, [end.lat, end.lon]);
  if (!s || s.distKm > MAX_SNAP_KM) return { options: [], error: `Start is ${s ? Math.round(s.distKm) : '?'} km from the nearest saved road (limit ${MAX_SNAP_KM} km).` };
  if (!e || e.distKm > MAX_SNAP_KM) return { options: [], error: `Destination is ${e ? Math.round(e.distKm) : '?'} km from the nearest saved road (limit ${MAX_SNAP_KM} km).` };

  const candidates = [];
  const fastest = shortestPath(graph, s.id, e.id, 'fastest', true);
  const safest = shortestPath(graph, s.id, e.id, 'safest', false) || shortestPath(graph, s.id, e.id, 'safest', true);
  if (!fastest) return { options: [], error: 'No connected road found between these points in the saved network.' };
  candidates.push({ label: 'Fastest', path: fastest });
  if (safest && safest.join() !== fastest.join()) candidates.push({ label: 'Safest', path: safest });

  const options = candidates.map(({ label, path }) => {
    const route = assemble(graph, path, [start.lat, start.lon], [end.lat, end.lon]);
    const nearbySegments = path.map((id, order) => ({ ...graph.segs.get(id).props, coords: graph.segs.get(id).coords, _routeOrder: order, _distanceKm: 0 }));
    return {
      route: { ...route, offline: true, label },
      nearbySegments,
      risk: scoreRouteRisk(nearbySegments),
      chunks: computeRouteRiskChunks(route.coords, nearbySegments),
      forecasted: false, forecastMeta: null, offline: true,
    };
  }).sort((a, b) => a.route.durationMin - b.route.durationMin);
  return { options, error: null };
}
