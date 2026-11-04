import { useState, useEffect, useRef } from 'react';
import AppDialog from './ui/AppDialog.jsx';
import './DeleteAccountDialog.css';

/**
 * DeleteAccountDialog
 *
 * Presentational confirmation dialog for permanent account deletion.
 * Supports email/password re-authentication and Google OAuth re-authentication.
 * Contains NO Auth, network, routing, or storage dependencies.
 *
 * Props:
 * - open: boolean (mounts dialog only when true)
 * - pending: boolean (disables buttons/inputs, suppresses dismissal, sets aria-busy)
 * - error: string | null (accessible error message)
 * - isOAuthOnly: boolean (true for non-Google third-party OAuth accounts)
 * - isGoogleOnly: boolean (true for Google OAuth accounts without passwords)
 * - reauthRequired: boolean (indicates server returned 401 REAUTH_REQUIRED for Google)
 * - localCleanupError: boolean (indicates server deletion succeeded but device storage cleanup failed)
 * - accountLabel: string (optional email or display name of the account being deleted)
 * - onConfirm: ({ password, confirmation }) => void (invoked with the entered credentials/confirmation)
 * - onVerifyGoogle: () => void (invoked when user clicks "Continue with Google to verify")
 * - onRetryCleanup: () => void (invoked when retrying local storage cleanup)
 * - onClose: () => void (invoked on Cancel, Escape, or backdrop click)
 */
export default function DeleteAccountDialog({
  open = false,
  pending = false,
  error = null,
  isOAuthOnly = false,
  isGoogleOnly = false,
  reauthRequired = false,
  localCleanupError = false,
  accountLabel = '',
  onConfirm,
  onVerifyGoogle,
  onRetryCleanup,
  onClose,
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const passwordInputRef = useRef(null);
  const confirmInputRef = useRef(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (open && !pending && !localCleanupError && !reauthRequired && !(isOAuthOnly && !isGoogleOnly)) {
      const timer = setTimeout(() => {
        if (isGoogleOnly) {
          confirmInputRef.current?.focus();
        } else {
          passwordInputRef.current?.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open, pending, localCleanupError, reauthRequired, isOAuthOnly, isGoogleOnly]);

  // Clear password and confirmation whenever dialog closes
  useEffect(() => {
    if (!open) {
      setPassword('');
      setConfirmation('');
    }
  }, [open]);

  // Clear password after a failed request error arrives
  useEffect(() => {
    if (error) {
      setPassword('');
    }
  }, [error]);

  if (!open) {
    return null;
  }

  const handleClose = () => {
    if (pending) return;
    setPassword('');
    setConfirmation('');
    if (onClose) onClose();
  };

  const isConfirmed = confirmation === 'DELETE';
  const hasPassword = password.trim().length > 0;
  const canSubmit = isGoogleOnly
    ? (isConfirmed && !pending && !localCleanupError)
    : (hasPassword && isConfirmed && !pending && !localCleanupError);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (onConfirm) {
      if (isGoogleOnly) {
        onConfirm({ confirmation: 'DELETE' });
      } else {
        onConfirm({ password, confirmation: 'DELETE' });
      }
    }
  };

  return (
    <AppDialog
      label="Delete your account?"
      onClose={handleClose}
      className="delete-account-dialog"
    >
      <div className="delete-account-dialog__container" aria-busy={pending}>
        <h2 className="delete-account-dialog__title">Delete your account?</h2>

        {accountLabel ? (
          <p className="delete-account-dialog__account">{accountLabel}</p>
        ) : null}

        <p className="delete-account-dialog__warning">
          This will permanently delete your account, saved profile, and cloud learning data.
          This action cannot be undone.
        </p>

        <p className="delete-account-dialog__retention">
          Saved words and learning data on this device will be kept in guest mode.
        </p>

        {error ? (
          <div className="delete-account-dialog__error" role="alert" aria-live="assertive">
            {error}
          </div>
        ) : null}

        {reauthRequired ? (
          <div className="delete-account-dialog__cleanup-state">
            <div className="delete-account-dialog__error" role="alert" aria-live="assertive">
              For security, recent Google authentication is required to delete your account.
            </div>
            <p className="delete-account-dialog__cleanup-message">
              Please verify your identity with Google. You will return here to confirm the deletion.
            </p>
            <div className="delete-account-dialog__actions">
              <button
                type="button"
                className="delete-account-dialog__btn delete-account-dialog__btn--cancel"
                onClick={handleClose}
                disabled={pending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-account-dialog__btn delete-account-dialog__btn--google-verify"
                onClick={onVerifyGoogle}
                disabled={pending}
              >
                {pending ? 'Connecting to Google…' : 'Continue with Google to verify'}
              </button>
            </div>
          </div>
        ) : (isOAuthOnly && !isGoogleOnly) ? (
          <div className="delete-account-dialog__cleanup-state">
            <div className="delete-account-dialog__error" role="alert" aria-live="assertive">
              Password reauthentication is not supported for accounts signed in with a third-party provider (such as Google). Self-service account deletion is unavailable for this account in this version.
            </div>
            <p className="delete-account-dialog__cleanup-message">
              Please contact support if you need assistance deleting this account.
            </p>
            <div className="delete-account-dialog__actions">
              <button
                type="button"
                className="delete-account-dialog__btn delete-account-dialog__btn--cancel"
                onClick={handleClose}
              >
                Close
              </button>
            </div>
          </div>
        ) : localCleanupError ? (
          <div className="delete-account-dialog__cleanup-state">
            <p className="delete-account-dialog__cleanup-message">
              Your account was successfully deleted on the server, but local cached data on this device
              could not be completely cleared.
            </p>
            <div className="delete-account-dialog__actions">
              <button
                type="button"
                className="delete-account-dialog__btn delete-account-dialog__btn--retry"
                onClick={onRetryCleanup}
                disabled={pending}
              >
                {pending ? 'Clearing local data…' : 'Retry local cleanup'}
              </button>
              <button
                type="button"
                className="delete-account-dialog__btn delete-account-dialog__btn--cancel"
                onClick={handleClose}
                disabled={pending}
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form className="delete-account-dialog__form" onSubmit={handleSubmit} noValidate>
            {isGoogleOnly ? (
              <p className="delete-account-dialog__oauth-note">
                Signed in with Google. No password is required.
              </p>
            ) : (
              <div className="delete-account-dialog__field">
                <label htmlFor="delete-account-password" className="delete-account-dialog__label">
                  Account password
                </label>
                <input
                  ref={passwordInputRef}
                  id="delete-account-password"
                  type="password"
                  className="delete-account-dialog__input"
                  autoComplete="new-password"
                  value={password}
                  disabled={pending}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your current password"
                  required
                />
              </div>
            )}

            <div className="delete-account-dialog__field">
              <label htmlFor="delete-account-confirm" className="delete-account-dialog__label">
                Type <strong>DELETE</strong> to confirm
              </label>
              <input
                ref={confirmInputRef}
                id="delete-account-confirm"
                type="text"
                className="delete-account-dialog__input"
                autoComplete="off"
                value={confirmation}
                disabled={pending}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder="DELETE"
                required
              />
            </div>

            <div className="delete-account-dialog__actions">
              <button
                type="button"
                className="delete-account-dialog__btn delete-account-dialog__btn--cancel"
                onClick={handleClose}
                disabled={pending}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="delete-account-dialog__btn delete-account-dialog__btn--danger"
                disabled={!canSubmit}
              >
                {pending ? 'Deleting account…' : 'Delete my account'}
              </button>
            </div>
          </form>
        )}
      </div>
    </AppDialog>
  );
}
