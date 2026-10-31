import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, useMotionValue, useTransform, AnimatePresence, animate, usePresence, useReducedMotion } from 'framer-motion';
import { ChevronLeft, Check, X, Hand, Shuffle, Volume2, RotateCw } from 'lucide-react';
import { db } from '../../lib/db';
import { speak } from '../../lib/speech';
import { usePreferences } from '../../lib/preferences';
import { useCourse } from '../../lib/language';
import { readingOf, textOf, sayOf, kanaOf, fitFontCss } from '../../lib/entry';
import { readSessionCards } from '../../lib/studyWords';
import { phraseCards } from '../../lib/phraseCards';
import { recordWordAction } from '../../lib/vocabularyProgress';
import { usePublishedCourse } from '../../lib/publishedContentContext';
import { trackEvent } from '../../lib/analytics';
import './SwipeSession.css';

const ShuffleDeck = ({ reducedMotion }) => (
  <div className="swipe-shuffle" aria-hidden="true">
    {[-1, 0, 1].map((direction) => (
      <motion.div
        key={direction}
        className="swipe-card swipe-shuffle__card"
        animate={reducedMotion ? {} : { x: [0, direction * 18, 0], rotate: [0, direction * 7, 0] }}
        transition={{ duration: 0.45, ease: 'easeInOut' }}
      />
    ))}
  </div>
);

