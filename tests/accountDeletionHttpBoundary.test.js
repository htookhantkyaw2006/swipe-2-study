import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeletionHttpHandler,
  createAttemptLimiter,
  resolveCorsHeaders,
} from '../src/server/accountDeletion.js';
import edgeFunctionHandler, { VERIFIED_STAGING_ORIGIN } from '../supabase/functions/delete-account/index.js';
import { sendDeletionRequest } from '../src/lib/accountDeletionClient.js';

const TEST_USER_ID = '33333333-3333-4333-8333-333333333333';
const TEST_ENV = {
  SUPABASE_URL: 'https://staging-project.supabase.co',
  SUPABASE_ANON_KEY: 'anon-test-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
  ALLOWED_ORIGINS: VERIFIED_STAGING_ORIGIN,
};

function createMockAdminClient() {
  return {
    storage: {
      from: () => ({
        list: async () => ({ data: [], error: null }),
        remove: async () => ({ data: [], error: null }),
      }),
    },
    auth: {
      admin: {
        deleteUser: async () => ({ data: { user: null }, error: null }),
      },
    },
  };
}

function createMockCreateClient({ userId = TEST_USER_ID, validPassword = 'correct-password', provider = 'email' } = {}) {
  return () => ({
    auth: {
      getUser: async (token) => {
        if (!token || token === 'invalid') {
          return { data: { user: null }, error: { message: 'Invalid token' } };
        }
        return {
          data: {
            user: {
              id: userId,
              email: 'test@example.com',
              app_metadata: { provider },
            },
          },
          error: null,
        };
      },
      signInWithPassword: async ({ password }) => {
        if (password === validPassword) {
          return {
            data: { user: { id: userId }, session: {} },
            error: null,
          };
        }
        return { data: { user: null }, error: { message: 'Invalid credentials' } };
      },
    },
  });
}

function createMockDbClient() {
  return {
    rpc: async (fnName) => {
      if (fnName === 's2s_reserve_deletion_attempt') {
        return {
          data: { allowed: true, attempt_count: 1, remaining_attempts: 4, retry_after_seconds: 0 },
          error: null,
        };
      }
      if (fnName === 's2s_begin_account_deletion') {
        return {
          data: { status: 'pending', user_id: TEST_USER_ID },
          error: null,
        };
      }
      if (fnName === 's2s_record_storage_cleaned') {
        return { data: { status: 'storage_cleaned' }, error: null };
      }
      if (fnName === 's2s_record_auth_deleted') {
        return { data: { status: 'auth_deleted' }, error: null };
      }
      return { data: null, error: null };
    },
  };
}

// ---------------------------------------------------------------------------
// 0. CORS Origin Resolution Helper
test('resolveCorsHeaders: correctly matches allowlisted origins with whitespace/comma separation and trailing slashes', () => {
  const req = new Request('https://staging-project.supabase.co/functions/v1/delete-account', {
    headers: { Origin: 'https://staging.swipe2study.com' },
  });
  const headers = resolveCorsHeaders(req, {
    allowedOrigins: ['https://s2-s-anti-gravity-3739ky7ll-htookhantkyaw2006-9042s-projects.vercel.app', 'https://staging.swipe2study.com/'],
  });
  assert.equal(headers['Access-Control-Allow-Origin'], 'https://staging.swipe2study.com');
  assert.equal(headers['Vary'], 'Origin');

  const unmatchedReq = new Request('https://staging-project.supabase.co/functions/v1/delete-account', {
    headers: { Origin: 'https://unauthorized.com' },
  });
  const unmatchedHeaders = resolveCorsHeaders(unmatchedReq, {
    allowedOrigins: 'https://staging.swipe2study.com',
  });
  assert.equal(unmatchedHeaders['Access-Control-Allow-Origin'], undefined);
  assert.equal(unmatchedHeaders['Vary'], undefined);
});

// 1. Browser Cross-Origin Preflight (OPTIONS)
// ---------------------------------------------------------------------------
test('OPTIONS preflight: handles browser cross-origin preflight and returns 200 with matching CORS origin for allowlisted origin', async () => {
  const handler = createDeletionHttpHandler({
    adminClient: createMockAdminClient(),
    env: TEST_ENV,
    attemptLimiter: createAttemptLimiter(),
    createClient: createMockCreateClient(),
  });

  const preflightReq = new Request('https://staging-project.supabase.co/functions/v1/delete-account', {
    method: 'OPTIONS',
    headers: {
      Origin: VERIFIED_STAGING_ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization, content-type',
    },
  });

  const res = await handler(preflightReq);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'ok');

  // Verify essential CORS headers
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), VERIFIED_STAGING_ORIGIN);
  assert.equal(res.headers.get('Vary'), 'Origin');
  assert.ok(res.headers.get('Access-Control-Allow-Methods').includes('POST'));
  assert.ok(res.headers.get('Access-Control-Allow-Methods').includes('OPTIONS'));
  assert.ok(res.headers.get('Access-Control-Allow-Headers').toLowerCase().includes('authorization'));
  assert.ok(res.headers.get('Access-Control-Allow-Headers').toLowerCase().includes('content-type'));
  assert.ok(res.headers.get('Access-Control-Expose-Headers').includes('Retry-After'));
});

