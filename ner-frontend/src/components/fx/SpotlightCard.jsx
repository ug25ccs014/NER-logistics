import React, { useRef } from 'react';

// Reactbits-style "Spotlight Card": a glass panel with a soft radial
// highlight that follows the cursor, plus a gentle lift on hover.
// Deliberately no 3D tilt here (TiltCard already covers that trick
// elsewhere) -- the design spec calls for restrained motion, and a
// GIS feature grid reads calmer as a flat glass surface that glows
// under the pointer than as a rotating card.
export default function SpotlightCard({ children, className = '', spotlightColor = 'rgba(34, 211, 238, 0.16)' }) {
  const ref = useRef(null);

  const onMouseMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--sx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--sy', `${e.clientY - rect.top}px`);
  };

  return (
    <div
      ref={ref}
      className={`spotlight-card ${className}`}
      onMouseMove={onMouseMove}
      style={{ '--spotlight-color': spotlightColor }}
    >
      <div className="spotlight-card-glow" aria-hidden="true" />
      <div className="spotlight-card-body">{children}</div>
    </div>
  );
}
