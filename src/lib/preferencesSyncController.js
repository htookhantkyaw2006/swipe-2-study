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
  let lastFailedOperation = null; // null | 'restore' | 'save'
  let inFlightSavePromise = null;
  let queuedSave = null;
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
    inFlightSavePromise = null;
    queuedSave = null;
    lastFailedOperation = null;
    pendingRestoreEdits = { settings: {}, activeLanguage: null, changedKeys: [] };
  }

  const isCurrentOperation = (token, accountId, generation) =>
    operationToken === token && state.accountId === accountId && state.generation === generation;

  async function executeSave(saveArgs, token) {
    const { accountId, generation } = state;
    publish({ status: 'saving', error: null });

    try {
      const res = await service.savePreferences({
        accountId,
        isCurrent: () => isCurrentOperation(token, accountId, generation),
        ...saveArgs,
      });

      if (!isCurrentOperation(token, accountId, generation)) return res;

      if (res?.status === 'failed') {
        lastFailedOperation = 'save';
        publish({ status: 'failed', error: res.error });
      } else if (res?.status === 'saved') {
        lastFailedOperation = null;
        publish({ status: 'saved', lastSyncedAt: res.lastSyncedAt, error: null });
      } else if (res?.status === 'pending' || res?.newerPending) {
        // Newer pending mutation is already queued/persisted and will run next in loop
        lastFailedOperation = null;
      }
      return res;
    } catch (err) {
      if (!isCurrentOperation(token, accountId, generation)) return;
      lastFailedOperation = 'save';
      publish({
        status: 'failed',
        error: err?.message || 'Failed to save preferences to cloud.',
      });
    }
  }

  async function coordinateSave(saveArgs, token) {
    const { accountId } = state;
    if (!accountId) return;

    // Persist newest validated owner-scoped pending intent immediately,
    // before waiting for earlier in-flight save.
    if (typeof service.recordPendingPreferences === 'function') {
      try {
        service.recordPendingPreferences({
          accountId,
          ...saveArgs,
        });
      } catch {
        // Non-fatal or caught during executeSave
      }
    }

    if (inFlightSavePromise) {
      queuedSave = saveArgs;
      publish({ status: 'saving', error: null });
      return inFlightSavePromise;
    }

    let currentArgs = saveArgs;
    inFlightSavePromise = (async () => {
      try {
        while (currentArgs && isCurrentOperation(token, state.accountId, state.generation)) {
          const nextToRun = currentArgs;
          currentArgs = null;
          queuedSave = null;
          await executeSave(nextToRun, token);
          if (queuedSave && isCurrentOperation(token, state.accountId, state.generation)) {
            currentArgs = queuedSave;
            queuedSave = null;
          }
        }
      } finally {
        inFlightSavePromise = null;
      }
    })();

    return inFlightSavePromise;
  }

  async function performRestore(token, accountId, generation) {
    publish({
      status: 'restoring',
      isHydrated: false,
      error: null,
    });

    try {
      const res = await service.restorePreferences({
        accountId,
        isCurrent: () => isCurrentOperation(token, accountId, generation),
        pendingLocalEdits: pendingRestoreEdits,
      });

      if (!isCurrentOperation(token, accountId, generation)) return;

      if (res.status === 'failed') {
        lastFailedOperation = 'restore';
        publish({
          status: 'failed',
          error: res.error,
          isHydrated: true,
        });
        return;
      }

      lastFailedOperation = null;

      if (res.persistedMutationId && res.persistedMutationId > localMutationCounter) {
        localMutationCounter = res.persistedMutationId;
      }

      // Notify caller of restored values
      if (typeof onRestoreApplied === 'function' && res.settings) {
        onRestoreApplied({
          settings: res.settings,
          activeLanguage: res.activeLanguage,
        });
      }

      // If local edits were made while restore was pending or persisted un-synced edits exist, save them
      if (res.hasPendingLocalEdits) {
        publish({
          status: 'saving',
          isHydrated: true,
        });
        const nextMutationId = ++localMutationCounter;
        await coordinateSave({
          settings: res.settings,
          activeLanguage: res.activeLanguage,
          localMutationId: nextMutationId,
          changedKeys: res.changedKeys || pendingRestoreEdits.changedKeys,
        }, token);
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
      lastFailedOperation = 'restore';
      publish({
        status: 'failed',
        error: err?.message || 'Preferences restore failed.',
        isHydrated: true,
      });
    }
  }

  async function setAccount(account) {
    const accountId = account?.id ?? null;
    const generation = account?.generation ?? null;

    if (accountId === state.accountId && generation === state.generation) {
      return;
    }

    operationToken++;
    localMutationCounter = 0;
    lastFailedOperation = null;
    inFlightSavePromise = null;
    queuedSave = null;
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

    await performRestore(token, accountId, generation);
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

    await coordinateSave({
      settings,
      activeLanguage,
      localMutationId: mutationId,
      changedKeys: changedKey ? [changedKey] : [],
    }, token);
  }

  async function retry() {
    if (!state.accountId || !allowOnline || state.status !== 'failed') {
      return;
    }

    const token = operationToken;

    if (lastFailedOperation === 'restore') {
      return await performRestore(token, state.accountId, state.generation);
    }

    publish({ status: 'saving', error: null });

    try {
      const res = await service.retrySave({
        accountId: state.accountId,
        isCurrent: () => isCurrentOperation(token, state.accountId, state.generation),
      });

      if (!isCurrentOperation(token, state.accountId, state.generation)) return;

      if (res.status === 'failed') {
        lastFailedOperation = 'save';
        publish({ status: 'failed', error: res.error });
      } else if (res.status === 'saved') {
        lastFailedOperation = null;
        publish({ status: 'saved', lastSyncedAt: res.lastSyncedAt, error: null });
      }
    } catch (err) {
      if (!isCurrentOperation(token, state.accountId, state.generation)) return;
      lastFailedOperation = 'save';
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
