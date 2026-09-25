import { createContext, useContext, useState, useCallback } from 'react';

/* ---------------------------------------------------------------
   LANGUAGE MODE
   ---------------------------------------------------------------
   Swipe 2 Study is a single-language-at-a-time app. The active
   language reconfigures the whole experience (levels, tools,
   progress). This holds the choice and persists it.

   Only Chinese has content today; English and Japanese are declared
   with their level systems but marked 'coming-soon' so the switcher
   is real architecture without faking empty screens. When their
   content lands, flip `status` to 'active' and wire the per-language
   levels/tools — no change needed here or in the header pill.

   Progress is not yet scoped per language. When a second language
   goes active, every db key (streak, mastered, saved_words,
   written_chars, review_cards) must be prefixed by language id.
   --------------------------------------------------------------- */

export const LANGUAGES = [
  {
    id: 'zh',
    name: 'Chinese',
    nativeName: '中文',
    flag: '🇨🇳',
    levelSystem: 'HSK',
    levels: ['HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6', 'HSK 7', 'HSK 8', 'HSK 9'],
    status: 'active'
  },
  {
    id: 'en',
    name: 'English',
    nativeName: 'English',
    flag: '🇬🇧',
    levelSystem: 'CEFR',
    levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    status: 'coming-soon'
  },
  {
    id: 'ja',
    name: 'Japanese',
    nativeName: '日本語',
    flag: '🇯🇵',
    levelSystem: 'JLPT',
    levels: ['N5', 'N4', 'N3', 'N2', 'N1'],
    status: 'coming-soon'
  }
];

const STORAGE_KEY = 's2s_language';
const DEFAULT_ID = 'zh';

const LanguageContext = createContext(null);

const readStored = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    // Only honour a saved language that still exists and is active.
    if (saved && LANGUAGES.some((l) => l.id === saved && l.status === 'active')) return saved;
  } catch {
    // Private mode / blocked storage — fall back to the default.
  }
  return DEFAULT_ID;
};

export function LanguageProvider({ children }) {
  const [languageId, setLanguageId] = useState(readStored);

  const setLanguage = useCallback((id) => {
    const lang = LANGUAGES.find((l) => l.id === id);
    // Coming-soon languages are not selectable yet.
    if (!lang || lang.status !== 'active') return false;
    setLanguageId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Persisting is best-effort; the in-memory choice still applies.
    }
    return true;
  }, []);

  const language = LANGUAGES.find((l) => l.id === languageId) || LANGUAGES[0];

  return (
    <LanguageContext.Provider value={{ language, languageId, languages: LANGUAGES, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
