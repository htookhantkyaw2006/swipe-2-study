import { parseLearningRows } from './learningDocument.js';
import { studyWordKey } from './studyWords.js';

export const IMPORT_LANGUAGES = Object.freeze([
  { languageId: 'zh', languageLabel: 'Chinese' },
  { languageId: 'ja', languageLabel: 'Japanese' },
  { languageId: 'en', languageLabel: 'English' },
]);
export const IMPORT_TABLES = Object.freeze([
  'saved_words', 'review_cards', 'written_chars',
  'learned_radicals', 'learned_kana', 'learned_sounds',
  'learned_words',
]);
const FIELD = { written_chars: 'character', learned_radicals: 'radical', learned_kana: 'kana', learned_sounds: 'sound' };
const MAX_ROWS = 10000;
const MAX_SOURCE_CHARS = 4 * 1024 * 1024;
const invalid = () => new Error('Some learning data could not be imported safely. It has been kept on this device for recovery.');
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 2000;

export function importIdentity(table, row) {
  if (table === 'saved_words' || table === 'review_cards' || table === 'learned_words') return studyWordKey(row);
  const value = row[FIELD[table]];
  return text(value) ? value.normalize('NFC').trim() : null;
}

export function validateImportRows(raw, language, table) {
  const rows = raw === null ? [] : parseLearningRows(raw);
  if (rows.length > MAX_ROWS) throw invalid();
  for (const row of rows) {
    if (!importIdentity(table, row) || (row.language !== undefined && row.language !== language)) throw invalid();
    if (row.id !== undefined && !((typeof row.id === 'string' && row.id.length > 0 && row.id.length <= 256)
      || (typeof row.id === 'number' && Number.isSafeInteger(row.id)))) throw invalid();
    if (table === 'saved_words' || table === 'review_cards' || table === 'learned_words') {
      for (const field of ['character', 'phrase', 'char', 'pronunciation', 'reading', 'pinyin']) {
        if (row[field] !== undefined && (typeof row[field] !== 'string' || row[field].length > 2000)) throw invalid();
      }
    }
    if (['learned_radicals', 'learned_kana', 'learned_sounds'].includes(table) && ['seen', 'correct', 'wrong', 'streak'].some(key => row[key] !== undefined)) {
      if (['seen', 'correct', 'wrong', 'streak'].some(key => !Number.isSafeInteger(row[key]) || row[key] < 0)
        || row.correct + row.wrong !== row.seen || row.streak > row.correct) throw invalid();
    }
    if (table === 'learned_words') {
      if (row.seen !== undefined && (!Number.isSafeInteger(row.seen) || row.seen < 0)) throw invalid();
      for (const field of ['level', 'status', 'last_action', 'last_reviewed_at', 'created_at', 'updated_at', 'card_id', 'lesson_name', 'definition', 'english', 'burmese', 'burmese_definition', 'part_of_speech']) {
        if (row[field] !== undefined && (typeof row[field] !== 'string' || row[field].length > 2000)) throw invalid();
      }
      if (row.examples !== undefined) {
        if (!Array.isArray(row.examples) || row.examples.length > 10) throw invalid();
        for (const ex of row.examples) {
          if (!ex || typeof ex !== 'object' || Array.isArray(ex)) throw invalid();
          for (const key of ['text', 'chinese', 'reading', 'pinyin', 'english', 'burmese']) {
            if (ex[key] !== undefined && (typeof ex[key] !== 'string' || ex[key].length > 2000)) throw invalid();
          }
        }
      }
    }
  }
  return rows;
}

export function readGuestSnapshot(scope) {
  const tables = {};
  const source = [];
  let size = 0;
  for (const { languageId } of IMPORT_LANGUAGES) {
    for (const table of IMPORT_TABLES) {
      const raw = scope.getTable(languageId, table);
      size += raw?.length ?? 0;
      if (size > MAX_SOURCE_CHARS) throw new Error('Guest learning data is too large to import automatically. It has been kept on this device.');
      const rows = validateImportRows(raw, languageId, table);
      const unique = new Map();
      for (const row of rows) {
        const identity = importIdentity(table, row);
        if (!unique.has(identity)) unique.set(identity, row);
      }
      const name = `${languageId}_${table}`;
      tables[name] = [...unique.values()];
      source.push([name, raw]);
    }
  }
  return { tables, source: JSON.stringify(source) };
}

export function pendingGuestTables(snapshot, receipt) {
  const tables = {};
  const summary = [];
  for (const language of IMPORT_LANGUAGES) {
    const counts = { ...language, savedWords: 0, reviewWords: 0, progressRecords: 0 };
    for (const table of IMPORT_TABLES) {
      const name = `${language.languageId}_${table}`;
      const handled = new Set(receipt?.handled[name] ?? []);
      tables[name] = snapshot.tables[name].filter(row => !handled.has(importIdentity(table, row)));
      const category = table === 'saved_words' ? 'savedWords' : table === 'review_cards' ? 'reviewWords' : 'progressRecords';
      counts[category] += tables[name].length;
    }
    if (counts.savedWords + counts.reviewWords + counts.progressRecords > 0) summary.push(counts);
  }
  return { tables, summary };
}

export function handledGuestTables(snapshot, previous) {
  const handled = {};
  for (const { languageId } of IMPORT_LANGUAGES) {
    for (const table of IMPORT_TABLES) {
      const name = `${languageId}_${table}`;
      handled[name] = [...new Set([...(previous?.handled[name] ?? []), ...snapshot.tables[name].map(row => importIdentity(table, row))])];
    }
  }
  return handled;
}

export function mergeGuestRows(accountRows, guestRows, table, makeId) {
  // Existing account rows win. Never add counters or inflate a mastery streak.
  const result = [...accountRows];
  const known = new Set(accountRows.map(row => importIdentity(table, row)));
  const ids = new Set(accountRows.map(row => row.id));
  for (const row of guestRows) {
    const identity = importIdentity(table, row);
    if (known.has(identity)) continue;
    const id = makeId();
    if (typeof id !== 'string' || !id || ids.has(id)) throw new Error('Could not assign a unique learning record. Please retry.');
    result.push({ ...row, id });
    known.add(identity);
    ids.add(id);
  }
  return result;
}
