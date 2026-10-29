import test from 'node:test';
import assert from 'node:assert/strict';

import { createStorageOwner } from '../src/lib/storageOwner.js';
import { isPreferencesSyncEnabled } from '../src/lib/preferencesSyncGate.js';
import {
  sanitizeSettings,
  sanitizeActiveLanguage,
  SUPPORTED_SETTINGS_KEYS,
} from '../src/lib/preferencesSyncSchema.js';
import {
  readPendingPreferences,
  writePendingPreferences,
} from '../src/lib/preferencesSyncStorage.js';
import { createPreferencesSyncService } from '../src/lib/preferencesSyncService.js';
import { createPreferencesSyncController } from '../src/lib/preferencesSyncController.js';

const OWNER_A = '11111111-1111-4111-8111-111111111111';
const OWNER_B = '22222222-2222-4222-8222-222222222222';

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
  };
}

function createMockSupabaseClient({
  queryHandler = async () => ({ data: { settings: {}, active_language: 'zh', updated_at: '2026-01-01T00:00:00.000Z' }, error: null }),
  upsertHandler = async () => ({ data: { settings: {}, active_language: 'zh', updated_at: '2026-01-01T00:00:00.000Z' }, error: null }),
} = {}) {
  let callCount = 0;
  const calls = [];

  return {
    getCallCount: () => callCount,
    getCalls: () => calls,
    from: (table) => {
      assert.equal(table, 'user_preferences');
      return {
        select: (fields) => ({
          eq: (col, val) => ({
            maybeSingle: async () => {
              callCount++;
              calls.push({ op: 'select', fields, col, val });
              return await queryHandler({ fields, col, val });
            },
          }),
        }),
        upsert: (payload, opts) => ({
          select: (fields) => ({
            maybeSingle: async () => {
              callCount++;
              calls.push({ op: 'upsert', payload, opts, fields });
              return await upsertHandler({ payload, opts, fields });
            },
          }),
        }),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Capability Gate
// ---------------------------------------------------------------------------
test('Capability Gate: disabled by default and requires configured backend', () => {
  // Disabled by default
  assert.equal(isPreferencesSyncEnabled({}), false);
  assert.equal(isPreferencesSyncEnabled({ VITE_ACCOUNT_PREFERENCES_SYNC_ENABLED: 'false' }), false);

  // Enabled flag but missing Supabase configuration
  assert.equal(
    isPreferencesSyncEnabled({
      VITE_ACCOUNT_PREFERENCES_SYNC_ENABLED: 'true',
    }),
    false
  );

  // Enabled flag with invalid URL
  assert.equal(
    isPreferencesSyncEnabled({
      VITE_ACCOUNT_PREFERENCES_SYNC_ENABLED: 'true',
      VITE_SUPABASE_URL: 'not-a-url',
      VITE_SUPABASE_ANON_KEY: 'eyJh.eyJi.c',
    }),
    false
  );

  // Enabled flag with valid configuration
  assert.equal(
    isPreferencesSyncEnabled({
      VITE_ACCOUNT_PREFERENCES_SYNC_ENABLED: 'true',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_12345678901234567890',
    }),
    true
  );
});

// ---------------------------------------------------------------------------
// 2. Schema & Sanitization
// ---------------------------------------------------------------------------
test('Schema & Sanitization: strips unknown keys and sanitizes values to in-scope defaults', () => {
  const raw = {
    dailyGoal: 50,
    cardsPerSession: 30,
    cardOrder: 'shuffle',
    showPinyin: false,
    showBurmese: true,
    translationLanguage: 'burmese',
    autoPlayAudio: true,
    speechRate: 'slow',
    accentByLanguage: { zh: 'zh-TW', ja: 'ja-JP', invalid: 'too-long-'.repeat(10) },
    unsupportedKey: 'malicious',
    anotherUnknown: 12345,
  };

  const sanitized = sanitizeSettings(raw);

  // All 9 in-scope keys present
  for (const key of SUPPORTED_SETTINGS_KEYS) {
    assert.ok(Object.hasOwn(sanitized, key), `Missing key ${key}`);
  }

  // Unknown keys stripped
  assert.equal(Object.hasOwn(sanitized, 'unsupportedKey'), false);
  assert.equal(Object.hasOwn(sanitized, 'anotherUnknown'), false);

  // Valid values retained
  assert.equal(sanitized.dailyGoal, 50);
  assert.equal(sanitized.cardOrder, 'shuffle');
  assert.equal(sanitized.showPinyin, false);
  assert.equal(sanitized.translationLanguage, 'burmese');
  assert.equal(sanitized.accentByLanguage.zh, 'zh-TW');

  // Invalid accents stripped
  assert.equal(sanitized.accentByLanguage.invalid, undefined);

  // Active language sanitization
  assert.equal(sanitizeActiveLanguage('ja'), 'ja');
  assert.equal(sanitizeActiveLanguage('en'), 'en');
  assert.equal(sanitizeActiveLanguage('zh'), 'zh');
  assert.equal(sanitizeActiveLanguage('fr'), 'zh'); // unsupported falls back to zh
  assert.equal(sanitizeActiveLanguage(null), 'zh');
});

// ---------------------------------------------------------------------------
// 3. Initial Restore
// ---------------------------------------------------------------------------
test('Initial Restore: restores verified account preferences and active language from cloud', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);

  const mockClient = createMockSupabaseClient({
    queryHandler: async () => ({
      data: {
        settings: {
          dailyGoal: 50,
          cardsPerSession: 20,
          cardOrder: 'shuffle',
          showPinyin: false,
        },
        active_language: 'ja',
        updated_at: '2026-01-01T12:00:00.000Z',
      },
      error: null,
    }),
  });

  const service = createPreferencesSyncService({
    storageOwner,
    getClient: () => mockClient,
  });

  const res = await service.restorePreferences({
    accountId: OWNER_A,
    isCurrent: () => true,
  });

  assert.equal(res.status, 'saved');
  assert.equal(res.settings.dailyGoal, 50);
  assert.equal(res.settings.showPinyin, false);
  assert.equal(res.activeLanguage, 'ja');

  // Stored in owner-scoped local storage
  const scope = storageOwner.scope(OWNER_A);
  const localPrefs = JSON.parse(scope.getItem('preferences'));
  assert.equal(localPrefs.dailyGoal, 50);
  assert.equal(localPrefs.showPinyin, false);
  assert.equal(scope.getItem('language'), 'ja');
});

// ---------------------------------------------------------------------------
// 4. Conflict Protection during Restore
// ---------------------------------------------------------------------------
test('Conflict Protection: local edits made while restore is pending are NOT overwritten by cloud values', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);

  let resolveCloudQuery;
  const deferredCloudQuery = new Promise((resolve) => {
    resolveCloudQuery = resolve;
  });

  const mockClient = createMockSupabaseClient({
    queryHandler: async () => {
      await deferredCloudQuery;
      return {
        data: {
          settings: {
            dailyGoal: 20, // Cloud has 20
            showPinyin: false, // Cloud has false
            showBurmese: false, // Cloud has false
          },
          active_language: 'zh',
          updated_at: '2026-01-01T12:00:00.000Z',
        },
        error: null,
      };
    },
  });

  let restoredAppliedSettings = null;
  const controller = createPreferencesSyncController({
    service: createPreferencesSyncService({
      storageOwner,
      getClient: () => mockClient,
    }),
    allowOnline: true,
    onRestoreApplied: ({ settings }) => {
      restoredAppliedSettings = settings;
    },
  });

  // Start initial account restore
  const accountPromise = controller.setAccount({ id: OWNER_A, generation: 1 });
  assert.equal(controller.getState().status, 'restoring');

  // While restore is in flight: user explicitly edits dailyGoal to 50!
  await controller.onLocalChange({
    settings: { dailyGoal: 50 },
    activeLanguage: 'zh',
    changedKey: 'dailyGoal',
  });

  // Now cloud response arrives
  resolveCloudQuery();
  await accountPromise;

  // Local dailyGoal: 50 is preserved, while cloud showPinyin: false and showBurmese: false are adopted!
  assert.ok(restoredAppliedSettings);
  assert.equal(restoredAppliedSettings.dailyGoal, 50, 'Local edit must be preserved over cloud default');
  assert.equal(restoredAppliedSettings.showPinyin, false, 'Non-conflicting cloud value must be adopted');
  assert.equal(restoredAppliedSettings.showBurmese, false, 'Non-conflicting cloud value must be adopted');
});

