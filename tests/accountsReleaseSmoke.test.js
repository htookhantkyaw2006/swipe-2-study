import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createServer } from 'vite';

// Storage mock for Node environment
const storageData = new Map();
const oldLocalStorage = globalThis.localStorage;
const oldSessionStorage = globalThis.sessionStorage;

globalThis.localStorage = {
  get length() { return storageData.size; },
  key: index => [...storageData.keys()][index] ?? null,
  getItem: key => storageData.get(key) ?? null,
  setItem: (key, value) => storageData.set(key, String(value)),
  removeItem: key => storageData.delete(key),
  clear: () => storageData.clear(),
};

const sessionMap = new Map();
globalThis.sessionStorage = {
  get length() { return sessionMap.size; },
  key: index => [...sessionMap.keys()][index] ?? null,
  getItem: key => sessionMap.get(key) ?? null,
  setItem: (key, value) => sessionMap.set(key, String(value)),
  removeItem: key => sessionMap.delete(key),
  clear: () => sessionMap.clear(),
};

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false, host: '127.0.0.1', watch: null },
});

after(async () => {
  await server.close();
  if (oldLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = oldLocalStorage;
  if (oldSessionStorage === undefined) delete globalThis.sessionStorage;
  else globalThis.sessionStorage = oldSessionStorage;
});

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

// ---------------------------------------------------------------------------
// 1. Unconfigured guest mode remains usable without backend calls
// ---------------------------------------------------------------------------
test('Smoke 1: Unconfigured guest mode remains usable without backend calls', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  let backendCalls = 0;
  const mockBackendClient = {
    auth: {
      getSession: async () => { backendCalls++; return { data: { session: null }, error: null }; },
      getUser: async () => { backendCalls++; return { data: { user: null }, error: null }; },
    },
  };

  const coordinator = createAuthCoordinator({
    authClient: mockBackendClient,
    isConfigured: false, // explicitly unconfigured
  });

  const snapshot = coordinator.getState();
  assert.equal(snapshot.isConfigured, false);
  assert.equal(snapshot.isGuest, true);
  assert.equal(snapshot.user, null);
  assert.equal(snapshot.loading, false);
  assert.equal(snapshot.ownerId, null);

  // Initializing an unconfigured coordinator should NOT make network/backend calls
  coordinator.initialize();
  assert.equal(backendCalls, 0, 'Unconfigured coordinator must never make backend calls');
});

// ---------------------------------------------------------------------------
// 2. Guest access to /profile/edit follows intended login/returnTo flow
// ---------------------------------------------------------------------------
test('Smoke 2: Guest access to /profile/edit follows intended login/returnTo flow', async () => {
  const { default: ProtectedRoute } = await server.ssrLoadModule('/src/components/ProtectedRoute.jsx');
  const { default: EditProfile } = await server.ssrLoadModule('/src/pages/EditProfile.jsx');
  const { AuthContext } = await server.ssrLoadModule('/src/lib/authContext.js');

  const guestAuthValue = {
    user: null,
    loading: false,
    isTransitioning: false,
    error: null,
    isGuest: true,
    isConfigured: true,
    captureGeneration: () => 0,
    isCurrent: () => true,
  };

  const html = renderToString(
    React.createElement(
      AuthContext.Provider,
      { value: guestAuthValue },
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/profile/edit'] },
        React.createElement(
          Routes,
          null,
          React.createElement(
            Route,
            {
              path: '/profile/edit',
              element: React.createElement(
                ProtectedRoute,
                null,
                React.createElement(EditProfile)
              ),
            }
          ),
          React.createElement(Route, { path: '/login', element: React.createElement('div', { id: 'login-destination' }, 'Login Page') })
        )
      )
    )
  );

  // In MemoryRouter SSR, ProtectedRoute and EditProfile gate account-only access
  // Neither the profile editor nor private inputs should be rendered in the HTML output
  assert.ok(!html.includes('Update profile'), 'Private profile form must not render for guest');
  assert.ok(!html.includes('Choose photo'), 'Avatar upload button must not render for guest');
});

