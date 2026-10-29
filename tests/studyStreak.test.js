import test from 'node:test';
import assert from 'node:assert/strict';
import { readStreakState, writeStreakState, fetchConfirmedStreak, getStreakKey } from '../src/lib/studyStreak.js';

class MockStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.get(key) ?? null;
  }
  setItem(key, val) {
    this.store.set(key, String(val));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

test('studyStreak: readStreakState and writeStreakState persist and read streak cache', () => {
  const storage = new MockStorage();
  const ownerId = 'usr_test_123';

  assert.equal(readStreakState(storage, ownerId), null);

  const streak = {
    currentStreak: 5,
    longestStreak: 12,
    todayStudied: true,
    lastStudyDate: '2026-10-29',
    timezone: 'Asia/Yangon',
    isGuest: false,
  };

  writeStreakState(storage, ownerId, streak);
  const readBack = readStreakState(storage, ownerId);
  assert.deepEqual(readBack, streak);

  // Corrupt cache returns null safely
  storage.setItem(getStreakKey(ownerId), '{not-valid-json');
  assert.equal(readStreakState(storage, ownerId), null);
});

test('studyStreak: fetchConfirmedStreak returns guest state for unauthenticated users', async () => {
  const result = await fetchConfirmedStreak({ ownerId: null });
  assert.equal(result.isGuest, true);
  assert.equal(result.currentStreak, 0);
  assert.equal(result.timezone, 'Asia/Yangon');
  assert.equal(result.todayStudied, false);
});

test('studyStreak: fetchConfirmedStreak retrieves server streak and updates local cache', async () => {
  const storage = new MockStorage();
  const ownerId = 'usr_active_456';

  const mockClient = {
    rpc: async (fnName, params) => {
      assert.equal(fnName, 's2s_get_study_streak');
      assert.equal(params.p_expected_user_id, ownerId);
      return {
        data: {
          current_streak: 3,
          longest_streak: 7,
          today_studied: true,
          last_study_date: '2026-10-29',
          timezone: 'Asia/Yangon',
        },
        error: null,
      };
    },
  };

  const result = await fetchConfirmedStreak({
    client: mockClient,
    ownerId,
    storage,
  });

  assert.equal(result.currentStreak, 3);
  assert.equal(result.longestStreak, 7);
  assert.equal(result.todayStudied, true);
  assert.equal(result.isGuest, false);

  const cached = readStreakState(storage, ownerId);
  assert.equal(cached.currentStreak, 3);
  assert.equal(cached.longestStreak, 7);
  assert.equal(cached.todayStudied, true);
});

test('studyStreak: fetchConfirmedStreak falls back to cached streak when RPC fails', async () => {
  const storage = new MockStorage();
  const ownerId = 'usr_offline_789';

  const initialStreak = {
    currentStreak: 4,
    longestStreak: 6,
    todayStudied: false,
    lastStudyDate: '2026-10-28',
    timezone: 'Asia/Yangon',
    isGuest: false,
  };
  writeStreakState(storage, ownerId, initialStreak);

  const mockFailingClient = {
    rpc: async () => {
      return { data: null, error: { message: 'Network offline' } };
    },
  };

  const result = await fetchConfirmedStreak({
    client: mockFailingClient,
    ownerId,
    storage,
  });

  assert.equal(result.currentStreak, 4);
  assert.equal(result.longestStreak, 6);
  assert.equal(result.todayStudied, false);
});
