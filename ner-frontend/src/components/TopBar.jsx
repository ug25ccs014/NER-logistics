import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigation } from '../context/NavigationContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

export default function TopBar() {
  const { role, roleLabel, name, logout } = useAuth();
  const { activeTool, goHome, goBack, goForward, canGoBack, canGoForward } = useNavigation();
  const { t } = useLanguage();

  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="nav-controls">
          <button
            type="button"
            className="nav-btn"
            onClick={() => (canGoBack ? goBack() : goHome())}
            disabled={!activeTool}
            title={t('nav_back')}
            aria-label={t('nav_back')}
          >
            ←
          </button>
          <button
            type="button"
            className="nav-btn"
            onClick={goForward}
            disabled={!canGoForward}
            title={t('nav_forward')}
            aria-label={t('nav_forward')}
          >
            →
          </button>
        </div>
        <div className="topbar-title">
          <strong>{t('brand_name')}</strong>
          <div className="topbar-breadcrumb">
            <span className={`crumb ${!activeTool ? 'crumb-current' : ''}`} onClick={goHome}>
              {t('breadcrumb_home')}
            </span>
            {activeTool && (
              <>
                <span className="crumb-sep">›</span>
                <span className="crumb crumb-current">{activeTool.label}</span>
              </>
            )}
            <span className="topbar-subtitle">{t(`topbar_subtitle_${role}`)}</span>
          </div>
        </div>
      </div>
      <div className="topbar-right">
        {/* Language is chosen once on the landing page (see
            LanguageContext + LandingPage) -- no need to ask again
            here, it's already in effect app-wide via localStorage. */}
        <div className="role-pill" title={roleLabel}>
          <span>{name || t('account_fallback')}</span>
          <span style={{ opacity: 0.65, marginLeft: 6, fontWeight: 400 }}>· {roleLabel}</span>
        </div>
        <span className="logout-link" onClick={logout}>{t('log_out')}</span>
      </div>
    </div>
  );
}
