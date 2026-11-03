import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Zap, RotateCcw } from 'lucide-react';
import { BASIC, VOICED, SCRIPTS, kanaList } from '../courses/ja-kana';
import KanaDrill from '../components/KanaDrill';
import { readKanaProgress, resetKanaProgress, levelFor, countKnown, LEVELS } from '../lib/kanaProgress';
import { speak } from '../lib/speech';
import { useCourse } from '../lib/language';

/* ---------------------------------------------------------------
   LEARN KANA
   ---------------------------------------------------------------
   The Japanese counterpart of Learn Radicals: the first thing a
   Japanese beginner needs, since every word can be written in kana.

   Laid out as the gojūon chart textbooks use — vowel columns, one
   row per consonant — with gaps kept so や and を sit where they
   belong. Tap a kana to hear it; the quiz tracks mastery the same way
   the radical drill does.
   --------------------------------------------------------------- */

const GRADIENT = 'linear-gradient(135deg, #F9A8D4 0%, #DB2777 100%)';
const SHADOW = 'rgba(219, 39, 119, 0.3)';

function KanaGrid({ rows, scriptIndex, progress, playing, onPlay }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
      {rows.flatMap((row) =>
        row.cells.map((cell, i) => {
          if (!cell) return <div key={`${row.key}-${i}`} aria-hidden="true" />;
          const kana = cell[scriptIndex];
          const level = levelFor(progress[kana]);
          const active = playing === kana;
          return (
            <button
              key={kana}
              onClick={() => onPlay(kana)}
              aria-label={`${kana}, ${cell[2]}. Play`}
              className="surface-card"
              style={{
                position: 'relative', aspectRatio: '1', borderRadius: '16px', cursor: 'pointer',
                border: active ? '2px solid #DB2777' : '1px solid var(--color-border)',
                backgroundColor: active ? '#FDF2F8' : 'var(--color-card-surface)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: 0, transition: 'transform 0.15s, background-color 0.2s, border-color 0.2s',
                transform: active ? 'scale(0.96)' : 'scale(1)'
              }}
            >
              <span style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-text-navy)', lineHeight: 1.1 }}>{kana}</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-secondary-blue)', fontFamily: 'JetBrains Mono, monospace' }}>{cell[2]}</span>
              {level !== 'new' && (
                <span
                  title={LEVELS[level].label}
                  style={{ position: 'absolute', top: '6px', right: '6px', width: '7px', height: '7px', borderRadius: '50%', backgroundColor: LEVELS[level].color }}
                />
              )}
            </button>
          );
        })
      )}
    </div>
  );
}

const SectionTitle = ({ children, note }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', margin: '0 0 12px 0' }}>
    <h3 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-secondary-blue)', margin: 0 }}>
      {children}
    </h3>
    {note && <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-secondary-blue)', opacity: 0.8 }}>{note}</span>}
  </div>
);

