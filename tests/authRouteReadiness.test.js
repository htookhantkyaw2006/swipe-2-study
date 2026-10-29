import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Navigate } from 'react-router-dom';
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

async function renderWithAuth(element, { user = null, loading = false, isTransitioning = false, error = null, isConfigured = true } = {}, initialEntry = '/') {
  const { AuthContext } = await server.ssrLoadModule('/src/lib/authContext.js');
  const authValue = {
    user,
    loading,
    isTransitioning,
    error,
    isGuest: !user && !loading && !isTransitioning,
    isConfigured,
    clearError: () => {},
    retryVerification: () => {},
    signOut: async () => ({ error: null }),
    signOutGlobal: async () => ({ error: null }),
    canResetPassword: () => false,
    completePasswordRecovery: () => false,
    passwordRecoveryUserId: null,
    captureGeneration: () => 0,
    isCurrent: () => true,
    generation: 0,
  };

  return renderToString(
    React.createElement(
      AuthContext.Provider,
      { value: authValue },
      React.createElement(MemoryRouter, { initialEntries: [initialEntry] }, element)
    )
  );
}

// ---------------------------------------------------------------------------
// 1. Loading Before Account-Only Content (No render while identity unresolved)
// ---------------------------------------------------------------------------
test('ProtectedRoute and EditProfile render neutral loading state and gate account-only content while auth loading or transitioning', async () => {
  const { default: ProtectedRoute } = await server.ssrLoadModule('/src/components/ProtectedRoute.jsx');
  const { default: EditProfile } = await server.ssrLoadModule('/src/pages/EditProfile.jsx');

  const secretChild = React.createElement('div', { id: 'secret-account-data' }, 'SECRET_ACCOUNT_DATA');

  // Test ProtectedRoute during auth loading
  const prLoadingHtml = await renderWithAuth(
    React.createElement(ProtectedRoute, null, secretChild),
    { loading: true, user: null },
    '/profile/edit'
  );
  assert.ok(prLoadingHtml.includes('Connecting your account…'), 'Must show connecting notice while loading');
  assert.ok(prLoadingHtml.includes('auth-spinner'), 'Must show auth-spinner');
  assert.ok(!prLoadingHtml.includes('SECRET_ACCOUNT_DATA'), 'Must not leak account content while loading');

  // Test ProtectedRoute during account transition
  const prTransitionHtml = await renderWithAuth(
    React.createElement(ProtectedRoute, null, secretChild),
    { isTransitioning: true, user: { id: 'user-b' } },
    '/profile/edit'
  );
  assert.ok(prTransitionHtml.includes('Connecting your account…'), 'Must show connecting notice while transitioning');
  assert.ok(!prTransitionHtml.includes('SECRET_ACCOUNT_DATA'), 'Must not leak account content while transitioning');

  // Test EditProfile directly during auth loading
  const epLoadingHtml = await renderWithAuth(
    React.createElement(EditProfile),
    { loading: true, user: null },
    '/profile/edit'
  );
  assert.ok(epLoadingHtml.includes('Connecting your account…'), 'EditProfile must show connecting notice while loading');
  assert.ok(!epLoadingHtml.includes('Your details'), 'EditProfile must not render editor fields while loading');
  assert.ok(!epLoadingHtml.includes('Choose photo'), 'EditProfile must not render photo buttons while loading');

  // Test EditProfile directly during account transition
  const epTransitionHtml = await renderWithAuth(
    React.createElement(EditProfile),
    { isTransitioning: true, user: { id: 'user-b' } },
    '/profile/edit'
  );
  assert.ok(epTransitionHtml.includes('Connecting your account…'), 'EditProfile must show connecting notice while transitioning');
  assert.ok(!epTransitionHtml.includes('Your details'), 'EditProfile must not render editor fields while transitioning');
});

