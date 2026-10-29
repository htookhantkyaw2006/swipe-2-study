/**
 * RFC 4180 Compliant CSV Parser for Swipe 2 Study Course Content.
 *
 * Supports:
 * - UTF-8 Byte Order Mark (BOM) stripping (\uFEFF)
 * - LF (\n) and CRLF (\r\n) line terminators
 * - Quoted fields containing commas, line breaks, and escaped quotes ("")
 * - Bounded input length
 * - Strict reporting of malformed quotes and inconsistent column counts
 */

export const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10 MiB limit

export const EXPECTED_HEADERS = Object.freeze([
  'id',
  'course_id',
  'language',
  'level_id',
  'written_form',
  'reading',
  'meaning_english',
  'meaning_burmese',
  'audio_path',
  'examples_json',
  'sort_order',
]);

export class CsvParseError extends Error {
  constructor(message, code, { row = 1, column = null } = {}) {
    super(message);
    this.name = 'CsvParseError';
    this.code = code;
    this.row = row;
    this.column = column;
  }
}

/**
 * Finds the byte offset and 1-based line number of the first malformed UTF-8 sequence.
 *
 * @param {Buffer|Uint8Array} buffer
 * @returns {{ line: number, byteOffset: number }}
 */
export function findMalformedUtf8Location(buffer) {
  const td = new TextDecoder('utf-8', { fatal: true });
  let line = 1;
  for (let i = 0; i < buffer.length; i++) {
    try {
      td.decode(buffer.subarray(i, i + 1), { stream: true });
      if (buffer[i] === 0x0A) {
        line++;
      }
    } catch {
      return { line, byteOffset: i };
    }
  }
  try {
    td.decode(); // flush end-of-stream
  } catch {
    return { line, byteOffset: Math.max(0, buffer.length - 1) };
  }
  return { line: 1, byteOffset: 0 };
}

/**
 * Parses raw CSV string or Buffer into a 2D array of records.
 * Does NOT use split(',') — uses a deterministic character state-machine.
 *
 * @param {string|Buffer|Uint8Array} rawContent Raw CSV string or buffer
 * @returns {{ headers: string[], rows: Array<{ rowNumber: number, fields: string[] }> }}
 */
