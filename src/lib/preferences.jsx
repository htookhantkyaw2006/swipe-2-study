import { createContext, useContext, useState, useCallback } from 'react';
import { storageOwner } from './storageOwner.js';

/* ---------------------------------------------------------------
   PREFERENCES
   ---------------------------------------------------------------
   One persisted store behind both the Profile quick rows and the
   full Settings page, so the two can never disagree.

   Stored as a single JSON blob so adding a key needs no migration —
   unknown keys fall back to DEFAULTS on read.

   `readPreferences()` is a non-hook escape hatch for plain modules
   that run outside React (see lib/speech.js).
   --------------------------------------------------------------- */

export const DEFAULTS = {
  // Learning
  dailyGoal: 20,
  cardsPerSession: 10,
  cardOrder: 'sequential', // sequential | shuffle

  // Display
  showPinyin: true,
  showBurmese: true,
  translationLanguage: 'both', // english | burmese | both

  // Audio
  autoPlayAudio: false,
  speechRate: 'normal', // slow | normal | fast

  // Per language, because accents are language-specific codes: a
  // Taiwan choice for Chinese must survive a trip to Japanese.
  // Missing entries fall back to the course's default accent.
  accentByLanguage: {}
};

/** Option lists for the pickers, kept next to the defaults they describe. */
export const OPTIONS = {
  dailyGoal: [
    { value: 10, label: '10 cards' },
    { value: 20, label: '20 cards' },
    { value: 30, label: '30 cards' },
    { value: 50, label: '50 cards' }
  ],
  cardsPerSession: [
    { value: 5, label: '5 cards' },
    { value: 10, label: '10 cards' },
    { value: 20, label: '20 cards' },
    { value: 30, label: '30 cards' }
  ],
  cardOrder: [
    { value: 'sequential', label: 'Sequential' },
    { value: 'shuffle', label: 'Shuffle' }
  ],
  translationLanguage: [
    { value: 'english', label: 'English only' },
    { value: 'burmese', label: 'Burmese only' },
    { value: 'both', label: 'Both' }
  ],
  speechRate: [
    { value: 'slow', label: 'Slow' },
    { value: 'normal', label: 'Normal' },
    { value: 'fast', label: 'Fast' }
  ]
  // Accent options live on each course (course.speech.accents).
};

/** Numeric speechSynthesis rates for the three speed labels. */
export const SPEECH_RATES = { slow: 0.6, normal: 1, fast: 1.4 };

/* Before languages, the accent was a single `accent` key and could only
   be Chinese. Carry it into the per-language map so nobody loses it. */
const upgrade = (stored) => {
  const { accent, ...rest } = stored;
  if (accent && !rest.accentByLanguage?.zh) {
    rest.accentByLanguage = { ...(rest.accentByLanguage || {}), zh: accent };
  }
  return rest;
};

export function readPreferences() {
  try {
    const raw = storageOwner.scope().getItem('preferences');
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...upgrade(JSON.parse(raw)) };
  } catch {
    // Blocked storage or malformed JSON — defaults keep the app usable.
    return { ...DEFAULTS };
  }
}

// Same reasoning as LanguageContext in language.jsx: keep one context
// object across development hot swaps.
const PreferencesContext = import.meta.hot?.data.PreferencesContext ?? createContext(null);
if (import.meta.hot) import.meta.hot.data.PreferencesContext = PreferencesContext;

export function PreferencesProvider({ children }) {
  const [prefs, setPrefs] = useState(readPreferences);
  // Pin delayed callbacks to the owner whose provider created them.
  const [scope] = useState(() => storageOwner.scope());

  const persist = useCallback((next) => {
    try {
      scope.setItem('preferences', JSON.stringify(next));
    } catch {
      // Persisting is best-effort; the in-memory value still applies.
    }
  }, [scope]);

  const setPref = useCallback((key, value) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      persist(next);
      return next;
    });
  }, [persist]);

  const resetPrefs = useCallback(() => {
    setPrefs({ ...DEFAULTS });
    persist({ ...DEFAULTS });
  }, [persist]);

  return (
    <PreferencesContext.Provider value={{ prefs, setPref, resetPrefs }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within a PreferencesProvider');
  return ctx;
}
