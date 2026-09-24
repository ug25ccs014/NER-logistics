import React, { useEffect, useRef, useState } from 'react';
import { useInView } from 'framer-motion';

// Counts up from 0 to `value` once the element scrolls into view.
// Deliberately plain requestAnimationFrame rather than another
// animation library primitive -- a stat counter doesn't need spring
// physics, just a predictable count that finishes in `durationMs`.
export default function Counter({ value, durationMs = 1400, suffix = '', prefix = '' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / durationMs);
      // ease-out cubic -- fast start, settles gently rather than
      // ticking linearly to a hard stop.
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, durationMs]);

  return (
    <span ref={ref}>
      {prefix}{display.toLocaleString()}{suffix}
    </span>
  );
}
