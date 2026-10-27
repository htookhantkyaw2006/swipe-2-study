import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { safeReturnPath } from '../lib/auth.jsx';

/* ---------------------------------------------------------------
   AUTH CALLBACK
   ---------------------------------------------------------------
   Supabase email confirmation redirects here with hash fragments.
   The Supabase client's detectSessionInUrl (set in supabase.js)
   automatically picks up the tokens. The Auth event subscription
   in AuthProvider handles the SIGNED_IN event and applies the
   user. This page just shows a brief transition and redirects.
   --------------------------------------------------------------- */

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState(null);

  const returnTo = safeReturnPath(new URLSearchParams(location.search).get('returnTo'));

  useEffect(() => {
    // Give Supabase client a moment to process the hash fragment.
    const timer = setTimeout(() => {
      // If we are still here after 3 seconds, something went wrong.
      setError('Verification is taking longer than expected. Please try signing in directly.');
    }, 3000);

    // The auth state change listener in AuthProvider will fire SIGNED_IN,
    // which sets the user. We wait a tick for that to propagate, then navigate.
    const nav = setTimeout(() => {
      navigate(returnTo, { replace: true });
    }, 800);

    return () => {
      clearTimeout(timer);
      clearTimeout(nav);
    };
  }, [navigate, returnTo]);

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        {error ? (
          <>
            <div className="auth-error" role="alert">{error}</div>
            <button
              className="btn-primary auth-submit"
              onClick={() => navigate('/login', { replace: true })}
              style={{ marginTop: '16px' }}
            >
              Go to Sign In
            </button>
          </>
        ) : (
          <>
            <div className="auth-logo" style={{ margin: '0 auto 16px' }}>
              <div className="auth-spinner" />
            </div>
            <h1 className="auth-title">Verifying your account…</h1>
            <p className="auth-subtitle">You'll be redirected shortly.</p>
          </>
        )}
      </div>
    </div>
  );
}
