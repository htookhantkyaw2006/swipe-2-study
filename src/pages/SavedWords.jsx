import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Bookmark, BookmarkMinus, Play, Volume2 } from 'lucide-react';
import { db } from '../lib/db';

const mockSavedWords = [
  { id: 1, phrase: '你好', pinyin: 'Nǐ hǎo', english: 'Hello', burmese: 'မင်္ဂလာပါ' },
  { id: 2, phrase: '谢谢', pinyin: 'Xièxiè', english: 'Thank you', burmese: 'ကျေးဇူးတင်ပါတယ်' },
  { id: 3, phrase: '再见', pinyin: 'Zàijiàn', english: 'Goodbye', burmese: 'တာ့တာ' },
  { id: 4, phrase: '对不起', pinyin: 'Duìbùqǐ', english: 'Sorry', burmese: 'တောင်းပန်ပါတယ်' },
  { id: 5, phrase: '没关系', pinyin: 'Méiguānxi', english: 'It\'s ok', burmese: 'ရပါတယ်' },
  { id: 6, phrase: '我是缅甸人', pinyin: 'Wǒ shì Miǎndiàn rén', english: 'I am Burmese', burmese: 'ကျွန်တော်ကမြန်မာလူမျိုးပါ' },
  { id: 7, phrase: '太贵了', pinyin: 'Tài guì le', english: 'Too expensive', burmese: 'အရမ်းဈေးကြီးတယ်' },
];

export default function SavedWords() {
  const navigate = useNavigate();
  const [savedWords, setSavedWords] = useState([]);

  useEffect(() => {
    // Fetch from db
    let words = db.get('saved_words');
    
    // Seed with mock data if completely empty (for demo purposes)
    if (words.length === 0) {
      mockSavedWords.forEach(word => db.insert('saved_words', word));
      words = db.get('saved_words');
    }
    
    setSavedWords(words);
  }, []);

  const handleUnsave = (id, e) => {
    e.stopPropagation();
    db.remove('saved_words', id);
    setSavedWords(db.get('saved_words'));
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FFFFFF', paddingBottom: '100px', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '24px' }}>
        <button onClick={() => navigate(-1)} style={{ position: 'absolute', left: '24px', background: 'transparent', padding: 0, border: 'none', cursor: 'pointer' }}>
          <ChevronLeft size={24} color="var(--color-text-navy)" strokeWidth={2.5} />
        </button>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: 0 }}>Saved Words</h1>
      </header>

      <div style={{ padding: '0 24px' }}>
        
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
            藏
          </div>

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ width: '56px', height: '56px', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', backdropFilter: 'blur(8px)', margin: '0 auto 16px' }}>
              <Bookmark size={28} color="#FFFFFF" strokeWidth={2.5} />
            </div>
            
            <h2 style={{ fontSize: '2.5rem', fontWeight: 900, margin: '0 0 8px 0', lineHeight: 1, color: '#FFFFFF' }}>
              {savedWords.length} Words
            </h2>
            <p style={{ fontSize: '1rem', margin: '0 0 24px 0', opacity: 0.9 }}>
              Ready for review
            </p>
            
            <button 
              onClick={() => navigate('/flashcards/session')}
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
              Study Now
            </button>
          </div>
        </div>

        {/* Word List */}
        <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 16px 0' }}>
          Word List
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
          {savedWords.map((word) => (
            <div 
              key={word.id}
              style={{ 
                backgroundColor: '#FFFFFF', borderRadius: '20px', padding: '16px', 
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                boxShadow: '0 4px 16px rgba(12, 74, 110, 0.04), 0 1px 3px rgba(12, 74, 110, 0.05)', position: 'relative',
                border: '1px solid #F0F9FF'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                <div style={{ 
                  width: '48px', height: '48px', borderRadius: '12px', 
                  backgroundColor: 'var(--color-page-bg)', color: '#16A34A', 
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
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                >
                  <BookmarkMinus size={18} />
                </button>
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
                  backgroundColor: 'var(--color-page-bg)', color: 'var(--color-primary-blue)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: 'none', cursor: 'pointer', transition: 'background-color 0.2s',
                  flexShrink: 0, marginLeft: '12px'
                }}
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
          ))}
        </div>

      </div>
    </div>
  );
}
