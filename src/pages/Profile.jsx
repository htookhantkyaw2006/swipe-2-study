import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Settings as SettingsIcon, Flame, BookOpen,
  LogOut, Trash2, Languages, Volume2, Crown, Sliders,
  FolderInput, AlertCircle, RefreshCw, KeyRound
} from 'lucide-react';
import { SettingsGroup, SettingsRow, ToggleSwitch, OptionSheet } from '../components/ui/SettingsControls';
import { LanguageSheet } from '../components/ui/LanguageSwitcher';
import { usePreferences, OPTIONS } from '../lib/preferences';
import { useLanguage, useCourse } from '../lib/language';
import { useAuth } from '../lib/useAuth.js';
import { useProfile, displayName, initialsOf } from '../lib/profile.js';
import { useAvatarUrl } from '../lib/useAvatarUrl.js';
import { db } from '../lib/db';
import { useGuestImport } from '../lib/useGuestImport.js';
import { storageOwner } from '../lib/storageOwner.js';
import { getSupabaseClient } from '../lib/supabase.js';
import { isAccountDeletionEnabled } from '../lib/accountDeletionGate.js';
import { sendDeletionRequest, removeOwnerLocalData, UNCONFIRMED_DELETION_GUIDANCE } from '../lib/accountDeletionClient.js';
import GlobalSignOutDialog from '../components/GlobalSignOutDialog.jsx';
import DeleteAccountDialog from '../components/DeleteAccountDialog.jsx';
import { useStudyStreak } from '../lib/studyStreak.js';
import { getCourseProgress } from '../lib/vocabularyProgress.js';

