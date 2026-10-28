import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../lib/useAuth.js';
import { guestImportService } from '../lib/guestImport.js';
import { createGuestImportController, guestImportRouteAllowed } from '../lib/guestImportController.js';
import { GuestImportContext } from '../lib/guestImportContext.js';
import GuestImportDialog from './GuestImportDialog.jsx';

export default function GuestImportProvider({ children, service = guestImportService }) {
  const auth = useAuth();
  const { pathname } = useLocation();
  const [controller] = useState(() => createGuestImportController(service));
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const ready = Boolean(auth.user?.id && !auth.loading && !auth.isTransitioning && !auth.error
    && !auth.passwordRecoveryUserId && Number.isSafeInteger(auth.generation));
  const ownerId = ready ? auth.user.id : null;
  const generation = ready ? auth.generation : null;
  const allowed = ready && guestImportRouteAllowed(pathname);
  const aligned = ownerId !== null && state.accountId === ownerId && state.generation === generation;

  useEffect(() => () => controller.cancel(), [controller]);
  useEffect(() => {
    controller.setAccount(ownerId ? { id: ownerId, generation } : null);
    if (allowed) void controller.inspect({ automatic: true });
  }, [controller, ownerId, generation, allowed]);

  const value = {
    ...state,
    available: ready,
    checking: aligned && state.checking,
    pending: aligned && state.pending,
    notice: aligned ? state.notice : null,
    openGuestImport: () => allowed && controller.inspect(),
    dismissNotice: controller.dismissNotice,
  };
  return <GuestImportContext.Provider value={value}>
    {children}
    <GuestImportDialog open={allowed && aligned && state.open} summary={state.offer?.summary ?? []}
      pending={state.pending} error={state.error} onChoose={controller.choose}
      onClose={controller.close} onReload={() => controller.inspect()} />
  </GuestImportContext.Provider>;
}
