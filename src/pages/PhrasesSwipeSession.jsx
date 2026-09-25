import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useMotionValue, useTransform, AnimatePresence, animate, usePresence } from 'framer-motion';
import { ChevronLeft, Check, X, Hand, Shuffle, Volume2 } from 'lucide-react';
import ProgressBar from '../components/ui/ProgressBar';
import { speak } from '../lib/speech';

const dummyPhrases = [
  { id: 1, level: 'HSK 1', phrase: '你好', pinyin: 'Nǐ hǎo', english: 'Hello', burmese: 'မင်္ဂလာပါ' },
  { id: 2, level: 'HSK 1', phrase: '谢谢', pinyin: 'Xièxiè', english: 'Thank you', burmese: 'ကျေးဇူးတင်ပါတယ်' },
  { id: 3, level: 'HSK 1', phrase: '再见', pinyin: 'Zàijiàn', english: 'Goodbye', burmese: 'တာ့တာ' },
  { id: 4, level: 'HSK 1', phrase: '对不起', pinyin: 'Duìbùqǐ', english: 'Sorry', burmese: 'တောင်းပန်ပါတယ်' },
  { id: 5, level: 'HSK 1', phrase: '没关系', pinyin: 'Méiguānxi', english: 'It\'s ok', burmese: 'ရပါတယ်' },
];

