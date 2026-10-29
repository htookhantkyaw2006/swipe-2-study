import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/useAuth.js';
import { safeReturnPath } from '../lib/safeReturnPath.js';
import { getAuthCallbackState } from '../lib/authCallbackState.js';
import { inspectAuthCallbackSession } from '../lib/authCallbackSession.js';
import { getSupabaseClient } from '../lib/supabase.js';
import { AlertCircle, RefreshCw } from 'lucide-react';

/* ---------------------------------------------------------------
   AUTH CALLBACK
   ---------------------------------------------------------------
   Handles verification redirects for Supabase PKCE and OAuth (including Google).
   Coordinates with the Supabase client's detectSessionInUrl initialization.
   PKCE requires the callback to occur in the exact same browser profile
   and origin where sign-in was initiated (same-browser/same-origin requirement)
   so the code_verifier stored in localStorage can be retrieved.
   Does NOT redirect on an arbitrary timer; only navigates after the user
   is genuinely verified by the centralized Auth coordinator.
   Survives routine same-owner verification updates (TOKEN_REFRESHED,
   USER_UPDATED) while failing closed on account switches or sign-outs.
   --------------------------------------------------------------- */

function getStoredCallbackOwner() {
  try {
    return sessionStorage.getItem('s2s_callback_owner');
  } catch {
    return null;
  }
}

function setStoredCallbackOwner(id) {
  try {
    if (id) {
      sessionStorage.setItem('s2s_callback_owner', id);
    } else {
      sessionStorage.removeItem('s2s_callback_owner');
    }
  } catch {}
}

