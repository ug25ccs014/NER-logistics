import React, { useMemo } from 'react';

// Reactbits-style "Topography": faint animated contour lines, evoking
// a GIS elevation map. Used as a quiet texture behind the closing CTA
// section -- generated once per mount (useMemo) rather than reflowing
// random paths every render.
export default function Topography({ className = '', lines = 9 }) {
  const paths = useMemo(() => {
    const arr = [];
    for (let i = 0; i < lines; i++) {
      const y = 40 + i * 46;
      const wobble = 18 + (i % 3) * 6;
      const d = `M-40 ${y} C 120 ${y - wobble}, 240 ${y + wobble}, 380 ${y} S 620 ${y - wobble}, 780 ${y} S 1000 ${y + wobble}, 1180 ${y}`;
      arr.push({ d, delay: (i * 0.35).toFixed(2) });
    }
    return arr;
  }, [lines]);

  return (
    <svg
      className={`topography-bg ${className}`}
      viewBox="0 0 1100 480"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          className="topo-line"
          style={{ animationDelay: `${p.delay}s` }}
        />
      ))}
    </svg>
  );
}
