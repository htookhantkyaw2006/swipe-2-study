import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, X, Lightbulb, PenLine } from 'lucide-react';
import { radicals, radicalCategories } from '../data/radicals';
import { writingChars } from '../data/writingChars';

const RADICAL_GRADIENT = 'linear-gradient(135deg, #A5B4FC 0%, #4338CA 100%)';
const RADICAL_SHADOW = 'rgba(67, 56, 202, 0.3)';

/* The form you would actually practise writing: 氵 is written 水 on its own. */
const practisableChar = (radical) => {
  const candidate = radical.standalone || radical.radical;
  return writingChars.some((w) => w.character === candidate) ? candidate : null;
};

/* ---------------------------------------------------------------
   RADICAL DETAIL — shown when a radical card is tapped.
   --------------------------------------------------------------- */
function RadicalDetail({ radical, onClose, onPractise }) {
  const practiseChar = practisableChar(radical);

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '20px',
              background: RADICAL_GRADIENT,
              boxShadow: `0 8px 16px ${RADICAL_SHADOW}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '2rem', fontWeight: 800, color: '#FFFFFF'
            }}>
              {radical.radical}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)' }}>
                {radical.meaning}
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.9rem', color: 'var(--color-secondary-blue)', fontWeight: 600 }}>
                {radical.pinyin} · {radical.strokes} strokes
              </p>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', color: 'var(--color-secondary-blue)', opacity: 0.85 }}>
                {radical.burmese}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}
          >
            <X size={22} color="var(--color-secondary-blue)" />
          </button>
        </div>

        {radical.standalone && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            backgroundColor: 'var(--color-ghost-blue)', borderRadius: '14px',
            padding: '12px 16px', marginBottom: '16px'
          }}>
            <Lightbulb size={16} color="var(--color-primary-blue)" strokeWidth={2.5} />
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-navy)', fontWeight: 600 }}>
              Written {radical.radical} inside a character, {radical.standalone} on its own.
            </span>
          </div>
        )}

        <h4 style={{
          fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.5px', color: 'var(--color-secondary-blue)', margin: '0 0 12px 0'
        }}>
          Characters using it
        </h4>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {radical.examples.map((ex) => (
            <div key={ex.char} style={{
              display: 'flex', alignItems: 'center', gap: '16px',
              padding: '12px 16px', borderRadius: '14px',
              backgroundColor: '#F8FAFC', border: '1px solid var(--color-border)'
            }}>
              <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-primary-blue)', minWidth: '40px', textAlign: 'center' }}>
                {ex.char}
              </span>
              <div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-secondary-blue)', fontWeight: 600 }}>
                  {ex.pinyin}
                </p>
                <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--color-text-navy)', fontWeight: 700 }}>
                  {ex.english}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Only offered when the radical is itself in the writing set. */}
        {practiseChar && (
          <button
            onClick={() => onPractise(practiseChar)}
            style={{
              width: '100%', marginTop: '16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              padding: '14px', borderRadius: '16px', border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #5EEAD4 0%, #0F766E 100%)',
              boxShadow: '0 8px 16px rgba(15, 118, 110, 0.35)',
              color: '#FFFFFF', fontWeight: 700, fontSize: '0.9rem'
            }}
          >
            <PenLine size={18} strokeWidth={2.5} /> Practise writing {practiseChar}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   PAGE
   --------------------------------------------------------------- */
export default function LearnRadicals() {
  const navigate = useNavigate();
  const [category, setCategory] = useState('All');
  const [openRadical, setOpenRadical] = useState(null);

  const visibleRadicals = category === 'All'
    ? radicals
    : radicals.filter((r) => r.category === category);

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: '100px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div style={{ padding: '24px 24px 16px 24px' }}>

          <header className="flex items-center justify-center relative" style={{ marginBottom: '32px' }}>
            <button
              onClick={() => navigate(-1)}
              style={{ position: 'absolute', left: 0, background: 'transparent', padding: '8px', border: 'none', cursor: 'pointer', zIndex: 10 }}
            >
              <ChevronLeft size={24} color="var(--color-text-navy)" />
            </button>
            <h1 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--color-text-navy)', fontWeight: 800 }}>
              Learn Radicals
            </h1>
          </header>

          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '2rem', color: 'var(--color-text-navy)', margin: '0 0 8px 0', fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
              The parts<br />characters are made of
            </h2>
            <p style={{ color: 'var(--color-secondary-blue)', fontSize: '1rem', margin: 0, fontWeight: 500 }}>
              Spot 氵 and you already know the word is about water.
            </p>
          </div>

          {/* Category filter */}
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '16px' }}>
            {['All', ...radicalCategories].map((c) => {
              const active = c === category;
              return (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  style={{
                    flexShrink: 0, padding: '8px 16px', borderRadius: '999px', cursor: 'pointer',
                    border: '1px solid ' + (active ? 'var(--color-primary-blue)' : 'var(--color-border)'),
                    backgroundColor: active ? 'var(--color-primary-blue)' : 'var(--color-card-surface)',
                    color: active ? '#FFFFFF' : 'var(--color-secondary-blue)',
                    fontWeight: 700, fontSize: '0.8rem'
                  }}
                >
                  {c}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
            {visibleRadicals.map((r) => (
              <div
                key={r.radical}
                className="surface-card"
                onClick={() => setOpenRadical(r)}
                style={{
                  padding: '16px', borderRadius: '20px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '12px',
                  transition: 'transform 0.2s, box-shadow 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.06)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.03)';
                }}
              >
                <div style={{
                  width: '44px', height: '44px', flexShrink: 0, borderRadius: '14px',
                  background: RADICAL_GRADIENT,
                  boxShadow: `0 6px 12px ${RADICAL_SHADOW}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.4rem', fontWeight: 800, color: '#FFFFFF'
                }}>
                  {r.radical}
                </div>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 2px 0', lineHeight: 1.2 }}>
                    {r.meaning}
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-secondary-blue)', margin: 0, fontWeight: 500 }}>
                    {r.pinyin} · {r.strokes} strokes
                  </p>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {openRadical && (
        <RadicalDetail
          radical={openRadical}
          onClose={() => setOpenRadical(null)}
          onPractise={(char) => navigate(`/writing?char=${encodeURIComponent(char)}`)}
        />
      )}
    </div>
  );
}