export function parseCsv(rawContent) {
  if (Buffer.isBuffer(rawContent) || rawContent instanceof Uint8Array) {
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      rawContent = decoder.decode(rawContent);
    } catch {
      const loc = findMalformedUtf8Location(rawContent);
      throw new CsvParseError(
        `Malformed or invalid UTF-8 byte sequence at byte offset ${loc.byteOffset} (line ${loc.line}).`,
        'MALFORMED_UTF8',
        { row: loc.line }
      );
    }
  }

  if (typeof rawContent !== 'string') {
    throw new CsvParseError('Input must be a string or Buffer.', 'INVALID_INPUT_TYPE', { row: 1 });
  }

  if (typeof rawContent.isWellFormed === 'function' && !rawContent.isWellFormed()) {
    throw new CsvParseError(
      'CSV content contains malformed Unicode (unpaired surrogate code units).',
      'MALFORMED_UTF8',
      { row: 1 }
    );
  }

  // 1. Strip UTF-8 BOM if present
  let content = rawContent.charCodeAt(0) === 0xFEFF ? rawContent.slice(1) : rawContent;

  if (content.trim().length === 0) {
    throw new CsvParseError('CSV content is empty.', 'EMPTY_FILE', { row: 1 });
  }

  const rawRecords = [];
  let currentRecord = [];
  let currentField = '';
  let inQuotes = false;
  let currentRecordHasQuotes = false;
  let recordStartLine = 1;
  let currentLine = 1;
  let charIndex = 0;
  const len = content.length;

  while (charIndex < len) {
    const ch = content[charIndex];

    if (inQuotes) {
      if (ch === '"') {
        currentRecordHasQuotes = true;
        // Look ahead for escaped quote ("")
        if (charIndex + 1 < len && content[charIndex + 1] === '"') {
          currentField += '"';
          charIndex += 2;
          continue;
        }
        // Closing quote
        inQuotes = false;
        charIndex++;

        // After closing quote, next char must be delimiter, newline, or EOF
        if (charIndex < len) {
          const nextCh = content[charIndex];
          if (nextCh !== ',' && nextCh !== '\r' && nextCh !== '\n') {
            throw new CsvParseError(
              `Malformed CSV: Unexpected character '${nextCh}' following closing quote on line ${currentLine}.`,
              'MALFORMED_QUOTING',
              { row: rawRecords.length + 1 }
            );
          }
        }
        continue;
      }

      if (ch === '\n') {
        currentLine++;
      }
      currentField += ch;
      charIndex++;
      continue;
    }

    // Not in quotes
    if (ch === '"') {
      currentRecordHasQuotes = true;
      if (currentField.length > 0) {
        throw new CsvParseError(
          `Malformed CSV: Unescaped quote inside unquoted field on line ${currentLine}.`,
          'MALFORMED_QUOTING',
          { row: rawRecords.length + 1 }
        );
      }
      inQuotes = true;
      charIndex++;
      continue;
    }

    if (ch === ',') {
      currentRecord.push(currentField);
      currentField = '';
      charIndex++;
      continue;
    }

    if (ch === '\r') {
      // Check for \r\n
      if (charIndex + 1 < len && content[charIndex + 1] === '\n') {
        charIndex++;
      }
      currentRecord.push(currentField);
      rawRecords.push({
        rowNumber: rawRecords.length + 1,
        startLine: recordStartLine,
        fields: currentRecord,
        hasQuotes: currentRecordHasQuotes,
      });
      currentRecord = [];
      currentField = '';
      currentRecordHasQuotes = false;
      currentLine++;
      recordStartLine = currentLine;
      charIndex++;
      continue;
    }

    if (ch === '\n') {
      currentRecord.push(currentField);
      rawRecords.push({
        rowNumber: rawRecords.length + 1,
        startLine: recordStartLine,
        fields: currentRecord,
        hasQuotes: currentRecordHasQuotes,
      });
      currentRecord = [];
      currentField = '';
      currentRecordHasQuotes = false;
      currentLine++;
      recordStartLine = currentLine;
      charIndex++;
      continue;
    }

    currentField += ch;
    charIndex++;
  }

  if (inQuotes) {
    throw new CsvParseError(
      `Malformed CSV: Unclosed quote starting on line ${recordStartLine} reached end of file.`,
      'UNCLOSED_QUOTE',
      { row: rawRecords.length + 1 }
    );
  }

  // Push final record if fields remain, last char was not a trailing newline, or record had quotes
  if (currentRecord.length > 0 || currentField.length > 0 || currentRecordHasQuotes) {
    currentRecord.push(currentField);
    rawRecords.push({
      rowNumber: rawRecords.length + 1,
      startLine: recordStartLine,
      fields: currentRecord,
      hasQuotes: currentRecordHasQuotes,
    });
  }

  if (rawRecords.length === 0) {
    throw new CsvParseError('CSV contains no records.', 'EMPTY_FILE', { row: 1 });
  }

  // 2. Validate Headers (Row 1)
  const headerRecord = rawRecords[0];
  const actualHeaders = headerRecord.fields.map((h) => h.trim());

  validateHeaders(actualHeaders);

  // 3. Validate Column Counts for all data rows
  const dataRows = [];
  const expectedColCount = EXPECTED_HEADERS.length;

  for (let i = 1; i < rawRecords.length; i++) {
    const record = rawRecords[i];
    // Skip completely empty unquoted trailing row (e.g., blank line at end of file)
    if (!record.hasQuotes && record.fields.length === 1 && record.fields[0] === '' && i === rawRecords.length - 1) {
      continue;
    }

    if (record.fields.length !== expectedColCount) {
      throw new CsvParseError(
        `Inconsistent column count at row ${record.rowNumber}: found ${record.fields.length} columns, expected ${expectedColCount}.`,
        'INCONSISTENT_COLUMN_COUNT',
        { row: record.rowNumber }
      );
    }

    dataRows.push({
      rowNumber: record.rowNumber,
      fields: record.fields,
    });
  }

  return {
    headers: actualHeaders,
    rows: dataRows,
  };
}

/**
 * Strictly verifies header exactness, completeness, and ordering.
 */
function validateHeaders(headers) {
  if (headers.length !== EXPECTED_HEADERS.length) {
    throw new CsvParseError(
      `Invalid header count: found ${headers.length} headers, expected ${EXPECTED_HEADERS.length}.`,
      'INVALID_HEADER_COUNT',
      { row: 1 }
    );
  }

  // Check for duplicate header names and illegal characters (such as NUL)
  const seen = new Set();
  for (const h of headers) {
    if (h.includes('\0')) {
      throw new CsvParseError(
        `Header contains illegal NUL (\\0) character.`,
        'NUL_CHARACTER',
        { row: 1, column: h.replaceAll('\0', '') }
      );
    }
    if (seen.has(h)) {
      throw new CsvParseError(`Duplicate header '${h}' found in row 1.`, 'DUPLICATE_HEADER', { row: 1, column: h });
    }
    seen.add(h);
  }

  // Check exact order and unexpected headers
  for (let i = 0; i < EXPECTED_HEADERS.length; i++) {
    const expected = EXPECTED_HEADERS[i];
    const actual = headers[i];
    if (actual !== expected) {
      throw new CsvParseError(
        `Header mismatch at column ${i + 1}: expected '${expected}', got '${actual}'.`,
        'HEADER_MISMATCH',
        { row: 1, column: actual }
      );
    }
  }
}
