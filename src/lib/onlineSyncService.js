import { getSupabaseClient } from './supabase.js';
import { storageOwner as defaultStorageOwner } from './storageOwner.js';
import { wordOf, readingOf } from './entry.js';
import { readSyncState, mirrorSyncStateToSidecar } from './cloudSyncState.js';
import { restoreAccountSnapshot } from './cloudSnapshotHydration.js';
import { decimalVersion, CLOUD_LANGUAGES } from './cloudImportRecords.js';
import {
  readPendingSyncRequest,
  writePendingSyncRequest,
  clearPendingSyncRequest,
} from './onlineSyncRequest.js';

const RESERVED = new Set(['id', 'user_id', 'item_key', 'revision', 'reset_version', 'created_at', 'updated_at', 'language']);
const IDENTITY_KEYS = new Set(['phrase', 'word', 'character', 'reading', 'pronunciation', 'pinyin', 'kana']);

const SUPPORTED_KINDS = ['saved_words', 'review_cards'];

export function isSupportedSyncKind(kind) {
  return SUPPORTED_KINDS.includes(kind);
}

export function extractRowData(row) {
  const data = {};
  for (const [key, value] of Object.entries(row)) {
    if (RESERVED.has(key) || IDENTITY_KEYS.has(key) || ['is_sample', 'isSample', 'seeded', 'demo'].includes(key)) {
      continue;
    }
    data[key] = value;
  }
  return data;
}

export function parseItemKey(key) {
  const parts = key.split(':');
  if (parts.length < 3) return null;
  const language = parts[0];
  const kind = parts[1];
  const written = parts[2];
  const reading = parts.slice(3).join(':');
  return { language, kind, written, reading };
}

