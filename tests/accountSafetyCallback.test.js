import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

// ws: false prevents Vite from starting its HMR WebSocket server, avoiding
// port 24678 conflicts when multiple Vite servers run in the same test process.
const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false, host: '127.0.0.1', watch: null },
});
after(() => server.close());

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

// ---------------------------------------------------------------------------
// 1. SSR & Component Rendering Guards
// ---------------------------------------------------------------------------
test('AuthCallback: renders pending verification state safely on initial mount', async () => {
  const { default: AuthCallback } = await server.ssrLoadModule('/src/pages/AuthCallback.jsx');
  const { AuthContext } = await server.ssrLoadModule('/src/lib/authContext.js');

  const authValue = {
    user: { id: USER_A },
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
      { value: authValue },
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/auth/callback?code=valid-code&returnTo=%2Flibrary'] },
        React.createElement(AuthCallback)
      )
    )
  );

  assert.ok(html.includes('auth-page'));
  assert.ok(html.includes('Verifying your account…'));
  assert.ok(!html.includes('Verification issue'));
});

test('AuthCallback: renders actionable error screen on verification issue', async () => {
  const { default: AuthCallback } = await server.ssrLoadModule('/src/pages/AuthCallback.jsx');
  const { AuthContext } = await server.ssrLoadModule('/src/lib/authContext.js');

  const authValue = {
    user: null,
    loading: false,
    isTransitioning: false,
    error: null,
    isGuest: true,
    isConfigured: true,
    captureGeneration: () => 1,
    isCurrent: (gen) => gen === 1,
  };

  const html = renderToString(
    React.createElement(
      AuthContext.Provider,
      { value: authValue },
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/auth/callback?error_code=otp_expired&returnTo=%2Flibrary'] },
        React.createElement(AuthCallback)
      )
    )
  );

  assert.ok(html.includes('auth-page'));
  assert.ok(html.includes('Verification issue'));
  assert.ok(html.includes('The verification link has expired'));
  assert.ok(html.includes('Go to Sign In'));
  assert.ok(html.includes('Resend verification email'));
  assert.ok(html.includes('Continue as Guest'));
});

// ---------------------------------------------------------------------------
// 2. Lifecycle State Machine & Effect Coordination Unit Tests
// ---------------------------------------------------------------------------
test('Lifecycle Guard: same-owner verification update (TOKEN_REFRESHED) keeps callback valid', async () => {
  const { getAuthCallbackState } = await server.ssrLoadModule('/src/lib/authCallbackState.js');

  // Initial user A before token refresh
  const userA = { id: USER_A, email: 'a@example.com' };
  const stateInitial = getAuthCallbackState({
    search: '?code=test-code&returnTo=%2Flibrary',
    user: userA,
    loading: false,
    isTransitioning: false,
    callbackPending: false,
    callbackError: null,
  });
  assert.equal(stateInitial.canNavigate, true);
  assert.equal(stateInitial.error, null);

  // Same user A after TOKEN_REFRESHED: user remains user A, transition finished
  const userARefreshed = { id: USER_A, email: 'a@example.com' };
  const stateRefreshed = getAuthCallbackState({
    search: '?code=test-code&returnTo=%2Flibrary',
    user: userARefreshed,
    loading: false,
    isTransitioning: false,
    callbackPending: false,
    callbackError: null,
  });
  assert.equal(stateRefreshed.canNavigate, true);
  assert.equal(stateRefreshed.error, null);
});

test('Lifecycle Guard: same-owner verification update (USER_UPDATED) keeps callback valid', async () => {
  const { getAuthCallbackState } = await server.ssrLoadModule('/src/lib/authCallbackState.js');

  // User A with updated profile metadata
  const userAUpdated = { id: USER_A, email: 'a@example.com', user_metadata: { name: 'New Name' } };
  const state = getAuthCallbackState({
    search: '?code=test-code&returnTo=%2Flibrary',
    user: userAUpdated,
    loading: false,
    isTransitioning: false,
    callbackPending: false,
    callbackError: null,
  });
  assert.equal(state.canNavigate, true);
  assert.equal(state.error, null);
});

