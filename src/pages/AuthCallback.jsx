import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/useAuth.js';
import { safeReturnPath } from '../lib/safeReturnPath.js';
import { AlertCircle, RefreshCw } from 'lucide-react';

/* ---------------------------------------------------------------
   AUTH CALLBACK
   ---------------------------------------------------------------
   Handles verification redirects for Supabase PKCE and email confirmation.
   Coordinates with the Supabase client's detectSessionInUrl initialization.
   Does NOT redirect on an arbitrary timer; only navigates after the user
   is genuinely verified by the Auth coordinator.
   --------------------------------------------------------------- */

function parseCallbackError(search, hash) {
  const searchParams = new URLSearchParams(search);
  const hashString = hash?.startsWith('#') ? hash.slice(1) : (hash || '');
  const hashParams = new URLSearchParams(hashString);

  const errorCode = searchParams.get('error_code') || hashParams.get('error_code');
  const errorParam = searchParams.get('error') || hashParams.get('error');
  const errorDesc = searchParams.get('error_description') || hashParams.get('error_description');

  if (errorCode || errorParam || errorDesc) {
    if (errorCode === 'otp_expired' || errorParam === 'otp_expired') {
      return 'The verification link has expired. Please request a new verification email.';
    }
    if (errorCode === 'access_denied' && !errorDesc) {
      return 'Verification was denied. The link may have expired or already been used.';
    }
    if (errorDesc) {
      return decodeURIComponent(errorDesc.replace(/\+/g, ' '));
    }
    return errorParam || 'Verification failed. The link may be invalid or already used.';
  }

  return null;
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading, isTransitioning, error: authError } = useAuth();

  const [timedOut, setTimedOut] = useState(false);

  const returnTo = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return safeReturnPath(searchParams.get('returnTo'));
  }, [location.search]);

  // 1. Check for explicit error parameters in the URL query or hash
  const urlError = useMemo(() => {
    return parseCallbackError(location.search, location.hash);
  }, [location.search, location.hash]);

  // 2. Check for missing code/tokens when there is no active session
  const missingCodeError = useMemo(() => {
    if (urlError || user || authLoading || isTransitioning) return null;
    const searchParams = new URLSearchParams(location.search);
    const hashString = location.hash?.startsWith('#') ? location.hash.slice(1) : (location.hash || '');
    const hasCode = searchParams.has('code');
    const hasAccessToken = new URLSearchParams(hashString).has('access_token');
    if (!hasCode && !hasAccessToken) {
      return 'No verification code was found. Please open the link from your email or sign in directly.';
    }
    return null;
  }, [urlError, user, authLoading, isTransitioning, location.search, location.hash]);

  // 3. Timeout handler: if verification neither finishes nor errors after 10s
  useEffect(() => {
    if (user || urlError || missingCodeError || authError) return;

    const timer = setTimeout(() => {
      setTimedOut(true);
    }, 10000);

    return () => clearTimeout(timer);
  }, [user, urlError, missingCodeError, authError]);

  // 4. Success navigation: ONLY navigate after user is verified and transition completes
  useEffect(() => {
    if (user && !isTransitioning) {
      navigate(returnTo, { replace: true });
    }
  }, [user, isTransitioning, navigate, returnTo]);

  // Aggregate the effective error, if any
  const displayError = urlError || missingCodeError || authError || (timedOut ? 'Verification is taking longer than expected. The link may be expired or already used.' : null);

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
