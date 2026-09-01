import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Target, Globe, Languages, Shuffle, Volume2, 
  Bell, Clock, Flame, ChevronRight
} from 'lucide-react';

const ToggleSwitch = ({ checked, onChange, disabled }) => {
  return (
    <div 
      onClick={() => { if (!disabled && onChange) onChange(!checked); }}
      style={{ 
        width: '52px', height: '28px', borderRadius: '14px',
        backgroundColor: checked ? '#10B981' : '#E0F2FE',
        position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color 0.3s',
        opacity: disabled ? 0.5 : 1,
        boxShadow: checked ? 'inset 0 2px 4px rgba(0,0,0,0.1)' : 'inset 0 2px 4px rgba(3, 105, 161, 0.1)'
      }}
    >
      <div style={{
        width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#FFFFFF',
        position: 'absolute', top: '2px', left: checked ? '26px' : '2px',
        transition: 'left 0.3s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
      }}></div>
    </div>
  );
};

export default function SettingsSubpage() {
  const navigate = useNavigate();
  const [autoPlay, setAutoPlay] = useState(false);
  const [dailyReminder, setDailyReminder] = useState(true);
  const [streakWarning, setStreakWarning] = useState(true);

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px', paddingBottom: '100px' }}>
      
      {/* Header */}
      <header className="flex items-center gap-4">
        <div 
          onClick={() => navigate('/profile')}
          style={{
            width: '44px', height: '44px', borderRadius: '50%',
            backgroundColor: '#FFFFFF', color: '#0369A1',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
          }}
        >
          <ArrowLeft size={20} strokeWidth={2.5} />
        </div>
        <h1 style={{ fontSize: '2rem', color: 'var(--color-text-navy)', margin: 0, fontWeight: 800 }}>Settings</h1>
      </header>

      {/* LEARNING */}
      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 16px 0' }}>Learning preferences</h2>
        <div className="surface-card" style={{ padding: '0', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
          
          <div className="flex items-center justify-between" style={{ padding: '24px', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-ghost-blue)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
            <div className="flex items-center gap-16">
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, #7DD3FC 0%, #0369A1 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '20px', boxShadow: '0 4px 10px rgba(3, 105, 161, 0.3)' }}>
                <Target size={22} color="#FFFFFF" />
              </div>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>Daily goal</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', margin: 0 }}>30 cards</p>
              </div>
            </div>
            <ChevronRight size={24} color="var(--color-secondary-blue)" />
          </div>

          <div className="flex items-center justify-between" style={{ padding: '24px', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-ghost-blue)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
            <div className="flex items-center gap-16">
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, #A78BFA 0%, #6D28D9 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '20px', boxShadow: '0 4px 10px rgba(109, 40, 217, 0.3)' }}>
                <Globe size={22} color="#FFFFFF" />
              </div>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>Learning language</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', margin: 0 }}>Chinese</p>
              </div>
            </div>
            <ChevronRight size={24} color="var(--color-secondary-blue)" />
          </div>

          <div className="flex items-center justify-between" style={{ padding: '24px', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-ghost-blue)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
            <div className="flex items-center gap-16">
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, #FDBA74 0%, #EA580C 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '20px', boxShadow: '0 4px 10px rgba(234, 88, 12, 0.3)' }}>
                <Shuffle size={22} color="#FFFFFF" />
              </div>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>Card order</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', margin: 0 }}>Sequential</p>
              </div>
            </div>
            <ChevronRight size={24} color="var(--color-secondary-blue)" />
          </div>

          <div className="flex items-center justify-between" style={{ padding: '24px', cursor: 'pointer', transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-ghost-blue)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'} onClick={() => setAutoPlay(!autoPlay)}>
            <div className="flex items-center gap-16">
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, #F472B6 0%, #BE185D 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '20px', boxShadow: '0 4px 10px rgba(190, 24, 93, 0.3)' }}>
                <Volume2 size={22} color="#FFFFFF" />
              </div>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>Auto-play audio</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', margin: 0 }}>Speak words on flip</p>
              </div>
            </div>
            <ToggleSwitch checked={autoPlay} onChange={setAutoPlay} />
          </div>

        </div>
      </div>

      {/* NOTIFICATIONS */}
      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 16px 0' }}>Notifications</h2>
        <div className="surface-card" style={{ padding: '0', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
          
          <div className="flex items-center justify-between" style={{ padding: '24px', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-ghost-blue)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'} onClick={() => setDailyReminder(!dailyReminder)}>
            <div className="flex items-center gap-16">
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, #67E8F9 0%, #0E7490 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '20px', boxShadow: '0 4px 10px rgba(14, 116, 144, 0.3)' }}>
                <Bell size={22} color="#FFFFFF" />
              </div>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>Daily reminder</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', margin: 0 }}>Push notification to practice</p>
              </div>
            </div>
            <ToggleSwitch checked={dailyReminder} onChange={setDailyReminder} />
          </div>

          <div className="flex items-center justify-between" style={{ padding: '24px', cursor: 'pointer', transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-ghost-blue)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'} onClick={() => setStreakWarning(!streakWarning)}>
            <div className="flex items-center gap-16">
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, #FCA5A5 0%, #DC2626 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '20px', boxShadow: '0 4px 10px rgba(220, 38, 38, 0.3)' }}>
                <Flame size={22} color="#FFFFFF" />
              </div>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>Streak warning</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', margin: 0 }}>Alert before you lose streak</p>
              </div>
            </div>
            <ToggleSwitch checked={streakWarning} onChange={setStreakWarning} />
          </div>

        </div>
      </div>

    </div>
  );
}
