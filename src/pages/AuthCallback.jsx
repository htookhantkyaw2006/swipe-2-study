import { useEffect, useState, useMemo } from 'react';
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
   Invalidates callback resolution if an account switch or sign-out occurs.
   --------------------------------------------------------------- */

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading, isTransitioning, error: authError, captureGeneration, isCurrent } = useAuth();
  const [mountGen] = useState(() => (captureGeneration ? captureGeneration() : 0));

  const [timedOut, setTimedOut] = useState(false);
  const [callbackCheck, setCallbackCheck] = useState({ pending: true, error: null });

  useEffect(() => {
    let cancelled = false;
    // initialize() returns the SDK's cached initialization result. The SDK is
    // still the only owner of the one-time PKCE exchange.
    (async () => {
      try {
        const error = await inspectAuthCallbackSession(getSupabaseClient().auth);
        if (!cancelled && (isCurrent ? isCurrent(mountGen) : true)) {
          setCallbackCheck({ pending: false, error });
        }
      } catch {
        if (!cancelled && (isCurrent ? isCurrent(mountGen) : true)) {
          setCallbackCheck({
            pending: false,
            error: 'Sign-in is unavailable. Return to Sign In and try again.',
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [mountGen, isCurrent]);

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

  // 4. Success navigation: ONLY navigate after user is verified, transition completes, and session generation matches
  useEffect(() => {
    if (canNavigate && (isCurrent ? isCurrent(mountGen) : true)) {
      navigate(returnTo, { replace: true });
    }
  }, [canNavigate, navigate, returnTo, isCurrent, mountGen]);

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
