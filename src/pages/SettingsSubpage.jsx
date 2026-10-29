import React, { useState } from 'react';
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
import { COURSES } from '../courses';
import { db } from '../lib/db';
import { storageOwner } from '../lib/storageOwner.js';
import { useOnlineSync } from '../lib/useOnlineSync.js';
import { StudyHeader } from '../components/study/StudyPage';
import './SettingsSubpage.css';
import LanguageFlag from '../components/ui/LanguageFlag';

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

/* Everything "Reset everything" wipes, in every language. Includes the
   drill progress tables, which the reset used to leave behind. */
const RESET_TABLES = [...DATA_TABLES.map((d) => d.table), 'learned_radicals', 'learned_kana', 'learned_sounds'];

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
    resetPrefs,
    syncStatus: prefSyncStatus,
    syncError: prefSyncError,
    retrySync: prefSyncRetry,
  } = usePreferences();
  const { status: syncStatus, error: syncError, retry: syncRetry, sync: syncManual } = useOnlineSync();
  const { language } = useLanguage();
  const course = useCourse();

  const [sheet, setSheet] = useState(null); // preference key, or 'language'
  const [notice, setNotice] = useState('');
  const [usage, setUsage] = useState(storageUsed);

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

  const exportData = () => {
    // Every language, not just the one on screen — it is "my data".
    const payload = {
      exportedAt: new Date().toISOString(),
      preferences: prefs,
      activeLanguage: language.id,
      data: Object.keys(COURSES).reduce((acc, lang) => ({
        ...acc,
        [lang]: RESET_TABLES.reduce((tables, table) => ({ ...tables, [table]: db.getFor(lang, table) }), {})
      }), {})
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `swipe2study-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    flash('Export started.');
  };

  const resetEverything = () => {
    if (!window.confirm('Reset everything? All progress, saved words, history and settings will be erased in every language. This cannot be undone.')) return;
    Object.keys(COURSES).forEach((lang) => RESET_TABLES.forEach((table) => db.setFor(lang, table, [])));
    resetPrefs();
    refreshUsage();
    flash('Everything has been reset.');
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
          subtitle="Every language, as JSON"
          onClick={exportData}
        />
        <SettingsRow
          icon={RotateCcw} iconGradient={GRADIENTS.red}
          title="Reset everything"
          subtitle="Erase all progress and settings, every language"
          onClick={resetEverything}
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
    </div>
  );
}
