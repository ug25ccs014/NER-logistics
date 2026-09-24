import React from 'react';
import { useNavigation } from '../context/NavigationContext.jsx';
import MapView from './MapView.jsx';

export default function Workspace() {
  const { activeTool, goHome, goBack, canGoBack } = useNavigation();
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
            aria-label="Back to Dashboard"
            title={canGoBack ? 'Back to previous tool' : 'Back to Dashboard'}
          >
            ← {canGoBack ? 'Back' : 'Back to Dashboard'}
          </button>
          <span>{label}</span>
        </div>
        <Component />
      </div>
      {needsMap && <MapView />}
    </div>
  );
}