const Flashcard = ({ card, isActive, onSwipe, exitData, flipped, setFlipped, hasFlippedOnce, setHasFlippedOnce, dragOffset, reducedMotion, locked }) => {
  const { prefs } = usePreferences();
  const course = useCourse();
  const [isPresent] = usePresence();
  const wantEnglish = prefs.translationLanguage !== 'burmese';
  const wantBurmese = prefs.translationLanguage !== 'english' && prefs.showBurmese;
  const showEnglish = wantEnglish || !wantBurmese;
  const cardRef = useRef(null);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], reducedMotion ? [0, 0] : [-10, 10]);
  const backgroundColor = useTransform(x, [-100, 0, 100], ['#FEE2E2', '#FFFFFF', '#DCFCE7']);
  const nextScale = useTransform(dragOffset, [0, 100], [0.96, 1]);
  const nextOpacity = useTransform(dragOffset, [0, 100], [0.5, 1]);

  useEffect(() => {
    if (isActive && isPresent) return x.on('change', (latest) => dragOffset.set(Math.abs(latest)));
  }, [isActive, isPresent, x, dragOffset]);

  const handleDragEnd = (_event, info) => {
    // A desktop window should not make a small card harder to swipe.
    const width = cardRef.current?.offsetWidth ?? 320;
    const threshold = Math.min(100, Math.max(36, width * 0.22));
    if (info.offset.x > threshold || info.velocity.x > 800) onSwipe('right', card);
    else if (info.offset.x < -threshold || info.velocity.x < -800) onSwipe('left', card);
  };

  const toggleFlipped = () => {
    if (!isActive || !isPresent || locked) return;
    setFlipped(!flipped);
    setHasFlippedOnce(true);
  };
  const playWord = (event) => {
    event.stopPropagation();
    const audioPath = typeof card?.audio_path === 'string' ? card.audio_path.trim() : null;
    if (audioPath && typeof Audio !== 'undefined') {
      try {
        const audio = new Audio(audioPath);
        let hasFallenBack = false;
        const fallback = () => {
          if (!hasFallenBack) {
            hasFallenBack = true;
            speak(sayOf(card));
          }
        };
        audio.addEventListener('error', fallback, { once: true });
        audio.play().catch(fallback);
        return;
      } catch {
        // Fall back to speech synthesis
      }
    }
    speak(sayOf(card));
  };
  const pronunciation = card.pronunciation ?? readingOf(card);

  return (
    <motion.div
      ref={cardRef}
      className={`swipe-card${isActive ? ' swipe-card--active' : ''}`}
      role="group"
      aria-label={isActive ? 'Current flashcard' : undefined}
      aria-hidden={!isActive || !isPresent}
      inert={!isActive || !isPresent}
      custom={exitData}
      variants={{
        enter: { scale: reducedMotion ? 1 : 0.96, opacity: 0 },
        center: { x: 0, scale: 1, opacity: 1 },
        exit: ({ direction }) => ({ x: reducedMotion ? 0 : (direction === 'right' ? 560 : -560), opacity: 0 }),
      }}
      initial="enter"
      animate={isActive ? 'center' : { scale: nextScale, opacity: nextOpacity }}
      exit="exit"
      transition={{ duration: reducedMotion ? 0 : 0.22, ease: 'easeOut' }}
      style={isActive ? { x, rotate, zIndex: 10 } : { zIndex: 1 }}
      drag={isActive && isPresent && !locked ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={handleDragEnd}
      onClick={toggleFlipped}
    >
      <motion.div
        className="swipe-card__turn"
        initial={false}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.3, ease: 'easeInOut' }}
      >
        <motion.div
          className="swipe-card__face swipe-card__front"
          style={{ backgroundColor: isActive ? backgroundColor : '#FFFFFF' }}
          aria-hidden={flipped}
          inert={flipped}
        >
          <div className="swipe-card__topline">
            <span className="swipe-card__level">{card.level || course.levels[0].name}</span>
            <button className="swipe-audio" onPointerDown={(e) => e.stopPropagation()} onClick={playWord} aria-label="Play word">
              <Volume2 size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="swipe-card__word">
            <h2 className="swipe-card__character" style={{ '--word-size': fitFontCss(card.character, 76) }}>{card.character}</h2>
            {kanaOf(card) && <p className="swipe-card__kana" lang="ja">{kanaOf(card)}</p>}
            {prefs.showPinyin && pronunciation && <p className="swipe-card__reading">{pronunciation}</p>}
          </div>
          <p className={`swipe-card__tap${hasFlippedOnce ? ' swipe-card__tap--hidden' : ''}`}>
            <Hand size={16} aria-hidden="true" /> Tap to reveal
          </p>
        </motion.div>

        <motion.div
          className="swipe-card__face swipe-card__back"
          style={{ backgroundColor: isActive ? backgroundColor : '#FFFFFF' }}
          aria-hidden={!flipped}
          inert={!flipped}
        >
          <div className="swipe-card__answer slim-scrollbar" role="region" aria-label="Answer and examples" tabIndex={isActive && flipped ? 0 : -1}>
            <div className="swipe-card__topline">
              <span className="swipe-card__level">{card.level || course.levels[0].name}</span>
              <button className="swipe-audio" onPointerDown={(e) => e.stopPropagation()} onClick={playWord} aria-label="Play word">
                <Volume2 size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="swipe-card__meaning">
              <h2 className="swipe-card__character" style={{ '--word-size': fitFontCss(card.character, 48) }}>{card.character}</h2>
              {kanaOf(card) && <p className="swipe-card__kana" lang="ja">{kanaOf(card)}</p>}
              {prefs.showPinyin && pronunciation && <p className="swipe-card__reading">{pronunciation}</p>}
              <div className="swipe-card__definitions">
                {showEnglish && <p className="swipe-card__english" lang="en">{card.definition}</p>}
                {wantBurmese && <p className="swipe-card__burmese" lang="my">{card.burmese_definition}</p>}
              </div>
            </div>
            {card.examples?.length > 0 && (
              <section className="swipe-card__examples" aria-label="Examples">
                <h3>Examples</h3>
                {card.examples.map((ex, idx) => (
                  <div key={idx} className="swipe-example">
                    <div className="swipe-example__topline">
                      <p className="swipe-example__text">{textOf(ex)}</p>
                      <button
                        className="swipe-audio swipe-audio--example"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); speak(sayOf(ex)); }}
                        aria-label={`Play sentence: ${textOf(ex)}`}
                      >
                        <Volume2 size={18} aria-hidden="true" />
                      </button>
                    </div>
                    {prefs.showPinyin && readingOf(ex) && <p className="swipe-example__reading">{readingOf(ex)}</p>}
                    {showEnglish && ex.english && <p lang="en">{ex.english}</p>}
                    {wantBurmese && ex.burmese && <p className="swipe-example__burmese" lang="my">{ex.burmese}</p>}
                  </div>
                ))}
              </section>
            )}
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