// ---------------------------------------------------------------------------
// 3. Same-owner callback refresh completes; logout/account replacement cancels
// ---------------------------------------------------------------------------
test('Smoke 3: Same-owner callback refresh completes; logout/account replacement cancels stale navigation', async () => {
  const { getAuthCallbackState } = await server.ssrLoadModule('/src/lib/authCallbackState.js');

  // Control: valid code and user -> can navigate
  const stateValid = getAuthCallbackState({
    search: '?code=test-code&returnTo=%2Flibrary',
    user: { id: USER_A },
    loading: false,
    isTransitioning: false,
    callbackPending: false,
    callbackError: null,
  });
  assert.equal(stateValid.canNavigate, true);
  assert.equal(stateValid.error, null);

  // Logout during verification -> fails closed
  const stateLoggedOut = getAuthCallbackState({
    search: '?code=test-code&returnTo=%2Flibrary',
    user: null,
    loading: false,
    isTransitioning: false,
    callbackPending: false,
    callbackError: null,
  });
  assert.equal(stateLoggedOut.canNavigate, false, 'Must not navigate when user is logged out');

  // Account replacement / in-flight transition -> fails closed
  const stateTransitioning = getAuthCallbackState({
    search: '?code=test-code&returnTo=%2Flibrary',
    user: { id: USER_B },
    loading: false,
    isTransitioning: true,
    callbackPending: false,
    callbackError: null,
  });
  assert.equal(stateTransitioning.canNavigate, false, 'Must not navigate while account transition is in flight');
});

// ---------------------------------------------------------------------------
// 4. Fresh legitimate callback for different account is not blocked by stale s2s_callback_owner
// ---------------------------------------------------------------------------
test('Smoke 4: Fresh legitimate callback for different account is not blocked by stale s2s_callback_owner', async () => {
  // Pre-seed stale sessionStorage as left behind by an earlier failed/aborted attempt for USER_A
  sessionStorage.setItem('s2s_callback_owner', USER_A);
  sessionStorage.setItem('s2s_callback_attempt', '?code=old-code-a&returnTo=%2Fold-path');

  const { default: AuthCallback } = await server.ssrLoadModule('/src/pages/AuthCallback.jsx');
  const { AuthContext } = await server.ssrLoadModule('/src/lib/authContext.js');

  const userBAuthValue = {
    user: { id: USER_B },
    loading: false,
    isTransitioning: false,
    error: null,
    isGuest: false,
    isConfigured: true,
    captureGeneration: () => 1,
    isCurrent: (gen) => gen === 1,
  };

  const html = renderToString(
    React.createElement(
      AuthContext.Provider,
      { value: userBAuthValue },
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/auth/callback?code=fresh-code-b&returnTo=%2Flibrary'] },
        React.createElement(AuthCallback)
      )
    )
  );

  // Fresh callback must render the verifying state without immediately failing or blocking
  assert.ok(html.includes('auth-page'), 'Auth callback page renders');
  assert.ok(html.includes('Verifying your account…'), 'Shows verifying UI for User B');
  assert.ok(!html.includes('Verification issue'), 'Must NOT trigger an error issue heading for User B');

  // Stale sessionStorage from previous attempt must be cleared and bound to current attempt
  assert.equal(sessionStorage.getItem('s2s_callback_owner'), USER_B, 'Stored owner updated to active User B');
  assert.equal(sessionStorage.getItem('s2s_callback_attempt'), '?code=fresh-code-b&returnTo=%2Flibrary');
});

