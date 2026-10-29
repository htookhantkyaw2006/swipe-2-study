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
 * - onReload: () => void
 * - isRetry: boolean (true when retrying an unresolved durable request)
 * - retryChoice: 'merge' | 'account-only' | null (the immutable choice of the unresolved request)
 */
export default function GuestImportDialog({
  open = false,
  summary = [],
  pending = false,
  error = null,
  onChoose,
  onClose,
  onReload,
  isRetry = false,
  retryChoice = null,
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
    if (isRetry && retryChoice && choice !== retryChoice) return;
    if (onChoose) onChoose(choice);
  };

  const records = Array.isArray(summary) ? summary : [];
  const dialogLabel = isRetry ? 'Resume guest learning import' : 'Bring your guest learning with you';

  return (
    <AppDialog
      label={dialogLabel}
      onClose={handleClose}
      className="guest-import-dialog"
    >
      <div className="guest-import-dialog__container" aria-busy={pending}>
        <div className="guest-import-dialog__header">
          <div className="guest-import-dialog__header-badge" aria-hidden="true">
            <Sparkles size={20} />
          </div>
          <div className="guest-import-dialog__header-text">
            <h2 className="guest-import-dialog__title">{dialogLabel}</h2>
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
          {isRetry
            ? (retryChoice === 'merge'
              ? 'A previous request to merge guest study records was interrupted. You can retry merging your data now or decide later.'
              : 'A previous request to keep guest records separate was interrupted. You can retry confirming this decision now or decide later.')
            : 'We found guest study records on this device. Add them to this account’s data here, or keep the account’s current data separate?'}
        </p>
        <p className="guest-import-dialog__device-note">Learning data stays on this device. Cloud sync is not available yet. Your original guest records will be kept.</p>

        {error && (
          <div className="guest-import-dialog__error" role="alert">
            <AlertCircle size={18} aria-hidden="true" className="guest-import-dialog__error-icon" />
            <span>{error}</span>
          </div>
        )}
        {error && onReload && <button type="button" className="guest-import-dialog__reload" disabled={pending} onClick={onReload}>Recheck guest data</button>}

        {pending && (
          <div className="guest-import-dialog__pending" role="status" aria-live="polite">
            <div className="auth-spinner" aria-hidden="true" />
            <span>Please wait…</span>
          </div>
        )}

        <div className="guest-import-dialog__summary" role="region" tabIndex={0} aria-label="Guest study summary">
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
              {isRetry && retryChoice === 'account-only'
                ? 'No records to merge (keeping account data separate).'
                : 'No guest study records found on this device.'}
            </div>
          )}
        </div>

        <div className="guest-import-dialog__actions">
          <div className="guest-import-dialog__action-group">
            <button
              type="button"
              className="btn-primary guest-import-dialog__btn guest-import-dialog__btn--merge"
              disabled={pending || (isRetry && retryChoice === 'account-only')}
              onClick={() => handleChoose('merge')}
            >
              {isRetry && retryChoice === 'merge' ? 'Retry merging guest data' : 'Merge guest data'}
            </button>
            <p className="guest-import-dialog__action-hint">
              {isRetry && retryChoice === 'account-only'
                ? 'An unconfirmed request to keep account data separate is pending.'
                : 'Combine guest words and progress with this account’s data on this device. Existing account records take priority.'}
            </p>
          </div>

          <div className="guest-import-dialog__action-group">
            <button
              type="button"
              className="btn-secondary guest-import-dialog__btn guest-import-dialog__btn--account-only"
              disabled={pending || (isRetry && retryChoice === 'merge')}
              onClick={() => handleChoose('account-only')}
            >
              {isRetry && retryChoice === 'account-only' ? 'Retry using account data only' : 'Use account data only'}
            </button>
            <p className="guest-import-dialog__action-hint">
              {isRetry && retryChoice === 'merge'
                ? 'An unconfirmed request to merge guest records is pending.'
                : 'Leave guest records separate and keep using this account’s current data on this device.'}
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
