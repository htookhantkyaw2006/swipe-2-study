import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, PenLine, Play, RotateCcw, Eraser, CheckCircle, Search, ArrowRight } from 'lucide-react';
import HanziWriter from 'hanzi-writer';
import strokeData from '../data/strokeData.json';
import { db } from '../lib/db';
import { useCourse } from '../lib/language';
import { safeNavigateBack } from '../lib/navigation';

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
   Preserves word context for multi-character words.
   --------------------------------------------------------------- */
function PracticePanel({
  word,
  activeChar,
  charIndex = 0,
  totalChars = 1,
  isCharMastered = false,
  onMastered,
  onSelectCharIndex,
}) {
  const targetRef = useRef(null);
  const writerRef = useRef(null);
  const gridRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState(WRITER_SIZE);
  const [mode, setMode] = useState('idle'); // idle | animating | quizzing
  const [mistakes, setMistakes] = useState(0);
  const [justCompleted, setJustCompleted] = useState(false);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const updateSize = () => {
      const avail = Math.floor(grid.clientWidth || WRITER_SIZE);
      setCanvasSize(Math.max(140, Math.min(WRITER_SIZE, avail)));
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  // Rebuild the writer whenever the character changes or canvas resizes
  useEffect(() => {
    const node = targetRef.current;
    if (!node) return;

    node.innerHTML = '';
    setMode('idle');
    setMistakes(0);
    setJustCompleted(false);

    if (!strokeData[activeChar]) {
      writerRef.current = null;
      return;
    }

    writerRef.current = HanziWriter.create(node, activeChar, {
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
      charDataLoader,
    });

    return () => {
      node.innerHTML = '';
      writerRef.current = null;
    };
  }, [activeChar, canvasSize]);

  const animate = useCallback(() => {
    if (!writerRef.current) return;
    setMode('animating');
    setJustCompleted(false);
    writerRef.current.animateCharacter({
      onComplete: () => setMode((m) => (m === 'animating' ? 'idle' : m)),
    });
  }, []);

  const startQuiz = useCallback(() => {
    if (!writerRef.current) return;
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
        // Mastered only if traced cleanly with 0 mistakes
        if (data.totalMistakes === 0) onMastered(activeChar);
      },
    });
  }, [activeChar, onMastered]);

  const reset = useCallback(() => {
    if (!writerRef.current) return;
    writerRef.current.cancelQuiz();
    writerRef.current.hideCharacter();
    setMode('idle');
    setMistakes(0);
    setJustCompleted(false);
  }, []);

  const hasData = Boolean(strokeData[activeChar]);
  const hasNextChar = totalChars > 1 && charIndex + 1 < totalChars;

  return (
    <div className="surface-card" style={{ borderRadius: '24px', padding: '24px 20px', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}>
      {/* Word / Character Meta */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: 0 }}>
            {word.word || activeChar} <span style={{ fontFamily: 'var(--font-reading)', color: 'var(--color-primary-blue)', fontSize: '1.1rem', fontWeight: 600 }}>({word.pronunciation})</span>
          </h2>
          {isCharMastered && <CheckCircle size={20} color="#16A34A" strokeWidth={3} aria-label="Character mastered" />}
        </div>
        {word.definition && (
          <p style={{ color: 'var(--color-secondary-blue)', fontSize: '0.95rem', margin: '4px 0 0 0', fontWeight: 600 }}>
            {word.definition}
          </p>
        )}
        {word.burmese_definition && (
          <p style={{ color: 'var(--color-secondary-blue)', fontSize: '0.85rem', margin: '2px 0 0 0', opacity: 0.85 }} lang="my">
            {word.burmese_definition}
          </p>
        )}
      </div>

      {/* Multi-character word practice selector */}
      {totalChars > 1 && (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px', flexWrap: 'wrap' }} role="tablist" aria-label="Characters in this word">
          {word.chars.map((char, idx) => {
            const isStepActive = idx === charIndex;
            return (
              <button
                key={`${char}-${idx}`}
                type="button"
                role="tab"
                aria-selected={isStepActive}
                onClick={() => onSelectCharIndex(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '12px',
                  border: isStepActive ? '2px solid var(--color-primary-blue)' : '1px solid var(--color-border)',
                  backgroundColor: isStepActive ? 'var(--color-ghost-blue)' : '#FFFFFF',
                  color: 'var(--color-text-navy)',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>{idx + 1}</span>
                <span style={{ fontSize: '1.1rem' }}>{char}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Active character indicator */}
      <div style={{ fontSize: '0.85rem', color: 'var(--color-secondary-blue)', fontWeight: 600, marginBottom: '12px' }}>
        <span>Practising: <strong style={{ color: 'var(--color-text-navy)', fontSize: '1.1rem' }}>{activeChar}</strong></span>
        {totalChars > 1 && (
          <span style={{ marginLeft: '6px', opacity: 0.8 }}>
            (Character {charIndex + 1} of {totalChars})
          </span>
        )}
      </div>

      {/* Writing grid container — fits viewports down to 320px cleanly */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px', width: '100%' }}>
        <div
          ref={gridRef}
          style={{
            position: 'relative',
            width: canvasSize,
            height: canvasSize,
            maxWidth: '100%',
            borderRadius: '20px',
            backgroundColor: '#FFFFFF',
            border: '2px solid var(--color-border)',
            overflow: 'hidden',
            touchAction: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box'
          }}
          aria-label={`Writing grid for ${activeChar}`}
        >
          {/* Guide lines — the 米字格 practice grid */}
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${WRITER_SIZE} ${WRITER_SIZE}`}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          >
            <line
              x1="0"
              y1={WRITER_SIZE / 2}
              x2={WRITER_SIZE}
              y2={WRITER_SIZE / 2}
              stroke="var(--color-border)"
              strokeWidth="1"
              strokeDasharray="6 6"
            />
            <line
              x1={WRITER_SIZE / 2}
              y1="0"
              x2={WRITER_SIZE / 2}
              y2={WRITER_SIZE}
              stroke="var(--color-border)"
              strokeWidth="1"
              strokeDasharray="6 6"
            />
            <line
              x1="0"
              y1="0"
              x2={WRITER_SIZE}
              y2={WRITER_SIZE}
              stroke="var(--color-border)"
              strokeWidth="1"
              strokeDasharray="6 6"
              opacity="0.5"
            />
            <line
              x1={WRITER_SIZE}
              y1="0"
              x2="0"
              y2={WRITER_SIZE}
              stroke="var(--color-border)"
              strokeWidth="1"
              strokeDasharray="6 6"
              opacity="0.5"
            />
          </svg>

          <div ref={targetRef} style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />

          {!hasData && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', padding: '16px', fontSize: '0.8rem',
              color: 'var(--color-secondary-blue)', textAlign: 'center'
            }}>
              Writing practice for {activeChar} is not available yet.
            </div>
          )}
        </div>
      </div>

      {/* Status line */}
      <div style={{ minHeight: '28px', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: mistakes === 0 ? '#16A34A' : '#CA8A04' }}>
              {mistakes === 0
                ? 'Perfect — character mastered!'
                : `Complete, with ${mistakes} mistake${mistakes > 1 ? 's' : ''}. Try again for a clean run.`}
            </span>
            {mistakes === 0 && hasNextChar && (
              <button
                type="button"
                onClick={() => onSelectCharIndex(charIndex + 1)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: 'var(--color-primary-blue)',
                  color: '#FFFFFF',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Next: {word.chars[charIndex + 1]} <ArrowRight size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
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
          type="button"
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
          type="button"
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
function WritingPractice({ writingChars, writingWords }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedWordIdx, setSelectedWordIdx] = useState(0);
  const [selectedCharInWordIdx, setSelectedCharInWordIdx] = useState(0);
  const [mastered, setMastered] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Adapt input: if writingWords is provided, use it; otherwise synthesize from writingChars
  const words = useMemo(() => {
    if (Array.isArray(writingWords) && writingWords.length > 0) {
      return writingWords;
    }
    return (writingChars || []).map((c, i) => ({
      id: `w_${i}`,
      word: c.word || c.character,
      pronunciation: c.pronunciation,
      definition: c.definition,
      burmese_definition: c.burmese_definition,
      chars: c.chars || (c.character ? [c.character] : (c.word ? [...c.word] : ['一'])),
    }));
  }, [writingWords, writingChars]);

  // Total unique characters covered
  const totalUniqueChars = useMemo(() => {
    if (Array.isArray(writingChars) && writingChars.length > 0) {
      return writingChars.length;
    }
    const set = new Set();
    for (const w of words) {
      for (const c of w.chars || []) set.add(c);
    }
    return set.size;
  }, [writingChars, words]);

  // Restore legacy mastery compatibility: supports { character }, { char }, or string records
  useEffect(() => {
    const records = db.get('written_chars') || [];
    const list = records
      .map((r) => r?.character || r?.char || (typeof r === 'string' ? r : null))
      .filter(Boolean);
    setMastered(Array.from(new Set(list)));
  }, []);

  // Handle URL deep-linking: ?char=X or ?word=Y
  useEffect(() => {
    const requestedWord = searchParams.get('word');
    const requestedChar = searchParams.get('char');

    if (requestedWord) {
      const idx = words.findIndex((w) => w.word === requestedWord);
      if (idx > -1) {
        setSelectedWordIdx(idx);
        setSelectedCharInWordIdx(0);
        return;
      }
    }

    if (requestedChar) {
      const exactIdx = words.findIndex((w) => w.word === requestedChar);
      if (exactIdx > -1) {
        setSelectedWordIdx(exactIdx);
        setSelectedCharInWordIdx(0);
        return;
      }
      const containingIdx = words.findIndex((w) => w.chars && w.chars.includes(requestedChar));
      if (containingIdx > -1) {
        setSelectedWordIdx(containingIdx);
        const charIdx = words[containingIdx].chars.indexOf(requestedChar);
        setSelectedCharInWordIdx(charIdx > -1 ? charIdx : 0);
      }
    }
  }, [searchParams, words]);

  const handleMastered = useCallback((character) => {
    if (!character) return;
    const existing = db.get('written_chars') || [];
    if (existing.some((r) => (r?.character || r?.char || (typeof r === 'string' ? r : null)) === character)) return;
    db.insert('written_chars', { character });
    setMastered((prev) => (prev.includes(character) ? prev : [...prev, character]));
  }, []);

  const resetProgress = () => {
    db.set('written_chars', []);
    setMastered([]);
  };

  const selectedWord = words[selectedWordIdx] || words[0] || {
    word: '一',
    pronunciation: 'yī',
    definition: 'one',
    burmese_definition: 'တစ်',
    chars: ['一'],
  };

  const activeChar =
    selectedWord.chars && selectedWord.chars[selectedCharInWordIdx]
      ? selectedWord.chars[selectedCharInWordIdx]
      : selectedWord.chars?.[0] || selectedWord.word?.[0] || '一';

  const filteredWords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return words;
    return words.filter((w) => {
      return (
        w.word.toLowerCase().includes(q) ||
        (w.pronunciation && w.pronunciation.toLowerCase().includes(q)) ||
        (w.definition && w.definition.toLowerCase().includes(q)) ||
        (w.burmese_definition && w.burmese_definition.includes(q)) ||
        (w.chars && w.chars.some((c) => c.includes(q)))
      );
    });
  }, [words, searchQuery]);

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: '100px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div style={{ padding: '24px 20px 16px 20px' }}>

          <header className="flex items-center justify-center relative" style={{ marginBottom: '32px' }}>
            <button
              onClick={() => safeNavigateBack(navigate, '/library')}
              aria-label="Back"
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
              {mastered.length} of {totalUniqueChars} characters written cleanly
            </span>
            {mastered.length > 0 && (
              <button
                type="button"
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

          <div style={{ marginBottom: '24px' }}>
            <PracticePanel
              word={selectedWord}
              activeChar={activeChar}
              charIndex={selectedCharInWordIdx}
              totalChars={selectedWord.chars?.length || 1}
              isCharMastered={mastered.includes(activeChar)}
              onMastered={handleMastered}
              onSelectCharIndex={(idx) => setSelectedCharInWordIdx(idx)}
            />
          </div>

          {/* Word / Character picker */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <h4 style={{
              fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: '0.5px', color: 'var(--color-secondary-blue)', margin: 0
            }}>
              Choose a word ({filteredWords.length})
            </h4>
            {words.length > 8 && (
              <div style={{ position: 'relative', width: '200px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                <input
                  type="search"
                  placeholder="Search word or pinyin..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%', padding: '6px 12px 6px 30px', borderRadius: '10px',
                    border: '1px solid var(--color-border)', backgroundColor: '#FFFFFF',
                    fontSize: '0.8rem', color: 'var(--color-text-navy)', outline: 'none'
                  }}
                />
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: '10px' }}>
            {filteredWords.map((w, idx) => {
              const active = w.word === selectedWord.word;
              const allCharsMastered = (w.chars || [w.word]).every((c) => mastered.includes(c));
              return (
                <button
                  key={w.word || idx}
                  type="button"
                  onClick={() => {
                    const originalIdx = words.findIndex((item) => item.word === w.word);
                    if (originalIdx > -1) {
                      setSelectedWordIdx(originalIdx);
                      setSelectedCharInWordIdx(0);
                    }
                  }}
                  style={{
                    position: 'relative', aspectRatio: '1', borderRadius: '16px', cursor: 'pointer',
                    border: active ? '2px solid var(--color-primary-blue)' : '1px solid var(--color-border)',
                    backgroundColor: active ? 'var(--color-ghost-blue)' : 'var(--color-card-surface)',
                    fontSize: w.word.length > 2 ? '1rem' : w.word.length > 1 ? '1.25rem' : '1.5rem',
                    fontWeight: 800, color: 'var(--color-text-navy)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'border-color 0.2s, background-color 0.2s',
                    padding: '4px'
                  }}
                  title={w.word}
                  aria-label={`Select ${w.word}`}
                >
                  {w.word}
                  {allCharsMastered && (
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

/* ---------------------------------------------------------------
   ENTRY — picks the course's character set, or explains why there
   is none.
   --------------------------------------------------------------- */
export default function WritingPracticePage() {
  const navigate = useNavigate();
  const course = useCourse();

  if (course.writing) {
    return (
      <WritingPractice
        writingChars={course.writing.chars}
        writingWords={course.writing.words}
      />
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '600px', margin: '0 auto', paddingBottom: '100px' }}>
      <header className="flex items-center justify-center relative" style={{ marginBottom: '32px' }}>
        <button
          onClick={() => safeNavigateBack(navigate, '/library')}
          aria-label="Back"
          style={{ position: 'absolute', left: 0, background: 'transparent', padding: '8px', border: 'none', cursor: 'pointer', zIndex: 10 }}
        >
          <ChevronLeft size={24} color="var(--color-text-navy)" />
        </button>
        <h1 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--color-text-navy)', fontWeight: 800 }}>Practise Writing</h1>
      </header>

      <div className="surface-card" style={{ borderRadius: '24px', padding: '32px 24px', textAlign: 'center' }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '20px', margin: '0 auto 16px auto',
          background: 'linear-gradient(135deg, #5EEAD4 0%, #0F766E 100%)',
          boxShadow: '0 8px 16px rgba(15, 118, 110, 0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <PenLine size={28} color="#FFFFFF" strokeWidth={2.5} />
        </div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 8px 0' }}>
          Not available for {course.name} yet
        </h2>
        <p style={{ fontSize: '0.95rem', lineHeight: 1.5, color: 'var(--color-secondary-blue)', margin: 0, fontWeight: 500 }}>
          {course.copy.writingNote}
        </p>
      </div>
    </div>
  );
}
