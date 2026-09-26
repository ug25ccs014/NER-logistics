import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';

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

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => localStorage.getItem('ner_token') || sessionStorage.getItem('ner_token'));
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('ner_remember_me') === 'true');
  const [role, setRoleState] = useState(() => {
    const stored = localStorage.getItem('ner_role') || sessionStorage.getItem('ner_role');
    return ROLE_LABELS[stored] ? stored : null;
  });
  const [name, setName] = useState(() => localStorage.getItem('ner_name') || sessionStorage.getItem('ner_name') || '');
  const [phone, setPhone] = useState(() => localStorage.getItem('ner_phone') || sessionStorage.getItem('ner_phone') || '');

  // Stable per-browser-session id, used so a driver's own marker can
  // be excluded from "who's nearby" queries.
  const [sessionId] = useState(() => {
    let id = localStorage.getItem('ner_session_id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('ner_session_id', id);
    }
    return id;
  });

  useEffect(() => {
    localStorage.setItem('ner_name', name);
  }, [name]);

  useEffect(() => {
    localStorage.setItem('ner_phone', phone);
  }, [phone]);

  // Called by LoginPage after a successful /auth/login or
  // /auth/register response. accountRole is the backend's spelling
  // ('driver' | 'field_official' | 'authority') -- translated to the
  // app's spelling once, here, so nothing downstream has to know the
  // difference.
  const login = ({ token: newToken, role: accountRole, full_name: fullName, phone: loggedInPhone, remember_me: shouldRemember = false }) => {
    const appRole = ACCOUNT_ROLE_TO_APP_ROLE[accountRole] || null;
    // A remembered login survives browser restarts. A normal login only
    // lives in the current browser session. Clear the other storage so a
    // previous remembered login cannot accidentally keep the user signed in.
    localStorage.removeItem('ner_token');
    localStorage.removeItem('ner_role');
    localStorage.removeItem('ner_name');
    localStorage.removeItem('ner_phone');
    sessionStorage.removeItem('ner_token');
    sessionStorage.removeItem('ner_role');
    sessionStorage.removeItem('ner_name');
    sessionStorage.removeItem('ner_phone');

    const storage = shouldRemember ? localStorage : sessionStorage;
    storage.setItem('ner_token', newToken);
    if (appRole) storage.setItem('ner_role', appRole);
    if (fullName) storage.setItem('ner_name', fullName);
    if (loggedInPhone) storage.setItem('ner_phone', loggedInPhone);
    if (shouldRemember) localStorage.setItem('ner_remember_me', 'true');
    else localStorage.removeItem('ner_remember_me');

    setRememberMe(Boolean(shouldRemember));
    setTokenState(newToken);
    setRoleState(appRole);
    if (fullName) setName(fullName);
    if (loggedInPhone) setPhone(loggedInPhone);
  };

  const logout = () => {
    localStorage.removeItem('ner_token');
    localStorage.removeItem('ner_role');
    localStorage.removeItem('ner_name');
    localStorage.removeItem('ner_phone');
    localStorage.removeItem('ner_remember_me');
    sessionStorage.removeItem('ner_token');
    sessionStorage.removeItem('ner_role');
    sessionStorage.removeItem('ner_name');
    sessionStorage.removeItem('ner_phone');
    setTokenState(null);
    setRoleState(null);
    setRememberMe(false);
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
      rememberMe,
    }),
    [token, role, name, phone, sessionId, rememberMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