function LearnKana() {
  const navigate = useNavigate();
  const [script, setScript] = useState('hiragana');
  const [progress, setProgress] = useState({});
  const [drillOpen, setDrillOpen] = useState(false);
  const [playing, setPlaying] = useState(null);

  useEffect(() => { setProgress(readKanaProgress()); }, []);
  const refreshProgress = useCallback(() => setProgress(readKanaProgress()), []);

  const play = useCallback((kana) => {
    speak(kana);
    setPlaying(kana);
    window.setTimeout(() => setPlaying((p) => (p === kana ? null : p)), 350);
  }, []);

  const scriptIndex = SCRIPTS[script].index;
  const all = kanaList(script);
  const scriptProgress = Object.fromEntries(all.filter((k) => progress[k.kana]).map((k) => [k.kana, progress[k.kana]]));
  const known = countKnown(scriptProgress);
  const started = Object.keys(scriptProgress).length > 0;

  const clearProgress = () => {
    if (!window.confirm('Reset kana progress? Your quiz history for both hiragana and katakana will be erased.')) return;
    resetKanaProgress();
    refreshProgress();
  };

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: '100px', fontFamily: 'Inter, sans-serif' }}>
      {/* Narrower than Learn Radicals: the chart must stay five columns,
          and at 1000px each kana tile would grow to ~180px. */}
      <div style={{ maxWidth: '640px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div style={{ padding: '24px 24px 16px 24px' }}>

          <header className="flex items-center justify-center relative" style={{ marginBottom: '32px' }}>
            <button
              onClick={() => navigate(-1)}
              aria-label="Back"
              style={{ position: 'absolute', left: 0, background: 'transparent', padding: '8px', border: 'none', cursor: 'pointer', zIndex: 10 }}
            >
              <ChevronLeft size={24} color="var(--color-text-navy)" />
            </button>
            <h1 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--color-text-navy)', fontWeight: 800 }}>Learn Kana</h1>
          </header>

          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '2rem', color: 'var(--color-text-navy)', margin: '0 0 8px 0', fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
              The two Japanese<br />alphabets
            </h2>
            <p style={{ color: 'var(--color-secondary-blue)', fontSize: '1rem', margin: 0, fontWeight: 500 }}>
              Learn these and you can sound out any Japanese word.
            </p>
          </div>

          {/* Quiz — the primary action, as on Learn Radicals */}
          <button
            onClick={() => setDrillOpen(true)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '16px',
              padding: '20px', borderRadius: '24px', border: 'none', cursor: 'pointer',
              background: GRADIENT, boxShadow: `0 10px 20px ${SHADOW}`,
              textAlign: 'left', marginBottom: '20px', transition: 'transform 0.2s, box-shadow 0.2s'
            }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <div style={{ width: '52px', height: '52px', flexShrink: 0, borderRadius: '16px', backgroundColor: 'rgba(255, 255, 255, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={24} color="#FFFFFF" strokeWidth={2.5} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#FFFFFF' }}>
                {SCRIPTS[script].label} Quiz
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.9)', fontWeight: 500 }}>
                10 questions · see a kana, pick its sound
              </p>
            </div>
            <ChevronRight size={22} color="#FFFFFF" strokeWidth={2.5} />
          </button>

          {/* Progress for the script on screen */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-secondary-blue)' }}>
                {known} of {all.length} {SCRIPTS[script].label.toLowerCase()} known
              </span>
              {started && (
                <button
                  onClick={clearProgress}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-secondary-blue)' }}
                >
                  <RotateCcw size={14} strokeWidth={2.5} /> Reset
                </button>
              )}
            </div>
            <div style={{ height: '6px', borderRadius: '999px', backgroundColor: 'var(--color-ghost-blue)', overflow: 'hidden' }}>
              <div style={{ width: `${(known / all.length) * 100}%`, height: '100%', background: GRADIENT, borderRadius: '999px', transition: 'width 0.4s ease' }} />
            </div>
          </div>

          {/* Script toggle */}
          <div
            role="tablist"
            aria-label="Script"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', padding: '6px', borderRadius: '18px', backgroundColor: 'var(--color-ghost-blue)', marginBottom: '10px' }}
          >
            {Object.entries(SCRIPTS).map(([key, s]) => {
              const active = key === script;
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setScript(key)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    padding: '12px', borderRadius: '14px', border: 'none', cursor: 'pointer',
                    backgroundColor: active ? '#FFFFFF' : 'transparent',
                    boxShadow: active ? '0 2px 8px rgba(3, 105, 161, 0.12)' : 'none',
                    color: active ? 'var(--color-text-navy)' : 'var(--color-secondary-blue)',
                    fontWeight: 800, fontSize: '0.9rem', transition: 'background-color 0.2s'
                  }}
                >
                  <span style={{ fontSize: '1.1rem' }}>{s.sample}</span> {s.label}
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-secondary-blue)', fontWeight: 600, margin: '0 0 24px 4px' }}>
            {SCRIPTS[script].note}
          </p>

          <SectionTitle note="Tap to hear">Basic · 46</SectionTitle>
          <KanaGrid rows={BASIC} scriptIndex={scriptIndex} progress={progress} playing={playing} onPlay={play} />

          <div style={{ height: '28px' }} />

          <SectionTitle note="゛ and ゜ change the sound">Voiced · 25</SectionTitle>
          <KanaGrid rows={VOICED} scriptIndex={scriptIndex} progress={progress} playing={playing} onPlay={play} />

        </div>
      </div>

      {drillOpen && (
        <KanaDrill
          script={script}
          progress={progress}
          onRecorded={refreshProgress}
          onClose={() => { setDrillOpen(false); refreshProgress(); }}
        />
      )}
    </div>
  );
}

/* Kana only exist in Japanese. Reached in another language (a stale
   link or bookmark), send the learner home rather than show a chart
   for a script they are not studying. */
export default function LearnKanaPage() {
  const navigate = useNavigate();
  const course = useCourse();
  const hasKana = course.exploreTools.some((t) => t.key === 'kana' && t.path);

  useEffect(() => {
    if (!hasKana) navigate('/library', { replace: true });
  }, [hasKana, navigate]);

  return hasKana ? <LearnKana /> : null;
}
