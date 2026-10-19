import zh from './zh';
import ja from './ja';

/* ---------------------------------------------------------------
   COURSE REGISTRY
   ---------------------------------------------------------------
   Adding a language is: write a course file with the same shape as
   zh.js / ja.js and add it here. Every screen reads the active
   course, so nothing else needs to change.

   English is declared but has no course yet, so it stays visible in
   the switcher as "coming soon" without being selectable.
   --------------------------------------------------------------- */

export const COURSES = { zh, ja };

const UPCOMING = [
  {
    id: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧',
    levelSystem: 'CEFR', levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], status: 'coming-soon'
  }
];

/** Summary of every language for the switcher, in display order. */
export const LANGUAGES = [
  ...Object.values(COURSES).map((c) => ({
    id: c.id, name: c.name, nativeName: c.nativeName, flag: c.flag,
    levelSystem: c.levelSystem, levels: c.levels.map((l) => l.name), status: c.status
  })),
  ...UPCOMING
];

export const DEFAULT_COURSE_ID = 'zh';

export const isActiveCourse = (id) => Boolean(COURSES[id] && COURSES[id].status === 'active');

export const getCourse = (id) => COURSES[id] || COURSES[DEFAULT_COURSE_ID];
