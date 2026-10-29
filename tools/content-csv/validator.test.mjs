import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseCsv, CsvParseError, EXPECTED_HEADERS, MAX_INPUT_BYTES } from './parser.mjs';
import { validateCsvRows } from './validator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const CLI_PATH = path.join(__dirname, 'validate.mjs');

// ---------------------------------------------------------------------------
// 1. Valid Fixtures (Chinese & Japanese)
// ---------------------------------------------------------------------------
test('valid fixtures: Chinese HSK1 fixture passes validation with zero errors', () => {
  const content = fs.readFileSync(path.join(FIXTURES_DIR, 'valid-zh-hsk1.csv'), 'utf8');
  const parsed = parseCsv(content);
  assert.equal(parsed.rows.length, 3);

  const result = validateCsvRows(parsed.rows);
  assert.equal(result.valid, true);
  assert.equal(result.summary.error_count, 0);
  assert.equal(result.summary.valid_rows, 3);
  assert.equal(result.errors.length, 0);
});

test('valid fixtures: Japanese N5 fixture passes validation with zero errors', () => {
  const content = fs.readFileSync(path.join(FIXTURES_DIR, 'valid-ja-n5.csv'), 'utf8');
  const parsed = parseCsv(content);
  assert.equal(parsed.rows.length, 3);

  const result = validateCsvRows(parsed.rows);
  assert.equal(result.valid, true);
  assert.equal(result.summary.error_count, 0);
  assert.equal(result.summary.valid_rows, 3);
  assert.equal(result.errors.length, 0);
});

// ---------------------------------------------------------------------------
// 2. Parser Capabilities: BOM, CRLF, Multiline, Escaped Quotes
// ---------------------------------------------------------------------------
test('parser: UTF-8 BOM is stripped seamlessly without corrupting headers', () => {
  const rawWithBom = '\uFEFF' + EXPECTED_HEADERS.join(',') + '\n' +
    'zh_1,zh-hsk1,zh,HSK1,字,zì,character,စာလုံး,,[],1\n';
  const parsed = parseCsv(rawWithBom);
  assert.equal(parsed.headers[0], 'id');
  assert.equal(parsed.rows.length, 1);
  const result = validateCsvRows(parsed.rows);
  assert.equal(result.valid, true);
});

test('parser: CRLF and LF line endings produce identical results', () => {
  const header = EXPECTED_HEADERS.join(',');
  const row = 'zh_1,zh-hsk1,zh,HSK1,字,zì,character,စာလုံး,,[],1';

  const lfContent = `${header}\n${row}\n`;
  const crlfContent = `${header}\r\n${row}\r\n`;

  const parsedLf = parseCsv(lfContent);
  const parsedCrlf = parseCsv(crlfContent);

  assert.deepEqual(parsedLf.headers, parsedCrlf.headers);
  assert.deepEqual(parsedLf.rows, parsedCrlf.rows);
});

test('parser: handles multiline quoted fields, commas, and escaped quotes', () => {
  const csv = `${EXPECTED_HEADERS.join(',')}\n` +
    'zh_1,zh-hsk1,zh,HSK1,吃,chī,"to eat,\nto consume","စားသည်,\nသုံးဆောင်သည်",audio/01.mp3,"[{""text"": ""请吃苹果。""}]",10\n';

  const parsed = parseCsv(csv);
  assert.equal(parsed.rows.length, 1);
  const fields = parsed.rows[0].fields;

  // Multiline English meaning with comma
  assert.equal(fields[6], 'to eat,\nto consume');
  // Multiline Burmese meaning with comma
  assert.equal(fields[7], 'စားသည်,\nသုံးဆောင်သည်');
  // Escaped quotes in JSON string
  assert.equal(fields[9], '[{"text": "请吃苹果。"}]');
});

test('parser: rejects malformed quoting and unclosed quotes', () => {
  const unclosed = `${EXPECTED_HEADERS.join(',')}\n` +
    'zh_1,zh-hsk1,zh,HSK1,吃,chī,"unclosed string,စားသည်,,[],10';

  assert.throws(
    () => parseCsv(unclosed),
    (err) => err instanceof CsvParseError && err.code === 'UNCLOSED_QUOTE'
  );

  const strayQuote = `${EXPECTED_HEADERS.join(',')}\n` +
    'zh_1,zh-hsk1,zh,HSK1,吃,ch"ī,eat,စားသည်,,[],10';

  assert.throws(
    () => parseCsv(strayQuote),
    (err) => err instanceof CsvParseError && err.code === 'MALFORMED_QUOTING'
  );
});

