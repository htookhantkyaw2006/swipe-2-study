import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, Bookmark, RotateCw, LogOut, Trash2, Languages, Target, Volume2, Crown, User, LogIn, AlertCircle, RefreshCw, ChevronRight, MessageSquare } from 'lucide-react';
import { usePreferences, OPTIONS } from '../lib/preferences';
import { useLanguage } from '../lib/language';
import { useAuth } from '../lib/useAuth.js';
import { useProfile, displayName, initialsOf } from '../lib/profile.js';
import { db } from '../lib/db';
import '../components/study/StudyPage.css';
import './Profile.css';

function ProfileError({ children, onRetry, label }) {
  return <div className="profile-error" role="alert"><AlertCircle size={20} aria-hidden="true" /><p>{children}</p><button onClick={onRetry} aria-label={label}><RefreshCw size={16} aria-hidden="true" />Retry</button></div>;
}

function ProfileLink({ to, icon: Icon, title, subtitle }) {
  return <Link className="profile-setting profile-setting--link" to={to}><span className="profile-setting__icon"><Icon size={21} aria-hidden="true" /></span><span className="profile-setting__copy"><strong>{title}</strong><span>{subtitle}</span></span><ChevronRight size={20} aria-hidden="true" /></Link>;
}

export default function Profile() {
  const { prefs, setPref } = usePreferences();
  const { language, languages, setLanguage } = useLanguage();
  const { user, loading: authLoading, isTransitioning, error: authError, retryVerification, signOut } = useAuth();
  const { profile, loading: profileLoading, error: profileError, retry } = useProfile();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const busy = authLoading || isTransitioning;
  const name = user ? displayName(profile, user) : 'Guest Learner';
  const savedCount = db.get('saved_words').length;
  const reviewCount = db.get('review_cards').length;

  const handleLogout = async () => {
    if (loggingOut || busy) return;
    setLoggingOut(true);
    setLogoutError('');
    try { await signOut(); }
    catch (error) { setLogoutError(error?.message || 'Could not sign out. Please try again.'); }
    finally { setLoggingOut(false); }
  };

  return (
    <div className="study-page profile-page">
      <header className="profile-header"><div><p>Your learning space</p><h1>Profile</h1></div><Link className="study-icon-button" to="/settings" aria-label="Open all settings"><Settings size={21} aria-hidden="true" /></Link></header>
      <div className="profile-layout">
        <aside className="profile-summary" aria-label="Account overview">
          <section className="profile-account" aria-busy={busy || profileLoading}>
            <div className="profile-identity">
              <div className="profile-avatar" aria-hidden="true">{user && /^[A-Za-z0-9]/.test(name) ? initialsOf(name) : <User size={28} />}</div>
              <div className="profile-identity__copy"><p className="study-eyebrow">{busy ? 'Connecting account' : user ? 'Signed in' : 'Guest mode'}</p><h2>{busy ? 'Loading…' : name}</h2><p>{busy ? 'Please wait a moment.' : user?.email || 'Learning on this device'}</p></div>
            </div>
            {!user && !busy && <div className="profile-signin"><p>Sign in to use your account. Guest words stay on this device.</p><div><Link className="btn-primary" to="/login">Sign in</Link><Link className="btn-secondary" to="/signup">Create account</Link></div></div>}
            {user && !busy && <p className="profile-local-note">Saved words and review lists are stored on this device.</p>}
            {profileError && <ProfileError onRetry={retry} label="Retry profile">Could not load your profile.</ProfileError>}
            {authError && <ProfileError onRetry={retryVerification} label="Retry account verification">{authError}</ProfileError>}
            {logoutError && <ProfileError onRetry={handleLogout} label="Retry sign out">{logoutError}</ProfileError>}
          </section>
          <section className="profile-collection" aria-label={`${language.name} collections`}>
            <h2>{language.name} collections</h2>
            <div className="profile-counts"><Link to="/saved"><Bookmark size={20} aria-hidden="true" /><strong>{savedCount}</strong><span>Saved words</span></Link><Link to="/learn/review"><RotateCw size={20} aria-hidden="true" /><strong>{reviewCount}</strong><span>To review</span></Link></div>
          </section>
          <div className="profile-plan"><span className="profile-setting__icon"><Crown size={22} aria-hidden="true" /></span><div><strong>Free plan</strong><p>Learn at your own pace.</p></div><Link className="study-text-link" to="/premium">View plans</Link></div>
        </aside>

        <div className="profile-sections">
          <section className="profile-group" aria-labelledby="profile-quick-title"><h2 id="profile-quick-title">Quick settings</h2><div className="profile-group__surface">
            <div className="profile-setting profile-setting--select"><span className="profile-setting__icon"><Languages size={21} aria-hidden="true" /></span><label className="profile-setting__copy" htmlFor="profile-language"><strong>Learning language</strong><span>Choose your course</span></label><select id="profile-language" aria-label="Learning language" value={language.id} disabled={busy} onChange={event => setLanguage(event.target.value)}>{languages.map(item => <option key={item.id} value={item.id} disabled={item.status !== 'active'}>{item.name}</option>)}</select></div>
            <div className="profile-setting profile-setting--select"><span className="profile-setting__icon"><Target size={21} aria-hidden="true" /></span><label className="profile-setting__copy" htmlFor="profile-goal"><strong>Daily goal</strong><span>Cards to aim for each day</span></label><select id="profile-goal" aria-label="Daily goal" value={prefs.dailyGoal} disabled={busy} onChange={event => setPref('dailyGoal', Number(event.target.value))}>{OPTIONS.dailyGoal.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
            <label className="profile-setting profile-setting--toggle"><span className="profile-setting__icon"><Volume2 size={21} aria-hidden="true" /></span><span className="profile-setting__copy"><strong>Auto-play pronunciation</strong><span>Speak each new flashcard</span></span><input className="profile-switch" type="checkbox" role="switch" aria-label="Auto-play pronunciation" checked={prefs.autoPlayAudio} disabled={busy} onChange={event => setPref('autoPlayAudio', event.target.checked)} /></label>
            <ProfileLink to="/settings" icon={Settings} title="All settings" subtitle="Display, audio, data and more" />
          </div></section>
          <section className="profile-group" aria-labelledby="profile-actions-title"><h2 id="profile-actions-title">Account & support</h2><div className="profile-group__surface">
            {user ? <button className="profile-setting profile-setting--logout" onClick={handleLogout} disabled={loggingOut || busy}><span className="profile-setting__icon"><LogOut size={21} aria-hidden="true" /></span><span className="profile-setting__copy"><strong>{loggingOut ? 'Logging out…' : 'Log out'}</strong><span>Switch back to guest mode</span></span></button> : <ProfileLink to="/login" icon={LogIn} title="Sign in or register" subtitle="Use your account" />}
            <div className="profile-setting"><span className="profile-setting__icon"><MessageSquare size={21} aria-hidden="true" /></span><span className="profile-setting__copy"><strong>Send feedback</strong><span>Help improve Swipe 2 Study</span></span><span className="profile-soon">Soon</span></div>
            <div className="profile-setting"><span className="profile-setting__icon"><Trash2 size={21} aria-hidden="true" /></span><span className="profile-setting__copy"><strong>Delete account</strong><span>Available in a later update</span></span><span className="profile-soon">Soon</span></div>
          </div></section>
        </div>
      </div>
    </div>
  );
}
