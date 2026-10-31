import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { parseCsv } from '../tools/content-csv/parser.mjs';
import { validateCsvRows } from '../tools/content-csv/validator.mjs';
import { calculateContentDiff, isContentEqual } from '../tools/content-csv/contentImportEngine.mjs';
import { mapVocabularyToCard } from '../src/lib/publishedContentService.js';
import { recordWordAction, getLearnedWords, getLevelProgress } from '../src/lib/vocabularyProgress.js';
import { createLocalDatabase } from '../src/lib/localDatabase.js';
import { resolveAudioUrl, playWordAudio } from '../src/lib/wordAudio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../tools/content-csv/data');
const VOCAB_CSV_PATH = path.join(DATA_DIR, 'HSK1_Swipe2Study_vocabulary.csv');
const IMPORT_CSV_PATH = path.join(DATA_DIR, 'HSK1_Swipe2Study_import.csv');
const MAPPING_JSON_PATH = path.join(DATA_DIR, 'HSK1_Swipe2Study_mapping.json');

function createTestLocalDb() {
  const tables = new Map();
  return createLocalDatabase({
    getScope: () => ({
      getTable: (lang, table) => tables.get(`${lang}:${table}`) ?? null,
      setTable: (lang, table, json) => tables.set(`${lang}:${table}`, json),
    }),
    getLanguage: () => 'zh',
  });
}

function parseGenericCsv(content) {
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  const records = [];
  let currentRecord = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  const len = content.length;
  while (i < len) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < len && content[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      currentField += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      currentRecord.push(currentField);
      currentField = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      if (i + 1 < len && content[i + 1] === '\n') i++;
      currentRecord.push(currentField);
      records.push(currentRecord);
      currentRecord = [];
      currentField = '';
      i++;
      continue;
    }
    if (ch === '\n') {
      currentRecord.push(currentField);
      records.push(currentRecord);
      currentRecord = [];
      currentField = '';
      i++;
      continue;
    }
    currentField += ch;
    i++;
  }
  if (currentRecord.length > 0 || currentField.length > 0) {
    currentRecord.push(currentField);
    records.push(currentRecord);
  }
  return records;
}

test('1. HSK1 Content Integrity: 300 words and 900 examples exactly match client source', () => {
  assert.equal(fs.existsSync(VOCAB_CSV_PATH), true, 'Source vocabulary CSV exists');
  assert.equal(fs.existsSync(IMPORT_CSV_PATH), true, 'Import CSV exists');
  assert.equal(fs.existsSync(MAPPING_JSON_PATH), true, 'Mapping JSON exists');

  const origRaw = fs.readFileSync(VOCAB_CSV_PATH, 'utf8');
  const impRaw = fs.readFileSync(IMPORT_CSV_PATH, 'utf8');

  const origRecords = parseGenericCsv(origRaw).slice(1);
  const impParsed = parseCsv(impRaw);

  assert.equal(origRecords.length, 300, 'Original source has exactly 300 rows');
  assert.equal(impParsed.rows.length, 300, 'Import dataset has exactly 300 rows');

  let exampleCount = 0;
  for (let i = 0; i < 300; i++) {
    const o = origRecords[i];
    const m = impParsed.rows[i].fields;

    // Written form, reading, definitions match exactly
    assert.equal(m[4], o[1], `Row ${i} written_form mismatch`);
    assert.equal(m[5], o[2], `Row ${i} reading mismatch`);
    assert.equal(m[6], o[4], `Row ${i} meaning_english mismatch`);
    assert.equal(m[7], o[5], `Row ${i} meaning_burmese mismatch`);

    // Audio path is null/blank initially
    assert.equal(m[8], '', `Row ${i} audio_path must be blank in initial import`);

    // Check examples
    const examples = JSON.parse(m[9]);
    assert.equal(examples.length, 3, `Row ${i} must have exactly 3 examples`);
    exampleCount += examples.length;

    for (let exIdx = 0; exIdx < 3; exIdx++) {
      const baseIdx = 6 + exIdx * 4;
      assert.equal(examples[exIdx].text, o[baseIdx], `Row ${i} ex${exIdx} text mismatch`);
      assert.equal(examples[exIdx].reading, o[baseIdx + 1], `Row ${i} ex${exIdx} reading mismatch`);
      assert.equal(examples[exIdx].english, o[baseIdx + 2], `Row ${i} ex${exIdx} english mismatch`);
      assert.equal(examples[exIdx].burmese, o[baseIdx + 3], `Row ${i} ex${exIdx} burmese mismatch`);
    }
  }

  assert.equal(exampleCount, 900, 'Total decoded examples must be exactly 900');
});

