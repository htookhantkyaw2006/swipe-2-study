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
  server: { middlewareMode: true, hmr: false, host: '127.0.0.1', watch: null },
});

after(async () => {
  await server.close();
  if (oldStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = oldStorage;
});

test('safeReturnPath rejects control characters, backslashes, external origins, and protocol-relative URLs', async () => {
  const { safeReturnPath } = await server.ssrLoadModule('/src/lib/safeReturnPath.js');

  // Valid internal paths
  assert.equal(safeReturnPath('/'), '/');
  assert.equal(safeReturnPath('/profile'), '/profile');
  assert.equal(safeReturnPath('/learn/review'), '/learn/review');
  assert.equal(safeReturnPath('/flashcards/level/1?course=zh'), '/flashcards/level/1?course=zh');
  assert.equal(safeReturnPath('  /settings  '), '/settings');

  // Control characters (CR, LF, TAB, NULL, DEL) - must reject
  assert.equal(safeReturnPath('/\t/evil.example'), '/');
  assert.equal(safeReturnPath('/evil\npath'), '/');
  assert.equal(safeReturnPath('/evil\rpath'), '/');
  assert.equal(safeReturnPath('/evil\x00path'), '/');
  assert.equal(safeReturnPath('/evil\x1fpath'), '/');
  assert.equal(safeReturnPath('/evil\x7fpath'), '/');

  // Open redirect attempts & invalid inputs
  assert.equal(safeReturnPath('https://evil.com'), '/');
  assert.equal(safeReturnPath('http://attacker.org/login'), '/');
  assert.equal(safeReturnPath('//malicious.com'), '/');
  assert.equal(safeReturnPath('//malicious.com/path'), '/');
  assert.equal(safeReturnPath('///malicious.com'), '/');
  assert.equal(safeReturnPath('/\\evil.com'), '/');
  assert.equal(safeReturnPath('/evil\\path'), '/');
  assert.equal(safeReturnPath('javascript:alert(1)'), '/');
  assert.equal(safeReturnPath('data:text/html,<script>alert(1)</script>'), '/');
  assert.equal(safeReturnPath(''), '/');
  assert.equal(safeReturnPath('   '), '/');
  assert.equal(safeReturnPath(null), '/');
  assert.equal(safeReturnPath(undefined), '/');
  assert.equal(safeReturnPath(123), '/');
  assert.equal(safeReturnPath({ evil: true }), '/');
});

test('displayName and initialsOf helpers never fabricate an identity or return empty strings', async () => {
  const { displayName, initialsOf } = await server.ssrLoadModule('/src/lib/profile.js');

  // Priority 1: Profile row display_name
  assert.equal(
    displayName({ display_name: 'Custom Name' }, { email: 'test@example.com' }),
    'Custom Name'
  );

  // Priority 2: User metadata display_name
  assert.equal(
    displayName(null, { user_metadata: { display_name: 'Meta Name' }, email: 'test@example.com' }),
    'Meta Name'
  );

  // Priority 3: User metadata full_name
  assert.equal(
    displayName(null, { user_metadata: { full_name: 'Full Name' }, email: 'test@example.com' }),
    'Full Name'
  );

  // Priority 4: Email prefix
  assert.equal(
    displayName(null, { email: 'alice.learner@example.com' }),
    'alice.learner'
  );

  // Fallback: Learner (never a fabricated persona like "Htoo Khant Kyaw")
  assert.equal(displayName(null, null), 'Learner');
  assert.equal(displayName({}, {}), 'Learner');

  // Initials
  assert.equal(initialsOf('Alice Smith'), 'AS');
  assert.equal(initialsOf('Htoo Khant Kyaw'), 'HK');
  assert.equal(initialsOf('Learner'), 'LE');
  assert.equal(initialsOf('A'), 'A');
  assert.equal(initialsOf(''), '?');
  assert.equal(initialsOf(null), '?');
});

test('AuthCoordinator verifies session with getUser() before selecting private cache', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  const userUUID = '11111111-2222-4333-8444-555555555555';
  let getUserCalls = 0;

  const mockAuthClient = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: userUUID, email: 'user@example.com' } } },
        error: null,
      }),
      getUser: async () => {
        getUserCalls += 1;
        return { data: { user: { id: userUUID, email: 'user@example.com' } }, error: null };
      },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => ({ error: null }),
    },
  };

  const coordinator = createAuthCoordinator({
    authClient: mockAuthClient,
    storageOwner,
    isConfigured: true,
  });

  const cleanup = coordinator.initialize();
  // Wait for initial verification promises to settle
  await new Promise(r => setTimeout(r, 20));

  assert.equal(getUserCalls, 1, 'getUser() must be called to verify session');
  assert.equal(storageOwner.getOwner(), userUUID, 'storageOwner must be selected only after verification');
  assert.equal(coordinator.getState().user?.id, userUUID);
  assert.equal(coordinator.getState().loading, false);
  assert.equal(coordinator.getState().error, null);

  cleanup();
});

