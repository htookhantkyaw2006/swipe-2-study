import { CLOUD_LANGUAGES } from './cloudImportRecords.js';
import { readSyncState } from './cloudSyncState.js';
import { readPendingSyncRequest } from './onlineSyncRequest.js';
import { readPendingPreferences } from './preferencesSyncStorage.js';
import { getSupabaseClient } from './supabase.js';
import { storageOwner as defaultStorageOwner } from './storageOwner.js';
import { readPreferences as defaultReadPreferences } from './preferencesDefaults.js';

export const EXPORT_TABLES = Object.freeze([
  'saved_words',
  'review_cards',
  'search_history',
  'written_chars',
  'learned_radicals',
  'learned_kana',
  'learned_sounds',
  'learned_words',
]);

/**
 * Parses table rows safely from string or array.
 * Missing keys legitimately mean empty data ([]).
 * Corrupted or unparseable JSON throws an actionable error rather than silently omitting data.
 */
function parseTableRows(raw, tableName) {
  if (raw === null || raw === undefined || raw === '') return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`Expected array for table ${tableName || 'unknown'}, got ${typeof parsed}`);
    }
    return parsed;
  } catch (err) {
    throw new Error(`Export failed: Corrupted learning table data in ${tableName || 'unknown'}: ${err.message}`);
  }
}

/**
 * Collects local learning tables across all supported languages for a given scope.
 * Fails closed on corrupted data.
 */
export function collectLocalLearning(scope) {
  const learning = {};
  for (const lang of CLOUD_LANGUAGES) {
    learning[lang] = {};
    for (const kind of EXPORT_TABLES) {
      const tableName = `${lang}_${kind}`;
      const raw = scope.getTable ? scope.getTable(lang, kind) : scope.getItem(tableName);
      learning[lang][kind] = parseTableRows(raw, tableName);
    }
  }
  return learning;
}

/**
 * Creates export service for guest and verified account learning data.
 */
export function createLearningExportService({
  storageOwner = defaultStorageOwner,
  getClient = getSupabaseClient,
  readPreferences = defaultReadPreferences,
  now = () => new Date().toISOString(),
} = {}) {
  /**
   * Exports device-only learning data for guest mode.
   */
  function exportGuestLearningData() {
    const scope = storageOwner.scope(null);
    const activeLanguage = scope.getItem('language') || 'zh';
    const preferences = readPreferences();
    const learning = collectLocalLearning(scope);

    return {
      exportVersion: 1,
      exportedAt: now(),
      scope: 'guest',
      activeLanguage,
      preferences,
      learning,
    };
  }

  /**
   * Exports a validated cloud snapshot alongside pending device changes for a verified account.
   * Throws an error on network or storage failure without producing an empty success file.
   */
  async function exportAccountLearningData({
    accountId,
    isCurrent,
  } = {}) {
    if (!accountId) {
      throw new Error('Account ID is required for account export.');
    }

    const checkCurrent = () => {
      if (typeof isCurrent === 'function' && !isCurrent()) {
        const err = new Error('Your account changed. Reopen export for current account.');
        err.code = 'ACCOUNT_CHANGED';
        throw err;
      }
      if (storageOwner.getOwner() !== accountId) {
        const err = new Error('Account owner mismatch during data export.');
        err.code = 'ACCOUNT_CHANGED';
        throw err;
      }
    };

    checkCurrent();

    const client = getClient();
    let snapshotData;
    let rpcError = null;

    try {
      const res = await client.rpc('s2s_account_snapshot', {
        p_expected_user_id: accountId,
      });
      snapshotData = res.data;
      rpcError = res.error;
    } catch (err) {
      rpcError = err;
    }

    checkCurrent();

    if (rpcError || !snapshotData || typeof snapshotData !== 'object') {
      const msg = rpcError?.message || 'Could not load verified cloud snapshot from server.';
      throw new Error(`Export failed: ${msg}. Stored data has not been exported.`);
    }

    // Validate essential snapshot shape
    if (
      snapshotData.schema_version !== 1 ||
      snapshotData.user_id !== accountId ||
      !Array.isArray(snapshotData.items)
    ) {
      throw new Error('Export failed: Received malformed snapshot from sync server.');
    }

    const storage = storageOwner.getStorage?.() || globalThis.localStorage;
    const scope = storageOwner.scope(accountId);

    // Inspect pending device changes; fail closed if metadata readers fail
    const syncStateRes = readSyncState(storage, accountId);
    if (syncStateRes.error) {
      throw new Error(`Export failed: Corrupted sync state metadata: ${syncStateRes.error}`);
    }
    const syncState = syncStateRes.state;

    const pendingRequestRes = readPendingSyncRequest(storage, accountId);
    if (pendingRequestRes.error) {
      throw new Error(`Export failed: Corrupted pending sync request metadata: ${pendingRequestRes.error}`);
    }
    const pendingRequest = pendingRequestRes.request;

    const pendingPrefRes = readPendingPreferences(storage, accountId);
    if (pendingPrefRes.error) {
      throw new Error(`Export failed: Corrupted pending preferences metadata: ${pendingPrefRes.error}`);
    }
    const pendingPreferences = pendingPrefRes.state;

    const dirtyRecords = [];
    const pendingDeletions = [];

    if (syncState?.records) {
      for (const [key, rec] of Object.entries(syncState.records)) {
        if (rec.status === 'dirty') {
          dirtyRecords.push({ key, updatedAt: rec.updatedAt, localMutationId: rec.localMutationId });
        } else if (rec.status === 'deleted') {
          pendingDeletions.push({ key, deletedAt: rec.deletedAt, localMutationId: rec.localMutationId });
        }
      }
    }

    const localLearning = collectLocalLearning(scope);
    const preferences = readPreferences();
    const activeLanguage = scope.getItem('language') || 'zh';

    const payload = {
      exportVersion: 1,
      exportedAt: now(),
      scope: 'account',
      accountId,
      activeLanguage,
      preferences,
      cloudSnapshot: {
        schemaVersion: snapshotData.schema_version,
        resetVersion: String(snapshotData.reset_version ?? '0'),
        serverTime: snapshotData.server_time || now(),
        streak: snapshotData.streak || null,
        itemsCount: snapshotData.items.length,
        tombstonesCount: Array.isArray(snapshotData.tombstones) ? snapshotData.tombstones.length : 0,
        items: snapshotData.items,
        tombstones: snapshotData.tombstones || [],
      },
      pendingDeviceChanges: {
        pendingCount: dirtyRecords.length + pendingDeletions.length,
        dirtyItems: dirtyRecords,
        pendingDeletions,
        pendingEnvelope: pendingRequest
          ? {
              requestId: pendingRequest.requestId,
              createdAt: pendingRequest.createdAt,
              mutationsCount: pendingRequest.mutations?.length ?? 0,
            }
          : null,
        pendingPreferences: pendingPreferences
          ? {
              status: pendingPreferences.status,
              updatedAt: pendingPreferences.updatedAt,
              changedKeys: pendingPreferences.changedKeys || [],
            }
          : null,
      },
      localLearning,
    };

    return payload;
  }

  return Object.freeze({
    exportGuestLearningData,
    exportAccountLearningData,
  });
}

export const learningExportService = createLearningExportService();
