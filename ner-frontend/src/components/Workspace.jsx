import React from 'react';
import { useNavigation } from '../context/NavigationContext.jsx';
import MapView from './MapView.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { usePlan } from '../context/PlanContext.jsx';
import UpgradeGate from './UpgradeGate.jsx';
import { TOOL_FEATURE } from '../config/plans.js';

export default function Workspace() {
  const { activeTool, goHome, goBack, canGoBack } = useNavigation();
  const { t } = useLanguage();
  const { can } = usePlan();
  if (!activeTool) return null;

  const { Component, label } = activeTool;
  const feature = TOOL_FEATURE[activeTool.id];
  const locked = Boolean(feature) && !can(feature);
  // A locked tool never needs the map: show the upgrade prompt full-width.
  const needsMap = locked ? false : activeTool.needsMap;

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
        {locked ? <UpgradeGate feature={feature} toolLabel={label} /> : <Component />}
      </div>
      {needsMap && <MapView />}
    </div>
  );
}
