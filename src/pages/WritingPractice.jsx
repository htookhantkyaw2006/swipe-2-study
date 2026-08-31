import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, PenLine, Play, RotateCcw, Eraser, CheckCircle } from 'lucide-react';
import HanziWriter from 'hanzi-writer';
import { writingChars } from '../data/writingChars';
import strokeData from '../data/strokeData.json';
import { db } from '../lib/db';

const WRITER_SIZE = 260;

/* Feed HanziWriter from our bundled subset instead of the network. */
const charDataLoader = (char, onComplete) => {
  const data = strokeData[char];
  if (!data) {
    console.warn(`No stroke data bundled for "${char}". Run: npm run build:strokes`);
    return;
  }
  onComplete(data);
};

/* ---------------------------------------------------------------
   PRACTICE PANEL — animate a character, then trace it.
   --------------------------------------------------------------- */
function PracticePanel({ entry, isMastered, onMastered }) {
  const targetRef = useRef(null);
  const writerRef = useRef(null);
  const [mode, setMode] = useState('idle'); // idle | animating | quizzing
  const [mistakes, setMistakes] = useState(0);
  const [justCompleted, setJustCompleted] = useState(false);

  // Rebuild the writer whenever the character changes.
  useEffect(() => {
    const node = targetRef.current;
    if (!node) return;

    node.innerHTML = '';
    setMode('idle');
    setMistakes(0);
    setJustCompleted(false);

    if (!strokeData[entry.character]) {
      writerRef.current = null;
      return;
    }

    writerRef.current = HanziWriter.create(node, entry.character, {
      width: WRITER_SIZE,
      height: WRITER_SIZE,
      padding: 16,
      showCharacter: false,
      showOutline: true,
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 180,
      strokeColor: '#0369A1',
      outlineColor: '#E0F2FE',
      drawingColor: '#0284C7',
      highlightColor: '#38BDF8',
      charDataLoader
    });

    return () => {
      node.innerHTML = '';
      writerRef.current = null;
    };
  }, [entry.character]);

  const animate = useCallback(() => {
    if (!writerRef.current) return;
    setMode('animating');
    setJustCompleted(false);
    writerRef.current.animateCharacter({
      // Only fall back to idle if we are still animating — starting a quiz
      // mid-animation must not be clobbered by this late callback.
      onComplete: () => setMode((m) => (m === 'animating' ? 'idle' : m))
    });
  }, []);

  const startQuiz = useCallback(() => {
    if (!writerRef.current) return;
    // Stop any in-flight animation so it cannot fight the quiz.
    writerRef.current.cancelQuiz();
    writerRef.current.hideCharacter();
    setMode('quizzing');
    setMistakes(0);
    setJustCompleted(false);
    writerRef.current.quiz({
      onMistake: (data) => setMistakes(data.totalMistakes),
      onComplete: (data) => {
        setMode('idle');
        setJustCompleted(true);
        // Mastered only if traced cleanly.
        if (data.totalMistakes === 0) onMastered(entry.character);
      }
    });
  }, [entry.character, onMastered]);

  const reset = useCallback(() => {
    if (!writerRef.current) return;
    writerRef.current.cancelQuiz();
    writerRef.current.hideCharacter();
    setMode('idle');
    setMistakes(0);
    setJustCompleted(false);
  }, []);

  const hasData = Boolean(strokeData[entry.character]);

  return (
    <div className="surface-card" style={{ borderRadius: '24px', padding: '24px', textAlign: 'center' }}>
      {/* Character meta */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: 0 }}>
            {entry.pronunciation}
          </h2>
          {isMastered && <CheckCircle size={20} color="#16A34A" strokeWidth={3} />}
        </div>
        <p style={{ color: 'var(--color-secondary-blue)', fontSize: '0.95rem', margin: '4px 0 0 0', fontWeight: 600 }}>
          {entry.definition}
        </p>
        <p style={{ color: 'var(--color-secondary-blue)', fontSize: '0.85rem', margin: '2px 0 0 0', opacity: 0.85 }}>
          {entry.burmese_definition}
        </p>
      </div>

      {/* Writing grid */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
        <div style={{
          position: 'relative', width: WRITER_SIZE, height: WRITER_SIZE,
          borderRadius: '20px', backgroundColor: '#FFFFFF',
          border: '2px solid var(--color-border)', overflow: 'hidden',
          touchAction: 'none'
        }}>
          {/* Guide lines — the 米字格 practice grid */}
          <svg
            width={WRITER_SIZE} height={WRITER_SIZE}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          >
            <line x1="0" y1={WRITER_SIZE / 2} x2={WRITER_SIZE} y2={WRITER_SIZE / 2}
              stroke="var(--color-border)" strokeWidth="1" strokeDasharray="6 6" />
            <line x1={WRITER_SIZE / 2} y1="0" x2={WRITER_SIZE / 2} y2={WRITER_SIZE}
              stroke="var(--color-border)" strokeWidth="1" strokeDasharray="6 6" />
            <line x1="0" y1="0" x2={WRITER_SIZE} y2={WRITER_SIZE}
              stroke="var(--color-border)" strokeWidth="1" strokeDasharray="6 6" opacity="0.5" />
            <line x1={WRITER_SIZE} y1="0" x2="0" y2={WRITER_SIZE}
              stroke="var(--color-border)" strokeWidth="1" strokeDasharray="6 6" opacity="0.5" />
          </svg>

          <div ref={targetRef} style={{ position: 'relative', zIndex: 1 }} />

          {!hasData && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', padding: '24px', fontSize: '0.8rem',
              color: 'var(--color-secondary-blue)', textAlign: 'center'
            }}>
              No stroke data bundled for {entry.character}. Run npm run build:strokes
            </div>
          )}
        </div>
      </div>

      {/* Status line */}
      <div style={{ minHeight: '24px', marginBottom: '12px' }}>
        {mode === 'quizzing' && (
          <span style={{ fontSize: '0.85rem', color: 'var(--color-secondary-blue)', fontWeight: 600 }}>
            Trace the character — {mistakes === 0 ? 'no mistakes yet' : `${mistakes} mistake${mistakes > 1 ? 's' : ''}`}
          </span>
        )}
        {mode === 'animating' && (
          <span style={{ fontSize: '0.85rem', color: 'var(--color-secondary-blue)', fontWeight: 600 }}>
            Watch the stroke order…
          </span>
        )}
        {mode === 'idle' && justCompleted && (
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: mistakes === 0 ? '#16A34A' : '#CA8A04' }}>
            {mistakes === 0
              ? 'Perfect — character mastered!'
              : `Complete, with ${mistakes} mistake${mistakes > 1 ? 's' : ''}. Try again for a clean run.`}
          </span>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={animate}
          disabled={!hasData || mode !== 'idle'}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 18px', borderRadius: '14px', border: 'none',
            backgroundColor: 'var(--color-ghost-blue)', color: 'var(--color-primary-blue)',
            fontWeight: 700, fontSize: '0.85rem',
            cursor: hasData && mode === 'idle' ? 'pointer' : 'not-allowed',
            opacity: hasData && mode === 'idle' ? 1 : 0.5
          }}
        >
          <Play size={16} strokeWidth={2.5} /> Show me
        </button>

        <button
          onClick={startQuiz}
          disabled={!hasData || mode === 'quizzing'}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 18px', borderRadius: '14px', border: 'none',
            background: 'linear-gradient(135deg, #5EEAD4 0%, #0F766E 100%)',
            color: '#FFFFFF', fontWeight: 700, fontSize: '0.85rem',
            boxShadow: '0 8px 16px rgba(15, 118, 110, 0.35)',
            cursor: hasData && mode !== 'quizzing' ? 'pointer' : 'not-allowed',
            opacity: hasData && mode !== 'quizzing' ? 1 : 0.5
          }}
        >
          <PenLine size={16} strokeWidth={2.5} /> Practise
        </button>

        <button
          onClick={reset}
          disabled={!hasData}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 18px', borderRadius: '14px', border: 'none',
            backgroundColor: 'var(--color-ghost-blue)', color: 'var(--color-primary-blue)',
            fontWeight: 700, fontSize: '0.85rem',
            cursor: hasData ? 'pointer' : 'not-allowed', opacity: hasData ? 1 : 0.5
          }}
        >
          <Eraser size={16} strokeWidth={2.5} /> Clear
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   PAGE
   --------------------------------------------------------------- */
