import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { parseCsv } from '../tools/content-csv/parser.mjs';
import { validateCsvRows } from '../tools/content-csv/validator.mjs';
import {
  mapCsvRowsToItems,
  calculateContentDiff,
  isContentEqual,
} from '../tools/content-csv/contentImportEngine.mjs';
import {
  convertN5Dataset,
  parseClientCsv,
} from '../tools/content-csv/convert-n5.mjs';
import { mapVocabularyToCard } from '../src/lib/publishedContentService.js';
import {
  studyWordKey,
  sameStudyWord,
  findSavedWord,
  buildSavedWordRecord,
  buildNormalSessionCards,
  buildStudiedKeySet,
} from '../src/lib/studyWords.js';
import {
  recordWordAction,
  getLevelProgress,
  getCourseProgress,
} from '../src/lib/vocabularyProgress.js';
import { createLocalDatabase } from '../src/lib/localDatabase.js';
import { sayOf, readingOf, kanaOf } from '../src/lib/entry.js';
import { getCourse } from '../src/courses/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'tools/content-csv/data');
const SOURCE_CSV_PATH = path.join(DATA_DIR, 'swipe2study_N5_vocab.csv');
const IMPORT_CSV_PATH = path.join(DATA_DIR, 'N5_Swipe2Study_import.csv');
const MAPPING_JSON_PATH = path.join(DATA_DIR, 'N5_Swipe2Study_mapping.json');

function createTestJaDb() {
  const tables = new Map();
  return createLocalDatabase({
    getScope: () => ({
      getTable: (lang, table) => tables.get(`${lang}:${table}`) ?? null,
      setTable: (lang, table, json) => tables.set(`${lang}:${table}`, json),
    }),
    getLanguage: () => 'ja',
  });
}

test('1. N5 Content Integrity: Exactly 706 entries and 2,118 examples match client source in source order', () => {
  assert.ok(fs.existsSync(SOURCE_CSV_PATH), 'Source CSV exists at tools/content-csv/data/swipe2study_N5_vocab.csv');
  assert.ok(fs.existsSync(IMPORT_CSV_PATH), 'Import CSV exists at tools/content-csv/data/N5_Swipe2Study_import.csv');
  assert.ok(fs.existsSync(MAPPING_JSON_PATH), 'Mapping JSON exists at tools/content-csv/data/N5_Swipe2Study_mapping.json');

  const sourceRaw = fs.readFileSync(SOURCE_CSV_PATH, 'utf8');
  const importRaw = fs.readFileSync(IMPORT_CSV_PATH, 'utf8');
  const mapping = JSON.parse(fs.readFileSync(MAPPING_JSON_PATH, 'utf8'));

  const sourceRows = parseClientCsv(sourceRaw).slice(1).filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
  const importParsed = parseCsv(importRaw);

  assert.equal(sourceRows.length, 706, 'Source CSV has exactly 706 entries');
  assert.equal(importParsed.rows.length, 706, 'Import CSV has exactly 706 rows');
  assert.equal(mapping.total_records, 706, 'Mapping JSON reports 706 records');
  assert.equal(mapping.total_examples, 2118, 'Mapping JSON reports 2,118 examples');
  assert.equal(mapping.records.length, 706, 'Mapping JSON records array length is 706');

  let totalExamples = 0;

  for (let i = 0; i < 706; i++) {
    const s = sourceRows[i];
    const imp = importParsed.rows[i].fields;
    const mapRec = mapping.records[i];

    // Source values
    const sChar = s[1].trim();
    const sKana = s[2].trim();
    const sPronunciation = s[3].trim();
    const sPos = s[4].trim();
    const sDef = s[5].trim();
    const sBurmese = s[6].trim();

    // Import CSV columns:
    // 0: id, 1: course_id, 2: language, 3: level_id, 4: written_form, 5: reading,
    // 6: meaning_english, 7: meaning_burmese, 8: audio_path, 9: examples_json, 10: sort_order
    assert.equal(imp[1], 'ja-n5', `Row ${i + 1} course_id must be ja-n5`);
    assert.equal(imp[2], 'ja', `Row ${i + 1} language must be ja`);
    assert.equal(imp[3], 'N5', `Row ${i + 1} level_id must be N5`);
    assert.equal(imp[4], sChar, `Row ${i + 1} written_form mismatch`);
    assert.equal(imp[5], sKana, `Row ${i + 1} reading (kana) mismatch`);
    assert.equal(imp[6], sDef, `Row ${i + 1} meaning_english mismatch`);
    assert.equal(imp[7], sBurmese, `Row ${i + 1} meaning_burmese mismatch`);
    assert.equal(imp[8], '', `Row ${i + 1} initial audio_path must be blank`);
    assert.equal(Number(imp[10]), (i + 1) * 10, `Row ${i + 1} sort_order mismatch`);

    // Mapping record integrity
    assert.equal(mapRec.source_row, i + 1);
    assert.equal(mapRec.id, imp[0]);
    assert.equal(mapRec.character, sChar);
    assert.equal(mapRec.kana, sKana);
    assert.equal(mapRec.pronunciation, sPronunciation);
    assert.equal(mapRec.romaji, sPronunciation);
    assert.equal(mapRec.part_of_speech, sPos);
    assert.equal(mapRec.meaning_english, sDef);
    assert.equal(mapRec.meaning_burmese, sBurmese);
    assert.equal(mapRec.planned_audio_path, `audio/ja/n5/${mapRec.id}.mp3`);

    // Decoded examples
    const examples = JSON.parse(imp[9]);
    assert.equal(examples.length, 3, `Row ${i + 1} must have exactly 3 examples`);
    totalExamples += examples.length;

    for (let exIdx = 0; exIdx < 3; exIdx++) {
      const baseCol = 7 + exIdx * 5;
      const ex = examples[exIdx];
      assert.equal(ex.text, s[baseCol].trim(), `Row ${i + 1} ex${exIdx + 1} text mismatch`);
      assert.equal(ex.kana, s[baseCol + 1].trim(), `Row ${i + 1} ex${exIdx + 1} kana mismatch`);
      assert.equal(ex.romaji, s[baseCol + 2].trim(), `Row ${i + 1} ex${exIdx + 1} romaji mismatch`);
      assert.equal(ex.reading, s[baseCol + 2].trim(), `Row ${i + 1} ex${exIdx + 1} reading (romaji) mismatch`);
      assert.equal(ex.english, s[baseCol + 3].trim(), `Row ${i + 1} ex${exIdx + 1} english mismatch`);
      assert.equal(ex.burmese, s[baseCol + 4].trim(), `Row ${i + 1} ex${exIdx + 1} burmese mismatch`);
    }
  }

  assert.equal(totalExamples, 2118, 'Total verified examples must be exactly 2,118');
});

