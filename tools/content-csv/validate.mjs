#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { parseCsv, findMalformedUtf8Location, MAX_INPUT_BYTES } from './parser.mjs';
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

function exitWithUsageError(message, exitCode = 2) {
  process.exitCode = exitCode;
  if (message) {
    let exited = false;
    const safeExit = () => {
      if (!exited) {
        exited = true;
        process.exit(exitCode);
      }
    };
    const flushed = process.stderr.write(message, safeExit);
    if (!flushed) {
      process.stderr.once('drain', safeExit);
      return;
    }
  }
  process.exit(exitCode);
}

function outputReportAndExit(report, exitCode) {
  process.exitCode = exitCode;
  const json = JSON.stringify(report, null, 2) + '\n';
  let exited = false;
  const safeExit = () => {
    if (!exited) {
      exited = true;
      process.exit(exitCode);
    }
  };
  const flushed = process.stdout.write(json, safeExit);
  if (!flushed) {
    process.stdout.once('drain', safeExit);
  }
}

function main() {
  process.stdout.on('error', (err) => {
    if (err.code === 'EPIPE') {
      process.exit(0);
    }
  });

  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(2);
  }

  // Reject multiple positional arguments or unexpected extra arguments
  if (args.length > 1) {
    process.stderr.write(
      `Error: Unexpected extra arguments: ${args.slice(1).join(', ')}. Expected exactly one CSV file.\n\n`
    );
    printUsage();
    process.exit(2);
  }

  const rawPath = args[0];

  // Reject unrecognized flags
  if (rawPath.startsWith('-')) {
    process.stderr.write(`Error: Unrecognized option '${rawPath}'. Expected a CSV file path.\n\n`);
    printUsage();
    process.exit(2);
  }

  const targetPath = path.resolve(process.cwd(), rawPath);

  // 1. Check file existence and type
  let stats;
  try {
    stats = fs.statSync(targetPath);
  } catch (err) {
    exitWithUsageError(`Error: File not found or unreadable: ${rawPath} (${err.message})\n`, 2);
    return;
  }

  if (!stats.isFile()) {
    exitWithUsageError(`Error: Path is not a regular file: ${rawPath}\n`, 2);
    return;
  }

  // 2. Bound file size (10 MiB limit)
  if (stats.size > MAX_INPUT_BYTES) {
    exitWithUsageError(
      `Error: File size (${stats.size} bytes) exceeds maximum bound of ${MAX_INPUT_BYTES} bytes (10 MiB): ${rawPath}\n`,
      2
    );
    return;
  }

  // 3. Read raw content as binary buffer to prevent silent UTF-8 replacement
  let rawBuffer;
  try {
    rawBuffer = fs.readFileSync(targetPath);
  } catch (err) {
    exitWithUsageError(`Error reading file ${rawPath}: ${err.message}\n`, 2);
    return;
  }

  // 4. Validate UTF-8 strictly without replacing invalid bytes
  let rawContent;
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    rawContent = decoder.decode(rawBuffer);
  } catch {
    const loc = findMalformedUtf8Location(rawBuffer);
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
          row: loc.line,
          column: null,
          code: 'MALFORMED_UTF8',
          message: `File contains malformed or invalid UTF-8 byte sequence at byte offset ${loc.byteOffset} (line ${loc.line}).`,
        },
      ],
      warnings: [],
    };
    outputReportAndExit(report, 1);
    return;
  }

  // 5. Parse CSV
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
    outputReportAndExit(report, 1);
    return;
  }

  // 6. Validate Rows
  const validationResult = validateCsvRows(parsed.rows);

  const report = {
    file: rawPath,
    valid: validationResult.valid,
    summary: validationResult.summary,
    errors: validationResult.errors,
    warnings: validationResult.warnings,
  };

  outputReportAndExit(report, validationResult.valid ? 0 : 1);
}

main();
