import { storageOwner as defaultStorageOwner } from './storageOwner.js';
import { getSupabaseClient } from './supabase.js';
import { readSupabaseConfig } from './supabaseConfig.js';

function checkBackendConfigured() {
  try {
    const env = import.meta.env ?? {};
    return readSupabaseConfig(env).status === 'configured';
  } catch {
    return false;
  }
}

/**
 * Creates an AuthCoordinator instance that coordinates session restoration,
 * verification via Supabase getUser(), generation-guarded state transitions,
 * synchronous Auth event handling, and storage owner selection.
 */
export function createAuthCoordinator({
  authClient = null,
  storageOwner = defaultStorageOwner,
  isConfigured = null,
} = {}) {
  const configured = isConfigured !== null ? Boolean(isConfigured) : checkBackendConfigured();

  let user = null;
  let loading = configured;
  let isTransitioning = false;
  let error = null;
  let generation = 0;
  let recoveryCandidateId = null;
  let passwordRecoveryUserId = null;
  const listeners = new Set();

  function createSnapshot() {
    return Object.freeze({
      user,
      loading,
      isTransitioning,
      error,
      isGuest: !user && !loading && !isTransitioning,
      isConfigured: configured,
      generation,
      passwordRecoveryUserId,
      ownerId: storageOwner?.getOwner ? storageOwner.getOwner() : null,
    });
  }

  let snapshot = createSnapshot();

  function publishSnapshot() {
    snapshot = createSnapshot();
    return snapshot;
  }

  function notify() {
    for (const listener of listeners) {
      try {
        listener();
      } catch (err) {
        console.error('AuthCoordinator listener error:', err);
      }
    }
  }

  function captureGeneration() {
    return generation;
  }

  function isCurrent(gen) {
    return gen === generation;
  }

  function nextGeneration() {
    generation += 1;
    return generation;
  }

  function getClient() {
    if (authClient) return authClient;
    return getSupabaseClient();
  }

  /**
   * Verified user transition: only sets storageOwner after verification completes.
   */
  function applyVerifiedUser(verifiedUser, recoveryForUserId = null) {
    if (passwordRecoveryUserId !== verifiedUser?.id) passwordRecoveryUserId = null;
    if (recoveryForUserId === verifiedUser?.id) {
      passwordRecoveryUserId = verifiedUser.id;
      recoveryCandidateId = null;
    }
    user = verifiedUser;
    if (verifiedUser?.id) {
      storageOwner.setOwner(verifiedUser.id);
    } else {
      storageOwner.setOwner(null);
    }
    error = null;
    isTransitioning = false;
    loading = false;
    publishSnapshot();
    notify();
  }

  /**
   * Reset to guest: used on sign-out or when session verification fails.
   */
  function resetToGuest(errorMessage = null) {
    recoveryCandidateId = null;
    passwordRecoveryUserId = null;
    user = null;
    storageOwner.setOwner(null);
    isTransitioning = false;
    loading = false;
    error = errorMessage;
    publishSnapshot();
    notify();
  }

  /**
   * Verify an active session against Supabase Auth server using getUser().
   * Only applies the user if the operation generation is still current.
   */
  async function verifySessionUser(client, opGen, recoveryForUserId = null) {
    if (!isCurrent(opGen)) return;
    try {
      const { data, error: userErr } = await client.auth.getUser();
      if (!isCurrent(opGen)) return; // Stale — cleanup ran, user logged out, or switched

      if (userErr || !data?.user) {
        if (!isCurrent(opGen)) return;
        resetToGuest(userErr ? userErr.message : 'Invalid session user.');
        return;
      }

      if (!isCurrent(opGen)) return;
      if (recoveryForUserId && data.user.id !== recoveryForUserId) {
        resetToGuest('The recovery account could not be verified. Request a new reset link.');
        return;
      }
      applyVerifiedUser(data.user, recoveryForUserId);
    } catch (ex) {
      if (!isCurrent(opGen)) return;
      resetToGuest(ex.message || 'Session verification failed.');
    }
  }

  /**
   * Initializes session restoration and subscribes to Auth events.
   * Returns a cleanup function that unsubscribes and invalidates pending operations.
   */
  function initialize() {
    if (!configured) {
      loading = false;
      publishSnapshot();
      notify();
      return () => {};
    }

    let cancelled = false;
    let subscription = null;
    const client = getClient();
    const opGen = nextGeneration();

    loading = true;
    error = null;
    publishSnapshot();
    notify();

    // 1. Initial Session Restoration guarded by opGen
    client.auth.getSession()
      .then(async ({ data, error: sessionErr }) => {
        if (cancelled || !isCurrent(opGen)) return;

        if (sessionErr) {
          if (cancelled || !isCurrent(opGen)) return;
          resetToGuest(sessionErr.message);
          return;
        }

        if (data?.session) {
          await verifySessionUser(client, opGen);
        } else {
          if (cancelled || !isCurrent(opGen)) return;
          // No active session — legitimate guest state
          resetToGuest(null);
        }
      })
      .catch((ex) => {
        if (cancelled || !isCurrent(opGen)) return;
        resetToGuest(ex.message || 'Failed to restore session.');
      });

    // 2. Synchronous Auth Event Listener
    try {
      const { data: subData } = client.auth.onAuthStateChange((event, session) => {
        if (cancelled) return;

        if (event === 'SIGNED_OUT') {
          // Synchronous teardown: advance generation and reset storage owner immediately
          nextGeneration();
          resetToGuest(null);
          return;
        }

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION' || event === 'PASSWORD_RECOVERY') {
          if (!session?.user) return;

          // Remove unverified shortcut: coordinate verification via getUser() for ALL events.
          const eventGen = nextGeneration();
          const isAccountSwitch = !user || user.id !== session.user.id;
          if (passwordRecoveryUserId !== session.user.id) passwordRecoveryUserId = null;
          if (recoveryCandidateId !== session.user.id) recoveryCandidateId = null;
          if (event === 'PASSWORD_RECOVERY') recoveryCandidateId = session.user.id;
          // INITIAL_SESSION can follow PASSWORD_RECOVERY before verification.
          const recoveryForUserId = recoveryCandidateId === session.user.id ? recoveryCandidateId : null;
          if (isAccountSwitch || event === 'PASSWORD_RECOVERY') {
            isTransitioning = true;
          }
          publishSnapshot();
          notify();

          // Schedule asynchronous verification outside the synchronous callback
          Promise.resolve().then(async () => {
            if (cancelled || !isCurrent(eventGen)) return;
            await verifySessionUser(client, eventGen, recoveryForUserId);
          });
        }
      });
      subscription = subData?.subscription;
    } catch (err) {
      console.warn('Could not subscribe to Auth events:', err.message);
    }

    return () => {
      cancelled = true;
      nextGeneration();
      if (subscription) {
        try {
          subscription.unsubscribe();
        } catch {}
        subscription = null;
      }
    };
  }

  /**
   * Actionable retry when verification failed or encountered an error.
   */
  async function retryVerification() {
    if (!configured) return;
    const client = getClient();
    const gen = nextGeneration();
    loading = true;
    error = null;
    publishSnapshot();
    notify();

    await verifySessionUser(client, gen);
  }

  /**
   * Signs out locally on this device without clearing all localStorage.
   * Explicitly uses scope: 'local' and checks returned errors.
   */
  async function signOut() {
    if (!configured) return { error: null };

    // Advance generation immediately to discard any in-flight requests from this user
    nextGeneration();
    // Synchronously reset owner to guest before the network call
    resetToGuest(null);

    try {
      const client = getClient();
      const res = await client.auth.signOut({ scope: 'local' });
      if (res?.error) {
        error = res.error.message;
        publishSnapshot();
        notify();
        return { error: res.error };
      }
      return { error: null };
    } catch (err) {
      error = err.message || 'Logout failed.';
      publishSnapshot();
      notify();
      return { error: err };
    }
  }

  function clearError() {
    if (error !== null) {
      error = null;
      publishSnapshot();
      notify();
    }
  }

  function canResetPassword(expectedUserId) {
    return Boolean(expectedUserId && user?.id === expectedUserId
      && passwordRecoveryUserId === expectedUserId && !loading && !isTransitioning && !error);
  }

  function completePasswordRecovery(expectedUserId) {
    if (!canResetPassword(expectedUserId)) return false;
    passwordRecoveryUserId = null;
    recoveryCandidateId = null;
    publishSnapshot();
    notify();
    return true;
  }

  function getState() {
    return snapshot;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    getState,
    subscribe,
    initialize,
    signOut,
    canResetPassword,
    completePasswordRecovery,
    retryVerification,
    clearError,
    captureGeneration,
    isCurrent,
    getOwner: () => (storageOwner?.getOwner ? storageOwner.getOwner() : null),
  };
}

export const defaultAuthCoordinator = createAuthCoordinator();
