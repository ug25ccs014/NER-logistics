import React from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';

// Ported from the original app's .legend div -- explains what the
// route/segment colors mean. Sits over the map, bottom-left.
export default function MapLegend() {
  const { t } = useLanguage();
  return (
    <div
      style={{
        position: 'absolute', bottom: 16, left: 16, zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.92)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--text)',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3F7FD6', display: 'inline-block' }} />
        {t('map_no_data')}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            width: 120, height: 10, borderRadius: 5, display: 'inline-block',
            background: 'linear-gradient(90deg, #2F9C84 0%, #F2C94C 35%, #F07C61 65%, #D9534F 100%)',
          }}
        />
        {t('map_low_severe')}
      </div>
    </div>
  );
}
