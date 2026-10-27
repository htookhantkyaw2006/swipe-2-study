import React, { useState, useRef, useEffect, useId } from 'react';
import { ChevronRight, Check, X } from 'lucide-react';
import './SettingsControls.css';

export const ToggleSwitch = ({ checked, onChange, disabled, label }) => (
  <button
    type="button"
    className="settings-switch"
    role="switch"
    aria-label={label}
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange?.(!checked)}
  />
);

export const SettingsGroup = ({ title, children }) => (
  <section className="settings-group" aria-label={title}>
    <h2>{title}</h2>
    <div className="settings-group__surface">{children}</div>
  </section>
);

export const SettingsRow = ({ icon: Icon, iconGradient, title, subtitle, value, control, onClick, comingSoon, danger, isLast }) => {
  const interactive = Boolean(onClick) && !comingSoon;
  const Tag = interactive ? 'button' : 'div';
  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={interactive ? onClick : undefined}
      className={`settings-row${value && !comingSoon ? ' settings-row--value' : ''}${!Icon ? ' settings-row--no-icon' : ''}${danger ? ' settings-row--danger' : ''}${isLast ? ' settings-row--last' : ''}`}
    >
      {Icon && <span className="settings-row__icon" style={{ '--settings-icon-background': iconGradient }}><Icon size={20} aria-hidden="true" /></span>}
      <span className="settings-row__copy"><span className="settings-row__title">{title}</span>{subtitle && <span className="settings-row__subtitle">{subtitle}</span>}</span>
      <span className="settings-row__end">
        {comingSoon ? <span className="settings-row__soon">Soon</span> : value && <span className="settings-row__value">{value}</span>}
        {React.isValidElement(control) ? React.cloneElement(control, { label: title }) : control}
        {interactive && !control && <ChevronRight size={20} aria-hidden="true" />}
      </span>
    </Tag>
  );
};

export const OptionSheet = ({ title, options, selected, onSelect, onClose }) => {
  const dialogRef = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); if (opener?.isConnected) opener.focus(); };
  }, []);

  return (
    <dialog ref={dialogRef} className="settings-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="settings-dialog__content">
        <header><h2 id={titleId}>{title}</h2><button type="button" className="settings-dialog__close" onClick={onClose} aria-label="Close"><X size={22} aria-hidden="true" /></button></header>
        <div className="settings-dialog__options">{options.map(option => {
          const active = option.value === selected;
          return <button type="button" key={String(option.value)} aria-pressed={active} onClick={() => { onSelect(option.value); onClose(); }}><span>{option.label}</span>{active && <Check size={20} aria-hidden="true" />}</button>;
        })}</div>
      </div>
    </dialog>
  );
};

export const useOptionSheet = () => {
  const [openKey, setOpenKey] = useState(null);
  return { openKey, open: setOpenKey, close: () => setOpenKey(null) };
};
