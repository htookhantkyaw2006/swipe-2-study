import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, RotateCw } from 'lucide-react';
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

    const wordCountText = publishedState?.status === 'loading'
      ? 'Loading curriculum...'
      : isInScope
        ? (publishedState?.status === 'error'
            ? 'Error loading curriculum'
            : publishedState?.status === 'unpublished'
              ? 'Curriculum coming soon'
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
      wordCountText,
      publishedCourseId,
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
              scrollSnapAlign: 'center',
              minWidth: 'calc(100% - 48px)',
              maxWidth: '450px',
              flexShrink: 0,
              borderRadius: '24px',
              padding: '24px',
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
            {/* Top Heading */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{
                background: 'rgba(255,255,255,0.25)',
                padding: '4px 10px',
                borderRadius: '8px',
                fontSize: '0.65rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                {index === 0 && level.isLevelAvailable ? 'NOW LEARNING' : (level.tier || 'ALL LEVELS')}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0' }}>
              <div>
                <p style={{ fontSize: '0.75rem', fontWeight: 700, margin: '0 0 4px 0', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {level.kicker || `LEVEL ${level.num || (index + 1)}`}
                </p>
                <h3 style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 8px 0', color: '#FFFFFF', lineHeight: 1 }}>
                  {level.name}
                </h3>
                <p style={{ fontSize: '0.85rem', margin: 0, opacity: 0.9 }}>
                  {level.wordCountText}
                </p>
                {/* Progress bar */}
                <div style={{ width: '140px', height: '6px', background: 'rgba(255,255,255,0.3)', borderRadius: '3px', marginTop: '8px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, level.percent)}%`, height: '100%', background: '#FFFFFF', borderRadius: '3px' }}></div>
                </div>
              </div>

              {/* Hexagon 3D Illustration */}
              <div style={{ position: 'relative', width: '90px', height: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="90" height="90" viewBox="0 0 100 100" style={{ position: 'absolute' }}>
                  <polygon points="50 5, 90 25, 90 75, 50 95, 10 75, 10 25" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
                  <polygon points="50 12, 82 28, 82 72, 50 88, 18 72, 18 28" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" />
                </svg>
                {/* White card in center */}
                <div style={{
                  width: '44px', height: '52px', backgroundColor: '#FFFFFF', borderRadius: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 8px 16px rgba(0,0,0,0.15)', zIndex: 1,
                  transform: 'rotate(-4deg)'
                }}>
                  <span style={{ fontSize: '1.4rem', fontWeight: 900, color: level.btnColor || level.gradientEnd || '#0369A1' }}>
                    {level.character || course.copy.heroWatermark}
                  </span>
                </div>
                {/* Sparkles */}
                <div style={{ position: 'absolute', top: '10px', right: '0px', width: '6px', height: '6px', backgroundColor: '#FFFFFF', borderRadius: '50%' }}></div>
                <div style={{ position: 'absolute', bottom: '15px', right: '5px', width: '4px', height: '4px', backgroundColor: '#FFFFFF', borderRadius: '50%' }}></div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button
                onClick={() => {
                  if (level.isLevelAvailable) {
                    navigate(`/learn/session?level=${encodeURIComponent(level.id)}`);
                  }
                }}
                disabled={!level.isLevelAvailable}
                style={{
                  backgroundColor: '#FFFFFF',
                  color: level.btnColor || level.gradientEnd || '#0369A1',
                  border: 'none',
                  borderRadius: '14px',
                  padding: '10px 16px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '0.875rem',
                  cursor: level.isLevelAvailable ? 'pointer' : 'default',
                  opacity: level.isLevelAvailable ? 1 : 0.6,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}
              >
                <Play size={16} fill="currentColor" /> {level.isLevelAvailable ? (level.completed === 0 ? (course.copy.startSwiping || 'Start swiping') : 'Continue') : 'Coming soon'}
              </button>
              <button
                onClick={() => navigate(`/learn/level/${level.id}`)}
                style={{
                  backgroundColor: 'transparent',
                  color: '#FFFFFF',
                  border: '1px solid rgba(255,255,255,0.4)',
                  borderRadius: '14px',
                  padding: '10px 16px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '0.875rem',
                  cursor: 'pointer'
                }}
              >
                <RotateCw size={16} /> Overview
              </button>
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