// ---------------------------------------------------------------------------
// 5. Local and global logout select guest ownership without exposing account caches
// ---------------------------------------------------------------------------
test('Smoke 5: Local and global logout select guest ownership without exposing account caches', async () => {
  const { createAuthCoordinator } = await server.ssrLoadModule('/src/lib/authCoordinator.js');
  let currentOwner = USER_A;
  const mockStorageOwner = {
    getOwner: () => currentOwner,
    setOwner: (id) => { currentOwner = id; },
  };

  let clientSignOutCalls = [];
  const mockAuthClient = {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getUser: async () => ({ data: { user: { id: USER_A } }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signOut: async ({ scope }) => {
        clientSignOutCalls.push(scope);
        return { error: null };
      },
    },
  };

  const coordinator = createAuthCoordinator({
    authClient: mockAuthClient,
    storageOwner: mockStorageOwner,
    isConfigured: true,
  });

  // Verify initial sign-in
  coordinator.initialize();
  await new Promise(resolve => setTimeout(resolve, 10));

  // 1. Local signOut
  const localResult = await coordinator.signOut();
  assert.equal(localResult.error, null);
  assert.equal(currentOwner, null, 'Storage owner must be reset to null (guest) on local signOut');
  assert.equal(coordinator.getState().isGuest, true);
  assert.equal(coordinator.getState().user, null);
  assert.equal(clientSignOutCalls.includes('local'), true);

  // 2. Global signOut
  currentOwner = USER_A;
  const globalResult = await coordinator.signOutGlobal();
  assert.equal(globalResult.error, null);
  assert.equal(currentOwner, null, 'Storage owner must be reset to null (guest) on global signOut');
  assert.equal(coordinator.getState().isGuest, true);
  assert.equal(coordinator.getState().user, null);
  assert.equal(clientSignOutCalls.includes('global'), true);
});

// ---------------------------------------------------------------------------
// 6. Deletion capability disabled stays unavailable
// ---------------------------------------------------------------------------
test('Smoke 6: Deletion capability disabled by default stays unavailable in UI and client service', async () => {
  const { isAccountDeletionEnabled } = await server.ssrLoadModule('/src/lib/accountDeletionGate.js');
  const { PreferencesProvider } = await server.ssrLoadModule('/src/lib/preferences.jsx');
  const { LanguageProvider } = await server.ssrLoadModule('/src/lib/language.jsx');
  const { GuestImportContext } = await server.ssrLoadModule('/src/lib/guestImportContext.js');
  const { default: Profile } = await server.ssrLoadModule('/src/pages/Profile.jsx');
  const { AuthContext } = await server.ssrLoadModule('/src/lib/authContext.js');

  // Capability flag must be false by default
  assert.equal(isAccountDeletionEnabled(), false, 'Deletion capability must be disabled by default');

  const verifiedAuthValue = {
    user: { id: USER_A, email: 'user-a@example.com' },
    loading: false,
    isTransitioning: false,
    error: null,
    isGuest: false,
    isConfigured: true,
    captureGeneration: () => 1,
    isCurrent: () => true,
  };

  const guestImportMock = {
    available: false,
    pending: false,
    checking: false,
    openGuestImport: () => {},
  };

  const html = renderToString(
    React.createElement(
      GuestImportContext.Provider,
      { value: guestImportMock },
      React.createElement(
        LanguageProvider,
        null,
        React.createElement(
          PreferencesProvider,
          null,
          React.createElement(
            AuthContext.Provider,
            { value: verifiedAuthValue },
            React.createElement(
              MemoryRouter,
              { initialEntries: ['/profile'] },
              React.createElement(Profile)
            )
          )
        )
      )
    )
  );

  // Actionable delete button must NOT be rendered when feature flag is off;
  // instead the placeholder "Available in a later update" with "Soon" is shown
  assert.ok(html.includes('Available in a later update'), 'Placeholder text shown when disabled');
  assert.ok(html.includes('Soon'), 'Soon badge shown when disabled');
  assert.ok(!html.includes('Permanently delete your account and data'), 'Actionable delete button copy must NOT render when capability is disabled');
});

// ---------------------------------------------------------------------------
// 7. Deletion authorization mismatch prevents HTTP dispatch
// ---------------------------------------------------------------------------
test('Smoke 7: Deletion authorization mismatch prevents HTTP dispatch', async () => {
  const { sendDeletionRequest } = await server.ssrLoadModule('/src/lib/accountDeletionClient.js');
  let httpCalls = 0;
  const mockFetch = async () => {
    httpCalls++;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const mockClient = {
    auth: {
      getSession: async () => ({
        data: {
          session: {
            access_token: 'valid-token-for-user-b',
            user: { id: USER_B }, // Account B active session
          },
        },
        error: null,
      }),
      getUser: async () => ({
        data: { user: { id: USER_B } },
        error: null,
      }),
    },
  };

  // Attempting to delete USER_A while active session belongs to USER_B
  const result = await sendDeletionRequest({
    initiatingUserId: USER_A,
    password: 'ValidPassword123!',
    client: mockClient,
    fetcher: mockFetch,
    supabaseUrl: 'https://mock.supabase.co',
    isCurrent: () => true,
  });

  assert.equal(result.status, 'error');
  assert.equal(result.code, 'OWNER_MISMATCH');
  assert.equal(httpCalls, 0, 'Zero HTTP requests must be dispatched when user ID does not match token');
});
