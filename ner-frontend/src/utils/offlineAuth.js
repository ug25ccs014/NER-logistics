// Offline sign-in for devices that have already signed in online once.
//
// The real password check (bcrypt) only exists on the server, so with no
// signal a normal login can't work. After every successful ONLINE login we
// keep a salted PBKDF2 hash of the password on this device; if a later login
// fails only because there is no network, the typed password is checked
// against that hash instead.
//
// Rules:
//  - The saved sign-in is valid for OFFLINE_LOGIN_DAYS (7) after the last
//    successful ONLINE login, then it must be refreshed by logging in online.
//    (This matches the server's JWT lifetime, see JWT_EXPIRE_HOURS in api/config.py.)
//  - It is kept after a normal logout, so a driver can sign out and sign back
//    in with no signal. It is only removed when it expires.
//  - Several accounts can be saved on one device (one entry per phone number).
//
// Needs Web Crypto -> HTTPS or localhost (Vercel + dev server both qualify).
const KEY = 'ner_offline_creds_v2';
const LEGACY_KEY = 'ner_offline_cred';          // old single-account format, dropped on first save

export const OFFLINE_LOGIN_DAYS = 7;
const MAX_AGE_MS = OFFLINE_LOGIN_DAYS * 24 * 60 * 60 * 1000;

const enc = new TextEncoder();
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

const cryptoOk = () => typeof crypto !== 'undefined' && !!crypto.subtle;

// "+91 98765-43210", "09876543210" and "9876543210" are the same account.
const normPhone = (p) => {
  const digits = String(p || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

async function derive(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150000 }, key, 256);
  return toB64(bits);
}

function readStore() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

function writeStore(store) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

const isExpired = (entry) => !entry || typeof entry.savedAt !== 'number' || (Date.now() - entry.savedAt) > MAX_AGE_MS;

// Drop every entry older than 7 days. Safe to call any time.
export function pruneOfflineCreds() {
  try {
    const store = readStore();
    let changed = false;
    Object.keys(store).forEach((k) => { if (isExpired(store[k])) { delete store[k]; changed = true; } });
    if (changed) writeStore(store);
  } catch { /* ignore */ }
}

// session = the /auth/login response: { token, role, full_name }
// -> true if saved, false if not (reason is logged to the console)
export async function saveOfflineCred(phone, password, session) {
  if (!cryptoOk()) {
    console.warn('[offlineAuth] NOT saved: Web Crypto unavailable. Open the app over https:// or http://localhost (window.isSecureContext =', window.isSecureContext, ')');
    return false;
  }
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derive(password, salt);
    const store = readStore();
    store[normPhone(phone)] = { salt: toB64(salt), hash, session, savedAt: Date.now() };
    writeStore(store);
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
    pruneOfflineCreds();
    console.info('[offlineAuth] saved offline sign-in for', phone, `(valid ${OFFLINE_LOGIN_DAYS} days)`);
    return true;
  } catch (err) {
    console.warn('[offlineAuth] NOT saved:', err);
    return false;
  }
}

// -> { ok: true, session } or { ok: false, reason }
// reason: 'unsupported' | 'none' | 'other_account' | 'expired' | 'wrong_password'
export async function verifyOfflineCred(phone, password) {
  if (!cryptoOk()) return { ok: false, reason: 'unsupported' };
  try {
    const store = readStore();
    const keys = Object.keys(store);
    if (keys.length === 0) return { ok: false, reason: 'none' };

    const id = normPhone(phone);
    const entry = store[id];
    if (!entry) return { ok: false, reason: 'other_account' };

    if (isExpired(entry)) {
      delete store[id];
      writeStore(store);
      return { ok: false, reason: 'expired' };
    }

    const same = (await derive(password, fromB64(entry.salt))) === entry.hash;
    return same ? { ok: true, session: entry.session } : { ok: false, reason: 'wrong_password' };
  } catch { return { ok: false, reason: 'none' }; }
}

export const hasOfflineCred = () => {
  const store = readStore();
  return Object.values(store).some((e) => !isExpired(e));
};

// Wipes ALL saved offline sign-ins. Not called on normal logout any more
// (that is what made offline login stop working after signing out).
export const clearOfflineCred = () => {
  try { localStorage.removeItem(KEY); localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
};
