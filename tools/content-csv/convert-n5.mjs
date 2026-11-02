/**
 * Reproducible Conversion Pipeline for Client Japanese N5 Dataset.
 *
 * Source: tools/content-csv/data/swipe2study_N5_vocab.csv (client source, preserved unchanged)
 * Output Import CSV: tools/content-csv/data/N5_Swipe2Study_import.csv
 * Output Mapping JSON: tools/content-csv/data/N5_Swipe2Study_mapping.json
 *
 * Requirements:
 * - Exactly 706 vocabulary items and 2,118 examples in source order.
 * - 0 content rewrites of Japanese, kana, romaji, English, or Burmese.
 * - Sense-specific persistent ID generation distinguishing the 5 intentional duplicate pairs:
 *   あの, ある, かける, キロ, もう.
 * - Strict RFC 4180 CSV serialization with UTF-8 encoding.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './parser.mjs';
import { validateCsvRows } from './validator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');
const SOURCE_CSV_PATH = path.join(ROOT_DIR, 'tools/content-csv/data/swipe2study_N5_vocab.csv');
const IMPORT_CSV_PATH = path.join(ROOT_DIR, 'tools/content-csv/data/N5_Swipe2Study_import.csv');
const MAPPING_JSON_PATH = path.join(ROOT_DIR, 'tools/content-csv/data/N5_Swipe2Study_mapping.json');

export const HOMONYM_SENSE_WORDS = new Set(['あの', 'ある', 'かける', 'キロ', 'もう']);

/**
 * RFC 4180 CSV parser for source files.
 */
export function parseClientCsv(rawContent) {
  let content = rawContent.charCodeAt(0) === 0xFEFF ? rawContent.slice(1) : rawContent;
  const records = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const len = content.length;

  for (let i = 0; i < len; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < len && content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\r') {
        if (i + 1 < len && content[i + 1] === '\n') i++;
        row.push(field);
        records.push(row);
        row = [];
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        records.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }

  if (row.length > 0 || field.length > 0) {
    row.push(field);
    records.push(row);
  }

  return records;
}

/**
 * Escapes field for RFC 4180 CSV serialization.
 */
export function escapeCsvField(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

/**
 * Computes deterministic sense-specific hash for N5 vocabulary item.
 */
export function computeN5ItemHash(courseId, writtenForm, reading, senseIndex, isHomonym) {
  const payload = isHomonym
    ? [courseId, writtenForm, reading, senseIndex]
    : [courseId, writtenForm, reading];
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24);
}

/**
 * Performs conversion from client source CSV to Swipe2Study import contract.
 */
