import { readCloudSnapshot } from './cloudImportService.js';
import { CLOUD_LANGUAGES, CLOUD_KINDS } from './cloudImportRecords.js';
import { parseLearningRows } from './learningDocument.js';
import { clearPendingSyncRequest } from './onlineSyncRequest.js';
import {
  getSyncStateKey,
  recordKey,
  identityOfRow,
  readSyncState,
  persistSyncState,
  mirrorSyncStateToSidecar,
  recordLocalDeletion,
  recordLocalDirty,
} from './cloudSyncState.js';

export {
  getSyncStateKey,
  recordKey,
  identityOfRow,
  readSyncState,
  persistSyncState,
  mirrorSyncStateToSidecar,
  recordLocalDeletion,
  recordLocalDirty,
};

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
  const isResetMismatch = Boolean(syncState && syncState.resetVersion && syncState.resetVersion !== currentResetVersion);

  // Next sync state
  const nextRecords = isResetMismatch ? {} : { ...(syncState?.records ?? {}) };

  // Map server tombstones if provided
  const serverTombstones = new Map();
  if (Array.isArray(snapshot.tombstones)) {
    for (const t of snapshot.tombstones) {
      if (t && typeof t === 'object') {
        const k = recordKey(t.language, t.kind, t.written_form, t.reading);
        serverTombstones.set(k, t);
      }
    }
  }

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
      if (!isResetMismatch && localRowsRaw !== undefined && localRowsRaw !== null) {
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
            } else if (item.kind === 'review_cards' || item.kind === 'learned_words') {
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
          } else if (item.kind === 'review_cards' || item.kind === 'learned_words') {
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
          if (serverTombstones.has(key) && nextRecords[key]?.status !== 'dirty') {
            // Deleted on server and not edited locally since: do not resurrect!
            continue;
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

  const storage = storageOwner?.getStorage ? storageOwner.getStorage() : globalThis.localStorage;

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

    if (syncState && syncState.resetVersion && syncState.resetVersion !== snapshot.reset_version) {
      clearPendingSyncRequest(storage, expectedUserId);
    }

    // Check if tables actually changed
    let hasDiff = false;
    for (const [name, serialized] of Object.entries(reconciledTables)) {
      if (serialized !== localTables[name]) {
        hasDiff = true;
        break;
      }
    }

    if (!hasDiff) {
      // Up to date; persist updated sync state inside authoritative document
      try {
        guard();
        scope.commitLearningDocument(raw, {
          ...(value ?? {}),
          version: 1,
          revision: (value?.revision ?? 0) + 1,
          tables: {
            ...(value?.tables ?? {}),
            ...localTables,
          },
          cloudSync: nextSyncState,
          guestImport: value?.guestImport ?? {
            fingerprint: '0'.repeat(64),
            choice: 'account-only',
            decidedAt: now(),
            handled: {},
          },
        }, expectedTables);
      } catch (commitErr) {
        return { outcome: 'error', error: commitErr?.message || 'Failed to commit snapshot.', changesCount: 0 };
      }
      // Best-effort mirror update to legacy sidecar for backward compatibility
      mirrorSyncStateToSidecar(storage, nextSyncState);
      return { outcome: 'up_to_date', changesCount: 0, error: null };
    }

    // Atomically commit effective cache and authoritative sync state in ONE setItem
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
        cloudSync: nextSyncState,
        guestImport: value?.guestImport ?? {
          fingerprint: '0'.repeat(64),
          choice: 'account-only',
          decidedAt: now(),
          handled: {},
        },
      }, expectedTables);

      // Best effort update of legacy sidecar
      mirrorSyncStateToSidecar(storage, nextSyncState);

      if (snapshot.streak && typeof snapshot.streak === 'object') {
        try {
          storage.setItem(`s2s_user_${expectedUserId.toLowerCase()}_study_streak_v1`, JSON.stringify({
            currentStreak: snapshot.streak.current_streak ?? 0,
            longestStreak: snapshot.streak.longest_streak ?? 0,
            todayStudied: Boolean(snapshot.streak.today_studied),
            lastStudyDate: snapshot.streak.last_study_date ?? null,
            timezone: snapshot.streak.timezone || 'Asia/Yangon',
            isGuest: false,
            updatedAt: now(),
          }));
        } catch {
          // non-fatal streak cache write
        }
      }

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
