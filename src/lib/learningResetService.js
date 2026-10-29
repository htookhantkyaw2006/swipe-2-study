import { CLOUD_LANGUAGES } from './cloudImportRecords.js';
import { readSyncState, mirrorSyncStateToSidecar } from './cloudSyncState.js';
import { clearPendingSyncRequest } from './onlineSyncRequest.js';
import { writeStreakState } from './studyStreak.js';
import { getSupabaseClient } from './supabase.js';
import { storageOwner as defaultStorageOwner } from './storageOwner.js';
import {
  readPendingLearningReset,
  writePendingLearningReset,
  clearPendingLearningReset,
} from './learningResetStorage.js';

export const ALL_LEARNING_KINDS = Object.freeze([
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
 * Clears local learning tables and document for a verified account.
 * Updates the authoritative learning document with empty tables and the new reset generation,
 * clears pending sync envelopes, and resets the streak cache.
 *
 * Repeat-safe: If the document is already at newResetVersion, preserves any post-reset
 * learning that was created after the confirmed server reset.
 */
export function performLocalAccountLearningReset(
  accountId,
  newResetVersion,
  storageOwner = defaultStorageOwner,
  now = () => new Date().toISOString()
) {
  const storage = storageOwner.getStorage?.() || globalThis.localStorage;
  const scope = storageOwner.scope(accountId);

  let doc;
  try {
    doc = scope.readLearningDocument();
  } catch {
    doc = { raw: null, value: null };
  }

  const currentDocResetVersion = doc.value?.cloudSync?.resetVersion;
  const alreadyAdvanced = currentDocResetVersion !== undefined && String(currentDocResetVersion) === String(newResetVersion);

  if (!alreadyAdvanced) {
    const emptyTables = {};
    for (const lang of CLOUD_LANGUAGES) {
      for (const kind of ALL_LEARNING_KINDS) {
        emptyTables[`${lang}_${kind}`] = '[]';
      }
    }

    const nextCloudSync = {
      schemaVersion: 1,
      ownerId: accountId.toLowerCase(),
      resetVersion: String(newResetVersion),
      records: {},
      lastServerTime: now(),
      updatedAt: now(),
    };

    const nextValue = {
      ...(doc.value || {}),
      version: 1,
      revision: (doc.value?.revision || 0) + 1,
      tables: {
        ...(doc.value?.tables || {}),
        ...emptyTables,
      },
      cloudSync: nextCloudSync,
      guestImport: doc.value?.guestImport ?? {
        fingerprint: '0'.repeat(64),
        choice: 'account-only',
        decidedAt: now(),
        handled: {},
      },
    };

    // Atomically commit document
    scope.commitLearningDocument(doc.raw, nextValue, {});
    mirrorSyncStateToSidecar(storage, nextCloudSync);
  }

  // 2. Clear pending sync requests
  clearPendingSyncRequest(storage, accountId);

  // 3. Reset streak cache
  writeStreakState(storage, accountId, {
    currentStreak: 0,
    longestStreak: 0,
    todayStudied: false,
    lastStudyDate: null,
    timezone: 'Asia/Yangon',
    isGuest: false,
    updatedAt: now(),
  });

  // 4. Clean any legacy individual table keys
  for (const lang of CLOUD_LANGUAGES) {
    for (const kind of ALL_LEARNING_KINDS) {
      try {
        storage.removeItem(`s2s_user_${accountId.toLowerCase()}_${lang}_${kind}`);
      } catch {
        // ignore individual removal errors
      }
    }
  }
}

/**
 * Creates learning reset service.
 */
export function createLearningResetService({
  storageOwner = defaultStorageOwner,
  getClient = getSupabaseClient,
  now = () => new Date().toISOString(),
} = {}) {
  /**
   * Resets guest-owned learning data only on this device.
   * Reports storage failures honestly.
   */
  function resetGuestLearning() {
    const scope = storageOwner.scope(null);
    const storage = storageOwner.getStorage?.() || globalThis.localStorage;

    try {
      for (const lang of CLOUD_LANGUAGES) {
        for (const kind of ALL_LEARNING_KINDS) {
          if (scope.setTable) {
            scope.setTable(lang, kind, '[]');
          } else {
            scope.setItem(`${lang}_${kind}`, '[]');
          }
        }
      }

      writeStreakState(storage, null, {
        currentStreak: 0,
        longestStreak: 0,
        todayStudied: false,
        lastStudyDate: null,
        timezone: 'Asia/Yangon',
        isGuest: true,
        updatedAt: now(),
      });
    } catch (err) {
      return {
        status: 'failed',
        error: `Storage failure during guest reset: ${err?.message || 'Write failed'}`,
      };
    }

    return { status: 'success', scope: 'guest' };
  }

  /**
   * Performs atomic cloud learning reset for a verified account.
   * Employs an immutable durable request envelope for replay safety across network failures.
   */
  async function resetAccountLearning({
    accountId,
    isCurrent,
  } = {}) {
    if (!accountId) {
      throw new Error('Account ID is required for account learning reset.');
    }

    const checkCurrent = () => {
      if (typeof isCurrent === 'function' && !isCurrent()) {
        const err = new Error('Your account changed. Reopen reset for current account.');
        err.code = 'ACCOUNT_CHANGED';
        throw err;
      }
      if (storageOwner.getOwner() !== accountId) {
        const err = new Error('Account owner mismatch during learning reset.');
        err.code = 'ACCOUNT_CHANGED';
        throw err;
      }
    };

    try {
      checkCurrent();
    } catch {
      return { status: 'account_changed' };
    }

    const storage = storageOwner.getStorage?.() || globalThis.localStorage;

    // Check for existing pending reset request; fail closed on corrupt envelope
    const { state: existingPending, error: pendingReadError, corrupt } = readPendingLearningReset(storage, accountId);
    if (corrupt || pendingReadError) {
      return {
        status: 'failed',
        error: `Recovery error reading pending reset request: ${pendingReadError || 'Corrupt pending reset envelope'}`,
        corrupt: true,
      };
    }

    let pending = existingPending;

    if (!pending) {
      const { state: syncState } = readSyncState(storage, accountId);
      const expectedResetVersion = String(syncState?.resetVersion ?? '0');

      pending = {
        ownerId: accountId,
        requestId: globalThis.crypto.randomUUID(),
        expectedResetVersion,
        status: 'pending',
        createdAt: now(),
        updatedAt: now(),
      };
      const persisted = writePendingLearningReset(storage, accountId, pending);
      if (!persisted) {
        return {
          status: 'failed',
          error: 'Failed to persist durable reset envelope before network dispatch.',
        };
      }
    } else if (pending.status === 'failed') {
      // Uncertain retry: preserve exact original requestId and expectedResetVersion
      pending = {
        ...pending,
        status: 'pending',
        updatedAt: now(),
      };
      writePendingLearningReset(storage, accountId, pending);
    }

    // If server previously confirmed reset but local cleanup failed, go straight to local cleanup
    if (pending.status === 'server_confirmed' && pending.serverResult) {
      return retryLocalAccountCleanup({ accountId, isCurrent });
    }

    const client = getClient();
    let resData;
    let rpcError = null;

    try {
      const res = await client.rpc('s2s_reset_learning', {
        p_expected_user_id: accountId,
        p_request_id: pending.requestId,
        p_expected_reset_version: pending.expectedResetVersion,
      });
      resData = res.data;
      rpcError = res.error;
    } catch (err) {
      rpcError = err;
    }

    try {
      checkCurrent();
    } catch {
      return { status: 'account_changed' };
    }

    // Strictly validate server confirmation response shape and bindings
    const isResponseValid = (
      !rpcError &&
      resData &&
      typeof resData === 'object' &&
      resData.status === 'reset' &&
      resData.user_id?.toLowerCase() === accountId.toLowerCase() &&
      resData.request_id === pending.requestId &&
      String(resData.previous_reset_version) === String(pending.expectedResetVersion) &&
      resData.items_reset === true &&
      typeof resData.reset_version === 'string'
    );

    if (!isResponseValid) {
      const msg = rpcError?.message || 'Server learning reset did not confirm valid completion.';
      writePendingLearningReset(storage, accountId, {
        ...pending,
        status: 'failed',
        error: msg,
        updatedAt: now(),
      });
      return {
        status: 'failed',
        error: msg,
      };
    }

    // Server confirmed: record server confirmation before attempting local cleanup
    const confirmationPersisted = writePendingLearningReset(storage, accountId, {
      ...pending,
      status: 'server_confirmed',
      serverResult: resData,
      updatedAt: now(),
    });

    if (!confirmationPersisted) {
      return {
        status: 'local_cleanup_failed',
        serverResult: resData,
        error: 'Server reset confirmed, but confirmation state could not be persisted locally.',
      };
    }

    // Execute local device cleanup
    let cleanupSucceeded = false;
    try {
      performLocalAccountLearningReset(accountId, resData.reset_version, storageOwner, now);
      cleanupSucceeded = true;
    } catch {
      cleanupSucceeded = false;
    }

    if (!cleanupSucceeded) {
      return {
        status: 'local_cleanup_failed',
        serverResult: resData,
        error: 'Your data was reset on the server, but local cached data could not be completely cleared.',
      };
    }

    // Full success: remove pending reset request record
    clearPendingLearningReset(storage, accountId);

    return {
      status: 'success',
      serverResult: resData,
    };
  }

  /**
   * Retries local device cleanup after the server has already confirmed reset.
   * Does NOT make another RPC call to the server.
   */
  function retryLocalAccountCleanup({
    accountId,
    isCurrent,
  } = {}) {
    if (typeof isCurrent === 'function' && !isCurrent()) {
      return { status: 'account_changed' };
    }
    if (storageOwner.getOwner() !== accountId) {
      return { status: 'account_changed' };
    }

    const storage = storageOwner.getStorage?.() || globalThis.localStorage;
    const { state: pending, error: readError } = readPendingLearningReset(storage, accountId);

    if (readError || !pending || pending.status !== 'server_confirmed' || !pending.serverResult) {
      return {
        status: 'failed',
        error: 'No confirmed server reset pending local cleanup.',
      };
    }

    let cleanupSucceeded = false;
    try {
      performLocalAccountLearningReset(accountId, pending.serverResult.reset_version, storageOwner, now);
      cleanupSucceeded = true;
    } catch {
      cleanupSucceeded = false;
    }

    if (!cleanupSucceeded) {
      return {
        status: 'local_cleanup_failed',
        serverResult: pending.serverResult,
        error: 'Could not clear device storage. Please try again.',
      };
    }

    clearPendingLearningReset(storage, accountId);

    return {
      status: 'success',
      serverResult: pending.serverResult,
    };
  }

  return Object.freeze({
    resetGuestLearning,
    resetAccountLearning,
    retryLocalAccountCleanup,
  });
}

export const learningResetService = createLearningResetService();
