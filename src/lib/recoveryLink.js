// A recovery token is a single-use credential. Keep it out of React state,
// storage, browser history and logs. This controller survives provider remounts.
import { getSupabaseClient } from './supabase.js';
import { recoveryVerificationError } from './passwordRecovery.js';

const INVALID_LINK = 'This reset link is invalid or has already been used. Please request a new reset email.';

export function createRecoveryLinkController(verify) {
  let captured = false;
  let tokenHash = null;
  let pending = null;
  let snapshot = Object.freeze({ status: 'none', error: null });
  const listeners = new Set();
  const publish = (status, error = null) => {
    snapshot = Object.freeze({ status, error });
    for (const listener of listeners) listener();
  };

  function capture(href, replaceUrl) {
    if (captured) return;
    captured = true;
    const url = new URL(href);
    if (url.pathname !== '/reset-password') return;
    const query = url.searchParams;
    const fragment = new URLSearchParams(url.hash.slice(1));
    if (!query.has('token_hash') && !fragment.has('token_hash')) return; // Old SDK-managed PKCE links.
    const values = name => [...query.getAll(name), ...fragment.getAll(name)];
    const tokens = values('token_hash');
    const types = values('type');
    const hasConflictingAuth = ['code', 'access_token', 'refresh_token', 'error', 'error_code', 'error_description']
      .some(name => values(name).length > 0);
    // Strip the whole callback payload before creating an Auth client or router.
    // Newly issued links use the fragment, so the token is not sent to hosting.
    try { replaceUrl(url.pathname); }
    catch { publish('error', INVALID_LINK); return; }
    if (tokens.length !== 1 || !/^[A-Za-z0-9_-]{16,512}$/.test(tokens[0])
      || types.length !== 1 || types[0] !== 'recovery' || hasConflictingAuth) {
      publish('error', INVALID_LINK);
      return;
    }
    tokenHash = tokens[0];
    publish('pending');
  }

  function confirm() {
    if (pending) return pending;
    if (snapshot.status !== 'pending' || !tokenHash) return Promise.resolve();
    const credential = tokenHash;
    tokenHash = null;
    // Store the promise before notifying subscribers, including StrictMode or
    // Auth-provider remounts. No automatic verification or automatic retries.
    pending = Promise.resolve().then(async () => {
      try {
        const { data, error } = await verify({ token_hash: credential, type: 'recovery' });
        if (error) { publish('error', recoveryVerificationError(error)); return; }
        if (!data?.user?.id || data.session?.user?.id !== data.user.id) {
          publish('error', INVALID_LINK);
          return;
        }
        // This is UI status only. The Auth coordinator independently verifies
        // PASSWORD_RECOVERY via getUser before granting reset-form access.
        publish('verified');
      } catch {
        publish('error', 'Could not verify the reset link. Check your connection and request a new email.');
      }
    });
    publish('verifying');
    return pending;
  }

  return {
    capture,
    confirm,
    getState: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

export const recoveryLink = createRecoveryLinkController(params => getSupabaseClient().auth.verifyOtp(params));
