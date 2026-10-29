import { getSupabaseClient } from './supabase.js';
import { storageOwner as defaultStorageOwner } from './storageOwner.js';
import { DEFAULTS } from './preferencesDefaults.js';
import {
  sanitizeSettings,
  sanitizeActiveLanguage,
  filterInScopePreferences,
} from './preferencesSyncSchema.js';
import {
  readPendingPreferences,
  writePendingPreferences,
  clearPendingPreferences,
} from './preferencesSyncStorage.js';

export function createPreferencesSyncService({
  storageOwner = defaultStorageOwner,
  getClient = getSupabaseClient,
  now = () => new Date().toISOString(),
} = {}) {
  /**
   * Restores preferences and active language from the cloud for a verified account.
   * Merges any pending local edits made while the request was in flight, so local changes are never lost.
   */
  async function restorePreferences({
    accountId,
    isCurrent,
    pendingLocalEdits = null,
  } = {}) {
    if (!accountId) {
      return { status: 'local' };
    }

    const checkCurrent = () => {
      if (typeof isCurrent === 'function' && !isCurrent()) {
        const err = new Error('Your account changed. Reopen preferences sync for current account.');
        err.code = 'ACCOUNT_CHANGED';
        throw err;
      }
      if (storageOwner.getOwner() !== accountId) {
        const err = new Error('Account owner mismatch during preferences restore.');
        err.code = 'ACCOUNT_CHANGED';
        throw err;
      }
    };

    checkCurrent();

    const client = getClient();
    let data;
    let queryError = null;

    try {
      const res = await client
        .from('user_preferences')
        .select('settings, active_language, updated_at')
        .eq('user_id', accountId)
        .maybeSingle();
      data = res.data;
      queryError = res.error;
    } catch (err) {
      queryError = err;
    }

    try {
      checkCurrent();
    } catch {
      return { status: 'account_changed' };
    }

    const storage = storageOwner.getStorage?.() || globalThis.localStorage;

    if (queryError) {
      return {
        status: 'failed',
        error: queryError.message || 'Could not load preferences from account.',
      };
    }

    // Sanitize cloud response against allowed schema
    const cloudSettings = data?.settings ? sanitizeSettings(data.settings, DEFAULTS) : { ...DEFAULTS };
    const cloudActiveLanguage = sanitizeActiveLanguage(data?.active_language, 'zh');

    // Merge: local edits made while restore was pending take precedence over cloud values
    const mergedSettings = { ...cloudSettings };
    if (pendingLocalEdits?.settings && typeof pendingLocalEdits.settings === 'object') {
      const changedKeys = pendingLocalEdits.changedKeys || Object.keys(pendingLocalEdits.settings);
      for (const key of changedKeys) {
        if (Object.hasOwn(pendingLocalEdits.settings, key)) {
          mergedSettings[key] = pendingLocalEdits.settings[key];
        }
      }
    }

    let mergedActiveLanguage = cloudActiveLanguage;
    if (pendingLocalEdits?.activeLanguage && pendingLocalEdits.changedKeys?.includes('activeLanguage')) {
      mergedActiveLanguage = sanitizeActiveLanguage(pendingLocalEdits.activeLanguage, cloudActiveLanguage);
    }

    // Persist merged effective state to local storage for this owner
    try {
      const scope = storageOwner.scope(accountId);
      scope.setItem('preferences', JSON.stringify(mergedSettings));
      scope.setItem('language', mergedActiveLanguage);
    } catch (storageErr) {
      return {
        status: 'failed',
        error: storageErr?.message || 'Storage error committing restored preferences.',
      };
    }

    // If there were no pending edits, clear any pending record
    const hasPendingLocalEdits = Boolean(
      pendingLocalEdits?.changedKeys && pendingLocalEdits.changedKeys.length > 0
    );
    if (!hasPendingLocalEdits) {
      clearPendingPreferences(storage, accountId);
    }

    return {
      status: 'saved',
      settings: mergedSettings,
      activeLanguage: mergedActiveLanguage,
      hasPendingLocalEdits,
      lastSyncedAt: data?.updated_at || now(),
    };
  }

  /**
   * Persists preferences and active language to the cloud for a verified account.
   * Records a dedicated pending state and preserves newer edits when an earlier save completes.
   */
  async function savePreferences({
    accountId,
    isCurrent,
    settings,
    activeLanguage,
    localMutationId = 1,
    changedKeys = [],
  } = {}) {
    if (!accountId) {
      return { status: 'local' };
    }

    const checkCurrent = () => {
      if (typeof isCurrent === 'function' && !isCurrent()) {
        const err = new Error('Your account changed. Reopen preferences sync for current account.');
        err.code = 'ACCOUNT_CHANGED';
        throw err;
      }
      if (storageOwner.getOwner() !== accountId) {
        const err = new Error('Account owner mismatch during preferences save.');
        err.code = 'ACCOUNT_CHANGED';
        throw err;
      }
    };

    checkCurrent();

    const sanitizedSettings = sanitizeSettings(settings, DEFAULTS);
    const sanitizedActiveLanguage = sanitizeActiveLanguage(activeLanguage, 'zh');
    const inScopeSettings = filterInScopePreferences(sanitizedSettings);

    const storage = storageOwner.getStorage?.() || globalThis.localStorage;

    // Record dedicated owner-scoped pending state before network transmission
    try {
      writePendingPreferences(storage, accountId, {
        ownerId: accountId,
        localMutationId,
        settings: inScopeSettings,
        activeLanguage: sanitizedActiveLanguage,
        changedKeys: Array.from(changedKeys),
        status: 'saving',
        error: null,
        updatedAt: now(),
      });
    } catch (storageErr) {
      return {
        status: 'failed',
        error: storageErr?.message || 'Failed to record pending preferences save.',
      };
    }

    const client = getClient();
    let data;
    let mutationError = null;

    try {
      const res = await client
        .from('user_preferences')
        .upsert(
          {
            user_id: accountId,
            settings: inScopeSettings,
            active_language: sanitizedActiveLanguage,
          },
          { onConflict: 'user_id' }
        )
        .select('settings, active_language, updated_at')
        .maybeSingle();

      data = res.data;
      mutationError = res.error;
    } catch (err) {
      mutationError = err;
    }

    try {
      checkCurrent();
    } catch {
      return { status: 'account_changed' };
    }

    if (mutationError) {
      const msg = mutationError.message || 'Failed to save preferences to cloud.';
      try {
        writePendingPreferences(storage, accountId, {
          ownerId: accountId,
          localMutationId,
          settings: inScopeSettings,
          activeLanguage: sanitizedActiveLanguage,
          changedKeys: Array.from(changedKeys),
          status: 'failed',
          error: msg,
          updatedAt: now(),
        });
      } catch {
        // non-fatal
      }
      return {
        status: 'failed',
        error: msg,
      };
    }

    // Check if a newer local mutation occurred while this request was in flight
    const currentPending = readPendingPreferences(storage, accountId).state;
    if (currentPending && typeof currentPending.localMutationId === 'number' && currentPending.localMutationId > localMutationId) {
      // Preserve newer pending mutation; do NOT mark as saved or clear
      return {
        status: 'pending',
        newerPending: true,
      };
    }

    // Exact mutation acknowledged: clear pending state
    clearPendingPreferences(storage, accountId);

    return {
      status: 'saved',
      lastSyncedAt: data?.updated_at || now(),
    };
  }

  /**
   * Explicitly retries saving a failed pending preference mutation.
   */
  async function retrySave({
    accountId,
    isCurrent,
  } = {}) {
    if (!accountId) return { status: 'local' };
    const storage = storageOwner.getStorage?.() || globalThis.localStorage;
    const { state } = readPendingPreferences(storage, accountId);
    if (!state || state.status !== 'failed') {
      return { status: 'saved' };
    }

    return await savePreferences({
      accountId,
      isCurrent,
      settings: state.settings,
      activeLanguage: state.activeLanguage,
      localMutationId: state.localMutationId,
      changedKeys: state.changedKeys,
    });
  }

  return Object.freeze({
    restorePreferences,
    savePreferences,
    retrySave,
  });
}

export const preferencesSyncService = createPreferencesSyncService();