const ShuffleDeck = () => {
  const baseCardStyle = {
    position: 'absolute',
    width: '92%', maxWidth: '440px', maxHeight: '65vh', aspectRatio: '4/3',
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

const Flashcard = ({ card, isActive, isRight, onSwipe, exitData, flipped, setFlipped, hasFlippedOnce, setHasFlippedOnce, shuffleState, dragOffset }) => {
  const [isPresent] = usePresence();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-15, 15]);
  const backgroundColor = useTransform(x, [-100, 0, 100], ['#FEE2E2', '#FFFFFF', '#DCFCE7']);
  
  const glowShadow = useTransform(x, [-200, 0, 200], [
    '0 4px 32px rgba(239, 68, 68, 0.5)',
    '0 4px 16px rgba(3, 105, 161, 0.1)',
    '0 4px 32px rgba(34, 197, 94, 0.5)'
  ]);

  useEffect(() => {
    if (isActive && isPresent) {
      return x.on('change', (latest) => {
        dragOffset.set(Math.abs(latest));
      });
    }
  }, [isActive, isPresent, x, dragOffset]);

  const nextScale = useTransform(dragOffset, [0, window.innerWidth * 0.3], [0.95, 1]);
  const nextOpacity = useTransform(dragOffset, [0, window.innerWidth * 0.3], [0.5, 1]);

  const handleDragEnd = (event, info) => {
    const threshold = window.innerWidth * 0.1;
    const velocityThreshold = 800;
    if (info.offset.x > threshold || info.velocity.x > velocityThreshold) {
      onSwipe('right', info.velocity.x);
    } else if (info.offset.x < -threshold || info.velocity.x < -velocityThreshold) {
      onSwipe('left', info.velocity.x);
    }
  };

  if (!card) return null;

  // The front content (Question Side)
  const frontContent = (
    <motion.div 
      animate={shuffleState === 'revealing' ? {
        boxShadow: [
          '0 8px 32px rgba(12, 74, 110, 0.08), 0 0 0 1px #BAE6FD',
          '0 8px 32px rgba(12, 74, 110, 0.08), 0 0 0 2px #38BDF8',
          '0 8px 32px rgba(12, 74, 110, 0.08), 0 2px 8px rgba(12, 74, 110, 0.04)'
        ]
      } : {
        boxShadow: '0 8px 32px rgba(12, 74, 110, 0.08), 0 2px 8px rgba(12, 74, 110, 0.04)'
      }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(0deg)',
        display: 'flex', flexDirection: 'column', padding: '24px', 
        backgroundColor: isActive ? backgroundColor : '#FFFFFF',
        borderRadius: '24px'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
        <div style={{
          backgroundColor: '#0C4A6E', color: '#FFFFFF', padding: '4px 12px',
          borderRadius: '100px', fontSize: '0.75rem', fontWeight: 600,
          fontFamily: 'JetBrains Mono, monospace'
        }}>
          {card.level || 'HSK 1 Phrase'}
        </div>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            speak(card.phrase);
          }}
          style={{
            width: '36px', height: '36px', borderRadius: '50%',
            backgroundColor: '#0C4A6E', color: '#FFFFFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', cursor: 'pointer', transition: 'transform 0.1s, box-shadow 0.2s',
            boxShadow: '0 4px 12px rgba(12, 74, 110, 0.3)'
          }}
          onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.9)'}
          onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <Volume2 size={20} />
        </button>
      </div>
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: '-20px' }}>
        <h1 style={{ fontSize: '48px', margin: 0, color: '#0C4A6E', fontWeight: 800, textAlign: 'center', lineHeight: 1.2 }}>{card.phrase}</h1>
        <p style={{ fontSize: '20px', color: '#38BDF8', fontFamily: 'JetBrains Mono, monospace', margin: '16px 0 0 0' }}>{card.pinyin}</p>
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

  // The back content (Answer Side)
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
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
          <h2 style={{ fontSize: '36px', color: '#0C4A6E', fontWeight: 700, margin: 0, lineHeight: 1.2, textAlign: 'center' }}>{card.phrase}</h2>
          <p style={{ fontSize: '18px', color: '#38BDF8', fontFamily: 'JetBrains Mono, monospace', margin: '8px 0 24px 0' }}>{card.pinyin}</p>
          
          <div style={{ width: '100%', height: '1px', backgroundColor: '#BAE6FD', marginBottom: '24px', margin: '0 24px 24px 24px' }}></div>
          
          <p style={{ fontSize: '24px', color: '#0C4A6E', fontWeight: 600, margin: '0 0 8px 0', textAlign: 'center' }}>{card.english}</p>
          <p style={{ fontSize: '20px', color: '#0284C7', fontWeight: 400, margin: 0, textAlign: 'center' }}>{card.burmese}</p>
        </div>
      </div>
    </motion.div>
  );

  const variants = {
    enter: { scale: 0.95, opacity: 0.4 },
    center: { 
      x: 0, scale: 1, opacity: 1, zIndex: 10, 
      transition: { duration: 0.4, ease: "easeOut" } 
    },
    exit: ({ direction, velocity }) => {
      const v = Math.abs(velocity);
      const calculatedDuration = v > 0 ? Math.min(Math.max((window.innerWidth * 0.8) / v, 0.2), 0.85) : 0.4;
      return {
        x: direction === 'right' ? window.innerWidth + 100 : -window.innerWidth - 100,
        opacity: 1,
        scale: 1,
        transition: { duration: calculatedDuration, ease: "easeOut" }
      };
    }
  };

  let motionProps = {};
  if (isActive) {
    if (shuffleState === 'shuffling') {
      motionProps = {
        initial: { opacity: 0, scale: 0.95 },
        animate: { opacity: 0, scale: 0.95 },
        style: { zIndex: 10, pointerEvents: 'none' }
      };
    } else if (shuffleState === 'revealing') {
      motionProps = {
        initial: { opacity: 0, scale: 0.95 },
        animate: { opacity: 1, scale: 1 },
        transition: { opacity: { duration: 0.3, ease: "easeIn" }, scale: { duration: 0.3, ease: "easeOut" } },
        style: { zIndex: 10, pointerEvents: 'none' }
      };
    } else {
      motionProps = {
        custom: exitData,
        variants: variants,
        initial: "enter",
        animate: "center",
        exit: "exit",
        style: {
          x, rotate, zIndex: 10,
          boxShadow: glowShadow,
          cursor: 'grab'
        },
        drag: "x",
        dragConstraints: { left: 0, right: 0 },
        dragElastic: 0.7, // Add a bit more snap back
        onDragEnd: handleDragEnd,
        whileTap: { cursor: 'grabbing' }
      };
    }
  } else if (isRight) {
    motionProps = {
      initial: { scale: 0.95, opacity: 0 },
      animate: { opacity: nextOpacity, scale: nextScale },
      transition: { duration: 0.4, ease: "easeOut" },
      style: {
        x: 0,
        zIndex: 1, pointerEvents: 'none'
      }
    };
  }

  return (
    <motion.div
      {...motionProps}
      style={{
        position: 'absolute',
        width: '92%',
        maxWidth: '440px',
        maxHeight: '65vh',
        aspectRatio: '4/3',
        left: 0, right: 0, top: 0, bottom: 0, margin: 'auto',
        borderRadius: '20px',
        perspective: '1000px',
        ...motionProps.style
      }}
      onClick={() => {
        if (isActive) {
          setFlipped(!flipped);
          if (!hasFlippedOnce) setHasFlippedOnce(true);
        }
      }}
    >
      <motion.div
        initial={false}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.4, ease: "easeInOut" }}
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

