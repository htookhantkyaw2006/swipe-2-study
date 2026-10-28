const initial = () => ({
  accountId: null, generation: null, autoChecked: false,
  checking: false, pending: false, open: false, offer: null,
  error: null, notice: null, learningVersion: 0,
});

export function guestImportRouteAllowed(pathname) {
  return !/^\/(?:login|signup|forgot-password|reset-password|verify-email|auth)(?:\/|$)/.test(pathname)
    && !pathname.endsWith('/session') && pathname !== '/profile/edit';
}

function errorMessage(error) {
  if (error?.code === 'CACHE_STORAGE_UNAVAILABLE') return 'Could not confirm the save on this device. Guest records have been kept. Recheck the data and retry.';
  const message = error?.message;
  // Show known service guidance, never arbitrary SDK/server implementation text.
  if (typeof message === 'string' && /^(?:Stored learning data|Some learning data|Guest learning data|Your account|Your sign-in session|Sign in and finish account|Could not verify your account|Could not identify the guest data|Could not assign a unique learning record|Learning data changed|A guest import decision|Reload the guest import offer|There is no new guest data)/.test(message)) return message;
  return 'Could not check or save guest learning. Guest records have been kept. Please recheck and try again.';
}

// Owns UI requests only. Auth selects owners; the service owns all persistence.
export function createGuestImportController(service) {
  let state = Object.freeze(initial());
  let operation = 0;
  const listeners = new Set();
  function publish(patch) {
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) {
      try { listener(); } catch { /* Rendering must not turn a saved import into a failed save. */ }
    }
  }
  const current = (token, accountId, generation) => operation === token
    && state.accountId === accountId && state.generation === generation;

  function setAccount(account) {
    const accountId = account?.id ?? null;
    const generation = account?.generation ?? null;
    if (accountId === state.accountId && generation === state.generation) return;
    operation++;
    const sameUser = accountId !== null && accountId === state.accountId;
    const interrupted = sameUser && (state.open || state.pending || state.checking);
    publish({ ...initial(), accountId, generation,
      autoChecked: sameUser && state.autoChecked,
      // Auth already remounts on a real owner change. A token/session refresh
      // must never remount an active study session and reset its deck progress.
      learningVersion: state.learningVersion,
      notice: interrupted ? { kind: 'info', message: 'Your sign-in session changed. Open Guest learning again to check the latest data.' } : null,
    });
  }

  async function inspect({ automatic = false } = {}) {
    if (!state.accountId || state.pending || state.checking || (automatic && state.autoChecked)) return;
    const { accountId, generation } = state;
    const token = ++operation;
    publish({ checking: true, autoChecked: true, offer: null, open: false, error: null, notice: null });
    try {
      const offer = await service.inspect();
      if (!current(token, accountId, generation)) return;
      if (offer?.ownerId !== accountId || offer.persistence !== 'device-only'
        || !['available', 'nothing-to-import'].includes(offer.status)) throw new Error('Unexpected guest import offer.');
      const available = offer.status === 'available';
      publish({ checking: false, offer: available ? offer : null, open: available,
        notice: !available && !automatic ? { kind: 'info', message: 'No new guest learning found on this device.' } : null,
      });
    } catch (error) {
      if (!current(token, accountId, generation)) return;
      publish({ checking: false, error: errorMessage(error), notice: { kind: 'error', message: errorMessage(error) } });
    }
  }

  async function choose(choice) {
    if (!state.accountId || !state.open || !state.offer || state.pending || state.checking) return;
    const { accountId, generation, offer } = state;
    const token = ++operation;
    publish({ pending: true, error: null, notice: null });
    try {
      const result = await service.choose(offer, choice);
      if (!current(token, accountId, generation)) return;
      if (!['saved', 'already-decided'].includes(result?.status) || result.persistence !== 'device-only'
        || !['merge', 'account-only'].includes(result.choice)) throw new Error('Guest import save was not confirmed.');
      const message = result.status === 'already-decided'
        ? 'This guest learning is already handled on this device. Cloud sync is not available yet.'
        : result.choice === 'merge'
          ? result.addedRecords === 0
            ? 'Guest learning checked. Existing account records were kept on this device. Cloud sync is not available yet.'
            : 'Guest learning added to this account on this device. Cloud sync is not available yet.'
          : 'Using account data on this device. Guest records have been kept separate.';
      publish({ pending: false, open: false, offer: null, error: null,
        learningVersion: state.learningVersion + (result.choice === 'merge' ? 1 : 0),
        notice: { kind: 'success', message },
      });
    } catch (error) {
      if (!current(token, accountId, generation)) return;
      publish({ pending: false, error: errorMessage(error) });
    }
  }

  function close() {
    if (state.pending) return;
    operation++;
    publish({ open: false, offer: null, checking: false, error: null, autoChecked: true });
  }

  function cancel() {
    operation++;
    // React StrictMode can clean up and mount the same controller again. An
    // interrupted initial inspection must remain eligible for a fresh check.
    publish({ checking: false, pending: false, open: false, offer: null,
      autoChecked: state.checking ? false : state.autoChecked,
    });
  }

  return Object.freeze({
    getState: () => state,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    setAccount, inspect, choose, close, cancel,
    dismissNotice: () => publish({ notice: null }),
  });
}
