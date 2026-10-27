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
  const listeners = new Set();

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
  function applyVerifiedUser(verifiedUser) {
    user = verifiedUser;
    if (verifiedUser?.id) {
      storageOwner.setOwner(verifiedUser.id);
    } else {
      storageOwner.setOwner(null);
    }
    error = null;
    isTransitioning = false;
    loading = false;
    notify();
  }

  /**
   * Reset to guest: used on sign-out or when session verification fails.
   */
  function resetToGuest(errorMessage = null) {
    user = null;
    storageOwner.setOwner(null);
    isTransitioning = false;
    loading = false;
    if (errorMessage) {
      error = errorMessage;
    }
    notify();
  }

  /**
   * Verify an active session against Supabase Auth server using getUser().
   * Only applies the user if the operation generation is still current.
   */
  async function verifySessionUser(client, opGen) {
    try {
      const { data, error: userErr } = await client.auth.getUser();
      if (!isCurrent(opGen)) return; // Stale — user logged out or switched

      if (userErr || !data?.user) {
        resetToGuest(userErr ? userErr.message : 'Invalid session user.');
        return;
      }

      applyVerifiedUser(data.user);
    } catch (ex) {
      if (!isCurrent(opGen)) return;
      resetToGuest(ex.message || 'Session verification failed.');
    }
  }

  /**
   * Initializes session restoration and subscribes to Auth events.
   * Returns a cleanup function that unsubscribes.
   */
  function initialize() {
    if (!configured) {
      loading = false;
      notify();
      return () => {};
    }

    let cancelled = false;
    let subscription = null;
    const client = getClient();
    const opGen = nextGeneration();

    loading = true;
    error = null;

    // 1. Initial Session Restoration guarded by opGen
    client.auth.getSession()
      .then(async ({ data, error: sessionErr }) => {
        if (cancelled || !isCurrent(opGen)) return;

        if (sessionErr) {
          resetToGuest(sessionErr.message);
          return;
        }

        if (data?.session) {
          await verifySessionUser(client, opGen);
        } else {
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

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          if (!session?.user) return;

          // If the verified user ID already matches and we are not transitioning, update metadata
          if (user?.id === session.user.id && !isTransitioning) {
            user = session.user;
            notify();
            return;
          }

          // A new user has arrived or account switch is occurring.
          // Synchronously advance generation and set transitioning to gate mismatched rendering.
          const switchGen = nextGeneration();
          isTransitioning = true;
          notify();

          // Schedule asynchronous verification outside the synchronous callback
          Promise.resolve().then(async () => {
            if (cancelled || !isCurrent(switchGen)) return;
            await verifySessionUser(client, switchGen);
          });
        }
      });
      subscription = subData?.subscription;
    } catch (err) {
      console.warn('Could not subscribe to Auth events:', err.message);
    }

    return () => {
      cancelled = true;
      if (subscription) {
        subscription.unsubscribe();
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
        notify();
        return { error: res.error };
      }
      return { error: null };
    } catch (err) {
      error = err.message || 'Logout failed.';
      notify();
      return { error: err };
    }
  }

  function clearError() {
    error = null;
    notify();
  }

  function getState() {
    return {
      user,
      loading,
      isTransitioning,
      error,
      isGuest: !user && !loading && !isTransitioning,
      isConfigured: configured,
      generation,
    };
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
    retryVerification,
    clearError,
    captureGeneration,
    isCurrent,
  };
}

export const defaultAuthCoordinator = createAuthCoordinator();
