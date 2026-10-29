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

// ===========================================================================
// DEFECT 1: GENUINE SIGNED_OUT DROPPED
// ===========================================================================

test('Defect 1A: local signOut in flight must not drop genuine external revocation of User B', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  let authListener = null;
  let activeSessionUser = { id: USER_A };
  let resolveSlowSignOut;
  const slowSignOutPromise = new Promise((resolve) => { resolveSlowSignOut = resolve; });

  const mockAuthClient = {
    auth: {
      getSession: async () => ({
        data: { session: activeSessionUser ? { user: activeSessionUser } : null },
        error: null,
      }),
      getUser: async () => ({
        data: { user: activeSessionUser },
        error: activeSessionUser ? null : { message: 'No user' },
      }),
      onAuthStateChange: (cb) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: () => { authListener = null; } } } };
      },
      signOut: async () => slowSignOutPromise,
    },
  };

  const coordinator = createAuthCoordinator({
    authClient: mockAuthClient,
    storageOwner,
    isConfigured: true,
  });

  const cleanup = coordinator.initialize();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(coordinator.getState().user?.id, USER_A, 'Step 1: User A verified');

  // Step 2: Start A's SDK signOut using a deferred promise
  const slowSignOutOp = coordinator.signOut();

  // Step 3 & 4: Change mocked session to B and emit SIGNED_IN for B, complete verification
  activeSessionUser = { id: USER_B };
  authListener('SIGNED_IN', { user: activeSessionUser });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(coordinator.getState().user?.id, USER_B, 'Step 4: User B verified');
  assert.equal(storageOwner.getOwner(), USER_B, 'Storage owner is User B');

  // Step 5: Remove B's SDK session and emit SIGNED_OUT(null), representing genuine external revocation
  activeSessionUser = null;
  authListener('SIGNED_OUT', null);

  // Step 6: Before resolving A's promise, assert guest user and guest storage owner
  assert.equal(coordinator.getState().user, null, 'Coordinator user must be guest after genuine revocation');
  assert.equal(storageOwner.getOwner(), null, 'Storage owner must be reset to guest');

  // Clean up in-flight promise
  resolveSlowSignOut({ error: null });
  const slowRes = await slowSignOutOp;
  assert.equal(slowRes.error?.message, 'Account changed during sign out.');
  cleanup();
});

test('Defect 1B: global signOut in flight must not drop genuine external revocation of User B', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  let authListener = null;
  let activeSessionUser = { id: USER_A };
  let resolveSlowSignOut;
  const slowSignOutPromise = new Promise((resolve) => { resolveSlowSignOut = resolve; });

  const mockAuthClient = {
    auth: {
      getSession: async () => ({
        data: { session: activeSessionUser ? { user: activeSessionUser } : null },
        error: null,
      }),
      getUser: async () => ({
        data: { user: activeSessionUser },
        error: activeSessionUser ? null : { message: 'No user' },
      }),
      onAuthStateChange: (cb) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: () => { authListener = null; } } } };
      },
      signOut: async () => slowSignOutPromise,
    },
  };

  const coordinator = createAuthCoordinator({
    authClient: mockAuthClient,
    storageOwner,
    isConfigured: true,
  });

  const cleanup = coordinator.initialize();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(coordinator.getState().user?.id, USER_A, 'Step 1: User A verified');

  // Step 2: Start A's SDK global signOut using a deferred promise
  const slowSignOutOp = coordinator.signOutGlobal();

  // Step 3 & 4: Change mocked session to B and emit SIGNED_IN for B, complete verification
  activeSessionUser = { id: USER_B };
  authListener('SIGNED_IN', { user: activeSessionUser });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(coordinator.getState().user?.id, USER_B, 'Step 4: User B verified');
  assert.equal(storageOwner.getOwner(), USER_B, 'Storage owner is User B');

  // Step 5: Remove B's SDK session and emit SIGNED_OUT(null), representing genuine external revocation
  activeSessionUser = null;
  authListener('SIGNED_OUT', null);

  // Step 6: Before resolving A's promise, assert guest user and guest storage owner
  assert.equal(coordinator.getState().user, null, 'Coordinator user must be guest after genuine revocation');
  assert.equal(storageOwner.getOwner(), null, 'Storage owner must be reset to guest');

  // Clean up in-flight promise
  resolveSlowSignOut({ error: null });
  const slowRes = await slowSignOutOp;
  assert.equal(slowRes.error?.message, 'Account changed during sign out.');
  cleanup();
});

