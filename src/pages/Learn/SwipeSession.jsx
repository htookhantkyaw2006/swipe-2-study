import React, { useState, useEffect, useRef, useContext } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, useMotionValue, useTransform, AnimatePresence, animate, usePresence, useReducedMotion } from 'framer-motion';
import { ChevronLeft, Check, X, Hand, Shuffle, Volume2, RotateCw, Bookmark, BookmarkMinus } from 'lucide-react';
import ProgressBar from '../../components/ui/ProgressBar';
import { db } from '../../lib/db';
import { speak } from '../../lib/speech';
import { playWordAudio } from '../../lib/wordAudio';
import { usePreferences } from '../../lib/preferences';
import { useCourse } from '../../lib/language';
import { readingOf, textOf, kanaOf, fitFontCss, wordOf } from '../../lib/entry';
import { readSessionCards, buildNormalSessionCards, buildStudiedKeySet, findSavedWord, buildSavedWordRecord } from '../../lib/studyWords';
import { phraseCards } from '../../lib/phraseCards';
import { recordWordAction } from '../../lib/vocabularyProgress';
import { usePublishedCourse } from '../../lib/publishedContentContext';
import { resolvePublishedCourseId } from '../../lib/publishedContentService';
import { AuthContext } from '../../lib/authContext';
import { storageOwner } from '../../lib/storageOwner';
import { trackEvent } from '../../lib/analytics';

const ShuffleDeck = () => {
  const baseCardStyle = {
    position: 'absolute',
    width: '75%', maxWidth: '340px', maxHeight: '70vh', aspectRatio: '2/3',
    left: 0, right: 0, top: 0, bottom: 0, margin: 'auto',
    borderRadius: '24px',
    backgroundColor: '#FFFFFF',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    border: '1px solid #E0F2FE',
  };

  return (
    <div style={{ position: 'absolute', width: '100%', height: '100%', zIndex: 5, pointerEvents: 'none' }}>
      <motion.div
        style={baseCardStyle}
        animate={{ y: [0, 0, 10, 0] }}
        transition={{ duration: 0.5, times: [0, 0.3, 0.5, 1], ease: ["linear", "easeOut", [0.34, 1.56, 0.64, 1]] }}
      />
      <motion.div
        style={baseCardStyle}
        animate={{ x: [0, 0, 20, 0], rotate: [0, 0, 8, 0] }}
        transition={{ duration: 0.5, times: [0, 0.2, 0.5, 1], ease: ["linear", "easeOut", [0.34, 1.56, 0.64, 1]] }}
      />
      <motion.div
        style={baseCardStyle}
        animate={{ x: [0, 0, -20, 0], rotate: [0, 0, -8, 0] }}
        transition={{ duration: 0.5, times: [0, 0.1, 0.5, 1], ease: ["linear", "easeOut", [0.34, 1.56, 0.64, 1]] }}
      />
    </div>
  );
};

