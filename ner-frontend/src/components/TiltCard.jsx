import React, { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

// A lightweight "3D card" -- tilts toward the cursor using CSS
// perspective, with a soft glare that follows the pointer. This is
// the same trick reactbits.dev / Aceternity-style tilt cards use;
// doing it with CSS transforms + framer-motion (instead of pulling in
// three.js / react-three-fiber) keeps the bundle small and avoids a
// WebGL dependency for what's fundamentally a hover effect.
export default function TiltCard({ children, className = '', style = {}, maxTilt = 12 }) {
  const ref = useRef(null);
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);

  const spring = { stiffness: 150, damping: 18, mass: 0.5 };
  const rotateX = useSpring(useTransform(my, [0, 1], [maxTilt, -maxTilt]), spring);
  const rotateY = useSpring(useTransform(mx, [0, 1], [-maxTilt, maxTilt]), spring);
  const glareX = useTransform(mx, [0, 1], ['0%', '100%']);
  const glareY = useTransform(my, [0, 1], ['0%', '100%']);

  const onMouseMove = (e) => {
    const rect = ref.current.getBoundingClientRect();
    mx.set((e.clientX - rect.left) / rect.width);
    my.set((e.clientY - rect.top) / rect.height);
  };
  const onMouseLeave = () => {
    mx.set(0.5);
    my.set(0.5);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
        transformPerspective: 900,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 16,
        border: '1px solid var(--border)',
        background: 'linear-gradient(160deg, var(--panel), var(--panel-alt))',
        ...style,
      }}
      className={className}
    >
      <motion.div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'radial-gradient(circle at var(--gx) var(--gy), rgba(59,130,246,0.25), transparent 60%)',
          '--gx': glareX,
          '--gy': glareY,
        }}
      />
      <div style={{ position: 'relative', transform: 'translateZ(30px)' }}>{children}</div>
    </motion.div>
  );
}
