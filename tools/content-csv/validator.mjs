/**
 * Structural Content Validator for Swipe 2 Study Course CSVs.
 *
 * Enforces database schema limits from PostgreSQL migrations:
 * - public.courses: id (1-100), language ('zh'|'ja'), level_id, unique(language, level_id)
 * - public.vocabulary: id (1-150), written_form (1-500), reading, meanings,
 *   audio_path (Storage relative path), examples (JSON array <= 3 items), sort_order (integer)
 */

import { EXPECTED_HEADERS } from './parser.mjs';

const MAX_ID_LEN = 150;
const MAX_COURSE_ID_LEN = 100;
const MAX_LEVEL_ID_LEN = 100;
const MAX_WRITTEN_FORM_LEN = 500;
const MAX_READING_LEN = 2000;
const MAX_MEANING_LEN = 2000;
const MAX_AUDIO_PATH_LEN = 256;
const MAX_EXAMPLE_TEXT_LEN = 1000;
const MIN_INTEGER = -2147483648;
const MAX_INTEGER = 2147483647;

export function validateCsvRows(parsedRows) {
  const errors = [];
  const warnings = [];

  const seenIds = new Map(); // id -> firstRow
  const courseMetadata = new Map(); // course_id -> { language, level_id, firstRow }
  const levelCourseMap = new Map(); // `${language}:${level_id}` -> { course_id, firstRow }
  const seenIdentities = new Map(); // `${course_id}:${written_form}:${reading}` -> firstRow

  let validRowCount = 0;

  for (const row of parsedRows) {
    const rowNum = row.rowNumber;
    const f = row.fields;

    // Field mapping corresponding to EXPECTED_HEADERS:
    // 0: id
    // 1: course_id
    // 2: language
    // 3: level_id
    // 4: written_form
    // 5: reading
    // 6: meaning_english
    // 7: meaning_burmese
    // 8: audio_path
    // 9: examples_json
    // 10: sort_order

    // 0. Prohibit NUL characters in raw fields
    for (let c = 0; c < EXPECTED_HEADERS.length; c++) {
      const colName = EXPECTED_HEADERS[c];
      const val = f[c];
      if (typeof val === 'string' && val.includes('\0')) {
        errors.push({
          row: rowNum,
          column: colName,
          code: 'NUL_CHARACTER',
          message: `Column '${colName}' contains an illegal NUL (\\0) character.`,
        });
      }
    }

    const id = f[0].trim();
    const courseId = f[1].trim();
    const language = f[2].trim();
    const levelId = f[3].trim();
    const writtenForm = f[4].trim();
    const reading = f[5].trim();
    const meaningEnglish = f[6].trim();
    const meaningBurmese = f[7].trim();
    const audioPath = f[8].trim();
    const examplesJson = f[9].trim();
    const sortOrderRaw = f[10].trim();

    const initialErrorCount = errors.length;

    // 1. Vocabulary ID
    if (!id) {
      errors.push({ row: rowNum, column: 'id', code: 'MISSING_ID', message: 'Vocabulary id is required.' });
    } else if (id.length > MAX_ID_LEN) {
      errors.push({
        row: rowNum,
        column: 'id',
        code: 'ID_TOO_LONG',
        message: `id exceeds maximum length of ${MAX_ID_LEN} characters (got ${id.length}).`,
      });
    } else if (seenIds.has(id)) {
      errors.push({
        row: rowNum,
        column: 'id',
        code: 'DUPLICATE_ID',
        message: `Duplicate vocabulary id '${id}' already defined at row ${seenIds.get(id)}.`,
      });
    } else {
      seenIds.set(id, rowNum);
    }

    // 2. Course ID
    if (!courseId) {
      errors.push({ row: rowNum, column: 'course_id', code: 'MISSING_COURSE_ID', message: 'course_id is required.' });
    } else if (courseId.length > MAX_COURSE_ID_LEN) {
      errors.push({
        row: rowNum,
        column: 'course_id',
        code: 'COURSE_ID_TOO_LONG',
        message: `course_id exceeds maximum length of ${MAX_COURSE_ID_LEN} characters (got ${courseId.length}).`,
      });
    }

    // 3. Language
    if (language !== 'zh' && language !== 'ja') {
      errors.push({
        row: rowNum,
        column: 'language',
        code: 'INVALID_LANGUAGE',
        message: `language must be 'zh' or 'ja', got '${language}'.`,
      });
    }

    // 4. Level ID
    if (!levelId) {
      errors.push({ row: rowNum, column: 'level_id', code: 'MISSING_LEVEL_ID', message: 'level_id is required.' });
    } else if (levelId.length > MAX_LEVEL_ID_LEN) {
      errors.push({
        row: rowNum,
        column: 'level_id',
        code: 'LEVEL_ID_TOO_LONG',
        message: `level_id exceeds maximum length of ${MAX_LEVEL_ID_LEN} characters (got ${levelId.length}).`,
      });
    }

    // 5. Course Metadata Consistency
    if (courseId && language && levelId) {
      // Rule 5a: Same course_id must not map to different language or level_id
      if (courseMetadata.has(courseId)) {
        const existing = courseMetadata.get(courseId);
        if (existing.language !== language || existing.level_id !== levelId) {
          errors.push({
            row: rowNum,
            column: 'course_id',
            code: 'CONFLICTING_COURSE_METADATA',
            message: `course_id '${courseId}' maps to conflicting metadata (language='${language}', level_id='${levelId}'). First declared at row ${existing.firstRow} as (language='${existing.language}', level_id='${existing.level_id}').`,
          });
        }
      } else {
        courseMetadata.set(courseId, { language, level_id: levelId, firstRow: rowNum });
      }

      // Rule 5b: In public.courses, unique(language, level_id) prohibits multiple courses for the same level
      const levelKey = `${language}:${levelId}`;
      if (levelCourseMap.has(levelKey)) {
        const existingMapping = levelCourseMap.get(levelKey);
        if (existingMapping.course_id !== courseId) {
          errors.push({
            row: rowNum,
            column: 'level_id',
            code: 'CONFLICTING_LEVEL_ASSIGNMENT',
            message: `(language='${language}', level_id='${levelId}') is already assigned to course_id '${existingMapping.course_id}' at row ${existingMapping.firstRow}. Prohibited duplicate assignment to '${courseId}'.`,
          });
        }
      } else {
        levelCourseMap.set(levelKey, { course_id: courseId, firstRow: rowNum });
      }
    }

    // 6. Written Form
    if (!writtenForm) {
      errors.push({ row: rowNum, column: 'written_form', code: 'MISSING_WRITTEN_FORM', message: 'written_form is required.' });
    } else if (writtenForm.length > MAX_WRITTEN_FORM_LEN) {
      errors.push({
        row: rowNum,
        column: 'written_form',
        code: 'WRITTEN_FORM_TOO_LONG',
        message: `written_form exceeds maximum length of ${MAX_WRITTEN_FORM_LEN} characters.`,
      });
    }

    // 7. Reading
    if (!reading) {
      errors.push({ row: rowNum, column: 'reading', code: 'MISSING_READING', message: 'reading is required.' });
    } else if (reading.length > MAX_READING_LEN) {
      errors.push({
        row: rowNum,
        column: 'reading',
        code: 'READING_TOO_LONG',
        message: `reading exceeds maximum length of ${MAX_READING_LEN} characters.`,
      });
    }

    // 8. Meanings
    if (meaningEnglish.length > MAX_MEANING_LEN) {
      errors.push({
        row: rowNum,
        column: 'meaning_english',
        code: 'MEANING_TOO_LONG',
        message: `meaning_english exceeds maximum length of ${MAX_MEANING_LEN} characters.`,
      });
    }
    if (meaningBurmese.length > MAX_MEANING_LEN) {
      errors.push({
        row: rowNum,
        column: 'meaning_burmese',
        code: 'MEANING_TOO_LONG',
        message: `meaning_burmese exceeds maximum length of ${MAX_MEANING_LEN} characters.`,
      });
    }

    if (!meaningEnglish && !meaningBurmese) {
      errors.push({
        row: rowNum,
        column: 'meaning_english',
        code: 'MISSING_MEANING',
        message: 'At least one meaning (meaning_english or meaning_burmese) is required.',
      });
    } else if (!meaningEnglish) {
      warnings.push({
        row: rowNum,
        column: 'meaning_english',
        code: 'MISSING_ENGLISH_MEANING',
        message: 'Row has Burmese meaning but is missing English meaning.',
      });
    } else if (!meaningBurmese) {
      warnings.push({
        row: rowNum,
        column: 'meaning_burmese',
        code: 'MISSING_BURMESE_MEANING',
        message: 'Row has English meaning but is missing Burmese meaning.',
      });
    }

    // 9. Audio Path
    if (audioPath) {
      validateAudioPath(audioPath, rowNum, errors);
    }

    // 10. Examples JSON
    if (examplesJson) {
      validateExamplesJson(examplesJson, rowNum, errors, warnings);
    }

    // 11. Sort Order
    if (!sortOrderRaw) {
      errors.push({ row: rowNum, column: 'sort_order', code: 'MISSING_SORT_ORDER', message: 'sort_order is required.' });
    } else if (!/^-?\d+$/.test(sortOrderRaw)) {
      errors.push({
        row: rowNum,
        column: 'sort_order',
        code: 'INVALID_INTEGER',
        message: `sort_order must be a valid integer, got '${sortOrderRaw}'.`,
      });
    } else {
      const parsedInt = Number(sortOrderRaw);
      if (!Number.isSafeInteger(parsedInt) || parsedInt < MIN_INTEGER || parsedInt > MAX_INTEGER) {
        errors.push({
          row: rowNum,
          column: 'sort_order',
          code: 'INTEGER_OUT_OF_RANGE',
          message: `sort_order must be between ${MIN_INTEGER} and ${MAX_INTEGER}, got ${sortOrderRaw}.`,
        });
      }
    }

    // 12. Duplicate Word Identity Warning (written_form + reading)
    if (writtenForm && reading && courseId) {
      const identityKey = `${courseId}:${writtenForm}:${reading}`;
      if (seenIdentities.has(identityKey)) {
        warnings.push({
          row: rowNum,
          column: 'written_form',
          code: 'DUPLICATE_VOCABULARY_IDENTITY',
          message: `Possible duplicate word identity '${writtenForm}' (${reading}) in course '${courseId}' (previously seen at row ${seenIdentities.get(identityKey)}).`,
        });
      } else {
        seenIdentities.set(identityKey, rowNum);
      }
    }

    // Row status check
    if (errors.length === initialErrorCount) {
      validRowCount++;
    }
  }

  return {
    valid: errors.length === 0,
    summary: {
      total_rows: parsedRows.length,
      valid_rows: validRowCount,
      error_count: errors.length,
      warning_count: warnings.length,
    },
    errors,
    warnings,
  };
}

