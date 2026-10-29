import { readCloudSnapshot } from './cloudImportService.js';
import { CLOUD_LANGUAGES, CLOUD_KINDS } from './cloudImportRecords.js';
import { wordOf, readingOf } from './entry.js';
import { parseLearningRows } from './learningDocument.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KIND_FIELDS = {
  search_history: 'term',
  written_chars: 'character',
  learned_radicals: 'radical',
  learned_kana: 'kana',
  learned_sounds: 'sound',
};

export function getSyncStateKey(ownerId) {
  if (!ownerId || typeof ownerId !== 'string' || !UUID_REGEX.test(ownerId)) {
    throw new TypeError('Owner ID must be a valid UUID');
  }
  return `s2s_user_${ownerId.toLowerCase()}_cloud_sync_state_v1`;
}

export function recordKey(language, kind, writtenForm, reading = '') {
  const normForm = String(writtenForm || '').normalize('NFC').trim();
  const normReading = String(reading || '').normalize('NFC').trim();
  return `${language}:${kind}:${normForm}:${normReading}`;
}

export function identityOfRow(table, row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('Stored learning data has an unsupported format. It has been kept for recovery.');
  }
  const [language, ...rest] = table.split('_');
  const kind = rest.join('_');
  if (kind === 'saved_words' || kind === 'review_cards') {
    const written = wordOf(row);
    if (typeof written !== 'string' || written.trim().length === 0) {
      throw new Error('Stored learning data has an unsupported format. It has been kept for recovery.');
    }
    const reading = row.pronunciation ?? readingOf(row) ?? '';
    if (typeof reading !== 'string') {
      throw new Error('Stored learning data has an unsupported format. It has been kept for recovery.');
    }
    return recordKey(language, kind, written, reading);
  }
  const field = KIND_FIELDS[kind];
  if (!field) {
    throw new Error('Stored learning data has an unsupported format. It has been kept for recovery.');
  }
  const written = row[field];
  if (typeof written !== 'string' || written.trim().length === 0) {
    throw new Error('Stored learning data has an unsupported format. It has been kept for recovery.');
  }
  return recordKey(language, kind, written, '');
}

export function readSyncState(storage, ownerId) {
  const key = getSyncStateKey(ownerId);
  let raw;
  try {
    raw = storage.getItem(key);
  } catch {
    return { state: null, error: 'Storage access error' };
  }

  if (raw === null || raw === undefined) {
    return { state: null, error: null };
  }

  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { state: null, error: 'Malformed sync state JSON' };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: null, error: 'Malformed sync state JSON' };
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    parsed.schemaVersion !== 1 ||
    typeof parsed.ownerId !== 'string' ||
    parsed.ownerId.toLowerCase() !== ownerId.toLowerCase() ||
    (parsed.records !== undefined && (typeof parsed.records !== 'object' || parsed.records === null || Array.isArray(parsed.records)))
  ) {
    return { state: null, error: 'Invalid sync state schema' };
  }

  return { state: parsed, error: null };
}

export function persistSyncState(storage, state) {
  const key = getSyncStateKey(state.ownerId);
  storage.setItem(key, JSON.stringify(state));
}

export function recordLocalDeletion(storage, ownerId, language, kind, writtenForm, reading = '', now = () => new Date().toISOString()) {
  const { state, error } = readSyncState(storage, ownerId);
  if (error) {
    throw new Error(`Could not update sync state: ${error}`);
  }
  const nextState = state || {
    schemaVersion: 1,
    ownerId: ownerId.toLowerCase(),
    resetVersion: '0',
    lastServerTime: null,
    records: {},
  };
  const key = recordKey(language, kind, writtenForm, reading);
  nextState.records[key] = {
    status: 'deleted',
    deletedAt: now(),
  };
  persistSyncState(storage, nextState);
}

export function recordLocalDirty(storage, ownerId, language, kind, writtenForm, reading = '', now = () => new Date().toISOString()) {
  const { state, error } = readSyncState(storage, ownerId);
  if (error) {
    throw new Error(`Could not update sync state: ${error}`);
  }
  const nextState = state || {
    schemaVersion: 1,
    ownerId: ownerId.toLowerCase(),
    resetVersion: '0',
    lastServerTime: null,
    records: {},
  };
  const key = recordKey(language, kind, writtenForm, reading);
  nextState.records[key] = {
    status: 'dirty',
    updatedAt: now(),
  };
  persistSyncState(storage, nextState);
}

/**
 * Reconciles local account tables with a verified cloud snapshot.
 * Preserves newer local learning, prevents deleted items from returning,
 * and migrates pre-existing local rows safely.
 */