export default function WritingPractice() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mastered, setMastered] = useState([]);

  useEffect(() => {
    setMastered(db.get('written_chars').map((r) => r.character));
  }, []);

  // Arriving from "Practise writing this" on the radicals page.
  useEffect(() => {
    const requested = searchParams.get('char');
    if (!requested) return;
    const idx = writingChars.findIndex((w) => w.character === requested);
    if (idx > -1) setSelectedIdx(idx);
  }, [searchParams]);

  const handleMastered = useCallback((character) => {
    if (db.findOne('written_chars', { character })) return;
    db.insert('written_chars', { character });
    setMastered((prev) => (prev.includes(character) ? prev : [...prev, character]));
  }, []);

  const resetProgress = () => {
    db.set('written_chars', []);
    setMastered([]);
  };

  const entry = writingChars[selectedIdx];

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
              Practise Writing
            </h1>
          </header>

          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '2rem', color: 'var(--color-text-navy)', margin: '0 0 8px 0', fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
              Write it<br />stroke by stroke
            </h2>
            <p style={{ color: 'var(--color-secondary-blue)', fontSize: '1rem', margin: 0, fontWeight: 500 }}>
              Watch the order, then trace it with your finger.
            </p>
          </div>

          {/* Progress */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-secondary-blue)' }}>
              {mastered.length} of {writingChars.length} written cleanly
            </span>
            {mastered.length > 0 && (
              <button
                onClick={resetProgress}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-secondary-blue)'
                }}
              >
                <RotateCcw size={14} strokeWidth={2.5} /> Reset
              </button>
            )}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <PracticePanel
              entry={entry}
              isMastered={mastered.includes(entry.character)}
              onMastered={handleMastered}
            />
          </div>

          {/* Character picker */}
          <h4 style={{
            fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase',
            letterSpacing: '0.5px', color: 'var(--color-secondary-blue)', margin: '0 0 12px 0'
          }}>
            Choose a character
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: '10px' }}>
            {writingChars.map((w, idx) => {
              const active = idx === selectedIdx;
              const done = mastered.includes(w.character);
              return (
                <button
                  key={w.character}
                  onClick={() => setSelectedIdx(idx)}
                  style={{
                    position: 'relative', aspectRatio: '1', borderRadius: '16px', cursor: 'pointer',
                    border: active ? '2px solid var(--color-primary-blue)' : '1px solid var(--color-border)',
                    backgroundColor: active ? 'var(--color-ghost-blue)' : 'var(--color-card-surface)',
                    fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-navy)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'border-color 0.2s, background-color 0.2s'
                  }}
                >
                  {w.character}
                  {done && (
                    <span style={{ position: 'absolute', top: '4px', right: '4px' }}>
                      <CheckCircle size={12} color="#16A34A" strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>


        </div>
      </div>
    </div>
  );
}