test('2. HSK1 CSV CLI Validation passes with 0 errors and 0 warnings', () => {
  const impRaw = fs.readFileSync(IMPORT_CSV_PATH, 'utf8');
  const parsed = parseCsv(impRaw);
  const result = validateCsvRows(parsed.rows);

  assert.equal(result.errors.length, 0, 'Zero validation errors');
  assert.equal(result.warnings.length, 0, 'Zero validation warnings');
  assert.equal(parsed.rows.length, 300);
});

test('3. Sidecar Mapping preserves part_of_speech and deterministic IDs', () => {
  const mapping = JSON.parse(fs.readFileSync(MAPPING_JSON_PATH, 'utf8'));

  assert.equal(mapping.course_id, 'zh-hsk1');
  assert.equal(mapping.level_id, 'HSK1');
  assert.equal(mapping.language, 'zh');
  assert.equal(mapping.total_records, 300);
  assert.equal(mapping.total_examples, 900);
  assert.equal(mapping.records.length, 300);
  assert.equal(mapping.id_generation.strategy, 'deterministic_sha256');
  assert.equal(mapping.id_generation.reconciled_against_canonical, false);
  assert.equal(mapping.id_generation.hosted_reconciliation_status, 'pending_before_publication');

  for (let i = 0; i < mapping.records.length; i++) {
    const r = mapping.records[i];
    assert.equal(r.source_row, i + 1);
    assert.ok(r.part_of_speech, `Row ${i} must preserve part_of_speech`);

    const expectedHash = crypto.createHash('sha256')
      .update(JSON.stringify(['zh-hsk1', r.natural_identity.written_form, r.natural_identity.reading]))
      .digest('hex')
      .slice(0, 24);

    assert.equal(r.hash, expectedHash);
    assert.equal(r.id, `zh-hsk1-${expectedHash}`);
    assert.equal(r.planned_audio_path, `audio/zh/hsk1/${r.id}.mp3`);
  }
});

class MockAudio {
  static instances = [];

  constructor(src) {
    this.src = src;
    this.listeners = new Map();
    this.playCallCount = 0;
    this.pauseCallCount = 0;
    this.playRejection = null;
    MockAudio.instances.push(this);
  }

  addEventListener(event, handler, options) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push({ handler, once: Boolean(options?.once) });
  }

  removeEventListener(event, handler) {
    if (!this.listeners.has(event)) return;
    const filtered = this.listeners.get(event).filter((l) => l.handler !== handler);
    this.listeners.set(event, filtered);
  }

  dispatchEvent(event) {
    const handlers = this.listeners.get(event.type) || [];
    const remaining = [];
    for (const item of handlers) {
      item.handler(event);
      if (!item.once) remaining.push(item);
    }
    this.listeners.set(event.type, remaining);
  }

  play() {
    this.playCallCount++;
    if (this.playRejection) {
      return Promise.reject(this.playRejection);
    }
    return Promise.resolve();
  }

  pause() {
    this.pauseCallCount++;
  }
}

