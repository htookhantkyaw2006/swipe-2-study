import { db } from './db';

/* ---------------------------------------------------------------
   RADICAL PROGRESS
   ---------------------------------------------------------------
   Mirrors the shape of `written_chars` in Practise Writing: one row
   per radical, written as the drill is answered.

   Mastery is a STREAK rather than a running total, so getting one
   wrong later demotes you. A count that only ever goes up would let
   a radical stay "known" long after the learner had forgotten it.
   --------------------------------------------------------------- */

const TABLE = 'learned_radicals';

/** Clean answers in a row before a radical counts as known. */
export const KNOWN_AT = 3;

export const LEVELS = {
  new: { label: 'New', color: 'var(--color-border)' },
  learning: { label: 'Learning', color: '#F59E0B' },
  known: { label: 'Known', color: '#16A34A' }
};

/** All progress as { [radical]: row } for cheap lookup while rendering. */
export function readProgress() {
  return db.get(TABLE).reduce((acc, row) => {
    acc[row.radical] = row;
    return acc;
  }, {});
}

export function recordAnswer(radical, wasCorrect) {
  const existing = db.findOne(TABLE, { radical });

  if (!existing) {
    return db.insert(TABLE, {
      radical,
      seen: 1,
      correct: wasCorrect ? 1 : 0,
      wrong: wasCorrect ? 0 : 1,
      streak: wasCorrect ? 1 : 0
    });
  }

  return db.update(TABLE, existing.id, {
    seen: existing.seen + 1,
    correct: existing.correct + (wasCorrect ? 1 : 0),
    wrong: existing.wrong + (wasCorrect ? 0 : 1),
    streak: wasCorrect ? existing.streak + 1 : 0
  });
}

export function resetProgress() {
  db.set(TABLE, []);
}

export function levelFor(row) {
  if (!row || !row.seen) return 'new';
  return row.streak >= KNOWN_AT ? 'known' : 'learning';
}

export function countKnown(progress) {
  return Object.values(progress).filter((row) => levelFor(row) === 'known').length;
}
