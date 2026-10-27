import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings as SettingsIcon, Flame, BookOpen, MessageSquare,
  LogOut, Trash2, Languages, Target, Volume2, Crown,
  User as UserIcon, LogIn, AlertCircle, RefreshCw
} from 'lucide-react';
import { SettingsGroup, SettingsRow, ToggleSwitch, OptionSheet } from '../components/ui/SettingsControls';
import { LanguageSheet } from '../components/ui/LanguageSwitcher';
import { usePreferences, OPTIONS } from '../lib/preferences';
import { useLanguage, useCourse } from '../lib/language';
import { useAuth } from '../lib/auth.jsx';
import { useProfile, displayName, initialsOf } from '../lib/profile.js';

export default function Profile() {
  const navigate = useNavigate();
  const { prefs, setPref } = usePreferences();
  const { language } = useLanguage();
  const course = useCourse();
  const { user, loading: authLoading, signOut } = useAuth();
  const { profile, loading: profileLoading, error: profileError, retry } = useProfile();
  const [loggingOut, setLoggingOut] = useState(false);
  const [languageSheet, setLanguageSheet] = useState(false);
  const [goalSheet, setGoalSheet] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await signOut();
    } finally {
      setLoggingOut(false);
    }
  };

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
          aria-label="Settings"
          role="button"
          tabIndex={0}
        >
          <SettingsIcon size={20} />
        </div>
      </header>

      {/* Hero Stats Card */}
      <div className="surface-card" style={{ padding: '24px', borderRadius: '24px', position: 'relative', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
        {authLoading ? (
          <div className="flex items-center gap-16" style={{ position: 'relative', zIndex: 1, marginBottom: '24px' }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '18px',
              background: 'var(--color-ghost-blue)', marginRight: '20px',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <UserIcon size={32} color="var(--color-secondary-blue)" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>Loading…</h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', margin: 0, fontWeight: 500 }}>Connecting account</p>
            </div>
          </div>
        ) : user ? (
          <>
            <div className="flex justify-between items-start" style={{ position: 'relative', zIndex: 1, marginBottom: profileError ? '12px' : '24px' }}>
              <div className="flex items-center gap-16" style={{ minWidth: 0 }}>
                <div style={{
                  width: '64px', height: '64px', borderRadius: '18px',
                  background: 'linear-gradient(135deg, #7DD3FC 0%, #0369A1 100%)',
                  color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.5rem', fontWeight: 800, marginRight: '20px', flexShrink: 0,
                  boxShadow: '0 8px 16px rgba(3, 105, 161, 0.25)'
                }}>
                  {initialsOf(displayName(profile, user))}
                </div>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0', wordBreak: 'break-word' }}>
                    {profileLoading ? 'Loading…' : displayName(profile, user)}
                  </h2>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', margin: 0, fontWeight: 500, wordBreak: 'break-all' }}>
                    {user.email || 'Connected account'}
                  </p>
                </div>
              </div>
            </div>

            {profileError && (
              <div style={{
                position: 'relative',
                zIndex: 1,
                marginBottom: '20px',
                padding: '10px 14px',
                borderRadius: '12px',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#B91C1C',
                fontSize: '0.8125rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span>Could not load cloud profile</span>
                </div>
                <button
                  type="button"
                  onClick={retry}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #FCA5A5',
                    color: '#B91C1C',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.75rem',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    flexShrink: 0
                  }}
                >
                  <RefreshCw size={12} />
                  <span>Retry</span>
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex justify-between items-start" style={{ position: 'relative', zIndex: 1, marginBottom: '16px' }}>
              <div className="flex items-center gap-16" style={{ minWidth: 0 }}>
                <div style={{
                  width: '64px', height: '64px', borderRadius: '18px',
                  background: 'linear-gradient(135deg, #E0F2FE 0%, #BAE6FD 100%)',
                  color: 'var(--color-primary-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.5rem', fontWeight: 800, marginRight: '20px', flexShrink: 0,
                  boxShadow: '0 8px 16px rgba(3, 105, 161, 0.1)'
                }}>
                  <UserIcon size={32} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0' }}>
                    Guest Learner
                  </h2>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', margin: 0, fontWeight: 500 }}>
                    Local session · Device only
                  </p>
                </div>
              </div>
            </div>

            <div style={{
              position: 'relative',
              zIndex: 1,
              marginBottom: '20px',
              padding: '14px 16px',
              background: 'var(--color-ghost-blue)',
              borderRadius: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-navy)', margin: 0, lineHeight: 1.4, fontWeight: 500 }}>
                Connect an account to preserve and access your profile across devices.
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  className="btn-primary"
                  onClick={() => navigate('/login')}
                  style={{ padding: '8px 18px', fontSize: '0.875rem', borderRadius: '10px' }}
                >
                  Sign In
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => navigate('/signup')}
                  style={{ padding: '8px 18px', fontSize: '0.875rem', borderRadius: '10px' }}
                >
                  Create Account
                </button>
              </div>
            </div>
          </>
        )}

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
              {course.demo ? course.demo.profileSwiped : 0} <span style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', fontWeight: 600 }}>cards</span>
            </div>
          </div>

        </div>

        {/* Big Watermark */}
        <div style={{ position: 'absolute', right: '-20px', bottom: '-40px', fontSize: '12rem', color: 'var(--color-ghost-blue)', fontWeight: 800, opacity: 0.5, zIndex: 0, pointerEvents: 'none', lineHeight: 1 }}>我</div>
      </div>

      {/* Subscription */}
      <SettingsGroup title="Subscription">
        <SettingsRow
          icon={Crown}
          iconGradient="linear-gradient(135deg, #38BDF8 0%, #0369A1 100%)"
          title="S2S Premium"
          subtitle={course.copy.premium.planSubtitle}
          value="Free plan"
          onClick={() => navigate('/premium')}
          isLast
        />
      </SettingsGroup>

      {/* Quick settings */}
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

      {/* Support & Actions */}
      <SettingsGroup title="Support & Actions">
        <SettingsRow
          icon={MessageSquare}
          iconGradient="linear-gradient(135deg, #67E8F9 0%, #0E7490 100%)"
          title="Send feedback"
          subtitle="Report an issue or suggest a feature"
          onClick={() => navigate('/settings')}
        />
        {user ? (
          <SettingsRow
            icon={LogOut}
            iconGradient="linear-gradient(135deg, #FCA5A5 0%, #DC2626 100%)"
            title={loggingOut ? 'Logging out…' : 'Log out'}
            subtitle="Switch back to guest mode"
            onClick={handleLogout}
          />
        ) : (
          <SettingsRow
            icon={LogIn}
            iconGradient="linear-gradient(135deg, #7DD3FC 0%, #0369A1 100%)"
            title="Sign in or register"
            subtitle="Connect your account"
            onClick={() => navigate('/login')}
          />
        )}
        <SettingsRow
          icon={Trash2}
          iconGradient="linear-gradient(135deg, #FCA5A5 0%, #DC2626 100%)"
          title="Delete account"
          subtitle="Account deletion will be available in a later update"
          onClick={() => window.alert('Account deletion is scheduled for a subsequent release.')}
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
