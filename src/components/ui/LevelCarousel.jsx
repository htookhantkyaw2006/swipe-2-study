import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCw } from 'lucide-react';
import { useCourse } from '../../lib/language';
import { db } from '../../lib/db';
import { getLevelProgress } from '../../lib/vocabularyProgress';
import { storageOwner } from '../../lib/storageOwner';
import { usePublishedContent } from '../../lib/publishedContentContext';
import { resolvePublishedCourseId } from '../../lib/publishedContentService';

export default function LevelCarousel() {
  const navigate = useNavigate();
  const course = useCourse();
  const publishedContent = usePublishedContent();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsubChange = storageOwner.subscribeChange(() => setTick(t => t + 1));
    const unsubOwner = storageOwner.subscribe(() => setTick(t => t + 1));
    return () => {
      unsubChange?.();
      unsubOwner?.();
    };
  }, []);

  const handleScroll = (e) => {
    const scrollLeft = e.target.scrollLeft;
    const width = e.target.clientWidth;
    if (width > 0) {
      const index = Math.round(scrollLeft / width);
      if (index !== activeIndex && index >= 0 && index < course.levels.length) {
        setActiveIndex(index);
      }
    }
  };

  const levels = course.levels.map((level, idx) => {
    const publishedCourseId = resolvePublishedCourseId(course.id, level.id);
    const isInScope = publishedContent.enabled && Boolean(publishedCourseId);
    const publishedState = publishedCourseId ? publishedContent.getCourseState(publishedCourseId) : null;
    const isLoaded = publishedState?.status === 'loaded';
    const curriculumTarget = isInScope
      ? (isLoaded ? publishedState.items : 0)
      : (publishedContent.enabled ? 0 : null);

    const progress = getLevelProgress(db, level.id, course, null, curriculumTarget);
    const completed = progress.uniqueLearned;
    const availableCount = progress.words;
    const percent = progress.percent;

    const isLevelAvailable = isInScope
      ? (isLoaded && availableCount > 0)
      : (publishedContent.enabled ? false : (availableCount > 0 || level.words > 0));

    const isLoadedEmpty = isInScope
      ? (isLoaded && availableCount === 0)
      : (!publishedContent.enabled && availableCount === 0 && !level.words);

    const wordCountText = publishedState?.status === 'loading'
      ? 'Loading curriculum...'
      : isInScope
        ? (publishedState?.status === 'error'
            ? 'Error loading curriculum'
            : publishedState?.status === 'unpublished'
              ? 'Curriculum coming soon'
              : isLoadedEmpty
                ? 'No words available yet'
                : `${completed.toLocaleString()} / ${availableCount.toLocaleString()} completed`)
        : publishedContent.enabled
          ? 'Curriculum coming soon'
          : course.id === 'zh'
            ? `${completed.toLocaleString()} / ${(availableCount || level.words).toLocaleString()} completed`
            : `${(availableCount || level.words).toLocaleString()} words to explore`;

    return {
      ...level,
      gradient: `linear-gradient(135deg, ${level.gradientStart} 0%, ${level.gradientEnd} 100%)`,
      completed,
      availableCount,
      percent,
      isLevelAvailable,
      isLoadedEmpty,
      wordCountText,
      publishedCourseId,
      publishedState,
    };
  });

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Carousel Container */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          display: 'flex',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          width: '100%',
          gap: '16px',
          padding: '0 24px',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }}
        className="no-scrollbar"
      >
        {levels.map((level, index) => (
          <div
            key={level.id || index}
            style={{
              flex: '0 0 100%',
              scrollSnapAlign: 'center',
              padding: '0 24px',
              boxSizing: 'border-box'
            }}
          >
            <div
              style={{
                borderRadius: '24px',
                padding: '24px 24px 20px',
                background: level.gradient,
                color: '#FFFFFF',
                boxShadow: level.shadow ? `0 14px 34px ${level.shadow}` : '0 12px 24px rgba(0,0,0,0.1)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: '220px',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* Lit 3D Badge Graphic */}
              <div style={{
                position: 'absolute',
                right: '15px',
                top: '48%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                zIndex: 0
              }}>
                <svg width="130" height="130" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <filter id={`glowBadge-${level.id || index}`} x="-30%" y="-30%" width="160%" height="160%">
                      <feGaussianBlur stdDeviation="5" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <linearGradient id={`shieldGrad-${level.id || index}`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.7" />
                      <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.05" />
                    </linearGradient>
                    <linearGradient id={`crystalGrad-${level.id || index}`} x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Outer Hexagon */}
                  <polygon points="60,10 105,35 105,85 60,110 15,85 15,35" fill={`url(#shieldGrad-${level.id || index})`} filter={`url(#glowBadge-${level.id || index})`} stroke="#FFFFFF" strokeWidth="1.5" strokeOpacity="0.8"/>

                  {/* Inner Crystal Hexagon */}
                  <polygon points="60,20 95,40 95,80 60,100 25,80 25,40" fill={`url(#crystalGrad-${level.id || index})`} stroke="#FFFFFF" strokeWidth="1.5" strokeOpacity="0.9"/>

                  {/* Cards Stack */}
                  <rect x="42" y="35" width="36" height="46" rx="4" fill="#FFFFFF" fillOpacity="0.4" transform="rotate(15, 60, 60)" filter={`url(#glowBadge-${level.id || index})`} />
                  <rect x="42" y="38" width="36" height="46" rx="4" fill="#FFFFFF" fillOpacity="0.7" transform="rotate(5, 60, 60)" filter={`url(#glowBadge-${level.id || index})`} />
                  <rect x="42" y="40" width="36" height="46" rx="4" fill="#FFFFFF" fillOpacity="1.0" transform="rotate(-5, 60, 60)" filter={`url(#glowBadge-${level.id || index})`} />
                  <text x="60" y="69" fontSize="22" fontWeight="900" fill={level.btnColor || level.gradientEnd || '#0369A1'} textAnchor="middle" transform="rotate(-5, 60, 60)">
                    {level.character || course.copy.flashcardsWatermark || '学'}
                  </text>

                  {/* Sparkles */}
                  <circle cx="20" cy="30" r="2.5" fill="#FFFFFF" filter={`url(#glowBadge-${level.id || index})`} />
                  <circle cx="105" cy="20" r="3.5" fill="#FFFFFF" filter={`url(#glowBadge-${level.id || index})`} />
                  <circle cx="95" cy="100" r="2" fill={`url(#glowBadge-${level.id || index})`} />
                </svg>
              </div>

              {/* Top Heading */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1, marginBottom: '16px' }}>
                <span className={`course-badge${index === 0 && level.isLevelAvailable ? ' course-badge--active' : ''}`}>
                  {level.publishedState?.status === 'loading'
                    ? 'LOADING'
                    : level.publishedState?.status === 'error'
                      ? 'UNAVAILABLE'
                      : level.publishedState?.status === 'unpublished'
                        ? 'COMING SOON'
                        : index === 0 && level.isLevelAvailable
                          ? 'NOW LEARNING'
                          : (level.tier || 'ALL LEVELS')}
                </span>
                <button
                  onClick={() => navigate('/learn')}
                  style={{
                    background: 'rgba(255,255,255,0.25)',
                    border: 'none',
                    color: '#FFFFFF',
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  All levels
                </button>
              </div>

              {/* Middle Content */}
              <div style={{ flex: 1, marginBottom: '20px', position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: '55%' }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, margin: '0 0 4px 0', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {level.kicker || `LEVEL ${level.num || (index + 1)}`}
                  </p>
                  <h3 style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 8px 0', color: '#FFFFFF', lineHeight: 1 }}>
                    {level.name}
                  </h3>
                  <p className="course-word-count">
                    {level.wordCountText}
                  </p>
                  {/* Progress bar */}
                  <div style={{ width: '100%', height: '5px', background: 'rgba(255,255,255,0.3)', borderRadius: '3px', marginTop: '10px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, level.percent)}%`, height: '100%', background: '#FFFFFF', borderRadius: '3px' }}></div>
                  </div>
                </div>
              </div>

              {/* Bottom Actions */}
              <div style={{ display: 'flex', gap: '8px', position: 'relative', zIndex: 1 }}>
                {level.isLevelAvailable ? (
                  <button
                    type="button"
                    className="course-study-button"
                    onClick={() => navigate(`/learn/session?level=${encodeURIComponent(level.id)}`)}
                    style={{
                      flex: 1,
                      backgroundColor: '#FFFFFF',
                      color: level.btnColor || level.gradientEnd || '#0369A1',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '10px 8px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      minWidth: 0,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}
                  >
                    {level.completed === 0 ? (course.copy.startSwiping || 'Start swiping') : 'Continue'}
                  </button>
                ) : level.publishedState?.status === 'loading' ? (
                  <button
                    type="button"
                    className="course-study-button course-study-button--disabled"
                    disabled
                    style={{
                      flex: 1,
                      backgroundColor: '#FFFFFF',
                      color: level.btnColor || level.gradientEnd || '#0369A1',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '10px 8px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      fontSize: '0.85rem',
                      opacity: 0.6,
                      cursor: 'default',
                      minWidth: 0
                    }}
                  >
                    Loading…
                  </button>
                ) : level.publishedState?.status === 'error' ? (
                  <button
                    type="button"
                    className="course-study-button course-study-button--retry"
                    onClick={() => level.publishedCourseId && publishedContent.retry(level.publishedCourseId)}
                    style={{
                      flex: 1,
                      backgroundColor: '#FFFFFF',
                      color: level.btnColor || level.gradientEnd || '#0369A1',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '10px 8px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      minWidth: 0
                    }}
                  >
                    Retry
                  </button>
                ) : level.isLoadedEmpty ? (
                  <button
                    type="button"
                    className="course-study-button course-study-button--disabled"
                    disabled
                    style={{
                      flex: 1,
                      backgroundColor: '#FFFFFF',
                      color: level.btnColor || level.gradientEnd || '#0369A1',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '10px 8px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      fontSize: '0.85rem',
                      opacity: 0.6,
                      cursor: 'default',
                      minWidth: 0
                    }}
                  >
                    No cards available
                  </button>
                ) : (
                  <button
                    type="button"
                    className="course-study-button course-study-button--disabled"
                    disabled
                    style={{
                      flex: 1,
                      backgroundColor: '#FFFFFF',
                      color: level.btnColor || level.gradientEnd || '#0369A1',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '10px 8px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      fontSize: '0.85rem',
                      opacity: 0.6,
                      cursor: 'default',
                      minWidth: 0
                    }}
                  >
                    Coming soon
                  </button>
                )}
                <button
                  onClick={() => navigate(`/learn/level/${level.id}`)}
                  style={{
                    flex: 1,
                    backgroundColor: 'transparent',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255,255,255,0.5)',
                    borderRadius: '12px',
                    padding: '10px 8px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    minWidth: 0
                  }}
                >
                  <RotateCw size={15} /> Overview
                </button>
              </div>

            </div>
          </div>
        ))}
      </div>

      {/* Dot Indicators */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
        {levels.map((_, index) => (
          <div
            key={index}
            style={{
              width: index === activeIndex ? '6px' : '4px',
              height: index === activeIndex ? '6px' : '4px',
              borderRadius: '50%',
              backgroundColor: index === activeIndex ? '#0369A1' : '#BAE6FD',
              transition: 'all 0.2s ease-in-out'
            }}
          />
        ))}
      </div>
    </div>
  );
}
