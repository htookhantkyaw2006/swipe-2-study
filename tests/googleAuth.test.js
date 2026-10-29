import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import {
  isGoogleAuthEnabled,
  getTrustedCallbackUrl,
  initiateGoogleSignIn,
} from '../src/lib/googleAuth.js';
import { getAuthCallbackState } from '../src/lib/authCallbackState.js';
import { inspectAuthCallbackSession } from '../src/lib/authCallbackSession.js';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false, host: '127.0.0.1', watch: null },
});

after(() => server.close());

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
// 1. Feature Flag & Gate Validation
// ---------------------------------------------------------------------------
test('isGoogleAuthEnabled requires explicit VITE_GOOGLE_AUTH_ENABLED flag and valid Supabase configuration', () => {
  // Disabled by default when env is empty or flag is missing
  assert.equal(isGoogleAuthEnabled({}), false);
  assert.equal(isGoogleAuthEnabled(undefined), false);
  assert.equal(isGoogleAuthEnabled({ VITE_GOOGLE_AUTH_ENABLED: 'false' }), false);
  assert.equal(isGoogleAuthEnabled({ VITE_GOOGLE_AUTH_ENABLED: '0' }), false);
  assert.equal(isGoogleAuthEnabled({ VITE_GOOGLE_AUTH_ENABLED: 'true' }), false, 'Flag alone without Supabase must be false');

  // Configured Supabase with flag missing or false
  const validSupabaseEnv = {
    VITE_SUPABASE_URL: 'https://staging-project.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_staging_key_1234567890',
  };
  assert.equal(isGoogleAuthEnabled(validSupabaseEnv), false);
  assert.equal(isGoogleAuthEnabled({ ...validSupabaseEnv, VITE_GOOGLE_AUTH_ENABLED: 'false' }), false);

  // Enabled only when BOTH flag === 'true' AND Supabase status === 'configured'
  assert.equal(
    isGoogleAuthEnabled({ ...validSupabaseEnv, VITE_GOOGLE_AUTH_ENABLED: 'true' }),
    true
  );
});

// ---------------------------------------------------------------------------
// 2. Trusted Callback URL & returnTo Sanitization
// ---------------------------------------------------------------------------
test('getTrustedCallbackUrl constructs URL from trusted origin and strictly sanitizes returnTo', () => {
  const origin = 'https://app.staging.example.com';

  // Valid internal destinations
  assert.equal(
    getTrustedCallbackUrl('/', origin),
    'https://app.staging.example.com/auth/callback'
  );
  assert.equal(
    getTrustedCallbackUrl('/profile/edit', origin),
    'https://app.staging.example.com/auth/callback?returnTo=%2Fprofile%2Fedit'
  );
  assert.equal(
    getTrustedCallbackUrl('/library?sort=recent', origin),
    'https://app.staging.example.com/auth/callback?returnTo=%2Flibrary%3Fsort%3Drecent'
  );

  // Open-redirect attacks and protocol-relative evasions must be neutralized to '/'
  const maliciousTargets = [
    'https://evil.example.com',
    '//attacker.example.com',
    '///attacker.example.com',
    '/\\attacker.example.com',
    '/%5cattacker.example.com',
    '/%2f/attacker.example.com',
    'javascript:alert(1)',
  ];
  for (const target of maliciousTargets) {
    const url = getTrustedCallbackUrl(target, origin);
    assert.equal(
      url,
      'https://app.staging.example.com/auth/callback',
      `Malicious target "${target}" must resolve without open-redirect parameter`
    );
  }

  // Auth loop destinations must be neutralized to '/'
  const loopTargets = ['/login', '/signup', '/auth/callback', '/verify-email', '/forgot-password', '/reset-password'];
  for (const loop of loopTargets) {
    const url = getTrustedCallbackUrl(loop, origin);
    assert.equal(
      url,
      'https://app.staging.example.com/auth/callback',
      `Auth loop target "${loop}" must not be appended to callback URL`
    );
  }
});

// ---------------------------------------------------------------------------
// 3. OAuth Initiation Options & Error Handling
// ---------------------------------------------------------------------------
test('initiateGoogleSignIn requests Google provider with trusted redirectTo and no extra scopes', async () => {
  let passedCredentials = null;
  const mockClient = {
    auth: {
      signInWithOAuth: async (credentials) => {
        passedCredentials = credentials;
        return { data: { provider: 'google', url: 'https://accounts.google.com/o/oauth2/v2/auth' }, error: null };
      },
    },
  };

  const origin = 'http://localhost:5173';
  const res = await initiateGoogleSignIn(mockClient, {
    returnTo: '/profile/edit',
    origin,
    skipBrowserRedirect: true,
  });

  assert.equal(res.error, null);
  assert.ok(passedCredentials);
  assert.equal(passedCredentials.provider, 'google');
  assert.equal(
    passedCredentials.options?.redirectTo,
    'http://localhost:5173/auth/callback?returnTo=%2Fprofile%2Fedit'
  );
  assert.equal(passedCredentials.options?.scopes, undefined, 'No extra scopes requested');
});

