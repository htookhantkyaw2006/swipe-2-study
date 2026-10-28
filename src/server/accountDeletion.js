import { createClient as defaultCreateClient } from '@supabase/supabase-js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REQUEST_BODY_BYTES = 4096;
const MAX_PASSWORD_LENGTH = 1024;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export class AccountDeletionError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.name = 'AccountDeletionError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Validates avatar path ownership according to application security rules.
 */
export function ownsAvatarPath(userId, path) {
  return UUID_REGEX.test(userId ?? '') && typeof path === 'string' && path.length <= 256
    && path.startsWith(userId.toLowerCase() + '/') && !path.includes('..')
    && /^[a-z0-9-]+\/[a-z0-9_-][a-z0-9._-]*\.(?:jpg|jpeg|png|webp)$/i.test(path);
}

/**
 * In-memory attempt throttling limiter bounded by user ID and sliding window.
 */
export function createAttemptLimiter({
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  windowMs = DEFAULT_WINDOW_MS,
  now = () => Date.now(),
} = {}) {
  const attempts = new Map();

  function cleanup() {
    const cutoff = now() - windowMs;
    for (const [userId, record] of attempts.entries()) {
      if (record.resetAt <= cutoff) {
        attempts.delete(userId);
      }
    }
  }

  return {
    isThrottled: (userId) => {
      cleanup();
      const record = attempts.get(userId);
      if (!record) return false;
      if (now() > record.resetAt) {
        attempts.delete(userId);
        return false;
      }
      return record.count >= maxAttempts;
    },
    getRetryAfter: (userId) => {
      const record = attempts.get(userId);
      if (!record) return 0;
      const remainingMs = record.resetAt - now();
      return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
    },
    recordFailure: (userId) => {
      cleanup();
      const current = attempts.get(userId);
      const currentTime = now();
      if (!current || currentTime > current.resetAt) {
        attempts.set(userId, { count: 1, resetAt: currentTime + windowMs });
        return { throttled: false, retryAfterSeconds: 0, failedAttempts: 1 };
      }
      current.count += 1;
      const throttled = current.count >= maxAttempts;
      const retryAfterSeconds = throttled ? Math.ceil((current.resetAt - currentTime) / 1000) : 0;
      return { throttled, retryAfterSeconds, failedAttempts: current.count };
    },
    reset: (userId) => {
      attempts.delete(userId);
    },
    _getAttempts: (userId) => attempts.get(userId)?.count ?? 0,
  };
}

/**
 * Shared, durable, atomic attempt throttling limiter backed by PostgreSQL.
 * Uses SELECT ... FOR UPDATE on private.account_deletion_attempts so concurrent
 * failed attempts across multiple serverless/edge instances cannot race or bypass limits.
 */
