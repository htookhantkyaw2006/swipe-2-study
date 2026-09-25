import React, { useState } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';
import { useLanguage } from '../../lib/language';

/* ---------------------------------------------------------------
   LANGUAGE SWITCHER
   ---------------------------------------------------------------
   A compact pill (current language) that opens a bottom sheet of all
   languages. Active languages switch on tap; coming-soon ones are
   shown for context but disabled. Sheet styling mirrors the radical
   detail sheet in LearnRadicals for consistency.
   --------------------------------------------------------------- */
/* The picker itself, exported so the Settings and Profile rows reuse it
   rather than duplicating the list. */
export function LanguageSheet({ onClose }) {
  const { language, languages, setLanguage } = useLanguage();

  const choose = (lang) => {
    if (lang.status !== 'active') return;
    setLanguage(lang.id);
    onClose();
  };

  return (
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
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)' }}>
            I'm learning…
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}
          >
            <X size={22} color="var(--color-secondary-blue)" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {languages.map((lang) => {
            const active = lang.id === language.id;
            const comingSoon = lang.status !== 'active';
            return (
              <button
                key={lang.id}
                onClick={() => choose(lang)}
                disabled={comingSoon}
                style={{
                  display: 'flex', alignItems: 'center', gap: '16px',
                  padding: '16px', borderRadius: '18px', width: '100%', textAlign: 'left',
                  border: active ? '2px solid var(--color-primary-blue)' : '1px solid var(--color-border)',
                  backgroundColor: active ? 'var(--color-ghost-blue)' : '#FFFFFF',
                  cursor: comingSoon ? 'default' : 'pointer',
                  opacity: comingSoon ? 0.55 : 1,
                  transition: 'border-color 0.2s, background-color 0.2s'
                }}
              >
                <span style={{ fontSize: '2rem', lineHeight: 1, flexShrink: 0 }}>{lang.flag}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-text-navy)' }}>{lang.name}</span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-secondary-blue)', fontWeight: 500 }}>{lang.nativeName}</span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-secondary-blue)', margin: '2px 0 0 0', fontWeight: 500 }}>
                    {comingSoon
                      ? `${lang.levelSystem} · ${lang.levels[0]}–${lang.levels[lang.levels.length - 1]}`
                      : `${lang.levelSystem} · ${lang.levels[0]} · Learning`}
                  </p>
                </div>
                {active && (
                  <div style={{ flexShrink: 0, width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'var(--color-primary-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Check size={16} color="#FFFFFF" strokeWidth={3} />
                  </div>
                )}
                {comingSoon && (
                  <span style={{
                    flexShrink: 0, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.5px', color: 'var(--color-secondary-blue)',
                    backgroundColor: 'var(--color-ghost-blue)', padding: '4px 10px', borderRadius: '999px'
                  }}>
                    Coming soon
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function LanguageSwitcher() {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Pill */}
      <button
        onClick={() => setOpen(true)}
        aria-label={`Learning ${language.name}. Change language`}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          height: '44px', padding: '0 14px', borderRadius: '22px',
          backgroundColor: '#FFFFFF', border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
          transition: 'transform 0.2s, box-shadow 0.2s'
        }}
        onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.08)'; }}
        onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.05)'; }}
      >
        <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{language.flag}</span>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-navy)' }}>{language.name}</span>
        <ChevronDown size={16} color="var(--color-secondary-blue)" strokeWidth={2.5} />
      </button>

      {open && <LanguageSheet onClose={() => setOpen(false)} />}
    </>
  );
}
