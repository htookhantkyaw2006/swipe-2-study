import React from 'react';

export default function Card({ children, className = '', ...props }) {
  return (
    <div className={`surface-card ${className}`} {...props}>
      {children}
    </div>
  );
}
