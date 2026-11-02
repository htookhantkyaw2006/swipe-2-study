import './WritingPractice.css';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, PenLine, Play, RotateCcw, Eraser, CheckCircle, Search, ArrowRight } from 'lucide-react';
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
   Preserves word context for multi-character words and repeated characters.
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
    const observer = new ResizeObserver(() =>
      setCanvasSize(Math.max(120, Math.min(WRITER_SIZE, Math.floor(grid.clientWidth))))
    );
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
    <div className="surface-card writing-panel-1">
      {/* Word Context: Authentic pronunciation & bilingual definitions */}
      <div className="writing-layout-1">
        <div className="writing-layout-2">
          <h2 className="writing-heading-1">
            {word.word} <span className="writing-reading">({word.pronunciation})</span>
          </h2>
          {isCharMastered && <CheckCircle size={20} color="#16A34A" strokeWidth={3} aria-label="Character mastered" />}
        </div>
        <p className="writing-copy-1">{word.definition}</p>
        <p className="writing-copy-2" lang="my">{word.burmese_definition}</p>
      </div>

      {/* Multi-character word practice selector */}
      {totalChars > 1 && (
        <div className="writing-char-steps" role="tablist" aria-label="Characters in this word">
          {word.chars.map((char, idx) => {
            const isStepActive = idx === charIndex;
            return (
              <button
                key={`${char}-${idx}`}
                type="button"
                role="tab"
                aria-selected={isStepActive}
                className={`writing-char-step${isStepActive ? ' writing-char-step--active' : ''}`}
                onClick={() => onSelectCharIndex(idx)}
              >
                <span className="writing-char-step__num">{idx + 1}</span>
                <span className="writing-char-step__char">{char}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Character indicator */}
      <div className="writing-active-indicator">
        <span>Practising: <strong>{activeChar}</strong></span>
        {totalChars > 1 && (
          <span className="writing-active-indicator__pos">
            (Character {charIndex + 1} of {totalChars})
          </span>
        )}
      </div>

      {/* Writing grid */}
      <div className="writing-layout-3">
        <div ref={gridRef} className="writing-panel-2 writing-canvas" aria-label={`Writing grid for ${activeChar}`}>
          {/* Guide lines — the 米字格 practice grid */}
          <svg
            className="writing-graphic-1"
            viewBox={`0 0 ${WRITER_SIZE} ${WRITER_SIZE}`}
            width="100%"
            height="100%"
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

          <div className="writing-layout-4" ref={targetRef} />

          {!hasData && (
            <div className="writing-layout-5">
              Writing practice for {activeChar} is not available yet.
            </div>
          )}
        </div>
      </div>

      {/* Status line */}
      <div className="writing-layout-6">
        {mode === 'quizzing' && (
          <span className="writing-label-1">
            Trace the character — {mistakes === 0 ? 'no mistakes yet' : `${mistakes} mistake${mistakes > 1 ? 's' : ''}`}
          </span>
        )}
        {mode === 'animating' && (
          <span className="writing-label-1">
            Watch the stroke order…
          </span>
        )}
        {mode === 'idle' && justCompleted && (
          <div className="writing-completion-feedback">
            <span className="writing-label-2" style={{ color: mistakes === 0 ? '#16A34A' : '#CA8A04' }}>
              {mistakes === 0
                ? 'Perfect — character mastered!'
                : `Complete, with ${mistakes} mistake${mistakes > 1 ? 's' : ''}. Try again for a clean run.`}
            </span>
            {mistakes === 0 && hasNextChar && (
              <button
                type="button"
                className="writing-next-char-btn"
                onClick={() => onSelectCharIndex(charIndex + 1)}
              >
                Next character: {word.chars[charIndex + 1]} <ArrowRight size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="writing-layout-7">
        <button
          type="button"
          className="writing-button-1"
          onClick={animate}
          disabled={!hasData || mode !== 'idle'}
          style={{ cursor: hasData && mode === 'idle' ? 'pointer' : 'not-allowed', opacity: hasData && mode === 'idle' ? 1 : 0.5 }}
        >
          <Play size={16} strokeWidth={2.5} /> Show me
        </button>

        <button
          type="button"
          className="writing-button-2"
          onClick={startQuiz}
          disabled={!hasData || mode === 'quizzing'}
          style={{ cursor: hasData && mode !== 'quizzing' ? 'pointer' : 'not-allowed', opacity: hasData && mode !== 'quizzing' ? 1 : 0.5 }}
        >
          <PenLine size={16} strokeWidth={2.5} /> Practise
        </button>

        <button
          type="button"
          className="writing-button-1"
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
      chars: [c.character],
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

  useEffect(() => {
    const records = db.get('written_chars') || [];
    const list = records
      .map((r) => r?.character || r?.char || (typeof r === 'string' ? r : null))
      .filter(Boolean);
    setMastered(Array.from(new Set(list)));
  }, []);

  // Handle URL deep-linking: ?char=X or ?word=Y
  useEffect(() => {
    const requestedChar = searchParams.get('char');
    const requestedWord = searchParams.get('word');

    if (requestedWord) {
      const idx = words.findIndex((w) => w.word === requestedWord);
      if (idx > -1) {
        setSelectedWordIdx(idx);
        setSelectedCharInWordIdx(0);
        return;
      }
    }

    if (requestedChar) {
      // Find word containing requested character
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
    <div className="ui-tool-page writing-layout-8">
      <div className="writing-layout-9">
        <div className="writing-layout-10">
          <header data-tool-header="true" className="flex items-center justify-center relative writing-layout-11">
            <button
              aria-label="Back"
              className="writing-button-3"
              onClick={() => navigate('/library')}
            >
              <ChevronLeft size={24} color="var(--color-text-navy)" />
            </button>
            <h1 className="writing-heading-2">Practise Writing</h1>
          </header>

          <div className="writing-layout-12">
            <h2 className="writing-heading-3">
              Write it<br />stroke by stroke
            </h2>
            <p className="writing-copy-3">
              Watch the stroke order, then trace each Hanzi character cleanly.
            </p>
          </div>

          {/* Progress — independent of vocabulary learned status */}
          <div className="writing-layout-13">
            <span className="writing-label-3">
              {mastered.length} of {totalUniqueChars} characters written cleanly
            </span>
            {mastered.length > 0 && (
              <button
                type="button"
                className="writing-button-4"
                onClick={resetProgress}
              >
                <RotateCcw size={14} strokeWidth={2.5} /> Reset
              </button>
            )}
          </div>

          <div className="writing-workspace">
            <div className="writing-layout-14">
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

            <aside className="writing-picker">
              <div className="writing-picker__header">
                <h4 className="writing-heading-4">Choose a word ({filteredWords.length})</h4>
                <div className="writing-picker__search">
                  <Search size={14} className="writing-picker__search-icon" aria-hidden="true" />
                  <input
                    type="search"
                    className="writing-picker__search-input"
                    placeholder="Search word or pinyin..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search vocabulary words"
                  />
                </div>
              </div>

              <div className="writing-grid-1">
                {filteredWords.map((w) => {
                  const originalIdx = words.findIndex((item) => item.id === w.id);
                  const active = originalIdx === selectedWordIdx;
                  const wordChars = w.chars || [w.word];
                  const allCharsMastered = wordChars.length > 0 && wordChars.every((c) => mastered.includes(c));

                  return (
                    <button
                      type="button"
                      className={`writing-button-5${active ? ' writing-button-5--active' : ''}`}
                      key={w.id || w.word}
                      onClick={() => {
                        setSelectedWordIdx(originalIdx > -1 ? originalIdx : 0);
                        setSelectedCharInWordIdx(0);
                      }}
                      style={{
                        border: active
                          ? '2px solid var(--color-primary-blue)'
                          : '1px solid var(--color-border)',
                        backgroundColor: active
                          ? 'var(--color-ghost-blue)'
                          : 'var(--color-card-surface)',
                      }}
                      title={`${w.word} (${w.pronunciation})`}
                    >
                      <span className="writing-button-5__word">{w.word}</span>
                      <span className="writing-button-5__reading">{w.pronunciation}</span>
                      {allCharsMastered && (
                        <span className="writing-label-4" aria-label="All characters mastered">
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

  if (course.writing) {
    return (
      <WritingPractice
        writingChars={course.writing.chars}
        writingWords={course.writing.words}
      />
    );
  }

  return (
    <div className="writing-layout-15">
      <header data-tool-header="true" className="flex items-center justify-center relative writing-layout-11">
        <button
          className="writing-button-3"
          onClick={() => navigate('/library')}
          aria-label="Back"
        >
          <ChevronLeft size={24} color="var(--color-text-navy)" />
        </button>
        <h1 className="writing-heading-2">Practise Writing</h1>
      </header>

      <div className="surface-card writing-panel-3">
        <div className="writing-panel-4">
          <PenLine size={28} color="#FFFFFF" strokeWidth={2.5} />
        </div>
        <h2 className="writing-heading-5">
          Not available for {course.name} yet
        </h2>
        <p className="writing-copy-4">
          {course.copy.writingNote}
        </p>
      </div>
    </div>
  );
}
