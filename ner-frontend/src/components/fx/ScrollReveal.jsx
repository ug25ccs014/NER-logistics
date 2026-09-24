import React from 'react';
import { motion } from 'framer-motion';
import usePrefersReducedMotion from '../../hooks/usePrefersReducedMotion.js';

// Shared "section enters -> fades/rises into place" wrapper so every
// landing-page section animates the same restrained way (500-700ms,
// once, well before it's fully in view) instead of each section
// hand-rolling its own framer-motion variant.
export default function ScrollReveal({
  children,
  as: Tag = motion.div,
  y = 26,
  duration = 0.6,
  delay = 0,
  className = '',
  once = true,
}) {
  const reduced = usePrefersReducedMotion();
  return (
    <Tag
      className={className}
      initial={reduced ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-80px' }}
      transition={{ duration: reduced ? 0 : duration, delay: reduced ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Tag>
  );
}
