import { readSupabaseConfig } from './supabaseConfig.js';
import { isAccountDeletionEnabled } from './accountDeletionGate.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const UNCONFIRMED_DELETION_GUIDANCE =
  'Deletion could not be confirmed. Being unable to sign in does not confirm deletion. Contact support for verification.';

/**
 * Removes all local device cached records owned exclusively by the target account.
 * Operates strictly on the exact owner prefix 's2s_user_<userId>_' with separator.
 * Never calls localStorage.clear().
 * Preserves guest records ('s2s_*' without 'user_<userId>_'),
 * preferences intended to remain device-local, and every other account's cache.
 */
export function removeOwnerLocalData(ownerId, storage = globalThis.localStorage) {
  if (!ownerId || !UUID_REGEX.test(ownerId)) {
    throw new TypeError('Invalid owner ID for local cache removal.');
  }

  if (!storage) {
    throw new Error('Device storage is unavailable.');
  }

  const prefix = `s2s_user_${ownerId.toLowerCase()}_`;
  const keysToRemove = [];

  // Iterate safely and collect matching keys first
  const totalKeys = storage.length ?? 0;
  for (let i = 0; i < totalKeys; i++) {
    const key = storage.key(i);
    if (typeof key === 'string' && key.startsWith(prefix)) {
      keysToRemove.push(key);
    }
  }

  // Remove all matched user keys
  for (const key of keysToRemove) {
    storage.removeItem(key);
  }

  return {
    removedCount: keysToRemove.length,
    removedKeys: keysToRemove,
  };
}

/**
 * Formats rate-limit timing into a human-friendly string.
 */
export function formatRateLimitMessage(retryAfter) {
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) {
    if (seconds >= 60) {
      const minutes = Math.ceil(seconds / 60);
      return `Too many failed deletion attempts. Please wait ${minutes} minute${minutes === 1 ? '' : 's'} before trying again.`;
    }
    return `Too many failed deletion attempts. Please wait ${seconds} second${seconds === 1 ? '' : 's'} before trying again.`;
  }
  return 'Too many failed deletion attempts. Please wait before retrying.';
}

/**
 * Sends an authenticated account deletion request to the server function.
 * Validates successful response shape strictly; never interprets any generic HTTP 200 as confirmed deletion.
 * Never automatically replays password-bearing requests.
 * Never infers deletion from 401, expired session or inability to sign in.
 */
