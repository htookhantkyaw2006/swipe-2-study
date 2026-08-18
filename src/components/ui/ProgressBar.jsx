import React from 'react';

export default function ProgressBar({ current, total, color = 'var(--color-success-green)' }) {
  const percentage = total > 0 ? (current / total) * 100 : 0;
  
  return (
    <div style={{
      width: '100%',
      height: '8px',
      backgroundColor: 'var(--color-ghost-blue)',
      borderRadius: '4px',
      overflow: 'hidden'
    }}>
      <div style={{
        width: `${percentage}%`,
        height: '100%',
        backgroundColor: color,
        transition: 'width 0.3s ease-out'
      }} />
    </div>
  );
}
