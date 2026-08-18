import React from 'react';
import { Layers, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ProgressRing = ({ progress, size, strokeWidth, gradientId, children }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(0,0,0,0.04)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          fill="none"
          style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
        />
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

export default function Flashcards() {
  const navigate = useNavigate();
  
  const hskLevels = [
    { num: 1, name: 'HSK 1', progress: 100, gradientStart: '#7DD3FC', gradientEnd: '#0369A1', shadow: 'rgba(3, 105, 161, 0.4)' },
    { num: 2, name: 'HSK 2', progress: 85, gradientStart: '#FCA5A5', gradientEnd: '#DC2626', shadow: 'rgba(220, 38, 38, 0.4)' },
    { num: 3, name: 'HSK 3', progress: 42, gradientStart: '#FDBA74', gradientEnd: '#EA580C', shadow: 'rgba(234, 88, 12, 0.4)' },
    { num: 4, name: 'HSK 4', progress: 12, gradientStart: '#FDE047', gradientEnd: '#CA8A04', shadow: 'rgba(202, 138, 4, 0.4)' },
    { num: 5, name: 'HSK 5', progress: 0, gradientStart: '#86EFAC', gradientEnd: '#15803D', shadow: 'rgba(21, 128, 61, 0.4)' },
    { num: 6, name: 'HSK 6', progress: 0, gradientStart: '#67E8F9', gradientEnd: '#0E7490', shadow: 'rgba(14, 116, 144, 0.4)' },
    { num: 7, name: 'HSK 7', progress: 0, gradientStart: '#60A5FA', gradientEnd: '#1E3A8A', shadow: 'rgba(30, 58, 138, 0.4)' },
    { num: 8, name: 'HSK 8', progress: 0, gradientStart: '#C4B5FD', gradientEnd: '#5B21B6', shadow: 'rgba(91, 33, 182, 0.4)' },
    { num: 9, name: 'HSK 9', progress: 0, gradientStart: '#6B7280', gradientEnd: '#171717', shadow: 'rgba(23, 23, 23, 0.4)' },
  ];

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(180deg, #F0F9FF 0%, #FFFFFF 25%, #FFFFFF 100%)', // App blue system fading immediately to white
      padding: '60px 24px 120px 24px', 
      fontFamily: 'Inter, sans-serif',
      position: 'relative',
      overflow: 'hidden'
    }}>
      
      {/* Decorative blue blurred blobs restricted to the top section */}
      <div style={{ position: 'absolute', top: '-5%', left: '-10%', width: '60vw', height: '60vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(125, 211, 252, 0.4) 0%, rgba(255,255,255,0) 70%)', filter: 'blur(50px)', zIndex: 0, pointerEvents: 'none' }}></div>
      <div style={{ position: 'absolute', top: '5%', right: '-20%', width: '70vw', height: '70vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(14, 165, 233, 0.15) 0%, rgba(255,255,255,0) 70%)', filter: 'blur(60px)', zIndex: 0, pointerEvents: 'none' }}></div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '600px', margin: '0 auto' }}>
        
        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '48px' }}>
          <div>
            <p style={{ fontSize: '1rem', color: 'var(--color-secondary-blue)', margin: '0 0 8px 0', fontWeight: 600 }}>Hello Htoo,</p>
            <h1 style={{ fontSize: '2.5rem', color: 'var(--color-text-navy)', margin: 0, fontWeight: 900, lineHeight: 1.1 }}>
              Continue<br/>Flashcards!
            </h1>
          </div>
          <div style={{
            width: '48px', height: '48px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #7DD3FC 0%, #0369A1 100%)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(3, 105, 161, 0.3)', color: 'white'
          }}>
            <Layers size={24} />
          </div>
        </header>

        {/* Your Flashcards Section */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-navy)', margin: 0 }}>All HSK Levels</h2>
        </div>

        {/* Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          {hskLevels.map((level, index) => {
            const chars = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
            return (
              <div 
                key={index}
                className="surface-card"
                onClick={() => navigate(`/flashcards/level/${level.num}`)}
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
                  <ProgressRing progress={level.progress} size={56} strokeWidth={4} gradientId={`ring-grad-${index}`}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '12px',
                      background: `linear-gradient(135deg, ${level.gradientStart} 0%, ${level.gradientEnd} 100%)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: `0 4px 8px ${level.shadow}`,
                      position: 'relative'
                    }}>
                      <BookOpen size={20} color="#FFFFFF" strokeWidth={2.5} />
                      <div style={{
                        position: 'absolute', bottom: '-4px', right: '-4px',
                        background: '#FFFFFF', color: level.gradientEnd,
                        borderRadius: '50%', width: '18px', height: '18px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.7rem', fontWeight: 900, boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                        border: `1px solid ${level.gradientStart}40`
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
                  {chars[index]}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