const Flashcard = ({
  card,
  isActive,
  isRight,
  onSwipe,
  exitData,
  flipped,
  setFlipped,
  hasFlippedOnce,
  setHasFlippedOnce,
  shuffleState,
  dragOffset,
  reducedMotion,
  locked,
  isPhrases,
  isSaved,
  onToggleSave
}) => {
  const { prefs } = usePreferences();
  const course = useCourse();
  const [isPresent] = usePresence();

  const wantEnglish = prefs.translationLanguage !== 'burmese';
  const wantBurmese = prefs.translationLanguage !== 'english' && prefs.showBurmese;
  const showEnglish = wantEnglish || !wantBurmese;
  const showBurmese = wantBurmese;

  const cardRef = useRef(null);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], reducedMotion ? [0, 0] : [-15, 15]);
  const backgroundColor = useTransform(x, [-100, 0, 100], ['#FEE2E2', '#FFFFFF', '#DCFCE7']);

  const glowShadow = useTransform(x, [-200, 0, 200], [
    '0 4px 32px rgba(239, 68, 68, 0.5)',
    '0 8px 32px rgba(12, 74, 110, 0.08), 0 2px 8px rgba(12, 74, 110, 0.04)',
    '0 4px 32px rgba(34, 197, 94, 0.5)'
  ]);

  useEffect(() => {
    if (isActive && isPresent) {
      return x.on('change', (latest) => {
        dragOffset.set(Math.abs(latest));
      });
    }
  }, [isActive, isPresent, x, dragOffset]);

  const nextScale = useTransform(dragOffset, [0, 100], [0.95, 1]);
  const nextOpacity = useTransform(dragOffset, [0, 100], [0.5, 1]);

  const handleDragEnd = (_event, info) => {
    const width = cardRef.current?.offsetWidth ?? 320;
    const threshold = Math.min(100, Math.max(36, width * 0.22));
    if (info.offset.x > threshold || info.velocity.x > 800) {
      onSwipe('right', card);
    } else if (info.offset.x < -threshold || info.velocity.x < -800) {
      onSwipe('left', card);
    }
  };

  const activeAudioRef = useRef(null);
  useEffect(() => () => activeAudioRef.current?.cancel(), []);

  const playWord = (e) => {
    e.stopPropagation();
    activeAudioRef.current?.cancel();
    activeAudioRef.current = playWordAudio(card, { speakFn: speak });
  };

  if (!card) return null;

  const char = card.character || wordOf(card) || '';
  const reading = card.pronunciation ?? readingOf(card) ?? '';
  const wordLabel = char || 'word';
  const isBookmarked = isSaved === true;
  const isUnavailable = isSaved === null;

  // Front Content
  const frontContent = (
    <motion.div
      style={{
        position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(0deg)',
        display: 'flex', flexDirection: 'column', padding: '24px',
        backgroundColor: isActive ? backgroundColor : '#FFFFFF',
        borderRadius: '24px',
        boxShadow: '0 8px 32px rgba(12, 74, 110, 0.08), 0 2px 8px rgba(12, 74, 110, 0.04)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
        <div style={{
          backgroundColor: '#0C4A6E', color: '#FFFFFF', padding: '4px 12px',
          borderRadius: '100px', fontSize: '0.75rem', fontWeight: 600,
          fontFamily: 'JetBrains Mono, monospace'
        }}>
          {card.level || course.levels[0]?.name || 'Level 1'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!isPhrases && (
            <button
              type="button"
              className={`swipe-bookmark${isBookmarked ? ' swipe-bookmark--saved' : ''}`}
              disabled={!isActive || locked || isUnavailable}
              aria-label={isUnavailable ? `Bookmark status unavailable for ${wordLabel}` : `${isBookmarked ? 'Unsave' : 'Save'} ${wordLabel}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (!isActive || locked || isUnavailable) return;
                onToggleSave?.(card);
              }}
              style={{
                width: '36px', height: '36px', borderRadius: '50%',
                backgroundColor: isBookmarked ? '#D1FAE5' : '#F1F5F9',
                color: isBookmarked ? '#059669' : '#0C4A6E',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                boxShadow: '0 2px 6px rgba(12, 74, 110, 0.08)'
              }}
            >
              {isBookmarked ? <BookmarkMinus size={18} strokeWidth={2.5} /> : <Bookmark size={18} strokeWidth={2.5} />}
            </button>
          )}
          <button
            type="button"
            className="swipe-audio"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={playWord}
            aria-label={`Play pronunciation for ${wordLabel}`}
            style={{
              width: '36px', height: '36px', borderRadius: '50%',
              backgroundColor: '#0C4A6E', color: '#FFFFFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', cursor: 'pointer', transition: 'transform 0.1s, box-shadow 0.2s',
              boxShadow: '0 4px 12px rgba(12, 74, 110, 0.3)'
            }}
          >
            <Volume2 size={20} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: '-20px', alignSelf: 'stretch', containerType: 'inline-size' }}>
        <h1 className="swipe-card__character" style={{ fontSize: fitFontCss(char, 72), margin: 0, color: '#0C4A6E', fontWeight: 800, textAlign: 'center', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
          {char}
        </h1>
        {kanaOf(card) && <p style={{ fontSize: '22px', color: '#0284C7', fontWeight: 600, margin: '8px 0 0 0' }}>{kanaOf(card)}</p>}
        {prefs.showPinyin && reading && <p style={{ fontSize: '20px', color: '#38BDF8', fontFamily: 'var(--font-reading)', margin: '8px 0 0 0' }}>{reading}</p>}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        color: '#BAE6FD', fontSize: '14px', fontWeight: 500,
        opacity: hasFlippedOnce ? 0 : 1, transition: 'opacity 0.3s'
      }}>
        <Hand size={16} />
        Tap to reveal
      </div>
    </motion.div>
  );

  // Back Content
  const backContent = (
    <motion.div style={{
      position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden',
      WebkitBackfaceVisibility: 'hidden',
      transform: 'rotateY(180deg)',
      backgroundColor: isActive ? backgroundColor : '#FFFFFF',
      borderRadius: '24px',
      boxShadow: '0 8px 32px rgba(12, 74, 110, 0.08), 0 2px 8px rgba(12, 74, 110, 0.04)', overflow: 'hidden'
    }}>
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, containerType: 'inline-size' }}>
          <h2 style={{ fontSize: fitFontCss(char, 48), color: '#0C4A6E', fontWeight: 700, margin: 0, lineHeight: 1, whiteSpace: 'nowrap' }}>
            {char}
          </h2>
          {kanaOf(card) && <p style={{ fontSize: '18px', color: '#0284C7', fontWeight: 600, margin: '6px 0 0 0' }}>{kanaOf(card)}</p>}
          {prefs.showPinyin && reading && <p style={{ fontSize: '18px', color: '#38BDF8', fontFamily: 'var(--font-reading)', margin: '4px 0 16px 0' }}>{reading}</p>}

          <div style={{ width: '100%', height: '1px', backgroundColor: '#BAE6FD', marginBottom: '16px', margin: '0 24px 16px 24px' }}></div>

          {showEnglish && (card.definition || card.meaning_english) && (
            <p style={{ fontSize: '22px', color: '#0C4A6E', fontWeight: 600, margin: '0 0 4px 0', textAlign: 'center' }}>
              {card.definition || card.meaning_english}
            </p>
          )}
          {showBurmese && (card.burmese_definition || card.meaning_burmese) && (
            <p style={{ fontSize: '18px', color: '#0284C7', fontWeight: 400, margin: 0, textAlign: 'center' }}>
              {card.burmese_definition || card.meaning_burmese}
            </p>
          )}
        </div>

        {card.examples && card.examples.length > 0 && (
          <div style={{ padding: '0 24px 24px 24px', flexShrink: 0 }}>
            <h3 style={{ fontSize: '14px', color: '#38BDF8', fontWeight: 500, margin: '0 0 12px 0' }}>Examples</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {card.examples.map((ex, idx) => (
                <div key={idx} style={{ backgroundColor: '#F0F9FF', borderRadius: '12px', padding: '16px', paddingRight: '56px', display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
                  <button
                    type="button"
                    className="swipe-audio swipe-audio--example"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); playWordAudio(ex, { speakFn: speak }); }}
                    title="Play sentence"
                    aria-label={`Play sentence: ${textOf(ex)}`}
                    style={{
                      position: 'absolute', top: '10px', right: '10px',
                      width: '34px', height: '34px', borderRadius: '50%',
                      backgroundColor: '#FFFFFF', color: 'var(--color-primary-blue)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: 'none', cursor: 'pointer', padding: 0,
                      boxShadow: '0 2px 6px rgba(3, 105, 161, 0.15)',
                      transition: 'background-color 0.2s, color 0.2s'
                    }}
                  >
                    <Volume2 size={16} strokeWidth={2.5} />
                  </button>
                  <p style={{ fontSize: '16px', color: '#0C4A6E', fontWeight: 500, margin: 0 }}>{textOf(ex)}</p>
                  {prefs.showPinyin && readingOf(ex) && <p style={{ fontSize: '14px', color: '#38BDF8', fontFamily: 'var(--font-reading)', margin: 0 }}>{readingOf(ex)}</p>}
                  {showEnglish && (ex.english || ex.meaning_english) && <p style={{ fontSize: '14px', color: '#0C4A6E', fontWeight: 400, margin: 0 }}>{ex.english || ex.meaning_english}</p>}
                  {showBurmese && (ex.burmese || ex.meaning_burmese) && <p className="swipe-example__burmese" style={{ fontSize: '14px', color: '#0284C7', fontWeight: 400, margin: 0 }}>{ex.burmese || ex.meaning_burmese}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );

  let motionProps = {};
  if (isActive) {
    if (shuffleState) {
      motionProps = {
        initial: { opacity: 0, scale: 0.95 },
        animate: { opacity: 0, scale: 0.95 },
        style: { zIndex: 10, pointerEvents: 'none' }
      };
    } else {
      motionProps = {
        custom: exitData,
        variants: {
          enter: { scale: reducedMotion ? 1 : 0.95, opacity: 0.4 },
          center: { x: 0, scale: 1, opacity: 1, zIndex: 10, transition: { duration: reducedMotion ? 0 : 0.4, ease: "easeOut" } },
          exit: ({ direction }) => ({
            x: reducedMotion ? 0 : (direction === 'right' ? window.innerWidth + 100 : -window.innerWidth - 100),
            opacity: 1,
            scale: 1,
            transition: { duration: reducedMotion ? 0 : 0.35, ease: "easeOut" }
          })
        },
        initial: "enter",
        animate: "center",
        exit: "exit",
        style: {
          x, rotate, zIndex: 10,
          boxShadow: glowShadow,
          cursor: 'grab'
        },
        drag: !locked ? "x" : false,
        dragConstraints: { left: 0, right: 0 },
        dragElastic: 0.7,
        onDragEnd: handleDragEnd,
        whileTap: { cursor: 'grabbing' }
      };
    }
  } else if (isRight) {
    motionProps = {
      initial: { scale: 0.95, opacity: 0 },
      animate: { opacity: nextOpacity, scale: nextScale },
      transition: { duration: reducedMotion ? 0 : 0.4, ease: "easeOut" },
      style: {
        x: 0,
        zIndex: 1, pointerEvents: 'none'
      }
    };
  }

  return (
    <motion.div
      ref={cardRef}
      className={`swipe-card${isActive ? ' swipe-card--active' : ''}`}
      {...motionProps}
      style={{
        position: 'absolute',
        width: '75%',
        maxWidth: '340px',
        maxHeight: '70vh',
        aspectRatio: '2/3',
        left: 0, right: 0, top: 0, bottom: 0, margin: 'auto',
        borderRadius: '20px',
        perspective: '1000px',
        ...motionProps.style
      }}
      onClick={() => {
        if (isActive && !locked) {
          setFlipped(!flipped);
          if (!hasFlippedOnce) setHasFlippedOnce(true);
        }
      }}
    >
      <motion.div
        initial={false}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.4, ease: "easeInOut" }}
        style={{
          width: '100%', height: '100%', position: 'relative',
          transformStyle: 'preserve-3d', WebkitTransformStyle: 'preserve-3d'
        }}
      >
        {frontContent}
        {backContent}
      </motion.div>
    </motion.div>
  );
};

/* Fisher–Yates shuffle */
const shuffleCards = (list) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

function snapshotLearnSession(allCards, { isTrialGuest, cardOrder, cardsPerSession }) {
  const GUEST_TRIAL_SIZE = 30;
  const learnedWords = (() => {
    try { return db.get('learned_words'); } catch { return []; }
  })();
  const studiedKeys = buildStudiedKeySet(learnedWords);
  return buildNormalSessionCards(allCards, studiedKeys, {
    shuffle: cardOrder === 'shuffle',
    sessionSize: cardsPerSession,
    isGuest: isTrialGuest,
    guestTrialSize: GUEST_TRIAL_SIZE,
  });
}

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
  const isNormalLearn = !isReview && !isSaved && !isPhrases;

  const resolvedCourseId = resolvePublishedCourseId(course.id, targetLevel);
  const isHsk1 = resolvedCourseId === 'zh-hsk1';
  const isTrialApplicable = isNormalLearn && isHsk1;

  const auth = useContext(AuthContext);
  const isConfirmedGuest = auth
    ? (auth.isGuest && !auth.loading && !auth.isTransitioning)
    : (storageOwner.getOwner() === null);
  const isTrialGuest = isTrialApplicable && isConfirmedGuest;

  const [cards, setCards] = useState(() => {
    if (isPublishedSession) {
      if (publishedCourse.isLoaded) {
        const result = snapshotLearnSession(publishedCourse.items, {
          isTrialGuest,
          cardOrder: prefs.cardOrder,
          cardsPerSession: prefs.cardsPerSession,
        });
        return result.cards;
      }
      return [];
    }
    if (isNormalLearn) {
      const allCards = readSessionCards(db, { mode: 'learn', levelId: isHsk1 ? (course.levels[0]?.id || levelId) : levelId });
      const result = snapshotLearnSession(allCards, {
        isTrialGuest,
        cardOrder: prefs.cardOrder,
        cardsPerSession: prefs.cardsPerSession,
      });
      return result.cards;
    }
    const allCards = isPhrases ? phraseCards(course, levelId) : readSessionCards(db, { mode: isReview ? 'review' : isSaved ? 'saved' : 'learn', levelId });
    if (isReview || isSaved) return allCards;
    return (prefs.cardOrder === 'shuffle' ? shuffleCards(allCards) : allCards).slice(0, prefs.cardsPerSession);
  });

  const [completionState, setCompletionState] = useState(() => {
    if (isPublishedSession && publishedCourse.isLoaded) {
      const result = snapshotLearnSession(publishedCourse.items, {
        isTrialGuest,
        cardOrder: prefs.cardOrder,
        cardsPerSession: prefs.cardsPerSession,
      });
      if (result.allStudied) {
        return {
          kind: result.allTrialStudied ? 'trial-done' : 'all-studied',
          trialSize: result.trialSize,
        };
      }
    } else if (isNormalLearn && !isPublishedSession) {
      const allCards = readSessionCards(db, { mode: 'learn', levelId: isHsk1 ? (course.levels[0]?.id || levelId) : levelId });
      if (allCards.length > 0) {
        const result = snapshotLearnSession(allCards, {
          isTrialGuest,
          cardOrder: prefs.cardOrder,
          cardsPerSession: prefs.cardsPerSession,
        });
        if (result.allStudied) {
          return {
            kind: result.allTrialStudied ? 'trial-done' : 'all-studied',
            trialSize: result.trialSize,
          };
        }
      }
    }
    return { kind: 'none', trialSize: 0 };
  });

  const initializedRef = useRef(isPublishedSession && publishedCourse.isLoaded);
  useEffect(() => {
    if (!isPublishedSession) return;
    if (publishedCourse.isLoaded && !initializedRef.current) {
      initializedRef.current = true;
      const result = snapshotLearnSession(publishedCourse.items, {
        isTrialGuest,
        cardOrder: prefs.cardOrder,
        cardsPerSession: prefs.cardsPerSession,
      });
      setCards(result.cards);
      if (result.allStudied) {
        setCompletionState({
          kind: result.allTrialStudied ? 'trial-done' : 'all-studied',
          trialSize: result.trialSize,
        });
      }
    }
  }, [isPublishedSession, publishedCourse.isLoaded, publishedCourse.items, isTrialGuest, prefs.cardOrder, prefs.cardsPerSession]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [hasFlippedOnce, setHasFlippedOnce] = useState(false);
  const [exitData, setExitData] = useState({ direction: 'right' });
  const [shuffleState, setShuffleState] = useState(false);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const actionLocked = useRef(false);
  const dragOffset = useMotionValue(0);

  const [savedWords, setSavedWords] = useState(() => {
    try { return db.get('saved_words') || []; } catch { return []; }
  });

  useEffect(() => {
    const unsub = storageOwner.subscribeChange(() => {
      try { setSavedWords(db.get('saved_words') || []); } catch { /* ignore */ }
    });
    return () => unsub?.();
  }, []);

  const sessionStatsRef = useRef({ studied: 0, learned: 0, review: 0 });

  // Auto-play audio on front card reveal
  useEffect(() => {
    const card = cards[currentIndex];
    if (card && prefs.autoPlayAudio) {
      playWordAudio(card, { speakFn: speak });
    }
  }, [cards, currentIndex, prefs.autoPlayAudio]);

  const backTo = isPhrases
    ? '/flashcards'
    : isSaved
      ? '/saved'
      : isReview
        ? '/learn/review'
        : (levelId ? `/learn/level/${encodeURIComponent(levelId)}` : '/learn');

  const handleToggleSave = (card) => {
    if (!card) return;
    const existing = findSavedWord(savedWords, card);
    if (existing) {
      db.remove('saved_words', existing.id);
      setSavedWords(prev => prev.filter(w => w.id !== existing.id));
    } else {
      const newRec = buildSavedWordRecord(card);
      const inserted = db.insert('saved_words', newRec);
      setSavedWords(prev => [...prev, inserted]);
    }
  };

  const triggerSwipe = (direction, swipedCard = null) => {
    if (actionLocked.current || advancing) return;
    actionLocked.current = true;
    const activeCard = swipedCard || cards[currentIndex];
    if (!activeCard) return;

    sessionStatsRef.current.studied += 1;

    if (direction === 'right') {
      sessionStatsRef.current.learned += 1;
      if (!isPhrases) {
        recordWordAction(db, { card: activeCard, direction: 'right', levelId: targetLevel });
      }
      if (isReview && activeCard) {
        const reviewCards = db.get('review_cards') || [];
        db.set('review_cards', reviewCards.filter(c => c.id !== activeCard.id));
      }
    } else {
      sessionStatsRef.current.review += 1;
      if (!isPhrases) {
        recordWordAction(db, { card: activeCard, direction: 'left', levelId: targetLevel });
      }
      if (!isReview && activeCard) {
        const reviewCards = db.get('review_cards') || [];
        if (!reviewCards.find(c => c.id === activeCard.id)) {
          db.set('review_cards', [...reviewCards, activeCard]);
        }
      }
    }

    setAdvancing(true);
    setExitData({ direction });
    setFlipped(false);
    setHasFlippedOnce(false);

    if (currentIndex < cards.length - 1) {
      setCurrentIndex(curr => curr + 1);
      animate(dragOffset, 0, { duration: reducedMotion ? 0 : 0.35 });
      setTimeout(() => {
        actionLocked.current = false;
        setAdvancing(false);
      }, reducedMotion ? 0 : 350);
    } else {
      if (!isPhrases) {
        trackEvent('study:session_complete', {
          courseId: course.id,
          levelId: targetLevel,
          mode: isReview ? 'review' : isSaved ? 'saved' : 'learn',
          cardCount: cards.length,
        });
        setTimeout(() => {
          setSessionSummary({
            studied: sessionStatsRef.current.studied,
            learned: sessionStatsRef.current.learned,
            review: sessionStatsRef.current.review,
            totalCards: cards.length,
            mode: isReview ? 'review' : isSaved ? 'saved' : 'learn',
          });
          actionLocked.current = false;
          setAdvancing(false);
        }, reducedMotion ? 0 : 350);
      } else {
        setTimeout(() => navigate(backTo), reducedMotion ? 0 : 350);
      }
    }
  };

  const handleShuffle = () => {
    if (actionLocked.current || cards.length - currentIndex <= 1) return;
    actionLocked.current = true;
    setShuffleState(true);
    if (!reducedMotion && navigator.vibrate) navigator.vibrate(50);

    setTimeout(() => {
      setCards(prev => [...prev.slice(0, currentIndex), ...shuffleCards(prev.slice(currentIndex))]);
      setFlipped(false);
      setHasFlippedOnce(false);
      dragOffset.set(0);
      setShuffleState(false);
      actionLocked.current = false;
    }, reducedMotion ? 0 : 450);
  };

  if (isPublishedSession && publishedCourse.isLoading) {
    return (
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <h2 style={{ color: 'var(--color-text-navy)', marginBottom: '8px' }}>Loading flashcards...</h2>
        <p style={{ color: 'var(--color-secondary-blue)' }}>Preparing course content</p>
      </div>
    );
  }

  if (isPublishedSession && publishedCourse.isError) {
    return (
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '100vh', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <h2 style={{ color: '#EF4444', marginBottom: '8px' }}>Unable to load flashcards</h2>
        <p style={{ color: 'var(--color-secondary-blue)', marginBottom: '24px' }}>{publishedCourse.error?.message || 'Failed to load course content.'}</p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={publishedCourse.retry} className="btn-primary" style={{ padding: '12px 24px' }}>Retry</button>
          <button onClick={() => navigate(backTo)} className="btn-secondary" style={{ padding: '12px 24px' }}>Back</button>
        </div>
      </div>
    );
  }

  if (isNormalLearn && completionState.kind === 'trial-done') {
    const returnTo = encodeURIComponent(`/learn/level/${encodeURIComponent(isHsk1 ? 'HSK1' : targetLevel)}`);
    return (
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '100vh', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '16px', backgroundColor: '#ECFDF5', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
          <Check size={28} strokeWidth={3} />
        </div>
        <h2 style={{ color: 'var(--color-text-navy)', marginBottom: '8px' }}>Free trial complete</h2>
        <p style={{ color: 'var(--color-secondary-blue)', maxWidth: '340px', marginBottom: '24px' }}>
          You've studied all {completionState.trialSize} free trial words. Sign in to unlock the full course and save your progress.
        </p>
        <a href={`/login?returnTo=${returnTo}`} className="btn-primary" style={{ padding: '14px 28px', textDecoration: 'none', display: 'inline-block', marginBottom: '12px' }}>Sign in to continue</a>
        <button onClick={() => navigate(backTo)} className="btn-secondary" style={{ padding: '12px 24px' }}>Back to course</button>
      </div>
    );
  }

  if (isNormalLearn && completionState.kind === 'all-studied') {
    return (
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '100vh', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '16px', backgroundColor: '#ECFDF5', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
          <Check size={28} strokeWidth={3} />
        </div>
        <h2 style={{ color: 'var(--color-text-navy)', marginBottom: '8px' }}>All words studied</h2>
        <p style={{ color: 'var(--color-secondary-blue)', maxWidth: '340px', marginBottom: '24px' }}>
          You've worked through every word in this level! New words will appear when the course is updated.
        </p>
        <button onClick={() => navigate('/learn/review')} className="btn-primary" style={{ padding: '14px 28px', marginBottom: '12px' }}>Go to Review</button>
        <button onClick={() => navigate(backTo)} className="btn-secondary" style={{ padding: '12px 24px' }}>Back to course</button>
      </div>
    );
  }

  if (sessionSummary !== null) {
    const { studied, learned, review } = sessionSummary;
    return (
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '100vh', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div className="surface-card" style={{ padding: '32px 24px', borderRadius: '24px', maxWidth: '400px', width: '100%', boxShadow: '0 12px 32px rgba(12, 74, 110, 0.08)' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '16px', backgroundColor: '#ECFDF5', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Check size={28} strokeWidth={3} />
          </div>
          <p style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-primary-blue)', letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 4px 0' }}>SESSION COMPLETE</p>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--color-text-navy)', margin: '0 0 8px 0' }}>Great work!</h2>
          <p style={{ fontSize: '0.95rem', color: 'var(--color-secondary-blue)', margin: '0 0 24px 0' }}>
            You've completed all {studied} {studied === 1 ? 'card' : 'cards'} in this session.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
            <div style={{ padding: '12px', borderRadius: '16px', backgroundColor: 'var(--color-page-bg)' }}>
              <span style={{ display: 'block', fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-navy)' }}>{studied}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-secondary-blue)', fontWeight: 600 }}>Studied</span>
            </div>
            <div style={{ padding: '12px', borderRadius: '16px', backgroundColor: '#ECFDF5' }}>
              <span style={{ display: 'block', fontSize: '1.5rem', fontWeight: 800, color: '#10B981' }}>{learned}</span>
              <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>Learned</span>
            </div>
            <div style={{ padding: '12px', borderRadius: '16px', backgroundColor: '#FEF2F2' }}>
              <span style={{ display: 'block', fontSize: '1.5rem', fontWeight: 800, color: '#EF4444' }}>{review}</span>
              <span style={{ fontSize: '0.75rem', color: '#DC2626', fontWeight: 600 }}>Review</span>
            </div>
          </div>

          <button onClick={() => navigate(backTo)} className="btn-primary" style={{ width: '100%', padding: '14px', borderRadius: '14px', fontWeight: 700, marginBottom: '8px' }}>
            Back to course
          </button>
          {review > 0 && (
            <button onClick={() => navigate('/learn/review')} className="btn-secondary" style={{ width: '100%', padding: '14px', borderRadius: '14px', fontWeight: 700 }}>
              Go to Review
            </button>
          )}
        </div>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: 'var(--color-page-bg)', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--color-text-navy)', marginBottom: '8px' }}>{isReview ? 'All caught up!' : isSaved ? 'No saved words yet' : 'No cards yet'}</h2>
        <p style={{ color: 'var(--color-secondary-blue)', maxWidth: '300px' }}>
          {isReview ? 'You have no cards to review right now.' : isSaved ? 'Bookmark words during study sessions or in the dictionary to study them here.' : 'Choose a course to start learning.'}
        </p>
        <button onClick={() => navigate(backTo)} style={{ marginTop: '24px', padding: '12px 24px', backgroundColor: 'var(--color-primary-blue)', color: '#FFF', borderRadius: '12px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>Go Back</button>
      </div>
    );
  }

  const visibleCards = cards.slice(currentIndex, currentIndex + 2);
  const locked = advancing || shuffleState;

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', backgroundColor: 'var(--color-page-bg)', maxWidth: '500px', margin: '0 auto', position: 'relative' }}>

      {/* Top Header */}
      <header className="flex items-center justify-between" style={{ marginBottom: '24px', zIndex: 10 }}>
        <button
          onClick={() => navigate(backTo)}
          style={{
            width: '40px', height: '40px', borderRadius: '50%',
            backgroundColor: '#FFFFFF', color: '#0369A1',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
            border: 'none', cursor: 'pointer'
          }}
          aria-label="Leave session"
        >
          <ChevronLeft size={24} strokeWidth={2.5} />
        </button>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '0 16px' }}>
          <h2 style={{ fontSize: '1.25rem', margin: '0 0 10px 0', textAlign: 'center', color: 'var(--color-text-navy)', fontWeight: 800 }}>
            {isReview ? 'Review Session' : isSaved ? 'Saved Words' : (cards[0]?.lesson_name ?? course.copy?.lessonName ?? 'Vocabulary')}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', maxWidth: '200px' }}>
            <ProgressBar current={currentIndex} total={cards.length} color="var(--color-sky-accent)" />
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-primary-blue)' }}>
              {currentIndex}/{cards.length}
            </span>
          </div>
        </div>
        <div style={{ width: '40px' }}></div>
      </header>

      {/* Main Flashcard Stage */}
      <div style={{ flex: 1, position: 'relative', width: '100%', marginBottom: '24px' }}>
        {shuffleState && <ShuffleDeck />}

        <AnimatePresence custom={exitData}>
          {!shuffleState && visibleCards.map((card, idx) => {
            const isTop = card.id === cards[currentIndex]?.id;
            const isRight = card.id === cards[currentIndex + 1]?.id;

            return (
              <Flashcard
                key={card.card_id || card.id}
                card={card}
                isActive={isTop}
                isRight={isRight}
                flipped={isTop ? flipped : false}
                setFlipped={setFlipped}
                hasFlippedOnce={isTop ? hasFlippedOnce : false}
                setHasFlippedOnce={setHasFlippedOnce}
                onSwipe={triggerSwipe}
                exitData={exitData}
                shuffleState={shuffleState}
                dragOffset={dragOffset}
                reducedMotion={reducedMotion}
                locked={locked}
                isPhrases={isPhrases}
                isSaved={!isPhrases ? (savedWords === null ? null : Boolean(findSavedWord(savedWords, card))) : false}
                onToggleSave={handleToggleSave}
              />
            );
          })}
        </AnimatePresence>
      </div>

      {/* Bottom Action Controls */}
      <div className="flex justify-between items-start" style={{ padding: '0 24px 24px 24px', zIndex: 10, maxWidth: '400px', margin: '0 auto', width: '100%' }}>

        {/* Left Button (Review) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="swipe-action--review"
            onClick={() => triggerSwipe('left', cards[currentIndex])}
            disabled={locked}
            aria-label="Review this word later"
            style={{
              width: '64px', height: '64px', borderRadius: '50%',
              backgroundColor: '#FFFFFF', color: '#EF4444',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(239, 68, 68, 0.15), 0 2px 8px rgba(239, 68, 68, 0.05)',
              border: 'none', cursor: locked ? 'default' : 'pointer', transition: 'transform 0.1s'
            }}
            onMouseDown={(e) => { if (!locked) e.currentTarget.style.transform = 'scale(0.92)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <X size={28} strokeWidth={3} />
          </button>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-navy)' }}>Review</span>
        </div>

        {/* Center Buttons (Shuffle & Reveal) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '8px' }}>
          <button
            type="button"
            className="swipe-action--flip"
            onClick={() => {
              if (!locked) {
                setFlipped(!flipped);
                setHasFlippedOnce(true);
              }
            }}
            disabled={locked}
            aria-label={flipped ? 'Show front face' : 'Reveal answer'}
            style={{
              padding: '12px 20px', borderRadius: '16px',
              backgroundColor: '#FFFFFF', color: '#0C4A6E',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              border: '0.5px solid #BAE6FD', cursor: locked ? 'default' : 'pointer',
              boxShadow: '0 2px 8px rgba(12, 74, 110, 0.05)'
            }}
          >
            <RotateCw size={16} strokeWidth={2.5} color="#0369A1" />
            <span style={{ fontSize: '14px', fontWeight: 600 }}>{flipped ? 'Front' : 'Reveal'}</span>
          </button>
          <button
            type="button"
            onClick={handleShuffle}
            disabled={locked || cards.length - currentIndex <= 1}
            style={{
              background: 'none', border: 'none', color: '#0369A1', fontSize: '12px', fontWeight: 600,
              cursor: (locked || cards.length - currentIndex <= 1) ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '4px', opacity: (cards.length - currentIndex <= 1) ? 0.5 : 1
            }}
          >
            <Shuffle size={12} strokeWidth={2.5} />
            Shuffle
          </button>
        </div>

        {/* Right Button (Learned) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="swipe-action--learned"
            onClick={() => triggerSwipe('right', cards[currentIndex])}
            disabled={locked}
            aria-label="Mark this word learned"
            style={{
              width: '64px', height: '64px', borderRadius: '50%',
              backgroundColor: '#FFFFFF', color: '#22C55E',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(34, 197, 94, 0.15), 0 2px 8px rgba(34, 197, 94, 0.05)',
              border: 'none', cursor: locked ? 'default' : 'pointer', transition: 'transform 0.1s'
            }}
            onMouseDown={(e) => { if (!locked) e.currentTarget.style.transform = 'scale(0.92)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <Check size={32} strokeWidth={3} />
          </button>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-navy)' }}>Learned</span>
        </div>

      </div>

    </div>
  );
}
