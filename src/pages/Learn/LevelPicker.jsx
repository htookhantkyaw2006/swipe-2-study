import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, GraduationCap } from 'lucide-react';
import { useCourse } from '../../lib/language';

const ProgressRing = ({ progress, size, strokeWidth, gradientId, children }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="var(--color-ghost-blue)" strokeWidth={strokeWidth} fill="none" />
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

  const course = useCourse();

  // floor, not round: 63 of 200 is 31%, and rounding would claim 32.
  const levels = course.levels.map((l) => ({
    ...l,
    progress: Math.floor((l.demo.completed / l.words) * 100)
  }));

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto', paddingBottom: '100px' }}>
      <header className="flex items-center justify-center relative" style={{ marginBottom: '24px' }}>
        <button onClick={() => navigate(-1)} style={{ position: 'absolute', left: 0, background: 'transparent', padding: '8px', border: 'none', cursor: 'pointer', zIndex: 10 }}>
          <ChevronLeft size={24} color="var(--color-text-navy)" />
        </button>
        <h1 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--color-text-navy)', fontWeight: 800 }}>{course.copy.coursesTitle}</h1>
      </header>

      {/* Top Banner */}
      <div style={{ 
        background: 'linear-gradient(135deg, #7DD3FC 0%, #0369A1 100%)', color: 'white', borderRadius: '24px', padding: '32px 24px',
        position: 'relative', overflow: 'hidden', marginBottom: '32px', boxShadow: '0 12px 24px rgba(3, 105, 161, 0.2)'
      }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <span style={{ border: '1px solid rgba(255,255,255,0.5)', padding: '4px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
            {course.copy.pathPill}
          </span>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, margin: '16px 0 8px 0', lineHeight: 1.1 }}>{course.copy.pickerHeadline}</h2>
          <p style={{ fontSize: '1rem', opacity: 0.9, maxWidth: '250px', margin: '0 0 32px 0' }}>{course.copy.pickerSubtitle}</p>
          
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: '16px', display: 'flex', gap: '16px', fontSize: '0.875rem' }}>
            <span style={{ fontWeight: 600 }}>{course.copy.totalWords}</span>
            <span style={{ opacity: 0.9 }}>•</span>
            <span style={{ opacity: 0.9 }}>{course.copy.levelCount}</span>
          </div>
        </div>
        <div style={{ position: 'absolute', top: '32px', right: '24px', backgroundColor: 'rgba(255,255,255,0.15)', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <GraduationCap size={20} color="white" />
        </div>
        {/* Large faint background character */}
        <div style={{ position: 'absolute', right: '-20px', bottom: '-40px', fontSize: '12rem', color: 'rgba(255,255,255,0.1)', fontWeight: 800, lineHeight: 1 }}>
          {course.copy.heroWatermark}
        </div>
      </div>

      {/* Levels Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
        {levels.map((level) => {
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
                      color: '#FFFFFF', fontWeight: 800, fontSize: level.badge.length > 1 ? '0.7rem' : '1rem',
                      zIndex: 1, transform: 'rotate(-6deg)',
                      border: '1px solid rgba(255,255,255,0.2)'
                    }}>
                      {level.badge}
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
                {level.numeral}
              </div>
            </div>
          );
        })}
      </div>
      
    </div>
  );
}