// ---------------------------------------------------------------------------
// 5. Default Overwrite Prevention
// ---------------------------------------------------------------------------
test('Default Overwrite Prevention: initial defaults do NOT overwrite cloud values before hydration finishes', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);

  let upsertCalled = false;
  const mockClient = createMockSupabaseClient({
    queryHandler: async () => ({
      data: {
        settings: { dailyGoal: 50, cardOrder: 'shuffle' },
        active_language: 'ja',
        updated_at: '2026-01-01T12:00:00.000Z',
      },
      error: null,
    }),
    upsertHandler: async () => {
      upsertCalled = true;
      return { data: {}, error: null };
    },
  });

  const controller = createPreferencesSyncController({
    service: createPreferencesSyncService({
      storageOwner,
      getClient: () => mockClient,
    }),
    allowOnline: true,
  });

  // User signs in; local storage starts with empty defaults
  await controller.setAccount({ id: OWNER_A, generation: 1 });

  // No upsert was triggered!
  assert.equal(upsertCalled, false, 'Initial local defaults must never be sent to overwrite cloud settings');
  assert.equal(controller.getState().status, 'saved');
  assert.equal(controller.getState().isHydrated, true);
});

// ---------------------------------------------------------------------------
// 6. Immediate Local Persistence
// ---------------------------------------------------------------------------
test('Immediate Local Persistence: preference and language changes write synchronously to storage', () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);

  const scope = storageOwner.scope(OWNER_A);

  // Synchronous preference write
  scope.setItem('preferences', JSON.stringify({ dailyGoal: 30, showPinyin: true }));
  const storedPrefs = JSON.parse(scope.getItem('preferences'));
  assert.equal(storedPrefs.dailyGoal, 30);

  // Synchronous language write
  scope.setItem('language', 'ja');
  assert.equal(scope.getItem('language'), 'ja');
});

