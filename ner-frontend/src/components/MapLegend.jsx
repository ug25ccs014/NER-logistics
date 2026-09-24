import React from 'react';

// Ported from the original app's .legend div -- explains what the
// route/segment colors mean. Sits over the map, bottom-left.
export default function MapLegend() {
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
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />
        No data
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            width: 120, height: 10, borderRadius: 5, display: 'inline-block',
            background: 'linear-gradient(90deg, #22c55e 0%, #eab308 35%, #f97316 65%, #dc2626 100%)',
          }}
        />
        Low risk &rarr; Severe
      </div>
    </div>
  );
}
