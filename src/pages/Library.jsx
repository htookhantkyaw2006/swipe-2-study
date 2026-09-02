import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, PenLine, Bookmark, Mic, Layers, ArrowLeftRight, ChevronRight, User, MessageCircle, RotateCw, BookOpen, LayoutGrid, List, Blocks, Languages } from 'lucide-react';
import { db } from '../lib/db';

/* One tool tile. Extracted so both Library sections render identically. */
const ToolCard = ({ tool, isGridView, onClick }) => (
  <div
    className="surface-card"
    style={{
      display: 'flex',
      flexDirection: isGridView ? 'column' : 'row',
      alignItems: isGridView ? 'flex-start' : 'center',
      justifyContent: isGridView ? 'center' : 'space-between',
      padding: isGridView ? '24px 20px' : '20px 24px',
      borderRadius: '24px',
      position: 'relative',
      overflow: 'hidden',
      cursor: 'pointer',
      transition: 'transform 0.2s, box-shadow 0.2s',
      boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
    }}
    onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.08)'; }}
    onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.03)'; }}
    onClick={onClick}
  >
    <div style={{ display: 'flex', flexDirection: isGridView ? 'column' : 'row', alignItems: isGridView ? 'flex-start' : 'center', gap: isGridView ? '12px' : '16px', zIndex: 1 }}>
      <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: tool.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 4px 12px ${tool.shadow}` }}>
        <tool.icon size={24} color="#FFFFFF" />
      </div>
      <div>
        <h3 style={{ fontSize: isGridView ? '1rem' : '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>{tool.title}</h3>
        <p style={{ fontSize: isGridView ? '0.75rem' : '0.875rem', color: 'var(--color-secondary-blue)', margin: 0 }}>{tool.subtitle}</p>
      </div>
    </div>
    {!isGridView && <ChevronRight size={24} color="var(--color-secondary-blue)" style={{ zIndex: 1, opacity: 0.5 }} />}
    <div style={{ position: 'absolute', right: isGridView ? '5px' : '20px', bottom: isGridView ? '-15px' : '-25px', fontSize: isGridView ? '6rem' : '8rem', color: tool.charColor, fontWeight: 800, opacity: isGridView ? 0.3 : 0.6, zIndex: 0, pointerEvents: 'none', transition: 'all 0.3s' }}>{tool.char}</div>
  </div>
);

export default function Library() {
  const navigate = useNavigate();
  const [reviewCount, setReviewCount] = useState(0);
  const [isGridView, setIsGridView] = useState(false);

  useEffect(() => {
    const reviewCards = db.get('review_cards') || [];
    setReviewCount(reviewCards.length);
  }, []);

  // Your daily vocabulary loop — drill, review, save, look up.
  const learnAndReviewTools = [
    { title: 'Flashcards', subtitle: 'Daily practice', icon: Layers, gradient: 'linear-gradient(135deg, #7DD3FC 0%, #0284C7 100%)', shadow: 'rgba(2, 132, 199, 0.4)', path: '/learn', char: '卡', charColor: 'var(--color-ghost-blue)' },
    { title: 'Review', subtitle: `${reviewCount} words due`, icon: RotateCw, gradient: 'linear-gradient(135deg, #FCA5A5 0%, #DC2626 100%)', shadow: 'rgba(220, 38, 38, 0.4)', path: '/learn/review', char: '复', charColor: '#FEE2E2' },
    { title: 'Saved Words', subtitle: 'Your bookmarked words', icon: Bookmark, gradient: 'linear-gradient(135deg, #86EFAC 0%, #16A34A 100%)', shadow: 'rgba(22, 163, 74, 0.4)', path: '/saved', char: '藏', charColor: '#DCFCE7' },
    { title: 'Dictionary', subtitle: 'Search all HSK words', icon: BookOpen, gradient: 'linear-gradient(135deg, #FDBA74 0%, #EA580C 100%)', shadow: 'rgba(234, 88, 12, 0.4)', path: '/dictionary', char: '典', charColor: '#FFEDD5' },
    { title: 'Learn Phrases', subtitle: 'Master common expressions', icon: MessageCircle, gradient: 'linear-gradient(135deg, #93C5FD 0%, #2563EB 100%)', shadow: 'rgba(37, 99, 235, 0.4)', path: '/flashcards', char: '句', charColor: '#DBEAFE' }
  ];

  // Characters, themes and speaking — the tools you dip into.
  const exploreAndPractiseTools = [
    { title: 'Hanzi Dictionary', subtitle: 'Look up any character', icon: Languages, gradient: 'linear-gradient(135deg, #FCD34D 0%, #B45309 100%)', shadow: 'rgba(180, 83, 9, 0.4)', path: '#', char: '汉', charColor: '#FEF3C7' },
    { title: 'Learn Radicals', subtitle: '氵 water, 木 tree, 心 heart...', icon: Blocks, gradient: 'linear-gradient(135deg, #A5B4FC 0%, #4338CA 100%)', shadow: 'rgba(67, 56, 202, 0.4)', path: '/radicals', char: '部', charColor: '#E0E7FF' },
    { title: 'Study by Interest', subtitle: 'Food, travel, people, work...', icon: Layers, gradient: 'linear-gradient(135deg, #D8B4FE 0%, #9333EA 100%)', shadow: 'rgba(147, 51, 234, 0.4)', path: '/interest', char: '类', charColor: '#F3E8FF' },
    { title: 'Practise Writing', subtitle: 'Trace characters by hand', icon: PenLine, gradient: 'linear-gradient(135deg, #5EEAD4 0%, #0F766E 100%)', shadow: 'rgba(15, 118, 110, 0.4)', path: '/writing', char: '写', charColor: '#CCFBF1' },
    { title: 'Tongue Twisters', subtitle: '20 drills with voice', icon: Mic, gradient: 'linear-gradient(135deg, #FDA4AF 0%, #E11D48 100%)', shadow: 'rgba(225, 29, 72, 0.4)', path: '#', char: '绕', charColor: '#FFE4E6' }
  ];

  return (
    <div style={{ background: 'transparent', width: '100%', minHeight: '100vh', position: 'relative' }}>
      {/* Background that matches HSK 1 card dimensions */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '280px', background: 'linear-gradient(135deg, #7DD3FC 0%, #0369A1 100%)', zIndex: 0 }}></div>
      
      {/* Header Container */}
      <div style={{ maxWidth: '1000px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div style={{ padding: '40px 24px 32px 24px' }}>
          {/* Header */}
          <header className="flex justify-between items-start">
            <div>
              <p style={{ fontSize: '1.25rem', color: 'rgba(255, 255, 255, 0.9)', margin: '0 0 8px 0', fontWeight: 500 }}>Hello!</p>
              <h1 style={{ fontSize: '2rem', color: '#FFFFFF', margin: 0, fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1.2 }}>What do you want<br/>to learn today?</h1>
            </div>
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.2)', color: '#FFFFFF', backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)'
            }}>
              <User size={22} strokeWidth={2.5} />
            </div>
          </header>
        </div>
      </div>

      {/* Main Content Sheet */}
      <div style={{ 
        background: 'var(--bg-gradient)', 
        backgroundAttachment: 'fixed',
        borderTopLeftRadius: '40px', 
        borderTopRightRadius: '40px',
        minHeight: '100vh',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Centered Content */}
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px 24px 120px 24px' }}>
          {/* Progress Tracking Section */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.5px', background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>Your Swipe Stats</h2>
          <div style={{ 
            display: 'flex', alignItems: 'center', gap: '8px', color: '#0369A1', fontWeight: 900, fontSize: '1.2rem', 
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(224, 242, 254, 0.7) 100%)', 
            backdropFilter: 'blur(12px)',
            padding: '6px 18px', borderRadius: '24px',
            boxShadow: '0 8px 24px rgba(2, 132, 199, 0.15), inset 0 2px 4px rgba(255, 255, 255, 1)',
            border: '1px solid rgba(255, 255, 255, 0.9)'
          }}>
            <style>
              {`
                @keyframes iceFire {
                  0% { filter: drop-shadow(0 0 2px rgba(2, 132, 199, 0.3)); transform: scale(1) translateY(0); }
                  50% { filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.7)); transform: scale(1.08) translateY(-1px); }
                  100% { filter: drop-shadow(0 0 2px rgba(2, 132, 199, 0.3)); transform: scale(1) translateY(0); }
                }
              `}
            </style>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="url(#glacier-fire)" stroke="url(#glacier-fire-stroke)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'iceFire 2.5s ease-in-out infinite' }}>
              <defs>
                <linearGradient id="glacier-fire" x1="0%" y1="100%" x2="0%" y2="0%">
                  <stop offset="0%" stopColor="#7DD3FC" />
                  <stop offset="50%" stopColor="#0EA5E9" />
                  <stop offset="100%" stopColor="#0369A1" />
                </linearGradient>
                <linearGradient id="glacier-fire-stroke" x1="0%" y1="100%" x2="0%" y2="0%">
                  <stop offset="0%" stopColor="#0284C7" />
                  <stop offset="100%" stopColor="#082F49" />
                </linearGradient>
              </defs>
              <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
            </svg>
            <span style={{ textShadow: '0 2px 4px rgba(2, 132, 199, 0.1)' }}>3</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
          {/* Card 1: Words Swiped */}
          <div style={{ 
            padding: '16px', borderRadius: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '110px',
            backgroundColor: '#FFFFFF', border: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 4px 16px rgba(3, 105, 161, 0.04)' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-secondary-blue)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Words<br/>Swiped</div>
              <div style={{ color: '#0284C7', backgroundColor: '#E0F2FE', padding: '6px', borderRadius: '10px' }}>
                <Layers size={16} strokeWidth={2.5} />
              </div>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text-navy)', lineHeight: 1 }}>1,248</div>
          </div>
          
          {/* Card 2: Saved Words */}
          <div style={{ 
            padding: '16px', borderRadius: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '110px',
            backgroundColor: '#FFFFFF', border: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 4px 16px rgba(3, 105, 161, 0.04)' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-secondary-blue)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Saved<br/>Words</div>
              <div style={{ color: '#059669', backgroundColor: '#D1FAE5', padding: '6px', borderRadius: '10px' }}>
                <Bookmark size={16} strokeWidth={2.5} />
              </div>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#059669', lineHeight: 1 }}>42</div>
          </div>

          {/* Card 3: Learned Phrases */}
          <div style={{ 
            padding: '16px', borderRadius: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '110px',
            backgroundColor: '#FFFFFF', border: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 4px 16px rgba(3, 105, 161, 0.04)' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-secondary-blue)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Learned<br/>Phrases</div>
              <div style={{ color: '#2563EB', backgroundColor: '#DBEAFE', padding: '6px', borderRadius: '10px' }}>
                <MessageCircle size={16} strokeWidth={2.5} />
              </div>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text-navy)', lineHeight: 1 }}>86</div>
          </div>

          {/* Card 4: Review Due */}
          <div style={{ 
            padding: '16px', borderRadius: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '110px',
            backgroundColor: '#FFFFFF', border: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 4px 16px rgba(3, 105, 161, 0.04)' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-secondary-blue)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Review<br/>Due</div>
              <div style={{ color: '#DC2626', backgroundColor: '#FEE2E2', padding: '6px', borderRadius: '10px' }}>
                <RotateCw size={16} strokeWidth={2.5} />
              </div>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#DC2626', lineHeight: 1 }}>{reviewCount}</div>
          </div>
        </div>
      </div>

      {/* Search Section */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{ position: 'relative', width: '100%' }}>
          <Search size={22} color="var(--color-primary-blue)" style={{ position: 'absolute', left: '24px', top: '50%', transform: 'translateY(-50%)', zIndex: 1 }} />
          <input 
            type="text" 
            placeholder="Search Chinese, pinyin, English..." 
            className="input-field"
            style={{ 
              width: '100%',
              padding: '20px 24px 20px 64px', 
              borderRadius: '24px', 
              backgroundColor: '#FFFFFF', 
              boxShadow: '0 8px 24px rgba(3, 105, 161, 0.08)', 
              border: '2px solid transparent', 
              fontSize: '1rem',
              fontWeight: 500,
              color: 'var(--color-text-navy)',
              transition: 'border-color 0.2s',
              outline: 'none',
              boxSizing: 'border-box'
            }}
            onFocus={(e) => e.target.style.border = '2px solid var(--color-primary-blue)'}
            onBlur={(e) => e.target.style.border = '2px solid transparent'}
          />
        </div>
      </div>



      {/* Learn & Review — the daily loop. Holds the view toggle, which
          governs both sections. */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: 0 }}>Learn &amp; Review</h2>
          <button
            onClick={() => setIsGridView(!isGridView)}
            style={{ background: 'var(--color-ghost-blue)', border: 'none', cursor: 'pointer', color: 'var(--color-primary-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', borderRadius: '12px', transition: 'background-color 0.2s' }}
          >
            {isGridView ? <List size={20} strokeWidth={2.5} /> : <LayoutGrid size={20} strokeWidth={2.5} />}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isGridView ? 'repeat(2, 1fr)' : '1fr', gap: '16px' }}>
          {learnAndReviewTools.map((tool, idx) => (
            <ToolCard
              key={idx}
              tool={tool}
              isGridView={isGridView}
              onClick={() => { if (tool.path !== '#') navigate(tool.path); }}
            />
          ))}
        </div>
      </div>

      {/* Explore & Practise — characters, themes and speaking. */}
      <div style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 16px 0' }}>Explore &amp; Practise</h2>

        <div style={{ display: 'grid', gridTemplateColumns: isGridView ? 'repeat(2, 1fr)' : '1fr', gap: '16px' }}>
          {exploreAndPractiseTools.map((tool, idx) => (
            <ToolCard
              key={idx}
              tool={tool}
              isGridView={isGridView}
              onClick={() => { if (tool.path !== '#') navigate(tool.path); }}
            />
          ))}
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}
