import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
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
            index,
          })),
        });
        const scored = (forecast.points || []).filter(p => p.risk_score !== null && p.risk_score !== undefined);
        setWeather({ ...forecast, scored, routeId: route.id, checkedAt: new Date().toISOString() });
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
          {selectedRoute && <FitRoute coords={selectedRoute.coords} />}
          {!origin && <Marker position={region.center}><Popup>{region.label}<br/>Pilot map centre</Popup></Marker>}
        </MapContainer>
        <div className="gj-map-legend"><span><i className="gj-legend-user"></i>Your GPS position</span><span><i className="gj-legend-zone"></i>Pilot coverage target</span><span>Selected route: teal</span></div>
      </section>
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
          {routes.map((r, i) => <button key={r.id} type="button" onClick={() => setSelected(i)} style={{display:'block',width:'100%',textAlign:'left',padding:10,marginTop:7,borderRadius:8,border:i===selected?'2px solid #168b80':'1px solid #52606d',background:i===selected?'rgba(22,139,128,.12)':'transparent',color:'inherit',cursor:'pointer'}}>
            <b>{i === 0 ? 'Fastest · ' : 'Alternative ' + (i + 1) + ' · '}{r.durationMin.toFixed(0)} min</b>
            <div style={{fontSize:12,opacity:.8,marginTop:3}}>{r.distanceKm.toFixed(1)} km · estimated</div>
          </button>)}
          <button className="gj-primary-button" type="button" onClick={saveTrip} style={{marginTop:10}}>Save this trip</button>
        </section>}
        {routes.length > 0 && <section className="gj-route-info-card">
          <strong>Weather & route risk</strong>
          <p style={{fontSize:12,color:'#9aa4af'}}>{weatherBusy ? 'Fetching weather along the route…' : weatherNotice}</p>
          {weather?.scored?.length > 0 && (() => {
            const worst = weather.scored.reduce((a, b) => b.risk_score > a.risk_score ? b : a);
            const rain = Math.max(...weather.scored.map(p => Number(p.forecast_rain_1h_mm || 0)));
            const wind = Math.max(...weather.scored.map(p => Number(p.forecast_wind_kmh || 0)));
            const gust = Math.max(...weather.scored.map(p => Number(p.forecast_gust_kmh || 0)));
            const visibility = Math.min(...weather.scored.map(p => Number(p.forecast_visibility_m || 999999)));
            const sources = [...new Set(weather.scored.flatMap(p => p.sources || []))];
            const level = String(worst.risk_level || 'unknown').toUpperCase();
            const tone = worst.risk_score >= 75 ? '#dc5555' : worst.risk_score >= 55 ? '#e58b35' : worst.risk_score >= 30 ? '#d2ad42' : '#168b80';
            return <div style={{marginTop:10}}>
              <div style={{fontSize:18,fontWeight:700,color:tone}}>{level} estimated weather risk · {Number(worst.risk_score).toFixed(0)}/100</div>
              <div style={{fontSize:12,marginTop:7,lineHeight:1.8}}>
                <div>Peak rain: <b>{rain.toFixed(1)} mm/h</b></div>
                <div>Wind: <b>{wind.toFixed(0)} km/h</b> · Gusts: <b>{gust.toFixed(0)} km/h</b></div>
                <div>Minimum forecast visibility: <b>{visibility < 999999 ? (visibility / 1000).toFixed(1) + ' km' : 'Unavailable'}</b></div>
                <div>Route points checked: <b>{weather.scored.length}</b></div>
                <div>Sources: <b>{sources.join(' + ') || 'Provider details unavailable'}</b></div>
              </div>
              <p style={{fontSize:11,color:'#9aa4af',marginTop:8}}>Estimated from forecast points using the shared weather-risk model. This is not a monitored Gujarat road-condition score or a safety guarantee.</p>
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
              const result = await api.forecastPoints({ depart_at: new Date().toISOString(), chunk_minutes: Math.max(5, Math.ceil(route.durationMin / indices.length)), points: indices.slice(0,25).map((idx,index) => ({lat:route.coords[idx][0],lon:route.coords[idx][1],offset_min:route.durationMin*index/Math.max(1,indices.length-1),index})) });
              const scored = (result.points || []).filter(p => p.risk_score !== null && p.risk_score !== undefined);
              setWeather({...result,scored,routeId:route.id,checkedAt:new Date().toISOString()});
              setWeatherNotice(scored.length ? 'Weather refreshed.' : 'No usable forecast values returned.');
            } catch (e) { setWeatherNotice('Weather refresh failed: ' + e.message); }
            finally { setWeatherBusy(false); }
          }} disabled={weatherBusy} style={{marginTop:10}}>↻ Refresh weather</button>
        </section>}
        <section className="gj-route-info-card">
          <strong>Route intelligence</strong>
          <div><span>Fastest route</span><b>{routes.length ? Math.round(routes[0].durationMin) + ' min estimate' : 'Awaiting search'}</b></div>
          <div><span>Safest route</span><b>Requires Gujarat risk data</b></div>
          <div><span>Weather along route</span><b>MET Norway integration pending</b></div>
          <div><span>GPS tracking</span><b>{gps ? 'Active' : 'Not started'}</b></div>
          <div><span>Live traffic</span><b>Not available from current route source</b></div>
        </section>
        {savedTrips.length > 0 && <section className="gj-route-info-card">
          <strong>Saved trips on this device</strong>
          {savedTrips.map(t => <div key={t.id} style={{display:'flex',gap:6,alignItems:'center',marginTop:7}}>
            <button type="button" onClick={() => restoreTrip(t)} style={{flex:1,textAlign:'left',background:'transparent',border:0,color:'inherit',cursor:'pointer'}}>{t.from} → {t.to}</button>
            <button type="button" aria-label="Delete saved trip" onClick={() => deleteTrip(t.id)}>×</button>
          </div>)}
        </section>}
      </aside>
    </div>
    <p className="gj-route-footnote">Routes use the public OSRM demo service and OpenStreetMap data. Travel times are estimates, not live traffic predictions. Saved trips remain in this browser. GPS is requested only when you opt in. NetworkX safety ranking and MET Norway route forecasting are separate integration steps.</p>
  </div>;
}