test('delayed restoration after logout is discarded and does not reactivate account', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  const userUUID = '11111111-2222-4333-8444-555555555555';

  let resolveGetSession;
  const deferredSession = new Promise(resolve => { resolveGetSession = resolve; });

  const mockAuthClient = {
    auth: {
      getSession: () => deferredSession,
      getUser: async () => ({ data: { user: { id: userUUID } }, error: null }),
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
  assert.equal(coordinator.getState().loading, true);

  // User logs out before session restoration completes
  await coordinator.signOut();
  assert.equal(storageOwner.getOwner(), null);
  assert.equal(coordinator.getState().user, null);

  // Now the slow getSession resolves with user credentials
  resolveGetSession({
    data: { session: { user: { id: userUUID } } },
    error: null,
  });
  await new Promise(r => setTimeout(r, 20));

  // The late response must be discarded: owner must remain null, user null
  assert.equal(storageOwner.getOwner(), null, 'Storage owner must remain null after delayed restoration');
  assert.equal(coordinator.getState().user, null, 'User state must remain null');
});

test('Account A verification completing after Account B signs in is discarded', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  const userA = '11111111-1111-4111-8111-111111111111';
  const userB = '22222222-2222-4222-8222-222222222222';

  let authListener;
  let resolveUserA;
  const userAPromise = new Promise(resolve => { resolveUserA = resolve; });
  let activeUserToReturn = 'A';

  const mockAuthClient = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => {
        if (activeUserToReturn === 'A') {
          return userAPromise;
        }
        return { data: { user: { id: userB } }, error: null };
      },
      onAuthStateChange: (cb) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signOut: async () => ({ error: null }),
    },
  };

  const coordinator = createAuthCoordinator({
    authClient: mockAuthClient,
    storageOwner,
    isConfigured: true,
  });

  coordinator.initialize();
  await new Promise(r => setTimeout(r, 10));

  // 1. User A triggers SIGNED_IN event (verification started with pending userAPromise)
  activeUserToReturn = 'A';
  authListener('SIGNED_IN', { user: { id: userA } });
  // Await a tick for the microtask to call getUser()
  await new Promise(r => setTimeout(r, 5));
  assert.equal(coordinator.getState().isTransitioning, true);

  // 2. User B signs in before User A resolves
  activeUserToReturn = 'B';
  authListener('SIGNED_IN', { user: { id: userB } });
  await new Promise(r => setTimeout(r, 20));

  assert.equal(storageOwner.getOwner(), userB, 'User B must be active owner');
  assert.equal(coordinator.getState().user?.id, userB);

  // 3. User A's slow verification finally resolves
  resolveUserA({ data: { user: { id: userA } }, error: null });
  await new Promise(r => setTimeout(r, 20));

  // User A's result must be discarded: User B must remain current
  assert.equal(storageOwner.getOwner(), userB, 'Late User A response must not overwrite User B cache');
  assert.equal(coordinator.getState().user?.id, userB);
});

