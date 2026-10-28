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
    recordFailure: (userId) => {
      cleanup();
      const current = attempts.get(userId);
      const currentTime = now();
      if (!current || currentTime > current.resetAt) {
        attempts.set(userId, { count: 1, resetAt: currentTime + windowMs });
      } else {
        current.count += 1;
      }
    },
    reset: (userId) => {
      attempts.delete(userId);
    },
    _getAttempts: (userId) => attempts.get(userId)?.count ?? 0,
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

  // Check identities or app_metadata.providers
  const providers = user.app_metadata?.providers || (user.app_metadata?.provider ? [user.app_metadata.provider] : []);
  const identities = Array.isArray(user.identities) ? user.identities : [];

  const hasEmailIdentity = identities.some(i => i.provider === 'email')
    || providers.includes('email');

  // If identities are provided and there is no email provider, account is provider-only
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
  // Create an isolated non-persisting client
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

  // Strict check: freshly reauthenticated user ID MUST match initiating user ID
  if (reauthenticatedUser.id !== initiatingUserId) {
    throw new AccountDeletionError(
      'Reauthenticated user does not match the initiating account owner.',
      'IDENTITY_MISMATCH',
      403
    );
  }

  // Sanitize: Explicitly drop any references to data.session tokens
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

  // 1. Validate payload structure & size
  const { password } = validateDeletionPayload(rawBody);

  // 2. Verify caller identity from JWT token
  const verifiedUser = await verifyCallerIdentity(userClient, authHeader);
  const userId = verifiedUser.id;

  // 3. Check attempt throttling
  if (attemptLimiter.isThrottled(userId)) {
    throw new AccountDeletionError(
      'Too many failed deletion attempts. Please wait before retrying.',
      'RATE_LIMITED',
      429
    );
  }

  // 4. Verify account supports password reauthentication
  checkPasswordReauthSupported(verifiedUser);

  // 5. Perform fresh reauthentication
  try {
    await performPasswordReauth({
      supabaseUrl,
      supabaseAnonKey,
      verifiedEmail: verifiedUser.email,
      password,
      initiatingUserId: userId,
      createClient,
    });

    // Reset failed attempts on successful password verification
    attemptLimiter.reset(userId);

    return {
      success: true,
      verifiedUser,
    };
  } catch (error) {
    if (error.code === 'INVALID_CREDENTIALS' || error.code === 'IDENTITY_MISMATCH') {
      attemptLimiter.recordFailure(userId);
    }
    throw error;
  }
}
