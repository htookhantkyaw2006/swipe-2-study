import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const values = new Map();
const oldStorage = globalThis.localStorage;
globalThis.localStorage = {
  get length() { return values.size; },
  key: index => [...values.keys()][index] ?? null,
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: key => values.delete(key),
};

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false, host: '127.0.0.1', watch: null },
});

after(async () => {
  await server.close();
  if (oldStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = oldStorage;
});

test('signOut vs signOutGlobal scope separation and cache preservation', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  const userUUID = '33333333-3333-4333-8333-333333333333';

  storageOwner.scope(userUUID).setItem('zh_saved_words', JSON.stringify([{ id: 'word-1' }]));
  storageOwner.scope(null).setItem('zh_saved_words', JSON.stringify([{ id: 'guest-word' }]));

  const signOutCalls = [];
  const mockAuthClient = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: userUUID } } }, error: null }),
      getUser: async () => ({ data: { user: { id: userUUID } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async (options) => {
        signOutCalls.push(options);
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
  await new Promise(r => setTimeout(r, 20));

  assert.equal(coordinator.getState().user?.id, userUUID);
  assert.equal(storageOwner.getOwner(), userUUID);

  // 1. Local sign out
  const localRes = await coordinator.signOut();
  assert.equal(localRes.error, null);
  assert.deepEqual(signOutCalls[0], { scope: 'local' });
  assert.equal(storageOwner.getOwner(), null, 'Reset to guest after local signOut');
  assert.equal(storageOwner.scope(userUUID).getItem('zh_saved_words'), JSON.stringify([{ id: 'word-1' }]), 'User cache preserved');
  assert.equal(storageOwner.scope(null).getItem('zh_saved_words'), JSON.stringify([{ id: 'guest-word' }]), 'Guest cache preserved');

  // Re-verify user for global signOut
  await coordinator.retryVerification();
  await new Promise(r => setTimeout(r, 20));
  assert.equal(coordinator.getState().user?.id, userUUID);
  assert.equal(storageOwner.getOwner(), userUUID);

  // 2. Global sign out
  const globalRes = await coordinator.signOutGlobal();
  assert.equal(globalRes.error, null);
  assert.deepEqual(signOutCalls[1], { scope: 'global' });
  assert.equal(storageOwner.getOwner(), null, 'Reset to guest after global signOut');
  assert.equal(storageOwner.scope(userUUID).getItem('zh_saved_words'), JSON.stringify([{ id: 'word-1' }]), 'User cache preserved after global signOut');
  assert.equal(storageOwner.scope(null).getItem('zh_saved_words'), JSON.stringify([{ id: 'guest-word' }]), 'Guest cache preserved after global signOut');

  cleanup();
});

test('signOutGlobal handles SDK returned error, network exceptions, and generation guard', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  const userA = '11111111-1111-4111-8111-111111111111';
  const userB = '22222222-2222-4222-8222-222222222222';

  let signOutBehavior = 'return-error';
  let resolveSignOut;
  let signOutPromise;

  const mockAuthClient = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: userA } } }, error: null }),
      getUser: async () => ({ data: { user: { id: userA } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => {
        if (signOutBehavior === 'return-error') {
          return { error: { message: 'Server global sign out rejected.' } };
        }
        if (signOutBehavior === 'throw-error') {
          throw new Error('Network error');
        }
        if (signOutBehavior === 'delayed') {
          return signOutPromise;
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
  await new Promise(r => setTimeout(r, 20));

  // 1. SDK returned error object
  signOutBehavior = 'return-error';
  const res1 = await coordinator.signOutGlobal();
  assert.equal(res1.error?.message, 'Server global sign out rejected.');
  assert.equal(coordinator.getState().user, null, 'Local state is still reset to guest');
  assert.equal(coordinator.getState().error, 'Server global sign out rejected.');

  // 2. SDK thrown exception
  signOutBehavior = 'throw-error';
  const res2 = await coordinator.signOutGlobal();
  assert.equal(res2.error?.message, 'Network error');
  assert.equal(coordinator.getState().error, 'Network error');

  // 3. Stale response after account switch is discarded
  signOutBehavior = 'delayed';
  signOutPromise = new Promise(resolve => { resolveSignOut = resolve; });

  const slowSignOutPromise = coordinator.signOutGlobal();

  // User B signs in while User A global signout is pending
  mockAuthClient.auth.getUser = async () => ({ data: { user: { id: userB } }, error: null });
  await coordinator.retryVerification();
  await new Promise(r => setTimeout(r, 20));
  assert.equal(coordinator.getState().user?.id, userB);
  assert.equal(coordinator.getState().error, null);

  // Now User A's delayed signout finishes with an error
  resolveSignOut({ error: { message: 'User A late error' } });
  const slowRes = await slowSignOutPromise;

  assert.equal(slowRes.error?.message, 'Account changed during sign out.');
  assert.equal(coordinator.getState().user?.id, userB, 'User B must not be displaced');
  assert.equal(coordinator.getState().error, null, 'User B must not receive User A error');

  cleanup();
});