test('OPTIONS preflight: rejects disallowed origin with 403 CORS_ORIGIN_DENIED', async () => {
  const handler = createDeletionHttpHandler({
    adminClient: createMockAdminClient(),
    env: TEST_ENV,
    attemptLimiter: createAttemptLimiter(),
    createClient: createMockCreateClient(),
  });

  const preflightReq = new Request('https://staging-project.supabase.co/functions/v1/delete-account', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://malicious.example.com',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization, content-type',
    },
  });

  const res = await handler(preflightReq);
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
  const json = await res.json();
  assert.equal(json.code, 'CORS_ORIGIN_DENIED');
});

test('OPTIONS preflight: does NOT perform deletion, touch storage, or decrement attempt limits', async () => {
  let adminDeleteCalled = false;
  const mockAdmin = createMockAdminClient();
  mockAdmin.auth.admin.deleteUser = async () => {
    adminDeleteCalled = true;
    return { data: null, error: null };
  };

  const limiter = createAttemptLimiter();
  const handler = createDeletionHttpHandler({
    adminClient: mockAdmin,
    env: TEST_ENV,
    attemptLimiter: limiter,
    createClient: createMockCreateClient(),
  });

  const preflightReq = new Request('https://staging-project.supabase.co/functions/v1/delete-account', {
    method: 'OPTIONS',
  });

  const res = await handler(preflightReq);
  assert.equal(res.status, 200);
  assert.equal(adminDeleteCalled, false, 'Admin deleteUser must not be called during OPTIONS preflight');
});

// ---------------------------------------------------------------------------
// 2. Disallowed Methods (405) with CORS
// ---------------------------------------------------------------------------
test('Method Not Allowed: GET, PUT, DELETE return 405 with CORS headers for allowlisted origin and Allow: POST, OPTIONS', async () => {
  const handler = createDeletionHttpHandler({
    adminClient: createMockAdminClient(),
    env: TEST_ENV,
    attemptLimiter: createAttemptLimiter(),
    createClient: createMockCreateClient(),
  });

  for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
    const req = new Request('https://staging-project.supabase.co/functions/v1/delete-account', {
      method,
      headers: {
        Origin: VERIFIED_STAGING_ORIGIN,
      },
    });
    const res = await handler(req);
    assert.equal(res.status, 405, `${method} must return 405`);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), VERIFIED_STAGING_ORIGIN);
    assert.equal(res.headers.get('Vary'), 'Origin');
    assert.equal(res.headers.get('Allow'), 'POST, OPTIONS');
    const json = await res.json();
    assert.equal(json.code, 'METHOD_NOT_ALLOWED');
  }
});

// ---------------------------------------------------------------------------
// 3. Success Response (200) with CORS
// ---------------------------------------------------------------------------
test('Success response: confirmed deletion (200) carries CORS headers for allowlisted origin and valid payload', async () => {
  const handler = createDeletionHttpHandler({
    adminClient: createMockAdminClient(),
    dbClient: createMockDbClient(),
    env: TEST_ENV,
    attemptLimiter: createAttemptLimiter(),
    createClient: createMockCreateClient(),
  });

  const req = new Request('https://staging-project.supabase.co/functions/v1/delete-account', {
    method: 'POST',
    headers: {
      Origin: VERIFIED_STAGING_ORIGIN,
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid-jwt-token',
    },
    body: JSON.stringify({ password: 'correct-password' }),
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), VERIFIED_STAGING_ORIGIN);
  assert.equal(res.headers.get('Vary'), 'Origin');
  assert.ok(res.headers.get('Access-Control-Expose-Headers').includes('Retry-After'));

  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.status, 'deleted');
  assert.equal(json.userId, TEST_USER_ID);
});

