import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabase.js';
import { useAuth } from '../lib/useAuth.js';
import { safeReturnPath } from '../lib/safeReturnPath.js';
import { Mail, ArrowLeft, RefreshCw } from 'lucide-react';

export default function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isConfigured } = useAuth();

  const params = new URLSearchParams(location.search);
  const email = params.get('email') || '';
  const returnTo = safeReturnPath(params.get('returnTo'));

  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState(null);
  const [resendError, setResendError] = useState(null);

  const handleResend = async () => {
    if (resending || !email) return;
    setResending(true);
    setResendMsg(null);
    setResendError(null);

    try {
      const { error } = await getSupabaseClient().auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`,
        },
      });
      if (error) {
        setResendError(error.message);
      } else {
        setResendMsg('Verification email resent. Check your inbox and spam folder.');
      }
    } catch (err) {
      setResendError(err.message || 'Could not resend verification email.');
    } finally {
      setResending(false);
    }
  };

  if (!isConfigured) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p style={{ color: 'var(--color-secondary-blue)', textAlign: 'center' }}>
            Backend is not configured.
          </p>
          <button className="btn-secondary" onClick={() => navigate('/')} style={{ width: '100%', marginTop: 16 }}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <button
          onClick={() => navigate('/login')}
          className="auth-back-link"
          type="button"
          aria-label="Back to Login"
        >
          <ArrowLeft size={18} />
          <span>Login</span>
        </button>

        <div className="auth-header">
          <div className="auth-logo auth-logo--verify">
            <Mail size={32} strokeWidth={2} />
          </div>
          <h1 className="auth-title">Check your email</h1>
          <p className="auth-subtitle">
            We sent a verification link to
          </p>
          {email && (
            <p style={{
              fontWeight: 700,
              color: 'var(--color-text-navy)',
              fontSize: '0.95rem',
              wordBreak: 'break-all',
              marginTop: '4px'
            }}>
              {email}
            </p>
          )}
          <p className="auth-subtitle" style={{ marginTop: '12px' }}>
            Click the link in the email to verify your account. Check your spam folder if you don't see it.
          </p>
        </div>

        {resendError && (
          <div className="auth-error" role="alert">{resendError}</div>
        )}
        {resendMsg && (
          <div className="auth-success" role="status">{resendMsg}</div>
        )}

        <button
          type="button"
          className="btn-secondary auth-submit"
          onClick={handleResend}
          disabled={resending || !email}
        >
          <RefreshCw size={16} style={{ marginRight: 8, opacity: resending ? 0.5 : 1 }} />
          {resending ? 'Resending…' : 'Resend verification email'}
        </button>

        <div className="auth-footer" style={{ marginTop: '20px' }}>
          <p>
            Already verified?{' '}
            <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="auth-link">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
