import React from 'react';

export default function Button({ children, variant = 'primary', className = '', ...props }) {
  const baseClass = `btn-${variant}`;
  return (
    <button className={`${baseClass} ${className}`} {...props}>
      {children}
    </button>
  );
}