test('2. Intentional Duplicate-Identity Pairs: All 5 pairs have unique IDs and distinct meanings', () => {
  const mapping = JSON.parse(fs.readFileSync(MAPPING_JSON_PATH, 'utf8'));
  const allIds = new Set(mapping.records.map((r) => r.id));
  assert.equal(allIds.size, 706, 'All 706 vocabulary IDs are globally unique');

  const expectedHomonyms = [
    {
      word: 'あの',
      sense1Pos: 'pre-noun adjective',
      sense1Def: 'that (over there)',
      sense2Pos: 'interjection',
      sense2Def: 'um; excuse me (to get attention)',
    },
    {
      word: 'ある',
      sense1Pos: 'verb',
      sense1Def: 'to be; to exist (for things)',
      sense2Pos: 'verb',
      sense2Def: 'to have (something)',
    },
    {
      word: 'かける',
      sense1Pos: 'verb',
      sense1Def: 'to wear (glasses); to hang; to put on',
      sense2Pos: 'verb',
      sense2Def: 'to make (a phone call)',
    },
    {
      word: 'キロ',
      sense1Pos: 'counter',
      sense1Def: 'kilogram (short for キログラム)',
      sense2Pos: 'counter',
      sense2Def: 'kilometer (short for キロメートル)',
    },
    {
      word: 'もう',
      sense1Pos: 'adverb',
      sense1Def: 'already; yet',
      sense2Pos: 'adverb',
      sense2Def: '(one) more; another',
    },
  ];

  for (const h of expectedHomonyms) {
    const senses = mapping.records.filter((r) => r.character === h.word);
    assert.equal(senses.length, 2, `Word '${h.word}' must have exactly 2 senses`);

    const [s1, s2] = senses;
    assert.notEqual(s1.id, s2.id, `Sense 1 and Sense 2 of '${h.word}' must have distinct IDs`);
    assert.equal(s1.is_intentional_homonym_sense, true);
    assert.equal(s2.is_intentional_homonym_sense, true);
    assert.equal(s1.sense_index, 1);
    assert.equal(s2.sense_index, 2);

    assert.equal(s1.part_of_speech, h.sense1Pos);
    assert.equal(s1.meaning_english, h.sense1Def);
    assert.equal(s2.part_of_speech, h.sense2Pos);
    assert.equal(s2.meaning_english, h.sense2Def);

    // Map to cards and check studyWordKey & sameStudyWord
    const card1 = mapVocabularyToCard({
      id: s1.id,
      course_id: 'ja-n5',
      written_form: s1.character,
      reading: s1.kana,
      romaji: s1.romaji,
      meaning_english: s1.meaning_english,
      meaning_burmese: s1.meaning_burmese,
      part_of_speech: s1.part_of_speech,
    }, { language: 'ja', level_id: 'N5' });

    const card2 = mapVocabularyToCard({
      id: s2.id,
      course_id: 'ja-n5',
      written_form: s2.character,
      reading: s2.kana,
      romaji: s2.romaji,
      meaning_english: s2.meaning_english,
      meaning_burmese: s2.meaning_burmese,
      part_of_speech: s2.part_of_speech,
    }, { language: 'ja', level_id: 'N5' });

    assert.notEqual(studyWordKey(card1), studyWordKey(card2), `studyWordKey must distinguish senses of '${h.word}'`);
    assert.equal(sameStudyWord(card1, card2), false, `sameStudyWord must be false for distinct senses of '${h.word}'`);
    assert.equal(sameStudyWord(card1, card1), true, `sameStudyWord must be true for identical sense of '${h.word}'`);
  }
});