// ===========================================================================
// DEFECT 2: FALSE LOCAL CONFIRMATION
// ===========================================================================

test('Defect 2A: local signOut returning error when session not removed must return confirmedLocal: false', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  const activeSessionUser = { id: USER_A };
  const sdkError = { message: 'Local storage write blocked' };

  const mockAuthClient = {
    auth: {
      getSession: async () => ({
        data: { session: { user: activeSessionUser } }, // Session STILL present
        error: null,
      }),
      getUser: async () => ({
        data: { user: activeSessionUser },
        error: null,
      }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      // SDK fails BEFORE removing its stored session; no SIGNED_OUT event
      signOut: async () => ({ error: sdkError }),
    },
  };

  const coordinator = createAuthCoordinator({
    authClient: mockAuthClient,
    storageOwner,
    isConfigured: true,
  });

  coordinator.initialize();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(coordinator.getState().user?.id, USER_A);

  const res = await coordinator.signOut();

  assert.equal(res.error, sdkError, 'Preserves original SDK error');
  assert.equal(res.confirmedLocal, false, 'confirmedLocal must be false when removal is unconfirmed');
  assert.doesNotMatch(res.error?.message || '', /You have been signed out on this device/);
  assert.doesNotMatch(res.guidance || '', /You have been signed out on this device/);
});

test('Defect 2B: local signOut throwing exception when session not removed must return confirmedLocal: false', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  const activeSessionUser = { id: USER_A };
  const thrownError = new Error('Disk quota exceeded');

  const mockAuthClient = {
    auth: {
      getSession: async () => ({
        data: { session: { user: activeSessionUser } },
        error: null,
      }),
      getUser: async () => ({
        data: { user: activeSessionUser },
        error: null,
      }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => {
        throw thrownError;
      },
    },
  };

  const coordinator = createAuthCoordinator({
    authClient: mockAuthClient,
    storageOwner,
    isConfigured: true,
  });

  coordinator.initialize();
  await new Promise((r) => setTimeout(r, 20));

  const res = await coordinator.signOut();

  assert.equal(res.error, thrownError);
  assert.equal(res.confirmedLocal, false, 'confirmedLocal must be false on thrown exception without removal');
  assert.doesNotMatch(res.error?.message || '', /You have been signed out on this device/);
  assert.doesNotMatch(res.guidance || '', /You have been signed out on this device/);
});

test('Defect 2C: global signOut returning error when session not removed must return confirmedLocal: false', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  const activeSessionUser = { id: USER_A };
  const sdkError = { message: 'Preflight auth check failed' };

  const mockAuthClient = {
    auth: {
      getSession: async () => ({
        data: { session: { user: activeSessionUser } },
        error: null,
      }),
      getUser: async () => ({
        data: { user: activeSessionUser },
        error: null,
      }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => ({ error: sdkError }),
    },
  };

  const coordinator = createAuthCoordinator({
    authClient: mockAuthClient,
    storageOwner,
    isConfigured: true,
  });

  coordinator.initialize();
  await new Promise((r) => setTimeout(r, 20));

  const res = await coordinator.signOutGlobal();

  assert.equal(res.error, sdkError);
  assert.equal(res.confirmedLocal, false, 'confirmedLocal must be false for global signOut failure without removal');
  assert.equal(res.remoteConfirmed, false, 'remoteConfirmed must be false');
  assert.doesNotMatch(coordinator.getState().error || '', /You have been signed out on this device/);
  assert.doesNotMatch(res.guidance || '', /You have been signed out on this device/);
});

test('Defect 2D: global signOut throwing exception when session not removed must return confirmedLocal: false', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  const activeSessionUser = { id: USER_A };
  const thrownError = new Error('Network timeout during preflight');

  const mockAuthClient = {
    auth: {
      getSession: async () => ({
        data: { session: { user: activeSessionUser } },
        error: null,
      }),
      getUser: async () => ({
        data: { user: activeSessionUser },
        error: null,
      }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => {
        throw thrownError;
      },
    },
  };

  const coordinator = createAuthCoordinator({
    authClient: mockAuthClient,
    storageOwner,
    isConfigured: true,
  });

  coordinator.initialize();
  await new Promise((r) => setTimeout(r, 20));

  const res = await coordinator.signOutGlobal();

  assert.equal(res.error, thrownError);
  assert.equal(res.confirmedLocal, false, 'confirmedLocal must be false on thrown exception');
  assert.equal(res.remoteConfirmed, false);
  assert.doesNotMatch(coordinator.getState().error || '', /You have been signed out on this device/);
  assert.doesNotMatch(res.guidance || '', /You have been signed out on this device/);
});

// ===========================================================================
// ADDITIONAL BOUNDARY COVERAGE
// ===========================================================================

test('Distinct Case: late unattributed SIGNED_OUT with valid SDK session reconciles and preserves User B', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  let authListener = null;
  let activeSessionUser = { id: USER_A };
  let resolveSlowSignOut;
  const slowSignOutPromise = new Promise((resolve) => { resolveSlowSignOut = resolve; });

  const mockAuthClient = {
    auth: {
      getSession: async () => ({
        data: { session: activeSessionUser ? { user: activeSessionUser } : null },
        error: null,
      }),
      getUser: async () => ({
        data: { user: activeSessionUser },
        error: activeSessionUser ? null : { message: 'No user' },
      }),
      onAuthStateChange: (cb) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: () => { authListener = null; } } } };
      },
      signOut: async () => slowSignOutPromise,
    },
  };

  const coordinator = createAuthCoordinator({
    authClient: mockAuthClient,
    storageOwner,
    isConfigured: true,
  });

  const cleanup = coordinator.initialize();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(coordinator.getState().user?.id, USER_A);

  // User A starts slow signOut
  const slowSignOutOp = coordinator.signOut();

  // User B signs in and verifies
  activeSessionUser = { id: USER_B };
  authListener('SIGNED_IN', { user: activeSessionUser });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(coordinator.getState().user?.id, USER_B);
  assert.equal(storageOwner.getOwner(), USER_B);

  // Late unattributed SIGNED_OUT event arrives, but SDK still has valid B session
  authListener('SIGNED_OUT', null);
  // Fail-closed temporary guest during synchronous event handling
  assert.equal(coordinator.getState().user, null);
  assert.equal(storageOwner.getOwner(), null);

  // Outside synchronous callback, reconciliation checks getSession and re-verifies User B
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(coordinator.getState().user?.id, USER_B, 'User B restored after reconciliation');
  assert.equal(storageOwner.getOwner(), USER_B, 'Storage owner restored to User B');

  // User A's slow promise finishes with error
  resolveSlowSignOut({ error: { message: 'User A late server error' } });
  const slowRes = await slowSignOutOp;
  assert.equal(slowRes.error?.message, 'Account changed during sign out.');
  assert.equal(coordinator.getState().user?.id, USER_B, 'User B must not be displaced by User A late completion');
  assert.equal(coordinator.getState().error, null, 'User B must not receive User A error');

  cleanup();
});

test('Established removal: SDK SIGNED_OUT followed by remote error retains confirmedLocal: true and remoteConfirmed: false', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  let authListener = null;
  const sdkRemoteError = { message: 'Global session revocation timed out on remote server' };

  const mockAuthClient = {
    auth: {
      getSession: async () => ({
        data: { session: null }, // Removed locally by SDK
        error: null,
      }),
      getUser: async () => ({
        data: { user: null },
        error: { message: 'Not logged in' },
      }),
      onAuthStateChange: (cb) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: () => { authListener = null; } } } };
      },
      signOut: async () => {
        // SDK established local removal before remote call fails
        if (authListener) authListener('SIGNED_OUT', null);
        return { error: sdkRemoteError };
      },
    },
  };

  const coordinator = createAuthCoordinator({
    authClient: mockAuthClient,
    storageOwner,
    isConfigured: true,
  });

  coordinator.initialize();
  await new Promise((r) => setTimeout(r, 20));

  const res = await coordinator.signOutGlobal();

  assert.equal(res.error, sdkRemoteError, 'Preserves original remote SDK error');
  assert.equal(res.confirmedLocal, true, 'Local removal was established');
  assert.equal(res.remoteConfirmed, false, 'Remote revocation failed');
  assert.match(res.guidance, /Sign-out on other devices could not be confirmed\. You have been signed out on this device\./);
  assert.equal(coordinator.getState().user, null);
  assert.equal(storageOwner.getOwner(), null);
});