test('4. Production audio playback helper verifies URL root resolution, offline mocks, once-only fallback, and cancellation', async () => {
  // 1. null, blank, and whitespace paths do not construct Audio and fall back to speech immediately
  const blankSpoken = [];
  const blankSpeak = (text) => blankSpoken.push(text);

  for (const emptyVal of [null, '', '   ']) {
    MockAudio.instances = [];
    blankSpoken.length = 0;
    const word = { character: '爱', reading: 'ài', audio_path: emptyVal };
    const playback = playWordAudio(word, { speakFn: blankSpeak, audioCtor: MockAudio });

    assert.equal(MockAudio.instances.length, 0, `Audio constructor must NOT be called for path: ${JSON.stringify(emptyVal)}`);
    assert.equal(blankSpoken.length, 1, `Speech fallback must be called immediately for path: ${JSON.stringify(emptyVal)}`);
    assert.equal(blankSpoken[0], '爱');
    assert.equal(playback.hasAudio, false);
    assert.equal(playback.url, null);
  }

  // 2. Relative audio_path resolves to the same final origin-root URL on /learn/level/HSK1 and /learn/session
  const relativePath = 'audio/zh/hsk1/zh-hsk1-2d3c1c3573f96f2fcb888e47.mp3';
  const urlOnLevel = resolveAudioUrl(relativePath, 'https://swipe2study.com/learn/level/HSK1');
  const urlOnSession = resolveAudioUrl(relativePath, 'https://swipe2study.com/learn/session');
  const urlWithLeadingSlash = resolveAudioUrl('/' + relativePath, 'https://swipe2study.com/learn/level/HSK1');

  assert.equal(urlOnLevel, 'https://swipe2study.com/audio/zh/hsk1/zh-hsk1-2d3c1c3573f96f2fcb888e47.mp3');
  assert.equal(urlOnSession, 'https://swipe2study.com/audio/zh/hsk1/zh-hsk1-2d3c1c3573f96f2fcb888e47.mp3');
  assert.equal(urlOnLevel, urlOnSession, 'Must resolve to identical origin-root URL regardless of nested router path');
  assert.equal(urlWithLeadingSlash, urlOnLevel, 'Leading slashes normalize to origin root');

  // 3. Valid recording plays and does not trigger speech fallback
  MockAudio.instances = [];
  const validSpoken = [];
  const validWord = {
    character: '爱',
    reading: 'ài',
    audio_path: relativePath,
  };
  const successPlayback = playWordAudio(validWord, {
    speakFn: (t) => validSpoken.push(t),
    audioCtor: MockAudio,
    baseOrigin: 'https://swipe2study.com',
  });

  assert.equal(MockAudio.instances.length, 1, 'Exactly 1 Audio instance created');
  assert.equal(MockAudio.instances[0].src, 'https://swipe2study.com/audio/zh/hsk1/zh-hsk1-2d3c1c3573f96f2fcb888e47.mp3');
  assert.equal(MockAudio.instances[0].playCallCount, 1, 'play() called on Audio');
  assert.equal(successPlayback.hasAudio, true);
  assert.equal(validSpoken.length, 0, 'Zero speech fallback calls when playback succeeds');

  // 4. Media error plus rejected play promise trigger speech fallback exactly once
  MockAudio.instances = [];
  const errorSpoken = [];
  let failingAudioInstance = null;
  class FailingAudio extends MockAudio {
    constructor(src) {
      super(src);
      failingAudioInstance = this;
      this.playRejection = new Error('NotAllowedError: media failed to decode');
    }
  }

  playWordAudio(validWord, {
    speakFn: (t) => errorSpoken.push(t),
    audioCtor: FailingAudio,
    baseOrigin: 'https://swipe2study.com',
  });

  assert.ok(failingAudioInstance, 'Failing audio instantiated');
  // Trigger both the error event AND let the rejected play() promise settle
  failingAudioInstance.dispatchEvent({ type: 'error' });
  await Promise.resolve(); // flush microtasks for promise.catch

  assert.equal(errorSpoken.length, 1, 'Speech fallback invoked exactly once despite both error event and rejected promise');
  assert.equal(errorSpoken[0], '爱');

  // 5. Cancelled or disposed playback does not trigger stale speech fallback when a card changes or session ends
  MockAudio.instances = [];
  const cancelSpoken = [];
  let delayedReject = null;
  class DelayedFailAudio extends MockAudio {
    constructor(src) {
      super(src);
      this.play = () => {
        this.playCallCount++;
        return new Promise((_, reject) => {
          delayedReject = reject;
        });
      };
    }
  }

  const cancelPlayback = playWordAudio(validWord, {
    speakFn: (t) => cancelSpoken.push(t),
    audioCtor: DelayedFailAudio,
    baseOrigin: 'https://swipe2study.com',
  });

  const delayedAudioInstance = MockAudio.instances[0];
  assert.equal(cancelSpoken.length, 0, 'No speech initially');

  // Learner swipes or leaves session -> component unmounts and cancels playback
  cancelPlayback.cancel();

  // Now the delayed network failure / decode error arrives
  delayedAudioInstance.dispatchEvent({ type: 'error' });
  if (delayedReject) {
    delayedReject(new Error('AbortError'));
  }
  await Promise.resolve();

  assert.equal(cancelSpoken.length, 0, 'Cancelled playback must NOT trigger speech fallback');
  assert.equal(delayedAudioInstance.pauseCallCount, 1, 'Audio paused on cancel');
  assert.equal(delayedAudioInstance.src, '', 'Audio src cleared on cancel');
});