test('3. Sense-Specific Application Flow: Bookmarks, Review, Learned, Session Exclusion, and Progress Calculation', () => {
  const db = createTestJaDb();
  const mapping = JSON.parse(fs.readFileSync(MAPPING_JSON_PATH, 'utf8'));

  // Take the two senses of 'あの'
  const anoSenses = mapping.records.filter((r) => r.character === 'あの');
  assert.equal(anoSenses.length, 2);

  const card1 = mapVocabularyToCard({
    id: anoSenses[0].id,
    course_id: 'ja-n5',
    written_form: anoSenses[0].character,
    reading: anoSenses[0].kana,
    romaji: anoSenses[0].romaji,
    meaning_english: anoSenses[0].meaning_english,
    meaning_burmese: anoSenses[0].meaning_burmese,
    part_of_speech: anoSenses[0].part_of_speech,
  }, { language: 'ja', level_id: 'N5' });

  const card2 = mapVocabularyToCard({
    id: anoSenses[1].id,
    course_id: 'ja-n5',
    written_form: anoSenses[1].character,
    reading: anoSenses[1].kana,
    romaji: anoSenses[1].romaji,
    meaning_english: anoSenses[1].meaning_english,
    meaning_burmese: anoSenses[1].meaning_burmese,
    part_of_speech: anoSenses[1].part_of_speech,
  }, { language: 'ja', level_id: 'N5' });

  // 1. Bookmark Isolation: saving Sense 1 does not mark Sense 2 as saved
  const savedRecord1 = buildSavedWordRecord(card1);
  db.set('saved_words', [{ id: 'saved_uuid_1', ...savedRecord1 }]);

  const savedWords = db.get('saved_words');
  assert.ok(findSavedWord(savedWords, card1), 'Sense 1 is found in saved words');
  assert.equal(findSavedWord(savedWords, card2), null, 'Sense 2 is NOT found in saved words when only Sense 1 is saved');

  // Now save Sense 2 as well: both remain independently preserved
  const savedRecord2 = buildSavedWordRecord(card2);
  db.set('saved_words', [
    { id: 'saved_uuid_1', ...savedRecord1 },
    { id: 'saved_uuid_2', ...savedRecord2 },
  ]);
  const twoSaved = db.get('saved_words');
  assert.equal(twoSaved.length, 2);
  assert.equal(findSavedWord(twoSaved, card1).id, 'saved_uuid_1');
  assert.equal(findSavedWord(twoSaved, card2).id, 'saved_uuid_2');

  // 2. Learning & Review Queue Isolation
  // Mark Sense 1 learned (swiped right)
  recordWordAction(db, { card: card1, direction: 'right' });
  let learned = db.get('learned_words');
  assert.equal(learned.length, 1);
  assert.equal(learned[0].character, 'あの');
  assert.equal(learned[0].status, 'known');
  assert.equal(learned[0].card_id, card1.card_id);

  // Swiping Sense 2 left (needs review) adds only Sense 2 to review queue
  recordWordAction(db, { card: card2, direction: 'left' });
  learned = db.get('learned_words');
  assert.equal(learned.length, 2, 'Learned words contains both distinct senses');

  const reviews = db.get('review_cards');
  assert.equal(reviews.length, 1, 'Review queue has exactly 1 item');
  assert.equal(reviews[0].id, card2.id, 'Only Sense 2 is in review queue');

  // 3. Normal Session Studied Exclusion Isolation
  // Sense 1 was swiped (seen = 1, known), Sense 2 was swiped (seen = 1, learning)
  const studiedKeys = buildStudiedKeySet(learned);
  assert.ok(studiedKeys.has(studyWordKey(card1)), 'Sense 1 key is in studiedKeys');
  assert.ok(studiedKeys.has(studyWordKey(card2)), 'Sense 2 key is in studiedKeys');

  // Verify that if ONLY Sense 1 had been studied, Sense 2 is NOT excluded
  const onlySense1Studied = buildStudiedKeySet([learned[0]]);
  assert.ok(onlySense1Studied.has(studyWordKey(card1)));
  assert.ok(!onlySense1Studied.has(studyWordKey(card2)), 'Sense 2 must NOT be in studied set when only Sense 1 was studied');

  const pool = [card1, card2];
  const sessionResult = buildNormalSessionCards(pool, onlySense1Studied, { sessionSize: 10 });
  assert.equal(sessionResult.cards.length, 1, 'Only unstudied card remains in deck');
  assert.equal(sessionResult.cards[0].id, card2.id, 'Unstudied card is Sense 2');

  // 4. Level and Course Progress Calculation
  const jaCourse = getCourse('ja');
  const courseProg = getCourseProgress(db, jaCourse, 'ja');
  assert.equal(courseProg.uniqueSeen, 2, 'Course progress reports 2 unique seen');
  assert.equal(courseProg.uniqueLearned, 1, 'Course progress reports 1 unique learned');

  // Both senses in curriculum: with only Sense 1 known, progress is 1 / 2 = 50%
  const partialProgress = getLevelProgress(db, 'N5', jaCourse, 'ja', [card1, card2]);
  assert.equal(partialProgress.uniqueLearned, 1, 'Exactly 1 sense is counted as learned');
  assert.equal(partialProgress.uniqueSeen, 2, 'Both senses are counted as seen');
  assert.equal(partialProgress.words, 2);
  assert.equal(partialProgress.percent, 50);

  // Now swipe right on Sense 2: progress reaches 2 / 2 = 100%
  recordWordAction(db, { card: card2, direction: 'right' });
  const fullProgress = getLevelProgress(db, 'N5', jaCourse, 'ja', [card1, card2]);
  assert.equal(fullProgress.uniqueLearned, 2, 'Both senses are counted as learned');
  assert.equal(fullProgress.words, 2);
  assert.equal(fullProgress.percent, 100);
  assert.equal(db.get('review_cards').length, 0, 'Review queue cleared when Sense 2 is learned');
});

