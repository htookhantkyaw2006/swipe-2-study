import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useCourse } from '../../lib/language';
import { db } from '../../lib/db';
import { getLevelProgress } from '../../lib/vocabularyProgress';
import { storageOwner } from '../../lib/storageOwner';
import { usePublishedContent } from '../../lib/publishedContentContext';
import { resolvePublishedCourseId } from '../../lib/publishedContentService';

export default function LevelCarousel() {
  const course = useCourse();
  const navigate = useNavigate();
  const publishedContent = usePublishedContent();
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

  const publishedCourseId = resolvePublishedCourseId(course.id, level.id);
  const isInScope = publishedContent.enabled && Boolean(publishedCourseId);
  const publishedState = publishedCourseId ? publishedContent.getCourseState(publishedCourseId) : null;
  const isLoaded = publishedState?.status === 'loaded';
  const curriculumTarget = isInScope
    ? (isLoaded ? publishedState.items : 0)
    : (publishedContent.enabled ? 0 : null);

  // Real progress derived from learner records intersected with active curriculum
  const progress = getLevelProgress(db, level.id, course, null, curriculumTarget);
  const completed = progress.uniqueLearned;
  const availableCount = progress.words;
  const percent = progress.percent;
  const reviewCount = db.get('review_cards').length;

  const isLevelAvailable = isInScope
    ? (isLoaded && availableCount > 0)
    : (publishedContent.enabled ? false : (availableCount > 0 || level.words > 0));
  const isLoadedEmpty = isInScope
    ? (isLoaded && availableCount === 0)
    : (!publishedContent.enabled && availableCount === 0 && !level.words);

  const changeLevel = delta => setActiveIndex(index => Math.max(0, Math.min(course.levels.length - 1, index + delta)));

  const cardStyle = {
    '--card-gradient-start': level.gradientStart,
    '--card-gradient-end': level.gradientEnd,
    '--level-accent': level.gradientEnd,
    '--level-btn-color': level.btnColor || level.gradientEnd,
    background: `linear-gradient(135deg, ${level.gradientStart} 0%, ${level.gradientEnd} 100%)`,
    boxShadow: level.shadow ? `0 14px 34px ${level.shadow}` : undefined,
  };

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

  const isNowLearning = activeIndex === 0 && isLevelAvailable;

  const handlePrimaryAction = () => {
    if (!isLevelAvailable) return;
    navigate(`/learn/session?level=${encodeURIComponent(level.id)}`);
  };

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
          <span className={`course-badge${isNowLearning ? ' course-badge--active' : ''}`}>
            {publishedState?.status === 'loading'
              ? 'LOADING'
              : publishedState?.status === 'error'
                ? 'UNAVAILABLE'
                : isNowLearning
                  ? 'NOW LEARNING'
                  : level.tier}
          </span>
          <Link to="/learn" className="course-all-link">
            All levels
          </Link>
        </div>

        <div className="course-card-body">
          <div className="course-card-copy">
            <p className="course-kicker">{level.kicker || `LEVEL ${level.num || 1}`}</p>
            <h3>{level.name}</h3>
            <p className="course-word-count">{wordCountText}</p>
          </div>
        </div>

        <div className="course-progress">
          <div className="course-progress-track" aria-hidden="true">
            <span style={{ width: `${percent}%` }} />
          </div>
        </div>

        <div className="course-card-actions">
          {isLevelAvailable ? (
            <button
              type="button"
              className="course-study-button"
              style={{ color: level.btnColor || level.gradientEnd }}
              onClick={handlePrimaryAction}
            >
              {completed === 0 ? (course.copy.startSwiping || 'Start learning') : 'Continue learning'}
            </button>
          ) : publishedState?.status === 'loading' ? (
            <button
              type="button"
              className="course-study-button course-study-button--disabled"
              disabled
              style={{ color: level.btnColor || level.gradientEnd }}
            >
              Loading…
            </button>
          ) : publishedState?.status === 'error' ? (
            <button
              type="button"
              className="course-study-button course-study-button--retry"
              onClick={() => publishedCourseId && publishedContent.retry(publishedCourseId)}
              style={{ color: level.btnColor || level.gradientEnd }}
            >
              Retry
            </button>
          ) : isLoadedEmpty ? (
            <button
              type="button"
              className="course-study-button course-study-button--disabled"
              disabled
              style={{ color: level.btnColor || level.gradientEnd }}
            >
              No cards available
            </button>
          ) : (
            <button
              type="button"
              className="course-study-button course-study-button--disabled"
              disabled
              style={{ color: level.btnColor || level.gradientEnd }}
            >
              Coming soon
            </button>
          )}
          <button
            type="button"
            className="course-review-button"
            onClick={() => navigate('/learn/review')}
          >
            Review {reviewCount}
          </button>
        </div>
      </article>

      <div className="course-browser-controls">
        <p aria-live="polite" aria-atomic="true">
          <strong>{level.name}</strong>
          <span> · {activeIndex + 1} of {course.levels.length} levels</span>
        </p>
        <div className="course-arrows">
          <button
            type="button"
            className="icon-button"
            onClick={() => changeLevel(-1)}
            disabled={activeIndex === 0}
            aria-label="Previous level"
          >
            <ArrowLeft size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => changeLevel(1)}
            disabled={activeIndex === course.levels.length - 1}
            aria-label="Next level"
          >
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