export function reconcileSnapshotWithLocal({
  localTables,
  snapshot,
  syncState,
  now = () => new Date().toISOString(),
}) {
  if (!localTables || typeof localTables !== 'object' || Array.isArray(localTables)) {
    throw new Error('Stored learning data has an unsupported format. It has been kept for recovery.');
  }

  const reconciledTables = { ...localTables };
  let changesCount = 0;

  const currentResetVersion = snapshot.reset_version;
  const isResetMismatch = syncState && syncState.resetVersion !== currentResetVersion;

  // Next sync state
  const nextRecords = isResetMismatch ? {} : { ...(syncState?.records ?? {}) };

  // Map snapshot items by table
  const cloudByTable = {};
  for (const language of CLOUD_LANGUAGES) {
    for (const kind of CLOUD_KINDS) {
      cloudByTable[`${language}_${kind}`] = [];
    }
  }

  for (const item of snapshot.items) {
    const tableName = `${item.language}_${item.kind}`;
    if (cloudByTable[tableName]) {
      cloudByTable[tableName].push(item);
    }
  }

  // Process all supported cloud tables
  for (const language of CLOUD_LANGUAGES) {
    for (const kind of CLOUD_KINDS) {
      const tableName = `${language}_${kind}`;
      const cloudItems = cloudByTable[tableName] || [];
      const localRowsRaw = localTables[tableName];
      let localRows = [];
      if (localRowsRaw !== undefined && localRowsRaw !== null) {
        if (typeof localRowsRaw === 'string') {
          localRows = parseLearningRows(localRowsRaw);
        } else if (Array.isArray(localRowsRaw)) {
          if (localRowsRaw.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
            throw new Error('Stored learning data has an unsupported format. It has been kept for recovery.');
          }
          localRows = localRowsRaw;
        } else {
          throw new Error('Stored learning data has an unsupported format. It has been kept for recovery.');
        }
      }

      // Map local rows by identity
      const localMap = new Map();
      for (const row of localRows) {
        const id = identityOfRow(tableName, row);
        localMap.set(id, row);
      }

      const mergedRows = [];
      const seenKeys = new Set();

      // 1. Process cloud items
      for (const item of cloudItems) {
        const itemKey = recordKey(item.language, item.kind, item.written_form, item.reading);
        seenKeys.add(itemKey);

        const tracked = nextRecords[itemKey];

        // Check if item was deleted locally (preserve unacknowledged tombstone)
        if (tracked?.status === 'deleted') {
          nextRecords[itemKey] = tracked;
          continue; // Keep absent regardless of device/server clock ordering
        }

        const existingLocal = localMap.get(itemKey);

        if (existingLocal) {
          // Both exist: check if local has newer edits
          const localTime = existingLocal.updated_at || existingLocal.created_at;
          const cloudTime = item.updated_at || item.created_at;
          const localIsDirty = tracked?.status === 'dirty';

          if (localIsDirty || (localTime && Date.parse(localTime) > Date.parse(cloudTime))) {
            // Local learning wins: keep local row and retain dirty status
            mergedRows.push(existingLocal);
            nextRecords[itemKey] = {
              status: 'dirty',
              updatedAt: tracked?.updatedAt || localTime || now(),
            };
            continue;
          } else {
            // Cloud version is newer or equal: use cloud data mapped to local shape
            const row = {
              ...JSON.parse(JSON.stringify(item.data)),
              id: item.item_key,
              created_at: item.created_at,
              updated_at: item.updated_at,
            };
            if (item.kind === 'saved_words') {
              row.phrase = item.written_form;
              row.reading = item.reading;
            } else if (item.kind === 'review_cards') {
              row.character = item.written_form;
              row.pronunciation = item.reading;
            } else {
              row[KIND_FIELDS[item.kind]] = item.written_form;
            }
            mergedRows.push(row);
            nextRecords[itemKey] = {
              status: 'synced',
              cloudRevision: item.revision,
              updatedAt: item.updated_at,
            };
            continue;
          }
        } else {
          // Cloud item not in local: add it
          const row = {
            ...JSON.parse(JSON.stringify(item.data)),
            id: item.item_key,
            created_at: item.created_at,
            updated_at: item.updated_at,
          };
          if (item.kind === 'saved_words') {
            row.phrase = item.written_form;
            row.reading = item.reading;
          } else if (item.kind === 'review_cards') {
            row.character = item.written_form;
            row.pronunciation = item.reading;
          } else {
            row[KIND_FIELDS[item.kind]] = item.written_form;
          }
          mergedRows.push(row);
          changesCount++;
          nextRecords[itemKey] = {
            status: 'synced',
            cloudRevision: item.revision,
            updatedAt: item.updated_at,
          };
          continue;
        }
      }

      // 2. Process local rows not in cloud snapshot (e.g. offline creations or pre-existing caches)
      for (const [key, row] of localMap.entries()) {
        if (!seenKeys.has(key)) {
          if (nextRecords[key]?.status === 'deleted') {
            continue; // Tombstone exists, keep deleted!
          }
          // Retain local item! Never discard local data!
          mergedRows.push(row);
          nextRecords[key] = {
            status: 'dirty',
            updatedAt: row.updated_at || row.created_at || now(),
          };
        }
      }

      reconciledTables[tableName] = JSON.stringify(mergedRows);
    }
  }

  const nextSyncState = {
    schemaVersion: 1,
    ownerId: snapshot.user_id.toLowerCase(),
    resetVersion: currentResetVersion,
    lastServerTime: snapshot.server_time,
    records: nextRecords,
    updatedAt: now(),
  };

  return { reconciledTables, nextSyncState, changesCount };
}