test('4. Linguistic Preservation & Speech Synthesis (sayOf, kanaOf, readingOf)', () => {
  // Test a kanji word: '会う' (kana: 'あう', pronunciation: 'au')
  const kanjiItem = {
    id: 'ja-n5-kanji-test',
    course_id: 'ja-n5',
    written_form: '会う',
    reading: 'あう',
    kana: 'あう',
    romaji: 'au',
    pronunciation: 'au',
    meaning_english: 'to meet',
    meaning_burmese: 'တွေ့ဆုံသည်',
    part_of_speech: 'verb',
    examples: [
      {
        text: '明日、友達と会います。',
        reading: 'Ashita, tomodachi to aimasu.',
        kana: 'あした、ともだちとあいます。',
        romaji: 'Ashita, tomodachi to aimasu.',
        english: 'I will meet my friend tomorrow.',
        burmese: 'မနက်ဖြန် သူငယ်ချင်းနဲ့ တွေ့မယ်။',
      },
    ],
  };

  const card = mapVocabularyToCard(kanjiItem, { language: 'ja', level_id: 'N5' }, 0);

  // 1. Written form, pronunciation, reading, kana
  assert.equal(card.character, '会う');
  assert.equal(card.kana, 'あう');
  assert.equal(card.pronunciation, 'au');
  assert.equal(card.reading, 'au');
  assert.equal(card.part_of_speech, 'verb');

  // 2. kanaOf: when word has kanji, kanaOf returns the kana
  assert.equal(kanaOf(card), 'あう', 'kanaOf returns kana for kanji word');

  // 3. sayOf: returns kana so speech synthesis speaks accurate kana, not ambiguity
  assert.equal(sayOf(card), 'あう', 'sayOf returns kana for speech synthesis');

  // 4. readingOf: returns romaji
  assert.equal(readingOf(card), 'au', 'readingOf returns romaji');

  // 5. Test pure kana word: 'あの' (kana: 'あの', pronunciation: 'ano')
  const kanaItem = {
    id: 'ja-n5-kana-test',
    course_id: 'ja-n5',
    written_form: 'あの',
    reading: 'あの',
    kana: 'あの',
    romaji: 'ano',
    pronunciation: 'ano',
  };
  const kanaCard = mapVocabularyToCard(kanaItem, { language: 'ja', level_id: 'N5' }, 0);
  assert.equal(kanaOf(kanaCard), '', 'kanaOf is empty when word is already pure kana (no redundant display)');
  assert.equal(sayOf(kanaCard), 'あの', 'sayOf returns kana word');
  assert.equal(readingOf(kanaCard), 'ano', 'readingOf returns romaji');

  // 6. Example sentence speech & reading
  const ex = card.examples[0];
  assert.equal(sayOf(ex), 'あした、ともだちとあいます。', 'sayOf on example uses example kana reading');
  assert.equal(readingOf(ex), 'Ashita, tomodachi to aimasu.', 'readingOf on example uses example romaji');
});

