import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';

// ============================================================
// Single source of truth for "who is logged in and as what".
//
// This now wraps a REAL login (see pages/LoginPage.jsx + api/auth.py:
// bcrypt-hashed passwords, JWT session token, a passkey gate for the
// two privileged roles). Everything below role/token bookkeeping is
// unchanged from before -- every feature still reads ROLE from this
// context, and there's still exactly one place role is decided.
// ============================================================

export const ROLE_LABELS = {
  driver: 'Driver',
  field_reporter: 'Field Reporter',
  authority: 'Authority / Government',
};

// The backend's `drivers/location` + `drivers/nearby` endpoints use
// 'driver' | 'field_official' as the role value. Map our app roles to
// that vocabulary in exactly one place, so nobody has to pick it
// manually again.
const API_ROLE_MAP = {
  driver: 'driver',
  field_reporter: 'field_official',
  authority: 'authority',
};

// The ACCOUNT role stored by /auth/register|login (api/auth.py's
// VALID_ROLES) uses the same 'field_official' spelling as the map
// above, but 'authority' isn't in API_ROLE_MAP (it never posts a
// live-location marker) -- so the account<->app role mapping needs
// its own pair of tables covering all three roles.
export const APP_ROLE_TO_ACCOUNT_ROLE = {
  driver: 'driver',
  field_reporter: 'field_official',
  authority: 'authority',
};
export const ACCOUNT_ROLE_TO_APP_ROLE = {
  driver: 'driver',
  field_official: 'field_reporter',
  authority: 'authority',
};

const AuthContext = createContext(null);

// "Remember me" support: a remembered session lives in localStorage
// (survives closing the browser); an un-remembered one lives in
// sessionStorage (cleared when the tab/browser closes). Reads check
// both so it doesn't matter which one a given field ended up in.
function readAuthField(key) {
  return localStorage.getItem(key) ?? sessionStorage.getItem(key) ?? '';
}

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(
    () => localStorage.getItem('ner_token') || sessionStorage.getItem('ner_token')
  );
  const [role, setRoleState] = useState(() => {
    const stored = localStorage.getItem('ner_role') || sessionStorage.getItem('ner_role');
    return ROLE_LABELS[stored] ? stored : null;
  });
  const [name, setName] = useState(() => readAuthField('ner_name'));
  const [phone, setPhone] = useState(() => readAuthField('ner_phone'));

  // Which storage new writes (name/phone updates, next login) go to.
  // Inferred from where the token we just loaded actually lives, so a
  // page refresh keeps behaving the way that session was started;
  // defaults to "remembered" (the old, always-localStorage behavior)
  // when there's no existing session to infer from yet.
  const rememberRef = useRef(
    !(sessionStorage.getItem('ner_token') && !localStorage.getItem('ner_token'))
  );

  // Chat/live-location/notifications/shipment-board all key off this id
  // server-side (see api/db.py), so it has to identify the ACCOUNT, not
  // the browser -- otherwise logging into the same account from a second
  // browser/device looks like a brand-new person with no history.
  //
  // Every account has a unique phone number (accounts.phone, enforced
  // in db.create_account), so it's a stable, always-available id to
  // derive session_id from -- no separate id needs to come back from
  // the login/register response. Prefixed so it can never collide with
  // a leftover random UUID from before this change.
  //
  // Before login there's no phone yet, so fall back to a random
  // per-browser id (same as before) purely so nothing reading
  // sessionId pre-auth breaks; every real feature that uses sessionId
  // only renders after login (see App.jsx), by which point `phone` is
  // set and this recomputes to the account-derived id.
  const [anonId] = useState(() => {
    let id = localStorage.getItem('ner_anon_id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('ner_anon_id', id);
    }
    return id;
  });
  const sessionId = useMemo(() => (phone ? `acct:${phone}` : anonId), [phone, anonId]);

  useEffect(() => {
    (rememberRef.current ? localStorage : sessionStorage).setItem('ner_name', name);
  }, [name]);

  useEffect(() => {
    (rememberRef.current ? localStorage : sessionStorage).setItem('ner_phone', phone);
  }, [phone]);

  // Called by LoginPage after a successful /auth/login or
  // /auth/register response. accountRole is the backend's spelling
  // ('driver' | 'field_official' | 'authority') -- translated to the
  // app's spelling once, here, so nothing downstream has to know the
  // difference.
  //
  // `remember` is the login form's "Remember me" checkbox: true keeps
  // the session in localStorage so it survives closing the browser and
  // reopening it (the whole point of the checkbox); false keeps it in
  // sessionStorage only, so it's gone as soon as the tab/browser closes.
  // Writing to one and clearing the other avoids a stale copy in the
  // un-chosen storage answering `readAuthField` on a later reload.
  const login = (
    { token: newToken, role: accountRole, full_name: fullName, phone: loggedInPhone },
    remember = true
  ) => {
    const appRole = ACCOUNT_ROLE_TO_APP_ROLE[accountRole] || null;
    rememberRef.current = remember;
    const store = remember ? localStorage : sessionStorage;
    const other = remember ? sessionStorage : localStorage;

    store.setItem('ner_token', newToken);
    other.removeItem('ner_token');
    if (appRole) { store.setItem('ner_role', appRole); other.removeItem('ner_role'); }
    if (fullName) { store.setItem('ner_name', fullName); other.removeItem('ner_name'); }
    if (loggedInPhone) { store.setItem('ner_phone', loggedInPhone); other.removeItem('ner_phone'); }

    setTokenState(newToken);
    setRoleState(appRole);
    if (fullName) setName(fullName);
    if (loggedInPhone) setPhone(loggedInPhone);
  };

  const logout = () => {
    localStorage.removeItem('ner_token');
    sessionStorage.removeItem('ner_token');
    localStorage.removeItem('ner_role');
    sessionStorage.removeItem('ner_role');
    setTokenState(null);
    setRoleState(null);
  };

  const value = useMemo(
    () => ({
      token,
      isAuthenticated: Boolean(token && role),
      role,
      roleLabel: role ? ROLE_LABELS[role] : null,
      apiRole: role ? API_ROLE_MAP[role] || null : null, // null for authority, which never posts a live-location marker
      login,
      logout,
      name,
      setName,
      phone,
      setPhone,
      sessionId,
    }),
    [token, role, name, phone, sessionId]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
