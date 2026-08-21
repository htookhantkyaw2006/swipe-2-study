import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, RotateCw, Play, Volume2 } from 'lucide-react';

const mockReviewWords = [
  { id: 1, phrase: '你', pinyin: 'Nǐ', english: 'You', burmese: 'မင်း' },
  { id: 2, phrase: '好', pinyin: 'hǎo', english: 'Good', burmese: 'ကောင်းသော' },
  { id: 3, phrase: '再见', pinyin: 'Zàijiàn', english: 'Goodbye', burmese: 'တာ့တာ' },
  { id: 8, phrase: '对', pinyin: 'Duì', english: 'Correct / Right', burmese: 'မှန်တယ်' },
];

export default function ReviewWords() {
  const navigate = useNavigate();
  const [reviewWords, setReviewWords] = useState([]);

  useEffect(() => {
    // In a real app, we would fetch from db.js here. 
    // Using mock data for now to match the user's request for a list view.
    setReviewWords(mockReviewWords);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: '100px', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '24px' }}>
        <button onClick={() => navigate(-1)} style={{ position: 'absolute', left: '24px', background: 'transparent', padding: 0, border: 'none', cursor: 'pointer' }}>
          <ChevronLeft size={24} color="var(--color-text-navy)" strokeWidth={2.5} />
        </button>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: 0 }}>Review Words</h1>
      </header>

      <div style={{ padding: '0 24px' }}>
        
        {/* Main Hero Card */}
        <div style={{
          background: 'linear-gradient(135deg, #F87171 0%, #EF4444 100%)',
          borderRadius: '24px', padding: '24px', color: '#FFFFFF',
          boxShadow: '0 12px 24px rgba(239, 68, 68, 0.2)', marginBottom: '32px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
          position: 'relative', overflow: 'hidden'
        }}>
          {/* Decorative background element */}
          <div style={{ position: 'absolute', right: '-10%', top: '-10%', fontSize: '10rem', color: '#FECACA', opacity: 0.15, fontWeight: 900, zIndex: 0, pointerEvents: 'none' }}>
            习
          </div>

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ width: '56px', height: '56px', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', backdropFilter: 'blur(8px)', margin: '0 auto 16px' }}>
              <RotateCw size={28} color="#FFFFFF" strokeWidth={2.5} />
            </div>
            
            <h2 style={{ fontSize: '2.5rem', fontWeight: 900, margin: '0 0 8px 0', lineHeight: 1, color: '#FFFFFF' }}>
              {reviewWords.length} Due
            </h2>
            <p style={{ fontSize: '1rem', margin: '0 0 24px 0', opacity: 0.9 }}>
              Ready for review
            </p>
            
            <button 
              onClick={() => navigate('/learn/review/session')}
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
              Start Review
            </button>
          </div>
        </div>

        {/* Word List */}
        <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 16px 0' }}>
          Word List
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
          {reviewWords.map((word) => (
            <div 
              key={word.id}
              style={{ 
                backgroundColor: '#FFFFFF', borderRadius: '20px', padding: '16px', 
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                boxShadow: '0 4px 12px rgba(12, 74, 110, 0.05)', position: 'relative'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                <div style={{ 
                  width: '48px', height: '48px', borderRadius: '12px', 
                  backgroundColor: '#FEF2F2', color: '#EF4444', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.25rem', fontWeight: 900
                }}>
                  {word.phrase.charAt(0)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
                    <h4 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: 0 }}>{word.phrase}</h4>
                    <span style={{ fontSize: '0.875rem', color: 'var(--color-primary-blue)', fontFamily: 'JetBrains Mono, monospace' }}>{word.pinyin}</span>
                  </div>
                  <p style={{ fontSize: '0.875rem', color: '#64748B', margin: 0 }}>
                    {word.english} <span style={{ opacity: 0.5 }}>•</span> {word.burmese}
                  </p>
                </div>
              </div>
              
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  if ('speechSynthesis' in window) {
                    const utterance = new SpeechSynthesisUtterance(word.phrase);
                    utterance.lang = 'zh-CN';
                    window.speechSynthesis.speak(utterance);
                  }
                }}
                style={{
                  width: '36px', height: '36px', borderRadius: '50%',
                  backgroundColor: '#FEF2F2', color: '#EF4444',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: 'none', cursor: 'pointer', transition: 'background-color 0.2s',
                  flexShrink: 0, marginLeft: '12px'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#FEE2E2';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#FEF2F2';
                }}
              >
                <Volume2 size={18} />
              </button>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
