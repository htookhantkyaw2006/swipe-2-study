import { isActiveCourse, DEFAULT_COURSE_ID } from '../courses';

/* ---------------------------------------------------------------
   ACTIVE LANGUAGE (outside React)
   ---------------------------------------------------------------
   The db, speech and seeding all run outside the React tree, so they
   need the current language without a hook. This module holds it.

   It is kept in memory rather than re-read from localStorage on every
   call: with storage blocked (private mode), reading back would always
   return the default and quietly send Japanese writes into Chinese.
   --------------------------------------------------------------- */

export const LANGUAGE_KEY = 's2s_language';

const readStored = () => {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved && isActiveCourse(saved)) return saved;
  } catch {
    // Storage blocked — fall through to the default.
  }
  return DEFAULT_COURSE_ID;
};

let current = readStored();

export const getActiveLanguageId = () => current;

export function setActiveLanguageId(id) {
  if (!isActiveCourse(id)) return false;
  current = id;
  try {
    localStorage.setItem(LANGUAGE_KEY, id);
  } catch {
    // Persisting is best-effort; the in-memory choice still applies.
  }
  return true;
}
