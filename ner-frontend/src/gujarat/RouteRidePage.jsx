import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const REGIONS = {
  ahmedabad: { label: 'Ahmedabad–Gandhinagar (Primary)', center: [23.12, 72.60], zoom: 10, radius: 28000 },
  kamrej: { label: 'Kamrej, Surat (Parallel test zone)', center: [21.27, 72.96], zoom: 12, radius: 15000 },
};

const userIcon = L.divIcon({ className: 'gj-user-location-icon', html: '<span></span>', iconSize: [20, 20], iconAnchor: [10, 10] });

function RecenterMap({ center, zoom }) {
  const map = useMap();
  useEffect(() => { map.setView(center, zoom, { animate: true }); }, [center, zoom, map]);
  return null;
}

export default function RouteRidePage() {
  const [regionKey, setRegionKey] = useState('ahmedabad');
  const [gps, setGps] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('Location not started');
  const [watching, setWatching] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [notice, setNotice] = useState('Choose an origin and destination. Route calculation will activate after the regional road graph is imported and validated.');
  const region = REGIONS[regionKey];

  useEffect(() => {
    if (!watching) return undefined;
    if (!navigator.geolocation) {
      setGpsStatus('Geolocation is not supported by this browser.');
      setWatching(false);
      return undefined;
    }
    if (!window.isSecureContext) {
      setGpsStatus('Live GPS requires HTTPS or localhost.');
      setWatching(false);
      return undefined;
    }
    setGpsStatus('Waiting for GPS signal…');
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setGps({ lat: position.coords.latitude, lon: position.coords.longitude, accuracy: position.coords.accuracy, at: new Date(position.timestamp) });
        setGpsStatus('GPS signal received');
      },
      (error) => setGpsStatus(error.code === 1 ? 'Location permission denied.' : 'Waiting for a GPS signal. Try moving outdoors.'),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [watching]);

  const mapCenter = useMemo(() => gps ? [gps.lat, gps.lon] : region.center, [gps, region]);
  const startGps = () => {
    if (!watching) setWatching(true);
    if (gps) setGpsStatus('GPS tracking active');
  };

  function requestRoute(event) {
    event.preventDefault();
    setNotice('Route calculation is not enabled yet: the selected region needs a connected, validated road graph. We will connect this form to the Gujarat NetworkX routing API next; no route or ETA is being fabricated.');
  }

  return <div className="gj-route-page">
    <div className="gj-page-heading">
      <div><span className="gj-eyebrow">GUJARAT / ROUTE & RIDE</span><h1>Route & Ride</h1><p>Map, device GPS, weather-aware routing and trip monitoring.</p></div>
      <span className="gj-status gj-status--regional-pilot">DEVELOPMENT PREVIEW</span>
    </div>

    <div className="gj-route-toolbar">
      <label>Development region
        <select value={regionKey} onChange={e => { setRegionKey(e.target.value); setGps(null); }}>
          {Object.entries(REGIONS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
        </select>
      </label>
      <div className="gj-gps-control"><span className={watching && gps ? 'gj-gps-dot active' : 'gj-gps-dot'}></span><span>{gpsStatus}</span>
        {!watching ? <button type="button" onClick={startGps}>Use my location</button> : <button type="button" onClick={() => { setWatching(false); setGpsStatus('Location tracking stopped'); }}>Stop GPS</button>}
      </div>
    </div>

    <div className="gj-route-layout">
      <section className="gj-route-map-card">
        <div className="gj-map-heading"><div><strong>Live regional map</strong><small>{region.label}</small></div><span>© OpenStreetMap contributors</span></div>
        <MapContainer center={region.center} zoom={region.zoom} scrollWheelZoom className="gj-live-map">
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <RecenterMap center={mapCenter} zoom={gps ? 14 : region.zoom} />
          <Circle center={region.center} radius={region.radius} pathOptions={{ color: '#167f78', fillColor: '#167f78', fillOpacity: 0.06, weight: 2, dashArray: '6 6' }} />
          {gps && <Marker position={[gps.lat, gps.lon]} icon={userIcon}><Popup><strong>Your device location</strong><br/>Accuracy ±{Math.round(gps.accuracy)} m</Popup></Marker>}
          <Marker position={region.center}><Popup>{region.label}<br/>Pilot map centre (approximate)</Popup></Marker>
        </MapContainer>
        <div className="gj-map-legend"><span><i className="gj-legend-user"></i>Your GPS position</span><span><i className="gj-legend-zone"></i>Development coverage target</span></div>
      </section>

      <aside className="gj-route-side">
        <form className="gj-route-search-card" onSubmit={requestRoute}>
          <span className="gj-card-kicker">PLAN A JOURNEY</span><h2>Where do you want to go?</h2>
          <label>Starting point<input value={from} onChange={e => setFrom(e.target.value)} placeholder="Enter starting location" required /></label>
          <label>Destination<input value={to} onChange={e => setTo(e.target.value)} placeholder="Enter destination" required /></label>
          <button className="gj-primary-button" type="submit">Find routes</button>
          <p className="gj-route-notice">{notice}</p>
        </form>
        <section className="gj-route-info-card"><strong>Route intelligence</strong><div><span>Fastest route</span><b>Awaiting road graph</b></div><div><span>Safest route</span><b>Awaiting risk + weather data</b></div><div><span>Weather along route</span><b>MET Norway integration next</b></div><div><span>Live ride tracking</span><b>{gps ? 'GPS fix received' : 'Not started'}</b></div></section>
      </aside>
    </div>
    <p className="gj-route-footnote">GPS is requested only after you select “Use my location”. Your browser may ask for permission. The map is a development view, not turn-by-turn navigation. Road coverage and live traffic are not yet connected.</p>
  </div>;
}
