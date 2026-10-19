/* ---------------------------------------------------------------
   STORAGE MIGRATION — v2: per-language tables
   ---------------------------------------------------------------
   Before languages, tables lived at `s2s_<table>`. Everything stored
   then was Chinese, so it moves to `s2s_zh_<table>`.

   Copy first, delete second, and only delete once the copy reads back
   identical. If a scoped key already exists the old one is left alone
   rather than overwritten — losing nothing beats tidiness.

   Runs once (guarded by s2s_storage_version), before anything reads
   the db.
   --------------------------------------------------------------- */

const VERSION_KEY = 's2s_storage_version';
const VERSION = '2';

// Explicit list, not a prefix match: s2s_language and s2s_preferences
// are global and must not be swept into a language.
const LEGACY_TABLES = [
  'flashcards', 'review_cards', 'saved_words',
  'search_history', 'written_chars', 'learned_radicals'
];

export function migrateStorage() {
  try {
    if (localStorage.getItem(VERSION_KEY) === VERSION) return;

    LEGACY_TABLES.forEach((table) => {
      const legacyKey = `s2s_${table}`;
      const scopedKey = `s2s_zh_${table}`;
      const value = localStorage.getItem(legacyKey);
      if (value === null) return;

      if (localStorage.getItem(scopedKey) === null) {
        localStorage.setItem(scopedKey, value);
      }
      if (localStorage.getItem(scopedKey) === value) {
        localStorage.removeItem(legacyKey);
      }
    });

    localStorage.setItem(VERSION_KEY, VERSION);
  } catch {
    // Storage blocked — there is nothing stored to migrate.
  }
}