test('parser: rejects inconsistent column counts', () => {
  // Row has only 9 columns instead of 11
  const badCols = `${EXPECTED_HEADERS.join(',')}\n` +
    'zh_1,zh-hsk1,zh,HSK1,吃,chī,eat,စားသည်,10\n';

  assert.throws(
    () => parseCsv(badCols),
    (err) => err instanceof CsvParseError && err.code === 'INCONSISTENT_COLUMN_COUNT' && err.row === 2
  );
});

test('parser: rejects invalid, duplicate, or missing headers', () => {
  // Missing sort_order header
  const shortHeaders = EXPECTED_HEADERS.slice(0, 10).join(',') + '\n';
  assert.throws(
    () => parseCsv(shortHeaders),
    (err) => err instanceof CsvParseError && err.code === 'INVALID_HEADER_COUNT'
  );

  // Duplicate header name
  const duplicateHeader = EXPECTED_HEADERS.slice(0, 10).concat('id').join(',') + '\n';
  assert.throws(
    () => parseCsv(duplicateHeader),
    (err) => err instanceof CsvParseError && err.code === 'DUPLICATE_HEADER'
  );

  // Mismatched header name
  const badName = EXPECTED_HEADERS.slice(0, 10).concat('wrong_col').join(',') + '\n';
  assert.throws(
    () => parseCsv(badName),
    (err) => err instanceof CsvParseError && err.code === 'HEADER_MISMATCH'
  );
});

// ---------------------------------------------------------------------------
// 3. Schema & Business Rules Validation
// ---------------------------------------------------------------------------
test('validator: rejects duplicate vocabulary IDs across file', () => {
  const content = fs.readFileSync(path.join(FIXTURES_DIR, 'invalid-duplicate-id.csv'), 'utf8');
  const parsed = parseCsv(content);
  const result = validateCsvRows(parsed.rows);

  assert.equal(result.valid, false);
  const err = result.errors.find((e) => e.code === 'DUPLICATE_ID');
  assert.ok(err, 'Must emit DUPLICATE_ID error');
  assert.equal(err.row, 3);
  assert.equal(err.column, 'id');
});

test('validator: enforces ID, course_id, and level_id schema limits', () => {
  const longId = 'a'.repeat(151);
  const longCourseId = 'c'.repeat(101);
  const longLevelId = 'l'.repeat(101);

  const parsed = {
    rows: [
      {
        rowNumber: 2,
        fields: [longId, longCourseId, 'zh', longLevelId, '字', 'zì', 'char', 'စာ', '', '[]', '1'],
      },
    ],
  };

  const result = validateCsvRows(parsed.rows);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === 'ID_TOO_LONG'));
  assert.ok(result.errors.some((e) => e.code === 'COURSE_ID_TOO_LONG'));
  assert.ok(result.errors.some((e) => e.code === 'LEVEL_ID_TOO_LONG'));
});

test('validator: rejects invalid language codes', () => {
  const parsed = {
    rows: [
      {
        rowNumber: 2,
        fields: ['id1', 'c1', 'fr', 'L1', 'mot', 'reading', 'word', 'စကားလုံး', '', '[]', '1'],
      },
    ],
  };

  const result = validateCsvRows(parsed.rows);
  assert.equal(result.valid, false);
  const err = result.errors.find((e) => e.code === 'INVALID_LANGUAGE');
  assert.ok(err);
  assert.equal(err.column, 'language');
});

test('validator: detects conflicting course metadata and duplicate level assignments', () => {
  const content = fs.readFileSync(path.join(FIXTURES_DIR, 'invalid-course-conflict.csv'), 'utf8');
  const parsed = parseCsv(content);
  const result = validateCsvRows(parsed.rows);

  assert.equal(result.valid, false);
  const err = result.errors.find((e) => e.code === 'CONFLICTING_COURSE_METADATA');
  assert.ok(err, 'Must emit CONFLICTING_COURSE_METADATA');
  assert.equal(err.row, 3);
});

test('validator: requires at least one meaning and warns on missing other language', () => {
  const content = fs.readFileSync(path.join(FIXTURES_DIR, 'warnings-partial-meanings-and-dupes.csv'), 'utf8');
  const parsed = parseCsv(content);
  const result = validateCsvRows(parsed.rows);

  assert.equal(result.valid, true); // Warnings do not invalidate file
  assert.equal(result.summary.error_count, 0);

  const missingBurmese = result.warnings.find((w) => w.code === 'MISSING_BURMESE_MEANING');
  assert.ok(missingBurmese);
  assert.equal(missingBurmese.row, 2);

  const missingEnglish = result.warnings.find((w) => w.code === 'MISSING_ENGLISH_MEANING');
  assert.ok(missingEnglish);
  assert.equal(missingEnglish.row, 3);

  const dupeIdentity = result.warnings.find((w) => w.code === 'DUPLICATE_VOCABULARY_IDENTITY');
  assert.ok(dupeIdentity);
  assert.equal(dupeIdentity.row, 4);

  // Both missing meaning produces an error
  const bothMissing = {
    rows: [
      {
        rowNumber: 2,
        fields: ['id1', 'c1', 'zh', 'HSK1', '字', 'zì', '', '', '', '[]', '1'],
      },
    ],
  };
  const bothMissingRes = validateCsvRows(bothMissing.rows);
  assert.equal(bothMissingRes.valid, false);
  assert.ok(bothMissingRes.errors.some((e) => e.code === 'MISSING_MEANING'));
});