export default function Profile() {
  const navigate = useNavigate();
  const { prefs, setPref } = usePreferences();
  const { language } = useLanguage();
  const course = useCourse();
  const [languageSheet, setLanguageSheet] = useState(false);
  const [goalSheet, setGoalSheet] = useState(false);

  const {
    user,
    isGuest,
    loading: authLoading,
    isTransitioning,
    error: authError,
    retryVerification,
    signOut,
    signOutGlobal,
    captureGeneration,
    isCurrent
  } = useAuth();
  const { profile, loading: profileLoading, error: profileError, retry: retryProfile } = useProfile();
  const photo = useAvatarUrl(profile?.avatar_path);
  const guestImport = useGuestImport();
  const streak = useStudyStreak();

  const [swipedCount, setSwipedCount] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deletionError, setDeletionError] = useState(null);
  const [localCleanupError, setLocalCleanupError] = useState(false);
  const [deletionNotice, setDeletionNotice] = useState('');
  const [globalSignOutOpen, setGlobalSignOutOpen] = useState(false);
  const [globalSigningOut, setGlobalSigningOut] = useState(false);
  const [globalSignOutError, setGlobalSignOutError] = useState(null);
  const [targetAccountLabel, setTargetAccountLabel] = useState('');

  const authProviders = user?.app_metadata?.providers || (user?.app_metadata?.provider ? [user?.app_metadata.provider] : []);
  const authIdentities = Array.isArray(user?.identities) ? user.identities : [];
  const hasEmailAuth = authIdentities.some(i => i.provider === 'email') || authProviders.includes('email');
  const isOAuthOnly = Boolean(user && authProviders.length > 0 && !hasEmailAuth);
  const deletionEnabled = isAccountDeletionEnabled();

  const busy = authLoading || isTransitioning;

  const updateCounts = () => {
    try {
      const progress = getCourseProgress(db, course);
      setSwipedCount(progress.studiedCount ?? progress.uniqueSeen ?? progress.uniqueLearned ?? 0);
    } catch {
      setSwipedCount(0);
    }
  };

  useEffect(() => {
    updateCounts();
    const unsubChange = storageOwner.subscribeChange(updateCounts);
    const unsubOwner = storageOwner.subscribe(updateCounts);
    return () => {
      unsubChange?.();
      unsubOwner?.();
    };
  }, []);

  const name = authLoading ? 'Loading…' : user
    ? displayName(profileLoading ? null : profile, user)
    : 'Guest Learner';
  const email = user?.email || (isGuest ? 'Local learner' : '');
  const initials = initialsOf(name);

  const accountStorageNote = isGuest
    ? 'Guest words stay on this device.'
    : 'Saved words and review lists under your account are stored on this device.';

  const handleLogout = async () => {
    if (loggingOut || globalSigningOut || busy) return;
    setLoggingOut(true);
    setLogoutError('');
    try {
      const res = await signOut();
      if (res?.error) {
        setLogoutError(res.error?.message || 'Could not sign out. Please try again.');
      }
    } catch (err) {
      setLogoutError(err?.message || 'Could not sign out. Please try again.');
    } finally {
      setLoggingOut(false);
    }
  };

  const openGlobalSignOut = () => {
    if (loggingOut || globalSigningOut || busy) return;
    setTargetAccountLabel(user?.email || name || '');
    setGlobalSignOutError(null);
    setGlobalSignOutOpen(true);
  };

  const handleGlobalSignOut = async () => {
    if (globalSigningOut || loggingOut || busy) return;
    setGlobalSigningOut(true);
    setGlobalSignOutError(null);
    try {
      const result = await signOutGlobal();
      if (result?.error) {
        setGlobalSignOutError(result.error?.message || result.error?.guidance || 'Could not sign out on all devices. You have been signed out on this device.');
      } else {
        setGlobalSignOutOpen(false);
      }
    } catch (err) {
      setGlobalSignOutError(err?.message || 'Could not sign out on all devices.');
    } finally {
      setGlobalSigningOut(false);
    }
  };

  const openDeleteAccount = () => {
    if (loggingOut || globalSigningOut || deletingAccount || busy) return;
    setDeletionError(null);
    setLocalCleanupError(false);
    setDeleteDialogOpen(true);
  };

  const handleDeleteAccount = async ({ password }) => {
    if (deletingAccount || loggingOut || globalSigningOut || busy) return;
    const initiatingUserId = user?.id;
    const initiatingGen = captureGeneration ? captureGeneration() : 0;
    const isOperationCurrent = () => {
      const genOk = isCurrent ? isCurrent(initiatingGen) : true;
      return genOk && user?.id === initiatingUserId;
    };
    setDeletingAccount(true);
    setDeletionError(null);
    setLocalCleanupError(false);

    try {
      const client = getSupabaseClient();
      const result = await sendDeletionRequest({
        client,
        password,
        initiatingUserId,
        isCurrent: isOperationCurrent,
      });

      // Guard against account switch during in-flight request
      const isCurrentSession = isCurrent ? isCurrent(initiatingGen) : true;
      if (!isCurrentSession || user?.id !== initiatingUserId) {
        setDeletingAccount(false);
        if (result.status === 'confirmed_deleted') {
          try { removeOwnerLocalData(initiatingUserId); } catch {}
        }
        return;
      }

      if (result.status === 'confirmed_deleted') {
        let cleanupSucceeded = false;
        try {
          removeOwnerLocalData(initiatingUserId);
          cleanupSucceeded = true;
        } catch {
          cleanupSucceeded = false;
        }

        if (!cleanupSucceeded) {
          setDeletingAccount(false);
          setLocalCleanupError(true);
          setDeletionError('Your account was deleted on the server, but local cached data could not be completely cleared.');
          return;
        }

        setDeletingAccount(false);
        setDeleteDialogOpen(false);
        setDeletionNotice('Your account has been deleted. You are now in guest mode.');
        storageOwner.setOwner(null);
        await signOut();
        navigate('/');
        return;
      }

      setDeletingAccount(false);
      setDeletionError(result.message || 'Account deletion failed.');
    } catch {
      setDeletingAccount(false);
      setDeletionError(UNCONFIRMED_DELETION_GUIDANCE);
    }
  };

  const handleRetryLocalCleanup = async () => {
    if (deletingAccount || !localCleanupError) return;
    const initiatingUserId = user?.id;
    if (!initiatingUserId) return;
    setDeletingAccount(true);
    setDeletionError(null);

    let cleanupSucceeded = false;
    try {
      removeOwnerLocalData(initiatingUserId);
      cleanupSucceeded = true;
    } catch {
      cleanupSucceeded = false;
    }

    setDeletingAccount(false);
    if (cleanupSucceeded) {
      setLocalCleanupError(false);
      setDeleteDialogOpen(false);
      setDeletionNotice('Your account has been deleted. You are now in guest mode.');
      storageOwner.setOwner(null);
      await signOut();
      navigate('/');
    } else {
      setDeletionError('Could not clear device storage. Please try again.');
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '800px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '120px' }}>

      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-primary-blue)', letterSpacing: '1px', textTransform: 'uppercase' }}>
            YOUR IDENTITY
          </span>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '4px 0 0 0' }}>
            Profile
          </h1>
        </div>
        <button
          onClick={() => navigate('/settings')}
          aria-label="Settings"
          style={{
            width: '44px', height: '44px', borderRadius: '50%',
            backgroundColor: 'var(--color-sky-accent)', color: '#FFFFFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(56, 189, 248, 0.3)',
            cursor: 'pointer', transition: 'transform 0.1s'
          }}
          onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
          onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <SettingsIcon size={20} />
        </button>
      </header>

      {deletionNotice && (
        <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', color: '#16A34A', padding: '12px 16px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }} role="status">
          <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{deletionNotice}</span>
          <button type="button" onClick={() => setDeletionNotice('')} style={{ background: 'transparent', color: '#16A34A', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer' }}>Dismiss</button>
        </div>
      )}

      {logoutError && (
        <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#EF4444', padding: '12px 16px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }} role="alert">
          <span style={{ fontSize: '0.875rem' }}>{logoutError}</span>
          <button type="button" onClick={() => setLogoutError('')} style={{ background: 'transparent', color: '#EF4444', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer' }}>Dismiss</button>
        </div>
      )}

      {authError && (
        <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#EF4444', padding: '12px 16px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }} role="alert">
          <span style={{ fontSize: '0.875rem' }}>{authError}</span>
          {retryVerification && (
            <button type="button" onClick={retryVerification} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', color: '#EF4444', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer' }}>
              <RefreshCw size={14} /> Retry
            </button>
          )}
        </div>
      )}

      {profileError && (
        <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#EF4444', padding: '12px 16px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={20} />
            <span style={{ fontSize: '0.875rem' }}>Failed to load profile</span>
          </div>
          <button onClick={retryProfile} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', color: '#EF4444', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer' }}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      {/* Identity Card */}
      <div className="surface-card" aria-label="Learning overview" style={{ padding: '24px', borderRadius: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', position: 'relative', zIndex: 1 }}>
          {photo.url ? (
            <img
              src={photo.url}
              alt={name}
              style={{ width: '64px', height: '64px', borderRadius: '18px', objectFit: 'cover', boxShadow: '0 8px 16px rgba(91, 33, 182, 0.4)' }}
            />
          ) : (
            <div style={{
              width: '64px', height: '64px', borderRadius: '18px',
              background: 'linear-gradient(135deg, #C4B5FD 0%, #5B21B6 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#FFFFFF', fontSize: '1.5rem', fontWeight: 800,
              boxShadow: '0 8px 16px rgba(91, 33, 182, 0.4)'
            }}>
              {initials}
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {name}
              </h2>
              {user && (
                <Link to="/profile/edit" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary-blue)', padding: '4px 10px', borderRadius: '8px', background: 'var(--color-ghost-blue)' }}>
                  Edit
                </Link>
              )}
            </div>
            {email && (
              <p style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', margin: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {email}
              </p>
            )}
            <p style={{ fontSize: '0.75rem', color: 'var(--color-secondary-blue)', margin: '4px 0 0 0' }}>
              {accountStorageNote}
            </p>
          </div>
        </div>

        {/* 2 Stat Cards inside */}
        <div style={{ display: 'flex', gap: '12px', position: 'relative', zIndex: 1 }}>
          <div style={{ flex: 1, backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: '16px', padding: '12px 16px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
              <Flame size={14} color="#EA580C" strokeWidth={3} />
              <span style={{ fontSize: '0.7rem', color: 'var(--color-secondary-blue)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>Streak</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-navy)', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              {streak?.currentStreak ?? 0} <span style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', fontWeight: 600 }}>days</span>
            </div>
          </div>

          <div style={{ flex: 1, backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: '16px', padding: '12px 16px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
              <BookOpen size={14} color="#0369A1" strokeWidth={3} />
              <span style={{ fontSize: '0.7rem', color: 'var(--color-secondary-blue)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>Swiped</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-navy)', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              {swipedCount} <span style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', fontWeight: 600 }}>cards</span>
            </div>
          </div>
        </div>

        {/* Big Watermark */}
        <div style={{ position: 'absolute', right: '-20px', bottom: '-40px', fontSize: '12rem', color: 'var(--color-ghost-blue)', fontWeight: 800, opacity: 0.5, zIndex: 0, pointerEvents: 'none', lineHeight: 1 }}>
          {course.copy?.heroWatermark || '我'}
        </div>
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
      <SettingsGroup title="Settings & support">
        <SettingsRow
          icon={Languages}
          iconGradient="linear-gradient(135deg, #7DD3FC 0%, #0369A1 100%)"
          title="Learning language"
          subtitle={`${language.levelSystem} levels`}
          value={`${language.flag} ${language.name}`}
          onClick={() => setLanguageSheet(true)}
        />
        <SettingsRow
          icon={Sliders}
          iconGradient="linear-gradient(135deg, #86EFAC 0%, #16A34A 100%)"
          title="Learning settings"
          subtitle="Course language, audio, and display"
          onClick={() => navigate('/settings')}
        />
        <SettingsRow
          icon={Volume2}
          iconGradient="linear-gradient(135deg, #D8B4FE 0%, #9333EA 100%)"
          title="Auto-play pronunciation"
          subtitle="Speak each card as it is revealed"
          control={<ToggleSwitch checked={prefs.autoPlayAudio} onChange={(v) => setPref('autoPlayAudio', v)} label="Auto-play pronunciation" />}
        />
        {guestImport?.available && (
          <SettingsRow
            icon={FolderInput}
            iconGradient="linear-gradient(135deg, #FDBA74 0%, #EA580C 100%)"
            title="Import guest learning"
            subtitle="Merge earlier guest words on this device"
            onClick={guestImport.openGuestImport}
          />
        )}
      </SettingsGroup>

      {/* Session & account danger section */}
      <SettingsGroup title="Session & account" className="profile-group--danger">
        {user ? (
          <>
            <SettingsRow
              icon={LogOut}
              iconGradient="linear-gradient(135deg, #FCA5A5 0%, #DC2626 100%)"
              title="Log out"
              subtitle="Sign out on this device"
              onClick={handleLogout}
            />
            <SettingsRow
              icon={KeyRound}
              iconGradient="linear-gradient(135deg, #FDBA74 0%, #EA580C 100%)"
              title="Sign out on all devices"
              subtitle="Revoke all active sessions"
              onClick={openGlobalSignOut}
            />
            {deletionEnabled ? (
              <SettingsRow
                icon={Trash2}
                iconGradient="linear-gradient(135deg, #FCA5A5 0%, #DC2626 100%)"
                title="Delete account"
                subtitle="Permanently erase account and data"
                danger
                onClick={openDeleteAccount}
                isLast
              />
            ) : (
              <SettingsRow
                icon={Trash2}
                iconGradient="linear-gradient(135deg, #94A3B8 0%, #64748B 100%)"
                title={<>Delete account <span className="profile-soon" style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748B', backgroundColor: '#F1F5F9', padding: '2px 8px', borderRadius: '999px', marginLeft: '6px' }}>Soon</span></>}
                subtitle="Available in a later update"
                isLast
              />
            )}
          </>
        ) : (
          <SettingsRow
            icon={LogOut}
            iconGradient="linear-gradient(135deg, #7DD3FC 0%, #0369A1 100%)"
            title="Sign in or create account"
            subtitle="Sync your learning progress across devices"
            onClick={() => navigate('/login')}
            isLast
          />
        )}
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

      <DeleteAccountDialog
        open={deleteDialogOpen}
        pending={deletingAccount}
        error={deletionError}
        isOAuthOnly={isOAuthOnly}
        localCleanupError={localCleanupError}
        accountLabel={user?.email || name || ''}
        onConfirm={handleDeleteAccount}
        onRetryCleanup={handleRetryLocalCleanup}
        onClose={() => {
          if (!deletingAccount) {
            setDeleteDialogOpen(false);
            setDeletionError(null);
            setLocalCleanupError(false);
          }
        }}
      />
      <GlobalSignOutDialog
        open={globalSignOutOpen}
        pending={globalSigningOut}
        error={globalSignOutError}
        accountLabel={targetAccountLabel || user?.email || name || ''}
        onConfirm={handleGlobalSignOut}
        onClose={() => {
          if (!globalSigningOut) {
            setGlobalSignOutOpen(false);
            setGlobalSignOutError(null);
          }
        }}
      />
    </div>
  );
}
