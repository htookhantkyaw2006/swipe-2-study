import React, { useState, useContext } from 'react';
import {
  Target, Languages, Shuffle, Layers, Volume2, Gauge, Mic,
  Type, Bell, Flame, Trash2, Download, RotateCcw, HardDrive,
  FileText, ShieldCheck, Star, MessageSquare, Info, BookOpen,
  Cloud, CloudOff, RefreshCw
} from 'lucide-react';
import {
  SettingsGroup, SettingsRow, ToggleSwitch, OptionSheet
} from '../components/ui/SettingsControls';
import { LanguageSheet } from '../components/ui/LanguageSwitcher';
import { usePreferences, OPTIONS } from '../lib/preferences';
import { useLanguage, useCourse } from '../lib/language';
import { db } from '../lib/db';
import { storageOwner } from '../lib/storageOwner.js';
import { useOnlineSync } from '../lib/useOnlineSync.js';
import { StudyHeader } from '../components/study/StudyPage';
import './SettingsSubpage.css';
import LanguageFlag from '../components/ui/LanguageFlag';
import { AuthContext } from '../lib/authContext.js';
import { trackEvent } from '../lib/analytics.js';
import { isLearningExportResetEnabled } from '../lib/learningExportResetGate.js';
import { learningExportService } from '../lib/learningExportService.js';
import { learningResetService } from '../lib/learningResetService.js';
import ResetLearningDialog from '../components/ResetLearningDialog.jsx';

const GRADIENTS = {
  blue: 'linear-gradient(135deg, #7DD3FC 0%, #0369A1 100%)',
  purple: 'linear-gradient(135deg, #D8B4FE 0%, #9333EA 100%)',
  teal: 'linear-gradient(135deg, #5EEAD4 0%, #0F766E 100%)',
  orange: 'linear-gradient(135deg, #FDBA74 0%, #EA580C 100%)',
  green: 'linear-gradient(135deg, #86EFAC 0%, #16A34A 100%)',
  red: 'linear-gradient(135deg, #FCA5A5 0%, #DC2626 100%)',
  indigo: 'linear-gradient(135deg, #A5B4FC 0%, #4338CA 100%)',
  slate: 'linear-gradient(135deg, #94A3B8 0%, #334155 100%)'
};

/* Tables the Data group can clear, with a human label. These act on the
   language currently being learned — each language has its own. */
const DATA_TABLES = [
  { table: 'search_history', label: 'search history' },
  { table: 'written_chars', label: 'writing progress' },
  { table: 'review_cards', label: 'review queue' },
  { table: 'saved_words', label: 'saved words' }
];

/** Approximate UTF-16 size of the current owner's learning/settings cache. */
const storageUsed = () => {
  try {
    return storageOwner.scope().entries().reduce((bytes, [key, value]) => bytes + 2 * (key.length + value.length), 0);
  } catch {
    return null;
  }
};

const formatBytes = (bytes) => {
  if (bytes === null) return 'Unavailable';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
};