test('Lifecycle Guard: logout during verification halts navigation (fail-closed)', async () => {
  const { getAuthCallbackState } = await server.ssrLoadModule('/src/lib/authCallbackState.js');

  // Logged out / guest state
  const state = getAuthCallbackState({
    search: '?code=test-code&returnTo=%2Flibrary',
    user: null,
    loading: false,
    isTransitioning: false,
    callbackPending: false,
    callbackError: null,
  });
  assert.equal(state.canNavigate, false, 'Logged out state cannot navigate');
});

test('Lifecycle Guard: active account transition halts navigation', async () => {
  const { getAuthCallbackState } = await server.ssrLoadModule('/src/lib/authCallbackState.js');

  // In-flight transition between accounts
  const state = getAuthCallbackState({
    search: '?code=test-code&returnTo=%2Flibrary',
    user: { id: USER_B },
    loading: false,
    isTransitioning: true, // Account transition in flight
    callbackPending: false,
    callbackError: null,
  });
  assert.equal(state.canNavigate, false, 'In-flight transition cannot navigate');
});

// ---------------------------------------------------------------------------
// 3. Real Browser React 19 Effect Execution & Navigation Verification
// ---------------------------------------------------------------------------
test('Real Browser: mounted AuthCallback effect lifecycle survives same-owner refresh and fails closed on switch/logout', async () => {
  const { runBrowserAccountSafetyVerification } = await import('./runBrowserAccountSafety.mjs');
  const outcome = await runBrowserAccountSafetyVerification();

  if (outcome.skipped) {
    // Honestly report skipped if host does not have Chrome/Edge
    assert.ok(outcome.reason, 'Skipped reason must be documented');
    console.warn('[REAL BROWSER CHECK SKIPPED]:', outcome.reason);
  } else {
    assert.equal(outcome.passed, true);
    assert.ok(Array.isArray(outcome.results));

    // 1. Control (no refresh) reaches destination
    const control = outcome.results.find((r) => r.test === 'successful-control-no-refresh');
    assert.ok(control, 'successful-control-no-refresh must be tested');
    assert.equal(control.passed, true);
    assert.equal(control.path, '/library');

    // 2. Same-owner TOKEN_REFRESHED survives and navigates
    const tokenRefresh = outcome.results.find((r) => r.test === 'same-owner-token-refreshed');
    assert.ok(tokenRefresh, 'same-owner-token-refreshed must be tested');
    assert.equal(tokenRefresh.passed, true);
    assert.equal(tokenRefresh.path, '/library');

    // 3. Same-owner USER_UPDATED survives and navigates
    const userUpdate = outcome.results.find((r) => r.test === 'same-owner-user-updated');
    assert.ok(userUpdate, 'same-owner-user-updated must be tested');
    assert.equal(userUpdate.passed, true);
    assert.equal(userUpdate.path, '/library');

    // 4. Initialization failure renders visible error and does not navigate
    const initFail = outcome.results.find((r) => r.test === 'initialization-failure-visible');
    assert.ok(initFail, 'initialization-failure-visible must be tested');
    assert.equal(initFail.passed, true);

    // 5. Logout during verification fails closed (no navigation)
    const logout = outcome.results.find((r) => r.test === 'logout-during-verification-fail-closed');
    assert.ok(logout, 'logout-during-verification-fail-closed must be tested');
    assert.equal(logout.passed, true);

    // 6. Account replacement does not redirect User B to User A returnTo
    const replacement = outcome.results.find((r) => r.test === 'account-replacement-fail-closed');
    assert.ok(replacement, 'account-replacement-fail-closed must be tested');
    assert.equal(replacement.passed, true);

    // 7. Unmount while pending cleanly aborts
    const unmount = outcome.results.find((r) => r.test === 'unmount-while-pending-clean');
    assert.ok(unmount, 'unmount-while-pending-clean must be tested');
    assert.equal(unmount.passed, true);

    // 8. Fresh legitimate callback for different account is not blocked by stale sessionStorage
    const freshCallback = outcome.results.find((r) => r.test === 'fresh-callback-not-blocked-by-stale-session-storage');
    assert.ok(freshCallback, 'fresh-callback-not-blocked-by-stale-session-storage must be tested');
    assert.equal(freshCallback.passed, true);
    assert.equal(freshCallback.path, '/library');
  }
});
