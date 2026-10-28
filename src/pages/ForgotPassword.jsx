import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, KeyRound } from 'lucide-react';
import { useAuth } from '../lib/useAuth.js';
import { getSupabaseClient } from '../lib/supabase.js';
import { requestPasswordRecovery } from '../lib/passwordRecovery.js';
import './PasswordRecovery.css';

export default function ForgotPassword() {
  const { isConfigured } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now);
  const secondsLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  useEffect(() => {
    if (!cooldownUntil) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= cooldownUntil) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);
  const locked = useRef(false);
  const submit = async event => {
    event.preventDefault();
    if (locked.current || Date.now() < cooldownUntil) return;
    locked.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const result = await requestPasswordRecovery(getSupabaseClient().auth, email, window.location.origin);
      setError(result.error || ''); setMessage(result.message || '');
      if (result.cooldownSeconds) {
        const current = Date.now();
        setNow(current);
        setCooldownUntil(current + result.cooldownSeconds * 1000);
      }
    } catch { setError('Password recovery is unavailable. Please try again.'); }
    finally { locked.current = false; setBusy(false); }
  };
  return <div className="auth-page"><div className="auth-card">
    <Link className="auth-back-link" to="/login"><ArrowLeft size={18} aria-hidden="true" />Sign in</Link>
    <div className="auth-header"><div className="auth-logo"><KeyRound size={28} aria-hidden="true" /></div><h1 className="auth-title">Forgot your password?</h1><p className="auth-subtitle">Enter your account email to request a reset link.</p></div>
    {!isConfigured ? <div className="auth-error" role="status">Password recovery is unavailable while the backend is not configured. <Link className="auth-link" to="/">Back to Home</Link></div> : <>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {message && <div className="auth-success" role="status">{message}</div>}
      <form className="auth-form" onSubmit={submit}>
        <div className="auth-field"><label className="auth-label" htmlFor="recovery-email">Email</label><div className="auth-input-wrap"><Mail size={18} className="auth-input-icon" aria-hidden="true" /><input className="auth-input" id="recovery-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" required disabled={busy} /></div></div>
        <button className="btn-primary auth-submit" type="submit" disabled={busy || secondsLeft > 0}>{busy ? 'Requesting link…' : secondsLeft > 0 ? `Please wait (${secondsLeft}s)` : 'Send reset link'}</button>
      </form>
      <p className="auth-guest-note recovery-note">Use the newest reset email. If it does not arrive, check your spam folder before requesting another.</p>
    </>}
  </div></div>;
}