export function createDatabaseAttemptLimiter(dbClient, {
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  windowSeconds = Math.ceil(DEFAULT_WINDOW_MS / 1000),
} = {}) {
  return {
    async isThrottled(userId) {
      if (!UUID_REGEX.test(userId ?? '')) return false;
      if (typeof dbClient.rpc === 'function') {
        const { data, error } = await dbClient.rpc('s2s_check_deletion_throttled', {
          p_user_id: userId,
          p_max_attempts: maxAttempts,
          p_window_seconds: windowSeconds,
        });
        if (error) throw new AccountDeletionError(error.message, 'THROTTLE_CHECK_FAILED', 500);
        return Boolean(data?.throttled);
      }
      if (typeof dbClient.query === 'function') {
        const res = await dbClient.query(
          'select public.s2s_check_deletion_throttled($1::uuid, $2::int, $3::int) as result',
          [userId, maxAttempts, windowSeconds]
        );
        const data = res.rows?.[0]?.result;
        return Boolean(data?.throttled);
      }
      return false;
    },

    async getRetryAfter(userId) {
      if (!UUID_REGEX.test(userId ?? '')) return 0;
      if (typeof dbClient.rpc === 'function') {
        const { data, error } = await dbClient.rpc('s2s_check_deletion_throttled', {
          p_user_id: userId,
          p_max_attempts: maxAttempts,
          p_window_seconds: windowSeconds,
        });
        if (error) return 0;
        return Number(data?.retry_after_seconds ?? 0);
      }
      if (typeof dbClient.query === 'function') {
        const res = await dbClient.query(
          'select public.s2s_check_deletion_throttled($1::uuid, $2::int, $3::int) as result',
          [userId, maxAttempts, windowSeconds]
        );
        const data = res.rows?.[0]?.result;
        return Number(data?.retry_after_seconds ?? 0);
      }
      return 0;
    },

    async recordFailure(userId) {
      if (!UUID_REGEX.test(userId ?? '')) return { throttled: false, retryAfterSeconds: 0 };
      if (typeof dbClient.rpc === 'function') {
        const { data, error } = await dbClient.rpc('s2s_record_deletion_attempt_failure', {
          p_user_id: userId,
          p_max_attempts: maxAttempts,
          p_window_seconds: windowSeconds,
        });
        if (error) throw new AccountDeletionError(error.message, 'THROTTLE_RECORD_FAILED', 500);
        return {
          throttled: Boolean(data?.throttled),
          retryAfterSeconds: Number(data?.retry_after_seconds ?? 0),
          failedAttempts: Number(data?.failed_attempts ?? 1),
        };
      }
      if (typeof dbClient.query === 'function') {
        const res = await dbClient.query(
          'select public.s2s_record_deletion_attempt_failure($1::uuid, $2::int, $3::int) as result',
          [userId, maxAttempts, windowSeconds]
        );
        const data = res.rows?.[0]?.result;
        return {
          throttled: Boolean(data?.throttled),
          retryAfterSeconds: Number(data?.retry_after_seconds ?? 0),
          failedAttempts: Number(data?.failed_attempts ?? 1),
        };
      }
      return { throttled: false, retryAfterSeconds: 0 };
    },

    async reset(userId) {
      if (!UUID_REGEX.test(userId ?? '')) return;
      if (typeof dbClient.rpc === 'function') {
        await dbClient.rpc('s2s_reset_deletion_attempts', { p_user_id: userId });
        return;
      }
      if (typeof dbClient.query === 'function') {
        await dbClient.query('select public.s2s_reset_deletion_attempts($1::uuid)', [userId]);
      }
    },
  };
}

/**
 * Validates raw request payload for account deletion.
 * Enforces size limits and prevents arbitrary property injection.
 */
export function validateDeletionPayload(rawBody) {
  if (rawBody === null || rawBody === undefined) {
    throw new AccountDeletionError('Request body is required.', 'INVALID_PAYLOAD', 400);
  }

  const serialized = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
  const byteLength = new TextEncoder().encode(serialized).length;
  if (byteLength > MAX_REQUEST_BODY_BYTES) {
    throw new AccountDeletionError('Request payload exceeds maximum allowed size.', 'PAYLOAD_TOO_LARGE', 413);
  }

  let body;
  try {
    body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  } catch {
    throw new AccountDeletionError('Malformed JSON payload.', 'INVALID_JSON', 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AccountDeletionError('Request body must be a JSON object.', 'INVALID_PAYLOAD', 400);
  }

  const allowedKeys = new Set(['password']);
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) {
      throw new AccountDeletionError(`Unexpected parameter "${key}" in request body. Target user cannot be caller-specified.`, 'UNEXPECTED_PARAMETER', 400);
    }
  }

  const password = body.password;
  if (typeof password !== 'string' || !password) {
    throw new AccountDeletionError('Password is required for account deletion reauthentication.', 'PASSWORD_REQUIRED', 400);
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new AccountDeletionError('Password length exceeds maximum allowed limit.', 'PASSWORD_TOO_LONG', 400);
  }

  return { password };
}

/**
 * Extracts and verifies the caller's identity strictly from the Authorization header.
 * Target user ID is derived server-side from this verified identity.
 */
