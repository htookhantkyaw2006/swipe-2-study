import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Settings as SettingsIcon, Play, Flame, Trophy, Lock, 
  BookOpen, CheckCircle, Clock, Star, MessageSquare, 
  ShieldCheck, FileText, LogOut, Trash2, ChevronRight, Crown,
  Database, RotateCcw
} from 'lucide-react';

export default function Profile() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px', paddingBottom: '100px' }}>
      
      {/* Header */}
      <header className="flex justify-between items-start">
        <div>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>Your Identity</p>
          <h1 style={{ fontSize: '2rem', color: 'var(--color-text-navy)', margin: 0, fontWeight: 800 }}>Profile</h1>
        </div>
        <div 
          onClick={() => navigate('/settings')}
          style={{
            width: '44px', height: '44px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #7DD3FC 0%, #0369A1 100%)', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(3, 105, 161, 0.3)'
          }}
        >
          <SettingsIcon size={20} />
        </div>
      </header>

      {/* Hero Stats Card */}
      <div className="surface-card" style={{ padding: '24px', borderRadius: '24px', position: 'relative', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
        <div className="flex justify-between items-start" style={{ position: 'relative', zIndex: 1, marginBottom: '24px' }}>
          <div className="flex items-center gap-16">
            <div style={{ 
              width: '64px', height: '64px', borderRadius: '18px', 
              background: 'linear-gradient(135deg, #C4B5FD 0%, #5B21B6 100%)',
              color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', 
              fontSize: '1.5rem', fontWeight: 800, marginRight: '20px',
              boxShadow: '0 8px 16px rgba(91, 33, 182, 0.4)'
            }}>
              HK
            </div>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>Htoo Khant Kyaw</h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', margin: 0, fontWeight: 500 }}>htookhantkyaw2006@gmail.com</p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', position: 'relative', zIndex: 1 }}>
          
          <div style={{ flex: 1, backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: '16px', padding: '12px 16px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
              <Flame size={14} color="#EA580C" strokeWidth={3} />
              <span style={{ fontSize: '0.7rem', color: 'var(--color-secondary-blue)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>Streak</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-navy)', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              7 <span style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', fontWeight: 600 }}>days</span>
            </div>
          </div>

          <div style={{ flex: 1, backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: '16px', padding: '12px 16px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
              <BookOpen size={14} color="#0369A1" strokeWidth={3} />
              <span style={{ fontSize: '0.7rem', color: 'var(--color-secondary-blue)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>Swiped</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-navy)', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              363 <span style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', fontWeight: 600 }}>cards</span>
            </div>
          </div>

        </div>

        {/* Big Watermark */}
        <div style={{ position: 'absolute', right: '-20px', bottom: '-40px', fontSize: '12rem', color: 'var(--color-ghost-blue)', fontWeight: 800, opacity: 0.5, zIndex: 0, pointerEvents: 'none', lineHeight: 1 }}>我</div>
      </div>

      {/* Support & Actions */}
      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 16px 0' }}>Support & Actions</h2>
        <div className="surface-card" style={{ padding: '0', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
          
          {/* Feedback */}
          <div className="flex items-center justify-between" style={{ padding: '24px', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-ghost-blue)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
            <div className="flex items-center gap-16">
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, #67E8F9 0%, #0E7490 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '20px', boxShadow: '0 4px 10px rgba(14, 116, 144, 0.3)' }}>
                <MessageSquare size={22} color="#FFFFFF" />
              </div>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>Send feedback</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', margin: 0 }}>Report an issue or suggest a feature</p>
              </div>
            </div>
            <ChevronRight size={24} color="var(--color-secondary-blue)" />
          </div>
          
          {/* Logout */}
          <div className="flex items-center justify-between" style={{ padding: '24px', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#FEE2E2'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
            <div className="flex items-center gap-16">
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '20px' }}>
                <LogOut size={22} color="#EF4444" />
              </div>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>Log out</h3>
              </div>
            </div>
          </div>

          {/* Delete */}
          <div className="flex items-center justify-between" style={{ padding: '24px', cursor: 'pointer', transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#FEE2E2'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
            <div className="flex items-center gap-16">
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, #FCA5A5 0%, #DC2626 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '20px', boxShadow: '0 4px 10px rgba(220, 38, 38, 0.3)' }}>
                <Trash2 size={22} color="#FFFFFF" />
              </div>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#EF4444', margin: '0 0 4px 0' }}>Delete account</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', margin: 0 }}>This cannot be undone</p>
              </div>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
