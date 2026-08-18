import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, RotateCw, Search, BookOpen, FileCheck, ChevronRight, Bell, Bookmark, Library as LibraryIcon, Crown, Zap, Layers } from 'lucide-react';
import LevelCarousel from '../components/ui/LevelCarousel';

const PhrasesPromoCard = ({ onClick }) => {
  return (
    <div 
      onClick={onClick}
      style={{
        background: 'linear-gradient(135deg, #7DD3FC 0%, #0369A1 100%)',
        borderRadius: '20px',
        padding: '20px',
        color: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        boxShadow: '0 8px 16px rgba(3, 105, 161, 0.15)',
        marginBottom: '20px',
        cursor: 'pointer',
        transition: 'transform 0.2s, box-shadow 0.2s'
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 12px 24px rgba(3, 105, 161, 0.25)';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 8px 16px rgba(3, 105, 161, 0.15)';
      }}
    >
      
      {/* 3D Message Bubble Icon */}
      <div style={{
        position: 'relative',
        width: '64px', height: '64px',
        borderRadius: '16px',
        background: 'rgba(255,255,255,0.15)',
        border: '1px solid rgba(255,255,255,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: '0 8px 16px rgba(0,0,0,0.1)'
      }}>
        {/* Back Bubble */}
        <div style={{ 
          position: 'absolute', top: '16px', left: '18px', width: '32px', height: '26px', 
          borderRadius: '10px 10px 10px 2px', backgroundColor: 'rgba(255,255,255,0.4)', 
          transform: 'rotate(8deg)', zIndex: 0
        }}></div>
        {/* Front Bubble */}
        <div style={{
          position: 'absolute', top: '18px', left: '14px', width: '32px', height: '26px', 
          borderRadius: '10px 10px 2px 10px', background: '#FFFFFF',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
          color: '#0369A1', fontWeight: 900, fontSize: '1.25rem',
          zIndex: 1, transform: 'rotate(-4deg)'
        }}>
          <div style={{ position: 'relative', top: '-4px', display: 'flex', gap: '2px' }}>
            <span style={{ width: '4px', height: '4px', backgroundColor: '#0369A1', borderRadius: '50%' }}></span>
            <span style={{ width: '4px', height: '4px', backgroundColor: '#0369A1', borderRadius: '50%' }}></span>
            <span style={{ width: '4px', height: '4px', backgroundColor: '#0369A1', borderRadius: '50%' }}></span>
          </div>
        </div>
      </div>

      {/* Content section */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: '8px' }}>
          <span style={{ 
            border: '1px solid rgba(255,255,255,0.5)', 
            padding: '2px 8px', 
            borderRadius: '10px', 
            fontSize: '0.65rem', 
            fontWeight: 700,
            color: '#FFFFFF'
          }}>
            PHRASES
          </span>
        </div>
        <div>
          <div style={{ fontSize: '11px', opacity: 0.9, marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Keep Practicing</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 6px 0', lineHeight: 1.1 }}>Master Phrases</div>
          <div style={{ fontSize: '12px', opacity: 0.9 }}>
            Jump back into your speaking practice
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div style={{
        backgroundColor: '#FFFFFF',
        color: '#0369A1',
        width: '40px', height: '40px',
        borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
      }}>
        <ChevronRight size={24} strokeWidth={3} />
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
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img 
            src="/profile.jpg" 
            alt="Profile" 
            style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} 
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <p style={{ fontSize: '0.85rem', color: '#6B7280', margin: 0, fontWeight: 500 }}>Good morning</p>
            <h1 style={{ fontSize: '1.125rem', color: 'var(--color-text-navy)', margin: 0, fontWeight: 700 }}>{currentUser.name}</h1>
          </div>
        </div>
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
        <div className="surface-card" style={{ padding: '16px', borderRadius: '20px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
        <div className="surface-card" style={{ padding: '16px', borderRadius: '20px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
          <div style={{ color: 'var(--color-primary-blue)', backgroundColor: 'var(--color-ghost-blue)', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

      {/* Subscribe Banner */}
      <div className="surface-card flex items-center justify-between" style={{ 
        padding: '24px', 
        borderRadius: '24px', 
        cursor: 'pointer', 
        background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)', 
        color: '#FFFFFF', 
        boxShadow: '0 12px 24px rgba(3, 105, 161, 0.2)' 
      }}>
        <div className="flex items-center gap-4">
          <div style={{ width: '48px', height: '48px', borderRadius: '14px', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Crown size={24} color="#FFFFFF" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 4px 0', letterSpacing: '-0.5px' }}>Subscribe to Premium</div>
            <div style={{ fontSize: '0.875rem', opacity: 0.9, fontWeight: 500 }}>Unlock all flashcards & mock tests</div>
          </div>
        </div>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronRight size={20} color="#FFFFFF" strokeWidth={3} />
        </div>
      </div>

      {/* Bottom Wide Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
        <div className="surface-card flex justify-between items-center" style={{ padding: '24px', borderRadius: '20px', cursor: 'pointer' }} onClick={() => navigate('/progress')}>
          <div>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-secondary-blue)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, margin: '0 0 8px 0' }}>Overall Vocabulary</p>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: 0 }}>363 mastered</h3>
          </div>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--color-page-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={20} color="var(--color-text-navy)" />
          </div>
        </div>
        
        <div className="surface-card flex justify-between items-center" style={{ padding: '24px', borderRadius: '20px' }}>
          <div>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-secondary-blue)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, margin: '0 0 8px 0' }}>Study Tools</p>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: 0 }}>Keep moving</h3>
          </div>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--color-page-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={20} color="var(--color-text-navy)" />
          </div>
        </div>
      </div>
      
    </div>
  );
}
