import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

export default function RoleLogin() {
  const { setRole } = useAuth();
  const { t } = useLanguage();

  return (
    <div className="role-overlay">
      <div className="role-card">
        <h2>🛣️ NER Logistics Intelligence</h2>
        <div className="subtitle">{t('role_prompt')}</div>
        <button className="role-btn" onClick={() => setRole('driver')}>
          <span className="role-name">🚚 {t('role_driver')}</span>
          <span className="role-desc">{t('role_driver_desc')}</span>
        </button>
        <button className="role-btn" onClick={() => setRole('field_reporter')}>
          <span className="role-name">📍 {t('role_field_official')}</span>
          <span className="role-desc">{t('role_reporter_desc')}</span>
        </button>
        <button className="role-btn" onClick={() => setRole('authority')}>
          <span className="role-name">🏛️ {t('role_authority')}</span>
          <span className="role-desc">{t('role_authority_desc')}</span>
        </button>
      </div>
    </div>
  );
}
