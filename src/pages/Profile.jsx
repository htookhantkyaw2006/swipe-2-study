import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Bookmark,
  RotateCw,
  Flame,
  CheckCircle2,
  LogOut,
  Trash2,
  User,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  FolderInput,
  HelpCircle,
  Info,
  Settings,
} from 'lucide-react';
import { useLanguage } from '../lib/language';
import { useAuth } from '../lib/useAuth.js';
import { useProfile, displayName, initialsOf } from '../lib/profile.js';
import { useAvatarUrl } from '../lib/useAvatarUrl.js';
import Avatar from '../components/ui/Avatar';
import { db } from '../lib/db';
import { useGuestImport } from '../lib/useGuestImport.js';
import { storageOwner } from '../lib/storageOwner.js';
import { getSupabaseClient } from '../lib/supabase.js';
import { isAccountDeletionEnabled } from '../lib/accountDeletionGate.js';
import { sendDeletionRequest, removeOwnerLocalData, UNCONFIRMED_DELETION_GUIDANCE } from '../lib/accountDeletionClient.js';
import GlobalSignOutDialog from '../components/GlobalSignOutDialog.jsx';
import { useStudyStreak } from '../lib/studyStreak.js';
import { getLearnedWords } from '../lib/vocabularyProgress.js';
import { useOnlineSync } from '../lib/onlineSyncContext.js';
import DeleteAccountDialog from '../components/DeleteAccountDialog.jsx';
import '../components/study/StudyPage.css';
import './Profile.css';

function ProfileError({ children, onRetry, label }) {
  return (
    <div className="profile-error" role="alert">
      <AlertCircle size={20} aria-hidden="true" />
      <p>{children}</p>
      <button onClick={onRetry} aria-label={label}>
        <RefreshCw size={16} aria-hidden="true" />Retry
      </button>
    </div>
  );
}

function ProfileLink({ to, icon: Icon, title, subtitle }) {
  return (
    <Link className="profile-setting profile-setting--link" to={to}>
      <span className="profile-setting__icon"><Icon size={21} aria-hidden="true" /></span>
      <span className="profile-setting__copy">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </span>
      <ChevronRight size={20} aria-hidden="true" />
    </Link>
  );
}

