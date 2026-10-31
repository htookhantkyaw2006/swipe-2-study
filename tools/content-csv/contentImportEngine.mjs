import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SUPPORTED_COURSES = new Set(['zh-hsk1', 'ja-n5']);

/**
 * Computes SHA-256 hex string of a buffer or string.
 */
export function computeSha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Maps validated CSV rows into database-compatible vocabulary item objects.
 */
export function mapCsvRowsToItems(parsedRows) {
  return parsedRows.map((row) => {
    const f = row.fields;
    const examplesRaw = f[9].trim();
    let examples = [];
    if (examplesRaw) {
      try {
        examples = JSON.parse(examplesRaw);
      } catch {
        examples = [];
      }
    }

    return {
      id: f[0].trim(),
      course_id: f[1].trim(),
      language: f[2].trim(),
      level_id: f[3].trim(),
      written_form: f[4].trim(),
      reading: f[5].trim(),
      meaning_english: f[6].trim(),
      meaning_burmese: f[7].trim(),
      audio_path: f[8].trim() || null,
      examples,
      sort_order: parseInt(f[10].trim(), 10),
      is_active: true,
    };
  });
}

/**
 * Compares two JSON-compatible values for structural equality,
 * ignoring object property insertion order while strictly preserving
 * array element order and detecting actual value differences.
 */
export function areJsonValuesEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return a === b;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!areJsonValuesEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!areJsonValuesEqual(a[key], b[key])) return false;
  }
  return true;
}

function coerceExamples(examples) {
  if (typeof examples === 'string') {
    try {
      return JSON.parse(examples);
    } catch {
      return examples;
    }
  }
  return examples || [];
}

/**
 * Performs content comparison between current database row and incoming item.
 */
export function isContentEqual(current, incoming) {
  if (!current || !incoming) return false;
  if (current.written_form !== incoming.written_form) return false;
  if ((current.reading || '') !== (incoming.reading || '')) return false;
  if ((current.meaning_english || '') !== (incoming.meaning_english || '')) return false;
  if ((current.meaning_burmese || '') !== (incoming.meaning_burmese || '')) return false;
  if ((current.audio_path || null) !== (incoming.audio_path || null)) return false;
  if (Number(current.sort_order) !== Number(incoming.sort_order)) return false;
  if (Boolean(current.is_active) !== Boolean(incoming.is_active)) return false;

  const curEx = coerceExamples(current.examples);
  const incEx = coerceExamples(incoming.examples);
  return areJsonValuesEqual(curEx, incEx);
}

/**
 * Calculates diff between current database items and incoming staged items.
 * Detects inserted, updated, unchanged, retired (explicit only), and natural identity changes.
 * Omission from incoming list alone preserves items and does NOT retire them.
 */
export function calculateContentDiff({ currentItems = [], incomingItems = [], retiredIds = [] }) {
  const currentMap = new Map(currentItems.map((item) => [item.id, item]));
  const incomingMap = new Map(incomingItems.map((item) => [item.id, item]));
  const retiredSet = new Set(retiredIds);

  const inserted = [];
  const updated = [];
  const unchanged = [];
  const retired = [];
  const ambiguousChanges = [];

  for (const inc of incomingItems) {
    if (!currentMap.has(inc.id)) {
      inserted.push(inc);
    } else {
      const cur = currentMap.get(inc.id);

      // Verify stable identity: existing ID cannot change written_form OR reading
      if (cur.written_form !== inc.written_form || (cur.reading || '') !== (inc.reading || '')) {
        ambiguousChanges.push({
          id: inc.id,
          current: { written_form: cur.written_form, reading: cur.reading },
          incoming: { written_form: inc.written_form, reading: inc.reading },
        });
      } else if (isContentEqual(cur, inc)) {
        unchanged.push(inc);
      } else {
        updated.push({
          id: inc.id,
          previous: cur,
          incoming: inc,
        });
      }
    }
  }

  // Explicit retirement ONLY: items explicitly identified in retiredIds
  for (const cur of currentItems) {
    if (retiredSet.has(cur.id) && cur.is_active) {
      retired.push(cur);
    }
  }

  // Omitted items that are not in retiredSet remain active and preserved
  let omittedPreservedCount = 0;
  for (const cur of currentItems) {
    if (!incomingMap.has(cur.id) && !retiredSet.has(cur.id) && cur.is_active) {
      omittedPreservedCount++;
    }
  }

  return {
    counts: {
      inserted: inserted.length,
      updated: updated.length,
      unchanged: unchanged.length,
      retired: retired.length,
      omitted_preserved: omittedPreservedCount,
      total_incoming: incomingItems.length,
      total_current: currentItems.length,
    },
    inserted,
    updated,
    unchanged,
    retired,
    ambiguousChanges,
  };
}

/**
 * Validates identity compatibility, rejecting cross-course ID reuse, duplicate IDs,
 * and natural identity alterations.
 */