test('validator: validates examples_json array shape, max 3 items, and fields', () => {
  const content = fs.readFileSync(path.join(FIXTURES_DIR, 'invalid-examples.csv'), 'utf8');
  const parsed = parseCsv(content);
  const result = validateCsvRows(parsed.rows);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === 'INVALID_JSON'));
  assert.ok(result.errors.some((e) => e.code === 'INVALID_EXAMPLE_TEXT'));
  assert.ok(result.errors.some((e) => e.code === 'TOO_MANY_EXAMPLES'));

  // Blank examples_json is treated as [] and valid
  const blankExamples = {
    rows: [
      {
        rowNumber: 2,
        fields: ['id1', 'c1', 'zh', 'HSK1', '字', 'zì', 'char', 'စာ', '', '', '1'],
      },
    ],
  };
  const blankRes = validateCsvRows(blankExamples.rows);
  assert.equal(blankRes.valid, true);
});

test('validator: enforces sort_order integer format and database bounds', () => {
  const invalidSortOrders = [
    { val: '1.5', code: 'INVALID_INTEGER' },
    { val: 'abc', code: 'INVALID_INTEGER' },
    { val: '', code: 'MISSING_SORT_ORDER' },
    { val: '2147483648', code: 'INTEGER_OUT_OF_RANGE' }, // > 2^31 - 1
    { val: '-2147483649', code: 'INTEGER_OUT_OF_RANGE' }, // < -2^31
  ];

  for (const { val, code } of invalidSortOrders) {
    const parsed = {
      rows: [
        {
          rowNumber: 2,
          fields: ['id1', 'c1', 'zh', 'HSK1', '字', 'zì', 'char', 'စာ', '', '[]', val],
        },
      ],
    };
    const res = validateCsvRows(parsed.rows);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.code === code), `Expected ${code} for sort_order='${val}'`);
  }
});

test('validator: enforces safe relative audio_path rules and rejects unsafe paths', () => {
  const content = fs.readFileSync(path.join(FIXTURES_DIR, 'invalid-audio-path.csv'), 'utf8');
  const parsed = parseCsv(content);
  const result = validateCsvRows(parsed.rows);

  assert.equal(result.valid, false);
  assert.equal(result.errors.filter((e) => e.code === 'UNSAFE_AUDIO_PATH').length, 4);
});

// ---------------------------------------------------------------------------
// 4. CLI Execution and Exit Codes
// ---------------------------------------------------------------------------
test('CLI: exits with code 0 on valid fixture and outputs valid JSON report', () => {
  const stdout = execFileSync(
    process.execPath,
    [CLI_PATH, path.join(FIXTURES_DIR, 'valid-zh-hsk1.csv')],
    { encoding: 'utf8' }
  );
  const report = JSON.parse(stdout);
  assert.equal(report.valid, true);
  assert.equal(report.summary.error_count, 0);
  assert.equal(report.summary.total_rows, 3);
});

test('CLI: exits with code 1 on validation error and outputs structured error report', () => {
  let exitCode = 0;
  let stdout = '';
  try {
    stdout = execFileSync(
      process.execPath,
      [CLI_PATH, path.join(FIXTURES_DIR, 'invalid-duplicate-id.csv')],
      { encoding: 'utf8' }
    );
  } catch (err) {
    exitCode = err.status;
    stdout = err.stdout;
  }

  assert.equal(exitCode, 1);
  const report = JSON.parse(stdout);
  assert.equal(report.valid, false);
  assert.equal(report.summary.error_count, 1);
  assert.equal(report.errors[0].code, 'DUPLICATE_ID');
});

test('CLI: exits with code 2 on missing arguments or non-existent file', () => {
  // 1. Missing arguments
  let missingArgsExit = 0;
  try {
    execFileSync(process.execPath, [CLI_PATH], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    missingArgsExit = err.status;
  }
  assert.equal(missingArgsExit, 2);

  // 2. Non-existent file
  let missingFileExit = 0;
  try {
    execFileSync(process.execPath, [CLI_PATH, 'non-existent-file.csv'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    missingFileExit = err.status;
  }
  assert.equal(missingFileExit, 2);
});

test('input bounding: MAX_INPUT_BYTES constant is 10 MiB', () => {
  assert.equal(MAX_INPUT_BYTES, 10 * 1024 * 1024);
});