export default function PhrasesSwipeSession() {
  const navigate = useNavigate();
  const [cards, setCards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [hasFlippedOnce, setHasFlippedOnce] = useState(false);
  const [sessionScore, setSessionScore] = useState({ correct: 0, review: 0 });
  const [exitData, setExitData] = useState({ direction: 'right', velocity: 0 });
  const [shuffleState, setShuffleState] = useState('idle');
  
  const dragOffset = useMotionValue(0);

  useEffect(() => {
    setCards(dummyPhrases);
  }, []);

  const triggerSwipe = (direction, velocity = 0) => {
    setExitData({ direction, velocity });
    
    if (direction === 'right') {
      setSessionScore(s => ({ ...s, correct: s.correct + 1 }));
    } else {
      setSessionScore(s => ({ ...s, review: s.review + 1 }));
    }
    
    setFlipped(false);
    setHasFlippedOnce(false);
    
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(curr => curr + 1);
      animate(dragOffset, 0, { duration: 0.4, ease: "easeOut" });
    } else {
      setTimeout(() => navigate(-1), 400); 
    }
  };

  const handleShuffle = () => {
    if (shuffleState !== 'idle') return;
    const remainingCards = cards.slice(currentIndex);
    if (remainingCards.length <= 1) return;
    
    if (navigator.vibrate) navigator.vibrate(50);
    setShuffleState('shuffling');

    setTimeout(() => {
      const shuffled = [...remainingCards].sort(() => Math.random() - 0.5);
      const newCards = [...cards.slice(0, currentIndex), ...shuffled];
      setCards(newCards);
      setFlipped(false);
      setHasFlippedOnce(false);
    }, 250);

    setTimeout(() => {
      setShuffleState('revealing');
    }, 500);

    setTimeout(() => {
      setShuffleState('idle');
    }, 700);
  };

  if (cards.length === 0) return <div style={{ padding: '24px', color: 'var(--color-text-navy)', textAlign: 'center' }}>Loading...</div>;

  const visibleCards = cards.slice(currentIndex, currentIndex + 2);

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', backgroundColor: 'var(--color-page-bg)' }}>
      <header className="flex items-center justify-between" style={{ marginBottom: '32px', zIndex: 10 }}>
        <button 
          onClick={() => navigate(-1)} 
          style={{ 
            width: '40px', height: '40px', borderRadius: '50%', 
            backgroundColor: '#FFFFFF', color: '#0369A1', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
            border: 'none', cursor: 'pointer'
          }}
        >
          <ChevronLeft size={24} strokeWidth={2.5} />
        </button>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '0 16px' }}>
          <h2 style={{ fontSize: '1.25rem', margin: '0 0 12px 0', textAlign: 'center', color: 'var(--color-text-navy)', fontWeight: 800 }}>
            Phrase Practice
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

      <div style={{ flex: 1, position: 'relative', width: '100%', marginBottom: '24px' }}>
        
        {shuffleState !== 'idle' && <ShuffleDeck />}

        {/* Active Cards handled via AnimatePresence */}
        <AnimatePresence custom={exitData}>
          {shuffleState === 'idle' && visibleCards.map((card, idx) => {
            const isTop = card.id === cards[currentIndex]?.id;
            const isRight = card.id === cards[currentIndex + 1]?.id;

            return (
              <Flashcard 
                key={card.id}
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
              />
            );
          })}
        </AnimatePresence>

      </div>

      <div className="flex justify-between items-start" style={{ padding: '0 24px 24px 24px', zIndex: 10 }}>
        
        {/* Left Button */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <button 
            onClick={() => triggerSwipe('left')}
            style={{ 
              width: '64px', height: '64px', borderRadius: '50%', 
              backgroundColor: '#FFFFFF', color: '#EF4444',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(239, 68, 68, 0.15), 0 2px 8px rgba(239, 68, 68, 0.05)',
              border: 'none', cursor: 'pointer', transition: 'transform 0.1s'
            }}
            onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.92)'}
            onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <X size={28} strokeWidth={3} />
          </button>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-navy)' }}>Review</span>
        </div>

        {/* Center Button (Shuffle) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <motion.button 
            onClick={handleShuffle}
            disabled={shuffleState !== 'idle'}
            animate={shuffleState === 'shuffling' ? { backgroundColor: ['#FFFFFF', '#E0F2FE', '#FFFFFF'] } : {}}
            transition={{ duration: 0.15, times: [0, 0.5, 1] }}
            style={{ 
              padding: '12px 24px', borderRadius: '16px', 
              backgroundColor: '#FFFFFF', color: '#0C4A6E',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              border: '0.5px solid #BAE6FD',
              cursor: shuffleState !== 'idle' ? 'default' : 'pointer',
              opacity: shuffleState !== 'idle' ? 0.8 : 1
            }}
          >
            <motion.div
               animate={shuffleState !== 'idle' ? { rotate: 180 } : { rotate: 0 }}
               transition={{ duration: 0.4, ease: "easeInOut" }}
            >
              <Shuffle size={18} strokeWidth={2.5} color="#0369A1" />
            </motion.div>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>Shuffle</span>
          </motion.button>
        </div>

        {/* Right Button */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <button 
            onClick={() => triggerSwipe('right')}
            style={{ 
              width: '64px', height: '64px', borderRadius: '50%', 
              backgroundColor: '#FFFFFF', color: '#22C55E',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(34, 197, 94, 0.15), 0 2px 8px rgba(34, 197, 94, 0.05)',
              border: 'none', cursor: 'pointer', transition: 'transform 0.1s'
            }}
            onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.92)'}
            onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <Check size={32} strokeWidth={3} />
          </button>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-navy)' }}>Learned</span>
        </div>

      </div>
    </div>
  );
}
