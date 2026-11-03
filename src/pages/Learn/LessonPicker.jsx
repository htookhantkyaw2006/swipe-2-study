import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft, Layers, Compass, ChevronRight,
  RotateCw, CheckCircle2, Bookmark, Search, CheckCircle, Volume2
} from 'lucide-react';
import { useCourse } from '../../lib/language';
import { db } from '../../lib/db';
import { readingOf, kanaOf, wordOf } from '../../lib/entry';
import { speak } from '../../lib/speech';
import { playWordAudio } from '../../lib/wordAudio';
import { getLevelProgress } from '../../lib/vocabularyProgress';
import { filterStudyWords } from '../../lib/studyWords';
import { usePublishedCourse } from '../../lib/publishedContentContext';
import { storageOwner } from '../../lib/storageOwner';

export default function LessonPicker() {
  const navigate = useNavigate();
  const { levelId } = useParams();
  const course = useCourse();
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsubChange = storageOwner.subscribeChange(() => setTick(t => t + 1));
    const unsubOwner = storageOwner.subscribe(() => setTick(t => t + 1));
    return () => {
      unsubChange?.();
      unsubOwner?.();
    };
  }, []);

  // Accept both URL shapes in use: /learn/level/HSK1 and /learn/level/1
  const level =
    course.levels.find((l) => l.id === levelId) ||
    course.levels.find((l) => String(l.num) === String(levelId).replace(/\D/g, '')) ||
    course.levels[0];

  const colors = level;
  const publishedCourse = usePublishedCourse(level.id);
  const isPublishedLevel = publishedCourse.enabled && publishedCourse.isInScope;

  const words = useMemo(() => {
    if (isPublishedLevel) {
      return publishedCourse.isLoaded ? publishedCourse.items : [];
    }
    if (publishedCourse.enabled && !publishedCourse.isInScope) {
      return [];
    }
    return db.get('flashcards').filter((c) => c.level === level.id);
  }, [isPublishedLevel, publishedCourse.isLoaded, publishedCourse.items, publishedCourse.enabled, publishedCourse.isInScope, level.id]);

  const [query, setQuery] = useState('');
  const [hoverRow, setHoverRow] = useState(null);

  const curriculumTarget = isPublishedLevel
    ? (publishedCourse.isLoaded ? publishedCourse.items : 0)
    : (publishedCourse.enabled ? 0 : null);

  const progress = getLevelProgress(db, level.id, course, null, curriculumTarget);
  const completed = progress.uniqueLearned;
  const totalWords = words.length > 0 ? words.length : (progress.words || level.words || 0);
  const pct = totalWords > 0 ? Math.min(100, Math.floor((completed / totalWords) * 100)) : 0;
  const levelDone = completed >= totalWords && totalWords > 0;

  const reviewCount = db.get('review_cards')?.length || 0;
  const savedCount = db.get('saved_words')?.length || 0;

  const visibleWords = useMemo(() => {
    if (!query.trim()) return words;
    return filterStudyWords(words, query);
  }, [words, query]);

  const activeAudioRef = useRef(null);
  useEffect(() => () => activeAudioRef.current?.cancel(), []);

  const handlePlayWord = (e, word) => {
    e.stopPropagation();
    activeAudioRef.current?.cancel();
    activeAudioRef.current = playWordAudio(word, { speakFn: speak });
  };

  const stack = Boolean(course.script.stackReading);
  const headers = stack
    ? [course.script.writtenForm, 'Meaning', 'Status']
    : [course.script.writtenForm, course.script.romanization, 'Meaning', 'Status'];

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', paddingBottom: '120px' }}>

      {/* Header Row */}
      <header className="flex justify-between items-center" style={{ marginBottom: '24px' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'transparent', padding: '8px', marginLeft: '-8px', border: 'none', cursor: 'pointer' }}>
          <ChevronLeft size={24} color="var(--color-text-navy)" />
        </button>
        <h1 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--color-text-navy)', fontWeight: 800 }}>{level.name}</h1>
        <div style={{ width: '40px' }}></div>
      </header>

      {/* Responsive Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))',
        gap: '32px'
      }}>

        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

          {/* Blue Hero Header */}
          <div style={{
            background: `linear-gradient(135deg, ${colors.gradientStart} 0%, ${colors.gradientEnd} 100%)`,
            color: 'white',
            borderRadius: '24px',
            padding: '32px 24px',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: `0 12px 24px ${colors.shadow}`
          }}>
            <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: '150px', height: '40px', background: 'rgba(255,255,255,0.1)', borderTopLeftRadius: '10px', borderBottomLeftRadius: '10px' }}></div>

            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '1px', opacity: 0.9, marginBottom: '8px', textTransform: 'uppercase' }}>
              {level.tier || 'BEGINNER'}
            </div>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 800, margin: '0 0 16px 0', lineHeight: 1, color: 'white' }}>
              {level.name}
            </h2>
            <div style={{ fontSize: '1rem', opacity: 0.9, marginBottom: '24px' }}>
              {totalWords.toLocaleString()} vocabulary words
            </div>

            {/* Progress Bar */}
            <div style={{ width: '70%', height: '8px', backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: '4px', marginBottom: '8px' }}>
              <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#FFFFFF', borderRadius: '4px' }}></div>
            </div>
            <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>{completed.toLocaleString()} mastered</div>
          </div>

          {/* Modules Section */}
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', marginBottom: '16px' }}>
              {level.name} course modules
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Flashcards Module */}
              <div className="surface-card flex items-center justify-between" style={{ padding: '20px', borderRadius: '24px', cursor: 'pointer', position: 'relative', overflow: 'hidden' }} onClick={() => navigate(`/learn/level/${level.id}/session`)}>
                <div style={{ position: 'absolute', right: '-10px', bottom: '-20px', fontSize: '6rem', color: 'var(--color-ghost-blue)', fontWeight: 800, opacity: 0.5, zIndex: 0 }}>{course.copy.flashcardsWatermark}</div>
                <div className="flex items-center" style={{ gap: '16px', position: 'relative', zIndex: 1 }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '16px', backgroundColor: '#EFF6FF', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Layers size={28} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h4 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>Flashcards</h4>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', margin: 0 }}>{completed.toLocaleString()} of {totalWords.toLocaleString()} words mastered</p>
                  </div>
                </div>
                <div className="flex items-center" style={{ gap: '8px', position: 'relative', zIndex: 1 }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#3B82F6' }}>{pct}%</span>
                  <ChevronRight size={20} color="var(--color-secondary-blue)" />
                </div>
                {pct > 0 && <div style={{ position: 'absolute', bottom: 0, left: '92px', width: `calc((100% - 176px) * ${pct / 100})`, height: '5px', backgroundColor: '#3B82F6', borderRadius: '2.5px 2.5px 0 0' }}></div>}
              </div>

              {/* Explore Module */}
              <div className="surface-card flex items-center justify-between" style={{ padding: '20px', borderRadius: '24px', cursor: 'pointer', position: 'relative', overflow: 'hidden' }} onClick={() => navigate('/library')}>
                <div style={{ position: 'absolute', right: '-10px', bottom: '-20px', fontSize: '6rem', color: 'var(--color-ghost-blue)', fontWeight: 800, opacity: 0.5, zIndex: 0 }}>{course.copy.exploreWatermark}</div>
                <div className="flex items-center" style={{ gap: '16px', position: 'relative', zIndex: 1 }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '16px', backgroundColor: '#FEF9C3', color: '#EAB308', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Compass size={28} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h4 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>Explore</h4>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', margin: 0 }}>Browse by topic</p>
                  </div>
                </div>
                <div className="flex items-center" style={{ gap: '8px', position: 'relative', zIndex: 1 }}>
                  <ChevronRight size={20} color="var(--color-secondary-blue)" />
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

          {/* Flashcard Practice */}
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', marginBottom: '16px' }}>Flashcard practice</h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>

              <div className="surface-card" style={{ padding: '20px', borderRadius: '24px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '20px' }} onClick={() => navigate('/learn/review')}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#FEF2F2', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <RotateCw size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>Review</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-secondary-blue)', margin: 0 }}>{reviewCount} due</p>
                </div>
              </div>

              <div className="surface-card" style={{ padding: '20px', borderRadius: '24px', cursor: 'default', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#ECFDF5', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle2 size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>Known</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-secondary-blue)', margin: 0 }}>{completed.toLocaleString()} mastered</p>
                </div>
              </div>

              <div className="surface-card" style={{ padding: '20px', borderRadius: '24px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '20px' }} onClick={() => navigate('/saved')}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#F5F3FF', color: '#8B5CF6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bookmark size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>Saved Words</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-secondary-blue)', margin: 0 }}>{savedCount} saved</p>
                </div>
              </div>

            </div>
          </div>

          {/* Browse Words */}
          <div>
            <div className="flex justify-between items-center" style={{ marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: 0 }}>Browse Words</h3>
              <div style={{ position: 'relative', width: '220px' }}>
                <input
                  type="text"
                  placeholder="Search..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 16px 10px 40px', borderRadius: '100px',
                    border: 'none', backgroundColor: 'var(--color-ghost-blue)',
                    fontSize: '0.875rem', color: 'var(--color-text-navy)', outline: 'none',
                    fontWeight: 500
                  }}
                />
                <Search size={18} color="var(--color-secondary-blue)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>
            </div>

            <div className="surface-card" style={{ borderRadius: '16px', overflow: 'hidden', padding: 0, border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: stack ? 'auto minmax(0, 1fr) auto' : 'auto auto minmax(0, 1fr) auto' }}>

                {/* Header */}
                {headers.map((label, i) => (
                  <div
                    key={label}
                    style={{
                      padding: '12px 10px', backgroundColor: 'var(--color-ghost-blue)',
                      borderBottom: '2px solid var(--color-border)',
                      borderRight: i < headers.length - 1 ? '1px solid var(--color-border)' : 'none',
                      textAlign: i === 0 || i === headers.length - 1 ? 'center' : 'left',
                      fontWeight: 700, fontSize: '0.7rem', color: 'var(--color-secondary-blue)',
                      textTransform: 'uppercase', letterSpacing: '0.3px'
                    }}
                  >
                    {label}
                  </div>
                ))}

                {visibleWords.length === 0 && (
                  <div style={{ gridColumn: '1 / -1', padding: '28px 16px', textAlign: 'center', fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-secondary-blue)' }}>
                    {words.length === 0
                      ? `No ${level.name} words yet — this level's content is still being added.`
                      : `No matching words found for "${query}".`}
                  </div>
                )}

                {visibleWords.map((word, idx) => {
                  const last = idx === visibleWords.length - 1;
                  const char = word.character || wordOf(word);
                  const reading = word.pronunciation ?? readingOf(word);
                  const definition = course.script.listMeaning === 'burmese'
                    ? (word.burmese_definition || word.meaning_burmese)
                    : (word.definition || word.meaning_english);

                  const cell = (extra) => ({
                    padding: '12px 10px', display: 'flex', alignItems: 'center',
                    backgroundColor: hoverRow === idx ? '#F1F5F9' : idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC',
                    borderBottom: last ? 'none' : '1px solid var(--color-border)',
                    transition: 'background-color 0.2s', cursor: 'pointer',
                    ...extra
                  });

                  return (
                    <div
                      key={word.id || `${char}-${idx}`}
                      style={{ display: 'contents' }}
                      onMouseOver={() => setHoverRow(idx)}
                      onMouseOut={() => setHoverRow(null)}
                      onClick={(e) => handlePlayWord(e, word)}
                    >
                      <div style={cell({ borderRight: '1px solid var(--color-border)', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', fontWeight: 800, color: 'var(--color-primary-blue)' })}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: stack ? '1.05rem' : char?.length > 2 ? '1.15rem' : '1.5rem', lineHeight: 1.2, whiteSpace: 'nowrap' }}>{char}</span>
                          <button
                            type="button"
                            onClick={(e) => handlePlayWord(e, word)}
                            aria-label={`Play audio for ${char}`}
                            style={{ background: 'transparent', border: 'none', padding: '2px', cursor: 'pointer', color: 'var(--color-primary-blue)', display: 'inline-flex', alignItems: 'center' }}
                          >
                            <Volume2 size={14} />
                          </button>
                        </div>
                        {kanaOf(word) && (
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-secondary-blue)', marginTop: '2px', whiteSpace: 'nowrap' }}>{kanaOf(word)}</span>
                        )}
                        {stack && reading && (
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-secondary-blue)', marginTop: '2px', whiteSpace: 'nowrap' }}>{reading}</span>
                        )}
                      </div>
                      {!stack && (
                        <div style={cell({ borderRight: '1px solid var(--color-border)', fontSize: '0.85rem', color: 'var(--color-secondary-blue)', whiteSpace: 'nowrap' })}>
                          {reading}
                        </div>
                      )}
                      <div style={cell({ borderRight: '1px solid var(--color-border)', fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-text-navy)', overflowWrap: 'break-word', minWidth: 0 })}>
                        {definition}
                      </div>
                      <div style={cell({ justifyContent: 'center' })}>
                        {levelDone ? (
                          <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CheckCircle size={14} color="#10B981" strokeWidth={3} />
                          </div>
                        ) : (
                          <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid var(--color-ghost-blue)' }}></div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Offline Badge CTA */}
            <div className="flex justify-center" style={{ marginTop: '32px' }}>
              <div style={{ backgroundColor: '#10B981', color: 'white', padding: '12px 32px', borderRadius: '100px', fontSize: '0.875rem', fontWeight: 700, boxShadow: '0 8px 16px rgba(16,185,129,0.3)', cursor: 'default' }}>
                Ready to use offline
              </div>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