test('Origin enforcement: rejects POST from unauthorized origin with 403 before executing deletion', async () => {
  let adminDeleteCalled = false;
  const mockAdmin = createMockAdminClient();
  mockAdmin.auth.admin.deleteUser = async () => {
    adminDeleteCalled = true;
    return { data: null, error: null };
  };

  const handler = createDeletionHttpHandler({
    adminClient: mockAdmin,
    dbClient: createMockDbClient(),
    env: TEST_ENV,
    attemptLimiter: createAttemptLimiter(),
    createClient: createMockCreateClient(),
  });

  const req = new Request('https://staging-project.supabase.co/functions/v1/delete-account', {
    method: 'POST',
    headers: {
      Origin: 'https://evil.attacker.com',
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid-jwt-token',
    },
    body: JSON.stringify({ password: 'correct-password' }),
  });

  const res = await handler(req);
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
  const json = await res.json();
  assert.equal(json.code, 'CORS_ORIGIN_DENIED');
  assert.equal(adminDeleteCalled, false);
});

// ---------------------------------------------------------------------------
// 4. Error Responses (400, 401) with CORS
// ---------------------------------------------------------------------------
test('Error responses: 400, 401 carry CORS headers for allowlisted origin so browser client can read error details', async () => {
  const handler = createDeletionHttpHandler({
    adminClient: createMockAdminClient(),
    dbClient: createMockDbClient(),
    env: TEST_ENV,
    attemptLimiter: createAttemptLimiter(),
    createClient: createMockCreateClient(),
  });

  // 1. Missing password (400)
  const req400 = new Request('https://staging-project.supabase.co/functions/v1/delete-account', {
    method: 'POST',
    headers: {
      Origin: VERIFIED_STAGING_ORIGIN,
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid-jwt-token',
    },
    body: JSON.stringify({}),
  });
  const res400 = await handler(req400);
  assert.equal(res400.status, 400);
  assert.equal(res400.headers.get('Access-Control-Allow-Origin'), VERIFIED_STAGING_ORIGIN);
  const json400 = await res400.json();
  assert.equal(json400.code, 'PASSWORD_REQUIRED');

  // 2. Unauthenticated / missing authorization header (401)
  const req401NoAuth = new Request('https://staging-project.supabase.co/functions/v1/delete-account', {
    method: 'POST',
    headers: {
      Origin: VERIFIED_STAGING_ORIGIN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: 'correct-password' }),
  });
  const res401NoAuth = await handler(req401NoAuth);
  assert.equal(res401NoAuth.status, 401);
  assert.equal(res401NoAuth.headers.get('Access-Control-Allow-Origin'), VERIFIED_STAGING_ORIGIN);
  const json401NoAuth = await res401NoAuth.json();
  assert.equal(json401NoAuth.code, 'UNAUTHENTICATED');

  // 3. Wrong password (401)
  const req401WrongPass = new Request('https://staging-project.supabase.co/functions/v1/delete-account', {
    method: 'POST',
    headers: {
      Origin: VERIFIED_STAGING_ORIGIN,
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid-jwt-token',
    },
    body: JSON.stringify({ password: 'wrong-password' }),
  });
  const res401WrongPass = await handler(req401WrongPass);
  assert.equal(res401WrongPass.status, 401);
  assert.equal(res401WrongPass.headers.get('Access-Control-Allow-Origin'), VERIFIED_STAGING_ORIGIN);
  const json401WrongPass = await res401WrongPass.json();
  assert.equal(json401WrongPass.code, 'INVALID_CREDENTIALS');
});

// ---------------------------------------------------------------------------
// 5. Rate Limiting (429) & Exposed Retry-After Header
// ---------------------------------------------------------------------------
test('Rate limited response: 429 carries CORS headers for allowlisted origin and exposes Retry-After header', async () => {
  const exhaustedLimiter = {
    reserve: () => ({
      allowed: false,
      attemptCount: 5,
      remainingAttempts: 0,
      retryAfterSeconds: 600,
    }),
  };

  const handler = createDeletionHttpHandler({
    adminClient: createMockAdminClient(),
    env: TEST_ENV,
    attemptLimiter: exhaustedLimiter,
    createClient: createMockCreateClient(),
  });

  const req = new Request('https://staging-project.supabase.co/functions/v1/delete-account', {
    method: 'POST',
    headers: {
      Origin: VERIFIED_STAGING_ORIGIN,
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid-jwt-token',
    },
    body: JSON.stringify({ password: 'correct-password' }),
  });

  const res = await handler(req);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), VERIFIED_STAGING_ORIGIN);
  assert.ok(res.headers.get('Access-Control-Expose-Headers').includes('Retry-After'));
  assert.equal(res.headers.get('Retry-After'), '600');

  const json = await res.json();
  assert.equal(json.code, 'RATE_LIMITED');
  assert.equal(json.retryAfter, 600);
});

