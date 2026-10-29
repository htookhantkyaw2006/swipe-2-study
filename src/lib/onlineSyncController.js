import { isOnlineSyncEnabled } from './onlineSyncGate.js';

const initial = () => ({
  accountId: null,
  generation: null,
  status: 'local', // 'local' | 'syncing' | 'saved' | 'failed' | 'conflict'
  pendingCount: 0,
  lastSyncedAt: null,
  error: null,
  conflict: null,
});

export function createOnlineSyncController(syncService, {
  allowOnline = isOnlineSyncEnabled(),
} = {}) {
  let state = Object.freeze(initial());
  let operation = 0;
  let activeSyncPromise = null;
  const listeners = new Set();

  function publish(patch) {
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) {
      try { listener(); } catch { /* Ignore subscriber rendering errors */ }
    }
  }

  const current = (token, accountId, generation) => operation === token
    && state.accountId === accountId && state.generation === generation;

  function refreshPendingCount() {
    if (!state.accountId) {
      publish({ pendingCount: 0 });
      return;
    }
    const count = syncService.countPending?.(state.accountId) ?? 0;
    publish({ pendingCount: count });
  }

  function setAccount(account) {
    const accountId = account?.id ?? null;
    const generation = account?.generation ?? null;
    if (accountId === state.accountId && generation === state.generation) return;

    operation++;
    activeSyncPromise = null;

    if (!accountId) {
      publish({ ...initial() });
      return;
    }

    const count = syncService.countPending?.(accountId) ?? 0;
    publish({
      ...initial(),
      accountId,
      generation,
      status: 'local',
      pendingCount: count,
    });
  }

  async function sync({ retry = false, _initial = false } = {}) {
    if (!state.accountId || !allowOnline) {
      const count = state.accountId ? (syncService.countPending?.(state.accountId) ?? 0) : 0;
      publish({ status: 'local', pendingCount: count });
      return;
    }

    if (activeSyncPromise) {
      return activeSyncPromise;
    }

    const { accountId, generation } = state;
    const token = ++operation;

    publish({ status: 'syncing', error: null });

    activeSyncPromise = (async () => {
      try {
        const result = await syncService.performSync({
          accountId,
          generation,
          retry,
          isCurrent: () => current(token, accountId, generation),
        });

        if (!current(token, accountId, generation)) return;

        if (result.status === 'account_changed') return;

        if (result.status === 'failed') {
          publish({
            status: 'failed',
            error: result.error || 'Sync failed',
            pendingCount: result.pendingCount ?? state.pendingCount,
          });
        } else if (result.status === 'conflict') {
          publish({
            status: 'conflict',
            conflict: result.conflict || 'Conflict detected',
            error: 'Sync conflict detected',
            pendingCount: result.pendingCount ?? state.pendingCount,
          });
        } else if (result.status === 'saved') {
          publish({
            status: 'saved',
            pendingCount: 0,
            lastSyncedAt: result.lastSyncedAt || new Date().toISOString(),
            error: null,
            conflict: null,
          });
        } else if (result.status === 'reset_reloaded') {
          publish({
            status: 'saved',
            pendingCount: 0,
            lastSyncedAt: new Date().toISOString(),
            error: null,
            conflict: null,
          });
        } else {
          // 'local': still pending mutations (e.g. from in-flight edits)
          publish({
            status: 'local',
            pendingCount: result.pendingCount ?? state.pendingCount,
            lastSyncedAt: result.lastSyncedAt || state.lastSyncedAt,
          });
        }
      } catch (err) {
        if (!current(token, accountId, generation)) return;
        publish({
          status: 'failed',
          error: err?.message || 'Sync failed',
          pendingCount: syncService.countPending?.(accountId) ?? state.pendingCount,
        });
      } finally {
        if (operation === token) {
          activeSyncPromise = null;
        }
      }
    })();

    return activeSyncPromise;
  }

  function retry() {
    return sync({ retry: true });
  }

  function cancel() {
    operation++;
    activeSyncPromise = null;
  }

  return Object.freeze({
    getState: () => state,
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setAccount,
    sync,
    retry,
    refreshStatus: refreshPendingCount,
    cancel,
  });
}

