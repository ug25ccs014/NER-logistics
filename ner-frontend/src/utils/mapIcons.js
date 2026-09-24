import L from 'leaflet';

// One marker per distinct risky STRETCH of a route (not per chunk) --
// sized/colored by severity. Kept separate from geo.js since it needs
// Leaflet, which only exists in the browser.
export function riskLevelIcon(level) {
  const style = {
    moderate: { size: 18, bg: '#eab308', symbol: '!' },
    high: { size: 24, bg: '#f97316', symbol: '⚠' },
    severe: { size: 28, bg: '#dc2626', symbol: '⚠' },
  }[level];
  if (!style) return null;
  return L.divIcon({
    className: '',
    html: `<div style="background:${style.bg}; width:${style.size}px; height:${style.size}px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 1px 4px rgba(0,0,0,0.5); font-size:${style.size - 14}px; font-weight:bold; color:white;">${style.symbol}</div>`,
    iconSize: [style.size, style.size],
    iconAnchor: [style.size / 2, style.size / 2],
  });
}

// Green pulsing dot = your ACTUAL real device GPS (used by "Start Ride"
// and kept running as an overlay during a simulated ride too).
export function pulsingDotIcon() {
  return L.divIcon({
    className: '',
    html: `<div class="live-dot"><div class="dot-pulse"></div><div class="dot-core"></div></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

// Blue marker = the SIMULATED position marching along the route --
// deliberately distinct from the green real-GPS dot.
export function simPositionIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="width:16px; height:16px; border-radius:50%; background:#3b82f6; border:2px solid white; box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}
