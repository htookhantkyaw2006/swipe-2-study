import { createContext, useContext, useState, useCallback } from 'react';
import { LANGUAGES, getCourse, isActiveCourse } from '../courses';
import { getActiveLanguageId, setActiveLanguageId } from './activeLanguage';
import { seedCourse } from './seed';

/* ---------------------------------------------------------------
   LANGUAGE MODE
   ---------------------------------------------------------------
   Swipe 2 Study is one language at a time. The active language picks
   the course (src/courses), and the course drives every screen —
   levels, vocabulary, phrases, tools, speech.

   Switching order matters:
     1. the out-of-React store, so the db points at the new language
     2. seed that language, so its tables exist before anything reads
     3. React state — which remounts the app (see main.jsx)
   --------------------------------------------------------------- */

export { LANGUAGES };

/* During development, Vite briefly hot-swaps this module before falling
   back to a full reload (it mixes a provider with hooks and constants,
   so it cannot Fast Refresh). A fresh createContext() in that window
   would leave consumers reading a context the mounted provider does not
   supply — "useLanguage must be used within a LanguageProvider". Keeping
   the same context object across swaps closes the window. No effect in
   a production build, where import.meta.hot is undefined. */
const LanguageContext = import.meta.hot?.data.LanguageContext ?? createContext(null);
if (import.meta.hot) import.meta.hot.data.LanguageContext = LanguageContext;

export function LanguageProvider({ children }) {
  const [languageId, setLanguageId] = useState(() => {
    const id = getActiveLanguageId();
    // Each newly selected account starts with its own course cache.
    seedCourse(id);
    return id;
  });

  const setLanguage = useCallback((id) => {
    if (!isActiveCourse(id)) return false;
    setActiveLanguageId(id);
    seedCourse(id);
    setLanguageId(id);
    return true;
  }, []);

  const language = LANGUAGES.find((l) => l.id === languageId) || LANGUAGES[0];
  const course = getCourse(languageId);

  return (
    <LanguageContext.Provider value={{ language, languageId, languages: LANGUAGES, course, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}

/** The active course: levels, content, copy and tools for this language. */
export function useCourse() {
  return useLanguage().course;
}
