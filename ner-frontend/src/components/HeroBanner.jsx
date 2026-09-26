import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

// Purely decorative, hand-drawn SVG (hills + a looping road + a
// driving truck) -- no external image/icon pack, just inline SVG and
// CSS keyframes, so it renders the same with or without a network.
export default function HeroBanner() {
  const { role } = useAuth();
  const { t } = useLanguage();
  const key = role || 'driver';
  const title = t(`hero_greeting_${key}_title`);
  const subtitle = t(`hero_greeting_${key}_subtitle`);
  return (
    <div className="hero-banner">
      <div className="hero-text">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <svg className="hero-svg" viewBox="0 0 320 120" preserveAspectRatio="xMidYMax slice">
        <path d="M0 90 Q 60 40 130 80 T 320 70 V120 H0 Z" fill="var(--panel-alt)" />
        <path d="M0 100 Q 80 70 170 95 T 320 90 V120 H0 Z" fill="var(--panel)" />
        <path className="hero-cloud hero-cloud-a" d="M30 24 a10 10 0 1 1 0.1 0 Z M22 28 a7 7 0 1 1 0.1 0 Z M40 28 a7 7 0 1 1 0.1 0 Z" fill="#245477" opacity="0.6" />
        <path className="hero-cloud hero-cloud-b" d="M210 16 a8 8 0 1 1 0.1 0 Z M203 19 a6 6 0 1 1 0.1 0 Z M219 19 a6 6 0 1 1 0.1 0 Z" fill="#245477" opacity="0.5" />
        <path d="M-20 104 Q 80 78 170 100 T 340 90" fill="none" stroke="var(--border)" strokeWidth="10" strokeLinecap="round" />
        <path d="M-20 104 Q 80 78 170 100 T 340 90" fill="none" stroke="#fbbf24" strokeWidth="2" strokeDasharray="8 10" opacity="0.8" />
        <g className="hero-truck">
          <rect x="0" y="-16" width="26" height="14" rx="2" fill="var(--accent)" />
          <path d="M26 -13 h10 l7 7 v6 h-17 Z" fill="var(--accent)" />
          <circle cx="8" cy="0" r="4.5" fill="#173A59" stroke="#18324A" strokeWidth="1.5" />
          <circle cx="30" cy="0" r="4.5" fill="#173A59" stroke="#18324A" strokeWidth="1.5" />
        </g>
      </svg>
    </div>
  );
}