export function createOnlineSyncService({
  storageOwner = defaultStorageOwner,
  getClient = getSupabaseClient,
  now = () => new Date().toISOString(),
} = {}) {
  /**
   * Counts dirty and deleted items in local learning document
   */
  function countPending(ownerId) {
    if (!ownerId) return 0;
    try {
      const storage = storageOwner.getStorage?.() || globalThis.localStorage;
      const { state } = readSyncState(storage, ownerId);
      if (!state?.records) return 0;
      let count = 0;
      for (const [key, rec] of Object.entries(state.records)) {
        const parsed = parseItemKey(key);
        if (!parsed || !isSupportedSyncKind(parsed.kind)) continue;
        if (rec.status === 'dirty' || rec.status === 'deleted') {
          count++;
        }
      }
      return count;
    } catch {
      return 0;
    }
  }

  /**
   * Performs an online synchronization pass for the verified account.
   */
  async function performSync({
    accountId,
    _generation,
    isCurrent,
    _retry = false,
  } = {}) {
    if (!accountId) {
      return { status: 'local', pendingCount: 0 };
    }

    const checkCurrent = () => {
      if (typeof isCurrent === 'function' && !isCurrent()) {
        const err = new Error('Your account changed. Reopen sync for current account.');
        err.code = 'ACCOUNT_CHANGED';
        throw err;
      }
    };

    checkCurrent();

    const storage = storageOwner.getStorage?.() || globalThis.localStorage;
    const scope = storageOwner.scope(accountId);

    // 1. Check for existing pending request envelope (retry case)
    const pendingRes = readPendingSyncRequest(storage, accountId);
    let envelope = pendingRes.request;

    if (!envelope) {
      // 2. Build new mutation envelope from dirty/deleted local records
      let doc;
      try {
        doc = scope.readLearningDocument();
      } catch (err) {
        return {
          status: 'failed',
          error: err?.message || 'Failed to read local learning data.',
          pendingCount: countPending(accountId),
        };
      }

      const syncState = doc.value?.cloudSync || readSyncState(storage, accountId).state || {
        schemaVersion: 1,
        ownerId: accountId.toLowerCase(),
        resetVersion: '0',
        records: {},
      };

      const mutations = [];
      const itemsSnapshot = {};

      for (const [itemKey, rec] of Object.entries(syncState.records || {})) {
        const parsed = parseItemKey(itemKey);
        if (!parsed || !isSupportedSyncKind(parsed.kind)) continue;
        const { language, kind, written, reading } = parsed;

        if (rec.status === 'deleted') {
          mutations.push({
            op: 'delete',
            language,
            kind,
            written_form: written,
            reading: reading || '',
            client_id: itemKey,
            base_revision: rec.cloudRevision ? String(rec.cloudRevision) : undefined,
            observed_at: rec.deletedAt || now(),
          });
          itemsSnapshot[itemKey] = {
            status: 'deleted',
            timestamp: rec.deletedAt || '',
          };
        } else if (rec.status === 'dirty') {
          const rawTable = scope.getTable(language, kind);
          let rows = [];
          try {
            rows = rawTable ? JSON.parse(rawTable) : [];
          } catch {
            continue;
          }

          // Locate row matching identity
          const row = rows.find(r => {
            const w = wordOf(r);
            const red = r.pronunciation ?? readingOf(r) ?? '';
            return w === written && (red === reading || (!reading && !red));
          });

          if (row) {
            mutations.push({
              op: 'upsert',
              language,
              kind,
              written_form: written,
              reading: reading || '',
              client_id: itemKey,
              base_revision: rec.cloudRevision ? String(rec.cloudRevision) : undefined,
              observed_at: row.updated_at || row.created_at || rec.updatedAt || now(),
              data: extractRowData(row),
            });
            itemsSnapshot[itemKey] = {
              status: 'dirty',
              timestamp: rec.updatedAt || row.updated_at || row.created_at || '',
            };
          }
        }
      }

      if (mutations.length === 0) {
        // Nothing to sync; check if all supported records are synced
        return {
          status: 'saved',
          pendingCount: 0,
          lastSyncedAt: syncState.updatedAt || now(),
        };
      }

      const resetVer = String(syncState.resetVersion ?? '0');
      envelope = {
        schemaVersion: 1,
        ownerId: accountId,
        requestId: crypto.randomUUID(),
        resetVersion: resetVer,
        mutations,
        itemsSnapshot,
        createdAt: now(),
      };

      // Persist envelope before transmission
      try {
        writePendingSyncRequest(storage, accountId, envelope);
      } catch (err) {
        return {
          status: 'failed',
          error: err?.message || 'Storage error persisting sync request.',
          pendingCount: mutations.length,
        };
      }
    }

    checkCurrent();

    // 3. Transmit to server
    const client = getClient();
    let data;
    let rpcError = null;

    try {
      const res = await client.rpc('s2s_apply_mutations', {
        p_expected_user_id: envelope.ownerId,
        p_request_id: envelope.requestId,
        p_expected_reset_version: envelope.resetVersion,
        p_mutations: envelope.mutations,
        p_atomic: false,
      });
      data = res.data;
      rpcError = res.error;
    } catch (err) {
      rpcError = err;
    }

    try {
      checkCurrent();
    } catch {
      return { status: 'account_changed' };
    }

    // 4. Handle server error
    if (rpcError) {
      const msg = rpcError.message || String(rpcError);

      if (msg.includes('RESET_VERSION_CHANGED') || rpcError.code === '40001') {
        // Reset detected on server: discard stale pending envelope and reload
        clearPendingSyncRequest(storage, accountId, envelope.requestId);

        // Invalidate old learning cache
        const doc = scope.readLearningDocument();
        if (doc.value) {
          const wipedTables = { ...(doc.value.tables || {}) };
          for (const lang of CLOUD_LANGUAGES) {
            for (const kind of SUPPORTED_KINDS) {
              wipedTables[`${lang}_${kind}`] = '[]';
            }
          }
          scope.commitLearningDocument(doc.raw, {
            ...doc.value,
            revision: (doc.value.revision || 0) + 1,
            tables: wipedTables,
            cloudSync: {
              schemaVersion: 1,
              ownerId: accountId.toLowerCase(),
              resetVersion: '1',
              records: {},
              updatedAt: now(),
            },
          });
        }

        // Hydrate from new generation
        await restoreAccountSnapshot(client, storageOwner, {
          expectedUserId: accountId,
          isCurrent,
          now,
        });

        return {
          status: 'reset_reloaded',
          pendingCount: countPending(accountId),
        };
      }

      // Preserve unresolved envelope for retry
      return {
        status: 'failed',
        error: msg,
        pendingCount: envelope.mutations.length,
      };
    }

    // 5. Validate server response
    if (!data || data.status !== 'committed' || data.user_id !== envelope.ownerId
      || data.request_id !== envelope.requestId || !decimalVersion(data.reset_version)
      || !Array.isArray(data.acknowledged)) {
      return {
        status: 'failed',
        error: 'Invalid response from sync server.',
        pendingCount: envelope.mutations.length,
      };
    }

    // 6. Commit acknowledgements to local authoritative document
    let hasConflict = false;
    let conflictDetails = null;

    try {
      const doc = scope.readLearningDocument();
      const currentSyncState = doc.value?.cloudSync || readSyncState(storage, accountId).state || {
        schemaVersion: 1,
        ownerId: accountId.toLowerCase(),
        resetVersion: data.reset_version,
        records: {},
      };

      const nextRecords = { ...(currentSyncState.records || {}) };

      for (const ack of data.acknowledged) {
        const itemKey = ack.client_id;
        const snap = envelope.itemsSnapshot[itemKey];
        const current = nextRecords[itemKey];

        if (!current) continue;

        const currentTimestamp = current.status === 'deleted' ? current.deletedAt : current.updatedAt;
        const snapTimestamp = snap?.timestamp;

        // Check if item was modified locally while request was in-flight
        if (snap && currentTimestamp !== snapTimestamp) {
          // Newer local edit happened while in-flight!
          // Leave it dirty, but update base revision so the next batch builds on server revision
          if (ack.status === 'applied') {
            nextRecords[itemKey] = {
              ...current,
              status: 'dirty',
              cloudRevision: String(ack.revision),
            };
          }
          continue;
        }

        // Unmodified: apply acknowledgement
        if (ack.status === 'applied') {
          nextRecords[itemKey] = {
            status: 'synced',
            cloudRevision: String(ack.revision),
            updatedAt: currentTimestamp || now(),
          };
        } else if (ack.status === 'deleted') {
          // Confirmed server tombstone: remove local deletion record
          delete nextRecords[itemKey];
        } else if (ack.status === 'conflict') {
          hasConflict = true;
          conflictDetails = ack.error;
          nextRecords[itemKey] = {
            ...current,
            status: 'dirty',
            conflict: ack.error,
            serverRevision: String(ack.server_revision || ''),
          };
        }
      }

      const nextSyncState = {
        ...currentSyncState,
        resetVersion: String(data.reset_version),
        records: nextRecords,
        lastServerTime: now(),
        updatedAt: now(),
      };

      // Atomic commit
      if (doc.value) {
        scope.commitLearningDocument(doc.raw, {
          ...doc.value,
          revision: (doc.value.revision || 0) + 1,
          cloudSync: nextSyncState,
        });
      }

      // Successful commit: clear pending request envelope
      clearPendingSyncRequest(storage, accountId, envelope.requestId);
      mirrorSyncStateToSidecar(storage, nextSyncState);
    } catch (err) {
      return {
        status: 'failed',
        error: err?.message || 'Failed to commit sync acknowledgements locally.',
        pendingCount: envelope.mutations.length,
      };
    }

    const remainingPending = countPending(accountId);
    const finalStatus = hasConflict ? 'conflict' : (remainingPending > 0 ? 'local' : 'saved');

    return {
      status: finalStatus,
      pendingCount: remainingPending,
      conflict: conflictDetails,
      lastSyncedAt: now(),
    };
  }

  return Object.freeze({
    countPending,
    performSync,
  });
}

export const onlineSyncService = createOnlineSyncService();

