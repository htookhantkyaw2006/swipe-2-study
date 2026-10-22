import zh from './zh';
import ja from './ja';
import en from './en';

/* ---------------------------------------------------------------
   COURSE REGISTRY
   ---------------------------------------------------------------
   Adding a language is: write a course file with the same shape as
   zh.js / ja.js and add it here. Every screen reads the active
   course, so nothing else needs to change.

   Chinese (HSK), Japanese (JLPT) and English (CEFR) are live.
   --------------------------------------------------------------- */

export const COURSES = { zh, ja, en };

/* Languages announced in the switcher before they have a course.
   Empty while every planned language is live; add one here to show it
   as "coming soon". */
const UPCOMING = [];

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
