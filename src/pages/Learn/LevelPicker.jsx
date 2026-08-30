import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, GraduationCap, LayoutGrid, LayoutList } from 'lucide-react';

const ProgressRing = ({ progress, size, strokeWidth, gradientId, children }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(0,0,0,0.04)" strokeWidth={strokeWidth} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={`url(#${gradientId})`} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} fill="none" style={{ transition: 'stroke-dashoffset 0.5s ease-out' }} />
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--gradient-start)" />
            <stop offset="100%" stopColor="var(--gradient-end)" />
          </linearGradient>
        </defs>
      </svg>
      {children}
    </div>
  );
};

export default function LevelPicker() {
  const navigate = useNavigate();
  const [isGrouped, setIsGrouped] = useState(true);

  const levels = [
    { id: 'HSK1', num: 1, name: 'HSK 1', words: 300, mastered: 300, progress: 100, group: 'Foundation', gradientStart: '#7DD3FC', gradientEnd: '#0369A1', btnColor: '#0369A1', shadow: 'rgba(3, 105, 161, 0.4)' },
    { id: 'HSK2', num: 2, name: 'HSK 2', words: 200, mastered: 63, progress: 31, group: 'Foundation', gradientStart: '#FCA5A5', gradientEnd: '#DC2626', btnColor: '#DC2626', shadow: 'rgba(220, 38, 38, 0.4)' },
    { id: 'HSK3', num: 3, name: 'HSK 3', words: 500, mastered: 0, progress: 0, group: 'Foundation', gradientStart: '#FDBA74', gradientEnd: '#EA580C', btnColor: '#EA580C', shadow: 'rgba(234, 88, 12, 0.4)' },
    { id: 'HSK4', num: 4, name: 'HSK 4', words: 1000, mastered: 0, progress: 0, group: 'Intermediate', gradientStart: '#FDE047', gradientEnd: '#CA8A04', btnColor: '#CA8A04', shadow: 'rgba(202, 138, 4, 0.4)' },
    { id: 'HSK5', num: 5, name: 'HSK 5', words: 1600, mastered: 0, progress: 0, group: 'Intermediate', gradientStart: '#86EFAC', gradientEnd: '#15803D', btnColor: '#15803D', shadow: 'rgba(21, 128, 61, 0.4)' },
    { id: 'HSK6', num: 6, name: 'HSK 6', words: 1800, mastered: 0, progress: 0, group: 'Intermediate', gradientStart: '#67E8F9', gradientEnd: '#0E7490', btnColor: '#0E7490', shadow: 'rgba(14, 116, 144, 0.4)' },
    { id: 'HSK7', num: 7, name: 'HSK 7', words: 1866, mastered: 0, progress: 0, group: 'Advanced', gradientStart: '#60A5FA', gradientEnd: '#1E3A8A', btnColor: '#1E3A8A', shadow: 'rgba(30, 58, 138, 0.4)' },
    { id: 'HSK8', num: 8, name: 'HSK 8', words: 1867, mastered: 0, progress: 0, group: 'Advanced', gradientStart: '#C4B5FD', gradientEnd: '#5B21B6', btnColor: '#5B21B6', shadow: 'rgba(91, 33, 182, 0.4)' },
    { id: 'HSK9', num: 9, name: 'HSK 9', words: 1867, mastered: 0, progress: 0, group: 'Advanced', gradientStart: '#6B7280', gradientEnd: '#171717', btnColor: '#171717', shadow: 'rgba(23, 23, 23, 0.4)' }
  ];

  const groupedLevels = {
    Foundation: { desc: 'Build essential vocabulary and sentence patterns', levels: levels.filter(l => l.group === 'Foundation') },
    Intermediate: { desc: 'Handle wider topics and longer communication', levels: levels.filter(l => l.group === 'Intermediate') },
    Advanced: { desc: 'Develop precise, academic, and professional Chinese', levels: levels.filter(l => l.group === 'Advanced') },
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto', paddingBottom: '100px' }}>
      <header className="flex items-center justify-center relative" style={{ marginBottom: '24px' }}>
        <button onClick={() => navigate(-1)} style={{ position: 'absolute', left: 0, background: 'transparent', padding: '8px', border: 'none', cursor: 'pointer', zIndex: 10 }}>
          <ChevronLeft size={24} color="var(--color-text-navy)" />
        </button>
        <h1 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--color-text-navy)', fontWeight: 800 }}>HSK Courses</h1>
        <button 
          onClick={() => setIsGrouped(!isGrouped)} 
          style={{ position: 'absolute', right: '16px', background: 'var(--color-ghost-blue)', padding: '8px', borderRadius: '12px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary-blue)', zIndex: 10, transition: 'background-color 0.2s' }}
        >
          {isGrouped ? <LayoutGrid size={20} /> : <LayoutList size={20} />}
        </button>
      </header>

      {/* Top Banner */}
      <div style={{ 
        background: 'linear-gradient(135deg, #7DD3FC 0%, #0369A1 100%)', color: 'white', borderRadius: '24px', padding: '32px 24px',
        position: 'relative', overflow: 'hidden', marginBottom: '32px', boxShadow: '0 12px 24px rgba(3, 105, 161, 0.2)'
      }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <span style={{ border: '1px solid rgba(255,255,255,0.5)', padding: '4px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
            HSK 1-9 Learning Path
          </span>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, margin: '16px 0 8px 0', lineHeight: 1.1 }}>Choose an HSK level</h2>
          <p style={{ fontSize: '1rem', opacity: 0.9, maxWidth: '250px', margin: '0 0 32px 0' }}>Flashcards and mock tests are available now.</p>
          
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: '16px', display: 'flex', gap: '16px', fontSize: '0.875rem' }}>
            <span style={{ fontWeight: 600 }}>11,000 words</span>
            <span style={{ opacity: 0.9 }}>•</span>
            <span style={{ opacity: 0.9 }}>9 progressive levels</span>
          </div>
        </div>
        <div style={{ position: 'absolute', top: '32px', right: '24px', backgroundColor: 'rgba(255,255,255,0.15)', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <GraduationCap size={20} color="white" />
        </div>
        {/* Large faint background character */}
        <div style={{ position: 'absolute', right: '-20px', bottom: '-40px', fontSize: '12rem', color: 'rgba(255,255,255,0.1)', fontWeight: 800, lineHeight: 1 }}>
          学
        </div>
      </div>

      {/* Levels Grid */}
      {isGrouped ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {Object.entries(groupedLevels).map(([groupName, groupData]) => (
            <div key={groupName}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 8px 0' }}>{groupName}</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', margin: '0 0 16px 0', minHeight: '40px' }}>{groupData.desc}</p>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                {groupData.levels.map((level) => {
                  const chars = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
                  return (
                    <div 
                      key={level.id}
                      className="surface-card"
                      onClick={() => navigate(`/learn/level/${level.id}`)}
                      style={{ 
                        padding: '16px', borderRadius: '20px', position: 'relative', overflow: 'hidden', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s', boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                        '--gradient-start': level.gradientStart,
                        '--gradient-end': level.gradientEnd
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.06)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.03)';
                      }}
                    >
                      <div style={{ marginBottom: '12px' }}>
                        <ProgressRing progress={level.progress} size={56} strokeWidth={4} gradientId={`ring-grad-picker-${level.id}`}>
                          <div style={{ position: 'relative', width: '32px', height: '38px' }}>
                            {/* Back Card */}
                            <div style={{ 
                              position: 'absolute', top: '4px', left: '6px', width: '24px', height: '30px', 
                              borderRadius: '4px', backgroundColor: 'var(--color-ghost-blue)', 
                              transform: 'rotate(12deg)', zIndex: 0,
                              border: `1px solid ${level.gradientStart}40`
                            }}></div>
                            {/* Front Card */}
                            <div style={{
                              position: 'absolute', top: '6px', left: '2px', width: '24px', height: '30px', borderRadius: '4px',
                              background: `linear-gradient(135deg, ${level.gradientStart} 0%, ${level.gradientEnd} 100%)`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              boxShadow: `0 4px 8px ${level.shadow}`,
                              color: '#FFFFFF', fontWeight: 800, fontSize: '1rem',
                              zIndex: 1, transform: 'rotate(-6deg)',
                              border: '1px solid rgba(255,255,255,0.2)'
                            }}>
                              {level.num}
                            </div>
                          </div>
                        </ProgressRing>
                      </div>
                      
                      <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0', position: 'relative', zIndex: 1 }}>
                        {level.name}
                      </h3>
                      <p style={{ fontSize: '0.75rem', color: 'var(--color-secondary-blue)', margin: 0, fontWeight: 500, position: 'relative', zIndex: 1 }}>
                        {level.progress}% completed
                      </p>
  
                      {/* Faint character */}
                      <div style={{ position: 'absolute', right: '-10px', bottom: '-20px', fontSize: '5rem', color: 'var(--color-ghost-blue)', fontWeight: 800, opacity: 0.5, zIndex: 0, pointerEvents: 'none' }}>
                        {chars[level.num - 1]}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          {levels.map((level) => {
            const chars = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
            return (
              <div 
                key={level.id}
                className="surface-card"
                onClick={() => navigate(`/learn/level/${level.id}`)}
                style={{ 
                  padding: '16px', borderRadius: '20px', position: 'relative', overflow: 'hidden', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s', boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                  '--gradient-start': level.gradientStart,
                  '--gradient-end': level.gradientEnd
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.06)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.03)';
                }}
              >
                <div style={{ marginBottom: '12px' }}>
                  <ProgressRing progress={level.progress} size={56} strokeWidth={4} gradientId={`ring-grad-picker-flat-${level.id}`}>
                    <div style={{ position: 'relative', width: '32px', height: '38px' }}>
                      {/* Back Card */}
                      <div style={{ 
                        position: 'absolute', top: '4px', left: '6px', width: '24px', height: '30px', 
                        borderRadius: '4px', backgroundColor: 'var(--color-ghost-blue)', 
                        transform: 'rotate(12deg)', zIndex: 0,
                        border: `1px solid ${level.gradientStart}40`
                      }}></div>
                      {/* Front Card */}
                      <div style={{
                        position: 'absolute', top: '6px', left: '2px', width: '24px', height: '30px', borderRadius: '4px',
                        background: `linear-gradient(135deg, ${level.gradientStart} 0%, ${level.gradientEnd} 100%)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: `0 4px 8px ${level.shadow}`,
                        color: '#FFFFFF', fontWeight: 800, fontSize: '1rem',
                        zIndex: 1, transform: 'rotate(-6deg)',
                        border: '1px solid rgba(255,255,255,0.2)'
                      }}>
                        {level.num}
                      </div>
                    </div>
                  </ProgressRing>
                </div>
                
                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0', position: 'relative', zIndex: 1 }}>
                  {level.name}
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-secondary-blue)', margin: 0, fontWeight: 500, position: 'relative', zIndex: 1 }}>
                  {level.progress}% completed
                </p>

                {/* Faint character */}
                <div style={{ position: 'absolute', right: '-10px', bottom: '-20px', fontSize: '5rem', color: 'var(--color-ghost-blue)', fontWeight: 800, opacity: 0.5, zIndex: 0, pointerEvents: 'none' }}>
                  {chars[level.num - 1]}
                </div>
              </div>
            );
          })}
        </div>
      )}
      
    </div>
  );
}
