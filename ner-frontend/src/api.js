// In development, use the Vite /api proxy so the browser never needs
// to connect directly to FastAPI (avoids CORS/localhost-origin problems).
// For production, set VITE_API_BASE to the public API base URL.
export const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const TOKEN_KEY = 'ner_token';

async function request(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...options,
    });
  } catch (err) {
    throw new Error(`Cannot reach the FastAPI backend. Make sure it is running on port 8000.`);
  }
  if (!res.ok) {
    let detail;
    try { detail = (await res.json()).detail; } catch { /* not JSON */ }
    throw new Error(detail || `API ${path} returned ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Same auth + error handling as request(), but for multipart/form-data
// uploads. The key difference: it must NOT set Content-Type -- the
// browser generates it, including the multipart boundary string, and
// setting it manually breaks the upload with a confusing 422.
async function uploadRequest(path, formData) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    let detail;
    try { detail = (await res.json()).detail; } catch { /* not JSON */ }
    throw new Error(detail || `API ${path} returned ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// field-report photo_url comes back as a relative path (e.g. "/uploads/xyz.jpg")
// since the backend doesn't know its own public URL -- prefix it here.
export function resolvePhotoUrl(photoUrl) {
  if (!photoUrl) return null;
  if (/^https?:\/\//.test(photoUrl)) return photoUrl;
  return `${API_BASE}${photoUrl}`;
}

export const api = {
  // Auth -- real accounts, bcrypt-hashed server-side. login/register
  // return { token, role, full_name }; request() above then sends
  // that token as a Bearer header on every subsequent call automatically.
  login: (phone, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ phone, password }) }),
  register: ({ fullName, phone, password, role, passkey }) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ full_name: fullName, phone, password, role, passkey: passkey || undefined }),
    }),
  me: () => request('/auth/me'),

  // Accommodations
  nearbyAccommodations: (lat, lon, radiusKm = 15, limit = 8) =>
    request(`/accommodations?lat=${lat}&lon=${lon}&radius_km=${radiusKm}&limit=${limit}`),

  // Drivers / field officers sharing live location
  postLocation: (sessionId, name, phone, role, lat, lon, status) =>
    request('/drivers/location', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        driver_name: name,
        phone,
        role,
        lat,
        lon,
        status,
      }),
    }),
  deleteLocation: (sessionId) =>
    request(`/drivers/location/${sessionId}`, { method: 'DELETE' }),
  nearbyPeople: (lat, lon, excludeSessionId, radiusKm = 25) =>
    request(`/drivers/nearby?lat=${lat}&lon=${lon}&exclude=${excludeSessionId}&radius_km=${radiusKm}`),

  // Notify (direct, targeted "hey, over here" ping to one session)
  notify: ({ toSessionId, fromSessionId, fromName, fromPhone, fromRole, lat, lon }) =>
    request('/notify', {
      method: 'POST',
      body: JSON.stringify({
        to_session_id: toSessionId,
        from_session_id: fromSessionId,
        from_name: fromName,
        from_phone: fromPhone,
        from_role: fromRole,
        lat: lat ?? null,
        lon: lon ?? null,
      }),
    }),
  notifications: (sessionId) => request(`/notifications/${sessionId}`),

  // Field reports
  // lang: 'en' | 'hi' | 'as' -- adds a translated report_type_label to each report.
  fieldReports: (limit = 30, lang = 'en') => request(`/field-reports?limit=${limit}&lang=${lang}`),
  submitFieldReport: (payload) =>
    request('/field-reports', { method: 'POST', body: JSON.stringify(payload) }),
  verifyFieldReport: (id, verified = true) =>
    request(`/field-reports/${id}/verify`, { method: 'POST', body: JSON.stringify({ verified }) }),
  resolveFieldReport: (id) => request(`/field-reports/${id}/resolve`, { method: 'POST' }),

  // Alerts
  // lang: 'en' | 'hi' | 'as' -- adds translated alert_type_label/severity_label.
  alerts: (lang = 'en') => request(`/alerts?lang=${lang}`),
  createAlert: (payload) => request('/alerts', { method: 'POST', body: JSON.stringify(payload) }),
  resolveAlert: (id) => request(`/alerts/${id}/resolve`, { method: 'POST' }),

  // Authority
  districtStatus: () => request('/districts/status'),
  trips: () => request('/trips'),

  // Shipment board
  shipmentBoard: (travelDate) =>
    request(`/shipment-board${travelDate ? `?travel_date=${travelDate}` : ''}`),
  postShipment: (payload) =>
    request('/shipment-board', { method: 'POST', body: JSON.stringify(payload) }),
  updateShipmentStatus: (id, sessionId, status) =>
    request(`/shipment-board/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, status }),
    }),

  // Planned-trip forecast: route segments are sent in route order so the backend can estimate arrival time per section.
  forecastSegments: (departAtLocalIso, segmentIds, journeyMinutes = 60) =>
    request(`/segments/forecast?depart_at=${encodeURIComponent(departAtLocalIso)}&segment_ids=${segmentIds.join(',')}&journey_minutes=${encodeURIComponent(journeyMinutes)}`),

  // Route segments (for the map)
  segments: () => request('/segments'),

  // Chat (threaded direct messages between two sessions) + inbox
  chatSend: (payload) => request('/chat/send', { method: 'POST', body: JSON.stringify(payload) }),
  chatThread: (sessionId, withSessionId) =>
    request(`/chat/thread?session_id=${sessionId}&with_session_id=${withSessionId}`),
  chatInbox: (sessionId) => request(`/chat/inbox?session_id=${sessionId}`),

  // --- AI dashcam ---
  // Presence/session registration. App.jsx calls this on a heartbeat for
  // whoever is logged in, so the AI alert pipeline knows which authority
  // sessions are currently active and can target them. Returns
  // { provider, threshold, high_risk_threshold }.
  registerAISession: (sessionId) =>
    request('/ai/session', { method: 'POST', body: JSON.stringify({ session_id: sessionId }) }),

  // Recent detections feed for the dashcam panel's history list.
  aiDetections: (limit = 50) => request(`/ai/detections?limit=${limit}`),

  // detect-frame and analyze-video take the file as multipart/form-data
  // with everything else as QUERY params (see main.py's signatures) --
  // so they can't go through request(), which forces a JSON body and a
  // JSON Content-Type. They use uploadRequest() below instead, which
  // lets the browser set its own multipart boundary header.
  detectAIFrame: ({ sessionId, lat, lon, imageBlob, vehicleId, capturedAt }) => {
    const form = new FormData();
    form.append('image', imageBlob, 'frame.jpg');
    const qs = new URLSearchParams({ session_id: sessionId, lat, lon });
    if (vehicleId != null) qs.set('vehicle_id', vehicleId);
    if (capturedAt) qs.set('captured_at', capturedAt);
    return uploadRequest(`/ai/detect-frame?${qs}`, form);
  },

  analyzeAIVideo: ({ sessionId, lat, lon, videoFile, sampleEvery = 1.0 }) => {
    const form = new FormData();
    form.append('video', videoFile, videoFile.name || 'clip.mp4');
    const qs = new URLSearchParams({
      session_id: sessionId, lat, lon, sample_every: sampleEvery,
    });
    return uploadRequest(`/ai/analyze-video?${qs}`, form);
  },
};

// --- Geocoding / place search (Nominatim, a public OSM service --
// NOT your FastAPI backend, so it's called directly, not via request()) ---
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const NAGALAND_VIEWBOX = '93.2,27.2,95.8,25.0'; // left,top,right,bottom -- biases results to the NER region

export async function geocodePlace(query) {
  const url = `${NOMINATIM_BASE}?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding service returned ${res.status}`);
  const results = await res.json();
  if (results.length === 0) throw new Error(`Could not find location: "${query}"`);
  return { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon), label: results[0].display_name };
}

export async function fetchPlaceSuggestions(query) {
  if (!query || query.trim().length < 3) return [];
  const url = `${NOMINATIM_BASE}?format=json&limit=5&countrycodes=in&viewbox=${NAGALAND_VIEWBOX}&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// --- Routing (OSRM's public demo server -- also external, not your backend) ---
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

// startPt/endPt are [lon, lat]. Requests alternative routes, sorted fastest-first.
export async function fetchRealRoutes(startPt, endPt) {
  const url = `${OSRM_BASE}/${startPt[0]},${startPt[1]};${endPt[0]},${endPt[1]}?overview=full&geometries=geojson&alternatives=3`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Routing service returned ${res.status}`);
  const data = await res.json();
  if (!data.routes || data.routes.length === 0) throw new Error('No real-road route found');
  return data.routes
    .map((route) => ({
      coords: route.geometry.coordinates.map((c) => [c[1], c[0]]),
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60,
    }))
    .sort((a, b) => a.durationMin - b.durationMin);
}
