import React from 'react';

// Reactbits-style "Aurora": restrained, slow-drifting blurred gradient
// blobs behind hero/CTA content. Pure CSS (see .aurora-bg in
// landing.css) -- no canvas, so it costs nothing on low-end/mobile.
export default function AuroraBackground({ className = '' }) {
  return (
    <div className={`aurora-bg ${className}`} aria-hidden="true">
      <span className="aurora-blob aurora-blob-a" />
      <span className="aurora-blob aurora-blob-b" />
      <span className="aurora-blob aurora-blob-c" />
    </div>
  );
}
