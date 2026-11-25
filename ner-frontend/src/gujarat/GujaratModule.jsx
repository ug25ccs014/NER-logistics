import React, { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { gujaratRequest } from './gujaratApi.js';
import './gujarat.css';

const NAV_ITEMS = [
  { to: '/gujarat', label: 'Overview', end: true, icon: '⌂' },
  { to: '/gujarat/roadways', label: 'Roadways', icon: '⇢' },
  { to: '/gujarat/waterways', label: 'Waterways', icon: '≈' },
  { to: '/gujarat/airways', label: 'Airways', icon: '✈' },
  { to: '/gujarat/multimodal', label: 'Multimodal planner', icon: '⤢' },
  { to: '/gujarat/shipments', label: 'Shipments', icon: '▣' },
  { to: '/gujarat/tracking', label: 'Tracking', icon: '◎' },
  { to: '/gujarat/authority', label: 'Authority view', icon: '▤' },
];

function StatusPill({ value = 'UNVERIFIED' }) {
  const status = String(value).toUpperCase();
  const statusClass = status.toLowerCase().replaceAll(" ", "-");
  return <span className={`gj-status gj-status--${statusClass}`}>{status}</span>;
}

function useGujaratData(path, refreshKey = 0) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    gujaratRequest(path)
      .then((result) => { if (active) setData(result); })
      .catch((err) => { if (active) setError(err.message || 'Unable to load Gujarat data.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path, refreshKey]);

  return { data, error, loading };
}

function useGujaratBundle(paths) {
  const key = paths.join('|');
  const [data, setData] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all(paths.map(path => gujaratRequest(path)))
      .then(results => { if (active) setData(results); })
      .catch(err => { if (active) setError(err.message || 'Unable to load regional records.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [key]);
  return { data, error, loading };
}

function RegistryGroup({ title, records, emptyText, getName, getDetail }) {
  return <section className="gj-registry-group"><div className="gj-registry-heading"><strong>{title}</strong><span>{records.length} records</span></div>
    {records.length === 0 ? <p className="gj-registry-empty">{emptyText}</p> : <div className="gj-record-list">{records.map((record, index) => <article className="gj-record" key={record.id || index}><div><strong>{getName(record)}</strong><small>{getDetail(record)}</small></div><StatusPill value={record.data_status} /></article>)}</div>}
  </section>;
}

function LoadingState() {
  return <div className="gj-state">Loading regional data…</div>;
}

function ErrorState({ message }) {
  return <div className="gj-error"><strong>Could not load this section</strong><span>{message}</span><small>Check that migration 005 has been applied and the existing API is reachable.</small></div>;
}

function EmptyState({ title, detail }) {
  return <div className="gj-empty"><span className="gj-empty-icon">◇</span><strong>{title}</strong><p>{detail}</p></div>;
}

function OverviewPage() {
  const { data, error, loading } = useGujaratData('/overview');
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const counts = data?.counts || {};
  const metrics = [
    ['Road segments', counts.road_segments ?? 0, 'Regional road graph'],
    ['Waterways', counts.waterways ?? 0, 'Registered waterway records'],
    ['Water terminals', counts.waterway_terminals ?? 0, 'Registered terminal records'],
    ['Airports', counts.airports ?? 0, 'Regional airport records'],
    ['Shipments', counts.shipments ?? 0, 'Created in this module'],
    ['Events · 24h', counts.events_last_24h ?? 0, 'Shipment activity'],
  ];

  return (
    <>
      <div className="gj-page-heading">
        <div><span className="gj-eyebrow">REGIONAL LOGISTICS INTELLIGENCE</span><h1>Gujarat overview</h1><p>One workspace for road, water and air cargo across Gujarat.</p></div>
        <StatusPill value={data?.data_status} />
      </div>
      <section className="gj-corridor-card">
        <div><span className="gj-card-kicker">INITIAL PILOT CORRIDOR</span><h2>Gandhinagar <span>↔</span> Ahmedabad</h2><p>Approximately 50 km · Gujarat, India</p></div>
        <div className="gj-corridor-mark"><span>GJ</span><i>REGIONAL MODULE</i></div>
      </section>
      <div className="gj-metric-grid">
        {metrics.map(([label, value, note]) => <article className="gj-metric" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}
      </div>
      <section className="gj-notice"><strong>Data integrity notice</strong><p>{data?.message || 'Only verified operational data will be presented as live. Demo and simulated records will be labelled.'}</p></section>
      <div className="gj-section-title"><div><span className="gj-eyebrow">TRANSPORT MODES</span><h2>Explore the Gujarat network</h2></div></div>
      <div className="gj-mode-grid">
        <ModeCard to="/gujarat/roadways" icon="⇢" title="Roadways" text="Regional roads, conditions and route planning." />
        <ModeCard to="/gujarat/waterways" icon="≈" title="Waterways" text="Waterway registry, terminals and vessel data." />
        <ModeCard to="/gujarat/airways" icon="✈" title="Airways" text="Airport cargo workflows and handling milestones." />
      </div>
    </>
  );
}

function ModeCard({ to, icon, title, text }) {
  return <Link className="gj-mode-card" to={to}><span>{icon}</span><div><strong>{title}</strong><p>{text}</p></div><b>↗</b></Link>;
}

const SECTION_CONFIG = {
  roadways: { title: 'Roadways', subtitle: 'Gujarat-only road network and road operations.', path: '/roadways/segments', empty: 'No Gujarat road segments have been imported yet.', detail: 'Import a reviewed Gandhinagar–Ahmedabad road dataset before using route planning.' },
  waterways: { title: 'Waterways', subtitle: 'Waterway registry, navigability and terminal information.', path: '/waterways', empty: 'No Gujarat waterway records have been registered yet.', detail: 'Only add waterways and navigability information after checking authoritative sources.' },
  airways: { title: 'Airways', subtitle: 'Air cargo gateways, provider records and handling status.', path: '/airways/airports', empty: 'No airport records have been added to the Gujarat module yet.', detail: 'Airport reference data and live cargo availability are different; live capacity needs an authorised source.' },
  shipments: { title: 'Shipments', subtitle: 'Create and review shipments using the shared Gujarat shipment identity.', path: '/shipments', empty: 'No shipments have been created in this Gujarat workspace.', detail: 'Create a shipment to start a regional tracking record.' },
};

function RecordsPage({ section }) {
  const config = SECTION_CONFIG[section];
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, error, loading } = useGujaratData(config.path, refreshKey);
  const [form, setForm] = useState({ origin_label: 'Gandhinagar', destination_label: 'Ahmedabad', cargo_type: 'General', weight_kg: '100' });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [routeStart, setRouteStart] = useState('');
  const [routeEnd, setRouteEnd] = useState('');
  const [routeResult, setRouteResult] = useState(null);
  const [routeError, setRouteError] = useState('');
  const [routeLoading, setRouteLoading] = useState(false);
  const isShipments = section === 'shipments';

  async function compareRoadRoutes(event) {
    event.preventDefault();
    setRouteLoading(true);
    setRouteError('');
    setRouteResult(null);
    try {
      const query = `?start=${encodeURIComponent(routeStart)}&end=${encodeURIComponent(routeEnd)}`;
      setRouteResult(await gujaratRequest(`/roadways/route${query}`));
    } catch (err) {
      setRouteError(err.message || 'Route comparison failed.');
    } finally {
      setRouteLoading(false);
    }
  }

  async function createShipment(event) {
    event.preventDefault();
    setSaving(true);
    setNotice('');
    try {
      const created = await gujaratRequest('/shipments', { method: 'POST', body: JSON.stringify({ ...form, weight_kg: Number(form.weight_kg) }) });
      setNotice(`Created ${created.public_reference}. The shipment list has been refreshed.`);
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setNotice(err.message || 'Shipment could not be created.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="gj-page-heading"><div><span className="gj-eyebrow">GUJARAT / {section.toUpperCase()}</span><h1>{config.title}</h1><p>{config.subtitle}</p></div></div>
      {section === 'roadways' && <form className="gj-create-form" onSubmit={compareRoadRoutes}>
        <div className="gj-form-heading"><strong>Compare Gujarat road routes</strong><span>Uses Gujarat-only segment IDs · estimated speeds, not live traffic</span></div>
        <div className="gj-form-grid gj-route-form-grid">
          <label>Start segment ID<input type="number" min="1" value={routeStart} onChange={e => setRouteStart(e.target.value)} required /></label>
          <label>End segment ID<input type="number" min="1" value={routeEnd} onChange={e => setRouteEnd(e.target.value)} required /></label>
        </div>
        <button className="gj-primary-button" disabled={routeLoading}>{routeLoading ? 'Comparing…' : 'Compare fastest and safest'}</button>
        {routeError && <p className="gj-form-notice gj-form-error">{routeError}</p>}
        {routeResult && <div className="gj-route-results">
          {['fastest','safest'].map(mode => {
            const route = routeResult[mode];
            return <article className="gj-route-result" key={mode}><strong>{mode === 'fastest' ? 'Fastest route' : 'Safest route'}</strong>{route ? <><span>{route.total_time_min} estimated minutes</span><small>{route.segments.map(segment => segment.name).join(' → ')}</small><StatusPill value={route.data_status} /></> : <small>No feasible route in this mode.</small>}</article>;
          })}
        </div>}
      </form>}
      {isShipments && <form className="gj-create-form" onSubmit={createShipment}>
        <div className="gj-form-heading"><strong>Create a shipment</strong><span>Uses your existing NER account</span></div>
        <div className="gj-form-grid">
          <label>Origin<input value={form.origin_label} onChange={e => setForm({ ...form, origin_label: e.target.value })} required /></label>
          <label>Destination<input value={form.destination_label} onChange={e => setForm({ ...form, destination_label: e.target.value })} required /></label>
          <label>Cargo type<input value={form.cargo_type} onChange={e => setForm({ ...form, cargo_type: e.target.value })} required /></label>
          <label>Weight (kg)<input type="number" min="0.01" step="0.01" value={form.weight_kg} onChange={e => setForm({ ...form, weight_kg: e.target.value })} required /></label>
        </div>
        <button className="gj-primary-button" disabled={saving}>{saving ? 'Creating…' : 'Create shipment'}</button>
        {notice && <p className="gj-form-notice">{notice}</p>}
      </form>}
      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}
      {!loading && !error && Array.isArray(data) && data.length === 0 && <EmptyState title={config.empty} detail={config.detail} />}
      {!loading && !error && Array.isArray(data) && data.length > 0 && <div className="gj-record-list">{data.map((record, index) => <article className="gj-record" key={record.id || record.iata_code || index}><div><strong>{record.name || record.public_reference || record.iata_code || 'Record'}</strong><small>{record.river_name || record.cargo_type || record.origin_label || record.operational_status || 'Regional record'}{record.public_reference ? ` · ${record.weight_kg} kg` : ''}</small></div><StatusPill value={record.data_status} />{record.id && section === 'shipments' && <Link className="gj-record-link" to={`/gujarat/tracking?shipment=${encodeURIComponent(record.id)}`}>Track ↗</Link>}</article>)}</div>}
      {section === 'roadways' && !loading && !error && data?.features?.length === 0 && <EmptyState title={config.empty} detail={config.detail} />}
      {section === 'roadways' && !loading && !error && data?.features?.length > 0 && <div className="gj-record-list">{data.features.map((feature) => <article className="gj-record" key={feature.properties.id}><div><strong>{feature.properties.name}</strong><small>Segment #{feature.properties.id} · {feature.properties.corridor || 'Gujarat'} · {feature.properties.length_km ?? 'Length unknown'} km</small></div><StatusPill value={feature.properties.data_status} /></article>)}</div>}
    </>
  );
}

function WaterwaysPage() {
  const paths = ['/waterways', '/waterways/segments', '/waterways/terminals', '/waterways/vessels', '/waterways/schedules'];
  const { data, error, loading } = useGujaratBundle(paths);
  const [waterways, segments, terminals, vessels, schedules] = data;
  return <>
    <div className="gj-page-heading"><div><span className="gj-eyebrow">GUJARAT / WATERWAYS</span><h1>Waterways</h1><p>Registry and operational evidence for inland water transport.</p></div><StatusPill value="UNVERIFIED" /></div>
    {loading && <LoadingState />}
    {error && <ErrorState message={error} />}
    {!loading && !error && <>
      <div className="gj-notice"><strong>Navigation status is not assumed</strong><p>A National Waterway designation or feasibility study does not prove commercial navigability, vessel service, or available cargo capacity on a particular stretch.</p></div>
      <RegistryGroup title="Waterway registry" records={waterways || []} emptyText="No waterway references registered." getName={r => r.name} getDetail={r => `${r.river_name || 'River'} · ${r.national_waterway_number || 'No NW number'} · ${r.operational_status}`} />
      <RegistryGroup title="Waterway segments" records={segments || []} emptyText="No segment-level navigability data. Do not infer navigability from a registry entry." getName={r => r.segment_code || `Segment ${r.id}`} getDetail={r => `${r.waterway_name} · ${r.navigability_status}`} />
      <RegistryGroup title="Terminals" records={terminals || []} emptyText="No verified waterway terminals registered." getName={r => r.name} getDetail={r => r.operational_status} />
      <RegistryGroup title="Vessels" records={vessels || []} emptyText="No vessel/operator availability records." getName={r => r.vessel_code || r.operator || `Vessel ${r.id}`} getDetail={r => `${r.vessel_type || 'Vessel type unknown'} · ${r.availability_status}`} />
      <RegistryGroup title="Schedules" records={schedules || []} emptyText="No vessel schedules. No freight service is being represented as live." getName={r => `${r.origin_terminal} → ${r.destination_terminal}`} getDetail={r => r.departure_at ? new Date(r.departure_at).toLocaleString() : 'Departure not published'} />
    </>}
  </>;
}

function AirwaysPage() {
  const paths = ['/airways/airports', '/airways/airlines', '/airways/flights'];
  const { data, error, loading } = useGujaratBundle(paths);
  const [airports, airlines, flights] = data;
  return <>
    <div className="gj-page-heading"><div><span className="gj-eyebrow">GUJARAT / AIRWAYS</span><h1>Airways</h1><p>Airport reference data, air-cargo providers and flight availability.</p></div><StatusPill value="REFERENCE DATA" /></div>
    {loading && <LoadingState />}
    {error && <ErrorState message={error} />}
    {!loading && !error && <>
      <div className="gj-notice"><strong>Reference data versus live capacity</strong><p>Airport and cargo-terminal references do not imply that airline schedules, cargo capacity, rates or booking integrations are connected.</p></div>
      <RegistryGroup title="Airports" records={airports || []} emptyText="No airport references registered." getName={r => `${r.name} ${r.iata_code ? `(${r.iata_code})` : ''}`} getDetail={r => `${r.icao_code || 'ICAO unknown'} · ${r.operational_status}`} />
      <RegistryGroup title="Air-cargo providers" records={airlines || []} emptyText="No airline cargo-provider records registered." getName={r => r.name} getDetail={r => r.airline_code || 'Provider reference not supplied'} />
      <RegistryGroup title="Flight schedules and capacity" records={flights || []} emptyText="No verified flight cargo schedules or available capacity. Add only from an authorised source." getName={r => `${r.flight_number || 'Flight'} · ${r.origin_iata || '?'} → ${r.destination_iata || '?'}`} getDetail={r => r.scheduled_departure ? new Date(r.scheduled_departure).toLocaleString() : 'Schedule not published'} />
    </>}
  </>;
}

function MultimodalPage() {
  const { data, error, loading } = useGujaratData('/multimodal/status');
  return <>
    <div className="gj-page-heading"><div><span className="gj-eyebrow">GUJARAT / MULTIMODAL</span><h1>Multimodal planner</h1><p>Compare road, water and air legs for a single shipment.</p></div><StatusPill value={data?.optimizer_status || 'UNAVAILABLE'} /></div>
    {loading && <LoadingState />}
    {error && <ErrorState message={error} />}
    {data && <section className="gj-notice"><strong>Why optimization is not enabled yet</strong><p>{data.reason}</p></section>}
    {data?.readiness && <div className="gj-metric-grid">{Object.entries(data.readiness).map(([label, value]) => <article className="gj-metric" key={label}><span>{label.replaceAll('_',' ')}</span><strong>{value}</strong><small>Verified operational records</small></article>)}</div>}
  </>;
}

function TrackingPage() {
  const initialReference = new URLSearchParams(window.location.search).get('shipment') || '';
  const [reference, setReference] = useState(initialReference);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  async function search(event) {
    event.preventDefault();
    setError('');
    setResult(null);
    try { setResult(await gujaratRequest(`/shipments/${encodeURIComponent(reference.trim())}/tracking`)); }
    catch (err) { setError(err.message || 'Tracking lookup failed.'); }
  }
  return <><div className="gj-page-heading"><div><span className="gj-eyebrow">GUJARAT / TRACKING</span><h1>Shipment tracking</h1><p>Look up a shipment using its internal shipment ID.</p></div></div><form className="gj-lookup-form" onSubmit={search}><input placeholder="Paste shipment UUID" value={reference} onChange={e => setReference(e.target.value)} required /><button className="gj-primary-button">Find shipment</button></form>{error && <ErrorState message={error} />}{result && <div className="gj-record-list"><article className="gj-record"><div><strong>{result.shipment.public_reference}</strong><small>{result.shipment.origin_label} → {result.shipment.destination_label}</small></div><StatusPill value={result.shipment.data_status} /></article>{result.events.map(event => <article className="gj-record" key={event.id}><div><strong>{event.event_type}</strong><small>{event.description || ''} · {new Date(event.event_at).toLocaleString()}</small></div><StatusPill value={event.data_status} /></article>)}</div>}</>;
}

function AuthorityPage() {
  const { role } = useAuth();
  if (role !== 'authority') return <ErrorState message="This section is restricted to accounts with the Authority role." />;
  return <div className="gj-page-heading"><div><span className="gj-eyebrow">GUJARAT / AUTHORITY</span><h1>Authority overview</h1><p>Regional operational oversight will appear here as verified records are connected.</p></div></div>;
}

export default function GujaratModule() {
  const { name, role, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="gj-shell">
      <aside className="gj-sidebar">
        <Link to="/gujarat" className="gj-brand"><span>GJ</span><div><strong>Gujarat Logistics</strong><small>NER Logistics · Regional workspace</small></div></Link>
        <div className="gj-region-label">REGIONAL WORKSPACE</div>
        <nav className="gj-nav">{NAV_ITEMS.map(item => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `gj-nav-link${isActive ? ' active' : ''}`}><span>{item.icon}</span>{item.label}</NavLink>)}</nav>
        <div className="gj-sidebar-bottom"><div className="gj-user"><span className="gj-avatar">{(name || 'U').slice(0,1).toUpperCase()}</span><div><strong>{name || 'Signed in user'}</strong><small>{role || 'User'}</small></div></div><button onClick={() => navigate('/app')}>← Back to NER workspace</button><button onClick={logout}>Sign out</button></div>
      </aside>
      <main className="gj-main">
        <header className="gj-topbar"><div><span>NER LOGISTICS</span><b>/</b><strong>GUJARAT MODULE</strong></div><StatusPill value="REGIONAL PILOT" /></header>
        <div className="gj-content"><Routes>
          <Route index element={<OverviewPage />} />
          <Route path="roadways" element={<RecordsPage section="roadways" />} />
          <Route path="waterways" element={<WaterwaysPage />} />
          <Route path="airways" element={<AirwaysPage />} />
          <Route path="multimodal" element={<MultimodalPage />} />
          <Route path="shipments" element={<RecordsPage section="shipments" />} />
          <Route path="tracking" element={<TrackingPage />} />
          <Route path="authority" element={<AuthorityPage />} />
          <Route path="*" element={<Navigate to="/gujarat" replace />} />
        </Routes></div>
      </main>
    </div>
  );
}