/**
 * Validates relative Storage audio path without network calls.
 */
function validateAudioPath(path, rowNum, errors) {
  if (path.length > MAX_AUDIO_PATH_LEN) {
    errors.push({
      row: rowNum,
      column: 'audio_path',
      code: 'AUDIO_PATH_TOO_LONG',
      message: `audio_path exceeds maximum length of ${MAX_AUDIO_PATH_LEN} characters.`,
    });
    return;
  }

  if (/^(?:https?:|\/\/)/i.test(path)) {
    errors.push({
      row: rowNum,
      column: 'audio_path',
      code: 'UNSAFE_AUDIO_PATH',
      message: 'audio_path must be a relative Storage path, not an absolute URL.',
    });
    return;
  }

  if (path.includes('..')) {
    errors.push({
      row: rowNum,
      column: 'audio_path',
      code: 'UNSAFE_AUDIO_PATH',
      message: "audio_path must not contain directory traversal ('..').",
    });
    return;
  }

  if (path.startsWith('/') || path.startsWith('\\')) {
    errors.push({
      row: rowNum,
      column: 'audio_path',
      code: 'UNSAFE_AUDIO_PATH',
      message: 'audio_path must be a relative path and must not start with a leading slash or backslash.',
    });
    return;
  }

  if (path.includes('\\')) {
    errors.push({
      row: rowNum,
      column: 'audio_path',
      code: 'UNSAFE_AUDIO_PATH',
      message: 'audio_path must use forward slashes (/).',
    });
    return;
  }

  if (path.includes('?') || path.includes('#')) {
    errors.push({
      row: rowNum,
      column: 'audio_path',
      code: 'UNSAFE_AUDIO_PATH',
      message: 'audio_path must not contain query strings or URL fragment identifiers.',
    });
    return;
  }

  // Basic safe path format: segments of alphanumeric/dashes/underscores ending in audio extension
  if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*\.(?:mp3|wav|ogg|m4a|aac|webm)$/i.test(path)) {
    errors.push({
      row: rowNum,
      column: 'audio_path',
      code: 'INVALID_AUDIO_FORMAT',
      message: "audio_path must be a relative storage path pointing to an audio file (.mp3, .wav, .ogg, .m4a, .aac, .webm).",
    });
  }
}

