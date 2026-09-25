import { createContext, useContext, useState, useCallback } from 'react';

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

const STORAGE_KEY = 's2s_preferences';

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
  accent: 'zh-CN' // zh-CN | zh-TW
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
  ],
  accent: [
    { value: 'zh-CN', label: 'Mainland (普通话)' },
    { value: 'zh-TW', label: 'Taiwan (國語)' }
  ]
};

/** Numeric speechSynthesis rates for the three speed labels. */
export const SPEECH_RATES = { slow: 0.6, normal: 1, fast: 1.4 };

export function readPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    // Blocked storage or malformed JSON — defaults keep the app usable.
    return { ...DEFAULTS };
  }
}

const PreferencesContext = createContext(null);

export function PreferencesProvider({ children }) {
  const [prefs, setPrefs] = useState(readPreferences);

  const persist = (next) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Persisting is best-effort; the in-memory value still applies.
    }
  };

  const setPref = useCallback((key, value) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      persist(next);
      return next;
    });
  }, []);

  const resetPrefs = useCallback(() => {
    setPrefs({ ...DEFAULTS });
    persist({ ...DEFAULTS });
  }, []);

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
