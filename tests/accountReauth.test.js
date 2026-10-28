import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAttemptLimiter,
  validateDeletionPayload,
  verifyCallerIdentity,
  checkPasswordReauthSupported,
  performPasswordReauth,
  handleReauthenticationStep,
} from '../src/server/accountDeletion.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const TEST_ENV = {
  SUPABASE_URL: 'https://staging-project.supabase.co',
  SUPABASE_ANON_KEY: 'mock-anon-key',
};

// ---------------------------------------------------------------------------
// 1. Unauthenticated Request & Identity Verification
// ---------------------------------------------------------------------------
test('verifyCallerIdentity: rejects missing or malformed Authorization header', async () => {
  const mockClient = {
    auth: {
      getUser: async () => assert.fail('Should not be called for malformed headers'),
    },
  };

  await assert.rejects(
    async () => { await verifyCallerIdentity(mockClient, null); },
    { name: 'AccountDeletionError', code: 'UNAUTHENTICATED', status: 401 }
  );

  await assert.rejects(
    async () => { await verifyCallerIdentity(mockClient, ''); },
    { name: 'AccountDeletionError', code: 'UNAUTHENTICATED', status: 401 }
  );

  await assert.rejects(
    async () => { await verifyCallerIdentity(mockClient, 'Basic username:pass'); },
    { name: 'AccountDeletionError', code: 'UNAUTHENTICATED', status: 401 }
  );

  await assert.rejects(
    async () => { await verifyCallerIdentity(mockClient, 'Bearer'); },
    { name: 'AccountDeletionError', code: 'UNAUTHENTICATED', status: 401 }
  );
});

test('verifyCallerIdentity: rejects invalid, expired or thrown token exchanges', async () => {
  const mockClient = {
    auth: {
      getUser: async (token) => {
        if (token === 'expired-token') {
          return { data: { user: null }, error: { message: 'Token expired' } };
        }
        if (token === 'corrupt-token') {
          throw new Error('Network failure');
        }
        return { data: { user: { id: 'invalid-non-uuid' } }, error: null };
      },
    },
  };

  await assert.rejects(
    async () => { await verifyCallerIdentity(mockClient, 'Bearer expired-token'); },
    { name: 'AccountDeletionError', code: 'UNAUTHENTICATED', status: 401 }
  );

  await assert.rejects(
    async () => { await verifyCallerIdentity(mockClient, 'Bearer corrupt-token'); },
    { name: 'AccountDeletionError', code: 'UNAUTHENTICATED', status: 401 }
  );

  await assert.rejects(
    async () => { await verifyCallerIdentity(mockClient, 'Bearer invalid-uuid-token'); },
    { name: 'AccountDeletionError', code: 'INVALID_IDENTITY', status: 401 }
  );
});

test('verifyCallerIdentity: successfully derives owner identity from valid JWT', async () => {
  const mockClient = {
    auth: {
      getUser: async (token) => {
        assert.equal(token, 'valid-token');
        return {
          data: {
            user: {
              id: USER_A,
              email: 'learner@example.com',
              app_metadata: { provider: 'email' },
            },
          },
          error: null,
        };
      },
    },
  };

  const user = await verifyCallerIdentity(mockClient, 'Bearer valid-token');
  assert.equal(user.id, USER_A);
  assert.equal(user.email, 'learner@example.com');
});

// ---------------------------------------------------------------------------
// 2. Payload Validation & Owner Spoofing Prevention
// ---------------------------------------------------------------------------
test('validateDeletionPayload: rejects caller attempting to specify target user ID or extra keys', () => {
  // Reject extra parameters (e.g. target_user_id or user_id)
  assert.throws(
    () => validateDeletionPayload({ password: 'secret', target_user_id: USER_B }),
    { name: 'AccountDeletionError', code: 'UNEXPECTED_PARAMETER', status: 400 }
  );

  assert.throws(
    () => validateDeletionPayload({ password: 'secret', userId: USER_B }),
    { name: 'AccountDeletionError', code: 'UNEXPECTED_PARAMETER', status: 400 }
  );

  assert.throws(
    () => validateDeletionPayload({ password: 'secret', email: 'other@example.com' }),
    { name: 'AccountDeletionError', code: 'UNEXPECTED_PARAMETER', status: 400 }
  );
});

