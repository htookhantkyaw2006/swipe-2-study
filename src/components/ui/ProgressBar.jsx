import './ProgressBar.css';
import React from 'react';

export default function ProgressBar({ current, total, color = 'var(--color-success-green)' }) {
  const percentage = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="study-progress-panel-1 swipe-session__progress">
      <progress value={current} max={total} aria-valuenow={current} aria-valuemax={total} style={{ display: 'none' }} />
      <div className="study-progress-layout-1" style={{ width: `${percentage}%`, backgroundColor: color }} />
    </div>
  );
}