export async function verifyCallerIdentity(client, authHeader) {
  if (!authHeader || typeof authHeader !== 'string') {
    throw new AccountDeletionError('Missing Authorization header.', 'UNAUTHENTICATED', 401);
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    throw new AccountDeletionError('Invalid Authorization header format. Expected "Bearer <token>".', 'UNAUTHENTICATED', 401);
  }

  const token = parts[1];
  if (!token) {
    throw new AccountDeletionError('Authorization token is empty.', 'UNAUTHENTICATED', 401);
  }

  let userResult;
  try {
    userResult = await client.auth.getUser(token);
  } catch {
    throw new AccountDeletionError('Failed to verify caller authentication.', 'UNAUTHENTICATED', 401);
  }

  if (userResult.error || !userResult.data?.user) {
    throw new AccountDeletionError('Invalid or expired authentication session.', 'UNAUTHENTICATED', 401);
  }

  const user = userResult.data.user;
  if (!user.id || !UUID_REGEX.test(user.id)) {
    throw new AccountDeletionError('Verified user has an invalid identity UUID.', 'INVALID_IDENTITY', 401);
  }

  return user;
}

/**
 * Checks if the verified user account supports password reauthentication.
 * Provider-only accounts (e.g. Google OAuth without password) fail closed.
 */
export function checkPasswordReauthSupported(user) {
  if (!user.email) {
    throw new AccountDeletionError(
      'Account does not have an associated email address for password reauthentication.',
      'UNSUPPORTED_AUTH_PROVIDER',
      400
    );
  }

  const providers = user.app_metadata?.providers || (user.app_metadata?.provider ? [user.app_metadata.provider] : []);
  const identities = Array.isArray(user.identities) ? user.identities : [];

  const hasEmailIdentity = identities.some(i => i.provider === 'email')
    || providers.includes('email');

  if (identities.length > 0 && !hasEmailIdentity) {
    throw new AccountDeletionError(
      'Password reauthentication is not supported for this account. Provider reauthentication is required.',
      'UNSUPPORTED_AUTH_PROVIDER',
      400
    );
  }

  if (providers.length > 0 && !hasEmailIdentity) {
    throw new AccountDeletionError(
      'Password reauthentication is not supported for this account. Provider reauthentication is required.',
      'UNSUPPORTED_AUTH_PROVIDER',
      400
    );
  }

  return true;
}

/**
 * Performs fresh password reauthentication using an isolated, non-persisting client.
 * Uses the verified account's email (never caller-supplied).
 * Verifies that the freshly reauthenticated user ID matches initiatingUserId.
 * Never logs, persists, or returns passwords or issued tokens.
 */
export async function performPasswordReauth({
  supabaseUrl,
  supabaseAnonKey,
  verifiedEmail,
  password,
  initiatingUserId,
  createClient = defaultCreateClient,
}) {
  const reauthClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  let reauthResult;
  try {
    reauthResult = await reauthClient.auth.signInWithPassword({
      email: verifiedEmail,
      password,
    });
  } catch {
    throw new AccountDeletionError(
      'Password reauthentication service error.',
      'REAUTH_SERVICE_UNAVAILABLE',
      502
    );
  }

  if (reauthResult.error || !reauthResult.data?.user) {
    throw new AccountDeletionError(
      'Incorrect password. Account deletion requires valid password reauthentication.',
      'INVALID_CREDENTIALS',
      401
    );
  }

  const reauthenticatedUser = reauthResult.data.user;

  if (reauthenticatedUser.id !== initiatingUserId) {
    throw new AccountDeletionError(
      'Reauthenticated user does not match the initiating account owner.',
      'IDENTITY_MISMATCH',
      403
    );
  }

  delete reauthResult.data.session;

  return {
    reauthenticated: true,
    userId: initiatingUserId,
  };
}

/**
 * Step 1 Core Handler: Validates request, checks identity, throttles, and reauthenticates.
 */
