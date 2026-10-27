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

async function waitFor(condition, timeoutMs = 1500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (condition()) return;
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error('Condition timed out in test');
}

test('coordinator snapshot maintains reference stability across repeated reads and publishes on changes', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  let authListener;
  const userSnapUUID = '99999999-9999-4999-8999-999999999999';

  const mockAuthClient = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: { id: userSnapUUID } }, error: null }),
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

  // 1. Initial snapshot reference stability
  const snap1 = coordinator.getState();
  const snap2 = coordinator.getState();
  assert.equal(snap1, snap2, 'Repeated getState() calls must return identical snapshot reference');
  assert.ok(Object.isFrozen(snap1), 'Snapshot must be immutable');

  // 2. Initialize publishes new snapshot
  const cleanup = coordinator.initialize();
  const snapInit = coordinator.getState();
  assert.notEqual(snap1, snapInit, 'initialize() must publish a new snapshot');
  assert.equal(snapInit, coordinator.getState(), 'Snapshot reference stable while loading');

  await waitFor(() => !coordinator.getState().loading);
  const snapGuest = coordinator.getState();
  assert.equal(snapGuest.isGuest, true);
  assert.equal(snapGuest, coordinator.getState(), 'Snapshot reference stable in guest state');

  // 3. User sign-in event publishes new snapshot
  authListener('SIGNED_IN', { user: { id: userSnapUUID } });
  const snapTransition = coordinator.getState();
  assert.notEqual(snapGuest, snapTransition, 'Auth event must publish transition snapshot');
  assert.equal(snapTransition.isTransitioning, true);
  assert.equal(snapTransition, coordinator.getState(), 'Snapshot stable during transition');

  // Wait for getUser to complete
  await waitFor(() => !coordinator.getState().isTransitioning && coordinator.getState().user?.id === userSnapUUID);
  const snapVerified = coordinator.getState();
  assert.notEqual(snapTransition, snapVerified, 'Verified user must publish new snapshot');
  assert.equal(snapVerified.user?.id, userSnapUUID);
  assert.equal(snapVerified.isTransitioning, false);
  assert.equal(snapVerified, coordinator.getState(), 'Snapshot reference stable after verification');

  // 4. Logout publishes new snapshot
  await coordinator.signOut();
  const snapLoggedOut = coordinator.getState();
  assert.notEqual(snapVerified, snapLoggedOut, 'SignOut must publish new snapshot');
  assert.equal(snapLoggedOut.user, null);
  assert.equal(snapLoggedOut, coordinator.getState(), 'Snapshot reference stable after logout');

  cleanup();
});

test('delayed verification completing after initialize() cleanup does not modify state or storage ownership', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  let resolveGetUser;
  const getUserPromise = new Promise(resolve => { resolveGetUser = resolve; });
  const delayedUUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const mockAuthClient = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: delayedUUID } } },
        error: null,
      }),
      getUser: () => getUserPromise,
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
  // Wait a tick for getSession to resolve and call getUser
  await new Promise(r => setTimeout(r, 20));

  // Run cleanup while getUser is still pending
  cleanup();

  // Now resolve getUser
  resolveGetUser({ data: { user: { id: delayedUUID } }, error: null });
  await new Promise(r => setTimeout(r, 30));

  // Late response must not set storageOwner or user
  assert.equal(storageOwner.getOwner(), null, 'Storage owner must remain null after cleanup');
  assert.equal(coordinator.getState().user, null, 'User state must remain null');
});

test('supports React StrictMode initialize -> cleanup -> initialize without stale interference', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  let resolveUser1;
  const user1Promise = new Promise(resolve => { resolveUser1 = resolve; });
  let call1Started;
  const call1StartedPromise = new Promise(resolve => { call1Started = resolve; });
  let callCount = 0;
  const strictUUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const mockAuthClient = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: strictUUID } } },
        error: null,
      }),
      getUser: async () => {
        callCount += 1;
        if (callCount === 1) {
          call1Started();
          return user1Promise;
        }
        return { data: { user: { id: strictUUID, name: 'Fresh Strict User' } }, error: null };
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

  // StrictMode: Call 1 starts and initiates getUser
  const cleanup1 = coordinator.initialize();
  await call1StartedPromise;

  // StrictMode: Cleanup 1 invalidates call 1
  cleanup1();

  // StrictMode: Call 2 starts fresh
  const cleanup2 = coordinator.initialize();
  await waitFor(() => coordinator.getState().user?.name === 'Fresh Strict User');

  // Call 2 completes and verifies user
  assert.equal(storageOwner.getOwner(), strictUUID);
  assert.equal(coordinator.getState().user?.name, 'Fresh Strict User');

  // Call 1 now finally resolves late
  resolveUser1({ data: { user: { id: strictUUID, name: 'Stale First Call User' } }, error: null });
  await new Promise(r => setTimeout(r, 40));

  // Stale Call 1 must not overwrite Fresh Strict User
  assert.equal(coordinator.getState().user?.name, 'Fresh Strict User');
  assert.equal(storageOwner.getOwner(), strictUUID);

  cleanup2();
});

