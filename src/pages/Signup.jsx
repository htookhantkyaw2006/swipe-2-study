import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabase.js';
import { useAuth } from '../lib/useAuth.js';
import { safeReturnPath } from '../lib/safeReturnPath.js';
import { trackEvent } from '../lib/analytics.js';
import { isGoogleAuthEnabled, initiateGoogleSignIn } from '../lib/googleAuth.js';
import { Mail, Lock, Eye, EyeOff, User, ArrowLeft, Sparkles } from 'lucide-react';

export default function Signup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isConfigured, user, loading: authLoading, isTransitioning } = useAuth();
  const googleEnabled = isGoogleAuthEnabled();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState(null);

  const returnTo = safeReturnPath(new URLSearchParams(location.search).get('returnTo'));

  useEffect(() => {
    if (user && !authLoading && !isTransitioning) {
      navigate(returnTo, { replace: true });
    }
  }, [user, authLoading, isTransitioning, navigate, returnTo]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || googleLoading) return;
    setError(null);

    const trimmedName = displayName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setError('Please enter your display name.');
      return;
    }
    if (trimmedName.length > 100) {
      setError('Display name must be 100 characters or less.');
      return;
    }
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (!password) {
      setError('Please choose a password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const { data, error: signUpError } = await getSupabaseClient().auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: { display_name: trimmedName },
          emailRedirectTo: `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      // Supabase returns a user but with no session when email confirmation is required.
      if (data.user && !data.session) {
        trackEvent('auth:signup_success', { mode: 'email_confirmation' });
        navigate(`/verify-email?email=${encodeURIComponent(trimmedEmail)}&returnTo=${encodeURIComponent(returnTo)}`);
      } else if (data.session) {
        trackEvent('auth:signup_success', { mode: 'direct' });
        navigate(returnTo, { replace: true });
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (loading || googleLoading) return;
    setError(null);
    setGoogleLoading(true);
    try {
      const client = getSupabaseClient();
      const { error: signInError } = await initiateGoogleSignIn(client, { returnTo });
      if (signInError) {
        setError(signInError.message || 'Could not initiate Google sign-in. Please try again.');
      }
    } catch (err) {
      setError(err?.message || 'Could not initiate Google sign-in. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  if (!isConfigured) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p style={{ color: 'var(--color-secondary-blue)', textAlign: 'center' }}>
            Backend is not configured. The app is running in guest mode.
          </p>
          <button className="btn-secondary" onClick={() => navigate('/')} style={{ width: '100%', marginTop: 16 }}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const busy = loading || googleLoading;

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Back link */}
        <button
          onClick={() => navigate('/')}
          className="auth-back-link"
          type="button"
          aria-label="Back to Home"
          disabled={busy}
        >
          <ArrowLeft size={18} />
          <span>Home</span>
        </button>

        {/* Header */}
        <div className="auth-header">
          <div className="auth-logo">
            <Sparkles size={28} strokeWidth={2.5} />
          </div>
          <h1 className="auth-title">Create account</h1>
          <p className="auth-subtitle">Start your language learning journey</p>
        </div>

        {/* Error */}
        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field">
            <label htmlFor="signup-name" className="auth-label">Display name</label>
            <div className="auth-input-wrap">
              <User size={18} className="auth-input-icon" />
              <input
                id="signup-name"
                type="text"
                className="auth-input"
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
                maxLength={100}
                required
                disabled={busy}
              />
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="signup-email" className="auth-label">Email</label>
            <div className="auth-input-wrap">
              <Mail size={18} className="auth-input-icon" />
              <input
                id="signup-email"
                type="email"
                className="auth-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={busy}
              />
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="signup-password" className="auth-label">Password</label>
            <div className="auth-input-wrap">
              <Lock size={18} className="auth-input-icon" />
              <input
                id="signup-password"
                type={showPassword ? 'text' : 'password'}
                className="auth-input"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
                disabled={busy}
              />
              <button
                type="button"
                className="auth-input-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
                disabled={busy}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary auth-submit"
            disabled={busy}
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        {googleEnabled && (
          <>
            <div className="auth-divider">
              <span>or</span>
            </div>
            <button
              type="button"
              className="btn-secondary auth-provider-btn"
              onClick={handleGoogleSignIn}
              disabled={busy}
            >
              {googleLoading ? 'Connecting to Google…' : 'Continue with Google'}
            </button>
          </>
        )}

        {/* Footer links */}
        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="auth-link">
              Sign in
            </Link>
          </p>
        </div>

        {/* Guest access */}
        <button
          type="button"
          className="btn-secondary auth-guest"
          onClick={() => navigate('/')}
          disabled={busy}
        >
          Continue as Guest
        </button>
        <p className="auth-guest-note">
          Guest progress stays on this device and is not synced to the cloud.
        </p>
      </div>
    </div>
  );
}