export function validateIdentityCompatibility({ currentItems = [], incomingItems = [] }) {
  const errors = [];
  const seenIds = new Set();
  const currentMap = new Map(currentItems.map((item) => [item.id, item]));

  for (const inc of incomingItems) {
    if (seenIds.has(inc.id)) {
      errors.push(`DUPLICATE_VOCABULARY_ID: Item ID '${inc.id}' appears multiple times in input.`);
    }
    seenIds.add(inc.id);

    const cur = currentMap.get(inc.id);
    if (cur) {
      if (cur.course_id && inc.course_id && cur.course_id !== inc.course_id) {
        errors.push(
          `CROSS_COURSE_ID_CONFLICT: Item ID '${inc.id}' belongs to course '${cur.course_id}', cannot be used by course '${inc.course_id}'.`
        );
      }
      if (cur.written_form !== inc.written_form || (cur.reading || '') !== (inc.reading || '')) {
        errors.push(
          `NATURAL_IDENTITY_CHANGE: Item ID '${inc.id}' cannot change written_form from '${cur.written_form}' to '${inc.written_form}' or reading from '${cur.reading}' to '${inc.reading}'.`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    ambiguousChanges: errors.length > 0 ? errors : [],
  };
}

/**
 * Creates a recoverable JSON backup of existing items before applying mutations.
 * Fails closed if the directory cannot be created or file cannot be written.
 */
export function exportRecoverableBackup({ courseId, version = 1, items = [], outDir = './content-backups' }) {
  if (!courseId) {
    throw new Error('RECOVERABLE_BACKUP_FAILED: courseId is required.');
  }

  const resolvedDir = path.resolve(process.cwd(), outDir);
  try {
    fs.mkdirSync(resolvedDir, { recursive: true });
  } catch (err) {
    throw new Error(`RECOVERABLE_BACKUP_FAILED: Unable to create backup directory '${resolvedDir}': ${err.message}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${courseId}_v${version}_backup_${timestamp}.json`;
  const targetPath = path.join(resolvedDir, filename);

  const payload = {
    course_id: courseId,
    version,
    exported_at: new Date().toISOString(),
    item_count: items.length,
    items,
  };

  try {
    const jsonStr = JSON.stringify(payload, null, 2);
    fs.writeFileSync(targetPath, jsonStr, { encoding: 'utf8', flag: 'wx' });

    // Verify written file
    const stat = fs.statSync(targetPath);
    if (stat.size === 0) {
      throw new Error('Written backup file is empty.');
    }
  } catch (err) {
    throw new Error(`RECOVERABLE_BACKUP_FAILED: Failed to write backup file '${targetPath}': ${err.message}`);
  }

  return {
    backupPath: targetPath,
    itemCount: items.length,
    version,
  };
}

/**
 * Queries current vocabulary items from the database for a given course.
 * Supports both direct SQL (PGlite/pg) and Supabase client.
 */
export async function fetchCurrentCourseContent({ db, courseId }) {
  if (!db) {
    throw new Error('Database client is required.');
  }

  if (typeof db.query === 'function') {
    const res = await db.query(
      `select id, course_id, written_form, reading, meaning_english, meaning_burmese,
              audio_path, examples, sort_order, is_active
         from public.vocabulary
        where course_id = $1
        order by sort_order, id`,
      [courseId]
    );
    return res.rows;
  }

  if (typeof db.from === 'function') {
    const { data, error } = await db
      .from('vocabulary')
      .select('id, course_id, written_form, reading, meaning_english, meaning_burmese, audio_path, examples, sort_order, is_active')
      .eq('course_id', courseId)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch current course content: ${error.message}`);
    }
    return data || [];
  }

  throw new Error('Unsupported database client interface.');
}

/**
 * Queries course status and publication metadata.
 */
export async function fetchCourseStatus({ db, courseId }) {
  if (!db) {
    throw new Error('Database client is required.');
  }

  if (typeof db.query === 'function') {
    const res = await db.query('select public.s2s_get_course_content_status($1) as result', [courseId]);
    return res.rows[0]?.result;
  }

  if (typeof db.rpc === 'function') {
    const { data, error } = await db.rpc('s2s_get_course_content_status', { p_course_id: courseId });
    if (error) {
      throw new Error(`Failed to fetch course status: ${error.message}`);
    }
    return data;
  }

  throw new Error('Unsupported database client interface.');
}

/**
 * Stages content into private.content_stages via public.s2s_stage_course_content.
 */
export async function stageContent({
  db,
  courseId,
  incomingItems,
  rawBuffer,
  operator = 'operator',
  metadata = {},
  retiredIds = [],
}) {
  if (!SUPPORTED_COURSES.has(courseId)) {
    throw new Error(`Unsupported course '${courseId}'. Only 'zh-hsk1' and 'ja-n5' are permitted.`);
  }

  const checksum = computeSha256(rawBuffer);
  const stageMetadata = {
    ...metadata,
    ...(retiredIds.length > 0 ? { retired_ids: retiredIds } : {}),
  };

  if (typeof db.query === 'function') {
    const res = await db.query(
      'select public.s2s_stage_course_content($1, $2, $3::jsonb, $4::jsonb, $5) as result',
      [courseId, checksum, JSON.stringify(incomingItems), JSON.stringify(stageMetadata), operator]
    );
    return res.rows[0]?.result;
  }

  if (typeof db.rpc === 'function') {
    const { data, error } = await db.rpc('s2s_stage_course_content', {
      p_course_id: courseId,
      p_source_checksum: checksum,
      p_items: incomingItems,
      p_metadata: stageMetadata,
      p_operator: operator,
    });
    if (error) {
      throw new Error(`Failed to stage content: ${error.message}`);
    }
    return data;
  }

  throw new Error('Unsupported database client interface.');
}

/**
 * Publishes staged content atomically, creating a recoverable backup first.
 * Aborts if backup export fails.
 */
export async function publishStagedContent({
  db,
  courseId,
  stageId,
  operator = 'operator',
  reason = 'New publication',
  backupDir = './content-backups',
}) {
  if (!SUPPORTED_COURSES.has(courseId)) {
    throw new Error(`Unsupported course '${courseId}'. Only 'zh-hsk1' and 'ja-n5' are permitted.`);
  }

  // 1. Fetch current published items for recoverable export
  const currentItems = await fetchCurrentCourseContent({ db, courseId });
  let backupInfo = null;

  if (currentItems.length > 0) {
    let currentVersion = 1;
    try {
      const status = await fetchCourseStatus({ db, courseId });
      currentVersion = status?.content_version || 1;
    } catch {
      currentVersion = 1;
    }

    // Fail closed: if backup fails, exportRecoverableBackup throws and halts execution
    backupInfo = exportRecoverableBackup({
      courseId,
      version: currentVersion,
      items: currentItems,
      outDir: backupDir,
    });
  }

  // 2. Execute atomic publication RPC
  let publishResult;
  if (typeof db.query === 'function') {
    const res = await db.query(
      'select public.s2s_publish_staged_content($1, $2::uuid, $3, $4) as result',
      [courseId, stageId, operator, reason]
    );
    publishResult = res.rows[0]?.result;
  } else if (typeof db.rpc === 'function') {
    const { data, error } = await db.rpc('s2s_publish_staged_content', {
      p_course_id: courseId,
      p_stage_id: stageId,
      p_operator: operator,
      p_reason: reason,
    });
    if (error) {
      throw new Error(`Publication RPC failed: ${error.message}`);
    }
    publishResult = data;
  } else {
    throw new Error('Unsupported database client interface.');
  }

  return {
    ...publishResult,
    backup: backupInfo,
  };
}

/**
 * Rolls back course content to a prior published version, creating a recoverable backup first.
 * Aborts if backup export fails.
 */
export async function rollbackContent({
  db,
  courseId,
  targetVersion,
  operator = 'operator',
  reason = 'Rollback to prior version',
  backupDir = './content-backups',
}) {
  if (!SUPPORTED_COURSES.has(courseId)) {
    throw new Error(`Unsupported course '${courseId}'. Only 'zh-hsk1' and 'ja-n5' are permitted.`);
  }

  // 1. Fetch current published items for recoverable export
  const currentItems = await fetchCurrentCourseContent({ db, courseId });
  let backupInfo = null;

  if (currentItems.length > 0) {
    let currentVersion = 1;
    try {
      const status = await fetchCourseStatus({ db, courseId });
      currentVersion = status?.content_version || 1;
    } catch {
      currentVersion = 1;
    }

    // Fail closed: if backup fails, exportRecoverableBackup throws and halts execution
    backupInfo = exportRecoverableBackup({
      courseId,
      version: currentVersion,
      items: currentItems,
      outDir: backupDir,
    });
  }

  // 2. Execute rollback RPC
  let rollbackResult;
  if (typeof db.query === 'function') {
    const res = await db.query(
      'select public.s2s_rollback_course_content($1, $2::bigint, $3, $4) as result',
      [courseId, targetVersion, operator, reason]
    );
    rollbackResult = res.rows[0]?.result;
  } else if (typeof db.rpc === 'function') {
    const { data, error } = await db.rpc('s2s_rollback_course_content', {
      p_course_id: courseId,
      p_target_version: targetVersion,
      p_operator: operator,
      p_reason: reason,
    });
    if (error) {
      throw new Error(`Rollback RPC failed: ${error.message}`);
    }
    rollbackResult = data;
  } else {
    throw new Error('Unsupported database client interface.');
  }

  return {
    ...rollbackResult,
    backup: backupInfo,
  };
}
