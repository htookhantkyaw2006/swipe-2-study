import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, RotateCw } from 'lucide-react';
import { useCourse } from '../../lib/language';

/* Levels come from the active course (src/courses). */

export default function LevelCarousel() {
  const navigate = useNavigate();
  const course = useCourse();
  const [activeIndex, setActiveIndex] = useState(0);

  const levels = course.levels.map((l) => ({
    ...l,
    gradient: `linear-gradient(135deg, ${l.gradientStart} 0%, ${l.gradientEnd} 100%)`,
    completed: l.demo.completed
  }));
  const scrollRef = useRef(null);

  const handleScroll = (e) => {
    const scrollLeft = e.target.scrollLeft;
    const width = e.target.clientWidth;
    const index = Math.round(scrollLeft / width);
    if (index !== activeIndex) {
      setActiveIndex(index);
    }
  };

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      {/* Scrollable Container */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          width: '100%',
          display: 'flex',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none', // Firefox
          msOverflowStyle: 'none', // IE/Edge
          WebkitOverflowScrolling: 'touch',
        }}
        className="no-scrollbar"
      >
        <style>{`.no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
        
        {levels.map((level) => (
          <div 
            key={level.id}
            style={{
              flex: '0 0 100%',
              scrollSnapAlign: 'center',
              padding: '0 24px', // "Full width of the screen with horizontal margin matching page padding (24px)"
              boxSizing: 'border-box'
            }}
          >
            <div style={{
              background: level.gradient,
              borderRadius: '24px',
              padding: '24px 24px 20px',
              minHeight: '220px',
              color: '#FFFFFF',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 12px 24px rgba(0,0,0,0.1)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              
              {/* Lit 3D Badge Graphic */}
              <div style={{
                position: 'absolute',
                right: '15px',
                top: '48%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                zIndex: 0
              }}>
                <svg width="130" height="130" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <filter id="glowBadge" x="-30%" y="-30%" width="160%" height="160%">
                      <feGaussianBlur stdDeviation="5" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.7" />
                      <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.05" />
                    </linearGradient>
                    <linearGradient id="crystalGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  
                  {/* Outer Hexagon */}
                  <polygon points="60,10 105,35 105,85 60,110 15,85 15,35" fill="url(#shieldGrad)" filter="url(#glowBadge)" stroke="#FFFFFF" strokeWidth="1.5" strokeOpacity="0.8"/>
                  
                  {/* Inner Crystal Hexagon */}
                  <polygon points="60,20 95,40 95,80 60,100 25,80 25,40" fill="url(#crystalGrad)" stroke="#FFFFFF" strokeWidth="1.5" strokeOpacity="0.9"/>
                  
                  {/* Cards Stack */}
                  <rect x="42" y="35" width="36" height="46" rx="4" fill="#FFFFFF" fillOpacity="0.4" transform="rotate(15, 60, 60)" filter="url(#glowBadge)" />
                  <rect x="42" y="38" width="36" height="46" rx="4" fill="#FFFFFF" fillOpacity="0.7" transform="rotate(5, 60, 60)" filter="url(#glowBadge)" />
                  <rect x="42" y="40" width="36" height="46" rx="4" fill="#FFFFFF" fillOpacity="1.0" transform="rotate(-5, 60, 60)" filter="url(#glowBadge)" />
                  <text x="60" y="69" fontSize="22" fontWeight="900" fill={level.btnColor} textAnchor="middle" transform="rotate(-5, 60, 60)">
                    {course.copy.flashcardsWatermark}
                  </text>
                  
                  {/* Sparkles */}
                  <circle cx="20" cy="30" r="2.5" fill="#FFFFFF" filter="url(#glowBadge)" />
                  <circle cx="105" cy="20" r="3.5" fill="#FFFFFF" filter="url(#glowBadge)" />
                  <circle cx="95" cy="100" r="2" fill="#FFFFFF" filter="url(#glowBadge)" />
                </svg>
              </div>

              {/* Top row */}
              <div className="flex justify-between items-center" style={{ marginBottom: '16px', position: 'relative', zIndex: 1 }}>
                <span style={{ 
                  border: '1px solid rgba(255,255,255,0.5)', 
                  padding: '3px 12px', 
                  borderRadius: '12px', 
                  fontSize: '0.75rem', 
                  fontWeight: 600,
                  color: '#FFFFFF'
                }}>
                  NOW LEARNING
                </span>
                <span 
                  onClick={() => navigate('/learn')}
                  style={{ 
                    backgroundColor: 'rgba(255,255,255,0.15)', 
                    padding: '3px 12px', 
                    borderRadius: '12px', 
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: '#FFFFFF'
                  }}
                >
                  All levels
                </span>
              </div>

              {/* Content section */}
              <div style={{ flex: 1, marginBottom: '24px', position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: '55%' }}>
                  <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '4px' }}>{level.kicker}</div>
                  <div style={{ fontSize: '36px', fontWeight: 'bold', margin: '0 0 8px 0', lineHeight: 1 }}>{level.name}</div>
                  
                  <div style={{ fontSize: '13px', opacity: 0.85, marginBottom: '10px' }}>
                    {level.completed.toLocaleString()} / {level.words.toLocaleString()} completed
                  </div>
                  
                  <div style={{ 
                    width: '100%', height: '5px', 
                    backgroundColor: 'rgba(255,255,255,0.3)', 
                    borderRadius: '3px', overflow: 'hidden' 
                  }}>
                    <div style={{ 
                      width: `${(level.completed / level.words) * 100}%`, 
                      height: '100%', 
                      backgroundColor: '#FFFFFF' 
                    }}></div>
                  </div>
                </div>
              </div>

              {/* Bottom row buttons */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => navigate('/learn/session')} 
                  style={{ 
                    flex: 1, 
                    backgroundColor: '#FFFFFF', 
                    color: level.btnColor, 
                    padding: '10px', 
                    borderRadius: '12px', 
                    fontWeight: 'bold', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    fontSize: '0.875rem'
                  }}
                >
                  <Play size={16} /> Start swiping
                </button>
                <button 
                  onClick={() => navigate(`/learn/level/${level.id}`)} 
                  style={{ 
                    flex: 1, 
                    backgroundColor: 'transparent', 
                    color: '#FFFFFF', 
                    border: '1px solid rgba(255,255,255,0.5)', 
                    padding: '10px', 
                    borderRadius: '12px', 
                    fontWeight: 'bold', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    fontSize: '0.875rem'
                  }}
                >
                  <RotateCw size={16} /> Overview
                </button>
              </div>

            </div>
          </div>
        ))}
      </div>

      {/* Dot Indicators */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
        {levels.map((_, index) => (
          <div 
            key={index}
            style={{
              width: index === activeIndex ? '6px' : '4px',
              height: index === activeIndex ? '6px' : '4px',
              borderRadius: '50%',
              backgroundColor: index === activeIndex ? '#0369A1' : '#BAE6FD',
              transition: 'all 0.2s ease-in-out'
            }}
          />
        ))}
      </div>

    </div>
  );
}
