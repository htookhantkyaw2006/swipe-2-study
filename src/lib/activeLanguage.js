import { isActiveCourse, DEFAULT_COURSE_ID } from '../courses';
import { storageOwner } from './storageOwner.js';

/* ---------------------------------------------------------------
   ACTIVE LANGUAGE (outside React)
   ---------------------------------------------------------------
   The db, speech and seeding all run outside the React tree, so they
   need the current language without a hook. This module holds it.

   It is kept in memory rather than re-read from localStorage on every
   call: with storage blocked (private mode), reading back would always
   return the default and quietly send Japanese writes into Chinese.
   --------------------------------------------------------------- */

const readStored = () => {
  try {
    const saved = storageOwner.scope().getItem('language');
    if (saved && isActiveCourse(saved)) return saved;
  } catch {
    // Storage blocked — fall through to the default.
  }
  return DEFAULT_COURSE_ID;
};

/* Mirror the course onto <html data-course="..."> so CSS can style by
   language (see --font-reading in index.css). Set here, synchronously,
   rather than in an effect, so the first paint is already right. */
const reflect = (id) => {
  try {
    document.documentElement.dataset.course = id;
  } catch {
    // No document (tests, SSR) — nothing to style.
  }
};

let current = readStored();
let currentOwner = storageOwner.getOwner();
reflect(current);

export function getActiveLanguageId() {
  if (currentOwner !== storageOwner.getOwner()) {
    currentOwner = storageOwner.getOwner();
    current = readStored();
    reflect(current);
  }
  return current;
}

export function setActiveLanguageId(id) {
  if (!isActiveCourse(id)) return false;
  getActiveLanguageId();
  current = id;
  reflect(id);
  try {
    storageOwner.scope().setItem('language', id);
  } catch {
    // Persisting is best-effort; the in-memory choice still applies.
  }
  return true;
}
