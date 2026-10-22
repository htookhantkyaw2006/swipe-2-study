import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Zap, RotateCcw, Info } from 'lucide-react';
import { SOUND_GROUPS, SOUND_LOOK_ALIKES, soundList } from '../courses/en-sounds';
import SymbolDrill from '../components/SymbolDrill';
import { readSoundProgress, recordSoundAnswer, resetSoundProgress, levelFor, countKnown, LEVELS } from '../lib/soundProgress';
import { speak } from '../lib/speech';
import { useCourse } from '../lib/language';

/* ---------------------------------------------------------------
   SOUNDS OF ENGLISH
   ---------------------------------------------------------------
   The English counterpart of Learn Kana. Every English card shows its
   pronunciation in IPA, so this chart is what makes those symbols
   readable: each sound with a word that has it, the letters that make
   the sound highlighted, and the word spoken when tapped.

   Speech synthesis cannot say an isolated sound like /θ/ reliably, so
   tapping plays the example word instead.
   --------------------------------------------------------------- */

const GRADIENT = 'linear-gradient(135deg, #67E8F9 0%, #0891B2 100%)';
const SHADOW = 'rgba(8, 145, 178, 0.3)';
const ACCENT = '#0891B2';
const TRICKY = '#F97316';

/** "think" with "th" emphasised — the letters that make the sound. */
export function MarkedWord({ word, hl, color = ACCENT }) {
  const i = word.indexOf(hl);
  if (i < 0) return <>{word}</>;
  return (
    <>
      {word.slice(0, i)}
      <span style={{ color, fontWeight: 800, textDecoration: 'underline', textUnderlineOffset: '2px' }}>{hl}</span>
      {word.slice(i + hl.length)}
    </>
  );
}

