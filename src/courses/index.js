import zh from './zh';

/* ---------------------------------------------------------------
   COURSE REGISTRY
   ---------------------------------------------------------------
   Adding a language is: write a course file with the same shape as
   zh.js and add it here. Every screen reads the active course, so
   nothing else needs to change.

   Languages without a course yet stay visible in the switcher as
   "coming soon" rather than being hidden, so the switcher shows the
   whole plan without faking empty screens.
   --------------------------------------------------------------- */

export const COURSES = { zh };

const UPCOMING = [
  {
    id: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧',
    levelSystem: 'CEFR', levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], status: 'coming-soon'
  },
  {
    id: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵',
    levelSystem: 'JLPT', levels: ['N5', 'N4', 'N3', 'N2', 'N1'], status: 'coming-soon'
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
