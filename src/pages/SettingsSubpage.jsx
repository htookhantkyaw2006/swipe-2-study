import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Target, Languages, Shuffle, Layers, Volume2, Gauge, Mic,
  Type, Bell, Flame, Database, Trash2, Download, RotateCcw, HardDrive,
  FileText, ShieldCheck, Star, MessageSquare, Info, BookOpen
} from 'lucide-react';
import {
  SettingsGroup, SettingsRow, ToggleSwitch, OptionSheet
} from '../components/ui/SettingsControls';
import { LanguageSheet } from '../components/ui/LanguageSwitcher';
import { usePreferences, OPTIONS } from '../lib/preferences';
import { useLanguage } from '../lib/language';
import { db } from '../lib/db';

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

/* Tables the Data group can clear, with a human label. */
const DATA_TABLES = [
  { table: 'search_history', label: 'search history' },
  { table: 'written_chars', label: 'writing progress' },
  { table: 'review_cards', label: 'review queue' },
  { table: 'saved_words', label: 'saved words' }
];

/** Rough size of everything we store, for the storage row. */
const storageUsed = () => {
  let bytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('s2s_')) bytes += key.length + (localStorage.getItem(key) || '').length;
    }
  } catch {
    return null;
  }
  return bytes;
};

const formatBytes = (bytes) => {
  if (bytes === null) return 'Unavailable';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
};

export default function SettingsSubpage() {
  const navigate = useNavigate();
  const { prefs, setPref, resetPrefs } = usePreferences();
  const { language } = useLanguage();

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
    const payload = {
      exportedAt: new Date().toISOString(),
      preferences: prefs,
      language: language.id,
      data: DATA_TABLES.reduce((acc, { table }) => ({ ...acc, [table]: db.get(table) }), {})
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
    if (!window.confirm('Reset everything? All progress, saved words, history and settings will be erased. This cannot be undone.')) return;
    DATA_TABLES.forEach(({ table }) => db.set(table, []));
    resetPrefs();
    refreshUsage();
    flash('Everything has been reset.');
  };

  const optionLabel = (key) =>
    OPTIONS[key]?.find((o) => o.value === prefs[key])?.label ?? String(prefs[key]);

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px', paddingBottom: '100px' }}>

      {/* Header */}
      <header className="flex items-center justify-center relative" style={{ marginBottom: '0px' }}>
        <button
          onClick={() => navigate('/profile')}
          style={{ position: 'absolute', left: 0, background: 'transparent', padding: '8px', border: 'none', cursor: 'pointer', zIndex: 10 }}
        >
          <ArrowLeft size={24} color="var(--color-text-navy)" />
        </button>
        <h1 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--color-text-navy)', fontWeight: 800 }}>Settings</h1>
      </header>

      {notice && (
        <div style={{
          padding: '14px 18px', borderRadius: '16px', backgroundColor: 'var(--color-ghost-blue)',
          color: 'var(--color-text-navy)', fontWeight: 600, fontSize: '0.9rem',
          border: '1px solid var(--color-border)'
        }}>
          {notice}
        </div>
      )}

      {/* ---------------- Learning ---------------- */}
      <SettingsGroup title="Learning">
        <SettingsRow
          icon={Languages} iconGradient={GRADIENTS.blue}
          title="Learning language"
          subtitle={`${language.levelSystem} levels`}
          value={`${language.flag} ${language.name}`}
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
          title="Show pinyin"
          subtitle="Romanisation on cards"
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
          subtitle="Needs the app's fixed sizes made scalable first"
          comingSoon
        />
        <SettingsRow
          icon={Languages} iconGradient={GRADIENTS.orange}
          title="Simplified / Traditional"
          subtitle="Requires a traditional character dataset"
          comingSoon
          isLast
        />
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
          value={optionLabel('accent')}
          onClick={() => setSheet('accent')}
          isLast
        />
      </SettingsGroup>

      {/* ---------------- Notifications ---------------- */}
      <SettingsGroup title="Notifications">
        <SettingsRow
          icon={Bell} iconGradient={GRADIENTS.blue}
          title="Daily reminder"
          subtitle="Needs push notifications, not available on web yet"
          comingSoon
        />
        <SettingsRow
          icon={Flame} iconGradient={GRADIENTS.orange}
          title="Streak warning"
          subtitle="Needs push notifications, not available on web yet"
          comingSoon
          isLast
        />
      </SettingsGroup>

      {/* ---------------- Data & Storage ---------------- */}
      <SettingsGroup title="Data & Storage">
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
            subtitle={`${db.get(entry.table).length} item${db.get(entry.table).length === 1 ? '' : 's'} stored`}
            onClick={() => clearTable(entry)}
          />
        ))}
        <SettingsRow
          icon={Download} iconGradient={GRADIENTS.green}
          title="Export my data"
          subtitle="Download everything as JSON"
          onClick={exportData}
        />
        <SettingsRow
          icon={RotateCcw} iconGradient={GRADIENTS.red}
          title="Reset everything"
          subtitle="Erase all progress and settings"
          onClick={resetEverything}
          danger
          isLast
        />
      </SettingsGroup>

      {/* ---------------- About ---------------- */}
      <SettingsGroup title="About">
        <SettingsRow icon={Info} iconGradient={GRADIENTS.blue} title="Version" value="0.1.0" />
        <SettingsRow icon={MessageSquare} iconGradient={GRADIENTS.teal} title="Send feedback" onClick={() => flash('Feedback form is not connected yet.')} />
        <SettingsRow icon={Star} iconGradient={GRADIENTS.orange} title="Rate the app" onClick={() => flash('Available once the app is published.')} />
        <SettingsRow icon={ShieldCheck} iconGradient={GRADIENTS.green} title="Privacy policy" onClick={() => flash('Privacy policy is not written yet.')} />
        <SettingsRow icon={FileText} iconGradient={GRADIENTS.slate} title="Terms of service" onClick={() => flash('Terms are not written yet.')} isLast />
      </SettingsGroup>

      {/* Sheets */}
      {sheet === 'language' && <LanguageSheet onClose={() => setSheet(null)} />}
      {sheet && sheet !== 'language' && OPTIONS[sheet] && (
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