const shuffleCards = (list) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export default function SwipeSession({ isReview = false, isSaved = false, isPhrases = false }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const levelId = searchParams.get('level');
  const course = useCourse();
  const { prefs } = usePreferences();
  const reducedMotion = useReducedMotion();
  const targetLevel = levelId || course.levels[0]?.id;
  const publishedCourse = usePublishedCourse(targetLevel);
  const isPublishedSession = !isReview && !isSaved && !isPhrases && publishedCourse.enabled && publishedCourse.isInScope;

  // A session snapshots its deck; preferences cannot replace cards mid-session.
  const [cards, setCards] = useState(() => {
    if (isPublishedSession) {
      if (publishedCourse.isLoaded) {
        const allCards = publishedCourse.items;
        return (prefs.cardOrder === 'shuffle' ? shuffleCards(allCards) : allCards).slice(0, prefs.cardsPerSession);
      }
      return [];
    }
    const allCards = isPhrases ? phraseCards(course, levelId) : readSessionCards(db, { mode: isReview ? 'review' : isSaved ? 'saved' : 'learn', levelId });
    if (isReview || isSaved) return allCards;
    return (prefs.cardOrder === 'shuffle' ? shuffleCards(allCards) : allCards).slice(0, prefs.cardsPerSession);
  });

  const initializedRef = useRef(isPublishedSession && publishedCourse.isLoaded);
  useEffect(() => {
    if (isPublishedSession && publishedCourse.isLoaded && !initializedRef.current) {
      initializedRef.current = true;
      const allCards = publishedCourse.items;
      setCards((prefs.cardOrder === 'shuffle' ? shuffleCards(allCards) : allCards).slice(0, prefs.cardsPerSession));
    }
  }, [isPublishedSession, publishedCourse.isLoaded, publishedCourse.items, prefs.cardOrder, prefs.cardsPerSession]);

  const sessionStartedRef = useRef(false);
  useEffect(() => {
    if (cards.length > 0 && !sessionStartedRef.current) {
      sessionStartedRef.current = true;
      if (!isPhrases) {
        trackEvent('study:session_start', {
          courseId: course.id,
          levelId: targetLevel,
          mode: isReview ? 'review' : isSaved ? 'saved' : 'learn',
          cardCount: cards.length,
        }, { dedupeKey: 'session_start_' + course.id + '_' + targetLevel + '_' + cards.length });
      }
    }
  }, [cards.length, course.id, targetLevel, isPhrases, isReview, isSaved]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [hasFlippedOnce, setHasFlippedOnce] = useState(false);
  const [exitData, setExitData] = useState({ direction: 'right' });
  const [shuffleState, setShuffleState] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const actionLocked = useRef(false);
  const timers = useRef([]);
  const dragOffset = useMotionValue(0);
  const backTo = isPhrases
    ? (levelId ? `/flashcards/level/${encodeURIComponent(levelId)}` : '/flashcards')
    : isSaved ? '/saved' : isReview ? '/learn/review'
      : `/learn/level/${encodeURIComponent(levelId || cards[0]?.level || course.levels[0].id)}`;
  const after = (callback, delay) => timers.current.push(setTimeout(callback, delay));

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    const card = cards[currentIndex];
    if (card && prefs.autoPlayAudio) {
      const audioPath = typeof card?.audio_path === 'string' ? card.audio_path.trim() : null;
      if (audioPath && typeof Audio !== 'undefined') {
        try {
          const audio = new Audio(audioPath);
          let hasFallenBack = false;
          const fallback = () => {
            if (!hasFallenBack) {
              hasFallenBack = true;
              speak(sayOf(card));
            }
          };
          audio.addEventListener('error', fallback, { once: true });
          audio.play().catch(fallback);
          return;
        } catch {
          // Fall back to speech synthesis
        }
      }
      speak(sayOf(card));
    }
  }, [cards, currentIndex, prefs.autoPlayAudio]);

  const triggerSwipe = (direction, swipedCard = cards[currentIndex]) => {
    if (actionLocked.current || !swipedCard) return;
    actionLocked.current = true;
    setAdvancing(true);
    setExitData({ direction });
    // Phrase practice does not write into vocabulary progress or review queue.
    if (!isPhrases) {
      recordWordAction(db, {
        card: swipedCard,
        direction,
        levelId: levelId || swipedCard.level || cards[0]?.level || course.levels[0].id,
      });
    }
    setFlipped(false);
    setHasFlippedOnce(false);
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(index => index + 1);
      animate(dragOffset, 0, { duration: reducedMotion ? 0 : 0.22 });
      after(() => { actionLocked.current = false; setAdvancing(false); }, reducedMotion ? 0 : 240);
    } else {
      if (!isPhrases) {
        trackEvent('study:session_complete', {
          courseId: course.id,
          levelId: targetLevel,
          mode: isReview ? 'review' : isSaved ? 'saved' : 'learn',
          cardCount: cards.length,
        }, { dedupeKey: 'session_complete_' + course.id + '_' + targetLevel + '_' + cards.length });
      }
      after(() => navigate(backTo), reducedMotion ? 0 : 240);
    }
  };

  const handleShuffle = () => {
    if (actionLocked.current || cards.length - currentIndex <= 1) return;
    actionLocked.current = true;
    setShuffleState(true);
    if (!reducedMotion && navigator.vibrate) navigator.vibrate(50);
    after(() => {
      setCards(previous => [...previous.slice(0, currentIndex), ...shuffleCards(previous.slice(currentIndex))]);
      setFlipped(false);
      setHasFlippedOnce(false);
      dragOffset.set(0);
      setShuffleState(false);
      actionLocked.current = false;
    }, reducedMotion ? 0 : 450);
  };

  if (isPublishedSession && publishedCourse.isLoading) {
    return (
      <div className="swipe-session swipe-session--loading">
        <div className="swipe-empty" role="status" aria-live="polite">
          <div className="study-spinner" aria-hidden="true" />
          <h1>Loading flashcards...</h1>
          <p>Preparing published course content</p>
        </div>
      </div>
    );
  }

  if (isPublishedSession && publishedCourse.isError) {
    return (
      <div className="swipe-session swipe-session--error">
        <div className="swipe-empty" role="alert">
          <X size={32} aria-hidden="true" style={{ color: '#B91C1C', margin: '0 auto 16px' }} />
          <h1>Unable to load flashcards</h1>
          <p>{publishedCourse.error?.message || 'Failed to load published course content.'}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button className="btn-primary" onClick={publishedCourse.retry}>Retry</button>
            <button className="btn-secondary" onClick={() => navigate(backTo)}>Back to course</button>
          </div>
        </div>
      </div>
    );
  }

  if (isPublishedSession && publishedCourse.isUnpublished) {
    return (
      <div className="swipe-session swipe-session--empty">
        <div className="swipe-empty">
          <Check size={32} aria-hidden="true" />
          <h1>Course not published</h1>
          <p>This course has not been published yet.</p>
          <button className="btn-primary" onClick={() => navigate(backTo)}>Back to courses</button>
        </div>
      </div>
    );
  }

  if (cards.length === 0) return (
    <div className="swipe-session swipe-session--empty">
      <div className="swipe-empty">
        <Check size={32} aria-hidden="true" />
        <h1>{isReview ? 'All caught up!' : isSaved ? 'No saved words yet' : 'No cards yet'}</h1>
        <p>{isPhrases ? 'Phrases for this level are not available yet. Choose another level to practise.' : isReview ? 'You have no cards to review right now.' : isSaved ? 'Bookmark words in the dictionary to study them here.' : 'Choose a course to start learning.'}</p>
        <button className="btn-primary" onClick={() => navigate(isPhrases ? '/flashcards' : isSaved ? '/saved' : isReview ? '/learn/review' : '/learn')}>Back to {isPhrases ? 'phrases' : isSaved ? 'saved words' : isReview ? 'review' : 'courses'}</button>
      </div>
    </div>
  );

  const visibleCards = cards.slice(currentIndex, currentIndex + 2);
  const locked = advancing || shuffleState;
  return (
    <div className={`swipe-session${isPhrases ? ' swipe-session--phrases' : ''}`}>
      <header className="swipe-session__header">
        <button className="swipe-session__icon" onClick={() => navigate(backTo)} aria-label="Leave session"><ChevronLeft size={22} aria-hidden="true" /></button>
        <div className="swipe-session__heading">
          <p className="swipe-session__eyebrow">{isPhrases ? course.name : isReview ? 'Your review' : isSaved ? 'Your collection' : 'Flashcard practice'}</p>
          <h1>{isPhrases ? 'Phrase practice' : isReview ? 'Review Session' : isSaved ? 'Saved Words' : (cards[0]?.lesson_name ?? course.copy.lessonName)}</h1>
        </div>
        <button className="swipe-session__icon" onClick={handleShuffle} disabled={locked || cards.length - currentIndex <= 1} aria-label="Shuffle remaining cards" title="Shuffle remaining cards"><Shuffle size={20} aria-hidden="true" /></button>
        <div className="swipe-session__progress">
          <progress value={currentIndex} max={cards.length} aria-label="Session progress" />
          <span role="status">{currentIndex}/{cards.length} completed</span>
        </div>
      </header>

      <div className="swipe-session__stage" aria-busy={shuffleState}>
        {shuffleState && <ShuffleDeck reducedMotion={reducedMotion} />}
        <AnimatePresence custom={exitData}>
          {!shuffleState && visibleCards.map((card, idx) => (
            <Flashcard
              key={card.id}
              card={card}
              isActive={idx === 0}
              flipped={idx === 0 && flipped}
              setFlipped={setFlipped}
              hasFlippedOnce={idx === 0 && hasFlippedOnce}
              setHasFlippedOnce={setHasFlippedOnce}
              onSwipe={triggerSwipe}
              exitData={exitData}
              dragOffset={dragOffset}
              reducedMotion={reducedMotion}
              locked={locked}
            />
          ))}
        </AnimatePresence>
      </div>

      <footer className="swipe-session__footer">
        <div className="swipe-session__actions">
          <button className="swipe-action swipe-action--review" onClick={() => triggerSwipe('left')} disabled={locked} aria-label={isPhrases ? 'Needs more phrase practice' : 'Review this word later'}><X size={24} aria-hidden="true" /><span>{isPhrases ? 'Practise' : 'Review'}</span></button>
          <button className="swipe-action swipe-action--flip" onClick={() => { setFlipped(!flipped); setHasFlippedOnce(true); }} disabled={locked} aria-label={flipped ? 'Show word' : 'Reveal answer'}><RotateCw size={21} aria-hidden="true" /><span>{flipped ? 'Show word' : 'Reveal'}</span></button>
          <button className="swipe-action swipe-action--learned" onClick={() => triggerSwipe('right')} disabled={locked} aria-label={isPhrases ? 'Mark this phrase familiar' : 'Mark this word learned'}><Check size={26} aria-hidden="true" /><span>{isPhrases ? 'Familiar' : 'Learned'}</span></button>
        </div>
        <p className="swipe-session__hint">{isPhrases ? 'Swipe left for more practice · right for familiar' : 'Swipe left to review · right for learned'}</p>
      </footer>
    </div>
  );
}