export default function AuthCallback({ client: propClient, auth: propAuth } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const authContext = useAuth();
  const {
    user,
    loading: authLoading,
    isTransitioning,
    error: authError,
    captureGeneration,
    isCurrent,
    isGuest,
  } = authContext;
  const [mountGen] = useState(() => (captureGeneration ? captureGeneration() : 0));

  // Durable binding to the initiating owner:
  // Preserves initiating user identity across session transitions to guarantee
  // that a stale callback link initiated by Account A cannot redirect Account B.
  const storedOwner = getStoredCallbackOwner();
  const initiatingUserIdRef = useRef(storedOwner || user?.id || null);
  if (!initiatingUserIdRef.current && user?.id) {
    initiatingUserIdRef.current = user.id;
    setStoredCallbackOwner(user.id);
  } else if (initiatingUserIdRef.current && !storedOwner) {
    setStoredCallbackOwner(initiatingUserIdRef.current);
  }

  // Ref tracking latest auth state for asynchronous completion checks
  const authStateRef = useRef({ user, isGuest, isTransitioning, isCurrent });
  authStateRef.current = { user, isGuest, isTransitioning, isCurrent };

  // Check whether the callback attempt remains valid:
  // - If session generation matches mount generation, nothing changed -> valid
  // - If generation advanced: survive routine same-owner verification updates
  //   (TOKEN_REFRESHED, USER_UPDATED) for the initiating owner.
  // - Fail closed if user signed out, switched accounts, or is transitioning.
  const isLifecycleValid = useCallback(() => {
    const current = authStateRef.current;
    const boundUserId = initiatingUserIdRef.current || getStoredCallbackOwner();

    // Fail closed on explicit logout or guest state
    if (boundUserId && (!current.user || current.isGuest)) {
      return false;
    }

    // Fail closed on account switch / replacement
    if (boundUserId && current.user?.id && current.user.id !== boundUserId) {
      return false;
    }

    // Guard against in-flight transition
    if (current.isTransitioning) {
      return false;
    }

    // 1. Generation unchanged: completely valid if owner matches
    const genCurrent = current.isCurrent ? current.isCurrent(mountGen) : (isCurrent ? isCurrent(mountGen) : true);
    if (genCurrent && (!boundUserId || current.user?.id === boundUserId)) {
      return true;
    }

    // 2. Generation advanced: valid ONLY if same verified owner
    const isSameOwner = Boolean(
      boundUserId &&
      current.user?.id === boundUserId &&
      !current.isGuest &&
      !current.isTransitioning
    );

    return isSameOwner;
  }, [isCurrent, mountGen]);

  const isLifecycleValidRef = useRef(isLifecycleValid);
  isLifecycleValidRef.current = isLifecycleValid;

  const [timedOut, setTimedOut] = useState(false);
  const [callbackCheck, setCallbackCheck] = useState({ pending: true, error: null });

  const authTargetRef = useRef(null);
  authTargetRef.current = propAuth?.initialize
    ? propAuth
    : propAuth?.auth?.initialize
      ? propAuth.auth
      : propClient?.auth?.initialize
        ? propClient.auth
        : authContext?.client?.auth?.initialize
          ? authContext.client.auth
          : null;

  useEffect(() => {
    let cancelled = false;
    // initialize() returns the SDK's cached initialization result. The SDK is
    // still the only owner of the one-time PKCE exchange.
    (async () => {
      try {
        const authTarget = authTargetRef.current || getSupabaseClient().auth;
        const error = await inspectAuthCallbackSession(authTarget);
        if (!cancelled && isLifecycleValidRef.current()) {
          setCallbackCheck({ pending: false, error });
        }
      } catch {
        if (!cancelled && isLifecycleValidRef.current()) {
          setCallbackCheck({
            pending: false,
            error: 'Sign-in is unavailable. Return to Sign In and try again.',
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const returnTo = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return safeReturnPath(searchParams.get('returnTo'));
  }, [location.search]);

  const { error: displayError, canNavigate } = getAuthCallbackState({
    search: location.search,
    hash: location.hash,
    user,
    loading: authLoading,
    isTransitioning,
    authError,
    timedOut,
    callbackPending: callbackCheck.pending,
    callbackError: callbackCheck.error,
  });

  // 3. Timeout handler: if verification neither finishes nor errors after 10s
  useEffect(() => {
    if (canNavigate || displayError) return;

    const timer = setTimeout(() => {
      setTimedOut(true);
    }, 10000);

    return () => clearTimeout(timer);
  }, [canNavigate, displayError]);

  // 4. Success navigation: ONLY navigate after user is verified, transition completes, and session remains valid
  useEffect(() => {
    if (canNavigate && isLifecycleValid()) {
      setStoredCallbackOwner(null);
      navigate(returnTo, { replace: true });
    }
  }, [canNavigate, navigate, returnTo, isLifecycleValid]);

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        {displayError ? (
          <>
            <div className="auth-logo" style={{ margin: '0 auto 16px', background: 'linear-gradient(135deg, #FCA5A5 0%, #DC2626 100%)' }}>
              <AlertCircle size={28} />
            </div>
            <h1 className="auth-title">Verification issue</h1>
            <div className="auth-error" role="alert" style={{ textAlign: 'left', marginTop: '12px' }}>
              {displayError}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
              <button
                className="btn-primary auth-submit"
                onClick={() => navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true })}
              >
                Go to Sign In
              </button>
              <button
                className="btn-secondary auth-submit"
                onClick={() => navigate(`/verify-email?returnTo=${encodeURIComponent(returnTo)}`, { replace: true })}
              >
                <RefreshCw size={14} style={{ marginRight: 6 }} />
                Resend verification email
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => navigate('/', { replace: true })}
                style={{ width: '100%', marginTop: '4px', fontSize: '0.875rem' }}
              >
                Continue as Guest
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="auth-logo" style={{ margin: '0 auto 16px' }}>
              <div className="auth-spinner" />
            </div>
            <h1 className="auth-title">Verifying your account…</h1>
            <p className="auth-subtitle">Confirming your session with the server. Please wait.</p>
          </>
        )}
      </div>
    </div>
  );
}