test('same-user Auth-event coordinates verification with getUser() instead of assigning session directly', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  let authListener;
  let getUserCount = 0;
  const sameUserUUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const verifiedServerUser = { id: sameUserUUID, user_metadata: { verified: 'by-server' } };

  const mockAuthClient = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: sameUserUUID, user_metadata: { verified: 'initial' } } } },
        error: null,
      }),
      getUser: async () => {
        getUserCount += 1;
        return { data: { user: verifiedServerUser }, error: null };
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

  const cleanup = coordinator.initialize();
  await waitFor(() => getUserCount === 1 && coordinator.getState().user?.user_metadata?.verified === 'by-server');

  assert.equal(getUserCount, 1);
  assert.equal(coordinator.getState().user?.user_metadata?.verified, 'by-server');

  // Trigger same-user USER_UPDATED event with untrusted raw session user
  const untrustedSessionUser = { id: sameUserUUID, user_metadata: { verified: 'tampered-in-client' } };
  authListener('USER_UPDATED', { user: untrustedSessionUser });

  // Immediately after synchronous callback, the untrusted user must NOT be applied directly
  assert.notEqual(
    coordinator.getState().user?.user_metadata?.verified,
    'tampered-in-client',
    'Shortcut must not directly assign untrusted session.user'
  );

  // Await the asynchronous verification
  await waitFor(() => getUserCount === 2);
  assert.equal(getUserCount, 2, 'getUser() must be called to verify same-user update');
  assert.equal(coordinator.getState().user?.user_metadata?.verified, 'by-server');

  cleanup();
});

test('AuthProvider gates rendering during loading and isTransitioning so mismatched cache never renders', async () => {
  const React = (await import('react')).default;
  const { renderToString } = await import('react-dom/server');
  const { AuthProvider } = await server.ssrLoadModule('/src/lib/auth.jsx');
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  let authListener;
  let resolveUserB;
  const userBPromise = new Promise(resolve => { resolveUserB = resolve; });
  const userBUUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  const mockAuthClient = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => userBPromise,
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

  const cleanup = coordinator.initialize();

  // Test Component that outputs secret private cache data
  function PrivateDashboard() {
    return React.createElement('div', { id: 'private-content' }, `CACHE_OWNER:${storageOwner.getOwner() ?? 'guest'}`);
  }

  // 1. During initial loading, AuthProvider must render spinner, NOT PrivateDashboard
  const loadingHtml = renderToString(
    React.createElement(AuthProvider, { coordinator }, React.createElement(PrivateDashboard))
  );
  assert.ok(loadingHtml.includes('auth-spinner'), 'Must render spinner during loading');
  assert.ok(!loadingHtml.includes('CACHE_OWNER'), 'Must not render private content while loading');

  // Let initial restoration finish (resolves to guest)
  await waitFor(() => !coordinator.getState().loading);

  // 2. Guest state renders safely
  const guestHtml = renderToString(
    React.createElement(AuthProvider, { coordinator }, React.createElement(PrivateDashboard))
  );
  assert.ok(guestHtml.includes('CACHE_OWNER:guest'), 'Renders guest content when verified guest');
  assert.ok(!guestHtml.includes('auth-spinner'));

  // 3. User B signs in, triggering transition
  authListener('SIGNED_IN', { user: { id: userBUUID } });
  assert.equal(coordinator.getState().isTransitioning, true);

  // During transition, AuthProvider MUST gate rendering with the spinner!
  const transitionHtml = renderToString(
    React.createElement(AuthProvider, { coordinator }, React.createElement(PrivateDashboard))
  );
  assert.ok(transitionHtml.includes('auth-spinner'), 'Must render spinner during account transition');
  assert.ok(!transitionHtml.includes('CACHE_OWNER'), 'Must NOT render private content during transition');

  // 4. User B verification completes
  resolveUserB({ data: { user: { id: userBUUID } }, error: null });
  await waitFor(() => !coordinator.getState().isTransitioning && storageOwner.getOwner() === userBUUID);

  assert.equal(coordinator.getState().isTransitioning, false);
  assert.equal(storageOwner.getOwner(), userBUUID);

  // Rendering resumes with verified user and owner agreeing
  const verifiedHtml = renderToString(
    React.createElement(AuthProvider, { coordinator }, React.createElement(PrivateDashboard))
  );
  assert.ok(verifiedHtml.includes(`CACHE_OWNER:${userBUUID}`), 'Renders private content once user and owner agree');
  assert.ok(!verifiedHtml.includes('auth-spinner'));

  cleanup();
});

async function recoveryCoordinatorFixture(verify) {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');
  let listener;
  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  const coordinator = createAuthCoordinator({ isConfigured: true, storageOwner, authClient: { auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: verify,
    onAuthStateChange: callback => { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    signOut: async () => ({ error: null }),
  } } });
  const cleanup = coordinator.initialize();
  await waitFor(() => !coordinator.getState().loading);
  return { coordinator, storageOwner, emit: (event, userId) => listener(event, userId ? { user: { id: userId } } : null), cleanup };
}

