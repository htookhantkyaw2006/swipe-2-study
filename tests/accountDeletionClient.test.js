import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { isAccountDeletionEnabled } from '../src/lib/accountDeletionGate.js';
import {
  removeOwnerLocalData,
  formatRateLimitMessage,
  sendDeletionRequest,
  createAccountDeletionController,
  UNCONFIRMED_DELETION_GUIDANCE,
} from '../src/lib/accountDeletionClient.js';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false, host: '127.0.0.1', watch: null },
});

after(async () => {
  await server.close();
});

const { default: DeleteAccountDialog } = await server.ssrLoadModule('/src/components/DeleteAccountDialog.jsx');

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

// ---------------------------------------------------------------------------
// 1. Account Deletion Feature Gate
// ---------------------------------------------------------------------------

test('isAccountDeletionEnabled: disabled by default and requires configured backend', () => {
  // Empty or undefined env
  assert.equal(isAccountDeletionEnabled({}), false);
  assert.equal(isAccountDeletionEnabled(null), false);

  // Cloud import flag enabled must NOT enable account deletion
  assert.equal(isAccountDeletionEnabled({ VITE_CLOUD_IMPORT_STAGING: 'true' }), false);

  // Flag enabled but no backend URL
  assert.equal(isAccountDeletionEnabled({ VITE_ACCOUNT_DELETION_ENABLED: 'true' }), false);

  // Flag enabled with valid backend config
  const validEnv = {
    VITE_ACCOUNT_DELETION_ENABLED: 'true',
    VITE_SUPABASE_URL: 'https://staging.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_12345678901234567890',
  };
  assert.equal(isAccountDeletionEnabled(validEnv), true);

  // Flag disabled with valid backend config
  assert.equal(isAccountDeletionEnabled({ ...validEnv, VITE_ACCOUNT_DELETION_ENABLED: 'false' }), false);
});

// ---------------------------------------------------------------------------
// 2. Owner-Specific Local Cache Removal
// ---------------------------------------------------------------------------

test('removeOwnerLocalData: removes all and only target user keys, preserving guest and Account B', () => {
  const store = new Map();
  const mockStorage = {
    get length() { return store.size; },
    key(i) { return [...store.keys()][i] ?? null; },
    getItem(k) { return store.get(k) ?? null; },
    setItem(k, v) { store.set(k, v); },
    removeItem(k) { store.delete(k); },
    clear() { assert.fail('localStorage.clear() must NEVER be called!'); },
  };

  // Seed store with:
  // - Global keys
  mockStorage.setItem('s2s_storage_version', '1');
  // - Guest keys
  mockStorage.setItem('s2s_language', 'zh');
  mockStorage.setItem('s2s_preferences', '{"dailyGoal":10}');
  mockStorage.setItem('s2s_zh_saved_words', '[{"id":"g1"}]');
  // - Account A keys (including reserved document, sync, and scoped tables)
  mockStorage.setItem(`s2s_user_${USER_A}_learning_document_v1`, '{"revision":2}');
  mockStorage.setItem(`s2s_user_${USER_A}_cloud_sync_state_v1`, '{"dirty":[]}');
  mockStorage.setItem(`s2s_user_${USER_A}_cloud_import_request_v1`, '{"id":"req1"}');
  mockStorage.setItem(`s2s_user_${USER_A}_zh_saved_words`, '[{"id":"a1"}]');
  mockStorage.setItem(`s2s_user_${USER_A}_preferences`, '{"dailyGoal":20}');
  // - Account B keys
  mockStorage.setItem(`s2s_user_${USER_B}_learning_document_v1`, '{"revision":5}');
  mockStorage.setItem(`s2s_user_${USER_B}_zh_saved_words`, '[{"id":"b1"}]');

  // Reject invalid owner ID
  assert.throws(() => removeOwnerLocalData('invalid-id', mockStorage), TypeError);

  // Execute cleanup for Account A
  const res = removeOwnerLocalData(USER_A, mockStorage);
  assert.equal(res.removedCount, 5);

  // Verify Account A keys are completely removed
  assert.equal(mockStorage.getItem(`s2s_user_${USER_A}_learning_document_v1`), null);
  assert.equal(mockStorage.getItem(`s2s_user_${USER_A}_cloud_sync_state_v1`), null);
  assert.equal(mockStorage.getItem(`s2s_user_${USER_A}_cloud_import_request_v1`), null);
  assert.equal(mockStorage.getItem(`s2s_user_${USER_A}_zh_saved_words`), null);
  assert.equal(mockStorage.getItem(`s2s_user_${USER_A}_preferences`), null);

  // Verify Guest records are completely untouched
  assert.equal(mockStorage.getItem('s2s_storage_version'), '1');
  assert.equal(mockStorage.getItem('s2s_language'), 'zh');
  assert.equal(mockStorage.getItem('s2s_preferences'), '{"dailyGoal":10}');
  assert.equal(mockStorage.getItem('s2s_zh_saved_words'), '[{"id":"g1"}]');

  // Verify Account B records are completely untouched
  assert.equal(mockStorage.getItem(`s2s_user_${USER_B}_learning_document_v1`), '{"revision":5}');
  assert.equal(mockStorage.getItem(`s2s_user_${USER_B}_zh_saved_words`), '[{"id":"b1"}]');
});