// ---------------------------------------------------------------------------
// 7. Pending State & Explicit Retry
// ---------------------------------------------------------------------------
test('Pending State & Explicit Retry: network failure marks failed state; explicit retry resends mutation', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);

  let shouldFail = true;
  let upsertCount = 0;

  const mockClient = createMockSupabaseClient({
    queryHandler: async () => ({
      data: { settings: {}, active_language: 'zh' },
      error: null,
    }),
    upsertHandler: async () => {
      upsertCount++;
      if (shouldFail) {
        return { data: null, error: { message: 'Network offline' } };
      }
      return {
        data: { settings: { dailyGoal: 50 }, active_language: 'zh', updated_at: '2026-01-01T12:00:00.000Z' },
        error: null,
      };
    },
  });

  const controller = createPreferencesSyncController({
    service: createPreferencesSyncService({
      storageOwner,
      getClient: () => mockClient,
    }),
    allowOnline: true,
  });

  await controller.setAccount({ id: OWNER_A, generation: 1 });

  // Make local change while offline
  await controller.onLocalChange({
    settings: { dailyGoal: 50 },
    activeLanguage: 'zh',
    changedKey: 'dailyGoal',
  });

  assert.equal(controller.getState().status, 'failed');
  assert.equal(controller.getState().error, 'Network offline');
  assert.equal(upsertCount, 1);

  // Check pending record in storage
  const pending = readPendingPreferences(storage, OWNER_A).state;
  assert.ok(pending);
  assert.equal(pending.status, 'failed');
  assert.equal(pending.settings.dailyGoal, 50);

  // Network returns; user clicks Retry
  shouldFail = false;
  await controller.retry();

  assert.equal(controller.getState().status, 'saved');
  assert.equal(controller.getState().error, null);
  assert.equal(upsertCount, 2);

  // Pending record cleared
  assert.equal(readPendingPreferences(storage, OWNER_A).state, null);
});

// ---------------------------------------------------------------------------
// 8. Newer Local Edits Preserved
// ---------------------------------------------------------------------------
test('Newer Local Edits Preserved: edit made while earlier save is in-flight preserves newer mutation', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);

  let resolveSave1;
  const deferredSave1 = new Promise((resolve) => {
    resolveSave1 = resolve;
  });

  let saveCount = 0;
  const mockClient = createMockSupabaseClient({
    queryHandler: async () => ({
      data: { settings: {}, active_language: 'zh' },
      error: null,
    }),
    upsertHandler: async ({ payload }) => {
      saveCount++;
      if (saveCount === 1) {
        await deferredSave1;
      }
      return {
        data: { settings: payload.settings, active_language: payload.active_language, updated_at: '2026-01-01T12:00:00.000Z' },
        error: null,
      };
    },
  });

  const service = createPreferencesSyncService({
    storageOwner,
    getClient: () => mockClient,
  });

  // Save 1 starts (localMutationId = 1)
  const save1Promise = service.savePreferences({
    accountId: OWNER_A,
    isCurrent: () => true,
    settings: { dailyGoal: 20 },
    activeLanguage: 'zh',
    localMutationId: 1,
    changedKeys: ['dailyGoal'],
  });

  // Before Save 1 completes: user performs Save 2 (localMutationId = 2)
  writePendingPreferences(storage, OWNER_A, {
    ownerId: OWNER_A,
    localMutationId: 2,
    settings: { dailyGoal: 50 },
    activeLanguage: 'zh',
    changedKeys: ['dailyGoal'],
    status: 'saving',
    error: null,
    updatedAt: new Date().toISOString(),
  });

  // Save 1 resolves
  resolveSave1();
  const save1Res = await save1Promise;

  // Save 1 detects that newer mutation 2 is pending and does NOT clear it
  assert.equal(save1Res.status, 'pending');
  assert.equal(save1Res.newerPending, true);

  const pending = readPendingPreferences(storage, OWNER_A).state;
  assert.ok(pending);
  assert.equal(pending.localMutationId, 2);
  assert.equal(pending.settings.dailyGoal, 50);
});

