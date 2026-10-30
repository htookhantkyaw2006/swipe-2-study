import { useState, useEffect, useRef } from 'react';
import AppDialog from './ui/AppDialog.jsx';
import './DeleteAccountDialog.css';

/**
 * DeleteAccountDialog
 *
 * Presentational confirmation dialog for permanent account deletion.
 * Contains NO Auth, network, routing, or storage dependencies.
 *
 * Props:
 * - open: boolean (mounts dialog only when true)
 * - pending: boolean (disables buttons/inputs, suppresses dismissal, sets aria-busy)
 * - error: string | null (accessible error message)
 * - localCleanupError: boolean (indicates server deletion succeeded but device storage cleanup failed)
 * - accountLabel: string (optional email or display name of the account being deleted)
 * - onConfirm: ({ password }) => void (invoked with the entered password)
 * - onRetryCleanup: () => void (invoked when retrying local storage cleanup)
 * - onClose: () => void (invoked on Cancel, Escape, or backdrop click)
 */
export default function DeleteAccountDialog({
  open = false,
  pending = false,
  error = null,
  isOAuthOnly = false,
  localCleanupError = false,
  accountLabel = '',
  onConfirm,
  onRetryCleanup,
  onClose,
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const passwordInputRef = useRef(null);

  // Focus password input when dialog opens
  useEffect(() => {
    if (open && !pending && !localCleanupError) {
      const timer = setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open, pending, localCleanupError]);

  // Clear password whenever dialog closes
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
  const canSubmit = hasPassword && isConfirmed && !pending && !localCleanupError;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    const currentPassword = password;
    if (onConfirm) {
      onConfirm({ password: currentPassword });
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

        {isOAuthOnly ? (
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

            <div className="delete-account-dialog__field">
              <label htmlFor="delete-account-confirm" className="delete-account-dialog__label">
                Type <strong>DELETE</strong> to confirm
              </label>
              <input
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
