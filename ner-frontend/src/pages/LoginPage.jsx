import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../api.js';
import { useAuth, APP_ROLE_TO_ACCOUNT_ROLE, ROLE_LABELS } from '../context/AuthContext.jsx';
import '../styles/landing.css';

// Roles that need the extra org passkey to register as -- mirrors
// api/auth.py's PRIVILEGED_ROLES, expressed in the app's own role
// spelling (field_reporter, not field_official).
const PRIVILEGED_APP_ROLES = new Set(['field_reporter', 'authority']);

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('driver');
  const [passkey, setPasskey] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const needsPasskey = mode === 'register' && PRIVILEGED_APP_ROLES.has(role);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = mode === 'login'
        ? await api.login(phone.trim(), password, rememberMe)
        : await api.register({
            fullName: fullName.trim(),
            phone: phone.trim(),
            password,
            role: APP_ROLE_TO_ACCOUNT_ROLE[role],
            passkey: needsPasskey ? passkey.trim() : undefined,
            rememberMe,
          });
      login({ ...result, phone: phone.trim(), remember_me: rememberMe });
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="landing-glow" />
      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <h2>🛣️ NER Logistics Intelligence</h2>
        <p className="auth-sub">
          {mode === 'login' ? 'Sign in to your account' : 'Create an account to get started'}
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError(null); }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => { setMode('register'); setError(null); }}
          >
            Create account
          </button>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={submit}>
          {mode === 'register' && (
            <div className="auth-field">
              <label>Full name</label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
              />
            </div>
          )}

          <div className="auth-field">
            <label>Phone number</label>
            <input
              required
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="9xxxxxxxxx"
            />
          </div>

          <div className="auth-field">
            <label>Password</label>
            <input
              required
              type="password"
              minLength={mode === 'register' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
            />
          </div>

          {mode === 'login' && (
            <label className="auth-remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember me on this browser</span>
            </label>
          )}

          {mode === 'register' && (
            <div className="auth-field">
              <label>I am a...</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {Object.entries(ROLE_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </div>
          )}

          {needsPasskey && (
            <>
              <div className="auth-field">
                <label>Organization passkey</label>
                <input
                  required
                  value={passkey}
                  onChange={(e) => setPasskey(e.target.value)}
                  placeholder="Provided by your department"
                />
              </div>
              <div className="auth-passkey-note">
                Field official and authority accounts need a passkey issued by your
                department to prevent unverified sign-ups from getting elevated access.
              </div>
            </>
          )}

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <Link to="/" className="auth-back">← Back to home</Link>
      </motion.div>
    </div>
  );
}