test('5. Later audio-only updates preserve item identity, examples, and learner progress', () => {
  const localDb = createTestLocalDb();

  const originalItem = {
    id: 'zh-hsk1-2d3c1c3573f96f2fcb888e47',
    course_id: 'zh-hsk1',
    language: 'zh',
    level_id: 'HSK1',
    written_form: '爱',
    reading: 'ài',
    meaning_english: 'to love',
    meaning_burmese: 'ချစ်သည်',
    audio_path: null,
    examples: [{ text: '我爱我的家人。', reading: 'Wǒ ài wǒ de jiārén.', english: 'I love my family.', burmese: 'ကျွန်တော် မိသားစုကို ချစ်ပါတယ်။' }],
    sort_order: 10,
    is_active: true,
  };

  // 1. Learner marks word as learned before audio is recorded
  const cardBeforeAudio = mapVocabularyToCard(originalItem, { language: 'zh', level_id: 'HSK1' }, 0);
  recordWordAction(localDb, { card: cardBeforeAudio, direction: 'right' });

  // Bookmark in saved_words
  localDb.set('saved_words', [{
    id: originalItem.id,
    phrase: originalItem.written_form,
    reading: originalItem.reading,
    english: originalItem.meaning_english,
    burmese: originalItem.meaning_burmese,
  }]);

  const learnedBefore = getLearnedWords(localDb, 'zh');
  assert.equal(learnedBefore.length, 1);
  assert.equal(learnedBefore[0].character, '爱');
  assert.equal(learnedBefore[0].status, 'known');

  // 2. Later, operator supplies client-recorded audio
  const updatedItem = {
    ...originalItem,
    audio_path: 'audio/zh/hsk1/zh-hsk1-2d3c1c3573f96f2fcb888e47.mp3',
  };

  // 3. Verify content diff recognizes this as an update with 0 ambiguous identity changes
  const diff = calculateContentDiff({
    currentItems: [originalItem],
    incomingItems: [updatedItem],
  });

  assert.equal(diff.inserted.length, 0);
  assert.equal(diff.updated.length, 1, 'Recognized as an update');
  assert.equal(diff.updated[0].id, originalItem.id);
  assert.equal(diff.unchanged.length, 0);
  assert.equal(diff.retired.length, 0);
  assert.equal(diff.ambiguousChanges.length, 0, 'Zero ambiguous identity changes');

  // 4. Verify learner progress is completely preserved after mapping updated item
  const cardAfterAudio = mapVocabularyToCard(updatedItem, { language: 'zh', level_id: 'HSK1' }, 0);
  assert.equal(cardAfterAudio.id, originalItem.id, 'ID is unchanged');
  assert.equal(cardAfterAudio.audio_path, 'audio/zh/hsk1/zh-hsk1-2d3c1c3573f96f2fcb888e47.mp3');

  const progress = getLevelProgress(localDb, 'HSK1', { id: 'zh', levels: [{ id: 'HSK1', words: 300 }] }, null, [cardAfterAudio]);
  assert.equal(progress.uniqueLearned, 1, 'Learner progress remains 100% recognized');
  assert.equal(progress.words, 1, 'Target derived from loaded items');

  const savedWords = localDb.get('saved_words');
  assert.equal(savedWords.length, 1);
  assert.equal(savedWords[0].id, originalItem.id, 'Saved words link preserved');
});

test('6. Progress derivation eliminates hardcoded 150 count and scales to actual 300 items', () => {
  const localDb = createTestLocalDb();

  // Load all 300 records into memory cards
  const mapping = JSON.parse(fs.readFileSync(MAPPING_JSON_PATH, 'utf8'));
  const allCards = mapping.records.map((r) => ({
    id: r.id,
    character: r.natural_identity.written_form,
    pronunciation: r.natural_identity.reading,
    reading: r.natural_identity.reading,
    level: 'HSK1',
  }));

  assert.equal(allCards.length, 300);

  // Mark 30 words learned
  for (let i = 0; i < 30; i++) {
    recordWordAction(localDb, { card: allCards[i], direction: 'right' });
  }

  // Get progress using the 300 loaded cards
  const progress = getLevelProgress(localDb, 'HSK1', { id: 'zh', levels: [{ id: 'HSK1', words: 300 }] }, null, allCards);

  assert.equal(progress.words, 300, 'Derived count is 300, not hardcoded 150');
  assert.equal(progress.uniqueLearned, 30);
  assert.equal(progress.percent, 10, '30 / 300 = 10%');
});

test('7. Content diff comparator treats database JSONB key order as unchanged against CSV examples', () => {
  const impRaw = fs.readFileSync(IMPORT_CSV_PATH, 'utf8');
  const impParsed = parseCsv(impRaw);
  const rows = impParsed.rows.slice(0, 10);

  for (let i = 0; i < rows.length; i++) {
    const f = rows[i].fields;
    const csvExamples = JSON.parse(f[9]);

    // Simulate database JSONB key ordering (e.g. sorted keys or reversed insertion order)
    const dbExamples = csvExamples.map((ex) => ({
      burmese: ex.burmese,
      english: ex.english,
      reading: ex.reading,
      text: ex.text,
    }));

    const currentItem = {
      id: f[0],
      course_id: f[1],
      written_form: f[4],
      reading: f[5],
      meaning_english: f[6],
      meaning_burmese: f[7],
      audio_path: f[8] || null,
      examples: dbExamples,
      sort_order: parseInt(f[10], 10),
      is_active: true,
    };

    const incomingItem = {
      ...currentItem,
      examples: csvExamples,
    };

    assert.equal(isContentEqual(currentItem, incomingItem), true, `Row ${i} should be equal despite key order`);
    const diff = calculateContentDiff({ currentItems: [currentItem], incomingItems: [incomingItem] });
    assert.equal(diff.counts.unchanged, 1, `Row ${i} should be counted as unchanged`);
    assert.equal(diff.counts.updated, 0, `Row ${i} should not be counted as updated`);
  }
});
