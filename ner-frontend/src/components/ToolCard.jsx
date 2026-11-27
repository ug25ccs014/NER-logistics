import React from 'react';
import AnimatedIcon from './icons/AnimatedIcon.jsx';

export default function ToolCard({ tool, index, onOpen, locked = false }) {
  return (
    <button
      type="button"
      className={`tool-card ${locked ? 'tool-card--locked' : ''}`}
      style={{ '--i': index }}
      onClick={onOpen}
    >
      <span className="tool-card-glow" aria-hidden="true" />
      {locked && <span className="tool-card-lock">🔒 Upgrade</span>}
      <span className="tool-card-icon">
        <AnimatedIcon type={tool.icon} />
      </span>
      <span className="tool-card-body">
        <span className="tool-card-title">{tool.label}</span>
        <span className="tool-card-desc">{tool.description}</span>
      </span>
      <span className="tool-card-arrow" aria-hidden="true">→</span>
    </button>
  );
}