export async function handleReauthenticationStep({
  authHeader,
  rawBody,
  env,
  userClient,
  attemptLimiter,
  createClient = defaultCreateClient,
}) {
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new AccountDeletionError(
      'Server configuration missing authentication credentials.',
      'SERVER_CONFIGURATION_ERROR',
      500
    );
  }

  const { password } = validateDeletionPayload(rawBody);
  const verifiedUser = await verifyCallerIdentity(userClient, authHeader);
  const userId = verifiedUser.id;

  const throttled = await attemptLimiter.isThrottled(userId);
  if (throttled) {
    const retryAfter = typeof attemptLimiter.getRetryAfter === 'function'
      ? await attemptLimiter.getRetryAfter(userId)
      : null;
    const error = new AccountDeletionError(
      'Too many failed deletion attempts. Please wait before retrying.',
      'RATE_LIMITED',
      429
    );
    if (retryAfter) {
      error.retryAfter = retryAfter;
    }
    throw error;
  }

  checkPasswordReauthSupported(verifiedUser);

  try {
    await performPasswordReauth({
      supabaseUrl,
      supabaseAnonKey,
      verifiedEmail: verifiedUser.email,
      password,
      initiatingUserId: userId,
      createClient,
    });

    await attemptLimiter.reset(userId);

    return {
      success: true,
      verifiedUser,
    };
  } catch (error) {
    if (error.code === 'INVALID_CREDENTIALS' || error.code === 'IDENTITY_MISMATCH') {
      const failInfo = await attemptLimiter.recordFailure(userId);
      if (failInfo && typeof failInfo === 'object' && failInfo.retryAfterSeconds) {
        error.retryAfter = failInfo.retryAfterSeconds;
      }
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Step 2 & 3: Database & Lifecycle Functions
// ---------------------------------------------------------------------------

/**
 * Transactionally marks an account as deleting using the account-row locking protocol.
 * The transaction commits immediately so no SQL transaction remains open during network calls.
 */
export async function markAccountDeleting(dbClient, userId) {
  if (!UUID_REGEX.test(userId)) {
    throw new AccountDeletionError('Invalid user ID for deletion marking.', 'INVALID_IDENTITY', 400);
  }

  // Support both Supabase adminClient.rpc and direct SQL (PGlite / pg pool)
  if (typeof dbClient.rpc === 'function') {
    const { data, error } = await dbClient.rpc('s2s_begin_account_deletion', { p_user_id: userId });
    if (error) {
      if (error.message?.includes('ACCOUNT_NOT_FOUND')) {
        throw new AccountDeletionError('Account does not exist or has already been deleted.', 'ACCOUNT_NOT_FOUND', 404);
      }
      throw new AccountDeletionError(error.message || 'Failed to mark account as deleting.', 'LIFECYCLE_LOCK_FAILED', 500);
    }
    return data;
  }

  if (typeof dbClient.query === 'function') {
    const res = await dbClient.query('select public.s2s_begin_account_deletion($1::uuid) as result', [userId]);
    return res.rows[0].result;
  }

  throw new AccountDeletionError('Unsupported database client interface.', 'SERVER_CONFIGURATION_ERROR', 500);
}

/**
 * Records deletion lifecycle progress in private.account_deletions.
 */
export async function recordDeletionProgress(dbClient, userId, status, errorText = null) {
  if (!UUID_REGEX.test(userId)) {
    throw new AccountDeletionError('Invalid user ID for progress recording.', 'INVALID_IDENTITY', 400);
  }

  if (typeof dbClient.rpc === 'function') {
    const { data, error } = await dbClient.rpc('s2s_record_deletion_progress', {
      p_user_id: userId,
      p_status: status,
      p_error: errorText,
    });
    if (error) throw new AccountDeletionError(error.message || 'Failed to record deletion progress.', 'PROGRESS_RECORD_FAILED', 500);
    return data;
  }

  if (typeof dbClient.query === 'function') {
    const res = await dbClient.query(
      'select public.s2s_record_deletion_progress($1::uuid, $2::text, $3::text) as result',
      [userId, status, errorText]
    );
    return res.rows[0].result;
  }

  throw new AccountDeletionError('Unsupported database client interface.', 'SERVER_CONFIGURATION_ERROR', 500);
}

/**
 * Retrieves the current durable deletion state for operators or retry reconciliation.
 */
export async function getDeletionState(dbClient, userId) {
  if (!UUID_REGEX.test(userId)) {
    throw new AccountDeletionError('Invalid user ID for state retrieval.', 'INVALID_IDENTITY', 400);
  }

  if (typeof dbClient.rpc === 'function') {
    const { data, error } = await dbClient.rpc('s2s_get_deletion_state', { p_user_id: userId });
    if (error) throw new AccountDeletionError(error.message || 'Failed to retrieve deletion state.', 'STATE_LOOKUP_FAILED', 500);
    return data;
  }

  if (typeof dbClient.query === 'function') {
    const res = await dbClient.query('select public.s2s_get_deletion_state($1::uuid) as result', [userId]);
    return res.rows[0].result;
  }

  throw new AccountDeletionError('Unsupported database client interface.', 'SERVER_CONFIGURATION_ERROR', 500);
}

/**
 * Enumerates and removes all avatar objects owned by userId in the avatars bucket.
 * Never touches shared buckets, other users' folders, or unchecked paths.
 */
export async function cleanupUserAvatars(adminClient, userId) {
  if (!UUID_REGEX.test(userId)) {
    throw new AccountDeletionError('Invalid user ID for avatar cleanup.', 'INVALID_IDENTITY', 400);
  }

  const folder = userId.toLowerCase();
  const limit = 100;
  let offset = 0;
  let hasMore = true;
  const removedPaths = [];

  while (hasMore) {
    let listResult;
    try {
      listResult = await adminClient.storage.from('avatars').list(folder, {
        limit,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
    } catch {
      throw new AccountDeletionError(
        'Storage service unavailable while listing avatar files.',
        'STORAGE_CLEANUP_FAILED',
        502
      );
    }

    if (listResult.error) {
      throw new AccountDeletionError(
        'Failed to inspect user avatar files in storage.',
        'STORAGE_CLEANUP_FAILED',
        502
      );
    }

    const files = listResult.data;
    if (!Array.isArray(files) || files.length === 0) {
      break;
    }

    // Enforce exact ownership validation on every path
    const pathsToRemove = files
      .map(f => `${folder}/${f.name}`)
      .filter(path => ownsAvatarPath(userId, path));

    if (pathsToRemove.length > 0) {
      let removeResult;
      try {
        removeResult = await adminClient.storage.from('avatars').remove(pathsToRemove);
      } catch {
        throw new AccountDeletionError(
          'Storage service unavailable while removing avatar files.',
          'STORAGE_CLEANUP_FAILED',
          502
        );
      }

      if (removeResult.error) {
        throw new AccountDeletionError(
          'Failed to remove user avatar files from storage.',
          'STORAGE_CLEANUP_FAILED',
          502
        );
      }

      removedPaths.push(...pathsToRemove);
    }

    if (files.length < limit) {
      hasMore = false;
    } else {
      // Advance offset past unremoved files to prevent infinite loops if unowned files exist
      const unremovedCount = files.length - pathsToRemove.length;
      offset += unremovedCount;
    }
  }

  return { cleanedCount: removedPaths.length, removedPaths };
}

/**
 * Deletes the Auth user using the administrative Supabase API.
 * Triggers foreign key cascades in PostgreSQL for profiles, preferences, items, and receipts.
 */
export async function deleteAuthUser(adminClient, userId) {
  if (!UUID_REGEX.test(userId)) {
    throw new AccountDeletionError('Invalid user ID for auth deletion.', 'INVALID_IDENTITY', 400);
  }

  let deleteResult;
  try {
    deleteResult = await adminClient.auth.admin.deleteUser(userId);
  } catch {
    throw new AccountDeletionError(
      'Auth administration service unavailable.',
      'AUTH_DELETION_FAILED',
      502
    );
  }

  if (deleteResult.error) {
    throw new AccountDeletionError(
      'Failed to delete user account from identity provider.',
      'AUTH_DELETION_FAILED',
      502
    );
  }

  return { deleted: true };
}

/**
 * Executes the complete server-side account deletion lifecycle:
 * 1. Verify caller identity and fresh password reauthentication.
 * 2. Transactionally mark account as deleting (blocking all client writes/imports).
 * 3. Enumerate and delete all owned avatar files in Storage.
 * 4. Administratively delete the Auth user (cascading all dependent rows).
 * 5. Finalize durable deletion tracking.
 */
export async function executeAccountDeletion({
  userClient,
  adminClient,
  dbClient = adminClient,
  authHeader,
  rawBody,
  env = typeof process !== 'undefined' ? process.env : {},
  attemptLimiter,
  createClient = defaultCreateClient,
}) {
  const effectiveLimiter = attemptLimiter || (dbClient ? createDatabaseAttemptLimiter(dbClient) : createAttemptLimiter());

  // Step 1: Authentication & Reauthentication
  const { verifiedUser } = await handleReauthenticationStep({
    authHeader,
    rawBody,
    env,
    userClient,
    attemptLimiter: effectiveLimiter,
    createClient,
  });

  const userId = verifiedUser.id;

  // Step 2A: Transactionally mark as deleting
  await markAccountDeleting(dbClient, userId);

  // Step 2B: Avatar storage cleanup
  try {
    await cleanupUserAvatars(adminClient, userId);
    await recordDeletionProgress(dbClient, userId, 'storage_cleaned');
  } catch (storageError) {
    await recordDeletionProgress(dbClient, userId, 'pending', storageError.message);
    throw storageError;
  }

  // Step 2C: Administrative Auth user deletion
  try {
    await deleteAuthUser(adminClient, userId);
  } catch (authError) {
    await recordDeletionProgress(dbClient, userId, 'storage_cleaned', authError.message);
    throw authError;
  }

  // Step 2D: Finalize durable record
  await recordDeletionProgress(dbClient, userId, 'finalized');

  return {
    success: true,
    status: 'deleted',
    userId,
  };
}

/**
 * Server/operator reconciliation utility:
 * Resumes a partially completed deletion safely without exposing an anonymous public endpoint.
 * Requires service_role administrative authorization.
 */
export async function reconcilePendingDeletion({
  adminClient,
  dbClient = adminClient,
  targetUserId,
}) {
  if (!UUID_REGEX.test(targetUserId)) {
    throw new AccountDeletionError('Invalid target user ID for reconciliation.', 'INVALID_IDENTITY', 400);
  }

  const state = await getDeletionState(dbClient, targetUserId);

  // If already finalized and account does not exist
  if (state.deletion_record?.status === 'finalized' && !state.account_exists) {
    return {
      status: 'finalized',
      reconciled: false,
      message: 'Account was already deleted and finalized.',
    };
  }

  // Ensure marked deleting if account still exists
  if (state.account_exists && !state.deleting) {
    await markAccountDeleting(dbClient, targetUserId);
  }

  // Ensure storage is cleaned
  if (!state.deletion_record?.storage_cleaned_at) {
    await cleanupUserAvatars(adminClient, targetUserId);
    await recordDeletionProgress(dbClient, targetUserId, 'storage_cleaned');
  }

  // Ensure auth user is deleted
  if (state.account_exists) {
    await deleteAuthUser(adminClient, targetUserId);
  }

  await recordDeletionProgress(dbClient, targetUserId, 'finalized');

  return {
    status: 'finalized',
    reconciled: true,
    message: 'Pending deletion successfully reconciled and finalized.',
  };
}

/**
 * Standard Web Request / Response HTTP Handler suitable for Supabase Edge Functions.
 */
export function createDeletionHttpHandler({
  adminClient,
  dbClient = adminClient,
  env = typeof process !== 'undefined' ? process.env : {},
  attemptLimiter,
  createClient = defaultCreateClient,
}) {
  const effectiveLimiter = attemptLimiter || (dbClient ? createDatabaseAttemptLimiter(dbClient) : createAttemptLimiter());

  return async function handleRequest(request) {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed. Use POST.', code: 'METHOD_NOT_ALLOWED' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', Allow: 'POST' },
      });
    }

    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    let rawBody;
    try {
      rawBody = await request.text();
    } catch {
      return new Response(JSON.stringify({ error: 'Could not read request body.', code: 'INVALID_PAYLOAD' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // User client initialized with caller's token header
    const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
    const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });

    try {
      const result = await executeAccountDeletion({
        userClient,
        adminClient,
        dbClient,
        authHeader,
        rawBody,
        env,
        attemptLimiter: effectiveLimiter,
        createClient,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      const status = err.status || 500;
      const code = err.code || 'INTERNAL_SERVER_ERROR';
      const errorMsg = err.message || 'An unexpected error occurred during account deletion.';
      const headers = { 'Content-Type': 'application/json' };
      if (code === 'RATE_LIMITED' && err.retryAfter) {
        headers['Retry-After'] = String(err.retryAfter);
      }

      return new Response(JSON.stringify({
        error: errorMsg,
        code,
        status: 'pending',
        ...(err.retryAfter ? { retryAfter: err.retryAfter } : {}),
      }), {
        status,
        headers,
      });
    }
  };
}
