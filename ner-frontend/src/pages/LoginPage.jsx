import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../api.js';
import { saveOfflineCred, verifyOfflineCred, hasOfflineCred, OFFLINE_LOGIN_DAYS } from '../utils/offlineAuth.js';
import { useAuth, APP_ROLE_TO_ACCOUNT_ROLE, ROLE_LABELS } from '../context/AuthContext.jsx';
import { useLanguage, LANGUAGES } from '../context/LanguageContext.jsx';
import '../styles/landing.css';

const PRIVILEGED_APP_ROLES = new Set(['field_reporter', 'authority']);

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const [mode, setMode] = useState('login');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('driver');
  const [passkey, setPasskey] = useState('');
  const [remember, setRemember] = useState(true); // offline-first app: stay signed in by default
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const needsPasskey = mode === 'register' && PRIVILEGED_APP_ROLES.has(role);

  // Try the saved on-device sign-in. Returns true if the person was let in.
  const tryOfflineLogin = async (p) => {
    const r = await verifyOfflineCred(p, password);
    if (r.ok) {
      login({ ...r.session, phone: p }, remember);
      navigate('/app', { replace: true });
      return true;
    }
    setError({
      none: 'You are offline, and this device has no saved sign-in yet. Sign in once while online to enable offline sign-in.',
      other_account: 'You are offline. This phone number has not signed in on this device before. Use a number that has, or sign in online.',
      expired: `Your offline sign-in on this device expired (it lasts ${OFFLINE_LOGIN_DAYS} days). Connect to the internet and sign in once to renew it.`,
      wrong_password: 'You are offline, and the password does not match the one saved on this device.',
      unsupported: 'Offline sign-in needs a secure page. Open the app over https:// (or http://localhost), not a plain http:// address.',
    }[r.reason]);
    return false;
  };

  // "Server unreachable" = no connection, a hung request, or the host/gateway answering 502-504
  // (e.g. Render waking up). A real 401 "wrong password" is NOT one of these.
  const isUnreachable = (err) => err?.isNetworkError || [502, 503, 504].includes(err?.status);

  const submit = async (e) => {
    e.preventDefault(); setError(null); setBusy(true);
    const p = phone.trim();
    try {
      // Browser already knows it has no connection -> don't wait for a request to fail.
      if (mode === 'login' && typeof navigator !== 'undefined' && navigator.onLine === false) {
        await tryOfflineLogin(p);
        return;
      }

      let attempt = mode === 'login'
        ? api.login(p, password)
        : api.register({ fullName: fullName.trim(), phone: p, password,
            role: APP_ROLE_TO_ACCOUNT_ROLE[role], passkey: needsPasskey ? passkey.trim() : undefined });

      // Weak signal: a request can hang for a long time. If this device has a saved sign-in,
      // stop waiting after 15 s and use it instead of leaving the person on "please wait".
      if (mode === 'login' && hasOfflineCred()) {
        attempt = Promise.race([
          attempt,
          new Promise((_, reject) => setTimeout(() => {
            const te = new Error('Request timed out'); te.isNetworkError = true; reject(te);
          }, 15000)),
        ]);
      }

      const result = await attempt;
      // Remember this device so the same account can sign in later with no signal (valid 7 days).
      if (mode === 'login') await saveOfflineCred(p, password, result);
      login({ ...result, phone: p }, mode === 'login' ? remember : true);
      navigate('/app', { replace: true });
    } catch (err) {
      // No connection / server unreachable: fall back to the sign-in saved by a previous online login.
      if (mode === 'login' && isUnreachable(err)) {
        await tryOfflineLogin(p);
        return;
      }
      setError(err.message);
    } finally { setBusy(false); }
  };

  const roleLabelKey = { driver: 'role_driver', field_reporter: 'role_field_official', authority: 'role_authority' };

  return (
    <div className="auth-page">
      <div className="auth-backdrop" />
      <div className="auth-layout">
        <motion.div className="auth-visual" initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .7 }}>
          <Link to="/" className="brand-lockup auth-brand">
            <span className="brand-mark">EZ</span><span><strong>{t('brand_name')}</strong><small>{t('brand_tagline')}</small></span>
          </Link>
          <div className="auth-visual-copy">
            <div className="eyebrow"><span className="pulse-dot" /> {t('login_field_network')}</div>
            <h1>{t('login_visual_title')}</h1>
            <p>{t('login_visual_desc')}</p>
          </div>
          <div className="auth-signal-board" aria-hidden="true">
            <div className="signal-route"><span className="signal-car" /><i className="signal-node signal-node-a" /><i className="signal-node signal-node-b" /><i className="signal-node signal-node-c" /></div>
            <div className="signal-readout"><span>{t('login_live_network')}</span><b>●</b><small>{t('login_live_status')}</small></div>
            <div className="signal-readout"><span>{t('login_road_risk')}</span><b>LOW</b><small>{t('login_risk_status')}</small></div>
            <div className="signal-readout"><span>{t('login_field_reports')}</span><b>24/7</b><small>{t('login_field_status')}</small></div>
          </div>
          <div className="auth-meta"><span>{t('login_live_network')}</span><span>•</span><span>{t('login_road_risk')}</span><span>•</span><span>{t('login_field_reports')}</span></div>
        </motion.div>

        <motion.div className="auth-card" initial={{ opacity: 0, y: 24, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .55, delay: .08 }}>
          <div className="auth-card-top">
            <span className="auth-mini-label">{mode === 'login' ? t('login_access_label') : t('login_register_label')}</span>
            <label className="language-control auth-language"><span>文</span><select value={lang} onChange={(e) => setLang(e.target.value)}>{LANGUAGES.map(([code,label]) => <option key={code} value={code}>{label}</option>)}</select></label>
          </div>
          <h2>{t(mode === 'login' ? 'login_title' : 'register_title')}</h2>
          <p className="auth-sub">{t('brand_name')} · {t('region_name')}</p>

          <div className="auth-tabs">
            <button type="button" className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setError(null); }}>{t('sign_in')}</button>
            <button type="button" className={`auth-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => { setMode('register'); setError(null); }}>{t('create_account_tab')}</button>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={submit}>
            {mode === 'register' && <div className="auth-field"><label>{t('full_name')}</label><input required value={fullName} onChange={e=>setFullName(e.target.value)} placeholder={t('full_name_ph')} /></div>}
            <div className="auth-field"><label>{t('phone_number')}</label><input required type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="9xxxxxxxxx" /></div>
            <div className="auth-field"><label>{t('password')}</label><input required type="password" minLength={mode === 'register' ? 8 : undefined} value={password} onChange={e=>setPassword(e.target.value)} placeholder={t(mode === 'register' ? 'password_ph_register' : 'password_ph_login')} /></div>
            {mode === 'register' && <div className="auth-field"><label>{t('role_prompt')}</label><select value={role} onChange={e=>setRole(e.target.value)}>{Object.keys(ROLE_LABELS).map(v=><option key={v} value={v}>{t(roleLabelKey[v])}</option>)}</select></div>}
            {needsPasskey && <><div className="auth-field"><label>{t('passkey_label')}</label><input required value={passkey} onChange={e=>setPasskey(e.target.value)} placeholder={t('passkey_ph')} /></div><div className="auth-passkey-note">{t('passkey_note')}</div></>}
            {mode === 'login' && (
              <label className="auth-remember">
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                <span>{t('remember_me')}</span>
              </label>
            )}
            <button className="auth-submit" type="submit" disabled={busy}>{busy ? t('please_wait') : mode === 'login' ? t('sign_in') : t('create_account_tab')} <span>→</span></button>
          </form>
          <Link to="/" className="auth-back">{t('back_to_home')}</Link>
        </motion.div>
      </div>
    </div>
  );
}