test('verification failure resets to guest, surfaces actionable error, and supports retry', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  let returnSuccess = false;

  const mockAuthClient = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: '33333333-3333-4333-8333-333333333333' } } },
        error: null,
      }),
      getUser: async () => {
        if (!returnSuccess) {
          return { data: { user: null }, error: { message: 'Token expired' } };
        }
        return { data: { user: { id: '33333333-3333-4333-8333-333333333333' } }, error: null };
      },
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
  await new Promise(r => setTimeout(r, 20));

  assert.equal(storageOwner.getOwner(), null, 'Failed verification must stay on guest cache');
  assert.equal(coordinator.getState().user, null);
  assert.equal(coordinator.getState().error, 'Token expired');
  assert.equal(coordinator.getState().isGuest, true);

  // Retry verification after recovery
  returnSuccess = true;
  await coordinator.retryVerification();

  assert.equal(storageOwner.getOwner(), '33333333-3333-4333-8333-333333333333');
  assert.equal(coordinator.getState().error, null);
  assert.equal(coordinator.getState().isGuest, false);
});

test('signOut explicitly calls scope local and surfaces returned errors without reactivating account', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  let signOutOptions = null;

  const mockAuthClient = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async (opts) => {
        signOutOptions = opts;
        return { error: { message: 'Network offline during logout' } };
      },
    },
  };

  const coordinator = createAuthCoordinator({
    authClient: mockAuthClient,
    storageOwner,
    isConfigured: true,
  });

  // Manually set owner to verify logout clears it
  storageOwner.setOwner('44444444-4444-4444-8444-444444444444');

  const res = await coordinator.signOut();

  assert.deepEqual(signOutOptions, { scope: 'local' }, 'signOut must pass { scope: "local" }');
  assert.ok(res.error, 'signOut must return the error');
  assert.equal(coordinator.getState().error, 'Network offline during logout');
  assert.equal(storageOwner.getOwner(), null, 'Storage owner must still be reset to null even if logout failed');
  assert.equal(coordinator.getState().user, null, 'User must remain null');
});

test('local logout preserves genuine guest cache and user caches in device storage', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { storageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');
  const { db } = await server.ssrLoadModule('/src/lib/db.js');

  const userA = '11111111-2222-4333-8444-555555555555';
  let authListener;

  const mockAuthClient = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: { id: userA } }, error: null }),
      onAuthStateChange: (cb) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signOut: async () => ({ error: null }),
    },
  };

  const coordinator = createAuthCoordinator({
    authClient: mockAuthClient,
    storageOwner,
    isConfigured: true,
  });

  coordinator.initialize();
  await new Promise(r => setTimeout(r, 10));

  // 1. Guest saves a card
  storageOwner.setOwner(null);
  db.insert('saved_words', { id: 'guest-card', phrase: 'guest-phrase' });
  assert.equal(db.get('saved_words')[0].phrase, 'guest-phrase');

  // 2. User A signs in
  authListener('SIGNED_IN', { user: { id: userA } });
  await new Promise(r => setTimeout(r, 20));

  assert.equal(storageOwner.getOwner(), userA);
  assert.deepEqual(db.get('saved_words'), []); // User cache empty
  db.insert('saved_words', { id: 'user-a-card', phrase: 'user-a-phrase' });
  assert.equal(db.get('saved_words')[0].phrase, 'user-a-phrase');

  // 3. User A logs out
  await coordinator.signOut();
  assert.equal(storageOwner.getOwner(), null);

  // Guest card in storage must remain 100% intact
  assert.equal(db.get('saved_words')[0].phrase, 'guest-phrase');

  // User A's card in storage must also remain intact
  storageOwner.setOwner(userA);
  assert.equal(db.get('saved_words')[0].phrase, 'user-a-phrase');

  // Cleanup
  storageOwner.setOwner(null);
});