// ---------------------------------------------------------------------------
// 9. Account Switching & Logout Isolation
// ---------------------------------------------------------------------------
test('Account Switching & Logout Isolation: Account A preferences never leak to Account B or guest', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });

  // Seed guest storage
  storageOwner.setOwner(null);
  storageOwner.scope().setItem('preferences', JSON.stringify({ dailyGoal: 10, showPinyin: true }));
  storageOwner.scope().setItem('language', 'zh');

  // Seed User A storage
  storageOwner.setOwner(OWNER_A);
  storageOwner.scope().setItem('preferences', JSON.stringify({ dailyGoal: 50, showPinyin: false }));
  storageOwner.scope().setItem('language', 'ja');

  // Seed User B storage
  storageOwner.setOwner(OWNER_B);
  storageOwner.scope().setItem('preferences', JSON.stringify({ dailyGoal: 30, showPinyin: true }));
  storageOwner.scope().setItem('language', 'en');

  // Verify User A scope
  storageOwner.setOwner(OWNER_A);
  const aPrefs = JSON.parse(storageOwner.scope().getItem('preferences'));
  assert.equal(aPrefs.dailyGoal, 50);
  assert.equal(storageOwner.scope().getItem('language'), 'ja');

  // Verify User B scope
  storageOwner.setOwner(OWNER_B);
  const bPrefs = JSON.parse(storageOwner.scope().getItem('preferences'));
  assert.equal(bPrefs.dailyGoal, 30);
  assert.equal(storageOwner.scope().getItem('language'), 'en');

  // Verify Guest scope
  storageOwner.setOwner(null);
  const guestPrefs = JSON.parse(storageOwner.scope().getItem('preferences'));
  assert.equal(guestPrefs.dailyGoal, 10);
  assert.equal(storageOwner.scope().getItem('language'), 'zh');

  // Test in-flight abort on account change
  let resolveSlowQuery;
  const deferredSlowQuery = new Promise((resolve) => {
    resolveSlowQuery = resolve;
  });

  const mockClient = createMockSupabaseClient({
    queryHandler: async () => {
      await deferredSlowQuery;
      return {
        data: {
          settings: { dailyGoal: 99 },
          active_language: 'zh',
          updated_at: '2026-01-01T12:00:00.000Z',
        },
        error: null,
      };
    },
  });

  const service = createPreferencesSyncService({
    storageOwner,
    getClient: () => mockClient,
  });

  storageOwner.setOwner(OWNER_A);
  let isA = true;
  const restorePromise = service.restorePreferences({
    accountId: OWNER_A,
    isCurrent: () => isA,
  });

  // Switch account to B while A's restore is pending
  isA = false;
  storageOwner.setOwner(OWNER_B);

  // Restore resolves
  resolveSlowQuery();
  const restoreRes = await restorePromise;

  // Must report account_changed and NOT overwrite B's data
  assert.equal(restoreRes.status, 'account_changed');
  const bPrefsAfter = JSON.parse(storageOwner.scope(OWNER_B).getItem('preferences'));
  assert.equal(bPrefsAfter.dailyGoal, 30, 'Account B must not be contaminated by Account A response');
});

// ---------------------------------------------------------------------------
// 10. Guest Isolation: Zero Cloud Requests
// ---------------------------------------------------------------------------
test('Guest Isolation: guest mode makes ZERO cloud requests', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(null); // Guest

  const mockClient = createMockSupabaseClient();
  const controller = createPreferencesSyncController({
    service: createPreferencesSyncService({
      storageOwner,
      getClient: () => mockClient,
    }),
    allowOnline: true,
  });

  await controller.setAccount(null);
  assert.equal(controller.getState().status, 'local');

  await controller.onLocalChange({
    settings: { dailyGoal: 50 },
    activeLanguage: 'ja',
    changedKey: 'dailyGoal',
  });

  assert.equal(mockClient.getCallCount(), 0, 'Guest mode must never make network calls');
});

// ---------------------------------------------------------------------------
// 11. Gate-Off Behavior: Zero Cloud Requests
// ---------------------------------------------------------------------------
test('Gate-Off Behavior: when gate is disabled, verified accounts make ZERO cloud requests', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);

  const mockClient = createMockSupabaseClient();
  const controller = createPreferencesSyncController({
    service: createPreferencesSyncService({
      storageOwner,
      getClient: () => mockClient,
    }),
    allowOnline: false, // Capability gate OFF
  });

  await controller.setAccount({ id: OWNER_A, generation: 1 });
  assert.equal(controller.getState().status, 'local');

  await controller.onLocalChange({
    settings: { dailyGoal: 50 },
    activeLanguage: 'ja',
    changedKey: 'dailyGoal',
  });

  assert.equal(mockClient.getCallCount(), 0, 'Gate-off must never make network calls');
});
