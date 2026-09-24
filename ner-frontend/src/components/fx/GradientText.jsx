import React from 'react';

// Reactbits-style "Gradient Text": wraps a span in a moving
// blue -> cyan -> teal gradient clipped to the text. Used sparingly,
// for the one or two words in the hero/CTA headings that need
// emphasis -- not for entire paragraphs.
export default function GradientText({ children, className = '', animate = true }) {
  return (
    <span
      className={`grad-text ${animate ? 'grad-text-animate' : ''} ${className}`}
    >
      {children}
    </span>
  );
}