// ---------------------------------------------------------------------------
// 2. Guest Redirected to Login and Safely Returned
// ---------------------------------------------------------------------------
test('unauthenticated guest is redirected to login with preserved returnTo and safely returned on sign-in', async () => {
  const { default: ProtectedRoute } = await server.ssrLoadModule('/src/components/ProtectedRoute.jsx');
  const { default: EditProfile } = await server.ssrLoadModule('/src/pages/EditProfile.jsx');
  const { default: Login } = await server.ssrLoadModule('/src/pages/Login.jsx');

  // A) Guest on /profile/edit: ProtectedRoute and EditProfile return <Navigate to="/login?returnTo=%2Fprofile%2Fedit" replace />
  let interceptedProtectedNav = null;
  function ProtectedRouteSpy() {
    interceptedProtectedNav = ProtectedRoute({
      children: React.createElement('div', null, 'ACCOUNT_ONLY_SECRET'),
    });
    return interceptedProtectedNav;
  }

  let interceptedEditProfileNav = null;
  function EditProfileSpy() {
    interceptedEditProfileNav = EditProfile();
    return interceptedEditProfileNav;
  }

  await renderWithAuth(
    React.createElement(ProtectedRouteSpy),
    { user: null, loading: false, isTransitioning: false },
    '/profile/edit'
  );
  assert.ok(interceptedProtectedNav, 'ProtectedRoute must return an element for guest');
  assert.equal(interceptedProtectedNav.type, Navigate, 'ProtectedRoute must return a Navigate component');
  assert.equal(interceptedProtectedNav.props.to, '/login?returnTo=%2Fprofile%2Fedit', 'Must navigate to /login with encoded returnTo');
  assert.equal(interceptedProtectedNav.props.replace, true, 'Must replace navigation history');

  await renderWithAuth(
    React.createElement(EditProfileSpy),
    { user: null, loading: false, isTransitioning: false },
    '/profile/edit'
  );
  assert.ok(interceptedEditProfileNav, 'EditProfile must return an element for guest');
  assert.equal(interceptedEditProfileNav.type, Navigate, 'EditProfile must return a Navigate component');
  assert.equal(interceptedEditProfileNav.props.to, '/login?returnTo=%2Fprofile%2Fedit', 'Must navigate to /login with encoded returnTo');
  assert.equal(interceptedEditProfileNav.props.replace, true, 'Must replace navigation history');

  // B) Login page reads returnTo query param and preserves it
  const loginHtml = await renderWithAuth(
    React.createElement(Login),
    { user: null, loading: false },
    '/login?returnTo=%2Fprofile%2Fedit'
  );
  assert.ok(loginHtml.includes('Welcome back'), 'Renders login form for guest');
  assert.ok(loginHtml.includes('/signup?returnTo=%2Fprofile%2Fedit'), 'Preserves returnTo in signup link');
  assert.ok(loginHtml.includes('/forgot-password?returnTo=%2Fprofile%2Fedit'), 'Preserves returnTo in forgot password link');

  // C) Verified user on /profile/edit renders ProfileEditor without redirect
  const user = { id: 'verified-user-123', email: 'verified@example.com' };
  const verifiedUserHtml = await renderWithAuth(
    React.createElement(ProtectedRoute, null, React.createElement(EditProfile)),
    { user, loading: false, isTransitioning: false },
    '/profile/edit'
  );
  assert.ok(verifiedUserHtml.includes('Edit profile'), 'Renders header for verified user');
  assert.ok(!verifiedUserHtml.includes('Connecting your account…'), 'Not loading');
});

