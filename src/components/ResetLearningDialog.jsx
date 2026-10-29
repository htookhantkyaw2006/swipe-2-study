import { useEffect, useRef } from 'react';
import AppDialog from './ui/AppDialog.jsx';
import { AlertCircle, RotateCcw, RefreshCw, ShieldCheck } from 'lucide-react';
import './ResetLearningDialog.css';

/**
 * ResetLearningDialog
 *
 * Accessible confirmation dialog for resetting learning data.
 * Clearly itemizes what will be removed and what will be preserved.
 * Supports local cleanup failure recovery without re-invoking server reset.
 */
export default function ResetLearningDialog({
  open = false,
  pending = false,
  error = null,
  localCleanupError = false,
  isGuest = false,
  accountLabel = '',
  onConfirm,
  onRetryCleanup,
  onClose,
}) {
  const confirmButtonRef = useRef(null);

  // Focus confirm button when dialog opens
  useEffect(() => {
    if (open && !pending && !localCleanupError) {
      const timer = setTimeout(() => {
        confirmButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open, pending, localCleanupError]);

  if (!open) {
    return null;
  }

  const handleClose = () => {
    if (pending) return;
    if (onClose) onClose();
  };

  const handleConfirm = (e) => {
    e.preventDefault();
    if (pending || localCleanupError) return;
    if (onConfirm) onConfirm();
  };

  return (
    <AppDialog
      label="Reset learning data?"
      onClose={handleClose}
      className="reset-learning-dialog"
    >
      <div className="reset-learning-dialog__container" aria-busy={pending}>
        <h2 className="reset-learning-dialog__title">Reset learning data?</h2>

        {accountLabel && !isGuest ? (
          <p className="reset-learning-dialog__account">{accountLabel}</p>
        ) : null}

        <p className="reset-learning-dialog__warning">
          This will erase your learning progress across all courses (Chinese, Japanese, English).
          This action cannot be undone.
        </p>

        <div className="reset-learning-dialog__scope">
          <div className="reset-learning-dialog__section">
            <h3 className="reset-learning-dialog__section-title">
              <RotateCcw size={16} aria-hidden="true" />
              What will be removed:
            </h3>
            <ul className="reset-learning-dialog__list reset-learning-dialog__list--removed">
              <li>All learned words, review queues, and saved bookmarks</li>
              <li>Character writing history and radical/kana/sound drills</li>
              <li>Study streaks and daily learning activity records</li>
              {isGuest ? (
                <li>All guest learning records stored on this device</li>
              ) : (
                <li>Cloud learning records and local learning caches</li>
              )}
            </ul>
          </div>

          <div className="reset-learning-dialog__section">
            <h3 className="reset-learning-dialog__section-title reset-learning-dialog__section-title--preserved">
              <ShieldCheck size={16} aria-hidden="true" />
              What will be preserved:
            </h3>
            <ul className="reset-learning-dialog__list reset-learning-dialog__list--preserved">
              <li>Your profile name and avatar photo</li>
              <li>Display, audio, and language preference settings</li>
              <li>Your account sign-in credentials</li>
              <li>Other user accounts on this device</li>
            </ul>
          </div>
        </div>

        {error ? (
          <div className="reset-learning-dialog__error" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <p>{error}</p>
          </div>
        ) : null}

        {localCleanupError ? (
          <div className="reset-learning-dialog__recovery" role="alert">
            <p className="reset-learning-dialog__recovery-title">
              Learning data was reset on the server, but device cache could not be completely cleared.
            </p>
            <p className="reset-learning-dialog__recovery-desc">
              Tap below to retry local cleanup without starting another cloud reset.
            </p>
            <button
              type="button"
              className="btn-primary reset-learning-dialog__recovery-btn"
              onClick={onRetryCleanup}
              disabled={pending}
            >
              <RefreshCw size={16} aria-hidden="true" className={pending ? 'spin' : ''} />
              {pending ? 'Clearing device storage…' : 'Retry local cleanup'}
            </button>
          </div>
        ) : null}

        <div className="reset-learning-dialog__actions">
          <button
            type="button"
            className="btn-secondary reset-learning-dialog__btn"
            onClick={handleClose}
            disabled={pending}
          >
            Cancel
          </button>
          {!localCleanupError && (
            <button
              type="button"
              ref={confirmButtonRef}
              className="btn-danger reset-learning-dialog__btn"
              onClick={handleConfirm}
              disabled={pending}
            >
              {pending ? 'Resetting learning data…' : 'Reset learning data'}
            </button>
          )}
        </div>
      </div>
    </AppDialog>
  );
}

