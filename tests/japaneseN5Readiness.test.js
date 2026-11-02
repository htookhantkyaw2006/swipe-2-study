import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCourse } from '../src/courses/index.js';
import {
  SUPPORTED_PUBLISHED_COURSES,
  resolvePublishedCourseId,
  isPublishedCourseLevel,
  mapVocabularyToCard,
} from '../src/lib/publishedContentService.js';
import { speechLang } from '../src/lib/speech.js';
import { setActiveLanguageId } from '../src/lib/activeLanguage.js';
import { parseCsv } from '../tools/content-csv/parser.mjs';
import { validateCsvRows } from '../tools/content-csv/validator.mjs';
import { createLocalDatabase } from '../src/lib/localDatabase.js';
import { getLevelProgress, recordWordAction } from '../src/lib/vocabularyProgress.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

test('1. Japanese Course Architecture: N5 is index 0 launch level, N4-N1 are progressive', () => {
  const ja = getCourse('ja');
  assert.equal(ja.id, 'ja');
  assert.equal(ja.levelSystem, 'JLPT');
  assert.ok(Array.isArray(ja.levels) && ja.levels.length === 5);

  // N5 must be the first level (index 0) — launch course
  assert.equal(ja.levels[0].id, 'N5', 'Index 0 level must be N5');
  assert.equal(ja.levels[0].badge, 'N5');
  assert.equal(ja.levels[0].tier, 'BEGINNER');

  // Progressive order N5 -> N4 -> N3 -> N2 -> N1
  assert.equal(ja.levels[1].id, 'N4');
  assert.equal(ja.levels[2].id, 'N3');
  assert.equal(ja.levels[3].id, 'N2');
  assert.equal(ja.levels[4].id, 'N1');

  // N1 must NOT be treated as launch course
  assert.notEqual(ja.levels[0].id, 'N1');

  // Speech accent must default to ja-JP
  assert.equal(ja.speech.defaultAccent, 'ja-JP');
  assert.ok(ja.speech.accents.some((a) => a.value === 'ja-JP'));
});

test('2. Published Course Service: Scope is strictly limited to ja-n5 for Japanese', () => {
  assert.ok(SUPPORTED_PUBLISHED_COURSES['ja-n5']);
  assert.deepEqual(SUPPORTED_PUBLISHED_COURSES['ja-n5'], {
    courseId: 'ja-n5',
    languageId: 'ja',
    levelId: 'N5',
  });

  // N5 resolves cleanly
  assert.equal(resolvePublishedCourseId('ja', 'N5'), 'ja-n5');
  assert.equal(resolvePublishedCourseId('ja', '5'), 'ja-n5');
  assert.equal(resolvePublishedCourseId('ja', 'JLPT N5'), 'ja-n5');
  assert.equal(isPublishedCourseLevel('ja', 'N5'), true);

  // Unpublished levels (N4, N3, N2, N1) must return null (honestly unavailable)
  assert.equal(resolvePublishedCourseId('ja', 'N4'), null);
  assert.equal(resolvePublishedCourseId('ja', 'N3'), null);
  assert.equal(resolvePublishedCourseId('ja', 'N2'), null);
  assert.equal(resolvePublishedCourseId('ja', 'N1'), null);
  assert.equal(isPublishedCourseLevel('ja', 'N1'), false);
});

test('3. Japanese Vocabulary Card Mapping: Preserves Kanji written form, Kana reading, and audio', () => {
  const rawItem = {
    id: 'ja_n5_001',
    course_id: 'ja-n5',
    language: 'ja',
    level_id: 'N5',
    written_form: '私',
    reading: 'わたし',
    meaning_english: 'I; me',
    meaning_burmese: 'ကျွန်တော် / ကျွန်မ',
    audio_path: 'audio/ja/n5/001.mp3',
    examples: [
      {
        text: '私は学生です。',
        reading: 'Watashi wa gakusei desu.',
        english: 'I am a student.',
        burmese: 'ကျွန်တော်/မ ကျောင်းသားပါ။',
      },
    ],
    sort_order: 10,
    is_active: true,
  };

  const card = mapVocabularyToCard(rawItem, { language: 'ja', level_id: 'N5' }, 0);
  assert.equal(card.id, 'ja_n5_001');
  assert.equal(card.course_id, 'ja-n5');
  assert.equal(card.language, 'ja');
  assert.equal(card.level, 'N5');
  assert.equal(card.character, '私');
  assert.equal(card.kana, 'わたし');
  assert.equal(card.pronunciation, 'わたし');
  assert.equal(card.definition, 'I; me');
  assert.equal(card.burmese_definition, 'ကျွန်တော် / ကျွန်မ');
  assert.equal(card.audio_path, 'audio/ja/n5/001.mp3');
  assert.equal(card.examples.length, 1);
  assert.equal(card.lesson_name, 'JLPT N5 Vocabulary');
});

test('4. Japanese CSV Validation: valid-ja-n5.csv fixture passes all schema checks', () => {
  const csvPath = path.join(ROOT_DIR, 'tools/content-csv/fixtures/valid-ja-n5.csv');
  const raw = fs.readFileSync(csvPath, 'utf8');
  const parsed = parseCsv(raw);
  assert.equal(parsed.rows.length, 3);

  const report = validateCsvRows(parsed.rows);
  assert.equal(report.valid, true);
  assert.equal(report.errors.length, 0, 'Must have 0 validation errors');
  assert.equal(report.summary.valid_rows, 3);
});

test('5. Japanese Speech & Learning Progress Integration', () => {
  setActiveLanguageId('ja');
  assert.equal(speechLang(), 'ja-JP', 'Speech must use ja-JP for Japanese');

  const tables = new Map();
  const db = createLocalDatabase({
    getScope: () => ({
      getTable: (lang, table) => tables.get(`${lang}:${table}`) ?? null,
      setTable: (lang, table, json) => tables.set(`${lang}:${table}`, json),
    }),
    getLanguage: () => 'ja',
  });

  const jaCard = {
    id: 'ja_n5_001',
    character: '私',
    pronunciation: 'わたし',
    reading: 'わたし',
    level: 'N5',
  };

  // Record right swipe
  recordWordAction(db, { card: jaCard, direction: 'right' });
  const learned = db.get('learned_words');
  assert.equal(learned.length, 1);
  assert.equal(learned[0].character, '私');
  assert.equal(learned[0].status, 'known');

  // Derived level progress
  const jaCourse = getCourse('ja');
  const progress = getLevelProgress(db, 'N5', jaCourse, 'ja', [jaCard]);
  assert.equal(progress.uniqueLearned, 1);
  assert.equal(progress.words, 1);
  assert.equal(progress.percent, 100);

  // Reset active language back to zh
  setActiveLanguageId('zh');
});