test('5. CLI CSV Validation: N5_Swipe2Study_import.csv passes with 0 errors and exactly 5 duplicate identity warnings', () => {
  const importRaw = fs.readFileSync(IMPORT_CSV_PATH, 'utf8');
  const parsed = parseCsv(importRaw);
  assert.equal(parsed.rows.length, 706, 'Parsed exactly 706 data rows');

  const report = validateCsvRows(parsed.rows);
  assert.equal(report.valid, true, 'Validation passes with valid = true');
  assert.equal(report.errors.length, 0, 'Must have exactly 0 validation errors');
  assert.equal(report.summary.error_count, 0);
  assert.equal(report.summary.valid_rows, 706);

  // Exactly 5 warnings for the 5 duplicate pairs
  assert.equal(report.warnings.length, 5, 'Must have exactly 5 validation warnings');
  for (const w of report.warnings) {
    assert.equal(w.code, 'DUPLICATE_VOCABULARY_IDENTITY');
    assert.equal(w.column, 'written_form');
  }

  const warnedWords = report.warnings.map((w) => {
    const match = w.message.match(/Possible duplicate word identity '(.+?)'/);
    return match ? match[1] : null;
  });

  assert.deepEqual(warnedWords.sort(), ['あの', 'ある', 'かける', 'キロ', 'もう'].sort());
});

test('6. Conversion Reproducibility: Re-running conversion produces identical files and hashes', () => {
  const hashFile = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

  const csvHashBefore = hashFile(IMPORT_CSV_PATH);
  const jsonHashBefore = hashFile(MAPPING_JSON_PATH);

  // Re-run conversion
  const result = convertN5Dataset();
  assert.equal(result.totalRecords, 706);
  assert.equal(result.totalExamples, 2118);

  const csvHashAfter = hashFile(IMPORT_CSV_PATH);
  const jsonHashAfter = hashFile(MAPPING_JSON_PATH);

  assert.equal(csvHashBefore, csvHashAfter, 'Import CSV hash is 100% deterministic and reproducible');
  assert.equal(jsonHashBefore, jsonHashAfter, 'Mapping JSON hash is 100% deterministic and reproducible');
});

test('7. Content Manager & Diff Comparator: Enriches mapping and accurately detects changes', () => {
  const mapping = JSON.parse(fs.readFileSync(MAPPING_JSON_PATH, 'utf8'));
  const importRaw = fs.readFileSync(IMPORT_CSV_PATH, 'utf8');
  const parsed = parseCsv(importRaw);

  const items = mapCsvRowsToItems(parsed.rows.slice(0, 10), { mapping });
  assert.equal(items.length, 10);

  // Check enrichment
  for (let i = 0; i < 10; i++) {
    const item = items[i];
    const rec = mapping.records[i];
    assert.equal(item.id, rec.id);
    assert.equal(item.kana, rec.kana);
    assert.equal(item.romaji, rec.romaji);
    assert.equal(item.part_of_speech, rec.part_of_speech);
  }

  // Verify comparator recognizes identical items as unchanged
  for (let i = 0; i < 10; i++) {
    assert.equal(isContentEqual(items[i], items[i]), true, `Row ${i} should be content equal to itself`);
  }

  const identicalDiff = calculateContentDiff({
    currentItems: items,
    incomingItems: items,
  });
  assert.equal(identicalDiff.unchanged.length, 10);
  assert.equal(identicalDiff.updated.length, 0);
  assert.equal(identicalDiff.inserted.length, 0);
  assert.equal(identicalDiff.ambiguousChanges.length, 0);
});
