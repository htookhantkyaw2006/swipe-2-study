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
  let activeSignOut = null;
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

  function isSignOutCurrent(signOutOp) {
    if (!signOutOp || signOutOp !== activeSignOut) return false;
    if (generation === signOutOp.opGen) return true;
    if (signOutOp.signedOutGen !== null && generation === signOutOp.signedOutGen) return true;
    return false;
  }

  async function checkLocalSessionRemoved(client, currentSignOut) {
    if (currentSignOut.signedOutGen !== null) {
      return true;
    }
    try {
      if (!client?.auth?.getSession) return false;
      const { data: sessionData, error: sessionErr } = await client.auth.getSession();
      if (sessionErr) return false;
      return !sessionData?.session?.user;
    } catch {
      return false;
    }
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
          const recoveryForUserId = recoveryCandidateId === data.session.user?.id ? recoveryCandidateId : null;
          await verifySessionUser(client, opGen, recoveryForUserId);
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
          const isMatchingSignOut = Boolean(
            activeSignOut && (generation === activeSignOut.opGen || generation === activeSignOut.signedOutGen)
          );
          const eventGen = nextGeneration();
          if (isMatchingSignOut) {
            activeSignOut.signedOutGen = eventGen;
            resetToGuest(null);
            return;
          }

          // Unattributed SIGNED_OUT event:
          // Fail-closed synchronous teardown invalidates prior verification work and selects guest storage owner immediately.
          resetToGuest(null);

          // Asynchronous reconciliation outside synchronous callback:
          // Check whether the SDK still maintains an active valid session.
          Promise.resolve().then(async () => {
            if (cancelled || !isCurrent(eventGen)) return;
            try {
              const { data: sessionData, error: sessionErr } = await client.auth.getSession();
              if (cancelled || !isCurrent(eventGen)) return;
              if (sessionErr || !sessionData?.session?.user) {
                // Confirmed: SDK has no active session. Remain guest.
                resetToGuest(null);
                return;
              }
              // SDK still reports an active session! Re-verify independently via verifySessionUser.
              await verifySessionUser(client, eventGen);
            } catch (ex) {
              if (cancelled || !isCurrent(eventGen)) return;
              resetToGuest(ex.message || 'Session verification failed.');
            }
          });
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

    const recoveryForUserId = passwordRecoveryUserId || recoveryCandidateId;
    await verifySessionUser(client, gen, recoveryForUserId);
  }

  /**
   * Signs out locally on this device without clearing all localStorage.
   * Explicitly uses scope: 'local' and checks returned errors.
   */
  async function signOut() {
    if (!configured) return { error: null, confirmedLocal: true };

    // Advance generation immediately to discard any in-flight requests from this user
    const opGen = nextGeneration();
    const currentSignOut = { opGen, scope: 'local', signedOutGen: null };
    activeSignOut = currentSignOut;
    // Synchronously reset owner to guest before the network call
    resetToGuest(null);

    try {
      const client = getClient();
      const res = await client.auth.signOut({ scope: 'local' });
      const confirmedLocal = res?.error
        ? await checkLocalSessionRemoved(client, currentSignOut)
        : true;
      if (!isSignOutCurrent(currentSignOut)) {
        return { error: new Error('Account changed during sign out.') };
      }
      if (res?.error) {
        error = res.error.message;
        publishSnapshot();
        notify();
        const sdkError = res.error;
        const guidance = confirmedLocal
          ? 'Sign-out on this device is complete.'
          : 'Sign-out could not be confirmed on this device. Please try again.';
        try {
          if (sdkError && typeof sdkError === 'object' && !sdkError.guidance) {
            sdkError.guidance = guidance;
          }
        } catch {}
        return {
          error: sdkError,
          confirmedLocal,
          guidance,
        };
      }
      return { error: null, confirmedLocal: true };
    } catch (err) {
      const confirmedLocal = await checkLocalSessionRemoved(getClient(), currentSignOut);
      if (!isSignOutCurrent(currentSignOut)) {
        return { error: new Error('Account changed during sign out.') };
      }
      error = err.message || 'Logout failed.';
      publishSnapshot();
      notify();
      const guidance = confirmedLocal
        ? 'Sign-out on this device is complete.'
        : 'Sign-out could not be confirmed on this device. Please try again.';
      try {
        if (err && typeof err === 'object' && !err.guidance) {
          err.guidance = guidance;
        }
      } catch {}
      return {
        error: err,
        confirmedLocal,
        guidance,
      };
    } finally {
      if (activeSignOut === currentSignOut) {
        activeSignOut = null;
      }
    }
  }

  /**
   * Signs out on all devices (global scope). Preserves all local learning caches.
   * Advances generation and resets to guest before the network call so stale
   * in-flight responses from the previous session are discarded immediately.
   * Handles both the SDK's returned { error } object and thrown/network exceptions.
   * On failure the local session is still ended; the caller receives the error.
   */
  async function signOutGlobal() {
    if (!configured) return { error: null, confirmedLocal: true, remoteConfirmed: true };

    const opGen = nextGeneration();
    const currentSignOut = { opGen, scope: 'global', signedOutGen: null };
    activeSignOut = currentSignOut;
    resetToGuest(null);

    try {
      const client = getClient();
      const res = await client.auth.signOut({ scope: 'global' });
      const confirmedLocal = res?.error
        ? await checkLocalSessionRemoved(client, currentSignOut)
        : true;
      if (!isSignOutCurrent(currentSignOut)) {
        return { error: new Error('Account changed during sign out.') };
      }
      if (res?.error) {
        const message = confirmedLocal
          ? (res.error.message || 'Could not sign out on all devices. You have been signed out on this device.')
          : (res.error.message || 'Could not sign out of your session on this device. Please try again.');
        error = message;
        publishSnapshot();
        notify();
        const sdkError = res.error;
        const guidance = confirmedLocal
          ? 'Sign-out on other devices could not be confirmed. You have been signed out on this device.'
          : 'Sign-out could not be confirmed on this device. Please try again.';
        try {
          if (sdkError && typeof sdkError === 'object' && !sdkError.guidance) {
            sdkError.guidance = guidance;
          }
        } catch {}
        return {
          error: sdkError,
          confirmedLocal,
          remoteConfirmed: false,
          guidance,
        };
      }
      return {
        error: null,
        confirmedLocal: true,
        remoteConfirmed: true,
      };
    } catch (err) {
      const confirmedLocal = await checkLocalSessionRemoved(getClient(), currentSignOut);
      if (!isSignOutCurrent(currentSignOut)) {
        return { error: new Error('Account changed during sign out.') };
      }
      const message = confirmedLocal
        ? (err?.message || 'Could not reach the server. You have been signed out on this device. Other sessions may remain active briefly.')
        : (err?.message || 'Network error prevented signing out on this device. Please try again.');
      error = message;
      publishSnapshot();
      notify();
      const guidance = confirmedLocal
        ? 'Sign-out on other devices could not be confirmed. You have been signed out on this device.'
        : 'Sign-out could not be confirmed on this device. Please try again.';
      try {
        if (err && typeof err === 'object' && !err.guidance) {
          err.guidance = guidance;
        }
      } catch {}
      return {
        error: err,
        confirmedLocal,
        remoteConfirmed: false,
        guidance,
      };
    } finally {
      if (activeSignOut === currentSignOut) {
        activeSignOut = null;
      }
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
    signOutGlobal,
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
