import { isPreferencesSyncEnabled } from './preferencesSyncGate.js';

const initial = () => ({
  accountId: null,
  generation: null,
  status: 'local', // 'local' | 'restoring' | 'saving' | 'saved' | 'failed'
  error: null,
  lastSyncedAt: null,
  isHydrated: true,
});

export function createPreferencesSyncController({
  service,
  allowOnline = isPreferencesSyncEnabled(),
  onRestoreApplied = null,
} = {}) {
  let state = Object.freeze(initial());
  let operationToken = 0;
  let localMutationCounter = 0;
  let pendingRestoreEdits = {
    settings: {},
    activeLanguage: null,
    changedKeys: [],
  };
  const listeners = new Set();

  function publish(patch) {
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // Ignore subscriber rendering errors
      }
    }
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function getState() {
    return state;
  }

  function cancel() {
    operationToken++;
    pendingRestoreEdits = { settings: {}, activeLanguage: null, changedKeys: [] };
  }

  const isCurrentOperation = (token, accountId, generation) =>
    operationToken === token && state.accountId === accountId && state.generation === generation;

  async function setAccount(account) {
    const accountId = account?.id ?? null;
    const generation = account?.generation ?? null;

    if (accountId === state.accountId && generation === state.generation) {
      return;
    }

    operationToken++;
    localMutationCounter = 0;
    pendingRestoreEdits = { settings: {}, activeLanguage: null, changedKeys: [] };

    if (!accountId || !allowOnline) {
      publish({
        ...initial(),
        accountId,
        generation,
        status: 'local',
        isHydrated: true,
      });
      return;
    }

    const token = operationToken;
    publish({
      ...initial(),
      accountId,
      generation,
      status: 'restoring',
      isHydrated: false,
    });

    // Perform initial restore on verified sign-in
    try {
      const res = await service.restorePreferences({
        accountId,
        isCurrent: () => isCurrentOperation(token, accountId, generation),
        pendingLocalEdits: pendingRestoreEdits,
      });

      if (!isCurrentOperation(token, accountId, generation)) return;

      if (res.status === 'failed') {
        publish({
          status: 'failed',
          error: res.error,
          isHydrated: true,
        });
        return;
      }

      // Notify caller of restored values
      if (typeof onRestoreApplied === 'function' && res.settings) {
        onRestoreApplied({
          settings: res.settings,
          activeLanguage: res.activeLanguage,
        });
      }

      // If local edits were made while restore was pending, immediately save them to cloud
      if (res.hasPendingLocalEdits) {
        publish({
          status: 'saving',
          isHydrated: true,
        });
        const saveRes = await service.savePreferences({
          accountId,
          isCurrent: () => isCurrentOperation(token, accountId, generation),
          settings: res.settings,
          activeLanguage: res.activeLanguage,
          localMutationId: ++localMutationCounter,
          changedKeys: pendingRestoreEdits.changedKeys,
        });
        if (!isCurrentOperation(token, accountId, generation)) return;
        if (saveRes.status === 'failed') {
          publish({ status: 'failed', error: saveRes.error });
        } else {
          publish({ status: 'saved', lastSyncedAt: saveRes.lastSyncedAt, error: null });
        }
      } else {
        publish({
          status: 'saved',
          lastSyncedAt: res.lastSyncedAt,
          error: null,
          isHydrated: true,
        });
      }
    } catch (err) {
      if (!isCurrentOperation(token, accountId, generation)) return;
      publish({
        status: 'failed',
        error: err?.message || 'Preferences restore failed.',
        isHydrated: true,
      });
    }
  }

  async function onLocalChange({
    settings,
    activeLanguage,
    changedKey = null,
  } = {}) {
    if (!state.accountId || !allowOnline) {
      return;
    }

    const token = operationToken;
    const mutationId = ++localMutationCounter;

    // If initial hydration is still in flight, capture local edit so restore does not overwrite it
    if (!state.isHydrated) {
      if (settings && typeof settings === 'object') {
        pendingRestoreEdits.settings = { ...pendingRestoreEdits.settings, ...settings };
      }
      if (changedKey) {
        pendingRestoreEdits.changedKeys.push(changedKey);
      }
      if (changedKey === 'activeLanguage' && activeLanguage) {
        pendingRestoreEdits.activeLanguage = activeLanguage;
      }
      return;
    }

    publish({ status: 'saving', error: null });

    try {
      const res = await service.savePreferences({
        accountId: state.accountId,
        isCurrent: () => isCurrentOperation(token, state.accountId, state.generation),
        settings,
        activeLanguage,
        localMutationId: mutationId,
        changedKeys: changedKey ? [changedKey] : [],
      });

      if (!isCurrentOperation(token, state.accountId, state.generation)) return;

      if (res.status === 'failed') {
        publish({ status: 'failed', error: res.error });
      } else if (res.status === 'saved') {
        publish({ status: 'saved', lastSyncedAt: res.lastSyncedAt, error: null });
      }
      // If res.status === 'pending' (newer edit in flight), keep status as is
    } catch (err) {
      if (!isCurrentOperation(token, state.accountId, state.generation)) return;
      publish({
        status: 'failed',
        error: err?.message || 'Failed to save preferences to cloud.',
      });
    }
  }

  async function retry() {
    if (!state.accountId || !allowOnline || state.status !== 'failed') {
      return;
    }

    const token = operationToken;
    publish({ status: 'saving', error: null });

    try {
      const res = await service.retrySave({
        accountId: state.accountId,
        isCurrent: () => isCurrentOperation(token, state.accountId, state.generation),
      });

      if (!isCurrentOperation(token, state.accountId, state.generation)) return;

      if (res.status === 'failed') {
        publish({ status: 'failed', error: res.error });
      } else if (res.status === 'saved') {
        publish({ status: 'saved', lastSyncedAt: res.lastSyncedAt, error: null });
      }
    } catch (err) {
      if (!isCurrentOperation(token, state.accountId, state.generation)) return;
      publish({
        status: 'failed',
        error: err?.message || 'Preferences retry failed.',
      });
    }
  }

  return Object.freeze({
    getState,
    subscribe,
    setAccount,
    onLocalChange,
    retry,
    cancel,
  });
}
