import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Layers, Compass, RotateCw, CheckCircle, Bookmark, ChevronRight } from 'lucide-react';

const hskLevels = [
  { num: 1, name: 'HSK 1', words: 300, mastered: 300, progress: 100, group: 'BEGINNER', gradientStart: '#7DD3FC', gradientEnd: '#0369A1' },
  { num: 2, name: 'HSK 2', words: 200, mastered: 62, progress: 31, group: 'BEGINNER', gradientStart: '#FCA5A5', gradientEnd: '#DC2626' },
  { num: 3, name: 'HSK 3', words: 500, mastered: 0, progress: 0, group: 'BEGINNER', gradientStart: '#FDBA74', gradientEnd: '#EA580C' },
  { num: 4, name: 'HSK 4', words: 1000, mastered: 0, progress: 0, group: 'INTERMEDIATE', gradientStart: '#FDE047', gradientEnd: '#CA8A04' },
  { num: 5, name: 'HSK 5', words: 1600, mastered: 0, progress: 0, group: 'INTERMEDIATE', gradientStart: '#86EFAC', gradientEnd: '#15803D' },
  { num: 6, name: 'HSK 6', words: 1800, mastered: 0, progress: 0, group: 'INTERMEDIATE', gradientStart: '#67E8F9', gradientEnd: '#0E7490' },
  { num: 7, name: 'HSK 7', words: 1866, mastered: 0, progress: 0, group: 'ADVANCED', gradientStart: '#60A5FA', gradientEnd: '#1E3A8A' },
  { num: 8, name: 'HSK 8', words: 1867, mastered: 0, progress: 0, group: 'ADVANCED', gradientStart: '#C4B5FD', gradientEnd: '#5B21B6' },
  { num: 9, name: 'HSK 9', words: 1867, mastered: 0, progress: 0, group: 'ADVANCED', gradientStart: '#6B7280', gradientEnd: '#171717' },
];

export default function PhrasesLevel() {
  const { levelId } = useParams();
  const navigate = useNavigate();
  const level = hskLevels.find(l => l.num === parseInt(levelId)) || hskLevels[0];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-page-bg)', paddingBottom: '100px', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '24px' }}>
        <button onClick={() => navigate(-1)} style={{ position: 'absolute', left: '24px', background: 'transparent', padding: 0, border: 'none', cursor: 'pointer' }}>
          <ChevronLeft size={24} color="var(--color-text-navy)" strokeWidth={2.5} />
        </button>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: 0 }}>HSK {level.num}</h1>
      </header>

      <div style={{ padding: '0 24px' }}>
        
        {/* Main Hero Card */}
        <div style={{
          background: `linear-gradient(135deg, ${level.gradientStart} 0%, ${level.gradientEnd} 100%)`,
          borderRadius: '24px', padding: '24px', color: '#FFFFFF',
          boxShadow: '0 12px 24px rgba(0,0,0,0.1)', marginBottom: '32px'
        }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 8px 0', opacity: 0.9 }}>
            {level.group}
          </p>
          <h2 style={{ fontSize: '3rem', fontWeight: 900, margin: '0 0 16px 0', lineHeight: 1, color: '#FFFFFF' }}>
            HSK {level.num}
          </h2>
          <p style={{ fontSize: '1rem', margin: '0 0 24px 0', opacity: 0.9 }}>
            {level.words} phrases
          </p>
          
          <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '100px', marginBottom: '8px' }}>
            <div style={{ width: `${level.progress}%`, height: '100%', backgroundColor: '#FFFFFF', borderRadius: '100px' }}></div>
          </div>
          <p style={{ fontSize: '0.875rem', margin: 0, opacity: 0.9 }}>
            {level.mastered} mastered
          </p>
        </div>

        {/* Course Modules */}
        <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 16px 0' }}>
          HSK {level.num} course modules
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
          {/* Flashcards Card */}
          <div 
            onClick={() => navigate('/flashcards/session')}
            style={{ 
              backgroundColor: '#FFFFFF', borderRadius: '20px', padding: '20px', 
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              boxShadow: '0 4px 12px rgba(12, 74, 110, 0.05)', cursor: 'pointer', position: 'relative', overflow: 'hidden'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', position: 'relative', zIndex: 1 }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', backgroundColor: 'var(--color-page-bg)', color: 'var(--color-primary-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Layers size={24} />
              </div>
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>Phrases</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-primary-blue)', margin: 0 }}>
                  {level.mastered} of {level.words} phrases mastered
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', color: 'var(--color-primary-blue)', fontWeight: 800, fontSize: '0.875rem', position: 'relative', zIndex: 1 }}>
              {level.progress}% <ChevronRight size={18} strokeWidth={3} />
            </div>
            <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '6rem', color: 'var(--color-page-bg)', fontWeight: 900, zIndex: 0, pointerEvents: 'none' }}>
              字
            </div>
          </div>

          {/* Explore Card */}
          <div 
            style={{ 
              backgroundColor: '#FFFFFF', borderRadius: '20px', padding: '20px', 
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              boxShadow: '0 4px 12px rgba(12, 74, 110, 0.05)', cursor: 'pointer', position: 'relative', overflow: 'hidden'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', position: 'relative', zIndex: 1 }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', backgroundColor: '#FEF9C3', color: '#CA8A04', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Compass size={24} />
              </div>
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>Explore</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-primary-blue)', margin: 0 }}>
                  Browse by topic
                </p>
              </div>
            </div>
            <div style={{ color: 'var(--color-primary-blue)', position: 'relative', zIndex: 1 }}>
              <ChevronRight size={20} strokeWidth={2.5} />
            </div>
            <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '6rem', color: 'var(--color-page-bg)', fontWeight: 900, zIndex: 0, pointerEvents: 'none' }}>
              课
            </div>
          </div>
        </div>

        {/* Flashcard Practice */}
        <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 16px 0' }}>
          Flashcard practice
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', paddingBottom: '12px' }}>
          
          {/* Review Card */}
          <div style={{ 
            backgroundColor: '#FFFFFF', borderRadius: '20px', padding: '12px',
            boxShadow: '0 4px 12px rgba(12, 74, 110, 0.05)'
          }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '12px', backgroundColor: '#FEE2E2', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
              <RotateCw size={18} strokeWidth={2.5} />
            </div>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Review</h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-primary-blue)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>0 due</p>
          </div>

          {/* Known Card */}
          <div style={{ 
            backgroundColor: '#FFFFFF', borderRadius: '20px', padding: '12px',
            boxShadow: '0 4px 12px rgba(12, 74, 110, 0.05)'
          }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '12px', backgroundColor: '#DCFCE7', color: '#22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
              <CheckCircle size={18} strokeWidth={2.5} />
            </div>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Known</h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-primary-blue)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{level.mastered} mastered</p>
          </div>

          {/* Saved Card */}
          <div style={{ 
            backgroundColor: '#FFFFFF', borderRadius: '20px', padding: '12px',
            boxShadow: '0 4px 12px rgba(12, 74, 110, 0.05)'
          }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '12px', backgroundColor: '#F3E8FF', color: '#9333EA', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
              <Bookmark size={18} strokeWidth={2.5} />
            </div>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Saved</h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-primary-blue)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>0 saved</p>
          </div>

        </div>

      </div>
    </div>
  );
}
