import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const values = new Map();
const oldStorage = globalThis.localStorage;
globalThis.localStorage = {
  get length() { return values.size; },
  key: (index) => [...values.keys()][index] ?? null,
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
  clear: () => values.clear(),
};

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({
  root,
  server: { middlewareMode: true, hmr: false, ws: false, host: '127.0.0.1', watch: null },
});

after(async () => {
  await server.close();
  if (oldStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = oldStorage;
});

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

// ---------------------------------------------------------------------------
// 1. Account B session during Account A operation -> zero deletion HTTP requests
// ---------------------------------------------------------------------------
test('B session during an A operation: zero deletion HTTP requests dispatched', async () => {
  const { sendDeletionRequest, createAccountDeletionController } = await server.ssrLoadModule('/src/lib/accountDeletionClient.js');

  let fetchCallCount = 0;
  const mockFetcher = async () => {
    fetchCallCount++;
    return new Response(JSON.stringify({ success: true, status: 'deleted', userId: USER_B }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  // Mock client where session belongs to User B while initiatingUserId is User A
  const mockClient = {
    auth: {
      getSession: async () => ({
        data: {
          session: {
            access_token: 'bearer-token-b',
            user: { id: USER_B },
          },
        },
        error: null,
      }),
      getUser: async (_token) => ({
        data: { user: { id: USER_B } },
        error: null,
      }),
    },
  };

  // Direct sendDeletionRequest check
  const directRes = await sendDeletionRequest({
    client: mockClient,
    password: 'secure-password',
    initiatingUserId: USER_A,
    fetcher: mockFetcher,
  });

  assert.equal(fetchCallCount, 0, 'Must NOT dispatch deletion HTTP request when session belongs to B');
  assert.equal(directRes.status, 'error');
  assert.equal(directRes.code, 'OWNER_MISMATCH');

  // Controller check: initiating user A, but getSession returns B
  let activeUser = { id: USER_A, email: 'usera@example.com' };
  const mockCoordinator = {
    getUser: () => activeUser,
    captureGeneration: () => 1,
    isCurrent: () => true,
    getClient: () => mockClient,
    signOut: () => Promise.resolve({ error: null }),
  };

  const controller = createAccountDeletionController({
    authCoordinator: mockCoordinator,
    fetcher: mockFetcher,
    isDeletionEnabled: () => true,
  });

  const controllerRes = await controller.deleteAccount({ password: 'secure-password' });
  assert.equal(fetchCallCount, 0, 'Controller must NOT dispatch deletion request on owner mismatch');
  assert.equal(controllerRes.status, 'error');
  assert.equal(controllerRes.code, 'OWNER_MISMATCH');
});

// ---------------------------------------------------------------------------
// 2. Session error with stale data -> zero HTTP requests
// ---------------------------------------------------------------------------
test('Session error with stale data: zero deletion HTTP requests dispatched', async () => {
  const { sendDeletionRequest } = await server.ssrLoadModule('/src/lib/accountDeletionClient.js');

  let fetchCallCount = 0;
  const mockFetcher = async () => {
    fetchCallCount++;
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };

  // getSession returns an error alongside stale session data
  const mockClient = {
    auth: {
      getSession: async () => ({
        data: {
          session: {
            access_token: 'stale-token-a',
            user: { id: USER_A },
          },
        },
        error: { message: 'Refresh token invalid' },
      }),
      getUser: async () => ({
        data: { user: { id: USER_A } },
        error: null,
      }),
    },
  };

  const res = await sendDeletionRequest({
    client: mockClient,
    password: 'secure-password',
    initiatingUserId: USER_A,
    fetcher: mockFetcher,
  });

  assert.equal(fetchCallCount, 0, 'Must NOT dispatch deletion request when getSession returns an error');
  assert.equal(res.status, 'unauthenticated');
  assert.equal(res.code, 'SESSION_ERROR');
});

// ---------------------------------------------------------------------------
// 3. Token-specific verification returns B or an error -> zero HTTP requests
// ---------------------------------------------------------------------------
test('Token-specific verification returns B or error: zero deletion HTTP requests dispatched', async () => {
  const { sendDeletionRequest } = await server.ssrLoadModule('/src/lib/accountDeletionClient.js');

  let fetchCallCount = 0;
  const mockFetcher = async () => {
    fetchCallCount++;
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };

  // Case 3A: Token verification returns User B
  const mockClientReturnsB = {
    auth: {
      getSession: async () => ({
        data: {
          session: {
            access_token: 'token-claims-b',
            user: { id: USER_A }, // Mismatched or spoofed local session
          },
        },
        error: null,
      }),
      getUser: async (_token) => {
        assert.equal(token, 'token-claims-b');
        return { data: { user: { id: USER_B } }, error: null };
      },
    },
  };

  const res3A = await sendDeletionRequest({
    client: mockClientReturnsB,
    password: 'password',
    initiatingUserId: USER_A,
    fetcher: mockFetcher,
  });

  assert.equal(fetchCallCount, 0, 'Must NOT dispatch when token verification resolves to User B');
  assert.equal(res3A.status, 'error');
  assert.equal(res3A.code, 'OWNER_MISMATCH');

  // Case 3B: Token verification returns an error
  const mockClientReturnsErr = {
    auth: {
      getSession: async () => ({
        data: {
          session: {
            access_token: 'expired-token',
            user: { id: USER_A },
          },
        },
        error: null,
      }),
      getUser: async () => ({
        data: null,
        error: { message: 'JWT expired' },
      }),
    },
  };

  const res3B = await sendDeletionRequest({
    client: mockClientReturnsErr,
    password: 'password',
    initiatingUserId: USER_A,
    fetcher: mockFetcher,
  });

  assert.equal(fetchCallCount, 0, 'Must NOT dispatch when token verification returns an error');
  assert.equal(res3B.status, 'unauthenticated');
  assert.equal(res3B.code, 'UNAUTHENTICATED');

  // Case 3C: Token verification throws an exception
  const mockClientThrows = {
    auth: {
      getSession: async () => ({
        data: {
          session: {
            access_token: 'token-throws',
            user: { id: USER_A },
          },
        },
        error: null,
      }),
      getUser: async () => {
        throw new Error('Network failure during getUser');
      },
    },
  };

  const res3C = await sendDeletionRequest({
    client: mockClientThrows,
    password: 'password',
    initiatingUserId: USER_A,
    fetcher: mockFetcher,
  });

  assert.equal(fetchCallCount, 0, 'Must NOT dispatch when token verification throws');
  assert.equal(res3C.status, 'unauthenticated');
  assert.equal(res3C.code, 'VERIFICATION_FAILED');
});

// ---------------------------------------------------------------------------
// 4. Account changes during verification -> zero HTTP requests
// ---------------------------------------------------------------------------
test('Account changes during verification: zero deletion HTTP requests dispatched', async () => {
  const { sendDeletionRequest, createAccountDeletionController } = await server.ssrLoadModule('/src/lib/accountDeletionClient.js');

  let fetchCallCount = 0;
  const mockFetcher = async () => {
    fetchCallCount++;
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };

  let activeUser = { id: USER_A, email: 'a@example.com' };
  let currentGen = 1;

  // Slow getUser during which account switches to B
  const mockClient = {
    auth: {
      getSession: async () => ({
        data: {
          session: {
            access_token: 'token-a',
            user: { id: USER_A },
          },
        },
        error: null,
      }),
      getUser: async (_token) => {
        // While token verification is in-flight, account changes to User B!
        activeUser = { id: USER_B, email: 'b@example.com' };
        currentGen = 2;
        return { data: { user: { id: USER_A } }, error: null };
      },
    },
  };

  const mockCoordinator = {
    getUser: () => activeUser,
    captureGeneration: () => currentGen,
    isCurrent: (gen) => gen === currentGen,
    getClient: () => mockClient,
    signOut: () => Promise.resolve({ error: null }),
  };

  const controller = createAccountDeletionController({
    authCoordinator: mockCoordinator,
    fetcher: mockFetcher,
    isDeletionEnabled: () => true,
  });

  const res = await controller.deleteAccount({ password: 'secret' });

  assert.equal(fetchCallCount, 0, 'Must NOT dispatch HTTP request when account switches during verification');
  assert.equal(res.status, 'discarded');
  assert.equal(res.reason, 'account_switched');

  // Also verify sendDeletionRequest directly
  let opValid = true;
  const directClient = {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'tok', user: { id: USER_A } } }, error: null }),
      getUser: async () => {
        opValid = false; // Account switches during getUser
        return { data: { user: { id: USER_A } }, error: null };
      },
    },
  };
  const directRes = await sendDeletionRequest({
    client: directClient,
    password: 'pw',
    initiatingUserId: USER_A,
    isCurrent: () => opValid,
    fetcher: mockFetcher,
  });
  assert.equal(fetchCallCount, 0, 'sendDeletionRequest must NOT dispatch when isCurrent returns false');
  assert.equal(directRes.status, 'error');
  assert.equal(directRes.code, 'OPERATION_CANCELLED');
});

