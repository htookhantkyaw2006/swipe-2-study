import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Bookmark, BookmarkMinus, Play, Volume2 } from 'lucide-react';
import { db } from '../lib/db';
import { speak } from '../lib/speech';
import { playWordAudio } from '../lib/wordAudio';
import { useCourse } from '../lib/language';
import { readingOf, kanaOf, wordOf } from '../lib/entry';
import { storageOwner } from '../lib/storageOwner';

export default function SavedWords() {
  const navigate = useNavigate();
  const course = useCourse();
  const [savedWords, setSavedWords] = useState(() => db.get('saved_words') || []);

  useEffect(() => {
    const unsubChange = storageOwner.subscribeChange(() => {
      setSavedWords(db.get('saved_words') || []);
    });
    const unsubOwner = storageOwner.subscribe(() => {
      setSavedWords(db.get('saved_words') || []);
    });
    return () => {
      unsubChange?.();
      unsubOwner?.();
    };
  }, []);

  const empty = savedWords.length === 0;

  const handleUnsave = (id, e) => {
    e.stopPropagation();
    db.remove('saved_words', id);
    setSavedWords(db.get('saved_words') || []);
  };

  const handlePlayWord = (e, word) => {
    e.stopPropagation();
    playWordAudio(word, { speakFn: speak });
  };

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: '100px', fontFamily: 'Inter, sans-serif' }}>

      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '24px' }}>
        <button onClick={() => navigate(-1)} style={{ position: 'absolute', left: '24px', background: 'transparent', padding: 0, border: 'none', cursor: 'pointer' }}>
          <ChevronLeft size={24} color="var(--color-text-navy)" strokeWidth={2.5} />
        </button>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: 0 }}>Saved Words</h1>
      </header>

      <div style={{ padding: '0 24px', maxWidth: '600px', margin: '0 auto' }}>

        {/* Main Hero Card */}
        <div style={{
          background: 'linear-gradient(135deg, #86EFAC 0%, #16A34A 100%)',
          borderRadius: '24px', padding: '24px', color: '#FFFFFF',
          boxShadow: '0 12px 24px rgba(22, 163, 74, 0.2)', marginBottom: '32px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
          position: 'relative', overflow: 'hidden'
        }}>
          {/* Decorative background element */}
          <div style={{ position: 'absolute', right: '-10%', top: '-10%', fontSize: '10rem', color: '#DCFCE7', opacity: 0.1, fontWeight: 900, zIndex: 0, pointerEvents: 'none' }}>
            {course.toolChars?.saved || '★'}
          </div>

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ width: '56px', height: '56px', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', backdropFilter: 'blur(8px)', margin: '0 auto 16px' }}>
              <Bookmark size={28} color="#FFFFFF" strokeWidth={2.5} />
            </div>

            <h2 style={{ fontSize: '2.5rem', fontWeight: 900, margin: '0 0 8px 0', lineHeight: 1, color: '#FFFFFF' }}>
              {savedWords.length} Word{savedWords.length === 1 ? '' : 's'}
            </h2>
            <p style={{ fontSize: '1rem', margin: '0 0 24px 0', opacity: 0.9 }}>
              {empty ? 'Bookmark words in the dictionary to collect them here' : 'Ready for review'}
            </p>

            <button
              onClick={() => navigate(empty ? '/dictionary' : '/saved/session')}
              style={{
                backgroundColor: '#FFFFFF',
                color: '#16A34A',
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
              {empty ? 'Find words' : 'Study Now'}
            </button>
          </div>
        </div>

        {/* Word List */}
        <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 16px 0' }}>
          Word List
        </h3>

        {empty ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--color-secondary-blue)' }}>
            <p style={{ fontSize: '1rem', fontWeight: 600 }}>No saved words yet.</p>
            <p style={{ fontSize: '0.875rem' }}>Bookmark words during study sessions or search the dictionary.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
            {savedWords.map((word) => {
              const phrase = word.phrase || word.character || wordOf(word) || '';
              const reading = readingOf(word) || word.pronunciation || '';
              const english = word.english || word.definition || word.meaning_english || '';
              const burmese = word.burmese || word.burmese_definition || word.meaning_burmese || '';
              const kana = kanaOf(word);

              return (
                <div
                  key={word.id || phrase}
                  style={{
                    backgroundColor: '#FFFFFF', borderRadius: '20px', padding: '16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    boxShadow: '0 4px 12px rgba(12, 74, 110, 0.05)', position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: '48px', height: '48px', borderRadius: '12px',
                      backgroundColor: 'var(--color-page-bg)', color: '#16A34A',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.25rem', fontWeight: 900, flexShrink: 0
                    }}>
                      {[...phrase][0]?.toUpperCase() || '★'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <h4 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: 0 }}>{phrase}</h4>
                        {kana && <span style={{ fontSize: '0.8rem', color: 'var(--color-secondary-blue)', fontWeight: 600 }}>{kana}</span>}
                        {reading && <span style={{ fontSize: '0.875rem', color: 'var(--color-primary-blue)', fontFamily: 'var(--font-reading)' }}>{reading}</span>}
                      </div>
                      <p style={{ fontSize: '0.875rem', color: '#64748B', margin: 0, overflowWrap: 'break-word' }}>
                        {english} {english && burmese && <span style={{ opacity: 0.5 }}>•</span>} {burmese}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
                    <button
                      onClick={(e) => handleUnsave(word.id, e)}
                      style={{
                        width: '36px', height: '36px', borderRadius: '50%',
                        backgroundColor: '#FEF2F2', color: '#EF4444',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: 'none', cursor: 'pointer', transition: 'background-color 0.2s',
                        flexShrink: 0
                      }}
                      title="Unsave"
                      aria-label={`Unsave ${phrase}`}
                    >
                      <BookmarkMinus size={18} />
                    </button>
                    <button
                      onClick={(e) => handlePlayWord(e, word)}
                      style={{
                        width: '36px', height: '36px', borderRadius: '50%',
                        backgroundColor: 'var(--color-page-bg)', color: 'var(--color-primary-blue)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: 'none', cursor: 'pointer', transition: 'background-color 0.2s',
                        flexShrink: 0
                      }}
                      title="Play audio"
                      aria-label={`Play audio for ${phrase}`}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#E0F2FE';
                        e.currentTarget.style.color = '#0284C7';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--color-page-bg)';
                        e.currentTarget.style.color = 'var(--color-primary-blue)';
                      }}
                    >
                      <Volume2 size={18} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
