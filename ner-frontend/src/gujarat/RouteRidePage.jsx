import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, CircleMarker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../api.js';
import 'leaflet/dist/leaflet.css';

const REGIONS = {
  ahmedabad: { label: 'Ahmedabad–Gandhinagar (Primary)', center: [23.12, 72.60], zoom: 10, radius: 28000 },
  kamrej: { label: 'Kamrej, Surat (Parallel test zone)', center: [21.27, 72.96], zoom: 12, radius: 15000 },
};
const SAVED_KEY = 'gujarat_route_saved_trips_v1';
const userIcon = L.divIcon({ className: 'gj-user-location-icon', html: '<span></span>', iconSize: [20, 20], iconAnchor: [10, 10] });

function RecenterMap({ center, zoom }) {
  const map = useMap();
  useEffect(() => { map.setView(center, zoom, { animate: true }); }, [center, zoom, map]);
  return null;
}
function FitRoute({ coords }) {
  const map = useMap();
  useEffect(() => { if (coords?.length) map.fitBounds(L.latLngBounds(coords), { padding: [35, 35] }); }, [coords, map]);
  return null;
}
function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = current;
    }
  }
  return row[b.length];
}
async function geocode(query, regionKey) {
  const region = REGIONS[regionKey];
  const [lat, lon] = region.center;
  // Bound search to the selected Gujarat pilot area. Never silently accept
  // a distant fuzzy match (e.g. Vadodara for a misspelled Gandhinagar).
  const latSpan = region.radius / 111000 * 1.35;
  const lonSpan = region.radius / (102000 * Math.cos(lat * Math.PI / 180)) * 1.35;
  const params = new URLSearchParams({
    format: 'jsonv2', addressdetails: '1', limit: '8', countrycodes: 'in',
    bounded: '1',
    viewbox: [lon - lonSpan, lat + latSpan, lon + lonSpan, lat - latSpan].join(','),
    q: query + ', Gujarat, India',
  });
  const response = await fetch('https://nominatim.openstreetmap.org/search?' + params.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Place search is temporarily unavailable (' + response.status + ').');
  const results = await response.json();
  if (!results.length) throw new Error('Could not find "' + query + '" inside the selected Gujarat pilot area. Check the spelling or choose a nearby landmark.');
  const wanted = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  const ranked = results.map(item => {
    const address = item.address || {};
    const locality = [address.city, address.town, address.village, address.municipality, address.suburb, address.county]
      .filter(Boolean).join(' ').toLowerCase().replace(/[^a-z0-9]/g, '');
    const name = String(item.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const best = [locality, name].filter(Boolean).reduce((v, candidate) => Math.min(v, editDistance(wanted, candidate)), Infinity);
    return { item, distance: best };
  }).sort((a, b) => a.distance - b.distance);
  const best = ranked[0];
  if (!best || best.distance > Math.max(2, Math.floor(wanted.length * 0.22))) {
    const choices = ranked.slice(0, 3).map(x => x.item.display_name).join(' / ');
    throw new Error('The place search could not confidently match "' + query + '" in this region. Possible matches: ' + choices + '. Please enter a more specific locality.');
  }
  return {
    lat: Number(best.item.lat), lon: Number(best.item.lon),
    label: best.item.display_name,
    matchedName: best.item.name || query,
  };
}
async function getRoutes(origin, destination) {
  const url = 'https://router.project-osrm.org/route/v1/driving/' +
    origin.lon + ',' + origin.lat + ';' + destination.lon + ',' + destination.lat +
    '?overview=full&geometries=geojson&alternatives=3&steps=true';
  const response = await fetch(url);
  if (!response.ok) throw new Error('Routing service is unavailable (' + response.status + ').');
  const data = await response.json();
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No drivable route was returned for these locations.');
  return data.routes.map((r, i) => ({
    id: String(i),
    coords: r.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    distanceKm: r.distance / 1000,
    durationMin: r.duration / 60,
    source: 'OSRM / OpenStreetMap',
  })).sort((a, b) => a.durationMin - b.durationMin);
}

function weatherRiskColor(score) {
  if (score >= 75) return '#dc3f3f';
  if (score >= 55) return '#ed7d24';
  if (score >= 30) return '#e2b52e';
  return '#20a36b';
}
function buildWeatherSections(route, points) {
  if (!route?.coords?.length || !points?.length) return [];
  // Only draw a coloured road stretch when both its route position and a real
  // numeric forecast score are present. Missing forecasts are never painted green.
  const ordered = [...points]
    .filter(p => Number.isInteger(Number(p.index)) &&
      Number(p.index) >= 0 && Number(p.index) < route.coords.length &&
      Number.isFinite(Number(p.weather_score ?? p.risk_score)))
    .sort((a, b) => Number(a.index) - Number(b.index));
  const sections = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const point = ordered[i], next = ordered[i + 1];
    const from = Number(point.index), to = Number(next.index);
    if (to <= from) continue;
    const score = Math.max(Number(point.weather_score ?? point.risk_score), Number(next.weather_score ?? next.risk_score));
    const coords = route.coords.slice(from, to + 1);
    if (coords.length > 1) sections.push({ id: String(i), coords, score, level: score >= 75 ? 'Severe' : score >= 55 ? 'High' : score >= 30 ? 'Moderate' : 'Low', color: weatherRiskColor(score) });
  }
  return sections;
}

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch { return []; }
}

