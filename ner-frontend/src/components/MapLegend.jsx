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
        background: 'rgba(15, 23, 42, 0.92)', border: '1px solid rgba(255,255,255,0.25)',
        borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#FFFFFF',
        textShadow: '0 1px 2px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3F7FD6', display: 'inline-block', border: '1px solid #fff' }} />
        {t('map_no_data')}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            width: 120, height: 10, borderRadius: 5, display: 'inline-block',
            background: 'linear-gradient(90deg, rgb(34,197,94) 0%, rgb(234,179,8) 35%, rgb(249,115,22) 65%, rgb(220,38,38) 100%)',
            border: '1px solid rgba(255,255,255,0.6)',
          }}
        />
        {t('map_low_severe')}
      </div>
    </div>
  );
}