// ---------------------------------------------------------------------------
// 3. Malicious returnTo Rejected (Open Redirect & Protocol-Relative Evasions)
// ---------------------------------------------------------------------------
test('safeReturnPath strictly rejects external URLs, protocol-relative attacks, encoded evasions, and control characters', async () => {
  const { safeReturnPath } = await server.ssrLoadModule('/src/lib/safeReturnPath.js');

  const maliciousInputs = [
    'https://attacker.example.com',
    'http://attacker.example.com/steal-session',
    '//attacker.example.com',
    '//attacker.example.com/path',
    '///attacker.example.com',
    '/\\attacker.example.com',
    '/attacker.example.com\\malicious',
    '/%5cattacker.example.com',
    '/%5Cattacker.example.com',
    '/%2f/attacker.example.com',
    '/%2F%2Fattacker.example.com',
    'javascript:alert(document.cookie)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r/evil.example',
    '/%00/evil.example',
    '/%09/evil.example',
    '/%0a/evil.example',
    '/%0d/evil.example',
    '/%zz/invalid',
    '%E0%A4%A',
  ];

  for (const input of maliciousInputs) {
    const result = safeReturnPath(input);
    assert.equal(result, '/', `Malicious input "${input}" must be rejected to "/" but got "${result}"`);
  }

  // Safe internal paths must be preserved
  assert.equal(safeReturnPath('/'), '/');
  assert.equal(safeReturnPath('/profile'), '/profile');
  assert.equal(safeReturnPath('/profile/edit'), '/profile/edit');
  assert.equal(safeReturnPath('/library?sort=alphabetical'), '/library?sort=alphabetical');
  assert.equal(safeReturnPath('/saved#favorites'), '/saved#favorites');
});

// ---------------------------------------------------------------------------
// 4. Verification Failure Without Redirect Loop
// ---------------------------------------------------------------------------
test('auth and recovery routes are rejected as returnTo targets to prevent cyclic loops', async () => {
  const { safeReturnPath } = await server.ssrLoadModule('/src/lib/safeReturnPath.js');

  const authLoopPaths = [
    '/login',
    '/LOGIN',
    '/login/',
    '/login?returnTo=%2Fprofile',
    '/signup',
    '/SIGNUP',
    '/signup?returnTo=%2Fsaved',
    '/auth/callback',
    '/auth/callback?code=test-code',
    '/verify-email',
    '/verify-email?email=test%40example.com',
    '/forgot-password',
    '/reset-password',
    '/reset-password?token=xyz',
  ];

  for (const loopPath of authLoopPaths) {
    const result = safeReturnPath(loopPath);
    assert.equal(result, '/', `Auth loop path "${loopPath}" must resolve to "/" to prevent redirect loops`);
  }

  // With a custom non-auth fallback
  assert.equal(safeReturnPath('/login', '/profile'), '/profile');
  assert.equal(safeReturnPath('/auth/callback', '/library'), '/library');

  // If the fallback itself is an auth route, it must fall back to "/"
  assert.equal(safeReturnPath('/login', '/signup'), '/');
  assert.equal(safeReturnPath('/login', '/login'), '/');
});

