import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, RotateCw, Search, BookOpen, FileCheck, ChevronRight, Bell, Bookmark, Library as LibraryIcon, Crown, Zap, Layers, Sparkles } from 'lucide-react';
import LevelCarousel from '../components/ui/LevelCarousel';
import LanguageSwitcher from '../components/ui/LanguageSwitcher';
import Avatar from '../components/ui/Avatar';

const PhrasesPromoCard = ({ onClick }) => {
  return (
    <div 
      onClick={onClick}
      style={{
        position: 'relative',
        borderRadius: '24px', 
        cursor: 'pointer', 
        background: 'linear-gradient(135deg, #7DD3FC 0%, #0369A1 100%)', 
        boxShadow: '0 12px 24px rgba(0,0,0,0.1)',
        overflow: 'hidden',
        marginBottom: '24px',
        transition: 'transform 0.2s, box-shadow 0.2s'
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 16px 32px rgba(0,0,0,0.15)';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.1)';
      }}
    >
      
      {/* Decorative glass elements */}
      {/* Intentionally left blank to keep background clean and text legible */}

      {/* Content Container */}
      <div style={{ display: 'flex', position: 'relative', zIndex: 1, minHeight: '120px' }}>
        
        {/* Left Text */}
        <div style={{ flex: 1, padding: '20px 24px', color: '#FFFFFF', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ marginBottom: '16px' }}>
            <span style={{ 
              background: 'rgba(255,255,255,0.25)', 
              padding: '4px 10px', 
              borderRadius: '8px', 
              fontSize: '0.65rem', 
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '1px',
              border: '1px solid rgba(255,255,255,0.3)'
            }}>
              Keep Practicing
            </span>
          </div>
          
          <div style={{ fontSize: '1.45rem', fontWeight: 800, lineHeight: 1.1, marginBottom: '4px', letterSpacing: '-0.5px' }}>
            Master Phrases
          </div>
          <div style={{ fontSize: '0.8rem', color: '#F0F9FF', lineHeight: 1.4, maxWidth: '90%', opacity: 0.9 }}>
            Jump back into your speaking practice
          </div>
        </div>

        {/* Right Element - Premium 3D Bubble */}
        <div style={{ width: '130px', flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingRight: '14px' }}>
          
          <div style={{ position: 'relative', width: '85px', height: '85px' }}>
            {/* Back Glass Bubble */}
            <div style={{ 
              position: 'absolute', top: '13px', right: '6px', width: '46px', height: '36px', 
              borderRadius: '11px 11px 11px 4px', background: 'rgba(255,255,255,0.2)', 
              transform: 'rotate(12deg)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.4)', backdropFilter: 'blur(8px)'
            }}></div>
            
            {/* Front Crisp White Bubble */}
            <div style={{
              position: 'absolute', top: '23px', right: '23px', width: '52px', height: '42px', 
              borderRadius: '11px 11px 4px 11px', background: '#FFFFFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
              border: '1px solid rgba(255,255,255,0.8)',
              transform: 'rotate(-5deg)', zIndex: 1
            }}>
              <div style={{ position: 'relative', display: 'flex', gap: '3px' }}>
                <span style={{ width: '5px', height: '5px', backgroundColor: '#0369A1', borderRadius: '50%' }}></span>
                <span style={{ width: '5px', height: '5px', backgroundColor: '#0369A1', borderRadius: '50%' }}></span>
                <span style={{ width: '5px', height: '5px', backgroundColor: '#0369A1', borderRadius: '50%' }}></span>
              </div>
            </div>
            
            {/* Floating Chevron Action Button overlayed */}
            <div style={{
              position: 'absolute', bottom: '-2px', right: '5px',
              backgroundColor: '#0369A1', color: '#FFFFFF',
              width: '34px', height: '34px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(3, 105, 161, 0.4)', zIndex: 2,
              border: '2px solid #FFFFFF'
            }}>
              <ChevronRight size={20} strokeWidth={3} />
            </div>

            <div style={{ position: 'absolute', top: '0px', right: '14px', color: '#FFFFFF', zIndex: 2 }}>
              <Sparkles size={18} strokeWidth={2.5} />
            </div>
            <div style={{ position: 'absolute', bottom: '15px', left: '-4px', color: '#E0F2FE', zIndex: 2 }}>
              <Sparkles size={12} strokeWidth={2.5} />
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default function Home() {
  const navigate = useNavigate();
  const [currentUser] = useState({ name: 'Htoo Khant Kyaw', initials: 'HK' });
  const [reviewCount, setReviewCount] = useState(0);

  React.useEffect(() => {
    // Dynamic import to avoid top-level dependency issues if any
    import('../lib/db').then(({ db }) => {
      const reviewCards = db.get('review_cards') || [];
      setReviewCount(reviewCards.length);
    });
  }, []);

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '100px' }}>
      
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0px', paddingBottom: '16px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Avatar size={48} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <p style={{ fontSize: '0.85rem', color: '#6B7280', margin: 0, fontWeight: 500 }}>Good morning</p>
            <h1 style={{ fontSize: '1.125rem', color: 'var(--color-text-navy)', margin: 0, fontWeight: 700 }}>{currentUser.name}</h1>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <LanguageSwitcher />
          <div
            onClick={() => navigate('/notifications')}
            style={{
              width: '44px', height: '44px', borderRadius: '50%',
              backgroundColor: '#FFFFFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
              cursor: 'pointer',
              transition: 'transform 0.2s, box-shadow 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.08)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.05)';
            }}
          >
            <Bell size={20} color="#111827" strokeWidth={2.5} />
          </div>
        </div>
      </header>

      {/* Top Section: Carousel */}
      <div style={{ margin: '0 -24px' }}> {/* Negative margin to allow full-width swipe but keep inner card padding */}
        <LevelCarousel />
      </div>

      {/* Phrases Promo Banner */}
      <PhrasesPromoCard onClick={() => navigate('/flashcards')} />

      {/* 3-Column Top Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '12px' }}>
        
        {/* Review */}
        <div className="surface-card" style={{ padding: '16px', borderRadius: '20px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '12px' }} onClick={() => navigate('/learn/review')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ color: '#EF4444', backgroundColor: '#FEF2F2', width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RotateCw size={14} strokeWidth={2.5} />
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-navy)' }}>Review</div>
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)' }}>
              {reviewCount}<span style={{ fontSize: '0.75rem', color: 'var(--color-secondary-blue)', fontWeight: 600, marginLeft: '4px' }}>due</span>
            </div>
          </div>
        </div>

        {/* Saved */}
        <div className="surface-card" style={{ padding: '16px', borderRadius: '20px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '12px' }} onClick={() => navigate('/saved')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ color: '#059669', backgroundColor: '#D1FAE5', width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bookmark size={14} strokeWidth={2.5} />
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-navy)' }}>Saved</div>
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)' }}>
              12<span style={{ fontSize: '0.75rem', color: 'var(--color-secondary-blue)', fontWeight: 600, marginLeft: '4px' }}>words</span>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="surface-card" style={{ padding: '16px', borderRadius: '20px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '12px' }} onClick={() => navigate('/dictionary')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ color: '#7C3AED', backgroundColor: '#EDE9FE', width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Search size={14} strokeWidth={2.5} />
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-navy)' }}>Search</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', height: '1.25rem' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', fontWeight: 600 }}>Dictionary</span>
          </div>
        </div>

      </div>

      {/* 2-Column Bottom Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '16px' }}>
        
        {/* Flashcards */}
        <div className="surface-card" style={{ padding: '16px', borderRadius: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }} onClick={() => navigate('/learn')}>
          <div style={{ color: '#0EA5E9', backgroundColor: '#E0F2FE', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Layers size={18} strokeWidth={2.5} />
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-navy)' }}>Flashcards</div>
        </div>

        {/* Library */}
        <div className="surface-card" style={{ padding: '16px', borderRadius: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }} onClick={() => navigate('/library')}>
          <div style={{ color: '#EA580C', backgroundColor: '#FFEDD5', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LibraryIcon size={18} strokeWidth={2.5} />
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-navy)' }}>Library</div>
        </div>

      </div>

      {/* Graphic Promo Card */}
      <div style={{ 
        position: 'relative',
        borderRadius: '24px', 
        cursor: 'pointer', 
        background: '#FFFFFF', 
        boxShadow: '0 12px 32px rgba(3, 105, 161, 0.12)',
        overflow: 'hidden',
        border: '1px solid rgba(56, 189, 248, 0.2)',
        marginBottom: '24px'
      }} onClick={() => navigate('/premium')}>
        
        {/* Slanted Blue Background */}
        <div style={{ 
          position: 'absolute', top: 0, left: 0, bottom: 0, right: '110px',
          background: 'linear-gradient(135deg, #38BDF8 0%, #0369A1 100%)', 
          clipPath: 'polygon(0 0, 100% 0, calc(100% - 40px) 100%, 0 100%)',
          zIndex: 0
        }}></div>

        {/* Decorative elements on blue background */}
        <div style={{ position: 'absolute', top: '-20px', left: '-20px', width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', zIndex: 0 }}></div>
        <div style={{ position: 'absolute', bottom: '-40px', left: '40%', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', zIndex: 0 }}></div>

        {/* Content Container */}
        <div style={{ display: 'flex', position: 'relative', zIndex: 1, minHeight: '170px' }}>
          
          {/* Left Text */}
          <div style={{ flex: 1, padding: '24px', color: '#FFFFFF', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Crown size={14} color="#E0F2FE" strokeWidth={3} />
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#E0F2FE', textTransform: 'uppercase', letterSpacing: '1px' }}>
                S2S Premium
              </div>
            </div>
            
            <div style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.1, marginBottom: '8px', letterSpacing: '-0.5px' }}>
              Unlock your<br/>full potential
            </div>
            <div style={{ fontSize: '0.875rem', color: '#E0F2FE', marginBottom: '16px', lineHeight: 1.4, maxWidth: '90%' }}>
              Unlimited flashcards & mock tests.
            </div>
            <div>
              <button style={{ 
                background: '#FFFFFF', color: '#0369A1', padding: '10px 20px', 
                borderRadius: '14px', fontWeight: 800, border: 'none', 
                cursor: 'pointer', fontSize: '0.875rem',
                boxShadow: '0 8px 16px rgba(0,0,0,0.1)',
                transition: 'transform 0.2s'
              }} onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'} onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                Get Premium
              </button>
            </div>
          </div>

          {/* Right Floating Flashcards */}
          <div style={{ width: '140px', flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingRight: '16px' }}>
            <div style={{ position: 'relative', width: '110px', height: '120px' }}>
              
              {/* Back Card */}
              <div style={{ 
                position: 'absolute', top: '10px', right: '5px', width: '80px', height: '100px', 
                background: 'var(--color-ghost-blue)', borderRadius: '16px', 
                transform: 'rotate(12deg)', boxShadow: '0 4px 12px rgba(3, 105, 161, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.3)'
              }}></div>
              
              {/* Middle Card */}
              <div style={{ 
                position: 'absolute', top: '15px', right: '15px', width: '80px', height: '100px', 
                background: '#FFFFFF', borderRadius: '16px', 
                transform: 'rotate(-5deg)', boxShadow: '0 8px 16px rgba(3, 105, 161, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.4)'
              }}></div>
              
              {/* Front Card */}
              <div style={{ 
                position: 'absolute', top: '20px', right: '30px', width: '80px', height: '100px', 
                background: '#FFFFFF', borderRadius: '16px', 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 12px 24px rgba(3, 105, 161, 0.25)',
                border: '2px solid #E0F2FE'
              }}>
                <div style={{ fontSize: '3rem', fontWeight: 900, background: 'linear-gradient(135deg, #38BDF8 0%, #0369A1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginTop: '-4px' }}>
                  学
                </div>
              </div>
              
              {/* Floating Sparkles */}
              <div style={{ position: 'absolute', top: '0px', right: '-5px', color: '#38BDF8', zIndex: 2 }}>
                <Sparkles size={24} strokeWidth={2.5} />
              </div>
              <div style={{ position: 'absolute', bottom: '0px', left: '15px', color: '#0284C7', zIndex: 2 }}>
                <Sparkles size={18} strokeWidth={2.5} />
              </div>

            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
