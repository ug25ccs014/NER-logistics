import React, { useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import usePrefersReducedMotion from '../../hooks/usePrefersReducedMotion.js';

// Reactbits-style "Magnet": the wrapped element (typically the
// primary CTA button) pulls gently toward the cursor within `range`
// pixels, and springs back on leave. Used once, on the hero's
// primary CTA -- not on every button, per the design spec's "purposeful
// animation only" rule.
export default function Magnet({ children, range = 60, strength = 0.35, className = '' }) {
  const ref = useRef(null);
  const reduced = usePrefersReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const spring = { stiffness: 200, damping: 16, mass: 0.4 };
  const sx = useSpring(x, spring);
  const sy = useSpring(y, spring);

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  const onMouseMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < range) {
      x.set(dx * strength);
      y.set(dy * strength);
    } else {
      x.set(0);
      y.set(0);
    }
  };
  const onMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ x: sx, y: sy, display: 'inline-block' }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </motion.div>
  );
}
