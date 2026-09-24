import React from 'react';

// Every tool tile gets a small looping SVG animation instead of a
// static emoji -- built by hand with CSS keyframes (see theme.css,
// ".icon-*" rules) so there's no external icon pack or image fetch
// involved, just inline SVG + CSS.
const ICONS = {
  route: (
    <svg viewBox="0 0 48 48" className="anim-icon">
      <circle cx="10" cy="38" r="4" fill="var(--good)" />
      <circle cx="38" cy="10" r="4" fill="var(--accent)" />
      <path
        className="icon-route-path"
        d="M10 38 C 18 38, 18 24, 24 24 S 34 10, 38 10"
        fill="none"
        stroke="var(--muted)"
        strokeWidth="3"
        strokeDasharray="4 5"
        strokeLinecap="round"
      />
      <circle className="icon-route-dot" r="3.2" fill="var(--warn)">
        <animateMotion
          dur="2.4s"
          repeatCount="indefinite"
          path="M10 38 C 18 38, 18 24, 24 24 S 34 10, 38 10"
        />
      </circle>
    </svg>
  ),
  report: (
    <svg viewBox="0 0 48 48" className="anim-icon">
      <rect x="12" y="7" width="24" height="34" rx="4" fill="var(--panel-alt)" stroke="var(--border)" strokeWidth="2" />
      <rect x="18" y="4" width="12" height="6" rx="2" fill="var(--muted)" />
      <line x1="17" y1="19" x2="31" y2="19" stroke="var(--muted)" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="17" y1="25" x2="31" y2="25" stroke="var(--muted)" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="17" y1="31" x2="26" y2="31" stroke="var(--muted)" strokeWidth="2.4" strokeLinecap="round" />
      <circle className="icon-pulse-ring" cx="34" cy="12" r="5" fill="none" stroke="var(--warn)" strokeWidth="2" />
      <circle cx="34" cy="12" r="2.6" fill="var(--warn)" />
    </svg>
  ),
  sos: (
    <svg viewBox="0 0 48 48" className="anim-icon">
      <circle className="icon-pulse-ring" cx="24" cy="24" r="9" fill="none" stroke="var(--danger)" strokeWidth="2.5" />
      <circle className="icon-pulse-ring icon-pulse-ring-delay" cx="24" cy="24" r="9" fill="none" stroke="var(--danger)" strokeWidth="2.5" />
      <circle cx="24" cy="24" r="7" fill="var(--danger)" />
      <text x="24" y="28" textAnchor="middle" fontSize="8" fontWeight="700" fill="white">SOS</text>
    </svg>
  ),
  bed: (
    <svg viewBox="0 0 48 48" className="anim-icon icon-float">
      <rect x="8" y="26" width="32" height="10" rx="2" fill="var(--panel-alt)" stroke="var(--border)" strokeWidth="2" />
      <rect x="10" y="20" width="12" height="8" rx="2" fill="var(--accent)" opacity="0.85" />
      <line x1="8" y1="36" x2="8" y2="41" stroke="var(--muted)" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="40" y1="36" x2="40" y2="41" stroke="var(--muted)" strokeWidth="2.4" strokeLinecap="round" />
      <text x="30" y="14" className="icon-zzz" fontSize="9" fill="var(--muted)">z</text>
      <text x="35" y="9" className="icon-zzz icon-zzz-delay" fontSize="7" fill="var(--muted)">z</text>
    </svg>
  ),
  box: (
    <svg viewBox="0 0 48 48" className="anim-icon icon-sway">
      <path d="M24 6 L40 14 V33 L24 41 L8 33 V14 Z" fill="var(--panel-alt)" stroke="var(--border)" strokeWidth="2" />
      <path d="M8 14 L24 22 L40 14" fill="none" stroke="var(--border)" strokeWidth="2" />
      <line x1="24" y1="22" x2="24" y2="41" stroke="var(--border)" strokeWidth="2" />
      <path d="M16 10 L24 14" stroke="var(--good)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 48 48" className="anim-icon">
      <path d="M8 12 h32 a3 3 0 0 1 3 3 v14 a3 3 0 0 1 -3 3 H20 l-8 7 v-7 h-4 a3 3 0 0 1 -3 -3 v-14 a3 3 0 0 1 3 -3 Z" fill="var(--panel-alt)" stroke="var(--border)" strokeWidth="2" />
      <circle className="icon-dot-1" cx="17" cy="21" r="2.4" fill="var(--accent)" />
      <circle className="icon-dot-2" cx="24" cy="21" r="2.4" fill="var(--accent)" />
      <circle className="icon-dot-3" cx="31" cy="21" r="2.4" fill="var(--accent)" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 48 48" className="anim-icon">
      <path className="icon-glow" d="M24 6 L44 40 H4 Z" fill="var(--warn)" opacity="0.9" />
      <line x1="24" y1="20" x2="24" y2="29" stroke="#1e293b" strokeWidth="3" strokeLinecap="round" />
      <circle cx="24" cy="34" r="1.8" fill="#1e293b" />
    </svg>
  ),
  network: (
    <svg viewBox="0 0 48 48" className="anim-icon">
      <line x1="12" y1="12" x2="24" y2="24" stroke="var(--muted)" strokeWidth="2" />
      <line x1="36" y1="12" x2="24" y2="24" stroke="var(--muted)" strokeWidth="2" />
      <line x1="12" y1="36" x2="24" y2="24" stroke="var(--muted)" strokeWidth="2" />
      <line x1="36" y1="36" x2="24" y2="24" stroke="var(--muted)" strokeWidth="2" />
      <circle className="icon-pulse-node" cx="12" cy="12" r="4" fill="var(--good)" />
      <circle className="icon-pulse-node icon-pulse-node-delay" cx="36" cy="12" r="4" fill="var(--warn)" />
      <circle className="icon-pulse-node" cx="12" cy="36" r="4" fill="var(--danger)" />
      <circle className="icon-pulse-node icon-pulse-node-delay" cx="36" cy="36" r="4" fill="var(--good)" />
      <circle cx="24" cy="24" r="5" fill="var(--accent)" />
    </svg>
  ),
  truck: (
    <svg viewBox="0 0 48 48" className="anim-icon">
      <g className="icon-drive">
        <rect x="4" y="18" width="22" height="12" rx="2" fill="var(--panel-alt)" stroke="var(--border)" strokeWidth="2" />
        <path d="M26 21 h9 l6 6 v3 h-15 Z" fill="var(--panel-alt)" stroke="var(--border)" strokeWidth="2" />
        <circle className="icon-wheel" cx="13" cy="32" r="4" fill="#1e293b" stroke="var(--muted)" strokeWidth="2" />
        <circle className="icon-wheel" cx="33" cy="32" r="4" fill="#1e293b" stroke="var(--muted)" strokeWidth="2" />
      </g>
      <line x1="2" y1="38" x2="46" y2="38" stroke="var(--border)" strokeWidth="2" strokeDasharray="3 4" />
    </svg>
  ),
};

export default function AnimatedIcon({ type }) {
  return ICONS[type] || ICONS.route;
}
