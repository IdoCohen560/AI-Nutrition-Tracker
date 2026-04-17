const TOKEN_KEY = 'ai_food_tracker_token';
const API_BASE = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = /^https?:\/\//.test(path) ? path : `${API_BASE}${path}`;
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const detail = typeof data === 'object' && data?.detail;
    let msg;
    if (Array.isArray(detail)) {
      msg = detail.map((d) => (typeof d === 'string' ? d : d.msg || JSON.stringify(d))).join('; ');
    } else {
      msg = detail || data?.message || res.statusText;
    }
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return data;
}