/**
 * Validates JSON structure of examples according to application example schema.
 */
function validateExamplesJson(jsonStr, rowNum, errors, warnings) {
  let examples;
  try {
    examples = JSON.parse(jsonStr);
  } catch (err) {
    errors.push({
      row: rowNum,
      column: 'examples_json',
      code: 'INVALID_JSON',
      message: `examples_json must be valid JSON: ${err.message}`,
    });
    return;
  }

  if (!Array.isArray(examples)) {
    errors.push({
      row: rowNum,
      column: 'examples_json',
      code: 'EXAMPLES_NOT_ARRAY',
      message: 'examples_json must be a JSON array.',
    });
    return;
  }

  if (examples.length > 3) {
    errors.push({
      row: rowNum,
      column: 'examples_json',
      code: 'TOO_MANY_EXAMPLES',
      message: `At most 3 examples allowed per vocabulary item (found ${examples.length}).`,
    });
    return;
  }

  examples.forEach((ex, idx) => {
    const exNum = idx + 1;
    if (typeof ex !== 'object' || ex === null || Array.isArray(ex)) {
      errors.push({
        row: rowNum,
        column: 'examples_json',
        code: 'INVALID_EXAMPLE_OBJECT',
        message: `Example ${exNum} must be a JSON object.`,
      });
      return;
    }

    // Reject NUL characters in decoded JSON fields
    for (const [key, val] of Object.entries(ex)) {
      if (typeof val === 'string' && val.includes('\0')) {
        errors.push({
          row: rowNum,
          column: 'examples_json',
          code: 'NUL_CHARACTER',
          message: `Example ${exNum}: '${key}' contains an illegal NUL (\\0) character.`,
        });
      }
    }

    // text: required string
    if (typeof ex.text !== 'string' || !ex.text.trim()) {
      errors.push({
        row: rowNum,
        column: 'examples_json',
        code: 'INVALID_EXAMPLE_TEXT',
        message: `Example ${exNum}: 'text' is required and must be a non-empty string.`,
      });
    } else if (ex.text.length > MAX_EXAMPLE_TEXT_LEN) {
      errors.push({
        row: rowNum,
        column: 'examples_json',
        code: 'EXAMPLE_TEXT_TOO_LONG',
        message: `Example ${exNum}: 'text' exceeds maximum length of ${MAX_EXAMPLE_TEXT_LEN} characters.`,
      });
    }

    // reading: optional string
    if (ex.reading !== undefined && typeof ex.reading !== 'string') {
      errors.push({
        row: rowNum,
        column: 'examples_json',
        code: 'INVALID_EXAMPLE_READING',
        message: `Example ${exNum}: 'reading' must be a string if provided.`,
      });
    }

    // english: optional string
    if (ex.english !== undefined && typeof ex.english !== 'string') {
      errors.push({
        row: rowNum,
        column: 'examples_json',
        code: 'INVALID_EXAMPLE_TRANSLATION',
        message: `Example ${exNum}: 'english' must be a string if provided.`,
      });
    }

    // burmese: optional string
    if (ex.burmese !== undefined && typeof ex.burmese !== 'string') {
      errors.push({
        row: rowNum,
        column: 'examples_json',
        code: 'INVALID_EXAMPLE_TRANSLATION',
        message: `Example ${exNum}: 'burmese' must be a string if provided.`,
      });
    }

    // At least one translation required
    const hasEnglish = typeof ex.english === 'string' && ex.english.trim().length > 0;
    const hasBurmese = typeof ex.burmese === 'string' && ex.burmese.trim().length > 0;

    if (!hasEnglish && !hasBurmese) {
      errors.push({
        row: rowNum,
        column: 'examples_json',
        code: 'MISSING_EXAMPLE_TRANSLATION',
        message: `Example ${exNum}: at least one translation ('english' or 'burmese') is required.`,
      });
    } else if (!hasEnglish) {
      warnings.push({
        row: rowNum,
        column: 'examples_json',
        code: 'MISSING_EXAMPLE_ENGLISH',
        message: `Example ${exNum} has Burmese translation but is missing English translation.`,
      });
    } else if (!hasBurmese) {
      warnings.push({
        row: rowNum,
        column: 'examples_json',
        code: 'MISSING_EXAMPLE_BURMESE',
        message: `Example ${exNum} has English translation but is missing Burmese translation.`,
      });
    }
  });
}
