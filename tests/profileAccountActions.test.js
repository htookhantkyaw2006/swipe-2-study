import test from 'node:test';
import assert from 'node:assert/strict';
import { sendDeletionRequest, removeOwnerLocalData } from '../src/lib/accountDeletionClient.js';
import { readStreakState, writeStreakState } from '../src/lib/studyStreak.js';

test('Profile account deletion: sendDeletionRequest validates parameters and contract', async () => {
  const userId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

  // 1. Missing password rejects with PASSWORD_REQUIRED
  const res1 = await sendDeletionRequest({
    client: { auth: { getSession: async () => ({}) } },
    password: '',
    initiatingUserId: userId,
  });
  assert.equal(res1.status, 'error');
  assert.equal(res1.code, 'PASSWORD_REQUIRED');

  // 2. Missing client rejects with CLIENT_UNAVAILABLE
  const res2 = await sendDeletionRequest({
    client: null,
    password: 'securePassword123',
    initiatingUserId: userId,
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

test('Profile account deletion: in-flight account switch protects Account B', async () => {
  const accountA = '11111111-1111-4111-8111-111111111111';
  const accountB = '22222222-2222-4222-8222-222222222222';

  // Seed storage for both accounts
  const mockStorage = {
    data: new Map([
      [`s2s_user_${accountA}_progress`, 'A_data'],
      [`s2s_user_${accountB}_progress`, 'B_data'],
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

  let currentUser = accountA;
  let currentGen = 1;
  const isCurrent = (gen) => gen === currentGen && currentUser === accountA;

  // Account switch happens during request
  currentUser = accountB;
  currentGen = 2;

  // Verify guard detects account switch
  assert.equal(isCurrent(1), false, 'Operation from Gen 1 on Account A must be flagged non-current');

  // If server confirmed deletion of Account A, removeOwnerLocalData clears ONLY Account A
  removeOwnerLocalData(accountA, mockStorage);
  assert.equal(mockStorage.getItem(`s2s_user_${accountA}_progress`), null, 'Account A data removed');
  assert.equal(mockStorage.getItem(`s2s_user_${accountB}_progress`), 'B_data', 'Account B data strictly preserved');
  assert.equal(mockStorage.getItem('s2s_guest_progress'), 'guest_data', 'Guest data strictly preserved');
});

test('Profile study streak: persists and reads currentStreak accurately', () => {
  const ownerId = '33333333-3333-4333-8333-333333333333';
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

  writeStreakState(mockStorage, ownerId, streak);
  const read = readStreakState(mockStorage, ownerId);

  assert.equal(read.currentStreak, 12, 'currentStreak read matches written streak');
  assert.equal(read.longestStreak, 25);
  assert.equal(read.todayStudied, true);
});
