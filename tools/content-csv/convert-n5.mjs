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
export function computeN5ItemHash(courseId, writtenForm, reading, senseIndex = 1) {
  const payload = [courseId, writtenForm, reading, senseIndex];
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24);
}

/**
 * Performs conversion from client source CSV to Swipe2Study import contract.
 */
export function convertN5Dataset({
  sourcePath = SOURCE_CSV_PATH,
  importCsvPath = IMPORT_CSV_PATH,
  mappingJsonPath = MAPPING_JSON_PATH,
  registryPath = null,
} = {}) {
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

  // Load existing authoritative registry if present
  let previousMapping = null;
  const candidateMappingPaths = [
    ...(registryPath ? [registryPath] : []),
    mappingJsonPath,
    path.join(path.dirname(mappingJsonPath), 'N5_mapping.json'),
    path.join(path.dirname(mappingJsonPath), 'N5_Swipe2Study_mapping.json'),
    path.join(ROOT_DIR, 'tools/content-csv/data/N5_mapping.json'),
    path.join(ROOT_DIR, 'tools/content-csv/data/N5_Swipe2Study_mapping.json'),
  ];
  for (const p of candidateMappingPaths) {
    if (fs.existsSync(p)) {
      try {
        previousMapping = JSON.parse(fs.readFileSync(p, 'utf8'));
        break;
      } catch {
        // ignore
      }
    }
  }

  const oldGroups = new Map();
  if (previousMapping && Array.isArray(previousMapping.records)) {
    for (const entry of previousMapping.records) {
      const char = entry?.source?.character || entry?.character;
      const kn = entry?.source?.kana || entry?.kana;
      const key = JSON.stringify(['ja-n5', char, kn]);
      if (!oldGroups.has(key)) oldGroups.set(key, []);
      oldGroups.get(key).push(entry);
    }
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
    const senseIndex = (homonymCounts.get(character) || 0) + 1;
    homonymCounts.set(character, senseIndex);

    const key = JSON.stringify(['ja-n5', character, kana]);
    const candidates = oldGroups.get(key) || [];
    let id;
    let ordinal;

    if (candidates.length === 1 && !isHomonym) {
      id = candidates[0].id;
      ordinal = candidates[0].sense_ordinal || candidates[0].sense_index || 1;
    } else if (candidates.length > 0) {
      const rowSig = JSON.stringify([partOfSpeech, definition, burmeseDefinition]);
      const match = candidates.find((c) => {
        const cSig = JSON.stringify([
          c?.source?.part_of_speech || c?.part_of_speech,
          c?.source?.definition || c?.meaning_english,
          c?.source?.burmese_definition || c?.meaning_burmese,
        ]);
        return cSig === rowSig;
      });
      if (match) {
        id = match.id;
        ordinal = match.sense_ordinal || match.sense_index || senseIndex;
      } else {
        ordinal = senseIndex;
        id = `ja-n5-${computeN5ItemHash('ja-n5', character, kana, ordinal)}`;
      }
    } else {
      ordinal = senseIndex;
      id = `ja-n5-${computeN5ItemHash('ja-n5', character, kana, ordinal)}`;
    }

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

    const sourceObj = {
      level,
      character,
      kana,
      pronunciation,
      part_of_speech: partOfSpeech,
      definition,
      burmese_definition: burmeseDefinition,
      ex1_text: (row[7] || '').trim(),
      ex1_reading: (row[8] || '').trim(),
      ex1_romaji: (row[9] || '').trim(),
      ex1_english: (row[10] || '').trim(),
      ex1_burmese: (row[11] || '').trim(),
      ex2_text: (row[12] || '').trim(),
      ex2_reading: (row[13] || '').trim(),
      ex2_romaji: (row[14] || '').trim(),
      ex2_english: (row[15] || '').trim(),
      ex2_burmese: (row[16] || '').trim(),
      ex3_text: (row[17] || '').trim(),
      ex3_reading: (row[18] || '').trim(),
      ex3_romaji: (row[19] || '').trim(),
      ex3_english: (row[20] || '').trim(),
      ex3_burmese: (row[21] || '').trim(),
    };

    const wordMetadata = {
      kana,
      romaji: pronunciation,
      part_of_speech: partOfSpeech,
    };

    // 1. Record in persistent mapping JSON
    mappingRecords.push({
      id,
      source_csv_row: sourceCsvLine,
      sense_ordinal: ordinal,
      source: sourceObj,
      word_metadata: wordMetadata,
      // Backward-compatible accessors
      source_row: sourceRowNumber,
      character,
      kana,
      pronunciation,
      romaji: pronunciation,
      part_of_speech: partOfSpeech,
      meaning_english: definition,
      meaning_burmese: burmeseDefinition,
      examples_count: 3,
      sort_order: sortOrder,
      audio_path: null,
      planned_audio_path: plannedAudioPath,
      sense_index: ordinal,
      is_intentional_homonym_sense: isHomonym,
    });

    // 2. Format import CSV row
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

  // Write import CSV (UTF-8 with BOM and CRLF to match client contract)
  fs.writeFileSync(importCsvPath, '\uFEFF' + importCsvLines.join('\r\n') + '\r\n', 'utf8');

  // Write mapping JSON (UTF-8, formatted)
  const mappingDocument = {
    course_id: 'ja-n5',
    language: 'ja',
    level_id: 'N5',
    source_sha256: crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex'),
    total_records: dataRows.length,
    total_examples: dataRows.length * 3,
    id_policy: 'Initial IDs hash course, written form, kana and initial sense ordinal. The persisted registry is authoritative thereafter. Never regenerate IDs from edited content or current row positions.',
    reading_policy: 'Import reading is kana, as required by current Japanese speech/card mapping. Word romaji and POS are retained here for agent integration; example romaji is also preserved in examples_json.',
    publish_prerequisites: [
      'Independent sense identity throughout learner state',
      'Word romaji/POS integration from companion metadata',
      'Staging dry-run and verification',
    ],
    intentional_same_identity_pairs: [
      {
        written_form: 'あの',
        kana: 'あの',
        ids: ['ja-n5-30b41e909eda7b2138b738ba', 'ja-n5-169266c82fffcbc797986059'],
      },
      {
        written_form: 'ある',
        kana: 'ある',
        ids: ['ja-n5-267fbf4b6103d64c8b612c89', 'ja-n5-a717402433c77c6c13aae907'],
      },
      {
        written_form: 'かける',
        kana: 'かける',
        ids: ['ja-n5-666ae0ddfc16943493fe36d4', 'ja-n5-5c1bf9d3fd0a1a77997b8c8c'],
      },
      {
        written_form: 'キロ',
        kana: 'きろ',
        ids: ['ja-n5-dc98b4e48f82ee7c4053d4e8', 'ja-n5-faf10d3dd84de688e9209abc'],
      },
      {
        written_form: 'もう',
        kana: 'もう',
        ids: ['ja-n5-cf8b6eae70ae546c8a5088a3', 'ja-n5-6bd03c3d2021a1d5f2962d07'],
      },
    ],
    records: mappingRecords,
  };

  const jsonStr = JSON.stringify(mappingDocument, null, 2) + '\n';
  fs.writeFileSync(mappingJsonPath, jsonStr, 'utf8');

  // Also ensure N5_mapping.json is synced if mappingJsonPath is N5_Swipe2Study_mapping.json
  const altMappingPath = path.join(path.dirname(mappingJsonPath), 'N5_mapping.json');
  if (path.resolve(altMappingPath) !== path.resolve(mappingJsonPath)) {
    fs.writeFileSync(altMappingPath, jsonStr, 'utf8');
  }

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