export default function SettingsSubpage() {
  const {
    prefs,
    setPref,
    syncStatus: prefSyncStatus,
    syncError: prefSyncError,
    retrySync: prefSyncRetry,
  } = usePreferences();
  const { status: syncStatus, error: syncError, retry: syncRetry, sync: syncManual } = useOnlineSync();
  const { language } = useLanguage();
  const course = useCourse();

  const auth = useContext(AuthContext);
  const user = auth?.user ?? null;
  const isCurrent = auth?.isCurrent ?? (() => true);

  const [sheet, setSheet] = useState(null); // preference key, or 'language'
  const [notice, setNotice] = useState('');
  const [usage, setUsage] = useState(storageUsed);
  const [exporting, setExporting] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [resetError, setResetError] = useState(null);
  const [resetLocalCleanupError, setResetLocalCleanupError] = useState(false);

  const flash = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2600);
  };

  const refreshUsage = () => setUsage(storageUsed());

  const clearTable = ({ table, label }) => {
    const count = db.get(table).length;
    if (count === 0) {
      flash(`No ${label} to clear.`);
      return;
    }
    if (!window.confirm(`Clear your ${label}? ${count} item${count === 1 ? '' : 's'} will be removed. This cannot be undone.`)) return;
    db.set(table, []);
    refreshUsage();
    flash(`Cleared ${label}.`);
  };

  const exportData = async () => {
    if (exporting) return;
    setExporting(true);
    const initiatingUserId = user?.id ?? null;
    try {
      let payload;
      if (initiatingUserId) {
        if (!isLearningExportResetEnabled()) {
          flash('Account learning export is currently disabled.');
          return;
        }
        payload = await learningExportService.exportAccountLearningData({
          accountId: initiatingUserId,
          isCurrent,
        });
      } else {
        payload = learningExportService.exportGuestLearningData();
      }

      if ((user?.id ?? null) !== initiatingUserId || !isCurrent()) {
        return;
      }

      const scope = payload.scope || 'data';
      const dateStr = new Date().toISOString().slice(0, 10);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `swipe2study-${scope}-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      flash('Export completed.');
    } catch (err) {
      if ((user?.id ?? null) !== initiatingUserId || !isCurrent()) return;
      flash(err?.message || 'Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const openResetDialog = () => {
    setResetError(null);
    setResetLocalCleanupError(false);
    setResetDialogOpen(true);
  };

  const handleConfirmReset = async () => {
    if (resetPending || resetLocalCleanupError) return;
    setResetPending(true);
    setResetError(null);
    const initiatingUserId = user?.id ?? null;

    try {
      let res;
      if (initiatingUserId) {
        if (!isLearningExportResetEnabled()) {
          setResetError('Account learning reset is currently disabled.');
          return;
        }
        res = await learningResetService.resetAccountLearning({
          accountId: initiatingUserId,
          isCurrent,
        });
      } else {
        res = learningResetService.resetGuestLearning();
      }

      if ((user?.id ?? null) !== initiatingUserId || !isCurrent()) {
        setResetDialogOpen(false);
        flash('Account changed. Please reopen Settings.');
        return;
      }

      if (res.status === 'local_cleanup_failed') {
        setResetLocalCleanupError(true);
        setResetError(res.error || 'Your data was reset on the server, but local cached data could not be completely cleared.');
      } else if (res.status === 'account_changed') {
        setResetDialogOpen(false);
        flash('Account changed. Please reopen Settings.');
      } else if (res.status === 'failed') {
        setResetError(res.error || 'Learning reset failed. Please try again.');
      } else if (res.status === 'success') {
        trackEvent('learning:reset_confirmed', {
          scope: initiatingUserId ? 'account' : 'guest',
        });
        setResetDialogOpen(false);
        refreshUsage();
        flash('Learning data has been reset.');
      }
    } catch (err) {
      if ((user?.id ?? null) !== initiatingUserId || !isCurrent()) {
        setResetDialogOpen(false);
        flash('Account changed. Please reopen Settings.');
        return;
      }
      setResetError(err?.message || 'Learning reset failed. Please try again.');
    } finally {
      setResetPending(false);
    }
  };

  const handleRetryLocalCleanup = () => {
    if (resetPending || !resetLocalCleanupError || !user?.id) return;
    setResetPending(true);
    setResetError(null);
    const initiatingUserId = user.id;

    try {
      const res = learningResetService.retryLocalAccountCleanup({
        accountId: initiatingUserId,
        isCurrent,
      });

      if ((user?.id ?? null) !== initiatingUserId || !isCurrent()) {
        setResetDialogOpen(false);
        flash('Account changed. Please reopen Settings.');
        return;
      }

      if (res.status === 'success') {
        setResetLocalCleanupError(false);
        setResetDialogOpen(false);
        refreshUsage();
        flash('Local learning data has been cleared.');
      } else if (res.status === 'account_changed') {
        setResetDialogOpen(false);
        flash('Account changed. Please reopen Settings.');
      } else {
        setResetError(res.error || 'Could not clear device storage. Please try again.');
      }
    } catch (err) {
      if ((user?.id ?? null) !== initiatingUserId || !isCurrent()) {
        setResetDialogOpen(false);
        flash('Account changed. Please reopen Settings.');
        return;
      }
      setResetError(err?.message || 'Could not clear device storage. Please try again.');
    } finally {
      setResetPending(false);
    }
  };

  const optionLabel = (key) =>
    OPTIONS[key]?.find((o) => o.value === prefs[key])?.label ?? String(prefs[key]);

  const accentValue = prefs.accentByLanguage?.[course.id] ?? course.speech.defaultAccent;
  const accentLabel = course.speech.accents.find((a) => a.value === accentValue)?.label
    ?? course.speech.accents[0].label;
  const chooseAccent = (value) =>
    setPref('accentByLanguage', { ...(prefs.accentByLanguage || {}), [course.id]: value });

  return (
    <div className="study-page settings-page">

      <StudyHeader title="Settings" subtitle={`${course.name} · Learning preferences`} backTo="/profile" backLabel="Back to profile" />

      {notice && (
        <div className="settings-notice" role="status">
          {notice}
        </div>
      )}

      {/* ---------------- Learning ---------------- */}
      <SettingsGroup title="Learning">
        <SettingsRow
          icon={Languages} iconGradient={GRADIENTS.blue}
          title="Learning language"
          subtitle={`${language.levelSystem} levels`}
          value={<span className="settings-language-value"><LanguageFlag id={language.id} size={22} /><span>{language.name}</span></span>}
          onClick={() => setSheet('language')}
        />
        <SettingsRow
          icon={Target} iconGradient={GRADIENTS.green}
          title="Daily goal"
          subtitle="Cards to aim for each day"
          value={optionLabel('dailyGoal')}
          onClick={() => setSheet('dailyGoal')}
        />
        <SettingsRow
          icon={Layers} iconGradient={GRADIENTS.purple}
          title="Cards per session"
          subtitle="Length of one swipe session"
          value={optionLabel('cardsPerSession')}
          onClick={() => setSheet('cardsPerSession')}
        />
        <SettingsRow
          icon={Shuffle} iconGradient={GRADIENTS.orange}
          title="Card order"
          subtitle="How cards are sequenced"
          value={optionLabel('cardOrder')}
          onClick={() => setSheet('cardOrder')}
          isLast
        />
      </SettingsGroup>

      {/* ---------------- Display ---------------- */}
      <SettingsGroup title="Display">
        <SettingsRow
          icon={BookOpen} iconGradient={GRADIENTS.blue}
          title={`Show ${course.script.romanization}`}
          subtitle={course.script.romanizationHint}
          control={<ToggleSwitch checked={prefs.showPinyin} onChange={(v) => setPref('showPinyin', v)} />}
        />
        <SettingsRow
          icon={Languages} iconGradient={GRADIENTS.teal}
          title="Show Burmese"
          subtitle="Burmese translations on cards"
          control={<ToggleSwitch checked={prefs.showBurmese} onChange={(v) => setPref('showBurmese', v)} />}
        />
        <SettingsRow
          icon={FileText} iconGradient={GRADIENTS.indigo}
          title="Translation language"
          subtitle="Which meaning to show"
          value={optionLabel('translationLanguage')}
          onClick={() => setSheet('translationLanguage')}
        />
        <SettingsRow
          icon={Type} iconGradient={GRADIENTS.slate}
          title="Text size"
          subtitle="Adjust the reading size"
          comingSoon
          isLast={!course.script.hasScriptVariants}
        />
        {course.script.hasScriptVariants && (
          <SettingsRow
            icon={Languages} iconGradient={GRADIENTS.orange}
            title="Simplified / Traditional"
            subtitle="Choose your preferred character style"
            comingSoon
            isLast
          />
        )}
      </SettingsGroup>

      {/* ---------------- Audio ---------------- */}
      <SettingsGroup title="Audio">
        <SettingsRow
          icon={Volume2} iconGradient={GRADIENTS.green}
          title="Auto-play pronunciation"
          subtitle="Speak each card as it is revealed"
          control={<ToggleSwitch checked={prefs.autoPlayAudio} onChange={(v) => setPref('autoPlayAudio', v)} />}
        />
        <SettingsRow
          icon={Gauge} iconGradient={GRADIENTS.purple}
          title="Speech rate"
          subtitle="How fast audio is read"
          value={optionLabel('speechRate')}
          onClick={() => setSheet('speechRate')}
        />
        <SettingsRow
          icon={Mic} iconGradient={GRADIENTS.red}
          title="Accent"
          subtitle="Pronunciation variant"
          value={accentLabel}
          onClick={() => setSheet('accent')}
          isLast
        />
      </SettingsGroup>

      {/* ---------------- Notifications ---------------- */}
      <SettingsGroup title="Notifications">
        <SettingsRow
          icon={Bell} iconGradient={GRADIENTS.blue}
          title="Daily reminder"
          subtitle="A reminder for your daily practice"
          comingSoon
        />
        <SettingsRow
          icon={Flame} iconGradient={GRADIENTS.orange}
          title="Streak warning"
          subtitle="A nudge to keep your study streak"
          comingSoon
          isLast
        />
      </SettingsGroup>

      {/* ---------------- Data & Storage ---------------- */}
      <SettingsGroup title="Data & Storage">
        <SettingsRow
          icon={prefSyncStatus === 'failed' ? CloudOff : (prefSyncStatus === 'syncing' || prefSyncStatus === 'restoring' ? RefreshCw : Cloud)}
          iconGradient={
            prefSyncStatus === 'saved' ? GRADIENTS.green
            : prefSyncStatus === 'syncing' || prefSyncStatus === 'restoring' ? GRADIENTS.blue
            : prefSyncStatus === 'failed' ? GRADIENTS.red
            : GRADIENTS.slate
          }
          title="Preferences sync"
          subtitle={
            prefSyncStatus === 'saved' ? 'Settings saved to your account'
            : prefSyncStatus === 'syncing' || prefSyncStatus === 'restoring' ? 'Saving preferences to account...'
            : prefSyncStatus === 'failed' ? `Sync failed · ${prefSyncError || 'Tap to retry'}`
            : 'Preferences stored on this device'
          }
          value={
            prefSyncStatus === 'saved' ? 'Saved'
            : prefSyncStatus === 'syncing' || prefSyncStatus === 'restoring' ? 'Syncing...'
            : prefSyncStatus === 'failed' ? 'Retry'
            : 'Local only'
          }
          onClick={prefSyncStatus === 'failed' ? prefSyncRetry : undefined}
          danger={prefSyncStatus === 'failed'}
        />
        <SettingsRow
          icon={syncStatus === 'failed' || syncStatus === 'conflict' ? CloudOff : (syncStatus === 'syncing' ? RefreshCw : Cloud)}
          iconGradient={
            syncStatus === 'saved' ? GRADIENTS.green
            : syncStatus === 'syncing' ? GRADIENTS.blue
            : syncStatus === 'failed' ? GRADIENTS.red
            : syncStatus === 'conflict' ? GRADIENTS.orange
            : GRADIENTS.slate
          }
          title="Cloud sync"
          subtitle={
            syncStatus === 'saved' ? 'All learning data saved to cloud'
            : syncStatus === 'syncing' ? 'Saving changes to cloud...'
            : syncStatus === 'failed' ? `Sync failed · ${syncError || 'Tap to retry'}`
            : syncStatus === 'conflict' ? 'Sync conflict · Tap to resolve'
            : 'Changes stored on this device'
          }
          value={
            syncStatus === 'saved' ? 'Cloud saved'
            : syncStatus === 'syncing' ? 'Syncing...'
            : syncStatus === 'failed' || syncStatus === 'conflict' ? 'Retry'
            : 'Local only'
          }
          onClick={
            syncStatus === 'failed' || syncStatus === 'conflict' ? syncRetry
            : (syncStatus === 'local' ? syncManual : undefined)
          }
          danger={syncStatus === 'failed' || syncStatus === 'conflict'}
        />
        <SettingsRow
          icon={HardDrive} iconGradient={GRADIENTS.slate}
          title="Storage used"
          subtitle="On this device"
          value={formatBytes(usage)}
        />
        {DATA_TABLES.map((entry) => (
          <SettingsRow
            key={entry.table}
            icon={Trash2} iconGradient={GRADIENTS.orange}
            title={`Clear ${entry.label}`}
            subtitle={`${db.get(entry.table).length} item${db.get(entry.table).length === 1 ? '' : 's'} stored · ${course.name} only`}
            onClick={() => clearTable(entry)}
          />
        ))}
        <SettingsRow
          icon={Download} iconGradient={GRADIENTS.green}
          title="Export my data"
          subtitle={exporting ? 'Preparing export JSON…' : 'Every language, as JSON'}
          onClick={exportData}
        />
        <SettingsRow
          icon={RotateCcw} iconGradient={GRADIENTS.red}
          title="Reset learning data"
          subtitle="Erase all learning progress, every language"
          onClick={openResetDialog}
          danger
          isLast
        />
      </SettingsGroup>

      {/* ---------------- About ---------------- */}
      <SettingsGroup title="About">
        <SettingsRow icon={Info} iconGradient={GRADIENTS.blue} title="Version" value="0.1.0" />
        <SettingsRow icon={MessageSquare} iconGradient={GRADIENTS.teal} title="Send feedback" comingSoon />
        <SettingsRow icon={Star} iconGradient={GRADIENTS.orange} title="Rate the app" comingSoon />
        <SettingsRow icon={ShieldCheck} iconGradient={GRADIENTS.green} title="Privacy policy" comingSoon />
        <SettingsRow icon={FileText} iconGradient={GRADIENTS.slate} title="Terms of service" comingSoon isLast />
      </SettingsGroup>

      {/* Sheets */}
      {sheet === 'language' && <LanguageSheet onClose={() => setSheet(null)} />}
      {sheet === 'accent' && (
        <OptionSheet
          title="Accent"
          options={course.speech.accents}
          selected={accentValue}
          onSelect={chooseAccent}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet && sheet !== 'language' && sheet !== 'accent' && OPTIONS[sheet] && (
        <OptionSheet
          title={{
            dailyGoal: 'Daily goal',
            cardsPerSession: 'Cards per session',
            cardOrder: 'Card order',
            translationLanguage: 'Translation language',
            speechRate: 'Speech rate',
            accent: 'Accent'
          }[sheet]}
          options={OPTIONS[sheet]}
          selected={prefs[sheet]}
          onSelect={(value) => setPref(sheet, value)}
          onClose={() => setSheet(null)}
        />
      )}

      <ResetLearningDialog
        open={resetDialogOpen}
        pending={resetPending}
        error={resetError}
        localCleanupError={resetLocalCleanupError}
        isGuest={!user}
        accountLabel={user?.email || ''}
        onConfirm={handleConfirmReset}
        onRetryCleanup={handleRetryLocalCleanup}
        onClose={() => {
          if (!resetPending) {
            setResetDialogOpen(false);
            setResetError(null);
            setResetLocalCleanupError(false);
          }
        }}
      />
    </div>
  );
}
