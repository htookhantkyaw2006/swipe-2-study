#!/usr/bin/env node

/**
 * Content Management and Publication CLI for Swipe 2 Study.
 *
 * Provides operator tooling for:
 * - Structural CSV validation and dry-run diffing (default)
 * - Two-phase staged publication (stage -> publish)
 * - Atomic publication with automated pre-update backups
 * - Curriculum content rollbacks preserving learner progress
 * - Explicit retirement of omitted vocabulary items
 *
 * Security:
 * - Requires explicit --target <env> for write operations
 * - Rejects client-facing VITE_* credentials
 * - Uses server-side / operator service role credentials only
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { parseCsv, findMalformedUtf8Location, MAX_INPUT_BYTES } from './parser.mjs';
import { validateCsvRows } from './validator.mjs';
import {
  SUPPORTED_COURSES,
  mapCsvRowsToItems,
  calculateContentDiff,
  validateIdentityCompatibility,
  exportRecoverableBackup,
  fetchCurrentCourseContent,
  fetchCourseStatus,
  stageContent,
  publishStagedContent,
  rollbackContent,
} from './contentImportEngine.mjs';

function printUsage() {
  process.stderr.write(
    'Swipe 2 Study - Content Import & Publication CLI\n\n' +
    'Usage:\n' +
    '  node tools/content-csv/content-manager.mjs [command] [options]\n\n' +
    'Commands:\n' +
    '  dry-run <input.csv> [--target <env>]       (Default) Validate & compute inserted/updated/unchanged/retired diff without DB changes\n' +
    '  validate <input.csv>                       Strict structural and schema validation of CSV\n' +
    '  stage <input.csv> --target <env>           Stage verified content into private staging table\n' +
    '  publish <course-id> --stage-id <uuid> --target <env>  Atomically publish staged content (creates pre-update backup)\n' +
    '  stage-and-publish <input.csv> --target <env>          Stage and immediately publish in one operation\n' +
    '  rollback <course-id> --to-version <ver> --target <env> Revert course content to a prior published version\n' +
    '  export <course-id> --out <dir> [--target <env>]       Export current published content to recoverable JSON\n' +
    '  status <course-id> [--target <env>]                    Show course publication version and item counts\n\n' +
    'Options:\n' +
    '  --target <env>         Target environment (staging, production, local, test) [REQUIRED for writes]\n' +
    '  --operator <name>      Operator identifier for audit log (defaults to "operator")\n' +
    '  --reason <text>        Audit reason for publish or rollback\n' +
    '  --backup-dir <dir>     Directory for recoverable pre-update backups (default: ./content-backups)\n' +
    '  --stage-id <uuid>      Stage UUID for publish command\n' +
    '  --to-version <ver>     Target version integer for rollback command\n' +
    '  --out <dir>            Output directory for export command\n' +
    '  --json                 Output machine-readable JSON\n' +
    '  -h, --help             Show this help message\n\n' +
    'Environment Variables:\n' +
    '  SUPABASE_URL / OPERATOR_SUPABASE_URL\n' +
    '  SUPABASE_SERVICE_ROLE_KEY / OPERATOR_SERVICE_ROLE_KEY\n' +
    '  (Client-facing VITE_* keys are strictly rejected for write operations)\n'
  );
}

function safeExit(exitCode, message = '', stream = process.stdout) {
  process.exitCode = exitCode;
  if (!message) {
    process.exit(exitCode);
    return;
  }
  let exited = false;
  const onDone = () => {
    if (!exited) {
      exited = true;
      process.exit(exitCode);
    }
  };
  const flushed = stream.write(message, onDone);
  if (!flushed) {
    stream.once('drain', onDone);
  }
}

function parseCliArgs(argv) {
  const flags = {
    command: null,
    csvPath: null,
    courseId: null,
    target: null,
    operator: 'operator',
    reason: '',
    backupDir: './content-backups',
    stageId: null,
    toVersion: null,
    outDir: null,
    json: false,
  };

  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--json') {
      flags.json = true;
    } else if (arg === '--target') {
      flags.target = argv[++i];
    } else if (arg.startsWith('--target=')) {
      flags.target = arg.slice(9);
    } else if (arg === '--operator') {
      flags.operator = argv[++i];
    } else if (arg.startsWith('--operator=')) {
      flags.operator = arg.slice(11);
    } else if (arg === '--reason') {
      flags.reason = argv[++i];
    } else if (arg.startsWith('--reason=')) {
      flags.reason = arg.slice(9);
    } else if (arg === '--backup-dir') {
      flags.backupDir = argv[++i];
    } else if (arg.startsWith('--backup-dir=')) {
      flags.backupDir = arg.slice(13);
    } else if (arg === '--stage-id') {
      flags.stageId = argv[++i];
    } else if (arg.startsWith('--stage-id=')) {
      flags.stageId = arg.slice(11);
    } else if (arg === '--to-version') {
      flags.toVersion = argv[++i];
    } else if (arg.startsWith('--to-version=')) {
      flags.toVersion = arg.slice(13);
    } else if (arg === '--out') {
      flags.outDir = argv[++i];
    } else if (arg.startsWith('--out=')) {
      flags.outDir = arg.slice(6);
    } else if (arg.startsWith('-')) {
      throw new Error(`Unrecognized option '${arg}'`);
    } else {
      positional.push(arg);
    }
  }

  const KNOWN_COMMANDS = new Set([
    'dry-run',
    'validate',
    'stage',
    'publish',
    'stage-and-publish',
    'rollback',
    'export',
    'status',
  ]);

  if (positional.length > 0 && KNOWN_COMMANDS.has(positional[0])) {
    flags.command = positional[0];
    positional.shift();
  } else {
    // Default command is dry-run
    flags.command = 'dry-run';
  }

  // Handle remaining positional argument (csvPath or courseId)
  if (positional.length > 0) {
    const firstPos = positional[0];
    if (flags.command === 'publish' || flags.command === 'rollback' || flags.command === 'export' || flags.command === 'status') {
      flags.courseId = firstPos;
    } else {
      flags.csvPath = firstPos;
    }
  }

  return flags;
}

function resolveDbClient(options = {}) {
  // If an injected client is supplied (e.g. in tests)
  if (options.dbClient) {
    return options.dbClient;
  }

  const url = process.env.OPERATOR_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.OPERATOR_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Security check: reject client-side VITE_* keys
  const viteKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!serviceKey && viteKey) {
    throw new Error(
      'Operation requires privileged service role credentials (SUPABASE_SERVICE_ROLE_KEY). Client publishable/anon keys (VITE_*) cannot be used for operator write operations.'
    );
  }

  if (!url || !serviceKey) {
    return null;
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function readAndParseCsvFile(csvPath) {
  const resolvedPath = path.resolve(process.cwd(), csvPath);

  let stat;
  try {
    stat = fs.statSync(resolvedPath);
  } catch (err) {
    throw new Error(`File not found or unreadable: ${csvPath} (${err.message})`);
  }

  if (!stat.isFile()) {
    throw new Error(`Path is not a regular file: ${csvPath}`);
  }

  if (stat.size > MAX_INPUT_BYTES) {
    throw new Error(`File size (${stat.size} bytes) exceeds maximum bound of ${MAX_INPUT_BYTES} bytes (10 MiB).`);
  }

  const rawBuffer = fs.readFileSync(resolvedPath);

  let rawContent;
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    rawContent = decoder.decode(rawBuffer);
  } catch {
    const loc = findMalformedUtf8Location(rawBuffer);
    throw new Error(`File contains malformed UTF-8 at byte offset ${loc.byteOffset} (line ${loc.line}).`);
  }

  const parsed = parseCsv(rawContent);
  const validation = validateCsvRows(parsed.rows);

  return {
    rawBuffer,
    rawContent,
    parsed,
    validation,
    resolvedPath,
  };
}

export async function runCli(argv = process.argv.slice(2), { dbClient = null } = {}) {
  process.stdout.on('error', (err) => {
    if (err.code === 'EPIPE') process.exit(0);
  });

  let flags;
  try {
    flags = parseCliArgs(argv);
  } catch (err) {
    safeExit(2, `Error: ${err.message}\n\n`, process.stderr);
    return;
  }

  if (flags.help) {
    printUsage();
    process.exit(0);
  }

  let db;
  try {
    db = resolveDbClient({ dbClient });
  } catch (err) {
    safeExit(2, `Error: ${err.message}\n`, process.stderr);
    return;
  }

  // 1. Dry Run (Default command)
  if (flags.command === 'dry-run') {
    if (!flags.csvPath) {
      safeExit(2, 'Error: dry-run requires a CSV file path.\n\nUsage: node tools/content-csv/content-manager.mjs dry-run <input.csv>\n', process.stderr);
      return;
    }

    let fileData;
    try {
      fileData = readAndParseCsvFile(flags.csvPath);
    } catch (err) {
      safeExit(1, `Error reading CSV: ${err.message}\n`, process.stderr);
      return;
    }

    if (!fileData.validation.valid) {
      const report = {
        action: 'dry-run',
        valid: false,
        file: flags.csvPath,
        summary: fileData.validation.summary,
        errors: fileData.validation.errors,
        warnings: fileData.validation.warnings,
      };
      safeExit(1, JSON.stringify(report, null, 2) + '\n');
      return;
    }

    const incomingItems = mapCsvRowsToItems(fileData.parsed.rows);
    const courseId = incomingItems[0]?.course_id;

    if (!SUPPORTED_COURSES.has(courseId)) {
      safeExit(1, `Error: Unsupported course '${courseId}'. Only 'zh-hsk1' and 'ja-n5' are permitted.\n`, process.stderr);
      return;
    }

    let diff = null;
    let identityValidation = null;
    let currentItems = [];

    if (db) {
      try {
        currentItems = await fetchCurrentCourseContent({ db, courseId });
        diff = calculateContentDiff({ currentItems, incomingItems });
        identityValidation = validateIdentityCompatibility({ currentItems, incomingItems });
      } catch (err) {
        safeExit(1, `Error querying database for dry-run comparison: ${err.message}\n`, process.stderr);
        return;
      }
    }

    const report = {
      action: 'dry-run',
      valid: identityValidation ? identityValidation.valid : true,
      course_id: courseId,
      file: flags.csvPath,
      validation_summary: fileData.validation.summary,
      database_connected: Boolean(db),
      diff: diff
        ? diff.counts
        : {
            incoming_count: incomingItems.length,
            message: 'Database not connected. Provide SUPABASE_SERVICE_ROLE_KEY to see DB diff.',
          },
      ambiguous_identity_errors: identityValidation?.errors || [],
      warnings: fileData.validation.warnings,
      database_modified: false,
    };

    const hasErrors = identityValidation && !identityValidation.valid;
    safeExit(hasErrors ? 1 : 0, JSON.stringify(report, null, 2) + '\n');
    return;
  }

  // 2. Validate
  if (flags.command === 'validate') {
    if (!flags.csvPath) {
      safeExit(2, 'Error: validate requires a CSV file path.\n\n', process.stderr);
      return;
    }

    let fileData;
    try {
      fileData = readAndParseCsvFile(flags.csvPath);
    } catch (err) {
      safeExit(1, `Validation error: ${err.message}\n`, process.stderr);
      return;
    }

    const report = {
      action: 'validate',
      valid: fileData.validation.valid,
      file: flags.csvPath,
      summary: fileData.validation.summary,
      errors: fileData.validation.errors,
      warnings: fileData.validation.warnings,
    };

    safeExit(fileData.validation.valid ? 0 : 1, JSON.stringify(report, null, 2) + '\n');
    return;
  }

  // Write operations require explicit --target <env>
  const WRITE_COMMANDS = new Set(['stage', 'publish', 'stage-and-publish', 'rollback']);
  if (WRITE_COMMANDS.has(flags.command)) {
    if (!flags.target) {
      safeExit(
        2,
        `Error: Write command '${flags.command}' requires an explicit --target <env> (e.g. --target staging or --target production).\n`,
        process.stderr
      );
      return;
    }

    if (!db) {
      safeExit(
        2,
        `Error: Write command '${flags.command}' requires privileged database credentials (SUPABASE_SERVICE_ROLE_KEY).\n`,
        process.stderr
      );
      return;
    }
  }

  // 3. Stage
  if (flags.command === 'stage') {
    if (!flags.csvPath) {
      safeExit(2, 'Error: stage requires a CSV file path.\n', process.stderr);
      return;
    }

    let fileData;
    try {
      fileData = readAndParseCsvFile(flags.csvPath);
    } catch (err) {
      safeExit(1, `Error reading CSV: ${err.message}\n`, process.stderr);
      return;
    }

    if (!fileData.validation.valid) {
      safeExit(1, JSON.stringify({ action: 'stage', valid: false, errors: fileData.validation.errors }, null, 2) + '\n');
      return;
    }

    const incomingItems = mapCsvRowsToItems(fileData.parsed.rows);
    const courseId = incomingItems[0]?.course_id;

    if (!SUPPORTED_COURSES.has(courseId)) {
      safeExit(1, `Error: Unsupported course '${courseId}'. Only 'zh-hsk1' and 'ja-n5' are permitted.\n`, process.stderr);
      return;
    }

    // Verify identity compatibility against current database
    try {
      const currentItems = await fetchCurrentCourseContent({ db, courseId });
      const idCompat = validateIdentityCompatibility({ currentItems, incomingItems });
      if (!idCompat.valid) {
        safeExit(1, JSON.stringify({ action: 'stage', valid: false, errors: idCompat.errors }, null, 2) + '\n');
        return;
      }
    } catch (err) {
      safeExit(1, `Database error during identity verification: ${err.message}\n`, process.stderr);
      return;
    }

    try {
      const stageResult = await stageContent({
        db,
        courseId,
        incomingItems,
        rawBuffer: fileData.rawBuffer,
        operator: flags.operator,
        metadata: {
          target: flags.target,
          filename: path.basename(flags.csvPath),
          item_count: incomingItems.length,
        },
      });

      safeExit(0, JSON.stringify({ action: 'stage', success: true, target: flags.target, stage: stageResult }, null, 2) + '\n');
    } catch (err) {
      safeExit(1, `Failed to stage content: ${err.message}\n`, process.stderr);
    }
    return;
  }

  // 4. Publish
  if (flags.command === 'publish') {
    if (!flags.courseId || !flags.stageId) {
      safeExit(
        2,
        'Error: publish requires <course-id> and --stage-id <uuid>.\nUsage: node tools/content-csv/content-manager.mjs publish <course-id> --stage-id <uuid> --target <env>\n',
        process.stderr
      );
      return;
    }

    try {
      const publishResult = await publishStagedContent({
        db,
        courseId: flags.courseId,
        stageId: flags.stageId,
        operator: flags.operator,
        reason: flags.reason || `Published via CLI to ${flags.target}`,
        backupDir: flags.backupDir,
      });

      safeExit(0, JSON.stringify({ action: 'publish', success: true, target: flags.target, result: publishResult }, null, 2) + '\n');
    } catch (err) {
      safeExit(1, `Failed to publish content: ${err.message}\n`, process.stderr);
    }
    return;
  }

  // 5. Stage and Publish
  if (flags.command === 'stage-and-publish') {
    if (!flags.csvPath) {
      safeExit(2, 'Error: stage-and-publish requires a CSV file path.\n', process.stderr);
      return;
    }

    let fileData;
    try {
      fileData = readAndParseCsvFile(flags.csvPath);
    } catch (err) {
      safeExit(1, `Error reading CSV: ${err.message}\n`, process.stderr);
      return;
    }

    if (!fileData.validation.valid) {
      safeExit(1, JSON.stringify({ action: 'stage-and-publish', valid: false, errors: fileData.validation.errors }, null, 2) + '\n');
      return;
    }

    const incomingItems = mapCsvRowsToItems(fileData.parsed.rows);
    const courseId = incomingItems[0]?.course_id;

    if (!SUPPORTED_COURSES.has(courseId)) {
      safeExit(1, `Error: Unsupported course '${courseId}'. Only 'zh-hsk1' and 'ja-n5' are permitted.\n`, process.stderr);
      return;
    }

    // Identity compatibility check
    try {
      const currentItems = await fetchCurrentCourseContent({ db, courseId });
      const idCompat = validateIdentityCompatibility({ currentItems, incomingItems });
      if (!idCompat.valid) {
        safeExit(1, JSON.stringify({ action: 'stage-and-publish', valid: false, errors: idCompat.errors }, null, 2) + '\n');
        return;
      }
    } catch (err) {
      safeExit(1, `Database error during identity verification: ${err.message}\n`, process.stderr);
      return;
    }

    try {
      const stageResult = await stageContent({
        db,
        courseId,
        incomingItems,
        rawBuffer: fileData.rawBuffer,
        operator: flags.operator,
        metadata: {
          target: flags.target,
          filename: path.basename(flags.csvPath),
          item_count: incomingItems.length,
        },
      });

      const publishResult = await publishStagedContent({
        db,
        courseId,
        stageId: stageResult.stage_id,
        operator: flags.operator,
        reason: flags.reason || `Stage-and-publish via CLI to ${flags.target}`,
        backupDir: flags.backupDir,
      });

      safeExit(0, JSON.stringify({ action: 'stage-and-publish', success: true, target: flags.target, stage: stageResult, publish: publishResult }, null, 2) + '\n');
    } catch (err) {
      safeExit(1, `Stage-and-publish failed: ${err.message}\n`, process.stderr);
    }
    return;
  }

  // 6. Rollback
  if (flags.command === 'rollback') {
    if (!flags.courseId || !flags.toVersion) {
      safeExit(
        2,
        'Error: rollback requires <course-id> and --to-version <ver>.\nUsage: node tools/content-csv/content-manager.mjs rollback <course-id> --to-version <ver> --target <env>\n',
        process.stderr
      );
      return;
    }

    const targetVersion = parseInt(flags.toVersion, 10);
    if (isNaN(targetVersion) || targetVersion <= 0) {
      safeExit(2, `Error: --to-version must be a positive integer, got '${flags.toVersion}'.\n`, process.stderr);
      return;
    }

    try {
      const rollbackResult = await rollbackContent({
        db,
        courseId: flags.courseId,
        targetVersion,
        operator: flags.operator,
        reason: flags.reason || `Rollback via CLI to version ${targetVersion}`,
        backupDir: flags.backupDir,
      });

      safeExit(0, JSON.stringify({ action: 'rollback', success: true, target: flags.target, result: rollbackResult }, null, 2) + '\n');
    } catch (err) {
      safeExit(1, `Rollback failed: ${err.message}\n`, process.stderr);
    }
    return;
  }

  // 7. Export
  if (flags.command === 'export') {
    if (!flags.courseId) {
      safeExit(2, 'Error: export requires <course-id>.\nUsage: node tools/content-csv/content-manager.mjs export <course-id> --out <dir>\n', process.stderr);
      return;
    }

    if (!db) {
      safeExit(2, 'Error: export requires database credentials (SUPABASE_SERVICE_ROLE_KEY).\n', process.stderr);
      return;
    }

    try {
      const currentItems = await fetchCurrentCourseContent({ db, courseId: flags.courseId });
      let currentVersion = 1;
      try {
        const status = await fetchCourseStatus({ db, courseId: flags.courseId });
        currentVersion = status?.content_version || 1;
      } catch {
        currentVersion = 1;
      }

      const backupInfo = exportRecoverableBackup({
        courseId: flags.courseId,
        version: currentVersion,
        items: currentItems,
        outDir: flags.outDir || flags.backupDir || './content-backups',
      });

      safeExit(0, JSON.stringify({ action: 'export', success: true, export: backupInfo }, null, 2) + '\n');
    } catch (err) {
      safeExit(1, `Export failed: ${err.message}\n`, process.stderr);
    }
    return;
  }

  // 8. Status
  if (flags.command === 'status') {
    if (!flags.courseId) {
      safeExit(2, 'Error: status requires <course-id>.\n', process.stderr);
      return;
    }

    if (!db) {
      safeExit(2, 'Error: status requires database credentials.\n', process.stderr);
      return;
    }

    try {
      const status = await fetchCourseStatus({ db, courseId: flags.courseId });
      safeExit(0, JSON.stringify({ action: 'status', status }, null, 2) + '\n');
    } catch (err) {
      safeExit(1, `Failed to get status: ${err.message}\n`, process.stderr);
    }
    return;
  }

  safeExit(2, `Error: Unknown command '${flags.command}'.\n`, process.stderr);
}

// Execute when run as CLI
const isDirectExecution = import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
if (isDirectExecution) {
  runCli();
}
