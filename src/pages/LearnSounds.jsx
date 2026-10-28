import './LearnSounds.css';
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
      <span className="sounds-label-1" style={{ color }}>{hl}</span>
      {word.slice(i + hl.length)}
    </>
  );
}

function SoundGrid({ sounds, progress, playing, onPlay }) {
  return (
    <div className="sounds-grid-1" >
      {sounds.map((snd) => {
        const level = levelFor(progress[snd.ipa]);
        const active = playing === snd.ipa;
        return (
          <button
            key={snd.ipa}
            onClick={() => onPlay(snd)}
            aria-label={`/${snd.ipa}/ as in ${snd.word}. Play${snd.tricky ? '. ' + snd.tricky : ''}`}
            title={snd.tricky || undefined}
            className="surface-card sounds-button-1"
            style={{ border: active ? `2px solid ${ACCENT}` : snd.tricky ? `2px dashed ${TRICKY}` : '1px solid var(--color-border)', backgroundColor: active ? '#ECFEFF' : 'var(--color-card-surface)', transform: active ? 'scale(0.96)' : 'scale(1)' }}
          >
            <span className="sounds-label-2" >{snd.ipa}</span>
            <span className="sounds-label-3" >
              <MarkedWord word={snd.word} hl={snd.hl} />
            </span>
            {level !== 'new' && (
              <span className="sounds-label-4"
                title={LEVELS[level].label}
                style={{ backgroundColor: LEVELS[level].color }}
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
    <div className="ui-tool-page sounds-layout-1" >
      {/* Same width cap as Learn Kana: a fixed four-column chart would
          grow huge tiles at 1000px. */}
      <div className="sounds-layout-2" >
        <div className="sounds-layout-3" >

          <header data-tool-header="true" className="flex items-center justify-center relative sounds-layout-4" >
            <button className="sounds-button-2"
              onClick={() => navigate('/library')}
              aria-label="Back"

            >
              <ChevronLeft size={24} color="var(--color-text-navy)" />
            </button>
            <h1 className="sounds-heading-1" >Sounds of English</h1>
          </header>

          <div className="sounds-layout-5" >
            <h2 className="sounds-heading-2" >
              The 44 sounds<br />of English
            </h2>
            <p className="sounds-copy-1" >
              Every card shows its pronunciation in these symbols. Learn them and you can say any word you look up.
            </p>
          </div>

          {/* Quiz — the primary action */}
          <button className="sounds-button-3"
            onClick={() => setDrillOpen(true)}
            style={{ background: GRADIENT, boxShadow: `0 10px 20px ${SHADOW}` }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <div className="sounds-panel-1" >
              <Zap size={24} color="#FFFFFF" strokeWidth={2.5} />
            </div>
            <div className="sounds-layout-6" >
              <h3 className="sounds-heading-3" >Sounds Quiz</h3>
              <p className="sounds-copy-2" >
                10 questions · see a symbol, pick the word with that sound
              </p>
            </div>
            <ChevronRight size={22} color="#FFFFFF" strokeWidth={2.5} />
          </button>

          {/* Progress */}
          <div className="sounds-layout-7" >
            <div className="sounds-layout-8" >
              <span className="sounds-label-5" >
                {known} of {all.length} sounds known
              </span>
              {started && (
                <button className="sounds-button-4"
                  onClick={clearProgress}

                >
                  <RotateCcw size={14} strokeWidth={2.5} /> Reset
                </button>
              )}
            </div>
            <div className="sounds-panel-2" >
              <div className="sounds-panel-3" style={{ width: `${(known / all.length) * 100}%`, background: GRADIENT }} />
            </div>
          </div>

          <p className="sounds-copy-3" >
            British pronunciation, as used in Cambridge English exams.
          </p>

          {SOUND_GROUPS.map((group) => (
            <div className="sounds-layout-9" key={group.key} >
              <div className="sounds-layout-10" >
                <h3 className="sounds-heading-4" >
                  {group.label} · {group.sounds.length}
                </h3>
                <span className="sounds-label-6" >
                  {group.note}
                </span>
              </div>

              {/* For Burmese speakers: say which sounds are new, and why. */}
              {group.key === 'consonants' && tricky.length > 0 && (
                <div className="sounds-panel-4" style={{ border: `1px dashed ${TRICKY}` }}>
                  <Info className="sounds-layout-11" size={16} color={TRICKY} strokeWidth={2.5}  />
                  <div className="sounds-layout-12" >
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
