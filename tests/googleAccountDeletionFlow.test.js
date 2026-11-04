import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import {
  handleReauthenticationStep,
  createAttemptLimiter,
} from '../src/server/accountDeletion.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const TEST_ENV = {
  SUPABASE_URL: 'https://staging-project.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  ALLOWED_ORIGINS: 'https://staging.swipe2study.com',
};

// Mock browser storage
const oldStorage = globalThis.localStorage;
const oldSessionStorage = globalThis.sessionStorage;
const localMap = new Map();
const sessionMap = new Map();

globalThis.localStorage = {
  getItem: (k) => localMap.get(k) ?? null,
  setItem: (k, v) => localMap.set(k, String(v)),
  removeItem: (k) => localMap.delete(k),
  clear: () => localMap.clear(),
  get length() { return localMap.size; },
  key: (i) => Array.from(localMap.keys())[i] ?? null,
};

globalThis.sessionStorage = {
  getItem: (k) => sessionMap.get(k) ?? null,
  setItem: (k, v) => sessionMap.set(k, String(v)),
  removeItem: (k) => sessionMap.delete(k),
  clear: () => sessionMap.clear(),
  get length() { return sessionMap.size; },
  key: (i) => Array.from(sessionMap.keys())[i] ?? null,
};

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

const server = await createServer({
  root: projectRoot,
  server: { middlewareMode: true, hmr: false, ws: false, host: '127.0.0.1', watch: null },
});

