import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, ChevronRight, Layers } from 'lucide-react';
import { useCourse } from '../../lib/language';
import { db } from '../../lib/db';
import { getLevelProgress } from '../../lib/vocabularyProgress';
import { storageOwner } from '../../lib/storageOwner';

export default function LevelCarousel() {
  const course = useCourse();
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(null);
  const [, setTick] = useState(0);

  // Active view refreshes on table mutations and owner switches
  useEffect(() => {
    const unsubChange = storageOwner.subscribeChange(() => setTick(t => t + 1));
    const unsubOwner = storageOwner.subscribe(() => setTick(t => t + 1));
    return () => {
      unsubChange?.();
      unsubOwner?.();
    };
  }, []);

  const level = course.levels[activeIndex] || course.levels[0];
  if (!level) return null;

  // Real progress derived from learner records
  const progress = getLevelProgress(db, level.id, course);
  const completed = progress.uniqueLearned;
  const percent = progress.percent;
  const changeLevel = delta => setActiveIndex(index => Math.max(0, Math.min(course.levels.length - 1, index + delta)));

  const cardStyle = {
    '--card-gradient-start': level.gradientStart,
    '--card-gradient-end': level.gradientEnd,
    '--level-accent': level.gradientEnd,
    '--level-btn-color': level.btnColor || level.gradientEnd,
    background: `linear-gradient(135deg, ${level.gradientStart} 0%, ${level.gradientEnd} 100%)`,
    boxShadow: level.shadow ? `0 14px 34px ${level.shadow}` : undefined,
  };

  const wordCountText = course.id === 'zh'
    ? `${completed.toLocaleString()} / ${level.words.toLocaleString()} completed`
    : `${level.words.toLocaleString()} words to explore`;

  return (
    <div className="course-browser" aria-label={`${course.name} flashcard levels`}>
      <article
        className="featured-course"
        aria-roledescription="slide"
        aria-label={`${level.name}, ${activeIndex + 1} of ${course.levels.length}`}
        style={cardStyle}
        onTouchStart={event => setTouchStart(event.touches[0].clientX)}
        onTouchEnd={event => {
          if (touchStart === null) return;
          const delta = touchStart - event.changedTouches[0].clientX;
          if (Math.abs(delta) > 55) changeLevel(delta > 0 ? 1 : -1);
          setTouchStart(null);
        }}
      >
        <div className="course-card-heading">
          <span className="course-category">
            <Layers size={15} aria-hidden="true" /> {course.copy.nowLearning || `${course.levelSystem} FLASHCARDS`}
          </span>
          <span className="course-tier">{level.tier}</span>
        </div>
        <div className="course-card-body">
          <div className="course-card-copy">
            <p className="course-kicker">{level.kicker}</p>
            <h3>{level.name}</h3>
            <p className="course-word-count">{wordCountText}</p>
          </div>
          <div className="course-card-art" aria-hidden="true">
            <div className="course-art-back" />
            <div className="course-art-front" style={{ color: level.btnColor || level.gradientEnd }}>
              <span>{course.copy.flashcardsWatermark}</span>
              <span className="course-art-label">{level.name}</span>
            </div>
            <span className="course-art-spark">✦</span>
          </div>
        </div>
        <div className="course-progress">
          <div className="course-progress-label">
            <span>Progress</span>
            <span>{percent}%</span>
          </div>
          <div className="course-progress-track" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
        </div>
        <div className="course-card-actions">
          <button
            className="course-study-button"
            style={{ color: level.btnColor || level.gradientEnd }}
            onClick={() => navigate(`/learn/level/${level.id}`)}
          >
            {course.copy.startSwiping || 'Open level'} <ArrowRight size={17} aria-hidden="true" />
          </button>
          <button className="course-all-button" onClick={() => navigate('/learn')}>
            All levels <ChevronRight size={17} aria-hidden="true" />
          </button>
        </div>
      </article>
      <div className="course-browser-controls">
        <p aria-live="polite" aria-atomic="true"><strong>{level.name}</strong><span> · {activeIndex + 1} of {course.levels.length} levels</span></p>
        <div className="course-arrows">
          <button className="icon-button" onClick={() => changeLevel(-1)} disabled={activeIndex === 0} aria-label="Previous level"><ArrowLeft size={18} /></button>
          <button className="icon-button" onClick={() => changeLevel(1)} disabled={activeIndex === course.levels.length - 1} aria-label="Next level"><ArrowRight size={18} /></button>
        </div>
      </div>
    </div>
  );
}