export async function sendDeletionRequest({
  client,
  password,
  initiatingUserId,
  isCurrent = null,
  supabaseUrl = null,
  fetcher = globalThis.fetch,
}) {
  if (!initiatingUserId || !UUID_REGEX.test(initiatingUserId)) {
    return {
      status: 'error',
      code: 'INVALID_OWNER',
      message: 'Invalid initiating account owner.',
    };
  }

  if (!password || typeof password !== 'string' || !password.trim()) {
    return {
      status: 'error',
      code: 'PASSWORD_REQUIRED',
      message: 'Account password is required.',
    };
  }

  if (!client?.auth?.getSession) {
    return {
      status: 'error',
      code: 'CLIENT_UNAVAILABLE',
      message: 'Authentication client is unavailable.',
    };
  }

  const checkCurrent = () => {
    if (typeof isCurrent === 'function') {
      return Boolean(isCurrent());
    }
    return true;
  };

  // Guard before authorization check
  if (!checkCurrent()) {
    return {
      status: 'error',
      code: 'OPERATION_CANCELLED',
      message: 'Account changed before authorization check.',
    };
  }

  let sessionRes;
  try {
    sessionRes = await client.auth.getSession();
  } catch {
    return {
      status: 'unconfirmed',
      code: 'NETWORK_ERROR',
      message: UNCONFIRMED_DELETION_GUIDANCE,
    };
  }

  // Fail closed if getSession returned an error (even alongside stale data)
  if (sessionRes?.error) {
    return {
      status: 'unauthenticated',
      code: 'SESSION_ERROR',
      message: sessionRes.error.message || 'Session lookup failed.',
    };
  }

  // Guard after session lookup
  if (!checkCurrent()) {
    return {
      status: 'error',
      code: 'OPERATION_CANCELLED',
      message: 'Account changed during session lookup.',
    };
  }

  const session = sessionRes?.data?.session;
  const accessToken = session?.access_token;
  if (!accessToken || typeof accessToken !== 'string' || !accessToken.trim()) {
    return {
      status: 'unauthenticated',
      code: 'UNAUTHENTICATED',
      message: 'You must be signed in to delete your account.',
    };
  }

  // Require session identity to match initiating owner if session user is present
  const sessionUserId = session?.user?.id;
  if (sessionUserId && sessionUserId !== initiatingUserId) {
    return {
      status: 'error',
      code: 'OWNER_MISMATCH',
      message: 'Active session does not match the initiating account.',
    };
  }

  // Capture the token and independently verify its user using token-specific getUser(token)
  const capturedToken = accessToken;
  if (typeof client.auth?.getUser === 'function') {
    let verifyRes;
    try {
      verifyRes = await client.auth.getUser(capturedToken);
    } catch {
      return {
        status: 'unauthenticated',
        code: 'VERIFICATION_FAILED',
        message: 'Unable to verify account token.',
      };
    }

    if (verifyRes?.error || !verifyRes?.data?.user) {
      return {
        status: 'unauthenticated',
        code: 'UNAUTHENTICATED',
        message: verifyRes?.error?.message || 'Unable to verify account token.',
      };
    }

    if (verifyRes.data.user.id !== initiatingUserId) {
      return {
        status: 'error',
        code: 'OWNER_MISMATCH',
        message: 'Verified token does not match the initiating account.',
      };
    }
  }

  // Guard after asynchronous verification and immediately before dispatch
  if (!checkCurrent()) {
    return {
      status: 'error',
      code: 'OPERATION_CANCELLED',
      message: 'Account changed before dispatch.',
    };
  }

  // Determine endpoint URL
  let origin = supabaseUrl;
  if (!origin) {
    try {
      const config = readSupabaseConfig();
      if (config.status === 'configured') origin = config.url;
    } catch {}
  }
  if (!origin && client?.supabaseUrl) {
    origin = client.supabaseUrl;
  }

  const endpoint = origin
    ? `${origin.replace(/\/+$/, '')}/functions/v1/delete-account`
    : '/functions/v1/delete-account';

  let response;
  try {
    response = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${capturedToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    });
  } catch {
    // Network loss, DNS failure, dropped connection, or timeout
    return {
      status: 'unconfirmed',
      code: 'NETWORK_ERROR',
      message: UNCONFIRMED_DELETION_GUIDANCE,
    };
  }

  // Parse response body safely
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  // 1. Success confirmation check (Must match exact server contract)
  if (response.status === 200) {
    if (
      json &&
      json.success === true &&
      json.status === 'deleted' &&
      json.userId === initiatingUserId
    ) {
      return {
        status: 'confirmed_deleted',
        userId: json.userId,
      };
    }
    // Generic HTTP 200 without verified shape is treated as unconfirmed
    return {
      status: 'unconfirmed',
      code: 'INVALID_SERVER_RESPONSE',
      message: UNCONFIRMED_DELETION_GUIDANCE,
    };
  }

  // 2. Specific server error handling
  const code = json?.code;
  const retryHeader = response.headers?.get?.('Retry-After');
  const retryAfter = json?.retryAfter ?? retryHeader;

  if (response.status === 400 && code === 'UNSUPPORTED_AUTH_PROVIDER') {
    return {
      status: 'unsupported_provider',
      code: 'UNSUPPORTED_AUTH_PROVIDER',
      message: 'Password reauthentication is not supported for this account. Accounts using third-party providers cannot be deleted from this version.',
    };
  }

  if (response.status === 401 && code === 'INVALID_CREDENTIALS') {
    return {
      status: 'invalid_credentials',
      code: 'INVALID_CREDENTIALS',
      message: 'Incorrect password. Enter your current password to confirm account deletion.',
    };
  }

  if (response.status === 429 || code === 'RATE_LIMITED') {
    return {
      status: 'rate_limited',
      code: 'RATE_LIMITED',
      retryAfter: Number(retryAfter) || null,
      message: formatRateLimitMessage(retryAfter),
    };
  }

  if (response.status === 502 || code === 'STORAGE_CLEANUP_FAILED' || code === 'AUTH_DELETION_FAILED') {
    return {
      status: 'partial_failure',
      code: code || 'PARTIAL_FAILURE',
      message: 'Account deletion is pending, but some resources could not be removed. Account access may be restricted. Please retry or contact support for verification.',
    };
  }

  // Generic 401 (e.g. token expired, session lost) or 500 or unknown errors
  // Do NOT infer deletion from a 401 or inability to sign in!
  return {
    status: 'unconfirmed',
    code: code || 'UNCONFIRMED_ERROR',
    message: UNCONFIRMED_DELETION_GUIDANCE,
  };
}

/**
 * Creates an Account Deletion Controller that orchestrates the UI,
 * request dispatch, generation guarding, and owner-specific local storage cleanup.
 */