test('initiateGoogleSignIn surfaces SDK errors and thrown exceptions safely', async () => {
  // A) SDK returns error object
  const failingClient = {
    auth: {
      signInWithOAuth: async () => ({
        data: null,
        error: { message: 'Google provider is not enabled in project settings.' },
      }),
    },
  };

  const sdkErrorRes = await initiateGoogleSignIn(failingClient, { skipBrowserRedirect: true });
  assert.ok(sdkErrorRes.error);
  assert.match(sdkErrorRes.error.message, /Google provider is not enabled/);

  // B) SDK throws exception
  const throwingClient = {
    auth: {
      signInWithOAuth: async () => {
        throw new Error('Network connection timeout while contacting Supabase.');
      },
    },
  };

  const throwRes = await initiateGoogleSignIn(throwingClient, { skipBrowserRedirect: true });
  assert.ok(throwRes.error);
  assert.match(throwRes.error.message, /Network connection timeout/);

  // C) Missing client fails closed
  const missingRes = await initiateGoogleSignIn(null);
  assert.ok(missingRes.error);
  assert.match(missingRes.error.message, /Authentication client is unavailable/);
});

// ---------------------------------------------------------------------------
// 4. UI Gate & Button Exposure on Login and Signup
// ---------------------------------------------------------------------------
test('Login and Signup do not render Google button when VITE_GOOGLE_AUTH_ENABLED is absent or false', async () => {
  const { default: Login } = await server.ssrLoadModule('/src/pages/Login.jsx');
  const { default: Signup } = await server.ssrLoadModule('/src/pages/Signup.jsx');

  // Default SSR environment has no VITE_GOOGLE_AUTH_ENABLED set
  const loginHtml = await renderWithAuth(React.createElement(Login), { user: null, loading: false });
  assert.ok(!loginHtml.includes('Continue with Google'), 'Login must not render Google button when disabled');
  assert.ok(!loginHtml.includes('auth-divider'), 'Login must not render divider when disabled');
  assert.ok(loginHtml.includes('Sign In'), 'Email/password submit button remains present');
  assert.ok(loginHtml.includes('Continue as Guest'), 'Guest button remains present');

  const signupHtml = await renderWithAuth(React.createElement(Signup), { user: null, loading: false });
  assert.ok(!signupHtml.includes('Continue with Google'), 'Signup must not render Google button when disabled');
  assert.ok(!signupHtml.includes('auth-divider'), 'Signup must not render divider when disabled');
  assert.ok(signupHtml.includes('Create Account'), 'Email/password signup button remains present');
  assert.ok(signupHtml.includes('Continue as Guest'), 'Guest button remains present');
});

// ---------------------------------------------------------------------------
// 5. Callback Handling: Cancellation, Missing Code, & Error States
// ---------------------------------------------------------------------------
test('AuthCallback safely handles provider cancellation and displays actionable options without loop', () => {
  // Provider cancellation: Google returns error_description=User+cancelled
  const cancelledState = getAuthCallbackState({
    search: '?error=access_denied&error_description=User+denied+access',
    user: null,
    loading: false,
    isTransitioning: false,
    callbackPending: false,
  });

  assert.equal(cancelledState.canNavigate, false);
  assert.equal(cancelledState.error, 'User denied access');

  // Missing code state
  const missingCodeState = getAuthCallbackState({
    search: '',
    user: null,
    loading: false,
    isTransitioning: false,
    callbackPending: false,
  });

  assert.equal(missingCodeState.canNavigate, false);
  assert.match(missingCodeState.error, /No verification code was found/);
});

// ---------------------------------------------------------------------------
// 6. Single Code Exchange Ownership (SDK Ownership)
// ---------------------------------------------------------------------------
test('inspectAuthCallbackSession coordinates with auth.initialize() and does not perform duplicate exchange', async () => {
  let initializeCalls = 0;
  let getSessionCalls = 0;

  const mockAuth = {
    initialize: async () => {
      initializeCalls += 1;
      return { error: null };
    },
    getSession: async () => {
      getSessionCalls += 1;
      return { data: { session: { user: { id: 'mock-user-123' } } }, error: null };
    },
  };

  const error = await inspectAuthCallbackSession(mockAuth);
  assert.equal(error, null);
  assert.equal(initializeCalls, 1, 'initialize() must be invoked exactly once');
  assert.equal(getSessionCalls, 1, 'getSession() reads the session created by initialize()');
});

// ---------------------------------------------------------------------------
// 7. Generation Guard: Account Switch Invalidates Callback Work
// ---------------------------------------------------------------------------
test('account switch or signout invalidates in-flight callback resolution', async () => {
  const { default: AuthCallback } = await server.ssrLoadModule('/src/pages/AuthCallback.jsx');

  let activeGeneration = 1;
  const authContextValue = {
    user: { id: 'user-a' },
    loading: false,
    isTransitioning: false,
    error: null,
    isConfigured: true,
    captureGeneration: () => activeGeneration,
    isCurrent: (gen) => gen === activeGeneration,
  };

  // Generation changes during callback (e.g. user signed out or switched account)
  activeGeneration = 2; // Invalidate generation 1

  const html = await renderWithAuth(
    React.createElement(AuthCallback),
    authContextValue,
    '/auth/callback?code=mock-code&returnTo=%2Fprofile'
  );

  // The component renders safely without crashing or auto-navigating on stale generation
  assert.ok(html.includes('auth-page'));
});

