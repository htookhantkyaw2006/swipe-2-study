import AppDialog from './ui/AppDialog.jsx';
import './GlobalSignOutDialog.css';

/**
 * GlobalSignOutDialog
 *
 * Isolated confirmation dialog for signing out on all devices.
 * All authentication, session termination, storage clearing, and routing
 * are owned by the parent component or service.
 *
 * Props:
 * - open: boolean (dialog mounts only when true)
 * - pending: boolean (disables buttons, suppresses dismissal, sets aria-busy, changes label)
 * - error: string | null (accessible error banner with role="alert")
 * - accountLabel: string (optional email, username, or display name to show)
 * - onConfirm: () => void (invoked when confirm button is clicked; does not auto-close)
 * - onClose: () => void (invoked on Cancel, Escape, or backdrop click)
 */
export default function GlobalSignOutDialog({
  open = false,
  pending = false,
  error = null,
  accountLabel = '',
  onConfirm,
  onClose,
}) {
  if (!open) {
    return null;
  }

  const handleClose = () => {
    if (pending) return;
    if (onClose) onClose();
  };

  const handleConfirm = () => {
    if (pending) return;
    if (onConfirm) onConfirm();
  };

  return (
    <AppDialog
      label="Sign out on all devices?"
      onClose={handleClose}
      className="global-signout-dialog"
    >
      <div className="global-signout-dialog__container" aria-busy={pending}>
        <h2 className="global-signout-dialog__title">Sign out on all devices?</h2>

        {accountLabel ? (
          <p className="global-signout-dialog__account">{accountLabel}</p>
        ) : null}

        <p className="global-signout-dialog__message">
          You will be signed out here and on your other devices. Some already-open pages may stay signed in briefly.
        </p>

        <p className="global-signout-dialog__retention">
          Saved learning data on this device will be kept.
        </p>

        {error ? (
          <div className="global-signout-dialog__error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="global-signout-dialog__actions">
          <button
            type="button"
            className="global-signout-dialog__btn global-signout-dialog__btn--cancel"
            onClick={handleClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="global-signout-dialog__btn global-signout-dialog__btn--confirm"
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending ? 'Signing out…' : 'Sign out on all devices'}
          </button>
        </div>
      </div>
    </AppDialog>
  );
}
