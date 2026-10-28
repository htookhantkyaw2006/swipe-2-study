import './LearnKana.css';
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
    <div className="kana-grid-1" >
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
              className="surface-card kana-button-1"
              style={{ border: active ? '2px solid #DB2777' : '1px solid var(--color-border)', backgroundColor: active ? '#FDF2F8' : 'var(--color-card-surface)', transform: active ? 'scale(0.96)' : 'scale(1)' }}
            >
              <span className="kana-label-1" >{kana}</span>
              <span className="kana-label-2" >{cell[2]}</span>
              {level !== 'new' && (
                <span className="kana-label-3"
                  title={LEVELS[level].label}
                  style={{ backgroundColor: LEVELS[level].color }}
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
  <div className="kana-layout-1" >
    <h3 className="kana-heading-1" >
      {children}
    </h3>
    {note && <span className="kana-label-4" >{note}</span>}
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
    <div className="ui-tool-page kana-layout-2" >
      {/* Narrower than Learn Radicals: the chart must stay five columns,
          and at 1000px each kana tile would grow to ~180px. */}
      <div className="kana-layout-3" >
        <div className="kana-layout-4" >

          <header data-tool-header="true" className="flex items-center justify-center relative kana-layout-5" >
            <button className="kana-button-2"
              onClick={() => navigate('/library')}
              aria-label="Back"

            >
              <ChevronLeft size={24} color="var(--color-text-navy)" />
            </button>
            <h1 className="kana-heading-2" >Learn Kana</h1>
          </header>

          <div className="kana-layout-6" >
            <h2 className="kana-heading-3" >
              The two Japanese<br />alphabets
            </h2>
            <p className="kana-copy-1" >
              Learn these and you can sound out any Japanese word.
            </p>
          </div>

          {/* Quiz — the primary action, as on Learn Radicals */}
          <button className="kana-button-3"
            onClick={() => setDrillOpen(true)}
            style={{ background: GRADIENT, boxShadow: `0 10px 20px ${SHADOW}` }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <div className="kana-panel-1" >
              <Zap size={24} color="#FFFFFF" strokeWidth={2.5} />
            </div>
            <div className="kana-layout-7" >
              <h3 className="kana-heading-4" >
                {SCRIPTS[script].label} Quiz
              </h3>
              <p className="kana-copy-2" >
                10 questions · see a kana, pick its sound
              </p>
            </div>
            <ChevronRight size={22} color="#FFFFFF" strokeWidth={2.5} />
          </button>

          {/* Progress for the script on screen */}
          <div className="kana-layout-8" >
            <div className="kana-layout-9" >
              <span className="kana-label-5" >
                {known} of {all.length} {SCRIPTS[script].label.toLowerCase()} known
              </span>
              {started && (
                <button className="kana-button-4"
                  onClick={clearProgress}

                >
                  <RotateCcw size={14} strokeWidth={2.5} /> Reset
                </button>
              )}
            </div>
            <div className="kana-panel-2" >
              <div className="kana-panel-3" style={{ width: `${(known / all.length) * 100}%`, background: GRADIENT }} />
            </div>
          </div>

          {/* Script toggle */}
          <div className="kana-grid-2"
            role="tablist"
            aria-label="Script"

          >
            {Object.entries(SCRIPTS).map(([key, s]) => {
              const active = key === script;
              return (
                <button className="kana-button-5"
                  key={key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setScript(key)}
                  style={{ backgroundColor: active ? '#FFFFFF' : 'transparent', boxShadow: active ? '0 2px 8px rgba(3, 105, 161, 0.12)' : 'none', color: active ? 'var(--color-text-navy)' : 'var(--color-secondary-blue)' }}
                >
                  <span className="kana-label-6" >{s.sample}</span> {s.label}
                </button>
              );
            })}
          </div>
          <p className="kana-copy-3" >
            {SCRIPTS[script].note}
          </p>

          <SectionTitle note="Tap to hear">Basic · 46</SectionTitle>
          <KanaGrid rows={BASIC} scriptIndex={scriptIndex} progress={progress} playing={playing} onPlay={play} />

          <div className="kana-layout-10"  />

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
