import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, PenLine, Bookmark, Mic, Layers, ChevronRight, User, MessageCircle, RotateCw, BookOpen, LayoutGrid, List, Blocks, Languages, Type, AudioLines } from 'lucide-react';
import { db } from '../lib/db';
import { useCourse } from '../lib/language';
import { usePublishedContent } from '../lib/publishedContentContext.jsx';
import { resolvePublishedCourseId } from '../lib/publishedContentService.js';
import { getCourseProgress } from '../lib/vocabularyProgress.js';
import { storageOwner } from '../lib/storageOwner.js';
import { useStudyStreak } from '../lib/studyStreak.js';

/* One tool tile matching original client presentation */
const ToolCard = ({ tool, isGridView, onClick }) => (
  <div
    className="surface-card"
    data-path={tool.path}
    role={tool.path !== '#' ? 'link' : undefined}
    tabIndex={tool.path !== '#' ? 0 : undefined}
    style={{
      display: 'flex',
      flexDirection: isGridView ? 'column' : 'row',
      alignItems: isGridView ? 'flex-start' : 'center',
      justifyContent: isGridView ? 'center' : 'space-between',
      padding: isGridView ? '24px 20px' : '20px 24px',
      borderRadius: '24px',
      position: 'relative',
      overflow: 'hidden',
      cursor: tool.path === '#' ? 'default' : 'pointer',
      transition: 'transform 0.2s, box-shadow 0.2s',
      boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
    }}
    onMouseOver={(e) => { if (tool.path === '#') return; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.08)'; }}
    onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.03)'; }}
    onClick={onClick}
    onKeyDown={(e) => { if (tool.path !== '#' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
  >
    <div style={{ display: 'flex', flexDirection: isGridView ? 'column' : 'row', alignItems: isGridView ? 'flex-start' : 'center', gap: isGridView ? '12px' : '16px', zIndex: 1 }}>
      <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: tool.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 4px 12px ${tool.shadow}` }}>
        <tool.icon size={24} color="#FFFFFF" />
      </div>
      <div>
        <h3 style={{ fontSize: isGridView ? '1rem' : '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {tool.title}
          {tool.path === '#' && (
            <span style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-secondary-blue)', backgroundColor: 'var(--color-ghost-blue)', padding: '2px 8px', borderRadius: '999px' }}>
              Soon
            </span>
          )}
        </h3>
        <p style={{ fontSize: isGridView ? '0.75rem' : '0.875rem', color: 'var(--color-secondary-blue)', margin: 0 }}>{tool.subtitle}</p>
      </div>
    </div>
    {!isGridView && tool.path !== '#' && <ChevronRight size={24} color="var(--color-secondary-blue)" style={{ zIndex: 1, opacity: 0.5 }} />}
    <div style={{ position: 'absolute', right: isGridView ? '5px' : '20px', bottom: isGridView ? '-15px' : '-25px', fontSize: isGridView ? '6rem' : '8rem', color: tool.charColor, fontWeight: 800, opacity: isGridView ? 0.3 : 0.6, zIndex: 0, pointerEvents: 'none', transition: 'all 0.3s' }}>{tool.char}</div>
  </div>
);

const EXPLORE_STYLE = {
  scriptDictionary: { icon: Languages, gradient: 'linear-gradient(135deg, #FCD34D 0%, #B45309 100%)', shadow: 'rgba(180, 83, 9, 0.4)', charColor: '#FEF3C7' },
  sounds:           { icon: AudioLines, gradient: 'linear-gradient(135deg, #67E8F9 0%, #0891B2 100%)', shadow: 'rgba(8, 145, 178, 0.4)', charColor: '#CFFAFE' },
  kana:             { icon: Type,      gradient: 'linear-gradient(135deg, #F9A8D4 0%, #DB2777 100%)', shadow: 'rgba(219, 39, 119, 0.4)', charColor: '#FCE7F3' },
  radicals:         { icon: Blocks,    gradient: 'linear-gradient(135deg, #A5B4FC 0%, #4338CA 100%)', shadow: 'rgba(67, 56, 202, 0.4)', charColor: '#E0E7FF' },
  interest:         { icon: Layers,    gradient: 'linear-gradient(135deg, #D8B4FE 0%, #9333EA 100%)', shadow: 'rgba(147, 51, 234, 0.4)', charColor: '#F3E8FF' },
  writing:          { icon: PenLine,   gradient: 'linear-gradient(135deg, #5EEAD4 0%, #0F766E 100%)', shadow: 'rgba(15, 118, 110, 0.4)', charColor: '#CCFBF1' },
  twisters:         { icon: Mic,       gradient: 'linear-gradient(135deg, #FDA4AF 0%, #E11D48 100%)', shadow: 'rgba(225, 29, 72, 0.4)', charColor: '#FFE4E6' }
};

export default function Library() {
  const navigate = useNavigate();
  const course = useCourse();
  const chars = course.toolChars || {};
  const publishedContent = usePublishedContent();
  const streak = useStudyStreak();

  const [, setDataVersion] = useState(0);
  const [isGridView, setIsGridView] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const unsubChange = storageOwner.subscribeChange(() => setDataVersion(v => v + 1));
    const unsubOwner = storageOwner.subscribe(() => setDataVersion(v => v + 1));
    return () => {
      unsubChange?.();
      unsubOwner?.();
    };
  }, []);

  let savedCount = 0;
  let reviewCount = 0;
  let swipedCount = 0;
  let learnedCount = 0;
  try {
    reviewCount = (db.get('review_cards') || []).length;
    savedCount = (db.get('saved_words') || []).length;
    const progress = getCourseProgress(db, course);
    learnedCount = progress.uniqueLearned ?? 0;
    swipedCount = progress.studiedCount ?? progress.uniqueSeen ?? progress.uniqueLearned ?? 0;
  } catch {
    // Keep safe defaults
  }

  // Published course state check
  const level1 = course.levels[0];
  const publishedCourseId = level1 ? resolvePublishedCourseId(course.id, level1.id) : null;
  const publishedState = publishedCourseId ? publishedContent.getCourseState(publishedCourseId) : null;
  const isLoaded = publishedState?.status === 'loaded';
  const availableCards = isLoaded ? (publishedState.items?.length || 0) : 0;

  const cardCountLabel = !publishedContent.enabled
    ? 'Catalog disabled'
    : publishedState?.status === 'loading'
      ? 'Loading cards…'
      : isLoaded && availableCards === 0
        ? 'No cards available'
        : (isLoaded ? `${availableCards} cards available` : 'Catalog disabled');

  const flashcardsSubtitle = learnedCount > 0 ? `${learnedCount} ${learnedCount === 1 ? 'word' : 'words'} learned` : 'Build your vocabulary';

  // Learn & Review tools
  const learnAndReviewTools = [
    { title: 'Flashcards', subtitle: flashcardsSubtitle, icon: Layers, gradient: 'linear-gradient(135deg, #7DD3FC 0%, #0284C7 100%)', shadow: 'rgba(2, 132, 199, 0.4)', path: '/learn', char: chars.flashcards || '卡', charColor: 'var(--color-ghost-blue)' },
    { title: 'Review', subtitle: `${reviewCount} words due`, icon: RotateCw, gradient: 'linear-gradient(135deg, #FCA5A5 0%, #DC2626 100%)', shadow: 'rgba(220, 38, 38, 0.4)', path: '/learn/review', char: chars.review || '复', charColor: '#FEE2E2' },
    { title: 'Saved Words', subtitle: `${savedCount} bookmarked words`, icon: Bookmark, gradient: 'linear-gradient(135deg, #86EFAC 0%, #16A34A 100%)', shadow: 'rgba(220, 38, 38, 0.4)', path: '/saved', char: chars.saved || '藏', charColor: '#DCFCE7' },
    { title: 'Dictionary', subtitle: course.copy?.dictionarySubtitle || 'Look up words', icon: BookOpen, gradient: 'linear-gradient(135deg, #FDBA74 0%, #EA580C 100%)', shadow: 'rgba(234, 88, 12, 0.4)', path: '/dictionary', char: chars.dictionary || '典', charColor: '#FFEDD5' },
    { title: 'Learn Phrases', subtitle: 'Master common expressions', icon: MessageCircle, gradient: 'linear-gradient(135deg, #93C5FD 0%, #2563EB 100%)', shadow: 'rgba(37, 99, 235, 0.4)', path: '/flashcards', char: chars.phrases || '话', charColor: '#DBEAFE' }
  ];

  // Explore & Practise tools
  const exploreAndPractiseTools = (course.exploreTools || []).map((tool) => ({
    ...(EXPLORE_STYLE[tool.key] || {}),
    ...tool,
    path: tool.path || '#'
  }));

  const filterTools = (tools) => {
    if (!searchQuery.trim()) return tools;
    const q = searchQuery.toLowerCase().trim();
    return tools.filter(t => t.title.toLowerCase().includes(q) || t.subtitle.toLowerCase().includes(q));
  };

  const filteredLearn = filterTools(learnAndReviewTools);
  const filteredExplore = filterTools(exploreAndPractiseTools);

  return (
    <div style={{ background: 'transparent', width: '100%', minHeight: '100vh', position: 'relative', paddingBottom: '100px' }}>
      {/* Background that matches HSK 1 card dimensions */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '280px', background: 'linear-gradient(135deg, #7DD3FC 0%, #0369A1 100%)', zIndex: 0 }}></div>

      {/* Header Container */}
      <div style={{ maxWidth: '1000px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div style={{ padding: '40px 24px 32px 24px' }}>
          <header className="flex justify-between items-start">
            <div>
              <p style={{ fontSize: '1.25rem', color: 'rgba(255, 255, 255, 0.9)', margin: '0 0 8px 0', fontWeight: 500 }}>Hello!</p>
              <h1 style={{ fontSize: '2rem', color: '#FFFFFF', margin: 0, fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1.2 }}>What do you want<br/>to learn today?</h1>
            </div>
            <button
              onClick={() => navigate('/profile')}
              aria-label="Profile"
              style={{
                width: '48px', height: '48px', borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.2)', color: '#FFFFFF', backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)', cursor: 'pointer'
              }}
            >
              <User size={22} strokeWidth={2.5} />
            </button>
          </header>
        </div>
      </div>

      {/* Main Content Sheet */}
      <div style={{
        background: 'var(--bg-gradient)',
        borderTopLeftRadius: '40px',
        borderTopRightRadius: '40px',
        position: 'relative',
        zIndex: 1,
        marginTop: '-8px'
      }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px 24px 100px 24px' }}>

          {/* Progress Tracking Section */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.5px', background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
                Your Swipe Stats
              </h2>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', color: '#0369A1', fontWeight: 900, fontSize: '1.2rem',
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(224, 242, 254, 0.7) 100%)',
                backdropFilter: 'blur(12px)',
                padding: '6px 18px', borderRadius: '24px',
                boxShadow: '0 8px 24px rgba(2, 132, 199, 0.15), inset 0 2px 4px rgba(255, 255, 255, 1)',
                border: '1px solid rgba(255, 255, 255, 0.9)'
              }}>
                <span role="img" aria-label="streak fire">🔥</span>
                <span>{streak?.streakDays || 0}</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
              {/* Card 1: Words Swiped */}
              <div style={{
                padding: '16px', borderRadius: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '100px',
                backgroundColor: '#FFFFFF', border: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 4px 16px rgba(3, 105, 161, 0.04)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-secondary-blue)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Words<br/>Swiped</div>
                  <div style={{ color: '#0284C7', backgroundColor: '#E0F2FE', padding: '6px', borderRadius: '10px' }}>
                    <Layers size={16} strokeWidth={2.5} />
                  </div>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text-navy)', lineHeight: 1 }}>
                  {swipedCount}
                  <span style={{ display: 'none' }}>
                    <strong>{learnedCount}</strong><span>Learned words</span>
                    <span>{cardCountLabel}</span>
                  </span>
                </div>
              </div>

              {/* Card 2: Saved Words */}
              <div style={{
                padding: '16px', borderRadius: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '100px',
                backgroundColor: '#FFFFFF', border: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 4px 16px rgba(3, 105, 161, 0.04)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-secondary-blue)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Saved<br/>Words</div>
                  <div style={{ color: '#059669', backgroundColor: '#D1FAE5', padding: '6px', borderRadius: '10px' }}>
                    <Bookmark size={16} strokeWidth={2.5} />
                  </div>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#059669', lineHeight: 1 }}>{savedCount}</div>
              </div>

              {/* Card 3: Learned Phrases */}
              <div style={{
                padding: '16px', borderRadius: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '100px',
                backgroundColor: '#FFFFFF', border: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 4px 16px rgba(3, 105, 161, 0.04)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-secondary-blue)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Learned<br/>Phrases</div>
                  <div style={{ color: '#2563EB', backgroundColor: '#DBEAFE', padding: '6px', borderRadius: '10px' }}>
                    <MessageCircle size={16} strokeWidth={2.5} />
                  </div>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text-navy)', lineHeight: 1 }}>0</div>
              </div>

              {/* Card 4: Review Due */}
              <div style={{
                padding: '16px', borderRadius: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '100px',
                backgroundColor: '#FFFFFF', border: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 4px 16px rgba(3, 105, 161, 0.04)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-secondary-blue)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Review<br/>Due</div>
                  <div style={{ color: '#DC2626', backgroundColor: '#FEE2E2', padding: '6px', borderRadius: '10px' }}>
                    <RotateCw size={16} strokeWidth={2.5} />
                  </div>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#DC2626', lineHeight: 1 }}>{reviewCount}</div>
              </div>
            </div>
          </div>

          {/* Search Section */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <Search size={20} color="var(--color-primary-blue)" style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', zIndex: 1 }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={course.copy?.searchPlaceholder || 'Search Chinese, pinyin, English...'}
                className="input-field"
                style={{
                  width: '100%',
                  padding: '16px 20px 16px 52px',
                  borderRadius: '20px',
                  backgroundColor: '#FFFFFF',
                  boxShadow: '0 4px 16px rgba(3, 105, 161, 0.06)',
                  border: '1px solid var(--color-border)',
                  fontSize: '0.9375rem',
                  fontWeight: 500,
                  outline: 'none'
                }}
              />
            </div>
          </div>

          {/* Learn & Review Section */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: 0 }}>Learn &amp; Review</h2>
              <button
                onClick={() => setIsGridView(!isGridView)}
                aria-label={isGridView ? 'Switch to list view' : 'Switch to grid view'}
                style={{ background: 'var(--color-ghost-blue)', border: 'none', cursor: 'pointer', color: 'var(--color-primary-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', borderRadius: '12px', transition: 'background-color 0.2s' }}
              >
                {isGridView ? <List size={20} strokeWidth={2.5} /> : <LayoutGrid size={20} strokeWidth={2.5} />}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isGridView ? 'repeat(2, 1fr)' : '1fr', gap: '12px' }}>
              {filteredLearn.map((tool, idx) => (
                <ToolCard
                  key={idx}
                  tool={tool}
                  isGridView={isGridView}
                  onClick={() => { if (tool.path !== '#') navigate(tool.path); }}
                />
              ))}
            </div>
          </div>

          {/* Explore & Practise Section */}
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 16px 0' }}>Explore &amp; Practise</h2>

            <div style={{ display: 'grid', gridTemplateColumns: isGridView ? 'repeat(2, 1fr)' : '1fr', gap: '12px' }}>
              {filteredExplore.map((tool, idx) => (
                <ToolCard
                  key={idx}
                  tool={tool}
                  isGridView={isGridView}
                  onClick={() => { if (tool.path !== '#') navigate(tool.path); }}
                />
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
