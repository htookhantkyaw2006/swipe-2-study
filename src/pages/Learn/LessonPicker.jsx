import { useMemo, useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Compass, RotateCw, CheckCircle2, Bookmark, Volume2 } from 'lucide-react';
import { useCourse } from '../../lib/language';
import { db } from '../../lib/db';
import { kanaOf } from '../../lib/entry';
import { filterStudyWords, wordDetails } from '../../lib/studyWords';
import { speak } from '../../lib/speech';
import { playWordAudio } from '../../lib/wordAudio';
import { StudyHeader, StudySearch } from '../../components/study/StudyPage';
import { getLevelProgress } from '../../lib/vocabularyProgress';
import { storageOwner } from '../../lib/storageOwner';
import { usePublishedCourse } from '../../lib/publishedContentContext';
import './LessonPicker.css';

export default function LessonPicker() {
  const { levelId } = useParams();
  const course = useCourse();
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

  // Keep legacy numeric links such as /learn/level/1 working.
  const level = course.levels.find(item => item.id === levelId)
    || course.levels.find(item => String(item.num) === String(levelId).replace(/\D/g, ''))
    || course.levels[0];
  const [query, setQuery] = useState('');

  const publishedCourse = usePublishedCourse(level.id);
  const isPublishedLevel = publishedCourse.enabled && publishedCourse.isInScope;

  const words = useMemo(() => {
    if (isPublishedLevel) {
      return publishedCourse.isLoaded ? publishedCourse.items : [];
    }
    if (publishedCourse.enabled && !publishedCourse.isInScope) {
      return [];
    }
    return db.get('flashcards').filter(word => word.level === level.id);
  }, [isPublishedLevel, publishedCourse.isLoaded, publishedCourse.items, publishedCourse.enabled, publishedCourse.isInScope, level.id]);

  const visibleWords = filterStudyWords(words, query);
  const reviewCount = db.get('review_cards').length;
  const savedCount = db.get('saved_words').length;

  const curriculumTarget = isPublishedLevel
    ? (publishedCourse.isLoaded ? publishedCourse.items : 0)
    : (publishedCourse.enabled ? 0 : null);

  // Real progress derived from learner records intersected with active curriculum
  const progress = getLevelProgress(db, level.id, course, null, curriculumTarget);
  const completed = progress.uniqueLearned;
  const totalWords = progress.words;
  const percent = progress.percent;

  const activeAudioRef = useRef(null);
  useEffect(() => () => activeAudioRef.current?.cancel(), []);

  const handlePlayWord = (word) => {
    activeAudioRef.current?.cancel();
    activeAudioRef.current = playWordAudio(word, { speakFn: speak });
  };

  const heroSubtitle = publishedCourse.isLoading
    ? 'Loading curriculum...'
    : isPublishedLevel
      ? (publishedCourse.isError
          ? 'Error loading curriculum'
          : publishedCourse.isUnpublished
            ? 'Unpublished curriculum'
            : `${completed.toLocaleString()} / ${totalWords.toLocaleString()} completed`)
      : course.id === 'zh'
        ? `${completed.toLocaleString()} / ${(totalWords || level.words).toLocaleString()} completed`
        : `${(totalWords || level.words).toLocaleString()} vocabulary words`;

  const isLevelAvailable = words.length > 0;

  return (
    <div className="study-page lesson-page">
      <StudyHeader
        title={level.name}
        subtitle={`${course.name} · Vocabulary course`}
        backTo="/learn"
        backLabel="Back to courses"
      />

      <div className="lesson-layout">
        <aside className="lesson-sidebar" aria-label={`${level.name} course overview`}>
          <section
            className="lesson-hero-card"
            style={{
              '--card-gradient-start': level.gradientStart,
              '--card-gradient-end': level.gradientEnd,
              '--level-accent': level.gradientEnd,
              '--level-btn-color': level.btnColor || level.gradientEnd,
              background: `linear-gradient(135deg, ${level.gradientStart} 0%, ${level.gradientEnd} 100%)`,
              boxShadow: level.shadow ? `0 14px 34px ${level.shadow}` : undefined,
            }}
          >
            <div className="lesson-hero-card__top">
              <span className="lesson-hero-card__badge">NOW LEARNING</span>
              <Link to="/learn" className="lesson-hero-card__all-link">
                All levels
              </Link>
            </div>
            <p className="lesson-hero-card__kicker">{level.kicker || `LEVEL ${level.num || 1}`}</p>
            <h2 className="lesson-hero-card__title">{level.name}</h2>
            <p className="lesson-hero-card__completion">{heroSubtitle}</p>
            <div className="lesson-hero-card__progress-track" aria-hidden="true">
              <span className="lesson-hero-card__progress-fill" style={{ width: `${percent}%` }} />
            </div>

            <div className="lesson-hero-card__actions">
              {isLevelAvailable ? (
                <Link
                  className="lesson-hero-card__study-btn"
                  style={{ color: level.btnColor || level.gradientEnd }}
                  to={`/learn/session?level=${encodeURIComponent(level.id)}`}
                >
                  {completed === 0 ? 'Start learning' : 'Continue learning'}
                </Link>
              ) : (
                <button
                  type="button"
                  className="lesson-hero-card__study-btn lesson-hero-card__study-btn--disabled"
                  disabled
                  style={{ color: level.btnColor || level.gradientEnd }}
                >
                  Coming soon
                </button>
              )}
              <Link className="lesson-hero-card__review-btn" to="/learn/review">
                Review {reviewCount}
              </Link>
            </div>
          </section>

          <section className="lesson-quick-nav" aria-label="Course quick links">
            <Link className="lesson-quick-tile" to="/learn/review">
              <RotateCw size={18} aria-hidden="true" />
              <div className="lesson-quick-tile__copy">
                <strong>Review queue</strong>
                <span>{reviewCount} to review</span>
              </div>
            </Link>
            <div className="lesson-quick-tile lesson-quick-tile--stat">
              <CheckCircle2 size={18} aria-hidden="true" />
              <div className="lesson-quick-tile__copy">
                <strong>{completed.toLocaleString()}</strong>
                <span>Mastered</span>
              </div>
            </div>
            <Link className="lesson-quick-tile" to="/saved">
              <Bookmark size={18} aria-hidden="true" />
              <div className="lesson-quick-tile__copy">
                <strong>Saved words</strong>
                <span>{savedCount} saved</span>
              </div>
            </Link>
            <Link className="lesson-quick-tile" to="/interest">
              <Compass size={18} aria-hidden="true" />
              <div className="lesson-quick-tile__copy">
                <strong>Explore topics</strong>
                <span>Browse by category</span>
              </div>
            </Link>
          </section>
        </aside>

        <main className="lesson-content">
          <section className="lesson-browser" aria-labelledby="lesson-browser-title">
            <div className="study-section-heading">
              <div>
                <h2 id="lesson-browser-title">Browse words</h2>
                <p role="status">{visibleWords.length} of {words.length} available</p>
              </div>
              <StudySearch value={query} onChange={setQuery} label="Search course words" />
            </div>

            {isPublishedLevel && publishedCourse.isLoading ? (
              <div className="study-loading" role="status" aria-live="polite">
                <div className="study-spinner" aria-hidden="true" />
                <h3>Loading course content...</h3>
                <p>Retrieving published vocabulary for {level.name}.</p>
              </div>
            ) : isPublishedLevel && publishedCourse.isError ? (
              <div className="study-error" role="alert">
                <h3>Unable to load course content</h3>
                <p>{publishedCourse.error?.message || 'Failed to retrieve published vocabulary. Please check your connection and retry.'}</p>
                <button className="btn-primary" onClick={publishedCourse.retry}>Retry</button>
              </div>
            ) : isPublishedLevel && publishedCourse.isUnpublished ? (
              <div className="study-empty">
                <h3>Course not published</h3>
                <p>Content for {level.name} has not been published yet.</p>
                <Link className="study-text-link" to="/learn">Explore other courses</Link>
              </div>
            ) : words.length === 0 ? (
              <div className="study-empty">
                <h3>More words on the way</h3>
                <p>No {level.name} words yet. This level’s content is still being added.</p>
                <Link className="study-text-link" to="/learn">Explore other courses</Link>
              </div>
            ) : visibleWords.length === 0 ? (
              <div className="study-empty">
                <h3>No matching words</h3>
                <p>Try another word, reading or meaning.</p>
                <button className="btn-secondary" onClick={() => setQuery('')}>Clear search</button>
              </div>
            ) : (
              <ul className="lesson-word-list" aria-label={`${level.name} vocabulary`}>
                {visibleWords.map(stored => {
                  const word = wordDetails(stored);
                  return (
                    <li className="lesson-word" key={word.id}>
                      <div className="lesson-word__written">
                        <h3>{word.phrase}</h3>
                        {kanaOf(word) && <p className="lesson-word__kana" lang="ja">{kanaOf(word)}</p>}
                        {word.reading && <p className="lesson-word__reading">{word.reading}</p>}
                      </div>
                      <div className="lesson-word__meaning">
                        {word.english && <p lang="en">{word.english}</p>}
                        {word.burmese && <p lang="my">{word.burmese}</p>}
                      </div>
                      <button
                        type="button"
                        className="study-icon-button"
                        onClick={() => handlePlayWord(stored)}
                        aria-label={`Play word: ${word.phrase}`}
                      >
                        <Volume2 size={18} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
