import { db } from './db';

/* ---------------------------------------------------------------
   DRILL PROGRESS
   ---------------------------------------------------------------
   Shared by the radical and kana drills: one row per item, written
   as questions are answered.

   Mastery is a STREAK rather than a running total, so getting one
   wrong later demotes the item. A count that only ever goes up would
   leave things "known" long after the learner had forgotten them.

   Tables live in the per-language db, so Chinese and Japanese radical
   progress never mix.
   --------------------------------------------------------------- */

/** Clean answers in a row before an item counts as known. */
export const KNOWN_AT = 3;

export const LEVELS = {
  new: { label: 'New', color: 'var(--color-border)' },
  learning: { label: 'Learning', color: '#F59E0B' },
  known: { label: 'Known', color: '#16A34A' }
};

export function levelFor(row) {
  if (!row || !row.seen) return 'new';
  return row.streak >= KNOWN_AT ? 'known' : 'learning';
}

export function countKnown(progress) {
  return Object.values(progress).filter((row) => levelFor(row) === 'known').length;
}

/** A progress store over `table`, with rows keyed by `keyField`. */
export function makeProgress(table, keyField) {
  return {
    /** All progress as { [key]: row } for cheap lookup while rendering. */
    read() {
      return db.get(table).reduce((acc, row) => {
        acc[row[keyField]] = row;
        return acc;
      }, {});
    },

    record(key, wasCorrect) {
      const existing = db.findOne(table, { [keyField]: key });
      if (!existing) {
        return db.insert(table, {
          [keyField]: key,
          seen: 1,
          correct: wasCorrect ? 1 : 0,
          wrong: wasCorrect ? 0 : 1,
          streak: wasCorrect ? 1 : 0
        });
      }
      return db.update(table, existing.id, {
        seen: existing.seen + 1,
        correct: existing.correct + (wasCorrect ? 1 : 0),
        wrong: existing.wrong + (wasCorrect ? 0 : 1),
        streak: wasCorrect ? existing.streak + 1 : 0
      });
    },

    reset() {
      db.set(table, []);
    }
  };
}
