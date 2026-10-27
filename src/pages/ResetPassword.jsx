import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Lock, Eye, EyeOff, KeyRound, Check } from 'lucide-react';
import { useAuth } from '../lib/useAuth.js';
import { getSupabaseClient } from '../lib/supabase.js';
import { recoveryLinkError, RESET_LINK_REQUIRED, updateRecoveredPassword } from '../lib/passwordRecovery.js';
import './PasswordRecovery.css';

export default function ResetPassword() {
  const { user, isConfigured, passwordRecoveryUserId, canResetPassword, completePasswordRecovery, error: authError } = useAuth();
  const location = useLocation();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const mounted = useRef(false);
  const locked = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const linkError = recoveryLinkError(location.search, location.hash);
  const ready = Boolean(user && passwordRecoveryUserId === user.id && canResetPassword?.(user.id) && !linkError);

  const submit = async event => {
    event.preventDefault();
    if (locked.current || !ready) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const expectedUserId = user.id;
      const result = await updateRecoveredPassword(getSupabaseClient().auth, { password, confirmation, expectedUserId, isAllowed: canResetPassword });
      if (!mounted.current) return;
      if (result.error) { setError(result.error); return; }
      if (!completePasswordRecovery(expectedUserId)) { setError(RESET_LINK_REQUIRED); return; }
      setPassword(''); setConfirmation(''); setSuccess(true);
    } catch { if (mounted.current) setError('Could not update your password. Please try again.'); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  return <div className="auth-page"><div className="auth-card">
    <div className="auth-header"><div className="auth-logo">{success ? <Check size={28} aria-hidden="true" /> : <KeyRound size={28} aria-hidden="true" />}</div><h1 className="auth-title">{success ? 'Password updated' : 'Set a new password'}</h1><p className="auth-subtitle">{success ? 'Your new password is ready to use.' : 'Choose a password for your recovered account.'}</p></div>
    {success ? <Link className="btn-primary recovery-continue" to="/">Continue learning</Link> : !isConfigured ? <div className="auth-error" role="status">Password recovery is unavailable while the backend is not configured. <Link className="auth-link" to="/">Back to Home</Link></div> : !ready ? <>
      <div className="auth-error" role="alert">{linkError || authError || RESET_LINK_REQUIRED}</div><Link className="btn-primary recovery-continue" to="/forgot-password">Request a new reset link</Link><Link className="auth-link recovery-signin" to="/login">Back to Sign in</Link>
    </> : <>
      <p className="recovery-account">Updating password for <strong>{user.email || 'your verified account'}</strong></p>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <form className="auth-form" onSubmit={submit}>
        <div className="auth-field"><label className="auth-label" htmlFor="reset-password">New password</label><div className="auth-input-wrap"><Lock size={18} className="auth-input-icon" aria-hidden="true" /><input className="auth-input" id="reset-password" type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={6} required disabled={busy} value={password} onChange={event => setPassword(event.target.value)} /><button type="button" className="auth-input-toggle" onClick={() => setVisible(!visible)} aria-label={visible ? 'Hide passwords' : 'Show passwords'}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
        <div className="auth-field"><label className="auth-label" htmlFor="reset-confirmation">Confirm new password</label><div className="auth-input-wrap"><Lock size={18} className="auth-input-icon" aria-hidden="true" /><input className="auth-input" id="reset-confirmation" type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={6} required disabled={busy} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></div></div>
        <button className="btn-primary auth-submit" type="submit" disabled={busy}>{busy ? 'Updating password…' : 'Update password'}</button>
      </form>
    </>}
  </div></div>;
}