const recoveryId = '11111111-1111-4111-8111-111111111111';

test('PASSWORD_RECOVERY cannot authorize a reset until getUser verifies its account', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const fixture = await recoveryCoordinatorFixture(() => pending);
  try {
    fixture.emit('PASSWORD_RECOVERY', recoveryId);
    assert.equal(fixture.coordinator.canResetPassword(recoveryId), false);
    assert.equal(fixture.storageOwner.getOwner(), null);
    resolve({ data: { user: { id: recoveryId } }, error: null });
    await waitFor(() => fixture.coordinator.canResetPassword(recoveryId));
    assert.equal(fixture.coordinator.getState().passwordRecoveryUserId, recoveryId);
    assert.equal(fixture.storageOwner.getOwner(), recoveryId);
  } finally { fixture.cleanup(); }
});

test('INITIAL_SESSION following recovery does not lose the pending recovery account', async () => {
  const fixture = await recoveryCoordinatorFixture(async () => ({ data: { user: { id: recoveryId } }, error: null }));
  try {
    fixture.emit('PASSWORD_RECOVERY', recoveryId);
    fixture.emit('INITIAL_SESSION', recoveryId);
    await waitFor(() => fixture.coordinator.canResetPassword(recoveryId));
    assert.equal(fixture.coordinator.getState().user.id, recoveryId);
  } finally { fixture.cleanup(); }
});

test('ordinary sign-in does not create recovery authority and mismatched recovery verification fails closed', async () => {
  const fixture = await recoveryCoordinatorFixture(async () => ({ data: { user: { id: recoveryId } }, error: null }));
  try {
    fixture.emit('SIGNED_IN', recoveryId);
    await waitFor(() => fixture.coordinator.getState().user?.id === recoveryId);
    assert.equal(fixture.coordinator.canResetPassword(recoveryId), false);
    fixture.emit('PASSWORD_RECOVERY', '22222222-2222-4222-8222-222222222222');
    await waitFor(() => Boolean(fixture.coordinator.getState().error));
    assert.equal(fixture.coordinator.getState().user, null);
    assert.equal(fixture.coordinator.canResetPassword(recoveryId), false);
  } finally { fixture.cleanup(); }
});

test('recovery completion consumes only the current user grant and USER_UPDATED cannot restore it', async () => {
  let verifications = 0;
  const fixture = await recoveryCoordinatorFixture(async () => ({ data: { user: { id: recoveryId, name: `verified-${++verifications}` } }, error: null }));
  try {
    fixture.emit('PASSWORD_RECOVERY', recoveryId);
    await waitFor(() => fixture.coordinator.canResetPassword(recoveryId));
    assert.equal(fixture.coordinator.completePasswordRecovery('another-user'), false);
    assert.equal(fixture.coordinator.completePasswordRecovery(recoveryId), true);
    fixture.emit('USER_UPDATED', recoveryId);
    await waitFor(() => fixture.coordinator.getState().user?.name === 'verified-2');
    assert.equal(fixture.coordinator.canResetPassword(recoveryId), false);
    assert.equal(fixture.coordinator.completePasswordRecovery(recoveryId), false);
  } finally { fixture.cleanup(); }
});

test('sign-out clears recovery authority and discards a delayed recovery verification', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const fixture = await recoveryCoordinatorFixture(() => pending);
  try {
    fixture.emit('PASSWORD_RECOVERY', recoveryId);
    await fixture.coordinator.signOut();
    resolve({ data: { user: { id: recoveryId } }, error: null });
    await new Promise(done => setTimeout(done, 15));
    assert.equal(fixture.coordinator.getState().user, null);
    assert.equal(fixture.coordinator.getState().passwordRecoveryUserId, null);
    assert.equal(fixture.coordinator.canResetPassword(recoveryId), false);
  } finally { fixture.cleanup(); }
});


test('same-account refresh preserves recovery but switching to a different verified account clears it', async () => {
  let currentId = recoveryId;
  let verifications = 0;
  const fixture = await recoveryCoordinatorFixture(async () => ({ data: { user: { id: currentId, name: `verified-${++verifications}` } }, error: null }));
  try {
    fixture.emit('PASSWORD_RECOVERY', recoveryId);
    await waitFor(() => fixture.coordinator.canResetPassword(recoveryId));
    fixture.emit('TOKEN_REFRESHED', recoveryId);
    await waitFor(() => fixture.coordinator.getState().user?.name === 'verified-2');
    assert.equal(fixture.coordinator.canResetPassword(recoveryId), true);
    currentId = '22222222-2222-4222-8222-222222222222';
    fixture.emit('SIGNED_IN', currentId);
    assert.equal(fixture.coordinator.canResetPassword(recoveryId), false);
    await waitFor(() => fixture.coordinator.getState().user?.id === currentId);
    assert.equal(fixture.coordinator.canResetPassword(currentId), false);
    assert.equal(fixture.coordinator.completePasswordRecovery(recoveryId), false);
  } finally { fixture.cleanup(); }
});