// ---------------------------------------------------------------------------
// 5. Stable verified A succeeds using the captured A token
// ---------------------------------------------------------------------------
test('Stable verified A succeeds using exactly the captured A token', async () => {
  const { createAccountDeletionController } = await server.ssrLoadModule('/src/lib/accountDeletionClient.js');

  let dispatchedToken = null;
  let dispatchedBody = null;
  const mockFetcher = async (url, opts) => {
    dispatchedToken = opts.headers.Authorization;
    dispatchedBody = JSON.parse(opts.body);
    return new Response(JSON.stringify({
      success: true,
      status: 'deleted',
      userId: USER_A,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const CAPTURED_TOKEN_A = 'unique-verified-jwt-token-a-98765';
  const mockClient = {
    auth: {
      getSession: async () => ({
        data: {
          session: {
            access_token: CAPTURED_TOKEN_A,
            user: { id: USER_A },
          },
        },
        error: null,
      }),
      getUser: async (_token) => {
        assert.equal(token, CAPTURED_TOKEN_A, 'getUser must receive captured token');
        return { data: { user: { id: USER_A } }, error: null };
      },
    },
  };

  let activeOwner = USER_A;
  const mockCoordinator = {
    getUser: () => ({ id: USER_A, email: 'learner-a@example.com' }),
    captureGeneration: () => 1,
    isCurrent: (gen) => gen === 1,
    getClient: () => mockClient,
    signOut: () => {
      activeOwner = null;
      return Promise.resolve({ error: null });
    },
  };

  const mockStorageOwner = {
    getOwner: () => activeOwner,
    setOwner: (val) => { activeOwner = val; },
  };

  const controller = createAccountDeletionController({
    authCoordinator: mockCoordinator,
    storageOwner: mockStorageOwner,
    fetcher: mockFetcher,
    isDeletionEnabled: () => true,
  });

  const res = await controller.deleteAccount({ password: 'correct-password' });

  assert.equal(res.status, 'deleted');
  assert.equal(dispatchedToken, `Bearer ${CAPTURED_TOKEN_A}`, 'Must send exactly the verified captured token');
  assert.deepEqual(dispatchedBody, { password: 'correct-password' }, 'Must NOT send caller-selected deletion target');
  assert.equal(activeOwner, null, 'Must transition to guest after successful deletion');
});