// ---------------------------------------------------------------------------
// 5. Account Switch Without Stale Private Content Flash
// ---------------------------------------------------------------------------
test('account switch immediately engages transition gate so Account A data never renders for Account B', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');
  const { AuthProvider } = await server.ssrLoadModule('/src/lib/auth.jsx');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  let authListener;
  let resolveUserB;
  const userBPromise = new Promise(resolve => { resolveUserB = resolve; });
  const userA_UUID = '11111111-aaaa-4111-8111-111111111111';
  const userB_UUID = '22222222-bbbb-4222-8222-222222222222';

  let getUserTarget = 'A';
  const mockAuthClient = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: userA_UUID, email: 'usera@example.com' } } },
        error: null,
      }),
      getUser: async () => {
        if (getUserTarget === 'A') {
          return { data: { user: { id: userA_UUID, email: 'usera@example.com' } }, error: null };
        }
        return userBPromise;
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
  // Wait for initial session verification for User A
  await new Promise(r => setTimeout(r, 25));
  assert.equal(coordinator.getState().user?.id, userA_UUID);
  assert.equal(storageOwner.getOwner(), userA_UUID);

  function DisplayOwner() {
    return React.createElement('div', { id: 'rendered-owner' }, `OWNER:${storageOwner.getOwner() ?? 'guest'}`);
  }

  // User A renders
  const userAHtml = renderToString(
    React.createElement(AuthProvider, { coordinator }, React.createElement(DisplayOwner))
  );
  assert.ok(userAHtml.includes(`OWNER:${userA_UUID}`), 'User A content renders');

  // Account switch: User B triggers SIGNED_IN event while getUser for User B is pending
  getUserTarget = 'B';
  authListener('SIGNED_IN', { user: { id: userB_UUID } });
  assert.equal(coordinator.getState().isTransitioning, true);

  // During transition, AuthProvider MUST render the neutral spinner, NEVER User A's data
  const switchTransitionHtml = renderToString(
    React.createElement(AuthProvider, { coordinator }, React.createElement(DisplayOwner))
  );
  assert.ok(switchTransitionHtml.includes('auth-spinner'), 'Must render spinner during account switch');
  assert.ok(!switchTransitionHtml.includes(`OWNER:${userA_UUID}`), 'Account A data MUST NOT flash during transition');
  assert.ok(!switchTransitionHtml.includes('OWNER:'), 'No owner content rendered while transition is active');

  // User B verification settles
  resolveUserB({ data: { user: { id: userB_UUID, email: 'userb@example.com' } }, error: null });
  await new Promise(r => setTimeout(r, 25));
  assert.equal(coordinator.getState().isTransitioning, false);
  assert.equal(coordinator.getState().user?.id, userB_UUID);
  assert.equal(storageOwner.getOwner(), userB_UUID);

  // User B renders
  const userBHtml = renderToString(
    React.createElement(AuthProvider, { coordinator }, React.createElement(DisplayOwner))
  );
  assert.ok(userBHtml.includes(`OWNER:${userB_UUID}`), 'User B content renders when verified');
  assert.ok(!userBHtml.includes(`OWNER:${userA_UUID}`));

  // Logout immediately returns to guest storage without stale flash
  await coordinator.signOut();
  assert.equal(storageOwner.getOwner(), null);
  assert.equal(coordinator.getState().user, null);

  const guestHtml = renderToString(
    React.createElement(AuthProvider, { coordinator }, React.createElement(DisplayOwner))
  );
  assert.ok(guestHtml.includes('OWNER:guest'), 'Guest content renders after logout');
  assert.ok(!guestHtml.includes(`OWNER:${userB_UUID}`));

  cleanup();
});

// ---------------------------------------------------------------------------
// 6. Unconfigured Guest Learning Usability
// ---------------------------------------------------------------------------
test('unconfigured backend operates gracefully in guest mode without errors', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  const { createStorageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');
  const { default: Login } = await server.ssrLoadModule('/src/pages/Login.jsx');
  const { default: Signup } = await server.ssrLoadModule('/src/pages/Signup.jsx');
  const { default: ForgotPassword } = await server.ssrLoadModule('/src/pages/ForgotPassword.jsx');

  const storageOwner = createStorageOwner({ storage: () => globalThis.localStorage });
  const coordinator = createAuthCoordinator({
    storageOwner,
    isConfigured: false,
  });

  const cleanup = coordinator.initialize();
  const state = coordinator.getState();

  assert.equal(state.isConfigured, false);
  assert.equal(state.isGuest, true);
  assert.equal(state.loading, false);
  assert.equal(state.user, null);
  assert.equal(state.error, null);

  // Login page clearly informs guest that backend is unconfigured
  const loginHtml = await renderWithAuth(
    React.createElement(Login),
    { isConfigured: false, user: null, loading: false }
  );
  assert.ok(loginHtml.includes('Backend is not configured'), 'Login shows unconfigured notice');
  assert.ok(loginHtml.includes('guest mode'), 'Mentions guest mode');
  assert.ok(loginHtml.includes('Back to Home'), 'Provides Back to Home button');

  // Signup page clearly informs guest that backend is unconfigured
  const signupHtml = await renderWithAuth(
    React.createElement(Signup),
    { isConfigured: false, user: null, loading: false }
  );
  assert.ok(signupHtml.includes('Backend is not configured'), 'Signup shows unconfigured notice');
  assert.ok(signupHtml.includes('Back to Home'));

  // Forgot password clearly informs guest that recovery is unavailable
  const forgotHtml = await renderWithAuth(
    React.createElement(ForgotPassword),
    { isConfigured: false, user: null, loading: false }
  );
  assert.ok(forgotHtml.includes('Password recovery is unavailable'), 'Forgot password shows unconfigured notice');
  assert.ok(forgotHtml.includes('Back to Home'));

  cleanup();
});
