import React, { useEffect, useSyncExternalStore } from 'react';
import { AuthContext } from './authContext.js';
import { defaultAuthCoordinator } from './authCoordinator.js';

/* ---------------------------------------------------------------
   AUTH PROVIDER
   ---------------------------------------------------------------
   Lives above StorageOwnerBoundary and CourseShell.
   Coordinates with AuthCoordinator to verify sessions with Supabase
   getUser() before selecting their private cache.
   Gates private rendering during initialization so no mismatched
   user/cache pair ever renders.
   --------------------------------------------------------------- */

export function AuthProvider({ children, coordinator = defaultAuthCoordinator }) {
  useEffect(() => {
    return coordinator.initialize();
  }, [coordinator]);

  const state = useSyncExternalStore(
    coordinator.subscribe,
    coordinator.getState,
    coordinator.getState
  );

  const value = {
    user: state.user,
    loading: state.loading,
    isTransitioning: state.isTransitioning,
    error: state.error,
    clearError: coordinator.clearError,
    retryVerification: coordinator.retryVerification,
    signOut: coordinator.signOut,
    captureGeneration: coordinator.captureGeneration,
    isCurrent: coordinator.isCurrent,
    isGuest: state.isGuest,
    isConfigured: state.isConfigured,
  };

  // Gate rendering during initialization so an unverified guest state
  // or mismatched owner cache is never rendered before verification completes.
  if (state.loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-gradient)'
        }}
        aria-busy="true"
        aria-live="polite"
      >
        <div className="auth-spinner" style={{ width: 36, height: 36 }} />
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