test('validateDeletionPayload: enforces payload bounds and required password', () => {
  // Missing or empty body
  assert.throws(() => validateDeletionPayload(null), { code: 'INVALID_PAYLOAD' });
  assert.throws(() => validateDeletionPayload('not json'), { code: 'INVALID_JSON' });
  assert.throws(() => validateDeletionPayload([]), { code: 'INVALID_PAYLOAD' });
  assert.throws(() => validateDeletionPayload({}), { code: 'PASSWORD_REQUIRED' });
  assert.throws(() => validateDeletionPayload({ password: '' }), { code: 'PASSWORD_REQUIRED' });

  // Exceeds payload size (> 4KB)
  const hugePayload = { password: 'a'.repeat(4500) };
  assert.throws(
    () => validateDeletionPayload(hugePayload),
    { name: 'AccountDeletionError', code: 'PAYLOAD_TOO_LARGE', status: 413 }
  );

  // Exceeds max password length
  assert.throws(
    () => validateDeletionPayload({ password: 'a'.repeat(1025) }),
    { name: 'AccountDeletionError', code: 'PASSWORD_TOO_LONG', status: 400 }
  );

  // Valid payload
  const valid = validateDeletionPayload({ password: 'correct-password' });
  assert.equal(valid.password, 'correct-password');
});

// ---------------------------------------------------------------------------
// 3. Provider-only Unsupported Accounts
// ---------------------------------------------------------------------------
test('checkPasswordReauthSupported: rejects provider-only accounts without email password auth', () => {
  // Google OAuth only
  const googleOnlyUser = {
    id: USER_A,
    email: 'google-user@gmail.com',
    app_metadata: { provider: 'google', providers: ['google'] },
    identities: [{ provider: 'google', id: 'google-123' }],
  };

  assert.throws(
    () => checkPasswordReauthSupported(googleOnlyUser),
    { name: 'AccountDeletionError', code: 'UNSUPPORTED_AUTH_PROVIDER', status: 400 }
  );

  // Missing email
  const noEmailUser = {
    id: USER_A,
    email: null,
    app_metadata: { provider: 'phone' },
  };
  assert.throws(
    () => checkPasswordReauthSupported(noEmailUser),
    { name: 'AccountDeletionError', code: 'UNSUPPORTED_AUTH_PROVIDER', status: 400 }
  );

  // Supported email/password account
  const emailUser = {
    id: USER_A,
    email: 'email-user@example.com',
    app_metadata: { provider: 'email', providers: ['email'] },
    identities: [{ provider: 'email', id: USER_A }],
  };
  assert.equal(checkPasswordReauthSupported(emailUser), true);
});

// ---------------------------------------------------------------------------
// 4. Fresh Reauthentication & Identity Mismatch Check
// ---------------------------------------------------------------------------
test('performPasswordReauth: rejects incorrect password with 401 INVALID_CREDENTIALS', async () => {
  const mockReauthClient = {
    auth: {
      signInWithPassword: async ({ email, password }) => {
        assert.equal(email, 'learner@example.com');
        assert.equal(password, 'wrong-password');
        return { data: { user: null }, error: { message: 'Invalid login credentials' } };
      },
    },
  };

  await assert.rejects(
    async () => {
      await performPasswordReauth({
        supabaseUrl: TEST_ENV.SUPABASE_URL,
        supabaseAnonKey: TEST_ENV.SUPABASE_ANON_KEY,
        verifiedEmail: 'learner@example.com',
        password: 'wrong-password',
        initiatingUserId: USER_A,
        createClient: () => mockReauthClient,
      });
    },
    { name: 'AccountDeletionError', code: 'INVALID_CREDENTIALS', status: 401 }
  );
});

test('performPasswordReauth: rejects if reauthenticated user ID does not match initiating owner', async () => {
  // Simulating an attack or token swap where reauthentication logs in as USER_B instead of USER_A
  const mockReauthClient = {
    auth: {
      signInWithPassword: async () => ({
        data: {
          user: { id: USER_B, email: 'impostor@example.com' },
          session: { access_token: 'secret-token' },
        },
        error: null,
      }),
    },
  };

  await assert.rejects(
    async () => {
      await performPasswordReauth({
        supabaseUrl: TEST_ENV.SUPABASE_URL,
        supabaseAnonKey: TEST_ENV.SUPABASE_ANON_KEY,
        verifiedEmail: 'learner@example.com',
        password: 'password',
        initiatingUserId: USER_A, // initiating as USER_A, but reauth returned USER_B
        createClient: () => mockReauthClient,
      });
    },
    { name: 'AccountDeletionError', code: 'IDENTITY_MISMATCH', status: 403 }
  );
});

test('performPasswordReauth: succeeds on matching credentials and never returns session tokens', async () => {
  const mockReauthClient = {
    auth: {
      signInWithPassword: async ({ email, password }) => {
        assert.equal(email, 'learner@example.com');
        assert.equal(password, 'valid-password');
        return {
          data: {
            user: { id: USER_A, email: 'learner@example.com' },
            session: { access_token: 'ephemeral-token', refresh_token: 'ephemeral-refresh' },
          },
          error: null,
        };
      },
    },
  };

  const result = await performPasswordReauth({
    supabaseUrl: TEST_ENV.SUPABASE_URL,
    supabaseAnonKey: TEST_ENV.SUPABASE_ANON_KEY,
    verifiedEmail: 'learner@example.com',
    password: 'valid-password',
    initiatingUserId: USER_A,
    createClient: () => mockReauthClient,
  });

  assert.equal(result.reauthenticated, true);
  assert.equal(result.userId, USER_A);
  // Ensure no password or session tokens leaked into return value
  assert.equal(result.session, undefined);
  assert.equal(result.access_token, undefined);
  assert.equal(result.password, undefined);
});