export default function Profile() {
  const { language } = useLanguage();
  const { user, loading: authLoading, isTransitioning, error: authError, retryVerification, signOut, signOutGlobal, captureGeneration, isCurrent } = useAuth();
  const { profile, loading: profileLoading, error: profileError, retry } = useProfile();
  const photo = useAvatarUrl(profile?.avatar_path);
  const guestImport = useGuestImport();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [globalSignOutOpen, setGlobalSignOutOpen] = useState(false);
  const [globalSigningOut, setGlobalSigningOut] = useState(false);
  const [globalSignOutError, setGlobalSignOutError] = useState(null);
  const [targetAccountLabel, setTargetAccountLabel] = useState('');
  const deletionEnabled = isAccountDeletionEnabled();
  const authProviders = user?.app_metadata?.providers || (user?.app_metadata?.provider ? [user?.app_metadata.provider] : []);
  const authIdentities = Array.isArray(user?.identities) ? user.identities : [];
  const hasEmailAuth = authIdentities.some(i => i.provider === 'email') || authProviders.includes('email');
  const isOAuthOnly = Boolean(user && authProviders.length > 0 && !hasEmailAuth);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deletionError, setDeletionError] = useState(null);
  const [localCleanupError, setLocalCleanupError] = useState(false);
  const [deletionNotice, setDeletionNotice] = useState('');
  const [, retryCollections] = useState(0);
  const [, setCollectionVersion] = useState(0);
  const { status: syncStatus } = useOnlineSync();
  const streak = useStudyStreak();

  const accountStorageNote = (() => {
    if (syncStatus === 'saved') {
      return 'Saved words and review lists are synced with your account and saved on this device.';
    }
    if (syncStatus === 'syncing') {
      return 'Syncing your saved words and review lists with your account…';
    }
    if (syncStatus === 'failed') {
      return 'Account sync is unavailable. Saved words and review lists are kept on this device.';
    }
    if (syncStatus === 'conflict') {
      return 'Sync conflict pending resolution. Words are kept on this device.';
    }
    return 'Saved words and review lists are stored on this device under your account.';
  })();

  useEffect(() => {
    const unsubOwner = storageOwner.subscribe(() => setCollectionVersion(v => v + 1));
    const unsubChange = storageOwner.subscribeChange(() => setCollectionVersion(v => v + 1));
    return () => {
      unsubOwner?.();
      unsubChange?.();
    };
  }, []);

  const busy = authLoading || isTransitioning;
  const name = user ? displayName(profile, user) : 'Guest Learner';
  let savedCount = null;
  let reviewCount = null;
  let learnedCount = null;
  let collectionError = false;
  try {
    savedCount = db.get('saved_words').length;
    reviewCount = db.get('review_cards').length;
    const learnedRows = getLearnedWords(db, language.id);
    const uniqueLearned = new Set();
    for (const row of learnedRows) {
      if (row.status === 'known' && (row.character || row.written)) {
        uniqueLearned.add(`${row.character || row.written}:${row.pronunciation || ''}`.toLowerCase());
      }
    }
    learnedCount = uniqueLearned.size;
  } catch { collectionError = true; }

  const handleLogout = async () => {
    if (loggingOut || globalSigningOut || busy) return;
    setLoggingOut(true);
    setLogoutError('');
    try {
      const res = await signOut();
      if (res?.error) {
        setLogoutError(res.error?.message || 'Could not sign out. Please try again.');
      }
    }
    catch (error) { setLogoutError(error?.message || 'Could not sign out. Please try again.'); }
    finally { setLoggingOut(false); }
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
        setGlobalSignOutError(result.error?.message || 'Could not sign out on all devices. You have been signed out on this device.');
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
    } else {
      setDeletionError('Could not clear device storage. Please try again.');
    }
  };

  return (
    <div className="study-page profile-page">
      <header className="profile-header">
        <div>
          <p>Your learning space</p>
          <h1>Profile</h1>
        </div>
      </header>

      <div className="profile-container">
        {deletionNotice && (
          <div className="profile-deletion-notice" role="status">
            <p>{deletionNotice}</p>
            <button type="button" onClick={() => setDeletionNotice('')} aria-label="Dismiss notice">Dismiss</button>
          </div>
        )}

        {/* Section A: Account identity */}
        <section className="profile-account" aria-busy={busy || profileLoading}>
          <div className="profile-identity">
            {photo.url ? (
              <Avatar src={photo.url} size={56} alt="Your profile photo" />
            ) : (
              <div className="profile-avatar" aria-hidden="true">
                {user && /^[A-Za-z0-9]/.test(name) ? initialsOf(name) : <User size={28} />}
              </div>
            )}
            <div className="profile-identity__copy">
              <p className="study-eyebrow">{busy ? 'Connecting account' : user ? 'Signed in' : 'Guest mode'}</p>
              <h2>{busy ? 'Loading…' : name}</h2>
              <p>{busy ? 'Please wait a moment.' : user?.email || 'Learning on this device'}</p>
            </div>
          </div>

          {!user && !busy && (
            <div className="profile-signin">
              <p>Sign in to use your account. Guest words stay on this device.</p>
              <div className="profile-signin__actions">
                <Link className="btn-primary" to="/login">Sign in</Link>
                <Link className="btn-secondary" to="/signup">Create account</Link>
              </div>
            </div>
          )}

          {user && !busy && (
            <div className="profile-account__actions">
              <Link className="profile-edit-btn" to="/profile/edit">
                Edit profile
              </Link>
              <p className="profile-local-note">{accountStorageNote}</p>
            </div>
          )}

          {profileError && <ProfileError onRetry={retry} label="Retry profile">Could not load your profile.</ProfileError>}
          {photo.error && <ProfileError onRetry={photo.retry} label="Retry profile photo">{photo.error}</ProfileError>}
          {authError && <ProfileError onRetry={retryVerification} label="Retry account verification">{authError}</ProfileError>}
          {logoutError && <ProfileError onRetry={handleLogout} label="Retry sign out">{logoutError}</ProfileError>}
        </section>

        {/* Section B: Learning overview */}
        <section className="profile-learning-card" aria-label={`${language.name} learning overview`}>
          <div className="profile-learning-header">
            <h2>Learning overview</h2>
          </div>
          <div className="profile-learning-grid">
            <Link className="profile-stat-box" to="/saved">
              <span className="profile-stat-icon"><Bookmark size={20} aria-hidden="true" /></span>
              <strong>{savedCount ?? '—'}</strong>
              <span>Saved words</span>
            </Link>
            <Link className="profile-stat-box" to="/learn/review">
              <span className="profile-stat-icon"><RotateCw size={20} aria-hidden="true" /></span>
              <strong>{reviewCount ?? '—'}</strong>
              <span>To review</span>
            </Link>
            <Link className="profile-stat-box" to="/learn">
              <span className="profile-stat-icon"><CheckCircle2 size={20} aria-hidden="true" /></span>
              <strong>{learnedCount ?? '—'}</strong>
              <span>Learned words</span>
            </Link>
            <div className="profile-stat-box profile-stat-box--streak">
              <span className="profile-stat-icon">
                <Flame size={20} aria-hidden="true" style={{ color: streak.todayStudied ? '#EA580C' : 'var(--color-text-muted)' }} />
              </span>
              <strong>{streak.isGuest ? '—' : `${streak.currentStreak} ${streak.currentStreak === 1 ? 'day' : 'days'}`}</strong>
              <span>
                {streak.isGuest
                  ? 'Guest mode'
                  : streak.todayStudied
                    ? 'Confirmed today'
                    : streak.hasPendingSync
                      ? 'Pending sync'
                      : 'Study streak'}
              </span>
            </div>
          </div>
          {collectionError && (
            <ProfileError onRetry={() => retryCollections(attempt => attempt + 1)} label="Retry learning collections">
              Learning data could not be read on this device. Stored records have been kept.
            </ProfileError>
          )}
        </section>

        {/* Section C: Settings and support links */}
        <section className="profile-group" aria-labelledby="profile-settings-title">
          <h2 id="profile-settings-title">Settings & support</h2>
          <div className="profile-group__surface">
            <ProfileLink
              to="/settings"
              icon={Settings}
              title="Learning settings"
              subtitle="Course language, audio, and display"
            />
            {user && !busy && (
              <button
                type="button"
                className="profile-setting profile-setting--link"
                aria-label="Review guest learning"
                onClick={guestImport.openGuestImport}
                disabled={!guestImport.available || guestImport.pending || guestImport.checking}
              >
                <span className="profile-setting__icon"><FolderInput size={21} aria-hidden="true" /></span>
                <span className="profile-setting__copy">
                  <strong>{guestImport.checking ? 'Checking guest learning…' : 'Guest learning'}</strong>
                  <span>Review guest records on this device</span>
                </span>
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            )}
            <ProfileLink
              to="/support"
              icon={HelpCircle}
              title="Support & help"
              subtitle="Assistance, guides, and contact"
            />
            <ProfileLink
              to="/about"
              icon={Info}
              title="About Swipe 2 Study"
              subtitle="Overview and learning curricula"
            />
          </div>
        </section>

        {/* Section D: Session & account actions (signed-in only) */}
        {user && (
          <section className="profile-group profile-group--danger" aria-labelledby="profile-session-title">
            <h2 id="profile-session-title">Session & account</h2>
            <div className="profile-group__surface">
              <button
                type="button"
                className="profile-setting profile-setting--logout"
                onClick={handleLogout}
                disabled={loggingOut || globalSigningOut || busy}
              >
                <span className="profile-setting__icon"><LogOut size={21} aria-hidden="true" /></span>
                <span className="profile-setting__copy">
                  <strong>{loggingOut ? 'Logging out…' : 'Log out'}</strong>
                  <span>Switch back to guest mode</span>
                </span>
              </button>
              {!busy && (
                <button
                  type="button"
                  className="profile-setting profile-setting--logout"
                  onClick={openGlobalSignOut}
                  disabled={loggingOut || globalSigningOut || busy}
                >
                  <span className="profile-setting__icon"><LogOut size={21} aria-hidden="true" /></span>
                  <span className="profile-setting__copy">
                    <strong>Sign out on all devices</strong>
                    <span>Sign out here and on other devices</span>
                  </span>
                </button>
              )}
              {!busy && deletionEnabled ? (
                <button
                  type="button"
                  className="profile-setting profile-setting--logout"
                  onClick={openDeleteAccount}
                  disabled={loggingOut || globalSigningOut || deletingAccount || busy}
                >
                  <span className="profile-setting__icon"><Trash2 size={21} aria-hidden="true" /></span>
                  <span className="profile-setting__copy">
                    <strong>Delete account</strong>
                    <span>Permanently delete your account and data</span>
                  </span>
                </button>
              ) : (
                <div className="profile-setting">
                  <span className="profile-setting__icon"><Trash2 size={21} aria-hidden="true" /></span>
                  <span className="profile-setting__copy">
                    <strong>Delete account</strong>
                    <span>Available in a later update</span>
                  </span>
                  <span className="profile-soon">Soon</span>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

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
        accountLabel={targetAccountLabel}
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
