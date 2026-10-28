import { readingOf, wordOf } from './entry.js';

export const CLOUD_KINDS = Object.freeze(['saved_words', 'review_cards', 'search_history',
  'written_chars', 'learned_radicals', 'learned_kana', 'learned_sounds']);
export const CLOUD_LANGUAGES = Object.freeze(['zh', 'ja', 'en']);
const FIELDS = { search_history: 'term', written_chars: 'character', learned_radicals: 'radical', learned_kana: 'kana', learned_sounds: 'sound' };
const RESERVED = new Set(['id', 'user_id', 'item_key', 'revision', 'reset_version', 'created_at', 'updated_at', 'language']);
const text = (value, empty = false) => typeof value === 'string' && value.length <= 2000 && (empty || value.trim().length > 0);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const invalid = () => new Error('Guest learning records have an unsupported cloud-import format. They have been kept on this device.');
export const decimalVersion = (value, positive = false) => typeof value === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(value)
  && value.trim() === value && BigInt(value) <= 9223372036854775807n && (!positive || BigInt(value) > 0n);
export const validTimestamp = value => typeof value === 'string' && value.length <= 64
  && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
  && Number.isFinite(Date.parse(value.slice(0, 10) + 'T00:00:00Z'))
  && new Date(value.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) === value.slice(0, 10);

export function validateCloudItem(item) {
  if (!object(item) || Object.keys(item).some(key => !['language', 'kind', 'written_form', 'reading', 'data', 'observed_at'].includes(key))
    || !CLOUD_LANGUAGES.includes(item.language) || !CLOUD_KINDS.includes(item.kind)
    || !text(item.written_form) || !text(item.reading, true) || !object(item.data)
    || Object.keys(item.data).some(key => RESERVED.has(key))
    || new TextEncoder().encode(JSON.stringify(item.data)).length > 16384
    || !validTimestamp(item.observed_at)) throw invalid();
  const fields = ['english', 'burmese', 'definition', 'burmese_definition', 'kana', 'part_of_speech', 'level', 'lesson_name'];
  for (const key of fields) if (item.data[key] !== undefined && (typeof item.data[key] !== 'string' || item.data[key].length > 10000)) throw invalid();
  if (item.data.examples !== undefined) {
    if (!Array.isArray(item.data.examples) || item.data.examples.length > 3) throw invalid();
    for (const example of item.data.examples) {
      if (!object(example)) throw invalid();
      for (const key of ['text', 'chinese', 'reading', 'pinyin', 'english', 'burmese']) if (example[key] !== undefined && (typeof example[key] !== 'string' || example[key].length > 10000)) throw invalid();
    }
  }
  if (!['saved_words', 'review_cards'].includes(item.kind) && item.reading !== '') throw invalid();
  if (item.kind.startsWith('learned_') && ['seen', 'correct', 'wrong', 'streak'].some(key => item.data[key] !== undefined)) {
    const { seen, correct, wrong, streak } = item.data;
    if ([seen, correct, wrong, streak].some(value => !Number.isSafeInteger(value) || value < 0)
      || seen !== correct + wrong || streak > correct) throw invalid();
  }
}

function observedAt(row, kind) {
  const value = row.updated_at ?? row.created_at;
  if (value !== undefined && value !== null) {
    if (!validTimestamp(value)) throw invalid();
    return new Date(value).toISOString();
  }
  if (kind === 'search_history' && /^\d{13}$/.test(String(row.id))) return new Date(Number(row.id)).toISOString();
  // Unknown legacy timestamps must not beat existing equally-seen progress.
  return '1970-01-01T00:00:00.000Z';
}

export function buildCloudImportItems(tables) {
  if (!object(tables)) throw invalid();
  const items = [];
  for (const language of CLOUD_LANGUAGES) for (const kind of CLOUD_KINDS) {
    const rows = tables[`${language}_${kind}`] ?? [];
    if (!Array.isArray(rows)) throw invalid();
    for (const row of rows) {
      if (!object(row) || (row.language !== undefined && row.language !== language)) throw invalid();
      // A user may review/bookmark a word originating in a seeded course.
      // Course provenance alone is not evidence that the learning record is fake.
      if (row.is_sample === true || row.isSample === true || row.demo === true) continue;
      const isWord = kind === 'saved_words' || kind === 'review_cards';
      const written = isWord ? wordOf(row) : row[FIELDS[kind]];
      const reading = isWord ? (row.pronunciation ?? readingOf(row)) : '';
      if (!text(written) || !text(reading, true)) throw invalid();
      const data = {};
      for (const [key, value] of Object.entries(row)) {
        if (RESERVED.has(key) || ['is_sample', 'isSample', 'seeded', 'demo'].includes(key)) continue;
        if (isWord && ['character', 'phrase', 'char', 'pronunciation', 'reading', 'pinyin'].includes(key)) continue;
        if (!isWord && key === FIELDS[kind]) continue;
        Object.defineProperty(data, key, { value, enumerable: true, writable: true, configurable: true });
      }
      const item = { language, kind, written_form: written.normalize('NFC').trim(), reading: reading.normalize('NFC').trim(), data, observed_at: observedAt(row, kind) };
      validateCloudItem(item);
      items.push(item);
    }
  }
  if (items.length > 5000 || new TextEncoder().encode(JSON.stringify(items)).length > 2097152) throw new Error('Guest learning is too large for one cloud import. It has been kept on this device.');
  return items;
}

export function cloudSnapshotTables(snapshot) {
  // This is a pure conversion only. Applying it over newer local activity needs
  // a separate, reviewed hydration/dirty-record protocol and atomic cache write.
  const tables = {};
  for (const language of CLOUD_LANGUAGES) for (const kind of CLOUD_KINDS) tables[`${language}_${kind}`] = [];
  for (const item of snapshot.items) {
    const row = { ...JSON.parse(JSON.stringify(item.data)), id: item.item_key, created_at: item.created_at, updated_at: item.updated_at };
    if (item.kind === 'saved_words') { row.phrase = item.written_form; row.reading = item.reading; }
    else if (item.kind === 'review_cards') { row.character = item.written_form; row.pronunciation = item.reading; }
    else row[FIELDS[item.kind]] = item.written_form;
    tables[`${item.language}_${item.kind}`].push(row);
  }
  return tables;
}
