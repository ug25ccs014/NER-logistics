// Offline sign-in for devices that have already signed in online once.
//
// The real password check (bcrypt) only exists on the server, so with no
// signal a normal login can't work. After every successful ONLINE login we
// keep a salted PBKDF2 hash of the password on this device; if a later login
// fails only because there is no network, the typed password is checked
// against that hash instead. Wiped on logout (see AuthContext.jsx).
//
// Needs Web Crypto -> HTTPS or localhost (Vercel + dev server both qualify).
const KEY = 'ner_offline_cred';
const enc = new TextEncoder();
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

async function derive(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150000 }, key, 256);
  return toB64(bits);
}

// session = the /auth/login response: { token, role, full_name }
export async function saveOfflineCred(phone, password, session) {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    localStorage.setItem(KEY, JSON.stringify({
      phone, salt: toB64(salt), hash: await derive(password, salt), session,
    }));
  } catch { /* storage full / crypto unavailable -> offline login just won't be offered */ }
}

// -> saved session object if phone + password match, else null
export async function verifyOfflineCred(phone, password) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (c.phone !== phone) return null;
    return (await derive(password, fromB64(c.salt))) === c.hash ? c.session : null;
  } catch { return null; }
}

export const hasOfflineCred = () => Boolean(localStorage.getItem(KEY));
export const clearOfflineCred = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };
