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
// Reproduction 1: Mock auth.signOut({scope:'local'}) synchronously emits SIGNED_OUT, then resolves {error:null}
// ---------------------------------------------------------------------------
test('Reproduction 1: local signOut must succeed when SDK emits SIGNED_OUT before resolving', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  storageOwner.scope(USER_A).setItem('zh_saved_words', JSON.stringify([{ id: 'word-a' }]));
  storageOwner.scope(null).setItem('zh_saved_words', JSON.stringify([{ id: 'guest-word' }]));

  let authListener = null;
  const mockAuthClient = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: USER_A } } }, error: null }),
      getUser: async () => ({ data: { user: { id: USER_A } }, error: null }),
      onAuthStateChange: (cb) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: () => { authListener = null; } } } };
      },
      signOut: async () => {
        // SDK synchronously emits SIGNED_OUT before resolving
        if (authListener) {
          authListener('SIGNED_OUT', null);
        }
        return { error: null };
      },
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
  assert.equal(storageOwner.getOwner(), USER_A);

  const res = await coordinator.signOut();

  // EXPECTED: operation succeeds with null error, guest owner selected, caches preserved.
  assert.equal(res.error, null, 'Must succeed without "Account changed during sign out." error');
  assert.equal(res.confirmedLocal, true, 'confirmedLocal must be true');
  assert.equal(coordinator.getState().user, null, 'User must be null');
  assert.equal(coordinator.getState().isGuest, true, 'isGuest must be true');
  assert.equal(storageOwner.getOwner(), null, 'Storage owner must be reset to guest');
  assert.equal(storageOwner.scope(USER_A).getItem('zh_saved_words'), JSON.stringify([{ id: 'word-a' }]));
  assert.equal(storageOwner.scope(null).getItem('zh_saved_words'), JSON.stringify([{ id: 'guest-word' }]));

  cleanup();
});

// ---------------------------------------------------------------------------
// Reproduction 2: Mock auth.signOut({scope:'global'}) synchronously emits SIGNED_OUT, then resolves {error:null}
// ---------------------------------------------------------------------------
test('Reproduction 2: global signOut must succeed when SDK emits SIGNED_OUT before resolving', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  storageOwner.scope(USER_A).setItem('zh_saved_words', JSON.stringify([{ id: 'word-a' }]));

  let authListener = null;
  const mockAuthClient = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: USER_A } } }, error: null }),
      getUser: async () => ({ data: { user: { id: USER_A } }, error: null }),
      onAuthStateChange: (cb) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: () => { authListener = null; } } } };
      },
      signOut: async () => {
        if (authListener) {
          authListener('SIGNED_OUT', null);
        }
        return { error: null };
      },
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

  const res = await coordinator.signOutGlobal();

  // EXPECTED: successful global completion without false error
  assert.equal(res.error, null, 'Global sign out must succeed without error');
  assert.equal(res.confirmedLocal, true, 'Local confirmation must be true');
  assert.equal(res.remoteConfirmed, true, 'Remote confirmation must be true');
  assert.equal(coordinator.getState().user, null);
  assert.equal(storageOwner.getOwner(), null);
  assert.equal(storageOwner.scope(USER_A).getItem('zh_saved_words'), JSON.stringify([{ id: 'word-a' }]));

  cleanup();
});

// ---------------------------------------------------------------------------
// Reproduction 3: Global sign-out emits SIGNED_OUT, then resolves {error: sdkError}
// ---------------------------------------------------------------------------
test('Reproduction 3: global sign-out emitting SIGNED_OUT before error must report SDK failure and actionable guidance', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });

  let authListener = null;
  const sdkError = { message: 'Server global sign out rejected by remote.' };

  const mockAuthClient = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: USER_A } } }, error: null }),
      getUser: async () => ({ data: { user: { id: USER_A } }, error: null }),
      onAuthStateChange: (cb) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: () => { authListener = null; } } } };
      },
      signOut: async () => {
        // SDK deletes local session and emits SIGNED_OUT, but remote call fails
        if (authListener) {
          authListener('SIGNED_OUT', null);
        }
        return { error: sdkError };
      },
    },
  };

  const coordinator = createAuthCoordinator({
    authClient: mockAuthClient,
    storageOwner,
    isConfigured: true,
  });

  const cleanup = coordinator.initialize();
  await new Promise((r) => setTimeout(r, 20));

  const res = await coordinator.signOutGlobal();

  // EXPECTED: preserve/report the actual SDK failure and actionable guidance that sign-out on other devices could not be confirmed.
  assert.notEqual(res.error?.message, 'Account changed during sign out.', 'Must not mask SDK failure with account change error');
  assert.equal(res.error?.message, 'Server global sign out rejected by remote.');
  assert.equal(res.confirmedLocal, true, 'Device local sign-out is confirmed');
  assert.equal(res.remoteConfirmed, false, 'Remote revocation is not confirmed');
  assert.match(res.guidance, /Sign-out on other devices could not be confirmed/);
  assert.equal(coordinator.getState().user, null, 'Local session is ended (guest)');
  assert.equal(storageOwner.getOwner(), null, 'Storage owner is guest');

  cleanup();
});

// ---------------------------------------------------------------------------
// Test 4: Scope arguments passed correctly to client.auth.signOut
// ---------------------------------------------------------------------------
test('Scope options: local signOut passes { scope: "local" } and global signOut passes { scope: "global" }', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  const recordedScopes = [];

  const mockAuthClient = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: USER_A } } }, error: null }),
      getUser: async () => ({ data: { user: { id: USER_A } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async ({ scope }) => {
        recordedScopes.push(scope);
        return { error: null };
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

  await coordinator.signOut();
  assert.deepEqual(recordedScopes, ['local']);

  await coordinator.retryVerification();
  await new Promise((r) => setTimeout(r, 20));

  await coordinator.signOutGlobal();
  assert.deepEqual(recordedScopes, ['local', 'global']);
});

// ---------------------------------------------------------------------------
// Test 5: Ordinary successful completion without SDK event
// ---------------------------------------------------------------------------
test('Ordinary completion without mock events: local and global signOut succeed', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });

  const mockAuthClient = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: USER_A } } }, error: null }),
      getUser: async () => ({ data: { user: { id: USER_A } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => ({ error: null }),
    },
  };

  const coordinator = createAuthCoordinator({
    authClient: mockAuthClient,
    storageOwner,
    isConfigured: true,
  });

  coordinator.initialize();
  await new Promise((r) => setTimeout(r, 20));

  const localRes = await coordinator.signOut();
  assert.equal(localRes.error, null);
  assert.equal(localRes.confirmedLocal, true);
  assert.equal(storageOwner.getOwner(), null);

  await coordinator.retryVerification();
  await new Promise((r) => setTimeout(r, 20));

  const globalRes = await coordinator.signOutGlobal();
  assert.equal(globalRes.error, null);
  assert.equal(globalRes.confirmedLocal, true);
  assert.equal(globalRes.remoteConfirmed, true);
  assert.equal(storageOwner.getOwner(), null);
});

// ---------------------------------------------------------------------------
// Test 6: Local signOut with SDK error or thrown exception
// ---------------------------------------------------------------------------
test('Local signOut with returned SDK error or thrown exception surfaces error and retains guest owner', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  let authListener = null;
  let mode = 'error';

  const mockAuthClient = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: USER_A } } }, error: null }),
      getUser: async () => ({ data: { user: { id: USER_A } }, error: null }),
      onAuthStateChange: (cb) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: () => { authListener = null; } } } };
      },
      signOut: async () => {
        if (authListener) authListener('SIGNED_OUT', null);
        if (mode === 'error') {
          return { error: { message: 'Local storage access denied' } };
        }
        throw new Error('Local network failure');
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

  // 1. Returned SDK error
  mode = 'error';
  const res1 = await coordinator.signOut();
  assert.equal(res1.error?.message, 'Local storage access denied');
  assert.equal(res1.confirmedLocal, true);
  assert.equal(storageOwner.getOwner(), null);
  assert.equal(coordinator.getState().user, null);

  // Re-verify
  await coordinator.retryVerification();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(coordinator.getState().user?.id, USER_A);

  // 2. Thrown exception
  mode = 'throw';
  const res2 = await coordinator.signOut();
  assert.equal(res2.error?.message, 'Local network failure');
  assert.equal(res2.confirmedLocal, true);
  assert.equal(storageOwner.getOwner(), null);
  assert.equal(coordinator.getState().user, null);
});

// ---------------------------------------------------------------------------
// Test 7: External SIGNED_OUT event immediately resets coordinator state and owner
// ---------------------------------------------------------------------------
test('External SIGNED_OUT event immediately resets coordinator state and storage owner to guest', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  let authListener = null;

  const mockAuthClient = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: USER_A } } }, error: null }),
      getUser: async () => ({ data: { user: { id: USER_A } }, error: null }),
      onAuthStateChange: (cb) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: () => { authListener = null; } } } };
      },
      signOut: async () => ({ error: null }),
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
  assert.equal(storageOwner.getOwner(), USER_A);

  // External event (e.g. from token expiration or another tab)
  authListener('SIGNED_OUT', null);

  assert.equal(coordinator.getState().user, null);
  assert.equal(coordinator.getState().isGuest, true);
  assert.equal(storageOwner.getOwner(), null);

  cleanup();
});

// ---------------------------------------------------------------------------
// Test 8: Pending session verification cannot restore signed-out user
// ---------------------------------------------------------------------------
test('Pending session verification cannot restore signed-out user', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  let resolveSlowGetUser;
  const slowGetUserPromise = new Promise((resolve) => { resolveSlowGetUser = resolve; });

  const mockAuthClient = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: USER_A } } }, error: null }),
      getUser: () => slowGetUserPromise,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => ({ error: null }),
    },
  };

  const coordinator = createAuthCoordinator({
    authClient: mockAuthClient,
    storageOwner,
    isConfigured: true,
  });

  coordinator.initialize();
  // Verification is pending...

  // Sign out while verification is in-flight
  await coordinator.signOut();
  assert.equal(coordinator.getState().user, null);
  assert.equal(storageOwner.getOwner(), null);

  // Now the slow verification completes
  resolveSlowGetUser({ data: { user: { id: USER_A } }, error: null });
  await new Promise((r) => setTimeout(r, 20));

  // Stale verification must NOT have restored User A!
  assert.equal(coordinator.getState().user, null);
  assert.equal(coordinator.getState().isGuest, true);
  assert.equal(storageOwner.getOwner(), null);
});

// ---------------------------------------------------------------------------
// Test 9: Account switch race protection: delayed signOut cannot displace User B
// ---------------------------------------------------------------------------
test('Account switch race protection: delayed signOut cannot displace User B or leak error', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  let resolveSignOut;
  const slowSignOutPromise = new Promise((resolve) => { resolveSignOut = resolve; });
  let authListener = null;

  const mockAuthClient = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: USER_A } } }, error: null }),
      getUser: async () => ({ data: { user: { id: USER_A } }, error: null }),
      onAuthStateChange: (cb) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: () => { authListener = null; } } } };
      },
      signOut: () => slowSignOutPromise,
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

  // User A starts slow global sign out
  const slowSignOutOp = coordinator.signOutGlobal();

  // User B signs in and verifies while User A signout is in flight
  mockAuthClient.auth.getUser = async () => ({ data: { user: { id: USER_B } }, error: null });
  await coordinator.retryVerification();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(coordinator.getState().user?.id, USER_B);
  assert.equal(storageOwner.getOwner(), USER_B);

  // Late SDK SIGNED_OUT event arrives from User A's sign-out
  authListener('SIGNED_OUT', null);
  // User B must NOT be displaced by the stale event!
  assert.equal(coordinator.getState().user?.id, USER_B);
  assert.equal(storageOwner.getOwner(), USER_B);

  // User A's sign-out finishes
  resolveSignOut({ error: { message: 'User A late server error' } });
  const res = await slowSignOutOp;

  // Expected: reports account changed, protects User B
  assert.equal(res.error?.message, 'Account changed during sign out.');
  assert.equal(coordinator.getState().user?.id, USER_B);
  assert.equal(coordinator.getState().error, null, 'User B must not receive User A error');
  assert.equal(storageOwner.getOwner(), USER_B);

  cleanup();
});

// ---------------------------------------------------------------------------
// Test 10: Storage caches remain byte-identical before and after sign-out
// ---------------------------------------------------------------------------
test('Storage bytes preservation: learning records for guest and accounts remain byte-identical', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });

  // Seed exact bytes
  const guestZhWords = JSON.stringify([{ id: 'g-word-1', hanzi: '你好', pinyin: 'nǐ hǎo' }]);
  const userAZhWords = JSON.stringify([{ id: 'a-word-1', hanzi: '学习', pinyin: 'xué xí' }]);
  const userBJaWords = JSON.stringify([{ id: 'b-word-1', kanji: '勉強', reading: 'べんきょう' }]);

  storageOwner.scope(null).setItem('zh_saved_words', guestZhWords);
  storageOwner.scope(USER_A).setItem('zh_saved_words', userAZhWords);
  storageOwner.scope(USER_B).setItem('ja_saved_words', userBJaWords);

  let authListener = null;
  const mockAuthClient = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: USER_A } } }, error: null }),
      getUser: async () => ({ data: { user: { id: USER_A } }, error: null }),
      onAuthStateChange: (cb) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: () => { authListener = null; } } } };
      },
      signOut: async () => {
        if (authListener) authListener('SIGNED_OUT', null);
        return { error: null };
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

  await coordinator.signOut();

  // Verify byte identity
  assert.equal(storageOwner.scope(null).getItem('zh_saved_words'), guestZhWords);
  assert.equal(storageOwner.scope(USER_A).getItem('zh_saved_words'), userAZhWords);
  assert.equal(storageOwner.scope(USER_B).getItem('ja_saved_words'), userBJaWords);
});
