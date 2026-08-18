import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, RotateCw } from 'lucide-react';

const hskLevels = [
  { id: 1, tier: 'LEVEL 1', title: 'HSK 1', total: 150, completed: 150, review: 41, gradient: 'linear-gradient(135deg, #7DD3FC 0%, #0369A1 100%)', btnColor: '#0369A1' },
  { id: 2, tier: 'LEVEL 2', title: 'HSK 2', total: 200, completed: 63, review: 12, gradient: 'linear-gradient(135deg, #FCA5A5 0%, #DC2626 100%)', btnColor: '#DC2626' },
  { id: 3, tier: 'LEVEL 3', title: 'HSK 3', total: 500, completed: 0, review: 0, gradient: 'linear-gradient(135deg, #FDBA74 0%, #EA580C 100%)', btnColor: '#EA580C' },
  { id: 4, tier: 'LEVEL 4', title: 'HSK 4', total: 1000, completed: 0, review: 0, gradient: 'linear-gradient(135deg, #FDE047 0%, #CA8A04 100%)', btnColor: '#CA8A04' },
  { id: 5, tier: 'LEVEL 5', title: 'HSK 5', total: 1600, completed: 0, review: 0, gradient: 'linear-gradient(135deg, #86EFAC 0%, #15803D 100%)', btnColor: '#15803D' },
  { id: 6, tier: 'LEVEL 6', title: 'HSK 6', total: 1800, completed: 0, review: 0, gradient: 'linear-gradient(135deg, #67E8F9 0%, #0E7490 100%)', btnColor: '#0E7490' },
  { id: 7, tier: 'LEVEL 7', title: 'HSK 7', total: 1866, completed: 0, review: 0, gradient: 'linear-gradient(135deg, #60A5FA 0%, #1E3A8A 100%)', btnColor: '#1E3A8A' },
  { id: 8, tier: 'LEVEL 8', title: 'HSK 8', total: 1867, completed: 0, review: 0, gradient: 'linear-gradient(135deg, #C4B5FD 0%, #5B21B6 100%)', btnColor: '#5B21B6' },
  { id: 9, tier: 'LEVEL 9', title: 'HSK 9', total: 1867, completed: 0, review: 0, gradient: 'linear-gradient(135deg, #6B7280 0%, #171717 100%)', btnColor: '#171717' }
];

export default function LevelCarousel() {
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState(0);
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
        
        {hskLevels.map((level) => (
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
                    字
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
                  <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '4px' }}>{level.tier}</div>
                  <div style={{ fontSize: '36px', fontWeight: 'bold', margin: '0 0 8px 0', lineHeight: 1 }}>{level.title}</div>
                  
                  <div style={{ fontSize: '13px', opacity: 0.85, marginBottom: '10px' }}>
                    {level.completed.toLocaleString()} / {level.total.toLocaleString()} completed
                  </div>
                  
                  <div style={{ 
                    width: '100%', height: '5px', 
                    backgroundColor: 'rgba(255,255,255,0.3)', 
                    borderRadius: '3px', overflow: 'hidden' 
                  }}>
                    <div style={{ 
                      width: `${(level.completed / level.total) * 100}%`, 
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
        {hskLevels.map((_, index) => (
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