export function convertN5Dataset({ sourcePath = SOURCE_CSV_PATH, importCsvPath = IMPORT_CSV_PATH, mappingJsonPath = MAPPING_JSON_PATH } = {}) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source CSV not found at: ${sourcePath}`);
  }

  const raw = fs.readFileSync(sourcePath, 'utf8');
  const allRows = parseClientCsv(raw);
  if (allRows.length < 2) {
    throw new Error('Client CSV has no data rows.');
  }

  const headerRow = allRows[0];
  const expectedClientHeaders = [
    'level', 'character', 'kana', 'pronunciation', 'part_of_speech', 'definition', 'burmese_definition',
    'ex1_text', 'ex1_reading', 'ex1_romaji', 'ex1_english', 'ex1_burmese',
    'ex2_text', 'ex2_reading', 'ex2_romaji', 'ex2_english', 'ex2_burmese',
    'ex3_text', 'ex3_reading', 'ex3_romaji', 'ex3_english', 'ex3_burmese',
  ];

  for (let c = 0; c < expectedClientHeaders.length; c++) {
    const actual = (headerRow[c] || '').trim();
    const expected = expectedClientHeaders[c];
    if (actual !== expected && actual !== '\uFEFF' + expected) {
      throw new Error(`Header mismatch at column ${c + 1}: expected '${expected}', got '${actual}'`);
    }
  }

  const dataRows = allRows.slice(1).filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
  if (dataRows.length !== 706) {
    throw new Error(`Expected exactly 706 data rows, found ${dataRows.length}`);
  }

  const homonymCounts = new Map();
  const seenIds = new Set();
  const mappingRecords = [];
  const importCsvLines = [
    'id,course_id,language,level_id,written_form,reading,meaning_english,meaning_burmese,audio_path,examples_json,sort_order',
  ];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const sourceRowNumber = i + 1;
    const sourceCsvLine = i + 2;

    const level = (row[0] || '').trim();
    const character = (row[1] || '').trim();
    const kana = (row[2] || '').trim();
    const pronunciation = (row[3] || '').trim(); // word romaji
    const partOfSpeech = (row[4] || '').trim();
    const definition = (row[5] || '').trim(); // English meaning
    const burmeseDefinition = (row[6] || '').trim();

    if (level !== 'N5') {
      throw new Error(`Row ${sourceRowNumber}: expected level 'N5', got '${level}'`);
    }
    if (!character) throw new Error(`Row ${sourceRowNumber}: missing character`);
    if (!kana) throw new Error(`Row ${sourceRowNumber}: missing kana`);
    if (!pronunciation) throw new Error(`Row ${sourceRowNumber}: missing pronunciation`);
    if (!definition) throw new Error(`Row ${sourceRowNumber}: missing definition`);
    if (!burmeseDefinition) throw new Error(`Row ${sourceRowNumber}: missing burmese_definition`);

    const isHomonym = HOMONYM_SENSE_WORDS.has(character);
    let senseIndex = 1;
    if (isHomonym) {
      senseIndex = (homonymCounts.get(character) || 0) + 1;
      homonymCounts.set(character, senseIndex);
    }

    const hash = computeN5ItemHash('ja-n5', character, kana, senseIndex, isHomonym);
    const id = `ja-n5-${hash}`;

    if (seenIds.has(id)) {
      throw new Error(`Critical collision: generated duplicate ID '${id}' at row ${sourceRowNumber}`);
    }
    seenIds.add(id);

    // Assemble exactly 3 examples per row
    const examples = [];
    for (let exIdx = 1; exIdx <= 3; exIdx++) {
      const baseCol = 7 + (exIdx - 1) * 5;
      const exText = (row[baseCol] || '').trim();
      const exReading = (row[baseCol + 1] || '').trim(); // example kana reading
      const exRomaji = (row[baseCol + 2] || '').trim(); // example romaji transcription
      const exEnglish = (row[baseCol + 3] || '').trim();
      const exBurmese = (row[baseCol + 4] || '').trim();

      if (!exText) throw new Error(`Row ${sourceRowNumber}: missing example ${exIdx} text`);
      if (!exEnglish) throw new Error(`Row ${sourceRowNumber}: missing example ${exIdx} english`);
      if (!exBurmese) throw new Error(`Row ${sourceRowNumber}: missing example ${exIdx} burmese`);

      examples.push({
        text: exText,
        reading: exRomaji,
        kana: exReading,
        romaji: exRomaji,
        english: exEnglish,
        burmese: exBurmese,
      });
    }

    const sortOrder = (i + 1) * 10;
    const plannedAudioPath = `audio/ja/n5/${id}.mp3`;

    // 1. Record in persistent mapping JSON
    mappingRecords.push({
      source_row: sourceRowNumber,
      source_csv_line: sourceCsvLine,
      id,
      hash,
      natural_identity: {
        written_form: character,
        reading: kana,
        kana,
        romaji: pronunciation,
      },
      part_of_speech: partOfSpeech,
      character,
      kana,
      pronunciation,
      romaji: pronunciation,
      meaning_english: definition,
      meaning_burmese: burmeseDefinition,
      examples_count: 3,
      sort_order: sortOrder,
      audio_path: null,
      planned_audio_path: plannedAudioPath,
      sense_index: isHomonym ? senseIndex : 1,
      is_intentional_homonym_sense: isHomonym,
    });

    // 2. Format import CSV row
    // Contract: id,course_id,language,level_id,written_form,reading,meaning_english,meaning_burmese,audio_path,examples_json,sort_order
    const csvFields = [
      escapeCsvField(id),
      escapeCsvField('ja-n5'),
      escapeCsvField('ja'),
      escapeCsvField('N5'),
      escapeCsvField(character),
      escapeCsvField(kana),
      escapeCsvField(definition),
      escapeCsvField(burmeseDefinition),
      escapeCsvField(''), // audio_path blank initially
      escapeCsvField(JSON.stringify(examples)),
      escapeCsvField(sortOrder),
    ];
    importCsvLines.push(csvFields.join(','));
  }

  // Ensure all 5 homonyms had exactly 2 senses each
  for (const homonym of HOMONYM_SENSE_WORDS) {
    const count = homonymCounts.get(homonym) || 0;
    if (count !== 2) {
      throw new Error(`Expected exactly 2 senses for homonym '${homonym}', found ${count}`);
    }
  }

  // Write import CSV (UTF-8)
  fs.writeFileSync(importCsvPath, importCsvLines.join('\n') + '\n', 'utf8');

  // Write mapping JSON (UTF-8, formatted)
  const mappingDocument = {
    course_id: 'ja-n5',
    level_id: 'N5',
    language: 'ja',
    total_records: dataRows.length,
    total_examples: dataRows.length * 3,
    id_generation: {
      strategy: 'deterministic_sha256_sense_disambiguated',
      format: 'ja-n5-<sha256(JSON.stringify([course_id, written_form, reading, sense_index?])).slice(0, 24)>',
      reconciled_against_canonical: false,
      reconciled_count: 0,
      hosted_reconciliation_status: 'pending_before_publication',
      duplicate_identity_pairs_handled: 5,
    },
    audio_attachment_convention: {
      directory: 'audio/ja/n5',
      file_pattern: 'ja-n5-{hash}.mp3',
    },
    records: mappingRecords,
  };
  fs.writeFileSync(mappingJsonPath, JSON.stringify(mappingDocument, null, 2) + '\n', 'utf8');

  return {
    totalRecords: dataRows.length,
    totalExamples: dataRows.length * 3,
    importCsvPath,
    mappingJsonPath,
  };
}

// Execute directly if run as CLI script
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    console.log('Converting client Japanese N5 dataset...');
    const result = convertN5Dataset();
    console.log(`✓ Converted ${result.totalRecords} records and ${result.totalExamples} examples successfully.`);
    console.log(`  Import CSV: ${result.importCsvPath}`);
    console.log(`  Mapping JSON: ${result.mappingJsonPath}`);

    // Self-validate with repository validator
    const importRaw = fs.readFileSync(result.importCsvPath, 'utf8');
    const parsed = parseCsv(importRaw);
    const validation = validateCsvRows(parsed.rows);

    console.log('\nValidation Report:');
    console.log(`  Valid: ${validation.valid}`);
    console.log(`  Total Rows: ${validation.summary.total_rows}`);
    console.log(`  Errors: ${validation.errors.length}`);
    console.log(`  Warnings: ${validation.warnings.length}`);

    if (validation.errors.length > 0) {
      console.error('Validation Errors:');
      console.error(validation.errors);
      process.exit(1);
    }

    const expectedWarnings = validation.warnings.filter((w) => w.code === 'DUPLICATE_VOCABULARY_IDENTITY');
    console.log(`  Expected DUPLICATE_VOCABULARY_IDENTITY warnings: ${expectedWarnings.length}`);
    if (validation.warnings.length !== 5 || expectedWarnings.length !== 5) {
      console.error(`Expected exactly 5 duplicate identity warnings, got ${validation.warnings.length}`);
      process.exit(1);
    }
    console.log('✓ Validation passed with 0 errors and exactly 5 expected duplicate identity warnings.');
  } catch (err) {
    console.error('Conversion failed:', err);
    process.exit(1);
  }
}
