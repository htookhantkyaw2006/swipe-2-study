import AppDialog from './ui/AppDialog.jsx';
import { AlertCircle, X, Sparkles } from 'lucide-react';
import './GuestImportDialog.css';

/**
 * GuestImportDialog
 *
 * Isolated choice dialog for learners signing in with existing guest data.
 * Prompts the learner to either merge guest study records into their
 * authenticated account or use their account data only.
 *
 * All state, persistence, sync, and routing are owned by the parent.
 *
 * Props:
 * - open: boolean (dialog mounts only when true)
 * - summary: Array<{ languageId, languageLabel, savedWords, reviewWords, progressRecords }>
 * - pending: boolean (disables actions and suppresses dismissal while parent is working)
 * - error: string | null (accessible error banner for retries)
 * - onChoose: (choice: 'merge' | 'account-only') => void
 * - onClose: () => void (dismissal or "Decide later" - never implies a choice)
 */
export default function GuestImportDialog({
  open = false,
  summary = [],
  pending = false,
  error = null,
  onChoose,
  onClose,
}) {
  if (!open) {
    return null;
  }

  const handleClose = () => {
    if (pending) return;
    if (onClose) onClose();
  };

  const handleChoose = (choice) => {
    if (pending) return;
    if (onChoose) onChoose(choice);
  };

  const records = Array.isArray(summary) ? summary : [];

  return (
    <AppDialog
      label="Bring your guest learning with you"
      onClose={handleClose}
      className="guest-import-dialog"
    >
      <div className="guest-import-dialog__container" aria-busy={pending}>
        <div className="guest-import-dialog__header">
          <div className="guest-import-dialog__header-badge" aria-hidden="true">
            <Sparkles size={20} />
          </div>
          <div className="guest-import-dialog__header-text">
            <h2 className="guest-import-dialog__title">Bring your guest learning with you</h2>
          </div>
          <button
            type="button"
            className="guest-import-dialog__close-btn"
            onClick={handleClose}
            aria-label="Close dialog"
            disabled={pending}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <p className="guest-import-dialog__intro">
          We found study records created on this device. Would you like to merge them into your account, or keep your account data only?
        </p>

        {error && (
          <div className="guest-import-dialog__error" role="alert">
            <AlertCircle size={18} aria-hidden="true" className="guest-import-dialog__error-icon" />
            <span>{error}</span>
          </div>
        )}

        {pending && (
          <div className="guest-import-dialog__pending" role="status" aria-live="polite">
            <div className="auth-spinner" aria-hidden="true" />
            <span>Please wait…</span>
          </div>
        )}

        <div className="guest-import-dialog__summary" aria-label="Guest study summary">
          {records.length > 0 ? (
            records.map((item, index) => (
              <div
                key={item.languageId || index}
                className="guest-import-dialog__summary-card"
              >
                <div className="guest-import-dialog__summary-label">
                  {item.languageLabel || item.languageId || 'Language course'}
                </div>
                <div className="guest-import-dialog__summary-stats">
                  <span className="guest-import-dialog__stat">
                    <strong>{item.savedWords ?? 0}</strong> saved words
                  </span>
                  <span className="guest-import-dialog__stat-divider" aria-hidden="true">•</span>
                  <span className="guest-import-dialog__stat">
                    <strong>{item.reviewWords ?? 0}</strong> review words
                  </span>
                  <span className="guest-import-dialog__stat-divider" aria-hidden="true">•</span>
                  <span className="guest-import-dialog__stat">
                    <strong>{item.progressRecords ?? 0}</strong> progress records
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="guest-import-dialog__summary-empty">
              No guest study records found on this device.
            </div>
          )}
        </div>

        <div className="guest-import-dialog__actions">
          <div className="guest-import-dialog__action-group">
            <button
              type="button"
              className="btn-primary guest-import-dialog__btn guest-import-dialog__btn--merge"
              disabled={pending}
              onClick={() => handleChoose('merge')}
            >
              Merge guest data
            </button>
            <p className="guest-import-dialog__action-hint">
              Combine guest saved words, review items, and progress records with your account.
            </p>
          </div>

          <div className="guest-import-dialog__action-group">
            <button
              type="button"
              className="btn-secondary guest-import-dialog__btn guest-import-dialog__btn--account-only"
              disabled={pending}
              onClick={() => handleChoose('account-only')}
            >
              Use account data only
            </button>
            <p className="guest-import-dialog__action-hint">
              Keep only what is in your account and leave guest records unmerged.
            </p>
          </div>

          <div className="guest-import-dialog__action-group guest-import-dialog__action-group--later">
            <button
              type="button"
              className="btn-outlined guest-import-dialog__btn guest-import-dialog__btn--later"
              disabled={pending}
              onClick={handleClose}
            >
              Decide later
            </button>
          </div>
        </div>
      </div>
    </AppDialog>
  );
}
