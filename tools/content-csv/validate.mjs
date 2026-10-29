#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { parseCsv, MAX_INPUT_BYTES } from './parser.mjs';
import { validateCsvRows } from './validator.mjs';

function printUsage() {
  process.stderr.write(
    'Usage: node tools/content-csv/validate.mjs <input.csv>\n\n' +
    'Validates course vocabulary CSV structure against schema constraints.\n\n' +
    'Exit Codes:\n' +
    '  0  CSV is structurally valid (warnings may be present)\n' +
    '  1  CSV validation failed (structural or schema errors found)\n' +
    '  2  Usage or I/O failure (file not found, file too large, invalid arguments)\n'
  );
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(2);
  }

  const rawPath = args[0];
  const targetPath = path.resolve(process.cwd(), rawPath);

  // 1. Check file existence and type
  let stats;
  try {
    stats = fs.statSync(targetPath);
  } catch (err) {
    process.stderr.write(`Error: File not found or unreadable: ${rawPath} (${err.message})\n`);
    process.exit(2);
  }

  if (!stats.isFile()) {
    process.stderr.write(`Error: Path is not a regular file: ${rawPath}\n`);
    process.exit(2);
  }

  // 2. Bound file size (10 MiB limit)
  if (stats.size > MAX_INPUT_BYTES) {
    process.stderr.write(
      `Error: File size (${stats.size} bytes) exceeds maximum bound of ${MAX_INPUT_BYTES} bytes (10 MiB): ${rawPath}\n`
    );
    process.exit(2);
  }

  // 3. Read raw content
  let rawContent;
  try {
    rawContent = fs.readFileSync(targetPath, 'utf8');
  } catch (err) {
    process.stderr.write(`Error reading file ${rawPath}: ${err.message}\n`);
    process.exit(2);
  }

  // 4. Parse CSV
  let parsed;
  try {
    parsed = parseCsv(rawContent);
  } catch (err) {
    const report = {
      file: rawPath,
      valid: false,
      summary: {
        total_rows: 0,
        valid_rows: 0,
        error_count: 1,
        warning_count: 0,
      },
      errors: [
        {
          row: err.row || 1,
          column: err.column || null,
          code: err.code || 'PARSE_ERROR',
          message: err.message,
        },
      ],
      warnings: [],
    };
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    process.exit(1);
  }

  // 5. Validate Rows
  const validationResult = validateCsvRows(parsed.rows);

  const report = {
    file: rawPath,
    valid: validationResult.valid,
    summary: validationResult.summary,
    errors: validationResult.errors,
    warnings: validationResult.warnings,
  };

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');

  process.exit(validationResult.valid ? 0 : 1);
}

main();