// ---------------------------------------------------------------------------
// 5. Attempt Throttling
// ---------------------------------------------------------------------------
test('createAttemptLimiter: enforces max attempts within time window', () => {
  let currentTime = 1000000;
  const limiter = createAttemptLimiter({
    maxAttempts: 3,
    windowMs: 60000,
    now: () => currentTime,
  });

  assert.equal(limiter.isThrottled(USER_A), false);

  limiter.recordFailure(USER_A);
  assert.equal(limiter.isThrottled(USER_A), false);

  limiter.recordFailure(USER_A);
  assert.equal(limiter.isThrottled(USER_A), false);

  limiter.recordFailure(USER_A);
  // Reached max attempts (3)
  assert.equal(limiter.isThrottled(USER_A), true);

  // Different user is NOT throttled
  assert.equal(limiter.isThrottled(USER_B), false);

  // Advance time past window
  currentTime += 60001;
  assert.equal(limiter.isThrottled(USER_A), false, 'Window expired, throttling cleared');
});

// ---------------------------------------------------------------------------
// 6. Complete Step 1 Pipeline Integration
// ---------------------------------------------------------------------------
test('handleReauthenticationStep: throttles after repeated failed password attempts', async () => {
  const limiter = createAttemptLimiter({ maxAttempts: 2, windowMs: 60000 });

  const mockUserClient = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: USER_A,
            email: 'learner@example.com',
            app_metadata: { provider: 'email' },
          },
        },
        error: null,
      }),
    },
  };

  const mockReauthClient = {
    auth: {
      signInWithPassword: async () => ({
        data: { user: null },
        error: { message: 'Invalid login credentials' },
      }),
    },
  };

  // Attempt 1: fail
  await assert.rejects(
    async () => {
      await handleReauthenticationStep({
        authHeader: 'Bearer valid-token',
        rawBody: { password: 'wrong-pass-1' },
        env: TEST_ENV,
        userClient: mockUserClient,
        attemptLimiter: limiter,
        createClient: () => mockReauthClient,
      });
    },
    { code: 'INVALID_CREDENTIALS', status: 401 }
  );

  // Attempt 2: fail
  await assert.rejects(
    async () => {
      await handleReauthenticationStep({
        authHeader: 'Bearer valid-token',
        rawBody: { password: 'wrong-pass-2' },
        env: TEST_ENV,
        userClient: mockUserClient,
        attemptLimiter: limiter,
        createClient: () => mockReauthClient,
      });
    },
    { code: 'INVALID_CREDENTIALS', status: 401 }
  );

  // Attempt 3: Throttled before password check
  let reauthCalled = false;
  mockReauthClient.auth.signInWithPassword = async () => {
    reauthCalled = true;
    return { data: { user: null }, error: null };
  };

  await assert.rejects(
    async () => {
      await handleReauthenticationStep({
        authHeader: 'Bearer valid-token',
        rawBody: { password: 'any-password' },
        env: TEST_ENV,
        userClient: mockUserClient,
        attemptLimiter: limiter,
        createClient: () => mockReauthClient,
      });
    },
    { code: 'RATE_LIMITED', status: 429 }
  );

  assert.equal(reauthCalled, false, 'Password verification must not be attempted when throttled');
});

test('handleReauthenticationStep: successful authentication resets attempt counter', async () => {
  const limiter = createAttemptLimiter({ maxAttempts: 3, windowMs: 60000 });

  // Record 2 failed attempts
  limiter.recordFailure(USER_A);
  limiter.recordFailure(USER_A);
  assert.equal(limiter._getAttempts(USER_A), 2);

  const mockUserClient = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: USER_A,
            email: 'learner@example.com',
            app_metadata: { provider: 'email' },
          },
        },
        error: null,
      }),
    },
  };

  const mockReauthClient = {
    auth: {
      signInWithPassword: async () => ({
        data: {
          user: { id: USER_A, email: 'learner@example.com' },
          session: { access_token: 'temp-token' },
        },
        error: null,
      }),
    },
  };

  const result = await handleReauthenticationStep({
    authHeader: 'Bearer valid-token',
    rawBody: { password: 'correct-password' },
    env: TEST_ENV,
    userClient: mockUserClient,
    attemptLimiter: limiter,
    createClient: () => mockReauthClient,
  });

  assert.equal(result.success, true);
  assert.equal(result.verifiedUser.id, USER_A);
  assert.equal(limiter._getAttempts(USER_A), 0, 'Successful reauth resets attempt count');
});
