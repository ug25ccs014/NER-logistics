import L from 'leaflet';

// One marker per distinct risky STRETCH of a route (not per chunk) --
// sized/colored by severity. Kept separate from geo.js since it needs
// Leaflet, which only exists in the browser.
export function riskLevelIcon(level) {
  const style = {
    moderate: { size: 18, bg: '#F2C94C', symbol: '!' },
    high: { size: 24, bg: '#F07C61', symbol: '⚠' },
    severe: { size: 28, bg: '#D9534F', symbol: '⚠' },
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
    html: `<div style="width:16px; height:16px; border-radius:50%; background:#3F7FD6; border:2px solid white; box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

// Shared "here's where you are" marker for every feature that extracts
// the user's current GPS position (Nearby Accommodations, SOS/nearby
// help, Road Identity, ...). There is only one Leaflet map in this
// app, so this is a module-level singleton rather than a per-feature
// marker -- switching between tools moves the same blinking dot to
// your latest known position instead of stacking up a new one per
// tool you've visited.
let _currentLocationMarker = null;
export function placeCurrentLocationMarker(map, lat, lon) {
  if (!map) return _currentLocationMarker;
  if (_currentLocationMarker) {
    _currentLocationMarker.setLatLng([lat, lon]);
  } else {
    _currentLocationMarker = L.marker([lat, lon], { icon: pulsingDotIcon(), zIndexOffset: 1000 }).addTo(map);
  }
  return _currentLocationMarker;
}