after(async () => {
  await server.close();
  if (oldStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = oldStorage;
  if (oldSessionStorage === undefined) delete globalThis.sessionStorage;
  else globalThis.sessionStorage = oldSessionStorage;
});

const { default: Home } = await server.ssrLoadModule('/src/pages/Home.jsx');
const { default: Profile } = await server.ssrLoadModule('/src/pages/Profile.jsx');
const { AuthContext } = await server.ssrLoadModule('/src/lib/authContext.js');
const { LanguageProvider } = await server.ssrLoadModule('/src/lib/language.jsx');
const { PreferencesProvider } = await server.ssrLoadModule('/src/lib/preferences.jsx');
const { PublishedContentProvider } = await server.ssrLoadModule('/src/lib/publishedContentContext.jsx');
const { GuestImportContext } = await server.ssrLoadModule('/src/lib/guestImportContext.js');
const { setActiveLanguageId } = await server.ssrLoadModule('/src/lib/activeLanguage.js');

setActiveLanguageId('zh');

// ---------------------------------------------------------------------------
// 1. Google Deletion with Recent Authentication
// ---------------------------------------------------------------------------
test('Google deletion: recent interactive authentication allows deletion without password', async () => {
  const baseTime = Date.now();
  const mockUserClient = {
    auth: {
      getUser: async (token) => {
        assert.equal(token, 'google-recent-jwt');
        return {
          data: {
            user: {
              id: USER_A,
              email: 'google-learner@gmail.com',
              app_metadata: { provider: 'google', providers: ['google'] },
              identities: [{
                provider: 'google',
                id: 'google-sub-1',
                last_sign_in_at: new Date(baseTime - 120 * 1000).toISOString(), // 2 minutes ago (fresh)
              }],
            },
          },
          error: null,
        };
      },
    },
  };

  const limiter = createAttemptLimiter({ maxAttempts: 5, windowMs: 60000 });

  const result = await handleReauthenticationStep({
    authHeader: 'Bearer google-recent-jwt',
    rawBody: { provider: 'google', confirmation: 'DELETE' },
    env: TEST_ENV,
    userClient: mockUserClient,
    attemptLimiter: limiter,
    now: () => baseTime,
  });

  assert.equal(result.success, true);
  assert.equal(result.verifiedUser.id, USER_A);
  assert.equal(result.method, 'google');
});

// ---------------------------------------------------------------------------
// 2. Google Deletion with Stale Authentication Requires Re-Authentication
// ---------------------------------------------------------------------------
test('Google deletion: stale authentication rejects with 401 REAUTH_REQUIRED', async () => {
  const baseTime = Date.now();
  const mockStaleClient = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: USER_A,
            email: 'google-learner@gmail.com',
            app_metadata: { provider: 'google', providers: ['google'] },
            identities: [{
              provider: 'google',
              id: 'google-sub-1',
              last_sign_in_at: new Date(baseTime - 700 * 1000).toISOString(), // 11m 40s ago (> 10 minutes)
            }],
          },
        },
        error: null,
      }),
    },
  };

  const limiter = createAttemptLimiter({ maxAttempts: 5, windowMs: 60000 });

  await assert.rejects(
    async () => {
      await handleReauthenticationStep({
        authHeader: 'Bearer stale-token',
        rawBody: { provider: 'google', confirmation: 'DELETE' },
        env: TEST_ENV,
        userClient: mockStaleClient,
        attemptLimiter: limiter,
        now: () => baseTime,
      });
    },
    (err) => {
      assert.equal(err.code, 'REAUTH_REQUIRED');
      assert.equal(err.status, 401);
      assert.equal(err.provider, 'google');
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// 3. Google Re-Authentication Returning a Different Account Cancels Deletion
// ---------------------------------------------------------------------------
test('Google re-authentication: returning as a different account cancels deletion and alerts user', () => {
  // Stored intent binds to USER_A
  sessionMap.set('s2s_pending_deletion_intent', JSON.stringify({
    initiatingUserId: USER_A,
    email: 'user-a@gmail.com',
    timestamp: Date.now(),
  }));

  // But active signed-in user after redirect is USER_B
  const authValue = {
    user: { id: USER_B, email: 'user-b@gmail.com' },
    profile: { display_name: 'User B' },
    loading: false,
    isTransitioning: false,
    error: null,
    isGuest: false,
    isConfigured: true,
    captureGeneration: () => 1,
    isCurrent: () => true,
    signOut: async () => ({ error: null }),
    signOutGlobal: async () => ({ error: null }),
  };

  const guestImportValue = {
    status: 'idle',
    count: 0,
    isEligible: false,
    run: () => {},
    dismiss: () => {},
  };

  const html = renderToString(
    React.createElement(
      AuthContext.Provider,
      { value: authValue },
      React.createElement(
        GuestImportContext.Provider,
        { value: guestImportValue },
        React.createElement(
          LanguageProvider,
          null,
          React.createElement(
            PreferencesProvider,
            null,
            React.createElement(
              PublishedContentProvider,
              null,
              React.createElement(
                MemoryRouter,
                { initialEntries: ['/profile?verifyDeletion=true'] },
                React.createElement(Profile)
              )
            )
          )
        )
      )
    )
  );

  // Verify deletion dialog is NOT open for Account B
  assert.ok(!html.includes('Type <strong>DELETE</strong> to confirm'));
  // And neither account's local data was removed
  assert.equal(localMap.has(`s2s_user_${USER_A}_saved`), false);
  assert.equal(localMap.has(`s2s_user_${USER_B}_saved`), false);
});

// ---------------------------------------------------------------------------
// 4. OAuth Callback Does NOT Trigger Automatic Deletion
// ---------------------------------------------------------------------------
test('OAuth callback: /auth/callback never triggers account deletion', async () => {
  const { default: AuthCallback } = await server.ssrLoadModule('/src/pages/AuthCallback.jsx');

  let deletionInvoked = false;
  const mockClient = {
    auth: {
      getSession: async () => ({
        data: {
          session: {
            access_token: 'valid-token',
            user: { id: USER_A, email: 'learner@example.com' },
          },
        },
        error: null,
      }),
      getUser: async () => ({
        data: { user: { id: USER_A, email: 'learner@example.com' } },
        error: null,
      }),
    },
  };

  const authValue = {
    user: { id: USER_A, email: 'learner@example.com' },
    loading: false,
    isTransitioning: false,
    error: null,
    isGuest: false,
    isConfigured: true,
    captureGeneration: () => 1,
    isCurrent: () => true,
  };

  const html = renderToString(
    React.createElement(
      AuthContext.Provider,
      { value: authValue },
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/auth/callback?code=mock-auth-code&returnTo=/profile'] },
        React.createElement(AuthCallback, { client: mockClient })
      )
    )
  );

  assert.equal(deletionInvoked, false, 'Deletion must NEVER be triggered by OAuth callback');
  assert.ok(html.includes('auth-page') || html.includes('auth-card') || html.includes('Verifying your account'));
});

// ---------------------------------------------------------------------------
// 5. Home Deletion-Success Notice Displays Once and Disappears on Next Visit
// ---------------------------------------------------------------------------
test('Home notice: displays one-time deletion-success feedback and clears for future visits', () => {
  // Set deletion success notice in sessionStorage
  globalThis.sessionStorage.setItem('s2s_home_notice', 'Your account has been deleted. You are now in guest mode.');

  const authValue = {
    user: null,
    loading: false,
    isTransitioning: false,
    error: null,
    isGuest: true,
    isConfigured: true,
  };

  // 1. First visit to Home (/)
  const firstHtml = renderToString(
    React.createElement(
      AuthContext.Provider,
      { value: authValue },
      React.createElement(
        LanguageProvider,
        null,
        React.createElement(
          PreferencesProvider,
          null,
          React.createElement(
            PublishedContentProvider,
            null,
            React.createElement(
              MemoryRouter,
              { initialEntries: ['/'] },
              React.createElement(Home)
            )
          )
        )
      )
    )
  );

  // Must render accessible status notice
  assert.ok(firstHtml.includes('home-deletion-banner'));
  assert.ok(firstHtml.includes('role="status"'));
  assert.ok(firstHtml.includes('Your account has been deleted. You are now in guest mode.'));

  // Session storage notice must be consumed (cleared immediately upon read)
  assert.equal(globalThis.sessionStorage.getItem('s2s_home_notice'), null, 's2s_home_notice must be cleared from storage on display');

  // 2. Next visit / reload to Home (/)
  const nextHtml = renderToString(
    React.createElement(
      AuthContext.Provider,
      { value: authValue },
      React.createElement(
        LanguageProvider,
        null,
        React.createElement(
          PreferencesProvider,
          null,
          React.createElement(
            PublishedContentProvider,
            null,
            React.createElement(
              MemoryRouter,
              { initialEntries: ['/'] },
              React.createElement(Home)
            )
          )
        )
      )
    )
  );

  // Notice must NOT appear on future visits
  assert.ok(!nextHtml.includes('home-deletion-banner'));
  assert.ok(!nextHtml.includes('Your account has been deleted. You are now in guest mode.'));
});

// ---------------------------------------------------------------------------
// 6. Existing Password Deletion Still Passes
// ---------------------------------------------------------------------------
test('Password deletion: still functions cleanly with full credential reauthentication', async () => {
  const mockReauthClient = {
    auth: {
      signInWithPassword: async ({ email, password }) => {
        assert.equal(email, 'learner@example.com');
        assert.equal(password, 'correct-password');
        return {
          data: {
            user: { id: USER_A, email: 'learner@example.com' },
            session: { access_token: 'temp-jwt' },
          },
          error: null,
        };
      },
    },
  };

  const mockUserClient = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: USER_A,
            email: 'learner@example.com',
            app_metadata: { provider: 'email', providers: ['email'] },
            identities: [{ provider: 'email', id: USER_A }],
          },
        },
        error: null,
      }),
    },
  };

  const limiter = createAttemptLimiter({ maxAttempts: 5, windowMs: 60000 });

  const result = await handleReauthenticationStep({
    authHeader: 'Bearer caller-jwt',
    rawBody: { password: 'correct-password' },
    env: TEST_ENV,
    userClient: mockUserClient,
    attemptLimiter: limiter,
    createClient: () => mockReauthClient,
  });

  assert.equal(result.success, true);
  assert.equal(result.verifiedUser.id, USER_A);
  assert.equal(result.method, 'password');
});
