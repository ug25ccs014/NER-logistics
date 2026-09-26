import React from 'react';
import { useNavigation } from '../context/NavigationContext.jsx';
import MapView from './MapView.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

export default function Workspace() {
  const { activeTool, goHome, goBack, canGoBack } = useNavigation();
  const { t } = useLanguage();
  if (!activeTool) return null;

  const { Component, needsMap, label } = activeTool;

  const handleBack = () => {
    if (canGoBack) goBack();
    else goHome();
  };

  return (
    <div className={`workspace ${needsMap ? 'workspace--split' : 'workspace--full'}`}>
      <div className="workspace-panel">
        <div className="workspace-panel-title">
          <button
            type="button"
            className="workspace-back-btn"
            onClick={handleBack}
            aria-label={t('workspace_back_dashboard')}
            title={canGoBack ? t('workspace_back_previous') : t('workspace_back_dashboard')}
          >
            ← {canGoBack ? t('nav_back') : t('workspace_back_dashboard')}
          </button>
          <span>{label}</span>
        </div>
        <Component />
      </div>
      {needsMap && <MapView />}
    </div>
  );
}
