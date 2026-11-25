import { API_BASE } from '../api.js';

function getToken() {
  return localStorage.getItem('ner_token') || sessionStorage.getItem('ner_token');
}

export async function gujaratRequest(path, options = {}) {
  const token = getToken();
  const response = await fetch(`${API_BASE}/gujarat${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (response.status === 401) {
    throw new Error('Your session is no longer valid. Please sign in again.');
  }
  if (!response.ok) {
    let detail = `Gujarat API returned ${response.status}`;
    try {
      const body = await response.json();
      if (body.detail) detail = body.detail;
    } catch { /* keep status-based message */ }
    throw new Error(detail);
  }
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}
