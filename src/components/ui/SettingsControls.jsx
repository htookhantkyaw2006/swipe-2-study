import React, { useState } from 'react';
import { ChevronRight, Check, X } from 'lucide-react';

/* ---------------------------------------------------------------
   SETTINGS CONTROLS
   ---------------------------------------------------------------
   Shared row primitives for the Settings and Profile pages so the
   two surfaces stay visually identical.
   --------------------------------------------------------------- */

export const ToggleSwitch = ({ checked, onChange, disabled }) => (
  <div
    onClick={() => { if (!disabled && onChange) onChange(!checked); }}
    role="switch"
    aria-checked={checked}
    aria-disabled={disabled || undefined}
    style={{
      width: '52px', height: '28px', borderRadius: '14px', flexShrink: 0,
      backgroundColor: checked ? '#10B981' : '#E0F2FE',
      position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'background-color 0.3s',
      opacity: disabled ? 0.5 : 1,
      boxShadow: checked ? 'inset 0 2px 4px rgba(0,0,0,0.1)' : 'inset 0 2px 4px rgba(3, 105, 161, 0.1)'
    }}
  >
    <div style={{
      width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#FFFFFF',
      position: 'absolute', top: '2px', left: checked ? '26px' : '2px',
      transition: 'left 0.3s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
    }} />
  </div>
);

/** A card that groups related rows under a heading. */
export const SettingsGroup = ({ title, children }) => (
  <div>
    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 16px 0' }}>
      {title}
    </h2>
    <div className="surface-card" style={{ padding: 0, borderRadius: '24px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
      {children}
    </div>
  </div>
);

/* One row. `control` is rendered on the right; when `onClick` is set the
   whole row is tappable. `comingSoon` dims it and blocks interaction. */
export const SettingsRow = ({
  icon: Icon, iconGradient, title, subtitle, value, control,
  onClick, comingSoon, danger, isLast
}) => {
  const interactive = Boolean(onClick) && !comingSoon;

  return (
    <div
      onClick={interactive ? onClick : undefined}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '12px', padding: '18px 20px',
        borderBottom: isLast ? 'none' : '1px solid var(--color-border)',
        cursor: interactive ? 'pointer' : 'default',
        opacity: comingSoon ? 0.55 : 1,
        transition: 'background-color 0.2s'
      }}
      onMouseOver={(e) => { if (interactive) e.currentTarget.style.backgroundColor = 'var(--color-ghost-blue)'; }}
      onMouseOut={(e) => { if (interactive) e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
        {Icon && (
          <div style={{
            width: '40px', height: '40px', flexShrink: 0, borderRadius: '12px',
            background: iconGradient || 'linear-gradient(135deg, #7DD3FC 0%, #0369A1 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 10px rgba(3, 105, 161, 0.25)'
          }}>
            <Icon size={20} color="#FFFFFF" strokeWidth={2.5} />
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <h3 style={{
            fontSize: '1rem', fontWeight: 700, margin: 0,
            color: danger ? '#EF4444' : 'var(--color-text-navy)'
          }}>
            {title}
          </h3>
          {subtitle && (
            <p style={{ fontSize: '0.8rem', color: 'var(--color-secondary-blue)', margin: '2px 0 0 0' }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {comingSoon && (
          <span style={{
            fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
            color: 'var(--color-secondary-blue)', backgroundColor: 'var(--color-ghost-blue)',
            padding: '4px 8px', borderRadius: '999px', whiteSpace: 'nowrap'
          }}>
            Soon
          </span>
        )}
        {value && !comingSoon && (
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-secondary-blue)' }}>
            {value}
          </span>
        )}
        {control}
        {interactive && !control && <ChevronRight size={20} color="var(--color-secondary-blue)" style={{ opacity: 0.5 }} />}
      </div>
    </div>
  );
};

/* Bottom sheet option picker — matches the language and radical sheets. */
export const OptionSheet = ({ title, options, selected, onSelect, onClose }) => (
  <div
    onClick={onClose}
    style={{
      position: 'fixed', inset: 0, zIndex: 100,
      backgroundColor: 'rgba(12, 74, 110, 0.4)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      className="surface-card"
      style={{
        width: '100%', maxWidth: '520px', borderRadius: '28px 28px 0 0',
        padding: '24px', maxHeight: '80vh', overflowY: 'auto'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)' }}>{title}</h3>
        <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}>
          <X size={22} color="var(--color-secondary-blue)" />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {options.map((opt) => {
          const active = opt.value === selected;
          return (
            <button
              key={String(opt.value)}
              onClick={() => { onSelect(opt.value); onClose(); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px', borderRadius: '16px', width: '100%', textAlign: 'left',
                border: active ? '2px solid var(--color-primary-blue)' : '1px solid var(--color-border)',
                backgroundColor: active ? 'var(--color-ghost-blue)' : '#FFFFFF',
                cursor: 'pointer', fontSize: '1rem', fontWeight: 700,
                color: 'var(--color-text-navy)'
              }}
            >
              {opt.label}
              {active && (
                <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: 'var(--color-primary-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={15} color="#FFFFFF" strokeWidth={3} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  </div>
);

/** Small hook for rows that open an OptionSheet. */
export const useOptionSheet = () => {
  const [openKey, setOpenKey] = useState(null);
  return { openKey, open: setOpenKey, close: () => setOpenKey(null) };
};
