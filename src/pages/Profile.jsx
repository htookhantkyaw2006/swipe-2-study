import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings as SettingsIcon, Flame, BookOpen, MessageSquare,
  LogOut, Trash2, Languages, Target, Volume2
} from 'lucide-react';
import { SettingsGroup, SettingsRow, ToggleSwitch, OptionSheet } from '../components/ui/SettingsControls';
import { LanguageSheet } from '../components/ui/LanguageSwitcher';
import { usePreferences, OPTIONS } from '../lib/preferences';
import { useLanguage } from '../lib/language';

export default function Profile() {
  const navigate = useNavigate();
  const { prefs, setPref } = usePreferences();
  const { language } = useLanguage();
  const [languageSheet, setLanguageSheet] = useState(false);
  const [goalSheet, setGoalSheet] = useState(false);

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

      {/* Quick settings — the handful worth reaching without a detour.
          Same store as the Settings page, so the two cannot disagree. */}
      <SettingsGroup title="Quick settings">
        <SettingsRow
          icon={Languages}
          iconGradient="linear-gradient(135deg, #7DD3FC 0%, #0369A1 100%)"
          title="Learning language"
          subtitle={`${language.levelSystem} levels`}
          value={`${language.flag} ${language.name}`}
          onClick={() => setLanguageSheet(true)}
        />
        <SettingsRow
          icon={Target}
          iconGradient="linear-gradient(135deg, #86EFAC 0%, #16A34A 100%)"
          title="Daily goal"
          subtitle="Cards to aim for each day"
          value={OPTIONS.dailyGoal.find((o) => o.value === prefs.dailyGoal)?.label}
          onClick={() => setGoalSheet(true)}
        />
        <SettingsRow
          icon={Volume2}
          iconGradient="linear-gradient(135deg, #D8B4FE 0%, #9333EA 100%)"
          title="Auto-play pronunciation"
          subtitle="Speak each card as it is revealed"
          control={<ToggleSwitch checked={prefs.autoPlayAudio} onChange={(v) => setPref('autoPlayAudio', v)} />}
        />
        <SettingsRow
          icon={SettingsIcon}
          iconGradient="linear-gradient(135deg, #94A3B8 0%, #334155 100%)"
          title="All settings"
          subtitle="Display, audio, data and more"
          onClick={() => navigate('/settings')}
          isLast
        />
      </SettingsGroup>

      {/* Support & Actions — same shared rows as Quick settings above,
          so icon size, padding and type scale stay consistent. */}
      <SettingsGroup title="Support & Actions">
        <SettingsRow
          icon={MessageSquare}
          iconGradient="linear-gradient(135deg, #67E8F9 0%, #0E7490 100%)"
          title="Send feedback"
          subtitle="Report an issue or suggest a feature"
          onClick={() => navigate('/settings')}
        />
        <SettingsRow
          icon={LogOut}
          iconGradient="linear-gradient(135deg, #FCA5A5 0%, #DC2626 100%)"
          title="Log out"
          onClick={() => window.alert('Log out is not connected yet — there is no auth system.')}
        />
        <SettingsRow
          icon={Trash2}
          iconGradient="linear-gradient(135deg, #FCA5A5 0%, #DC2626 100%)"
          title="Delete account"
          subtitle="This cannot be undone"
          onClick={() => window.alert('Delete account is not connected yet — there is no auth system.')}
          danger
          isLast
        />
      </SettingsGroup>

      {languageSheet && <LanguageSheet onClose={() => setLanguageSheet(false)} />}
      {goalSheet && (
        <OptionSheet
          title="Daily goal"
          options={OPTIONS.dailyGoal}
          selected={prefs.dailyGoal}
          onSelect={(value) => setPref('dailyGoal', value)}
          onClose={() => setGoalSheet(false)}
        />
      )}

    </div>
  );
}
