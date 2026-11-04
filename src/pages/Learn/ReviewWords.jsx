import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, RotateCw, Play, Volume2 } from 'lucide-react';
import { speak } from '../../lib/speech';
import { playWordAudio } from '../../lib/wordAudio';
import { db } from '../../lib/db';
import { useCourse } from '../../lib/language';
import { readingOf, kanaOf, wordOf } from '../../lib/entry';
import { storageOwner } from '../../lib/storageOwner';
import { safeNavigateBack } from '../../lib/navigation';

const toListRow = (card) => ({
  id: card.id,
  phrase: card.character || wordOf(card) || '',
  kana: card.kana || kanaOf(card),
  reading: card.pronunciation ?? readingOf(card) ?? '',
  english: card.definition ?? card.meaning_english ?? '',
  burmese: card.burmese_definition ?? card.meaning_burmese ?? ''
});

export default function ReviewWords() {
  const navigate = useNavigate();
  const course = useCourse();
  const [error, setError] = useState(() => {
    try {
      db.get('review_cards');
      return null;
    } catch {
      return 'Unable to load review words.';
    }
  });
  const [reviewWords, setReviewWords] = useState(() => {
    try {
      return (db.get('review_cards') || []).map(toListRow);
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const unsubChange = storageOwner.subscribeChange(() => {
      try {
        setReviewWords((db.get('review_cards') || []).map(toListRow));
        setError(null);
      } catch {
        setError('Unable to load review words.');
      }
    });
    const unsubOwner = storageOwner.subscribe(() => {
      try {
        setReviewWords((db.get('review_cards') || []).map(toListRow));
        setError(null);
      } catch {
        setError('Unable to load review words.');
      }
    });
    return () => {
      unsubChange?.();
      unsubOwner?.();
    };
  }, []);

  const empty = reviewWords.length === 0;

  const handlePlayWord = (e, word) => {
    e.stopPropagation();
    playWordAudio(word, { speakFn: speak });
  };

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: '100px', fontFamily: 'Inter, sans-serif' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '24px' }}>
          <button onClick={() => safeNavigateBack(navigate, '/library')} style={{ position: 'absolute', left: '24px', background: 'transparent', padding: 0, border: 'none', cursor: 'pointer' }}>
            <ChevronLeft size={24} color="var(--color-text-navy)" strokeWidth={2.5} />
          </button>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: 0 }}>Review Words</h1>
        </header>

        <div style={{ padding: '0 24px', maxWidth: '600px', margin: '0 auto' }}>
          <div className="collection-hero collection-hero--review collection-hero--unavailable" style={{
            background: 'linear-gradient(135deg, #F87171 0%, #EF4444 100%)',
            borderRadius: '24px', padding: '24px', color: '#FFFFFF',
            boxShadow: '0 12px 24px rgba(239, 68, 68, 0.2)', marginBottom: '32px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center'
          }}>
            <h2 style={{ fontSize: '2rem', fontWeight: 900, margin: '0 0 8px 0', color: '#FFFFFF' }}>Collection unavailable</h2>
            <p style={{ fontSize: '1rem', margin: '0 0 16px 0', opacity: 0.9 }}>{error}</p>
            <button
              type="button"
              className="collection-hero__action"
              onClick={() => {
                try {
                  const items = (db.get('review_cards') || []).map(toListRow);
                  setReviewWords(items);
                  setError(null);
                } catch {
                  setError('Unable to load review words.');
                }
              }}
              style={{ backgroundColor: '#FFFFFF', color: '#EF4444', border: 'none', borderRadius: '100px', padding: '12px 24px', fontWeight: 800, cursor: 'pointer' }}
            >
              Retry
            </button>
          </div>

          <div className="study-section-heading">
            <div>
              <p role="status">Status unavailable</p>
            </div>
          </div>

          <div className="study-error" role="alert" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#EF4444', padding: '16px', borderRadius: '16px', textAlign: 'center', marginTop: '16px' }}>
            <p style={{ margin: 0, fontWeight: 600 }}>Unable to load review words</p>
            <button
              type="button"
              onClick={() => {
                try {
                  const items = (db.get('review_cards') || []).map(toListRow);
                  setReviewWords(items);
                  setError(null);
                } catch {
                  setError('Unable to load review words.');
                }
              }}
              style={{ marginTop: '12px', backgroundColor: '#EF4444', color: '#FFFFFF', border: 'none', borderRadius: '8px', padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: '100px', fontFamily: 'Inter, sans-serif' }}>

      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '24px' }}>
        <button onClick={() => safeNavigateBack(navigate, '/library')} style={{ position: 'absolute', left: '24px', background: 'transparent', padding: 0, border: 'none', cursor: 'pointer' }}>
          <ChevronLeft size={24} color="var(--color-text-navy)" strokeWidth={2.5} />
        </button>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: 0 }}>Review Words</h1>
      </header>

      <div style={{ padding: '0 24px', maxWidth: '600px', margin: '0 auto' }}>

        {/* Main Hero Card */}
        <div className="collection-hero collection-hero--review" style={{
          background: 'linear-gradient(135deg, #F87171 0%, #EF4444 100%)',
          borderRadius: '24px', padding: '24px', color: '#FFFFFF',
          boxShadow: '0 12px 24px rgba(239, 68, 68, 0.2)', marginBottom: '32px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
          position: 'relative', overflow: 'hidden'
        }}>
          {/* Decorative background element */}
          <div style={{ position: 'absolute', right: '-10%', top: '-10%', fontSize: '10rem', color: '#FECACA', opacity: 0.15, fontWeight: 900, zIndex: 0, pointerEvents: 'none' }}>
            {course.copy?.reviewWatermark || '↺'}
          </div>

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ width: '56px', height: '56px', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', backdropFilter: 'blur(8px)', margin: '0 auto 16px' }}>
              <RotateCw size={28} color="#FFFFFF" strokeWidth={2.5} />
            </div>

            <h2 style={{ fontSize: '2.5rem', fontWeight: 900, margin: '0 0 8px 0', lineHeight: 1, color: '#FFFFFF' }}>
              {reviewWords.length} Due
            </h2>
            <p style={{ fontSize: '1rem', margin: '0 0 24px 0', opacity: 0.9 }}>
              {empty ? 'Swipe left on a card to send it here' : `${reviewWords.length} ${reviewWords.length === 1 ? 'word to review' : 'words to review'}`}
            </p>

            <button
              onClick={() => navigate(empty ? '/learn/session' : '/learn/review/session')}
              style={{
                backgroundColor: '#FFFFFF',
                color: '#EF4444',
                border: 'none',
                borderRadius: '100px',
                padding: '16px 32px',
                fontSize: '1rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                transition: 'transform 0.2s',
                margin: '0 auto'
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <Play size={20} fill="currentColor" />
              {empty ? 'Start swiping' : 'Start Review'}
            </button>
          </div>
        </div>

        {/* Word List */}
        <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 16px 0' }}>
          Word List
        </h3>

        {empty ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--color-secondary-blue)' }}>
            <p style={{ fontSize: '1rem', fontWeight: 600 }}>All caught up!</p>
            <p style={{ fontSize: '0.875rem' }}>Swipe left on cards during study sessions to add them here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
            {reviewWords.map((word) => (
              <div
                key={word.id}
                className="collection-word"
                style={{
                  backgroundColor: '#FFFFFF', borderRadius: '20px', padding: '16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  boxShadow: '0 4px 12px rgba(12, 74, 110, 0.05)', position: 'relative'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '12px',
                    backgroundColor: '#FEF2F2', color: '#EF4444',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.25rem', fontWeight: 900, flexShrink: 0
                  }}>
                    {[...word.phrase][0]?.toUpperCase() || '↺'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <h4 className="collection-word__character" style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: 0 }}>{word.phrase}</h4>
                      {word.kana && <span style={{ fontSize: '0.8rem', color: 'var(--color-secondary-blue)', fontWeight: 600 }}>{word.kana}</span>}
                      {word.reading && <span style={{ fontSize: '0.875rem', color: 'var(--color-primary-blue)', fontFamily: 'var(--font-reading)' }}>{word.reading}</span>}
                    </div>
                    <p style={{ fontSize: '0.875rem', color: '#64748B', margin: 0, overflowWrap: 'break-word' }}>
                      {word.english} {word.english && word.burmese && <span style={{ opacity: 0.5 }}>•</span>} {word.burmese}
                    </p>
                  </div>
                </div>

                <button
                  onClick={(e) => handlePlayWord(e, word)}
                  style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    backgroundColor: '#FEF2F2', color: '#EF4444',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: 'none', cursor: 'pointer', transition: 'background-color 0.2s',
                    flexShrink: 0, marginLeft: '12px'
                  }}
                  title="Play audio"
                  aria-label={`Play audio for ${word.phrase}`}
                >
                  <Volume2 size={18} />
                </button>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
