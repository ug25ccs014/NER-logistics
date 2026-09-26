// Point this at your existing FastAPI backend (api/main.py).
// Set VITE_API_BASE in a .env file to override for prod builds.
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
const TOKEN_KEY = 'ner_token';

// "Remember me" (see AuthContext.jsx) puts the token in localStorage
// when checked, sessionStorage when not -- check both so requests
// keep authenticating either way.
function getToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

async function request(path, options = {}) {
<<<<<<< HEAD
  const token = getToken();
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
  const token = getToken();
=======
  const token = localStorage.getItem(TOKEN_KEY);
>>>>>>> f68b91aac1d42ced71cac8ded114aae9078fd5cb
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
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
  login: (phone, password, rememberMe = false) => request('/auth/login', { method: 'POST', body: JSON.stringify({ phone, password, remember_me: rememberMe }) }),
  register: ({ fullName, phone, password, role, passkey, rememberMe = false }) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ full_name: fullName, phone, password, role, passkey: passkey || undefined, remember_me: rememberMe }),
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

  // Route segments (for the map)
  segments: () => request('/segments'),

  // Chat (threaded direct messages between two sessions) + inbox
  chatSend: (payload) => request('/chat/send', { method: 'POST', body: JSON.stringify(payload) }),
  chatThread: (sessionId, withSessionId) =>
    request(`/chat/thread?session_id=${sessionId}&with_session_id=${withSessionId}`),
  chatInbox: (sessionId) => request(`/chat/inbox?session_id=${sessionId}`),
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
