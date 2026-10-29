import { createContext, useContext } from 'react';

export const OnlineSyncContext = createContext(null);

export function useOnlineSync() {
  const ctx = useContext(OnlineSyncContext);
  return ctx || {
    status: 'local',
    pendingCount: 0,
    error: null,
    conflict: null,
    lastSyncedAt: null,
    sync: () => Promise.resolve(),
    retry: () => Promise.resolve(),
    refreshStatus: () => {},
  };
}