// ---------------------------------------------------------------------------
// 3. Rate Limit Timing Message Formatting
// ---------------------------------------------------------------------------

test('formatRateLimitMessage: accurately formats seconds and minutes', () => {
  assert.equal(
    formatRateLimitMessage(900),
    'Too many failed deletion attempts. Please wait 15 minutes before trying again.'
  );
  assert.equal(
    formatRateLimitMessage(65),
    'Too many failed deletion attempts. Please wait 2 minutes before trying again.'
  );
  assert.equal(
    formatRateLimitMessage(45),
    'Too many failed deletion attempts. Please wait 45 seconds before trying again.'
  );
  assert.equal(
    formatRateLimitMessage(null),
    'Too many failed deletion attempts. Please wait before retrying.'
  );
});

// ---------------------------------------------------------------------------
// 4. Client Deletion Request Dispatch & Response Validation
// ---------------------------------------------------------------------------

test('sendDeletionRequest: rejects invalid owner, missing password, or unauthenticated session', async () => {
  const mockClient = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  };

  const noOwner = await sendDeletionRequest({ client: mockClient, password: 'pw', initiatingUserId: null });
  assert.equal(noOwner.status, 'error');
  assert.equal(noOwner.code, 'INVALID_OWNER');

  const noPw = await sendDeletionRequest({ client: mockClient, password: '', initiatingUserId: USER_A });
  assert.equal(noPw.status, 'error');
  assert.equal(noPw.code, 'PASSWORD_REQUIRED');

  const unauth = await sendDeletionRequest({ client: mockClient, password: 'pw', initiatingUserId: USER_A });
  assert.equal(unauth.status, 'unauthenticated');
});