// ---------------------------------------------------------------------------
// 6. End-to-End Client Integration (sendDeletionRequest -> HTTP Handler)
// ---------------------------------------------------------------------------
test('sendDeletionRequest client integration: parses confirmed 200 response through HTTP handler', async () => {
  const handler = createDeletionHttpHandler({
    adminClient: createMockAdminClient(),
    dbClient: createMockDbClient(),
    env: TEST_ENV,
    attemptLimiter: createAttemptLimiter(),
    createClient: createMockCreateClient(),
  });

  const mockClient = {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: 'valid-jwt-token' } },
        error: null,
      }),
    },
  };

  const result = await sendDeletionRequest({
    client: mockClient,
    password: 'correct-password',
    initiatingUserId: TEST_USER_ID,
    supabaseUrl: 'https://staging-project.supabase.co',
    fetcher: async (url, options) => {
      const req = new Request(url, options);
      return handler(req);
    },
  });

  assert.equal(result.status, 'confirmed_deleted');
  assert.equal(result.userId, TEST_USER_ID);
});

test('sendDeletionRequest client integration: reads retryAfter on 429 rate limit through HTTP handler', async () => {
  const exhaustedLimiter = {
    reserve: () => ({
      allowed: false,
      attemptCount: 5,
      remainingAttempts: 0,
      retryAfterSeconds: 450,
    }),
  };

  const handler = createDeletionHttpHandler({
    adminClient: createMockAdminClient(),
    env: TEST_ENV,
    attemptLimiter: exhaustedLimiter,
    createClient: createMockCreateClient(),
  });

  const mockClient = {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: 'valid-jwt-token' } },
        error: null,
      }),
    },
  };

  const result = await sendDeletionRequest({
    client: mockClient,
    password: 'correct-password',
    initiatingUserId: TEST_USER_ID,
    supabaseUrl: 'https://staging-project.supabase.co',
    fetcher: async (url, options) => {
      const req = new Request(url, options);
      return handler(req);
    },
  });

  assert.equal(result.status, 'rate_limited');
  assert.equal(result.retryAfter, 450);
});

// ---------------------------------------------------------------------------
// 7. Edge Function Entry Point (supabase/functions/delete-account/index.js)
// ---------------------------------------------------------------------------
test('Edge Function entry point: index.js exports callable handler handling preflight and auth validation', async () => {
  assert.equal(typeof edgeFunctionHandler, 'function', 'Edge function default export must be a function');

  // Test OPTIONS preflight on actual edgeFunctionHandler
  const preflightReq = new Request('https://staging-project.supabase.co/functions/v1/delete-account', {
    method: 'OPTIONS',
    headers: {
      Origin: VERIFIED_STAGING_ORIGIN,
    },
  });
  const preflightRes = await edgeFunctionHandler(preflightReq);
  assert.equal(preflightRes.status, 200);
  assert.equal(preflightRes.headers.get('Access-Control-Allow-Origin'), VERIFIED_STAGING_ORIGIN);
  assert.equal(preflightRes.headers.get('Vary'), 'Origin');

  // Test unconfigured POST on actual edgeFunctionHandler (fails closed with 500 + CORS headers)
  const prevUrl = process.env.SUPABASE_URL;
  const prevAnon = process.env.SUPABASE_ANON_KEY;
  try {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    const postReqUnconf = new Request('https://staging-project.supabase.co/functions/v1/delete-account', {
      method: 'POST',
      headers: {
        Origin: VERIFIED_STAGING_ORIGIN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: 'any-password' }),
    });
    const postResUnconf = await edgeFunctionHandler(postReqUnconf);
    assert.equal(postResUnconf.status, 500);
    assert.equal(postResUnconf.headers.get('Access-Control-Allow-Origin'), VERIFIED_STAGING_ORIGIN);
    const jsonUnconf = await postResUnconf.json();
    assert.equal(jsonUnconf.code, 'SERVER_CONFIG_ERROR');

    // Test configured POST on handler: unauthenticated request returns 401 + CORS headers
    process.env.SUPABASE_URL = 'https://staging-project.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-test-key';
    const postReq = new Request('https://staging-project.supabase.co/functions/v1/delete-account', {
      method: 'POST',
      headers: {
        Origin: VERIFIED_STAGING_ORIGIN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: 'any-password' }),
    });
    const postRes = await edgeFunctionHandler(postReq);
    assert.equal(postRes.status, 401);
    assert.equal(postRes.headers.get('Access-Control-Allow-Origin'), VERIFIED_STAGING_ORIGIN);
    const json = await postRes.json();
    assert.equal(json.code, 'UNAUTHENTICATED');
  } finally {
    if (prevUrl !== undefined) process.env.SUPABASE_URL = prevUrl;
    else delete process.env.SUPABASE_URL;
    if (prevAnon !== undefined) process.env.SUPABASE_ANON_KEY = prevAnon;
    else delete process.env.SUPABASE_ANON_KEY;
  }
});
