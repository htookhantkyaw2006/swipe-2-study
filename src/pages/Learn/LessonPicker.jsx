import { useMemo, useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Layers, Compass, ChevronRight, RotateCw, CheckCircle2, Bookmark, Volume2 } from 'lucide-react';
import { useCourse } from '../../lib/language';
import { db } from '../../lib/db';
import { kanaOf, sayOf } from '../../lib/entry';
import { filterStudyWords, wordDetails } from '../../lib/studyWords';
import { speak } from '../../lib/speech';
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

  const totalWords = isPublishedLevel
    ? (publishedCourse.isLoaded ? publishedCourse.items.length : 0)
    : (publishedCourse.enabled ? 0 : level.words);

  // Real progress derived from learner records
  const progress = getLevelProgress(db, level.id, course, null, isPublishedLevel ? totalWords : (publishedCourse.enabled ? 0 : null));
  const completed = progress.uniqueLearned;
  const percent = totalWords > 0 ? Math.min(100, Math.floor((completed / totalWords) * 100)) : 0;

  const playWordAudio = (word) => {
    if (word?.audio_path && typeof Audio !== 'undefined') {
      try {
        const audio = new Audio(word.audio_path);
        audio.play().catch(() => speak(sayOf(word)));
        return;
      } catch {
        // Fall back to TTS
      }
    }
    speak(sayOf(word));
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
        ? `${completed.toLocaleString()} / ${level.words.toLocaleString()} completed`
        : `${level.words.toLocaleString()} vocabulary words`;

  return (
    <div className="study-page lesson-page">
      <StudyHeader title={level.name} subtitle={`${course.name} · Vocabulary course`} backTo="/learn" backLabel="Back to courses" />
      <div className="lesson-layout">
        <aside className="lesson-overview" aria-label={`${level.name} course overview`}>
          <section
            className="lesson-hero"
            style={{
              '--card-gradient-start': level.gradientStart,
              '--card-gradient-end': level.gradientEnd,
              '--level-accent': level.gradientEnd,
              background: `linear-gradient(135deg, ${level.gradientStart} 0%, ${level.gradientEnd} 100%)`,
              boxShadow: level.shadow ? `0 14px 34px ${level.shadow}` : undefined,
            }}
          >
            <p className="study-eyebrow">{level.tier}</p>
            <h2>{level.name}</h2>
            <p>{heroSubtitle}</p>
            <div className="lesson-hero__progress">
              <div className="lesson-hero__progress-label"><span>Course progress</span><span>{percent}%</span></div>
              <progress aria-label="Course progress" value={completed} max={totalWords || 1} />
              <p>{completed.toLocaleString()} of {totalWords.toLocaleString()} words</p>
            </div>
          </section>
          <section className="lesson-modules" aria-labelledby="lesson-modules-title">
            <h2 id="lesson-modules-title">Course modules</h2>
            {words.length > 0 ? (
              <Link className="lesson-module" to={`/learn/session?level=${encodeURIComponent(level.id)}`}>
                <span className="lesson-module__icon"><Layers size={23} aria-hidden="true" /></span>
                <span className="lesson-module__copy"><strong>Flashcards</strong><span>{words.length} {words.length === 1 ? 'card' : 'cards'} available</span></span>
                <ChevronRight size={20} aria-hidden="true" />
              </Link>
            ) : (
              <div className="lesson-module lesson-module--unavailable"><span className="lesson-module__icon"><Layers size={23} aria-hidden="true" /></span><span className="lesson-module__copy"><strong>Flashcards</strong><span>Cards coming soon</span></span></div>
            )}
            <Link className="lesson-module" to="/interest">
              <span className="lesson-module__icon"><Compass size={23} aria-hidden="true" /></span>
              <span className="lesson-module__copy"><strong>Explore</strong><span>Browse by topic</span></span>
              <ChevronRight size={20} aria-hidden="true" />
            </Link>
          </section>
        </aside>

        <div className="lesson-content">
          <section className="lesson-practice" aria-label="Flashcard practice">
            <Link className="lesson-practice__tile" to="/learn/review"><RotateCw size={21} aria-hidden="true" /><strong>Review</strong><span>{reviewCount} to review</span></Link>
            <div className="lesson-practice__tile"><CheckCircle2 size={21} aria-hidden="true" /><strong>{completed.toLocaleString()}</strong><span>Mastered</span></div>
            <Link className="lesson-practice__tile" to="/saved"><Bookmark size={21} aria-hidden="true" /><strong>Saved</strong><span>{savedCount} saved words</span></Link>
          </section>
          <section className="lesson-browser" aria-labelledby="lesson-browser-title">
            <div className="study-section-heading">
              <div><h2 id="lesson-browser-title">Browse words</h2><p role="status">{visibleWords.length} of {words.length} available</p></div>
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
                <Layers size={30} aria-hidden="true" />
                <h3>Course not published</h3>
                <p>Content for {level.name} has not been published yet.</p>
                <Link className="study-text-link" to="/learn">Explore other courses</Link>
              </div>
            ) : words.length === 0 ? (
              <div className="study-empty">
                <Layers size={30} aria-hidden="true" />
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
                      <button className="study-icon-button" onClick={() => playWordAudio(stored)} aria-label={`Play word: ${word.phrase}`}><Volume2 size={20} aria-hidden="true" /></button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