export default function RouteRidePage() {
  const [regionKey, setRegionKey] = useState('ahmedabad');
  const [gps, setGps] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('Location not started');
  const [watching, setWatching] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [weather, setWeather] = useState(null);
  const [roadIntelligence, setRoadIntelligence] = useState(null);
  const [roadIntelligenceBusy, setRoadIntelligenceBusy] = useState(false);
  const [roadIntelligenceNotice, setRoadIntelligenceNotice] = useState('Gujarat road coverage will be checked after route search.');
  const [weatherNotice, setWeatherNotice] = useState('Weather forecast will load after route search.');
  const [notice, setNotice] = useState('Enter an origin and destination to find real-road route options.');
  const [savedTrips, setSavedTrips] = useState(loadSaved);
  const region = REGIONS[regionKey];
  const selectedRoute = routes[selected] || null;

  useEffect(() => {
    if (!watching) return undefined;
    if (!navigator.geolocation) { setGpsStatus('Geolocation is not supported.'); setWatching(false); return undefined; }
    if (!window.isSecureContext) { setGpsStatus('GPS requires HTTPS or localhost.'); setWatching(false); return undefined; }
    setGpsStatus('Waiting for GPS signal…');
    const id = navigator.geolocation.watchPosition(
      p => {
        const fix = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, at: new Date(p.timestamp).toISOString() };
        setGps(fix); setGpsStatus('GPS active · accuracy ±' + Math.round(fix.accuracy) + ' m');
      },
      e => setGpsStatus(e.code === 1 ? 'Location permission denied.' : 'GPS signal unavailable. Try outdoors.'),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [watching]);


  useEffect(() => {
    if (!selectedRoute?.coords?.length) {
      setRoadIntelligence(null);
      setRoadIntelligenceNotice('Gujarat road coverage will be checked after route search.');
      return undefined;
    }
    let cancelled = false;
    setRoadIntelligence(null);
    setRoadIntelligenceBusy(true);
    setRoadIntelligenceNotice('Matching route points against the Gujarat road inventory…');
    const coords = selectedRoute.coords;
    const count = Math.min(24, coords.length);
    const points = Array.from({ length: count }, (_, i) => {
      const idx = Math.round(i * (coords.length - 1) / Math.max(1, count - 1));
      return { lat: coords[idx][0], lon: coords[idx][1] };
    });
    api.gujaratRouteIntelligence(points)
      .then(result => {
        if (cancelled) return;
        setRoadIntelligence(result);
        setRoadIntelligenceNotice(
          result.total_inventory_segments === 0
            ? 'No Gujarat road-segment inventory is loaded yet. Real monitored-road risk cannot be calculated.'
            : result.unique_segments_matched
              ? 'Gujarat road inventory matched to this route.'
              : 'Road inventory exists, but no segment was found within 300 m of the sampled route points.'
        );
      })
      .catch(error => {
        if (cancelled) return;
        setRoadIntelligenceNotice('Gujarat road matching unavailable: ' + (error.message || 'request failed'));
      })
      .finally(() => { if (!cancelled) setRoadIntelligenceBusy(false); });
    return () => { cancelled = true; };
  }, [selectedRoute]);

  const mapCenter = useMemo(() => gps ? [gps.lat, gps.lon] : region.center, [gps, region]);
  async function findRoutes(event) {
    event.preventDefault();
    setBusy(true); setRoutes([]); setSelected(0); setWeather(null); setWeatherNotice('Weather forecast will load after route search.');
    setNotice('Finding locations and requesting road routes…');
    try {
      const [a, b] = await Promise.all([geocode(from, regionKey), geocode(to, regionKey)]);
      const options = await getRoutes(a, b);
      setOrigin(a); setDestination(b); setRoutes(options);
      setNotice('Found ' + options.length + ' route option(s). Fastest is ranked by the routing provider’s estimated duration. Traffic is not live.');
      // Weather is an overlay: a provider failure must never hide the road route.
      setWeather(null); setWeatherBusy(true); setWeatherNotice('Checking forecast along the selected route…');
      try {
        const route = options[0];
        const step = Math.max(1, Math.floor(route.coords.length / 18));
        const indices = [];
        for (let i = 0; i < route.coords.length; i += step) indices.push(i);
        if (indices[indices.length - 1] !== route.coords.length - 1) indices.push(route.coords.length - 1);
        const departAt = new Date();
        const forecast = await api.forecastPoints({
          depart_at: departAt.toISOString(),
          chunk_minutes: Math.max(5, Math.ceil(route.durationMin / indices.length)),
          points: indices.slice(0, 25).map((idx, index) => ({
            lat: route.coords[idx][0], lon: route.coords[idx][1],
            offset_min: route.durationMin * index / Math.max(1, indices.length - 1),
            index: idx,
          })),
        });
        const scored = (forecast.points || []).filter(p => p.risk_score !== null && p.risk_score !== undefined);
        setWeather({ ...forecast, scored, mapSections: buildWeatherSections(route, scored), routeId: route.id, checkedAt: new Date().toISOString() });
        setWeatherNotice(scored.length ? 'Route weather forecast ready. Weather-provider coverage may vary.' : 'The weather providers returned no usable forecast for these route points.');
      } catch (weatherError) {
        setWeatherNotice('Weather forecast unavailable: ' + (weatherError.message || 'provider error') + '. Your road route is still available.');
      } finally { setWeatherBusy(false); }
    } catch (e) { setNotice(e.message || 'Could not calculate this route.'); }
    finally { setBusy(false); }
  }
  function saveTrip() {
    if (!selectedRoute || !origin || !destination) return;
    const trip = {
      id: Date.now().toString(), savedAt: new Date().toISOString(),
      from, to, origin, destination, routes, selected,
      regionKey,
    };
    const next = [trip, ...savedTrips.filter(x => !(x.from === from && x.to === to))].slice(0, 10);
    setSavedTrips(next); localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    setNotice('Trip saved on this device.');
  }
  function restoreTrip(trip) {
    setFrom(trip.from); setTo(trip.to); setOrigin(trip.origin); setDestination(trip.destination);
    setRoutes(trip.routes); setSelected(trip.selected || 0); setRegionKey(trip.regionKey || 'ahmedabad'); setWeather(null); setWeatherNotice('Run Find routes to refresh weather for this saved route.');
    setNotice('Restored saved route from ' + new Date(trip.savedAt).toLocaleString('en-IN') + '. Route data may be outdated.');
  }
  function deleteTrip(id) {
    const next = savedTrips.filter(t => t.id !== id);
    setSavedTrips(next); localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  }

  return <div className="gj-route-page">
    <div className="gj-page-heading">
      <div><span className="gj-eyebrow">GUJARAT / ROUTE & RIDE</span><h1>Route & Ride</h1><p>Road routing, device GPS and saved journeys.</p></div>
      <span className="gj-status gj-status--regional-pilot">GUJARAT PILOT</span>
    </div>
    <div className="gj-route-toolbar">
      <label>Development region
        <select value={regionKey} onChange={e => { setRegionKey(e.target.value); setGps(null); }}>
          {Object.entries(REGIONS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
        </select>
      </label>
      <div className="gj-gps-control"><span className={watching && gps ? 'gj-gps-dot active' : 'gj-gps-dot'}></span><span>{gpsStatus}</span>
        {!watching ? <button type="button" onClick={() => setWatching(true)}>Use my location</button> : <button type="button" onClick={() => { setWatching(false); setGpsStatus('Location tracking stopped'); }}>Stop GPS</button>}
      </div>
    </div>
    <div className="gj-route-layout">
      <aside className="gj-route-side">
        <form className="gj-route-search-card" onSubmit={findRoutes}>
          <span className="gj-card-kicker">PLAN A JOURNEY</span><h2>Where do you want to go?</h2>
          <label>Starting point<input value={from} onChange={e => setFrom(e.target.value)} placeholder="e.g. Ahmedabad" required /></label>
          <label>Destination<input value={to} onChange={e => setTo(e.target.value)} placeholder="e.g. Gandhinagar" required /></label>
          <button className="gj-primary-button" type="submit" disabled={busy}>{busy ? 'Finding routes…' : 'Find routes'}</button>
          <p className="gj-route-notice" role="status">{notice}</p>
        </form>
        {routes.length > 0 && <section className="gj-route-info-card">
          <strong>Route alternatives</strong>
          <p style={{fontSize:11,color:'#9aa4af'}}>Ranked by estimated duration · OSRM road routing · no live traffic</p>
          {routes.map((r, i) => <button key={r.id} type="button" onClick={async () => {
            setSelected(i);
            if (weather?.routeId === r.id || weatherBusy) return;
            setWeatherBusy(true); setWeatherNotice('Fetching forecast for this alternative…');
            try {
              const step = Math.max(1, Math.floor(r.coords.length / 18));
              const indices = [];
              for (let j = 0; j < r.coords.length; j += step) indices.push(j);
              if (indices[indices.length - 1] !== r.coords.length - 1) indices.push(r.coords.length - 1);
              const result = await api.forecastPoints({
                depart_at: new Date().toISOString(),
                chunk_minutes: Math.max(5, Math.ceil(r.durationMin / indices.length)),
                points: indices.slice(0, 25).map((idx, index) => ({
                  lat: r.coords[idx][0], lon: r.coords[idx][1],
                  offset_min: r.durationMin * index / Math.max(1, indices.length - 1), index: idx,
                })),
              });
              const scored = (result.points || []).filter(p => p.risk_score !== null && p.risk_score !== undefined);
              setWeather({ ...result, scored, mapSections: buildWeatherSections(r, scored), routeId: r.id, checkedAt: new Date().toISOString() });
              setWeatherNotice(scored.length ? 'Forecast ready for this alternative.' : 'No usable forecast values returned.');
            } catch (error) { setWeatherNotice('Forecast unavailable: ' + error.message); }
            finally { setWeatherBusy(false); }
          }} style={{display:'block',width:'100%',textAlign:'left',padding:10,marginTop:7,borderRadius:8,border:i===selected?'2px solid #168b80':'1px solid #52606d',background:i===selected?'rgba(22,139,128,.12)':'transparent',color:'inherit',cursor:'pointer'}}>
            <b>{i === 0 ? 'Fastest · ' : 'Alternative ' + (i + 1) + ' · '}{r.durationMin.toFixed(0)} min</b>
            <div style={{fontSize:12,opacity:.8,marginTop:3}}>{r.distanceKm.toFixed(1)} km · estimated</div>
          </button>)}
          <button className="gj-primary-button" type="button" onClick={saveTrip} style={{marginTop:10}}>Save this trip</button>
        </section>}
        {routes.length > 0 && <section className="gj-route-info-card">
          <strong>Weather & route risk</strong>
          <p style={{fontSize:12,color:'#9aa4af'}}>{weatherBusy ? 'Fetching weather along the route…' : weatherNotice}</p>
          {weather?.routeId !== selectedRoute?.id && selectedRoute && <p style={{fontSize:12,color:'#c69b57'}}>Weather shown for another alternative. Refresh to check the selected route.</p>}
          {weather?.routeId === selectedRoute?.id && weather?.scored?.length > 0 && (() => {
            const worst = weather.scored.reduce((a, b) => Number(b.weather_score ?? 0) > Number(a.weather_score ?? 0) ? b : a);
            const rain = Math.max(...weather.scored.map(p => Number(p.forecast_rain_1h_mm || 0)));
            const wind = Math.max(...weather.scored.map(p => Number(p.forecast_wind_kmh || 0)));
            const gust = Math.max(...weather.scored.map(p => Number(p.forecast_gust_kmh || 0)));
            const visibilityValues = weather.scored.map(p => p.forecast_visibility_m).filter(v => v !== null && v !== undefined);
            const visibility = visibilityValues.length ? Math.min(...visibilityValues) : null;
            const sources = [...new Set(weather.scored.flatMap(p => p.sources || []))];
            const score = Number(worst.weather_score ?? 0);
            const level = score >= 75 ? 'SEVERE' : score >= 55 ? 'HIGH' : score >= 30 ? 'MODERATE' : 'LOW';
            const tone = score >= 75 ? '#dc5555' : score >= 55 ? '#e58b35' : score >= 30 ? '#d2ad42' : '#168b80';
            const age = Math.max(...weather.scored.map(p => Number(p.data_age_min || 0)));
            const agreements = [...new Set(weather.scored.map(p => p.source_agreement || 'unknown'))];
            const confidence = agreements.includes('low') ? 'Sources disagree' : agreements.includes('single_source') ? 'Single source only' : agreements.includes('medium') ? 'Partial agreement' : 'Sources broadly agree';
            const rainEstimated = weather.scored.some(p => p.rain_probability_estimated);
            return <div className="gj-weather-content" style={{marginTop:10}}>
              <div style={{fontSize:18,fontWeight:700,color:tone}}>{level} weather-risk estimate · {score.toFixed(0)}/100</div>
              <div className="gj-weather-metrics">
                <div>Peak forecast rain: <b>{rain.toFixed(1)} mm/h</b></div>
                <div>Forecast wind: <b>{wind.toFixed(0)} km/h</b> · Gusts: <b>{gust.toFixed(0)} km/h</b></div>
                <div>Minimum forecast visibility: <b>{visibility !== null ? (visibility / 1000).toFixed(1) + ' km' : 'Unavailable'}</b></div>
                <div>Route points with forecast data: <b>{weather.scored.length}</b></div>
                <div>Weather sources: <b>{sources.join(' + ') || 'Unavailable'}</b></div>
                <div>Provider agreement: <b>{confidence}</b></div>
                <div>Forecast cache age: <b>{age} min</b></div>
                {rainEstimated && <div style={{color:'#c69b57'}}>Rain probability is estimated because a provider did not supply it.</div>}
              </div>
              {weather.weather_report && <div className="gj-weather-report">
                <strong>{weather.weather_report.headline}</strong>
                <ul>{(weather.weather_report.facts || []).map((fact, i) => <li key={'wx-fact-' + i}>{fact}</li>)}</ul>
                <b>What to do</b>
                <ul>{(weather.weather_report.advice || []).map((tip, i) => <li key={'wx-advice-' + i}>{tip}</li>)}</ul>
                <div className="gj-weather-confidence"><b>{weather.weather_report.confidence || 'unknown'} confidence</b> — {weather.weather_report.confidence_note || 'Provider agreement information unavailable.'}</div>
                {weather.weather_report.departure_suggestion && <p className="gj-departure-suggestion">{weather.weather_report.departure_suggestion}</p>}
                {(weather.departure_options || []).length > 0 && <div className="gj-departure-options">
                  <b>Weather risk by departure time</b>
                  <div>{weather.departure_options.map((option, i) => <span key={option.depart_at} className={i === 0 ? 'current' : ''}>{option.depart_label} · {Number(option.weather_score).toFixed(0)}/100</span>)}</div>
                </div>}
              </div>}
              <p style={{fontSize:11,color:'#9aa4af',marginTop:8}}>This score uses the weather component only. It is not a complete road-safety score. Gujarat terrain, closures and verified incident coverage are not yet connected to this route.</p>
              <p style={{fontSize:11,color:'#9aa4af'}}>Forecasts are estimates from external providers and can differ from actual local conditions.</p>
            </div>;
          })()}
          <button type="button" onClick={async () => {
            if (!selectedRoute) return;
            setWeatherBusy(true); setWeatherNotice('Refreshing route weather…');
            try {
              const route = selectedRoute;
              const step = Math.max(1, Math.floor(route.coords.length / 18));
              const indices = [];
              for (let i = 0; i < route.coords.length; i += step) indices.push(i);
              if (indices[indices.length - 1] !== route.coords.length - 1) indices.push(route.coords.length - 1);
              const result = await api.forecastPoints({ depart_at: new Date().toISOString(), chunk_minutes: Math.max(5, Math.ceil(route.durationMin / indices.length)), points: indices.slice(0,25).map((idx,index) => ({lat:route.coords[idx][0],lon:route.coords[idx][1],offset_min:route.durationMin*index/Math.max(1,indices.length-1),index:idx})) });
              const scored = (result.points || []).filter(p => p.risk_score !== null && p.risk_score !== undefined);
              setWeather({...result,scored,mapSections:buildWeatherSections(route,scored),routeId:route.id,checkedAt:new Date().toISOString()});
              setWeatherNotice(scored.length ? 'Weather refreshed.' : 'No usable forecast values returned.');
            } catch (e) { setWeatherNotice('Weather refresh failed: ' + e.message); }
            finally { setWeatherBusy(false); }
          }} disabled={weatherBusy} style={{marginTop:10}}>↻ Refresh weather</button>
        </section>}
        <section className="gj-route-info-card">
          
          <strong>Gujarat monitored-road coverage</strong>
          <p style={{fontSize:12,color:'#9aa4af'}}>{roadIntelligenceBusy ? 'Checking Gujarat road inventory…' : roadIntelligenceNotice}</p>
          {roadIntelligence && <div className="gj-coverage-status">
            <div className="gj-coverage-status-main">
              <span>Gujarat road segments in database</span>
              <b>{Number(roadIntelligence.total_inventory_segments || 0).toLocaleString('en-IN')}</b>
            </div>
            {roadIntelligence.total_inventory_segments > 0 && <div className="gj-coverage-grid">
              <div><span>Route sample points matched</span><b>{roadIntelligence.points_matched}/{roadIntelligence.points_checked}</b></div>
              <div><span>Unique segments matched</span><b>{roadIntelligence.unique_segments_matched}</b></div>
              <div><span>Matched segments with risk scores</span><b>{roadIntelligence.segments_with_risk_scores}</b></div>
              <div><span>Verified matched segments</span><b>{roadIntelligence.verified_segments_matched}</b></div>
              <div><span>Blocked segments matched</span><b>{roadIntelligence.blocked_segments_matched}</b></div>
              <div><span>Stored risk coverage</span><b>{roadIntelligence.risk_coverage}</b></div>
              <div><span>Field-hazard coverage</span><b>{roadIntelligence.hazard_coverage}</b></div>
            </div>}
            <p className="gj-coverage-explanation">{roadIntelligence.total_inventory_segments === 0
              ? 'The road inventory has not been imported into the Gujarat database. The map route is provided by OSRM and is separate from the monitored-road database. No road-safety score or coloured road-risk classification is available yet.'
              : roadIntelligence.note}</p>
          </div>}
<strong>Route intelligence</strong>
          <div><span>Fastest route</span><b>{routes.length ? Math.round(routes[0].durationMin) + ' min estimate' : 'Awaiting search'}</b></div>
          <div><span>Road-safety ranking</span><b>Not yet available</b></div>
          <div><span>Weather along route</span><b>{weather?.scored?.length ? "Forecast available" : "Awaiting forecast"}</b></div>
          <div><span>GPS tracking</span><b>{gps ? 'Active' : 'Not started'}</b></div>
          <div><span>Traffic data</span><b>Estimated route time only</b></div>
        </section>
        {savedTrips.length > 0 && <section className="gj-route-info-card">
          <strong>Saved trips on this device</strong>
          {savedTrips.map(t => <div key={t.id} style={{display:'flex',gap:6,alignItems:'center',marginTop:7}}>
            <button type="button" onClick={() => restoreTrip(t)} style={{flex:1,textAlign:'left',background:'transparent',border:0,color:'inherit',cursor:'pointer'}}>{t.from} → {t.to}</button>
            <button type="button" aria-label="Delete saved trip" onClick={() => deleteTrip(t.id)}>×</button>
          </div>)}
        </section>}
      </aside>
            <section className="gj-route-map-card">
        <div className="gj-map-heading"><div><strong>Regional road map</strong><small>{region.label}</small></div><span>© OpenStreetMap contributors</span></div>
        <MapContainer center={region.center} zoom={region.zoom} scrollWheelZoom className="gj-live-map">
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <RecenterMap center={mapCenter} zoom={gps ? 14 : region.zoom} />
          <Circle center={region.center} radius={region.radius} pathOptions={{ color: '#167f78', fillColor: '#167f78', fillOpacity: 0.06, weight: 2, dashArray: '6 6' }} />
          {gps && <Marker position={[gps.lat, gps.lon]} icon={userIcon}><Popup><strong>Your device location</strong><br/>Accuracy ±{Math.round(gps.accuracy)} m</Popup></Marker>}
          {origin && <Marker position={[origin.lat, origin.lon]}><Popup>Origin: {from}</Popup></Marker>}
          {destination && <Marker position={[destination.lat, destination.lon]}><Popup>Destination: {to}</Popup></Marker>}
          {routes.map((r, i) => <Polyline key={r.id} positions={r.coords} pathOptions={{ color: i === selected ? '#168b80' : '#7b8794', weight: i === selected ? 6 : 4, opacity: i === selected ? 0.95 : 0.45, dashArray: i === selected ? undefined : '7 7' }} eventHandlers={{ click: () => setSelected(i) }} />)}
          {weather && selectedRoute && weather.routeId === selectedRoute.id && (weather.mapSections || []).map(section => <React.Fragment key={'weather-' + section.id}>
            <Polyline positions={section.coords} pathOptions={{ color: '#ffffff', weight: 12, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }} />
            <Polyline positions={section.coords} pathOptions={{ color: section.color, weight: 8, opacity: 1, lineCap: 'round', lineJoin: 'round' }} />
          </React.Fragment>)}
          {weather && selectedRoute && weather.routeId === selectedRoute.id && (weather.scored || []).filter(point => Number.isInteger(Number(point.index)) && selectedRoute.coords[Number(point.index)]).map((point, i) => {
            const score = Number(point.weather_score ?? point.risk_score);
            return <CircleMarker key={'weather-checkpoint-' + i} center={selectedRoute.coords[Number(point.index)]} radius={7} pathOptions={{ color: '#ffffff', weight: 2, fillColor: weatherRiskColor(score), fillOpacity: 1 }}><Popup><strong>Weather checkpoint {i + 1}</strong><br/>Weather risk: {Number.isFinite(score) ? score.toFixed(0) + '/100' : 'Unavailable'}<br/>Rain: {point.forecast_rain_1h_mm ?? 'n/a'} mm/h<br/>Wind: {point.forecast_wind_kmh ?? 'n/a'} km/h<br/>Forecast: {point.provider || (point.sources || []).join(', ') || 'External provider'}</Popup></CircleMarker>;
          })}
          {selectedRoute && <FitRoute coords={selectedRoute.coords} />}
          {!origin && <Marker position={region.center}><Popup>{region.label}<br/>Pilot map centre</Popup></Marker>}
        </MapContainer>
        <div className="gj-map-legend"><span><i className="gj-legend-user"></i>Your GPS position</span><span><i className="gj-legend-zone"></i>Pilot coverage target</span><span className="gj-risk-legend"><b>Forecast road risk</b><i style={{background:"#20a36b"}}></i> Low (0–29) <i style={{background:"#e2b52e"}}></i> Moderate (30–54) <i style={{background:"#ed7d24"}}></i> High (55–74) <i style={{background:"#dc3f3f"}}></i> Severe (75–100)</span></div>
      </section>
    </div>
    <p className="gj-route-footnote">Routes use the public OSRM demo service and OpenStreetMap data. Travel times are estimates, not live traffic predictions. Saved trips remain in this browser. GPS is requested only when you opt in. Route colours show weather-only forecast risk where forecast data is available; they do not represent a complete road-safety score.</p>
  </div>;
}
