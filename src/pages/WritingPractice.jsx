import './WritingPractice.css';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, PenLine, Play, RotateCcw, Eraser, CheckCircle } from 'lucide-react';
import HanziWriter from 'hanzi-writer';
import strokeData from '../data/strokeData.json';
import { db } from '../lib/db';
import { useCourse } from '../lib/language';

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
  const gridRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState(WRITER_SIZE);
  const [mode, setMode] = useState('idle'); // idle | animating | quizzing
  const [mistakes, setMistakes] = useState(0);
  const [justCompleted, setJustCompleted] = useState(false);

  useEffect(() => {
    const grid = gridRef.current;
    const observer = new ResizeObserver(() => setCanvasSize(Math.max(120, Math.min(WRITER_SIZE, Math.floor(grid.clientWidth)))));
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

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
      width: canvasSize,
      height: canvasSize,
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
  }, [entry.character, canvasSize]);

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
    <div className="surface-card writing-panel-1" >
      {/* Character meta */}
      <div className="writing-layout-1" >
        <div className="writing-layout-2" >
          <h2 className="writing-heading-1" >
            {entry.pronunciation}
          </h2>
          {isMastered && <CheckCircle size={20} color="#16A34A" strokeWidth={3} />}
        </div>
        <p className="writing-copy-1" >
          {entry.definition}
        </p>
        <p className="writing-copy-2" >
          {entry.burmese_definition}
        </p>
      </div>

      {/* Writing grid */}
      <div className="writing-layout-3" >
        <div ref={gridRef} className="writing-panel-2 writing-canvas" aria-label={`Writing grid for ${entry.character}`}>
          {/* Guide lines — the 米字格 practice grid */}
          <svg className="writing-graphic-1"
            viewBox={`0 0 ${WRITER_SIZE} ${WRITER_SIZE}`} width="100%" height="100%"

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

          <div className="writing-layout-4" ref={targetRef}  />

          {!hasData && (
            <div className="writing-layout-5" >
              Writing practice for {entry.character} is not available yet.
            </div>
          )}
        </div>
      </div>

      {/* Status line */}
      <div className="writing-layout-6" >
        {mode === 'quizzing' && (
          <span className="writing-label-1" >
            Trace the character — {mistakes === 0 ? 'no mistakes yet' : `${mistakes} mistake${mistakes > 1 ? 's' : ''}`}
          </span>
        )}
        {mode === 'animating' && (
          <span className="writing-label-1" >
            Watch the stroke order…
          </span>
        )}
        {mode === 'idle' && justCompleted && (
          <span className="writing-label-2" style={{ color: mistakes === 0 ? '#16A34A' : '#CA8A04' }}>
            {mistakes === 0
              ? 'Perfect — character mastered!'
              : `Complete, with ${mistakes} mistake${mistakes > 1 ? 's' : ''}. Try again for a clean run.`}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="writing-layout-7" >
        <button className="writing-button-1"
          onClick={animate}
          disabled={!hasData || mode !== 'idle'}
          style={{ cursor: hasData && mode === 'idle' ? 'pointer' : 'not-allowed', opacity: hasData && mode === 'idle' ? 1 : 0.5 }}
        >
          <Play size={16} strokeWidth={2.5} /> Show me
        </button>

        <button className="writing-button-2"
          onClick={startQuiz}
          disabled={!hasData || mode === 'quizzing'}
          style={{ cursor: hasData && mode !== 'quizzing' ? 'pointer' : 'not-allowed', opacity: hasData && mode !== 'quizzing' ? 1 : 0.5 }}
        >
          <PenLine size={16} strokeWidth={2.5} /> Practise
        </button>

        <button className="writing-button-1"
          onClick={reset}
          disabled={!hasData}
          style={{ cursor: hasData ? 'pointer' : 'not-allowed', opacity: hasData ? 1 : 0.5 }}
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
function WritingPractice({ writingChars }) {
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
  }, [searchParams, writingChars]);

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
    <div className="ui-tool-page writing-layout-8" >
      <div className="writing-layout-9" >
        <div className="writing-layout-10" >

          <header data-tool-header="true" className="flex items-center justify-center relative writing-layout-11" >
            <button aria-label="Back" className="writing-button-3"
              onClick={() => navigate('/library')}

            >
              <ChevronLeft size={24} color="var(--color-text-navy)" />
            </button>
            <h1 className="writing-heading-2" >
              Practise Writing
            </h1>
          </header>

          <div className="writing-layout-12" >
            <h2 className="writing-heading-3" >
              Write it<br />stroke by stroke
            </h2>
            <p className="writing-copy-3" >
              Watch the order, then trace it with your finger.
            </p>
          </div>

          {/* Progress */}
          <div className="writing-layout-13" >
            <span className="writing-label-3" >
              {mastered.length} of {writingChars.length} written cleanly
            </span>
            {mastered.length > 0 && (
              <button className="writing-button-4"
                onClick={resetProgress}

              >
                <RotateCcw size={14} strokeWidth={2.5} /> Reset
              </button>
            )}
          </div>

          <div className="writing-workspace">
          <div className="writing-layout-14" >
            <PracticePanel
              entry={entry}
              isMastered={mastered.includes(entry.character)}
              onMastered={handleMastered}
            />
          </div>

          <aside className="writing-picker">
          {/* Character picker */}
          <h4 className="writing-heading-4" >
            Choose a character
          </h4>
          <div className="writing-grid-1" >
            {writingChars.map((w, idx) => {
              const active = idx === selectedIdx;
              const done = mastered.includes(w.character);
              return (
                <button className="writing-button-5"
                  key={w.character}
                  onClick={() => setSelectedIdx(idx)}
                  style={{ border: active ? '2px solid var(--color-primary-blue)' : '1px solid var(--color-border)', backgroundColor: active ? 'var(--color-ghost-blue)' : 'var(--color-card-surface)' }}
                >
                  {w.character}
                  {done && (
                    <span className="writing-label-4" >
                      <CheckCircle size={12} color="#16A34A" strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          </aside>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   ENTRY — picks the course's character set, or explains why there
   is none. A wrapper rather than an early return inside
   WritingPractice, so that component's hooks always run in order.
   --------------------------------------------------------------- */
export default function WritingPracticePage() {
  const navigate = useNavigate();
  const course = useCourse();

  if (course.writing) return <WritingPractice writingChars={course.writing.chars} />;

  return (
    <div className="writing-layout-15" >
      <header data-tool-header="true" className="flex items-center justify-center relative writing-layout-11" >
        <button className="writing-button-3"
          onClick={() => navigate('/library')}
          aria-label="Back"

        >
          <ChevronLeft size={24} color="var(--color-text-navy)" />
        </button>
        <h1 className="writing-heading-2" >Practise Writing</h1>
      </header>

      <div className="surface-card writing-panel-3" >
        <div className="writing-panel-4" >
          <PenLine size={28} color="#FFFFFF" strokeWidth={2.5} />
        </div>
        <h2 className="writing-heading-5" >
          Not available for {course.name} yet
        </h2>
        <p className="writing-copy-4" >
          {course.copy.writingNote}
        </p>
      </div>
    </div>
  );
}
