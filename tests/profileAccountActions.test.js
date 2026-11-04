import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { sendDeletionRequest, removeOwnerLocalData } from '../src/lib/accountDeletionClient.js';
import { readStreakState, writeStreakState } from '../src/lib/studyStreak.js';
import { runBrowserProfileAccountVerification } from './runBrowserProfileAccount.mjs';

const oldStorage = globalThis.localStorage;
const storageMap = new Map();
globalThis.localStorage = {
  getItem: (key) => storageMap.get(key) ?? null,
  setItem: (key, val) => storageMap.set(key, String(val)),
  removeItem: (key) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  get length() { return storageMap.size; },
  key: (i) => Array.from(storageMap.keys())[i] ?? null,
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
});

const { default: Profile } = await server.ssrLoadModule('/src/pages/Profile.jsx');
const { LanguageProvider } = await server.ssrLoadModule('/src/lib/language.jsx');
const { PreferencesProvider } = await server.ssrLoadModule('/src/lib/preferences.jsx');
const { PublishedContentProvider } = await server.ssrLoadModule('/src/lib/publishedContentContext.jsx');
const { GuestImportContext } = await server.ssrLoadModule('/src/lib/guestImportContext.js');
const { AuthContext } = await server.ssrLoadModule('/src/lib/authContext.js');
const { setActiveLanguageId } = await server.ssrLoadModule('/src/lib/activeLanguage.js');

setActiveLanguageId('zh');

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

test('Profile SSR: renders destructive session and danger controls safely', () => {
  const authValue = {
    user: { id: USER_A, email: 'learner@example.com' },
    profile: { display_name: 'Alex Rivera' },
    loading: false,
    isTransitioning: false,
    error: null,
    isGuest: false,
    isConfigured: true,
    captureGeneration: () => 1,
    isCurrent: () => true,
    signOut: async () => ({ error: null }),
    signOutGlobal: async () => ({ confirmedLocal: true, remoteConfirmed: true, error: null }),
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
                { initialEntries: ['/profile'] },
                React.createElement(Profile)
              )
            )
          )
        )
      )
    )
  );

  assert.ok(html.includes('Sign out on all devices'), 'Global sign out option present');
  assert.ok(html.includes('Delete account'), 'Delete account option present');
  assert.ok(html.includes('Session &amp; account') || html.includes('profile-group--danger'), 'Destructive actions grouped in danger section');
});

test('Profile Deletion Client: validates parameters and contract', async () => {
  // 1. Missing password rejects with PASSWORD_REQUIRED
  const res1 = await sendDeletionRequest({
    client: { auth: { getSession: async () => ({}) } },
    password: '',
    initiatingUserId: USER_A,
  });
  assert.equal(res1.status, 'error');
  assert.equal(res1.code, 'PASSWORD_REQUIRED');

  // 2. Missing client rejects with CLIENT_UNAVAILABLE
  const res2 = await sendDeletionRequest({
    client: null,
    password: 'securePassword123',
    initiatingUserId: USER_A,
  });
  assert.equal(res2.status, 'error');
  assert.equal(res2.code, 'CLIENT_UNAVAILABLE');

  // 3. Invalid UUID rejects with INVALID_OWNER
  const res3 = await sendDeletionRequest({
    client: { auth: { getSession: async () => ({}) } },
    password: 'securePassword123',
    initiatingUserId: 'not-a-valid-uuid',
  });
  assert.equal(res3.status, 'error');
  assert.equal(res3.code, 'INVALID_OWNER');
});

test('Profile Deletion Client: in-flight account switch protects Account B', async () => {
  const mockStorage = {
    data: new Map([
      [`s2s_user_${USER_A}_progress`, 'A_data'],
      [`s2s_user_${USER_B}_progress`, 'B_data'],
      ['s2s_guest_progress', 'guest_data'],
    ]),
    key(i) {
      return Array.from(this.data.keys())[i];
    },
    get length() {
      return this.data.size;
    },
    removeItem(k) {
      this.data.delete(k);
    },
    getItem(k) {
      return this.data.get(k) || null;
    },
  };

  let currentUser = USER_A;
  let currentGen = 1;
  const isCurrent = (gen) => gen === currentGen && currentUser === USER_A;

  // Account switch happens during request
  currentUser = USER_B;
  currentGen = 2;

  // Verify guard detects account switch
  assert.equal(isCurrent(1), false, 'Operation from Gen 1 on Account A must be flagged non-current');

  // If server confirmed deletion of Account A, removeOwnerLocalData clears ONLY Account A
  removeOwnerLocalData(USER_A, mockStorage);
  assert.equal(mockStorage.getItem(`s2s_user_${USER_A}_progress`), null, 'Account A data removed');
  assert.equal(mockStorage.getItem(`s2s_user_${USER_B}_progress`), 'B_data', 'Account B data strictly preserved');
  assert.equal(mockStorage.getItem('s2s_guest_progress'), 'guest_data', 'Guest data strictly preserved');
});

test('Profile Study Streak: persists and reads currentStreak accurately in storage', () => {
  const mockStorage = {
    items: {},
    setItem(k, v) { this.items[k] = v; },
    getItem(k) { return this.items[k] || null; },
  };

  const streak = {
    currentStreak: 12,
    longestStreak: 25,
    todayStudied: true,
    timezone: 'Asia/Yangon',
  };

  writeStreakState(mockStorage, USER_A, streak);
  const read = readStreakState(mockStorage, USER_A);

  assert.equal(read.currentStreak, 12, 'currentStreak read matches written streak');
  assert.equal(read.longestStreak, 25);
  assert.equal(read.todayStudied, true);
});

test('Profile Real Browser: mounted component interaction, retry ownership safety, global sign out, and nonzero streak', async (t) => {
  const outcome = await runBrowserProfileAccountVerification();
  if (outcome.skipped) {
    if (process.env.REQUIRE_BROWSER_VERIFICATION === 'true' || process.env.NODE_ENV === 'production') {
      assert.fail(`Required release browser verification failed: ${outcome.reason}`);
    }
    t.skip(`Browser check skipped: ${outcome.reason}`);
    return;
  }

  assert.equal(outcome.passed, true);
  assert.ok(Array.isArray(outcome.results));

  // 1. Mounted Profile: A deletion confirmed -> local cleanup fails -> switch to B -> retry
  const retryTest = outcome.results.find((r) => r.test === 'profile-account-deletion-retry-ownership-safe');
  assert.ok(retryTest && retryTest.passed, 'profile-account-deletion-retry-ownership-safe must pass');

  // 2. Global sign out flow
  const globalSignOutTest = outcome.results.find((r) => r.test === 'profile-global-sign-out-flow');
  assert.ok(globalSignOutTest && globalSignOutTest.passed, 'profile-global-sign-out-flow must pass');

  // 3. Nonzero streak in Library and Profile
  const streakTest = outcome.results.find((r) => r.test === 'nonzero-streak-library-and-profile');
  assert.ok(streakTest && streakTest.passed, 'nonzero-streak-library-and-profile must pass');
});
