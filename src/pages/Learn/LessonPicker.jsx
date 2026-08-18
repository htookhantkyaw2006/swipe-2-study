import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ChevronLeft, Layers, Compass, ChevronRight, 
  RotateCw, CheckCircle2, Bookmark, Search, CheckCircle 
} from 'lucide-react';

export default function LessonPicker() {
  const navigate = useNavigate();
  const { levelId } = useParams();

  const levelNum = levelId ? levelId.toString().replace('HSK', '') : '1';
  
  const levelColors = {
    '1': { gradientStart: '#7DD3FC', gradientEnd: '#0369A1', shadow: 'rgba(3, 105, 161, 0.4)' },
    '2': { gradientStart: '#FCA5A5', gradientEnd: '#DC2626', shadow: 'rgba(220, 38, 38, 0.4)' },
    '3': { gradientStart: '#FDBA74', gradientEnd: '#EA580C', shadow: 'rgba(234, 88, 12, 0.4)' },
    '4': { gradientStart: '#FDE047', gradientEnd: '#CA8A04', shadow: 'rgba(202, 138, 4, 0.4)' },
    '5': { gradientStart: '#86EFAC', gradientEnd: '#15803D', shadow: 'rgba(21, 128, 61, 0.4)' },
    '6': { gradientStart: '#67E8F9', gradientEnd: '#0E7490', shadow: 'rgba(14, 116, 144, 0.4)' },
    '7': { gradientStart: '#60A5FA', gradientEnd: '#1E3A8A', shadow: 'rgba(30, 58, 138, 0.4)' },
    '8': { gradientStart: '#C4B5FD', gradientEnd: '#5B21B6', shadow: 'rgba(91, 33, 182, 0.4)' },
    '9': { gradientStart: '#6B7280', gradientEnd: '#171717', shadow: 'rgba(23, 23, 23, 0.4)' },
  };

  const colors = levelColors[levelNum] || levelColors['1'];

  const words = [
    { id: 1, hanzi: '爱', pinyin: 'ài', translation: 'love; like', mastered: true },
    { id: 2, hanzi: '八', pinyin: 'bā', translation: 'eight', mastered: true },
    { id: 3, hanzi: '爸爸', pinyin: 'bàba', translation: 'dad', mastered: true },
    { id: 4, hanzi: '吧', pinyin: 'ba', translation: '(modal particle for suggestion)', mastered: true },
    { id: 5, hanzi: '白天', pinyin: 'bái tiān', translation: 'daytime', mastered: true },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', paddingBottom: '120px' }}>
      
      {/* Header Row */}
      <header className="flex justify-between items-center" style={{ marginBottom: '24px' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'transparent', padding: '8px', marginLeft: '-8px' }}>
          <ChevronLeft size={24} color="var(--color-text-navy)" />
        </button>
        <h1 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--color-text-navy)', fontWeight: 800 }}>HSK {levelNum}</h1>
        <div style={{ width: '40px' }}></div> {/* Spacer for centering */}
      </header>

      {/* Responsive Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', 
        gap: '32px' 
      }}>
        
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          {/* Blue Hero Header */}
          <div style={{ 
            background: `linear-gradient(135deg, ${colors.gradientStart} 0%, ${colors.gradientEnd} 100%)`, 
            color: 'white', 
            borderRadius: '24px', 
            padding: '32px 24px',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: `0 12px 24px ${colors.shadow}`
          }}>
            {/* Subtle overlay accent block */}
            <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: '150px', height: '40px', background: 'rgba(255,255,255,0.1)', borderTopLeftRadius: '10px', borderBottomLeftRadius: '10px' }}></div>
            
            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '1px', opacity: 0.9, marginBottom: '8px' }}>
              BEGINNER
            </div>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 800, margin: '0 0 16px 0', lineHeight: 1, color: 'white' }}>
              HSK {levelNum}
            </h2>
            <div style={{ fontSize: '1rem', opacity: 0.9, marginBottom: '24px' }}>
              300 vocabulary words
            </div>
            
            {/* Progress Bar */}
            <div style={{ width: '70%', height: '8px', backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: '4px', marginBottom: '8px' }}>
              <div style={{ width: '100%', height: '100%', backgroundColor: '#FFFFFF', borderRadius: '4px' }}></div>
            </div>
            <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>300 mastered</div>
          </div>

          {/* Modules Section */}
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', marginBottom: '16px' }}>
              HSK {levelNum} course modules
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Flashcards Module */}
              <div className="surface-card flex items-center justify-between" style={{ padding: '20px', borderRadius: '24px', cursor: 'pointer', position: 'relative', overflow: 'hidden' }} onClick={() => navigate('/learn/session')}>
                <div style={{ position: 'absolute', right: '-10px', bottom: '-20px', fontSize: '6rem', color: 'var(--color-ghost-blue)', fontWeight: 800, opacity: 0.5, zIndex: 0 }}>字</div>
                <div className="flex items-center" style={{ gap: '16px', position: 'relative', zIndex: 1 }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '16px', backgroundColor: '#EFF6FF', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Layers size={28} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h4 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>Flashcards</h4>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', margin: 0 }}>300 of 300 words mastered</p>
                  </div>
                </div>
                <div className="flex items-center" style={{ gap: '8px', position: 'relative', zIndex: 1 }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#3B82F6' }}>100%</span>
                  <ChevronRight size={20} color="var(--color-secondary-blue)" />
                </div>
                <div style={{ position: 'absolute', bottom: 0, left: '92px', right: '84px', height: '5px', backgroundColor: '#3B82F6', borderRadius: '2.5px 2.5px 0 0' }}></div>
              </div>

              {/* Explore Module */}
              <div className="surface-card flex items-center justify-between" style={{ padding: '20px', borderRadius: '24px', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', right: '-10px', bottom: '-20px', fontSize: '6rem', color: 'var(--color-ghost-blue)', fontWeight: 800, opacity: 0.5, zIndex: 0 }}>课</div>
                <div className="flex items-center" style={{ gap: '16px', position: 'relative', zIndex: 1 }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '16px', backgroundColor: '#FEF9C3', color: '#EAB308', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Compass size={28} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h4 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>Explore</h4>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', margin: 0 }}>Browse by topic</p>
                  </div>
                </div>
                <div className="flex items-center" style={{ gap: '8px', position: 'relative', zIndex: 1 }}>
                  <ChevronRight size={20} color="var(--color-secondary-blue)" />
                </div>
              </div>

            </div>
          </div>
          
        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          {/* Flashcard Practice */}
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', marginBottom: '16px' }}>Flashcard practice</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              
              <div className="surface-card" style={{ padding: '20px', borderRadius: '24px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '20px' }} onClick={() => navigate('/learn/review')}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#FEF2F2', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <RotateCw size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>Review</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-secondary-blue)', margin: 0 }}>0 due</p>
                </div>
              </div>

              <div className="surface-card" style={{ padding: '20px', borderRadius: '24px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#ECFDF5', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle2 size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>Known</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-secondary-blue)', margin: 0 }}>300 mastered</p>
                </div>
              </div>

              <div className="surface-card" style={{ padding: '20px', borderRadius: '24px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#F5F3FF', color: '#8B5CF6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bookmark size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>Saved Words</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-secondary-blue)', margin: 0 }}>0 saved</p>
                </div>
              </div>

            </div>
          </div>

          {/* Browse Words */}
          <div>
            <div className="flex justify-between items-center" style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: 0 }}>Browse Words</h3>
              <div style={{ position: 'relative', width: '220px' }}>
                <input 
                  type="text" 
                  placeholder="Search..." 
                  style={{
                    width: '100%', padding: '10px 16px 10px 40px', borderRadius: '100px',
                    border: 'none', backgroundColor: 'var(--color-ghost-blue)',
                    fontSize: '0.875rem', color: 'var(--color-text-navy)', outline: 'none',
                    fontWeight: 500
                  }}
                />
                <Search size={18} color="var(--color-secondary-blue)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>
            </div>

            <div className="surface-card" style={{ borderRadius: '24px', overflow: 'hidden', padding: 0 }}>
              {words.map((word, idx) => (
                <div key={word.id} className="flex justify-between items-center" style={{ 
                  padding: '20px 24px', 
                  borderBottom: idx !== words.length - 1 ? '1px solid var(--color-border)' : 'none'
                }}>
                  <div className="flex items-center" style={{ gap: '24px' }}>
                    <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--color-primary-blue)', width: '60px', textAlign: 'center' }}>
                      {word.hanzi}
                    </div>
                    <div>
                      <p style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', margin: '0 0 4px 0' }}>{word.pinyin}</p>
                      <h4 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-text-navy)', margin: 0 }}>{word.translation}</h4>
                    </div>
                  </div>
                  {word.mastered && (
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CheckCircle size={16} color="#10B981" strokeWidth={3} />
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            {/* Offline Badge CTA */}
            <div className="flex justify-center" style={{ marginTop: '32px' }}>
              <div style={{ backgroundColor: '#10B981', color: 'white', padding: '12px 32px', borderRadius: '100px', fontSize: '0.875rem', fontWeight: 700, boxShadow: '0 8px 16px rgba(16,185,129,0.3)', cursor: 'pointer' }}>
                Ready to use offline
              </div>
            </div>

          </div>
          
        </div>

      </div>

    </div>
  );
}
