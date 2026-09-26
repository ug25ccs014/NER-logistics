import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../api.js';
import { useAuth, APP_ROLE_TO_ACCOUNT_ROLE, ROLE_LABELS } from '../context/AuthContext.jsx';
import { useLanguage, LANGUAGES } from '../context/LanguageContext.jsx';
import '../styles/landing.css';

// Roles that need the extra org passkey to register as -- mirrors
// api/auth.py's PRIVILEGED_ROLES, expressed in the app's own role
// spelling (field_reporter, not field_official).
const PRIVILEGED_APP_ROLES = new Set(['field_reporter', 'authority']);

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('driver');
  const [passkey, setPasskey] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const needsPasskey = mode === 'register' && PRIVILEGED_APP_ROLES.has(role);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = mode === 'login'
        ? await api.login(phone.trim(), password)
        : await api.register({
            fullName: fullName.trim(),
            phone: phone.trim(),
            password,
            role: APP_ROLE_TO_ACCOUNT_ROLE[role],
            passkey: needsPasskey ? passkey.trim() : undefined,
          });
      login({ ...result, phone: phone.trim() });
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="landing-terrain" />
      <div className="landing-glow" />

      <select
        className="landing-lang-select auth-lang-select"
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        title="Language / भाषा / ভাষা"
      >
        {LANGUAGES.map(([code, label]) => (
          <option key={code} value={code}>{label}</option>
        ))}
      </select>

      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <h2>🛣️ {t('brand_name')}</h2>
        <p className="auth-sub">
          {mode === 'login' ? t('login_title') : t('register_title')}
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError(null); }}
          >
            {t('sign_in')}
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => { setMode('register'); setError(null); }}
          >
            {t('create_account_tab')}
          </button>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={submit}>
          {mode === 'register' && (
            <div className="auth-field">
              <label>{t('full_name')}</label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('full_name_ph')}
              />
            </div>
          )}

          <div className="auth-field">
            <label>{t('phone_number')}</label>
            <input
              required
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="9xxxxxxxxx"
            />
          </div>

          <div className="auth-field">
            <label>{t('password')}</label>
            <input
              required
              type="password"
              minLength={mode === 'register' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? t('password_ph_register') : t('password_ph_login')}
            />
          </div>

          {mode === 'register' && (
            <div className="auth-field">
              <label>{t('role_prompt')}</label>
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
                <label>{t('passkey_label')}</label>
                <input
                  required
                  value={passkey}
                  onChange={(e) => setPasskey(e.target.value)}
                  placeholder={t('passkey_ph')}
                />
              </div>
              <div className="auth-passkey-note">
                {t('passkey_note')}
              </div>
            </>
          )}

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? t('please_wait') : mode === 'login' ? t('sign_in') : t('create_account_tab')}
          </button>
        </form>

        <Link to="/" className="auth-back">{t('back_to_home')}</Link>
      </motion.div>
    </div>
  );
}
