import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from './supabase.js';
import { readSupabaseConfig } from './supabaseConfig.js';
import { storageOwner } from './storageOwner.js';

/* ---------------------------------------------------------------
   AUTH PROVIDER
   ---------------------------------------------------------------
   Lives above StorageOwnerBoundary and CourseShell. Restores the
   Supabase session, subscribes to Auth events, and only selects an
   owner UUID after verifying the actual user. Logout resets to
   guest (null) before unmounting private state.

   Race protection: a generation counter discards stale async work
   that arrives after a logout or account switch. The Auth event
   callback itself is synchronous; async follow-up work reads the
   counter to decide whether to apply.
   --------------------------------------------------------------- */

const AuthContext = import.meta.hot?.data.AuthContext ?? createContext(null);
if (import.meta.hot) import.meta.hot.data.AuthContext = AuthContext;

/** True when the backend is configured; false keeps the guest-only path. */
function isBackendConfigured() {
  try {
    const env = import.meta.env ?? {};
    return readSupabaseConfig(env).status === 'configured';
  } catch {
    return false;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => isBackendConfigured());
  const [error, setError] = useState(null);

  // Generation counter: incremented on every user transition (login/logout/switch).
  // Stale async responses check their captured generation before applying.
  const generation = useRef(0);

  // Apply a verified user. Only set the storageOwner once we trust the session.
  const applyUser = useCallback((sessionUser) => {
    generation.current += 1;
    if (sessionUser) {
      setUser(sessionUser);
      storageOwner.setOwner(sessionUser.id);
    } else {
      storageOwner.setOwner(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (!isBackendConfigured()) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const client = getSupabaseClient();

    // 1. Restore session
    client.auth.getSession().then(({ data, error: err }) => {
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      if (data.session?.user) {
        applyUser(data.session.user);
      }
      setLoading(false);
    });

    // 2. Subscribe to Auth events (synchronous callback)
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (session?.user) {
          applyUser(session.user);
        }
      } else if (event === 'SIGNED_OUT') {
        applyUser(null);
      }
      // INITIAL_SESSION is handled by getSession above.
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [applyUser]);

  const signOut = useCallback(async () => {
    if (!isBackendConfigured()) return;
    try {
      // Reset owner before the server round-trip so the previous user's
      // UI is torn down immediately (StorageOwnerBoundary remounts).
      applyUser(null);
      await getSupabaseClient().auth.signOut();
    } catch (err) {
      setError(err.message);
    }
  }, [applyUser]);

  const value = {
    user,
    loading,
    error,
    clearError: () => setError(null),
    signOut,
    /** Capture the current generation so async work can detect staleness. */
    captureGeneration: () => generation.current,
    /** True if the captured generation still matches. */
    isCurrent: (gen) => gen === generation.current,
    isGuest: !user && !loading,
    isConfigured: isBackendConfigured(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export { safeReturnPath } from './safeReturnPath.js';