export function createAccountDeletionController({
  authCoordinator,
  storageOwner,
  storage = () => globalThis.localStorage,
  supabaseUrl = null,
  fetcher = globalThis.fetch,
  isDeletionEnabled = isAccountDeletionEnabled,
}) {
  let pending = false;
  let error = null;
  let localCleanupError = false;
  let notice = null;
  let dialogOpen = false;
  const listeners = new Set();

  function notify() {
    for (const listener of listeners) {
      try {
        listener();
      } catch (err) {
        console.error('AccountDeletionController listener error:', err);
      }
    }
  }

  function getState() {
    const isEnabled = isDeletionEnabled();
    const user = authCoordinator?.getUser?.() ?? authCoordinator?.getState?.()?.user ?? null;
    return {
      available: Boolean(isEnabled && user?.id),
      dialogOpen,
      pending,
      error,
      localCleanupError,
      notice,
      accountLabel: user?.email || user?.display_name || '',
    };
  }

  function openDialog() {
    const state = getState();
    if (!state.available || pending) return;
    dialogOpen = true;
    error = null;
    localCleanupError = false;
    notify();
  }

  function closeDialog() {
    if (pending) return;
    dialogOpen = false;
    error = null;
    localCleanupError = false;
    notify();
  }

  function clearNotice() {
    notice = null;
    notify();
  }

  async function deleteAccount({ password }) {
    if (pending) return;
    const user = authCoordinator?.getUser?.() ?? authCoordinator?.getState?.()?.user ?? null;
    if (!user?.id) {
      error = 'You must be signed in to delete your account.';
      notify();
      return;
    }

    const initiatingUserId = user.id;
    const initiatingGen = authCoordinator.captureGeneration ? authCoordinator.captureGeneration() : 0;
    const client = authCoordinator.getClient ? authCoordinator.getClient() : null;

    const isOperationCurrent = () => {
      const genOk = authCoordinator.isCurrent ? authCoordinator.isCurrent(initiatingGen) : true;
      const currentUser = authCoordinator?.getUser?.() ?? authCoordinator?.getState?.()?.user ?? null;
      return genOk && currentUser?.id === initiatingUserId;
    };

    pending = true;
    error = null;
    localCleanupError = false;
    notify();

    let result;
    try {
      result = await sendDeletionRequest({
        client,
        password,
        initiatingUserId,
        isCurrent: isOperationCurrent,
        supabaseUrl,
        fetcher,
      });
    } catch {
      result = {
        status: 'unconfirmed',
        code: 'NETWORK_ERROR',
        message: UNCONFIRMED_DELETION_GUIDANCE,
      };
    }

    // Guard against logout or account switching occurring while request was in-flight
    const isCurrent = authCoordinator.isCurrent ? authCoordinator.isCurrent(initiatingGen) : true;
    const currentUser = authCoordinator?.getUser?.() ?? authCoordinator?.getState?.()?.user ?? null;
    if (!isCurrent || currentUser?.id !== initiatingUserId) {
      pending = false;
      // If server confirmed deletion of old account A, still clean A's local cache
      if (result?.status === 'confirmed_deleted') {
        try {
          const targetStorage = typeof storage === 'function' ? storage() : storage;
          removeOwnerLocalData(initiatingUserId, targetStorage);
        } catch {}
      }
      notify();
      return { status: 'discarded', reason: 'account_switched' };
    }

    // Handle response on still-current account
    if (result.status === 'confirmed_deleted') {
      const targetStorage = typeof storage === 'function' ? storage() : storage;
      let cleanupSucceeded = false;
      try {
        removeOwnerLocalData(initiatingUserId, targetStorage);
        cleanupSucceeded = true;
      } catch (cleanupErr) {
        console.warn('Local cleanup error after account deletion:', cleanupErr);
        cleanupSucceeded = false;
      }

      if (!cleanupSucceeded) {
        pending = false;
        localCleanupError = true;
        error = 'Your account was deleted on the server, but local cached data could not be completely cleared.';
        notify();
        return { status: 'local_cleanup_failed' };
      }

      // Local cleanup succeeded. Synchronously clear session and transition to guest mode
      pending = false;
      dialogOpen = false;
      notice = 'Your account has been deleted. You are now in guest mode.';
      if (storageOwner?.setOwner) {
        storageOwner.setOwner(null);
      }
      if (authCoordinator?.signOut) {
        try {
          await authCoordinator.signOut();
        } catch {}
      }
      notify();
      return { status: 'deleted' };
    }

    // Failed or unconfirmed response
    pending = false;
    error = result.message || 'Account deletion failed.';
    notify();
    return result;
  }

  async function retryLocalCleanup() {
    if (pending || !localCleanupError) return;
    const user = authCoordinator?.getUser?.() ?? authCoordinator?.getState?.()?.user ?? null;
    const initiatingUserId = user?.id;
    if (!initiatingUserId) return;

    pending = true;
    error = null;
    notify();

    let cleanupSucceeded = false;
    try {
      const targetStorage = typeof storage === 'function' ? storage() : storage;
      removeOwnerLocalData(initiatingUserId, targetStorage);
      cleanupSucceeded = true;
    } catch {
      cleanupSucceeded = false;
    }

    pending = false;
    if (cleanupSucceeded) {
      localCleanupError = false;
      dialogOpen = false;
      notice = 'Your account has been deleted. You are now in guest mode.';
      if (storageOwner?.setOwner) {
        storageOwner.setOwner(null);
      }
      if (authCoordinator?.signOut) {
        try {
          await authCoordinator.signOut();
        } catch {}
      }
    } else {
      error = 'Could not clear device storage. Please try again.';
    }
    notify();
  }

  return {
    getState,
    openDialog,
    closeDialog,
    clearNotice,
    deleteAccount,
    retryLocalCleanup,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