/**
 * Restores account snapshot at verified sign-in with conflict safety,
 * generation recheck, and atomic effective-cache commit.
 */
export async function restoreAccountSnapshot(client, storageOwner, {
  expectedUserId,
  isCurrent,
  now = () => new Date().toISOString(),
}) {
  const guard = () => {
    if (typeof isCurrent === 'function' && !isCurrent()) {
      const err = new Error('Your account changed. Reopen snapshot restore for current account.');
      err.code = 'ACCOUNT_CHANGED';
      throw err;
    }
  };

  guard();

  const storage = globalThis.localStorage;

  // Check sync state metadata validity before invoking RPCs or touching local tables
  const { error: syncStateError } = readSyncState(storage, expectedUserId);
  if (syncStateError) {
    return {
      outcome: 'error',
      error: 'Could not verify current sync status. Your local data has been preserved.',
      changesCount: 0,
    };
  }

  // 1. Fetch snapshot from cloud
  const snapshotRes = await readCloudSnapshot(client, {
    expectedUserId,
    isCurrent,
  });

  guard();

  if (snapshotRes.error || !snapshotRes.snapshot) {
    return {
      outcome: 'error',
      error: snapshotRes.error || 'Could not load verified cloud snapshot.',
      changesCount: 0,
    };
  }

  const snapshot = snapshotRes.snapshot;
  const scope = storageOwner.scope(expectedUserId);

  // 2. Atomic reconciliation loop with retry on concurrent edits
  for (let attempt = 0; attempt < 3; attempt++) {
    guard();

    let raw, value;
    try {
      const doc = scope.readLearningDocument();
      raw = doc.raw;
      value = doc.value;
    } catch (docErr) {
      return {
        outcome: 'error',
        error: docErr?.message || 'Stored learning data has an unsupported format. It has been kept for recovery.',
        changesCount: 0,
      };
    }

    // Read current local tables
    const localTables = {};
    const expectedTables = {};
    try {
      for (const language of CLOUD_LANGUAGES) {
        for (const kind of CLOUD_KINDS) {
          const name = `${language}_${kind}`;
          const tableRaw = scope.getTable(language, kind);
          localTables[name] = tableRaw ?? '[]';
          expectedTables[name] = tableRaw;
        }
      }
    } catch (tableErr) {
      return {
        outcome: 'error',
        error: tableErr?.message || 'Stored learning data has an unsupported format. It has been kept for recovery.',
        changesCount: 0,
      };
    }

    const { state: syncState, error: loopSyncError } = readSyncState(storage, expectedUserId);
    if (loopSyncError) {
      return {
        outcome: 'error',
        error: 'Could not verify current sync status. Your local data has been preserved.',
        changesCount: 0,
      };
    }

    // Perform conflict-safe 3-way reconciliation
    let reconciliation;
    try {
      reconciliation = reconcileSnapshotWithLocal({
        localTables,
        snapshot,
        syncState,
        now,
      });
    } catch (reconcileErr) {
      return {
        outcome: 'error',
        error: reconcileErr?.message || 'Stored learning data has an unsupported format. It has been kept for recovery.',
        changesCount: 0,
      };
    }

    const { reconciledTables, nextSyncState, changesCount } = reconciliation;

    // Check if tables actually changed
    let hasDiff = false;
    for (const [name, serialized] of Object.entries(reconciledTables)) {
      if (serialized !== localTables[name]) {
        hasDiff = true;
        break;
      }
    }

    if (!hasDiff) {
      // Up to date; persist updated sync state
      persistSyncState(storage, nextSyncState);
      return { outcome: 'up_to_date', changesCount: 0, error: null };
    }

    // Atomically commit effective cache
    try {
      guard();
      scope.commitLearningDocument(raw, {
        ...(value ?? {}),
        version: 1,
        revision: (value?.revision ?? 0) + 1,
        tables: {
          ...(value?.tables ?? {}),
          ...reconciledTables,
        },
        guestImport: value?.guestImport ?? {
          fingerprint: '0'.repeat(64),
          choice: 'account-only',
          decidedAt: now(),
          handled: {},
        },
      }, expectedTables);

      // Persist sync state
      persistSyncState(storage, nextSyncState);

      return { outcome: 'restored', changesCount, error: null };
    } catch {
      if (attempt === 2) {
        return {
          outcome: 'error',
          error: 'Learning data changed during cloud restoration. Retrying failed.',
          changesCount: 0,
        };
      }
      // Retry loop
    }
  }

  return { outcome: 'error', error: 'Failed to commit snapshot.', changesCount: 0 };
}
