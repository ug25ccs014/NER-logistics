import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function RoleLogin() {
  const { setRole } = useAuth();

  return (
    <div className="role-overlay">
      <div className="role-card">
        <h2>🛣️ NER Logistics Intelligence</h2>
        <div className="subtitle">Who's signing in?</div>
        <button className="role-btn" onClick={() => setRole('driver')}>
          <span className="role-name">🚚 Driver</span>
          <span className="role-desc">Route planning, live risk, SOS, report issues</span>
        </button>
        <button className="role-btn" onClick={() => setRole('field_reporter')}>
          <span className="role-name">📍 Field Reporter</span>
          <span className="role-desc">Ground reporting & ground coordination</span>
        </button>
        <button className="role-btn" onClick={() => setRole('authority')}>
          <span className="role-name">🏛️ Authority / Government</span>
          <span className="role-desc">District oversight, verification & alerts</span>
        </button>
      </div>
    </div>
  );
}
