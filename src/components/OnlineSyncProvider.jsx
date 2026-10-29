import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAuth } from '../lib/useAuth.js';
import { storageOwner } from '../lib/storageOwner.js';
import { onlineSyncService } from '../lib/onlineSyncService.js';
import { createOnlineSyncController } from '../lib/onlineSyncController.js';
import { isOnlineSyncEnabled } from '../lib/onlineSyncGate.js';
import { OnlineSyncContext } from '../lib/onlineSyncContext.js';

export default function OnlineSyncProvider({
  children,
  service = onlineSyncService,
  allowOnline = isOnlineSyncEnabled(),
}) {
  const auth = useAuth();
  const [controller] = useState(() => createOnlineSyncController(service, { allowOnline }));
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);

  const ready = Boolean(
    auth.user?.id && !auth.loading && !auth.isTransitioning && !auth.error
    && !auth.passwordRecoveryUserId && Number.isSafeInteger(auth.generation)
  );
  const ownerId = ready ? auth.user.id : null;
  const generation = ready ? auth.generation : null;

  useEffect(() => () => controller.cancel(), [controller]);

  // Connect active account to controller and enable tracking when online
  useEffect(() => {
    controller.setAccount(ownerId ? { id: ownerId, generation } : null);
    if (allowOnline && ownerId) {
      storageOwner.setCloudTracking?.(true);
      void controller.sync({ _initial: true });
    }
  }, [controller, ownerId, generation, allowOnline]);

  // Subscribe to table changes in storageOwner to trigger sync
  useEffect(() => {
    if (!allowOnline || !ownerId) return;
    const unsubscribe = storageOwner.subscribeChange?.((detail) => {
      if (detail?.ownerId === ownerId) {
        void controller.sync();
      }
    });
    return unsubscribe;
  }, [controller, ownerId, allowOnline]);

  const value = {
    ...state,
    sync: (opts) => controller.sync(opts),
    retry: () => controller.retry(),
    refreshStatus: () => controller.refreshStatus(),
  };

  return (
    <OnlineSyncContext.Provider value={value}>
      {children}
    </OnlineSyncContext.Provider>
  );
}