test('sendDeletionRequest: strictly validates confirmed deletion response shape', async () => {
  const mockClient = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: 'valid-jwt', user: { id: USER_A } } }, error: null }),
      getUser: (_token) => Promise.resolve({ data: { user: { id: USER_A } }, error: null }),
    },
  };

  // 1. Exact valid shape
  const goodFetcher = async () => new Response(JSON.stringify({
    success: true,
    status: 'deleted',
    userId: USER_A,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const goodRes = await sendDeletionRequest({
    client: mockClient,
    password: 'secret-password',
    initiatingUserId: USER_A,
    supabaseUrl: 'https://staging.supabase.co',
    fetcher: goodFetcher,
  });
  assert.equal(goodRes.status, 'confirmed_deleted');
  assert.equal(goodRes.userId, USER_A);

  // 2. Generic HTTP 200 without exact shape MUST return unconfirmed
  const generic200Fetcher = async () => new Response(JSON.stringify({
    ok: true,
    message: 'User removed',
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const genericRes = await sendDeletionRequest({
    client: mockClient,
    password: 'secret-password',
    initiatingUserId: USER_A,
    supabaseUrl: 'https://staging.supabase.co',
    fetcher: generic200Fetcher,
  });
  assert.equal(genericRes.status, 'unconfirmed');
  assert.equal(genericRes.message, UNCONFIRMED_DELETION_GUIDANCE);

  // 3. Mismatched user ID in 200 MUST return unconfirmed
  const mismatchFetcher = async () => new Response(JSON.stringify({
    success: true,
    status: 'deleted',
    userId: USER_B,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const mismatchRes = await sendDeletionRequest({
    client: mockClient,
    password: 'secret-password',
    initiatingUserId: USER_A,
    supabaseUrl: 'https://staging.supabase.co',
    fetcher: mismatchFetcher,
  });
  assert.equal(mismatchRes.status, 'unconfirmed');
});

test('sendDeletionRequest: maps all server error codes and network errors honestly', async () => {
  const mockClient = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: 'valid-jwt', user: { id: USER_A } } }, error: null }),
      getUser: (_token) => Promise.resolve({ data: { user: { id: USER_A } }, error: null }),
    },
  };

  // 400 UNSUPPORTED_AUTH_PROVIDER
  const unsuppFetcher = async () => new Response(JSON.stringify({
    code: 'UNSUPPORTED_AUTH_PROVIDER',
    error: 'Provider reauthentication required.',
  }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const unsuppRes = await sendDeletionRequest({
    client: mockClient,
    password: 'pw',
    initiatingUserId: USER_A,
    fetcher: unsuppFetcher,
  });
  assert.equal(unsuppRes.status, 'unsupported_provider');

  // 401 INVALID_CREDENTIALS
  const badCredFetcher = async () => new Response(JSON.stringify({
    code: 'INVALID_CREDENTIALS',
    error: 'Incorrect password.',
  }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const badCredRes = await sendDeletionRequest({
    client: mockClient,
    password: 'wrong',
    initiatingUserId: USER_A,
    fetcher: badCredFetcher,
  });
  assert.equal(badCredRes.status, 'invalid_credentials');

  // 429 RATE_LIMITED with server Retry-After
  const rateLimitFetcher = async () => new Response(JSON.stringify({
    code: 'RATE_LIMITED',
    error: 'Too many attempts.',
    retryAfter: 600,
  }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '600' } });

  const rateLimitRes = await sendDeletionRequest({
    client: mockClient,
    password: 'pw',
    initiatingUserId: USER_A,
    fetcher: rateLimitFetcher,
  });
  assert.equal(rateLimitRes.status, 'rate_limited');
  assert.equal(rateLimitRes.retryAfter, 600);
  assert.ok(rateLimitRes.message.includes('10 minutes'));

  // 502 STORAGE_CLEANUP_FAILED / AUTH_DELETION_FAILED
  const partialFetcher = async () => new Response(JSON.stringify({
    code: 'STORAGE_CLEANUP_FAILED',
    error: 'Storage failure.',
  }), { status: 502, headers: { 'Content-Type': 'application/json' } });

  const partialRes = await sendDeletionRequest({
    client: mockClient,
    password: 'pw',
    initiatingUserId: USER_A,
    fetcher: partialFetcher,
  });
  assert.equal(partialRes.status, 'partial_failure');

  // Network drop / thrown fetch
  const networkDropFetcher = async () => { throw new Error('Failed to fetch'); };
  const netRes = await sendDeletionRequest({
    client: mockClient,
    password: 'pw',
    initiatingUserId: USER_A,
    fetcher: networkDropFetcher,
  });
  assert.equal(netRes.status, 'unconfirmed');
  assert.equal(netRes.code, 'NETWORK_ERROR');
  assert.equal(netRes.message, UNCONFIRMED_DELETION_GUIDANCE);
});

// ---------------------------------------------------------------------------
// 5. Account Deletion Controller & Lifecycle Coordination
// ---------------------------------------------------------------------------

test('createAccountDeletionController: confirmed deletion clears local data and returns to guest', async () => {
  const store = new Map();
  const mockStorage = {
    get length() { return store.size; },
    key(i) { return [...store.keys()][i] ?? null; },
    getItem(k) { return store.get(k) ?? null; },
    setItem(k, v) { store.set(k, v); },
    removeItem(k) { store.delete(k); },
    clear() { assert.fail('localStorage.clear() forbidden!'); },
  };

  mockStorage.setItem(`s2s_user_${USER_A}_learning_document_v1`, '{"tables":{}}');
  mockStorage.setItem('s2s_zh_saved_words', '[{"id":"guest-1"}]');

  let activeOwner = USER_A;
  let signOutCalled = false;

  const mockAuthCoordinator = {
    getUser: () => ({ id: USER_A, email: 'learner@example.com' }),
    captureGeneration: () => 1,
    isCurrent: (gen) => gen === 1,
    getClient: () => ({
      auth: {
        getSession: () => Promise.resolve({ data: { session: { access_token: 'jwt', user: { id: USER_A } } }, error: null }),
        getUser: (_token) => Promise.resolve({ data: { user: { id: USER_A } }, error: null }),
      },
    }),
    signOut: () => {
      signOutCalled = true;
      activeOwner = null;
      return Promise.resolve({ error: null });
    },
  };

  const mockStorageOwner = {
    getOwner: () => activeOwner,
    setOwner: (val) => { activeOwner = val; },
  };

  const goodFetcher = async () => new Response(JSON.stringify({
    success: true,
    status: 'deleted',
    userId: USER_A,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const controller = createAccountDeletionController({
    authCoordinator: mockAuthCoordinator,
    storageOwner: mockStorageOwner,
    storage: () => mockStorage,
    fetcher: goodFetcher,
    isDeletionEnabled: () => true,
  });

  assert.equal(controller.getState().available, true);
  controller.openDialog();
  assert.equal(controller.getState().dialogOpen, true);

  const res = await controller.deleteAccount({ password: 'valid-password' });
  assert.equal(res.status, 'deleted');

  // Verify Account A local cache was wiped
  assert.equal(mockStorage.getItem(`s2s_user_${USER_A}_learning_document_v1`), null);
  // Verify Guest records survive
  assert.equal(mockStorage.getItem('s2s_zh_saved_words'), '[{"id":"guest-1"}]');

  // Verify session and state transitioned to guest
  assert.equal(signOutCalled, true);
  assert.equal(activeOwner, null);
  assert.equal(controller.getState().dialogOpen, false);
  assert.ok(controller.getState().notice.includes('guest mode'));
});

test('createAccountDeletionController: account switch while deletion in-flight discards result and protects Account B', async () => {
  const store = new Map();
  const mockStorage = {
    get length() { return store.size; },
    key(i) { return [...store.keys()][i] ?? null; },
    getItem(k) { return store.get(k) ?? null; },
    setItem(k, v) { store.set(k, v); },
    removeItem(k) { store.delete(k); },
  };

  mockStorage.setItem(`s2s_user_${USER_A}_learning_document_v1`, '{"data":"a"}');
  mockStorage.setItem(`s2s_user_${USER_B}_learning_document_v1`, '{"data":"b"}');

  let activeUser = { id: USER_A, email: 'userA@example.com' };
  let currentGen = 1;
  let signOutCalledOn = null;

  const mockAuthCoordinator = {
    getUser: () => activeUser,
    captureGeneration: () => currentGen,
    isCurrent: (gen) => gen === currentGen,
    getClient: () => ({
      auth: {
        getSession: () => Promise.resolve({ data: { session: { access_token: 'jwt-a', user: { id: USER_A } } }, error: null }),
        getUser: (_token) => Promise.resolve({ data: { user: { id: USER_A } }, error: null }),
      },
    }),
    signOut: () => {
      signOutCalledOn = activeUser?.id;
      return Promise.resolve({ error: null });
    },
  };

  const mockStorageOwner = {
    getOwner: () => activeUser?.id,
    setOwner: (id) => { if (activeUser) activeUser.id = id; },
  };

  // While fetcher is running, simulate account switch to User B!
  const switchingFetcher = async () => {
    // User switched accounts
    activeUser = { id: USER_B, email: 'userB@example.com' };
    currentGen = 2; // Generation advanced
    return new Response(JSON.stringify({
      success: true,
      status: 'deleted',
      userId: USER_A,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const controller = createAccountDeletionController({
    authCoordinator: mockAuthCoordinator,
    storageOwner: mockStorageOwner,
    storage: () => mockStorage,
    fetcher: switchingFetcher,
    isDeletionEnabled: () => true,
  });

  const res = await controller.deleteAccount({ password: 'secret' });
  assert.equal(res.status, 'discarded');
  assert.equal(res.reason, 'account_switched');

  // Verify Account B was NOT signed out
  assert.equal(signOutCalledOn, null, 'Account B must never be signed out by delayed Account A response');
  assert.equal(activeUser.id, USER_B, 'Account B must remain active owner');
  assert.equal(mockStorage.getItem(`s2s_user_${USER_B}_learning_document_v1`), '{"data":"b"}');
  // Account A local data was safely cleaned up
  assert.equal(mockStorage.getItem(`s2s_user_${USER_A}_learning_document_v1`), null);
});

test('createAccountDeletionController: local cleanup failure allows retry without re-deleting account', async () => {
  let failStorage = true;
  const store = new Map();
  const mockStorage = {
    get length() { return store.size; },
    key(i) { return [...store.keys()][i] ?? null; },
    getItem(k) { return store.get(k) ?? null; },
    setItem(k, v) { store.set(k, v); },
    removeItem(k) {
      if (failStorage) throw new Error('Quota or device error');
      store.delete(k);
    },
  };

  mockStorage.setItem(`s2s_user_${USER_A}_learning_document_v1`, '{"data":"a"}');

  let serverCallCount = 0;
  const mockFetcher = async () => {
    serverCallCount++;
    return new Response(JSON.stringify({
      success: true,
      status: 'deleted',
      userId: USER_A,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const mockAuthCoordinator = {
    getUser: () => ({ id: USER_A, email: 'userA@example.com' }),
    captureGeneration: () => 1,
    isCurrent: () => true,
    getClient: () => ({
      auth: {
        getSession: () => Promise.resolve({ data: { session: { access_token: 'jwt', user: { id: USER_A } } }, error: null }),
        getUser: (_token) => Promise.resolve({ data: { user: { id: USER_A } }, error: null }),
      },
    }),
    signOut: () => Promise.resolve({ error: null }),
  };

  const controller = createAccountDeletionController({
    authCoordinator: mockAuthCoordinator,
    storageOwner: { setOwner: () => {} },
    storage: () => mockStorage,
    fetcher: mockFetcher,
    isDeletionEnabled: () => true,
  });

  // First attempt fails at local storage cleanup
  const res1 = await controller.deleteAccount({ password: 'pwd' });
  assert.equal(res1.status, 'local_cleanup_failed');
  assert.equal(serverCallCount, 1);
  assert.equal(controller.getState().localCleanupError, true);

  // User clicks "Retry local cleanup"
  failStorage = false; // storage now succeeds
  await controller.retryLocalCleanup();

  // Verify server was NOT called again on retry
  assert.equal(serverCallCount, 1, 'Retry must NOT resubmit server deletion request');
  assert.equal(controller.getState().localCleanupError, false);
  assert.equal(controller.getState().dialogOpen, false);
  assert.equal(mockStorage.getItem(`s2s_user_${USER_A}_learning_document_v1`), null);
});

// ---------------------------------------------------------------------------
// 6. DeleteAccountDialog Presentational Component
// ---------------------------------------------------------------------------

test('DeleteAccountDialog: renders null when open is false', () => {
  const html = renderToString(React.createElement(DeleteAccountDialog, {
    open: false,
  }));
  assert.equal(html, '');
});

test('DeleteAccountDialog: renders accessible elements and disables submit button initially', () => {
  const html = renderToString(React.createElement(DeleteAccountDialog, {
    open: true,
    accountLabel: 'learner@example.com',
  }));

  assert.ok(html.includes('Delete your account?'));
  assert.ok(html.includes('learner@example.com'));
  assert.ok(html.includes('Account password'));
  assert.ok(html.includes('Type <strong>DELETE</strong> to confirm'));
  assert.ok(html.includes('Saved words and learning data on this device will be kept in guest mode'));
  assert.ok(html.includes('disabled=""'), 'Delete button should be disabled when empty');
});

test('DeleteAccountDialog: displays accessible error alert', () => {
  const html = renderToString(React.createElement(DeleteAccountDialog, {
    open: true,
    error: 'Incorrect password. Enter your current password to confirm account deletion.',
  }));

  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes('Incorrect password'));
});

test('DeleteAccountDialog: displays local cleanup failure state with dedicated retry button', () => {
  const html = renderToString(React.createElement(DeleteAccountDialog, {
    open: true,
    localCleanupError: true,
  }));

  assert.ok(html.includes('Retry local cleanup'));
  assert.ok(html.includes('could not be completely cleared'));
});