function SoundGrid({ sounds, progress, playing, onPlay }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
      {sounds.map((snd) => {
        const level = levelFor(progress[snd.ipa]);
        const active = playing === snd.ipa;
        return (
          <button
            key={snd.ipa}
            onClick={() => onPlay(snd)}
            aria-label={`/${snd.ipa}/ as in ${snd.word}. Play${snd.tricky ? '. ' + snd.tricky : ''}`}
            title={snd.tricky || undefined}
            className="surface-card"
            style={{
              position: 'relative', aspectRatio: '1', borderRadius: '16px', cursor: 'pointer', padding: '4px',
              // Dashed: a sound Burmese does not have.
              border: active ? `2px solid ${ACCENT}` : snd.tricky ? `2px dashed ${TRICKY}` : '1px solid var(--color-border)',
              backgroundColor: active ? '#ECFEFF' : 'var(--color-card-surface)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px',
              transition: 'transform 0.15s, background-color 0.2s, border-color 0.2s',
              transform: active ? 'scale(0.96)' : 'scale(1)'
            }}
          >
            <span style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--color-text-navy)', lineHeight: 1.1 }}>{snd.ipa}</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-secondary-blue)' }}>
              <MarkedWord word={snd.word} hl={snd.hl} />
            </span>
            {level !== 'new' && (
              <span
                title={LEVELS[level].label}
                style={{ position: 'absolute', top: '6px', right: '6px', width: '7px', height: '7px', borderRadius: '50%', backgroundColor: LEVELS[level].color }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function LearnSounds() {
  const navigate = useNavigate();
  const [progress, setProgress] = useState({});
  const [drillOpen, setDrillOpen] = useState(false);
  const [playing, setPlaying] = useState(null);

  useEffect(() => { setProgress(readSoundProgress()); }, []);
  const refreshProgress = useCallback(() => setProgress(readSoundProgress()), []);

  const all = useMemo(() => soundList(), []);
  const known = countKnown(progress);
  const started = Object.keys(progress).length > 0;
  const tricky = all.filter((s) => s.tricky);

  const items = useMemo(
    () => all.map((s) => ({ key: s.ipa, glyph: `/${s.ipa}/`, answer: s.word, say: s.word, hl: s.hl })),
    [all]
  );

  const play = useCallback((snd) => {
    speak(snd.word);
    setPlaying(snd.ipa);
    window.setTimeout(() => setPlaying((p) => (p === snd.ipa ? null : p)), 350);
  }, []);

  const clearProgress = () => {
    if (!window.confirm('Reset sound progress? Your quiz history will be erased.')) return;
    resetSoundProgress();
    refreshProgress();
  };

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: '100px', fontFamily: 'Inter, sans-serif' }}>
      {/* Same width cap as Learn Kana: a fixed four-column chart would
          grow huge tiles at 1000px. */}
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
            <h1 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--color-text-navy)', fontWeight: 800 }}>Sounds of English</h1>
          </header>

          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '2rem', color: 'var(--color-text-navy)', margin: '0 0 8px 0', fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
              The 44 sounds<br />of English
            </h2>
            <p style={{ color: 'var(--color-secondary-blue)', fontSize: '1rem', margin: 0, fontWeight: 500 }}>
              Every card shows its pronunciation in these symbols. Learn them and you can say any word you look up.
            </p>
          </div>

          {/* Quiz — the primary action */}
          <button
            onClick={() => setDrillOpen(true)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '16px',
              padding: '20px', borderRadius: '24px', border: 'none', cursor: 'pointer',
              background: GRADIENT, boxShadow: `0 10px 20px ${SHADOW}`,
              textAlign: 'left', marginBottom: '20px', transition: 'transform 0.2s'
            }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <div style={{ width: '52px', height: '52px', flexShrink: 0, borderRadius: '16px', backgroundColor: 'rgba(255, 255, 255, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={24} color="#FFFFFF" strokeWidth={2.5} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#FFFFFF' }}>Sounds Quiz</h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.92)', fontWeight: 500 }}>
                10 questions · see a symbol, pick the word with that sound
              </p>
            </div>
            <ChevronRight size={22} color="#FFFFFF" strokeWidth={2.5} />
          </button>

          {/* Progress */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-secondary-blue)' }}>
                {known} of {all.length} sounds known
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

          <p style={{ fontSize: '0.8rem', color: 'var(--color-secondary-blue)', fontWeight: 600, margin: '0 0 24px 4px' }}>
            British pronunciation, as used in Cambridge English exams.
          </p>

          {SOUND_GROUPS.map((group) => (
            <div key={group.key} style={{ marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', margin: '0 0 12px 0' }}>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-secondary-blue)', margin: 0 }}>
                  {group.label} · {group.sounds.length}
                </h3>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-secondary-blue)', opacity: 0.85, textAlign: 'right' }}>
                  {group.note}
                </span>
              </div>

              {/* For Burmese speakers: say which sounds are new, and why. */}
              {group.key === 'consonants' && tricky.length > 0 && (
                <div style={{
                  display: 'flex', gap: '10px', alignItems: 'flex-start',
                  padding: '12px 14px', borderRadius: '14px', marginBottom: '12px',
                  backgroundColor: '#FFF7ED', border: `1px dashed ${TRICKY}`
                }}>
                  <Info size={16} color={TRICKY} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '0.8rem', lineHeight: 1.5, color: 'var(--color-text-navy)', fontWeight: 500 }}>
                    {tricky.map((t) => (
                      <div key={t.ipa}><strong>/{t.ipa}/</strong> {t.tricky}</div>
                    ))}
                  </div>
                </div>
              )}

              <SoundGrid sounds={group.sounds} progress={progress} playing={playing} onPlay={play} />
            </div>
          ))}

        </div>
      </div>

      {drillOpen && (
        <SymbolDrill
          items={items}
          progress={progress}
          lookAlikes={SOUND_LOOK_ALIKES}
          record={recordSoundAnswer}
          onRecorded={refreshProgress}
          onClose={() => { setDrillOpen(false); refreshProgress(); }}
          label="Sounds"
          question="Which word has this sound?"
          unit="sound"
          gradient={GRADIENT}
          shadow={SHADOW}
          accent={ACCENT}
          accentSoft="#CFFAFE"
          renderReveal={(q) => <>as in <MarkedWord word={q.answer} hl={q.hl} /></>}
        />
      )}
    </div>
  );
}

/* Only the English course has this chart. Reached in another language,
   send the learner to the Library rather than show the wrong sounds. */
export default function LearnSoundsPage() {
  const navigate = useNavigate();
  const course = useCourse();
  const hasSounds = course.exploreTools.some((t) => t.key === 'sounds' && t.path);

  useEffect(() => {
    if (!hasSounds) navigate('/library', { replace: true });
  }, [hasSounds, navigate]);

  return hasSounds ? <LearnSounds /> : null;
}
