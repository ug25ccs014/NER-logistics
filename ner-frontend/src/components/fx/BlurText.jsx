import React from 'react';
import { motion } from 'framer-motion';
import usePrefersReducedMotion from '../../hooks/usePrefersReducedMotion.js';

// Reactbits-style "BlurText": splits text into words and reveals them
// with a staggered blur + rise. `children` may include inline
// elements (e.g. a <GradientText> for emphasis) -- pass an array of
// { text, gradient? } segments instead of a raw string for that case.
export default function BlurText({
  segments,
  as: Tag = 'h1',
  className = '',
  delay = 0,
  staggerMs = 45,
}) {
  const reduced = usePrefersReducedMotion();
  let wordIndex = 0;
  return (
    <Tag className={className}>
      {segments.map((seg, si) => (
        <React.Fragment key={si}>
          {seg.text.split(' ').map((word, wi) => {
            const i = wordIndex++;
            return (
              <motion.span
                key={wi}
                initial={reduced ? false : { opacity: 0, filter: 'blur(10px)', y: 16 }}
                animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                transition={{
                  duration: reduced ? 0 : 0.6,
                  ease: [0.22, 1, 0.36, 1],
                  delay: reduced ? 0 : delay + i * (staggerMs / 1000),
                }}
                style={{
                  display: 'inline-block',
                  willChange: 'transform, filter, opacity',
                  ...(seg.gradient
                    ? {
                        background: 'var(--gradient-hero)',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        color: 'transparent',
                      }
                    : {}),
                }}
              >
                {word}
                {wi < seg.text.split(' ').length - 1 ? '\u00A0' : ''}
              </motion.span>
            );
          })}
          {si < segments.length - 1 ? ' ' : ''}
        </React.Fragment>
      ))}
    </Tag>
  );
}
