import test from 'node:test';
import assert from 'node:assert/strict';

import { createStorageOwner } from '../src/lib/storageOwner.js';
import { isLearningExportResetEnabled } from '../src/lib/learningExportResetGate.js';
import { createLearningExportService, collectLocalLearning } from '../src/lib/learningExportService.js';
import { createLearningResetService } from '../src/lib/learningResetService.js';
import {
  readPendingLearningReset,
  writePendingLearningReset,
  getPendingLearningResetKey,
} from '../src/lib/learningResetStorage.js';
import { getPendingPreferencesKey } from '../src/lib/preferencesSyncStorage.js';
import { createOnlineSyncService } from '../src/lib/onlineSyncService.js';
import { writePendingSyncRequest, readPendingSyncRequest } from '../src/lib/onlineSyncRequest.js';

const OWNER_A = '11111111-1111-4111-8111-111111111111';
const OWNER_B = '22222222-2222-4222-8222-222222222222';

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  let throwOnSetPattern = null;
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (throwOnSetPattern && throwOnSetPattern(k)) {
        throw new Error(`Storage quota exceeded for key: ${k}`);
      }
      map.set(k, String(v));
    },
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    setThrowPattern: (fn) => { throwOnSetPattern = fn; },
    _map: map,
  };
}

function createMockSupabaseClient({
  snapshotHandler = async () => ({
    data: {
      schema_version: 1,
      user_id: OWNER_A,
      reset_version: '0',
      server_time: new Date().toISOString(),
      streak: { current_streak: 3, longest_streak: 5, today_studied: true },
      items: [
        {
          item_key: 'zh:saved_words:你好:nǐ hǎo',
          language: 'zh',
          kind: 'saved_words',
          written_form: '你好',
          reading: 'nǐ hǎo',
          data: { english: 'Hello' },
          observed_at: '2026-01-01T00:00:00.000Z',
          revision: '1',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      tombstones: [],
    },
    error: null,
  }),
  resetHandler = async ({ p_request_id, p_expected_reset_version }) => ({
    data: {
      status: 'reset',
      persistence: 'cloud',
      schema_version: 1,
      user_id: OWNER_A,
      request_id: p_request_id,
      reset_version: String(BigInt(p_expected_reset_version) + 1n),
      previous_reset_version: String(p_expected_reset_version),
      items_reset: true,
      replayed: false,
    },
    error: null,
  }),
} = {}) {
  let callCount = 0;
  const calls = [];

  return {
    getCallCount: () => callCount,
    getCalls: () => calls,
    rpc: async (fn, params) => {
      callCount++;
      calls.push({ fn, params });
      if (fn === 's2s_account_snapshot') {
        return await snapshotHandler(params);
      }
      if (fn === 's2s_reset_learning') {
        return await resetHandler(params);
      }
      return { data: null, error: null };
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Capability Gate
// ---------------------------------------------------------------------------
test('Capability Gate: disabled by default and requires configured backend', () => {
  assert.equal(isLearningExportResetEnabled({}), false);
  assert.equal(isLearningExportResetEnabled({ VITE_ACCOUNT_EXPORT_RESET_ENABLED: 'false' }), false);

  // Missing publishable key or URL
  assert.equal(
    isLearningExportResetEnabled({
      VITE_ACCOUNT_EXPORT_RESET_ENABLED: 'true',
    }),
    false
  );

  // Valid configuration
  assert.equal(
    isLearningExportResetEnabled({
      VITE_ACCOUNT_EXPORT_RESET_ENABLED: 'true',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_12345678901234567890',
    }),
    true
  );
});

// ---------------------------------------------------------------------------
// 2. Guest Export
// ---------------------------------------------------------------------------
test('Guest Export: exports actual guest-owned learning data without credentials or auth storage', () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(null); // Guest

  const scope = storageOwner.scope(null);
  scope.setItem('language', 'zh');
  scope.setItem('preferences', JSON.stringify({ dailyGoal: 30, showPinyin: true }));
  scope.setItem('zh_saved_words', JSON.stringify([{ phrase: '你好', reading: 'nǐ hǎo' }]));
  scope.setItem('ja_review_cards', JSON.stringify([{ character: '猫', pronunciation: 'ねこ' }]));

  // Fake auth credentials in storage that must NEVER be exported
  storage.setItem('sb-123-auth-token', JSON.stringify({ access_token: 'secret', user: { email: 'leak@example.com' } }));

  const service = createLearningExportService({
    storageOwner,
    readPreferences: () => ({ dailyGoal: 30, showPinyin: true }),
  });

  const exported = service.exportGuestLearningData();

  assert.equal(exported.exportVersion, 1);
  assert.equal(exported.scope, 'guest');
  assert.equal(exported.activeLanguage, 'zh');
  assert.equal(exported.preferences.dailyGoal, 30);
  assert.equal(exported.learning.zh.saved_words.length, 1);
  assert.equal(exported.learning.zh.saved_words[0].phrase, '你好');
  assert.equal(exported.learning.ja.review_cards.length, 1);
  assert.equal(exported.learning.ja.review_cards[0].character, '猫');

  // Verify no sensitive keys leaked
  const str = JSON.stringify(exported);
  assert.equal(str.includes('secret'), false);
  assert.equal(str.includes('access_token'), false);
  assert.equal(str.includes('leak@example.com'), false);
});

// ---------------------------------------------------------------------------
// 3. Account Export: Validated Cloud Snapshot & Pending Disclosure
// ---------------------------------------------------------------------------
test('Account Export: exports validated cloud snapshot and clearly discloses pending device changes', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);

  const scope = storageOwner.scope(OWNER_A);
  scope.setItem('language', 'zh');

  // Seed learning document with sync state containing 1 dirty item and 1 deletion
  const syncState = {
    schemaVersion: 1,
    ownerId: OWNER_A,
    resetVersion: '0',
    records: {
      'zh:saved_words:本地新词:': { status: 'dirty', updatedAt: '2026-01-01T01:00:00.000Z', localMutationId: 2 },
      'zh:saved_words:删除词:': { status: 'deleted', deletedAt: '2026-01-01T01:05:00.000Z', localMutationId: 3 },
    },
  };

  scope.commitLearningDocument(null, {
    version: 1,
    revision: 1,
    tables: {
      zh_saved_words: JSON.stringify([{ phrase: '本地新词' }]),
    },
    cloudSync: syncState,
    guestImport: { fingerprint: '0'.repeat(64), choice: 'account-only', decidedAt: '2026-01-01', handled: {} },
  });

  // Write pending sync request envelope
  const pendingReqId = '33333333-3333-4333-8333-333333333333';
  writePendingSyncRequest(storage, OWNER_A, {
    schemaVersion: 1,
    ownerId: OWNER_A,
    requestId: pendingReqId,
    resetVersion: '0',
    mutations: [{ op: 'upsert', client_id: 'zh:saved_words:本地新词:' }],
    itemsSnapshot: { 'zh:saved_words:本地新词:': { status: 'dirty' } },
    createdAt: '2026-01-01T01:10:00.000Z',
  });

  const mockClient = createMockSupabaseClient();
  const service = createLearningExportService({
    storageOwner,
    getClient: () => mockClient,
    readPreferences: () => ({ dailyGoal: 50 }),
  });

  const exported = await service.exportAccountLearningData({
    accountId: OWNER_A,
    isCurrent: () => true,
  });

  assert.equal(exported.exportVersion, 1);
  assert.equal(exported.scope, 'account');
  assert.equal(exported.accountId, OWNER_A);

  // Cloud snapshot verified
  assert.ok(exported.cloudSnapshot);
  assert.equal(exported.cloudSnapshot.resetVersion, '0');
  assert.equal(exported.cloudSnapshot.itemsCount, 1);
  assert.equal(exported.cloudSnapshot.items[0].written_form, '你好');

  // Pending changes disclosed honestly
  assert.ok(exported.pendingDeviceChanges);
  assert.equal(exported.pendingDeviceChanges.pendingCount, 2);
  assert.equal(exported.pendingDeviceChanges.dirtyItems.length, 1);
  assert.equal(exported.pendingDeviceChanges.dirtyItems[0].key, 'zh:saved_words:本地新词:');
  assert.equal(exported.pendingDeviceChanges.pendingDeletions.length, 1);
  assert.equal(exported.pendingDeviceChanges.pendingEnvelope.requestId, pendingReqId);

  // Local learning present
  assert.equal(exported.localLearning.zh.saved_words.length, 1);
  assert.equal(exported.localLearning.zh.saved_words[0].phrase, '本地新词');
});

// ---------------------------------------------------------------------------
// 4. Account Export Error Handling: Never Produce Empty Success File
// ---------------------------------------------------------------------------
test('Account Export Error Handling: network failure fails closed with retryable error and no empty download', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);

  const mockClient = createMockSupabaseClient({
    snapshotHandler: async () => ({
      data: null,
      error: { message: 'Cloud service unavailable' },
    }),
  });

  const service = createLearningExportService({
    storageOwner,
    getClient: () => mockClient,
  });

  await assert.rejects(
    async () => {
      await service.exportAccountLearningData({
        accountId: OWNER_A,
        isCurrent: () => true,
      });
    },
    /Cloud service unavailable/
  );
});

// ---------------------------------------------------------------------------
// 5. Guest Reset: Resets Guest Learning Only, Preserves Preferences & Other Accounts
// ---------------------------------------------------------------------------
test('Guest Reset: resets guest learning only and preserves guest preferences and other accounts', () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });

  // Seed guest
  storageOwner.setOwner(null);
  const guestScope = storageOwner.scope(null);
  guestScope.setItem('zh_saved_words', JSON.stringify([{ phrase: '你好' }]));
  guestScope.setItem('ja_review_cards', JSON.stringify([{ character: '犬' }]));
  guestScope.setItem('preferences', JSON.stringify({ dailyGoal: 30 }));

  // Seed User A
  storageOwner.setOwner(OWNER_A);
  const aScope = storageOwner.scope(OWNER_A);
  aScope.setItem('zh_saved_words', JSON.stringify([{ phrase: '用户A词汇' }]));

  // Execute guest reset
  storageOwner.setOwner(null);
  const service = createLearningResetService({ storageOwner });
  const res = service.resetGuestLearning();

  assert.equal(res.status, 'success');
  assert.equal(res.scope, 'guest');

  // Guest learning tables are cleared
  assert.equal(guestScope.getItem('zh_saved_words'), '[]');
  assert.equal(guestScope.getItem('ja_review_cards'), '[]');

  // Guest preferences preserved
  assert.equal(JSON.parse(guestScope.getItem('preferences')).dailyGoal, 30);

  // User A data untouched
  storageOwner.setOwner(OWNER_A);
  assert.equal(JSON.parse(aScope.getItem('zh_saved_words'))[0].phrase, '用户A词汇');
});

// ---------------------------------------------------------------------------
// 6. Account Reset Server Confirmation: Clears Local Learning and Advances Generation
// ---------------------------------------------------------------------------
test('Account Reset Server Confirmation: clears local learning and advances reset version upon confirmed server response', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);

  const scope = storageOwner.scope(OWNER_A);

  // Seed local document with learning tables and sync state
  scope.commitLearningDocument(null, {
    version: 1,
    revision: 1,
    tables: {
      zh_saved_words: JSON.stringify([{ phrase: '旧词汇' }]),
      ja_review_cards: JSON.stringify([{ character: '猫' }]),
    },
    cloudSync: {
      schemaVersion: 1,
      ownerId: OWNER_A,
      resetVersion: '0',
      records: { 'zh:saved_words:旧词汇:': { status: 'synced', cloudRevision: '1' } },
    },
    guestImport: { fingerprint: '0'.repeat(64), choice: 'account-only', decidedAt: '2026-01-01', handled: {} },
  });

  // Seed pending sync envelope
  writePendingSyncRequest(storage, OWNER_A, {
    schemaVersion: 1,
    ownerId: OWNER_A,
    requestId: '44444444-4444-4444-8444-444444444444',
    resetVersion: '0',
    mutations: [{ op: 'upsert', client_id: 'zh:saved_words:旧词汇:' }],
    itemsSnapshot: { 'zh:saved_words:旧词汇:': { status: 'synced' } },
    createdAt: '2026-01-01T01:10:00.000Z',
  });

  const mockClient = createMockSupabaseClient();
  const service = createLearningResetService({
    storageOwner,
    getClient: () => mockClient,
  });

  const res = await service.resetAccountLearning({
    accountId: OWNER_A,
    isCurrent: () => true,
  });

  assert.equal(res.status, 'success');
  assert.equal(res.serverResult.reset_version, '1');

  // Authoritative document reset
  const doc = scope.readLearningDocument().value;
  assert.equal(doc.tables.zh_saved_words, '[]');
  assert.equal(doc.tables.ja_review_cards, '[]');
  assert.equal(doc.cloudSync.resetVersion, '1');
  assert.deepEqual(doc.cloudSync.records, {});

  // Stale in-flight sync request envelope cleared
  assert.equal(readPendingSyncRequest(storage, OWNER_A).request, null);

  // Pending reset record cleared
  assert.equal(readPendingLearningReset(storage, OWNER_A).state, null);
});

// ---------------------------------------------------------------------------
// 7. Network Uncertainty & Replay-Safe Identical Retry
// ---------------------------------------------------------------------------
test('Network Uncertainty & Replay-Safe Identical Retry: reuses durable request ID across retries', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);

  let attempt = 0;
  let capturedRequestId1 = null;
  let capturedRequestId2 = null;

  const mockClient = createMockSupabaseClient({
    resetHandler: async (params) => {
      attempt++;
      if (attempt === 1) {
        capturedRequestId1 = params.p_request_id;
        return { data: null, error: { message: 'Network connection dropped' } };
      }
      capturedRequestId2 = params.p_request_id;
      return {
        data: {
          status: 'reset',
          persistence: 'cloud',
          schema_version: 1,
          user_id: OWNER_A,
          request_id: params.p_request_id,
          reset_version: '1',
          previous_reset_version: '0',
          items_reset: true,
          replayed: true,
        },
        error: null,
      };
    },
  });

  const service = createLearningResetService({
    storageOwner,
    getClient: () => mockClient,
  });

  // Call 1: network failure
  const res1 = await service.resetAccountLearning({
    accountId: OWNER_A,
    isCurrent: () => true,
  });

  assert.equal(res1.status, 'failed');
  assert.equal(res1.error, 'Network connection dropped');

  // Pending record exists with captured request ID
  const pendingAfterFail = readPendingLearningReset(storage, OWNER_A).state;
  assert.ok(pendingAfterFail);
  assert.equal(pendingAfterFail.status, 'failed');
  assert.equal(pendingAfterFail.requestId, capturedRequestId1);

  // Call 2: retry
  const res2 = await service.resetAccountLearning({
    accountId: OWNER_A,
    isCurrent: () => true,
  });

  assert.equal(res2.status, 'success');
  assert.equal(capturedRequestId1, capturedRequestId2, 'Retried reset must reuse the identical request_id');
});

// ---------------------------------------------------------------------------
// 8. Never Infer Success from Error
// ---------------------------------------------------------------------------
test('Never Infer Success from Error: error preserves local data and records failed state', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);

  const scope = storageOwner.scope(OWNER_A);
  scope.commitLearningDocument(null, {
    version: 1,
    revision: 1,
    tables: { zh_saved_words: JSON.stringify([{ phrase: '坚持不被清空' }]) },
    cloudSync: { schemaVersion: 1, ownerId: OWNER_A, resetVersion: '0', records: {} },
    guestImport: { fingerprint: '0'.repeat(64), choice: 'account-only', decidedAt: '2026-01-01', handled: {} },
  });

  const mockClient = createMockSupabaseClient({
    resetHandler: async () => ({
      data: null,
      error: { message: 'RESET_VERSION_CHANGED', code: '40001' },
    }),
  });

  const service = createLearningResetService({
    storageOwner,
    getClient: () => mockClient,
  });

  const res = await service.resetAccountLearning({
    accountId: OWNER_A,
    isCurrent: () => true,
  });

  assert.equal(res.status, 'failed');

  // Local data is preserved completely
  const doc = scope.readLearningDocument().value;
  assert.equal(JSON.parse(doc.tables.zh_saved_words)[0].phrase, '坚持不被清空');
});

// ---------------------------------------------------------------------------
// 9. Local Cleanup Failure Recovery Without Repeated Server RPC
// ---------------------------------------------------------------------------
test('Local Cleanup Failure Recovery: offers local recovery without starting another reset', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);

  const scope = storageOwner.scope(OWNER_A);
  scope.commitLearningDocument(null, {
    version: 1,
    revision: 1,
    tables: { zh_saved_words: JSON.stringify([{ phrase: '旧数据' }]) },
    cloudSync: { schemaVersion: 1, ownerId: OWNER_A, resetVersion: '0', records: {} },
    guestImport: { fingerprint: '0'.repeat(64), choice: 'account-only', decidedAt: '2026-01-01', handled: {} },
  });

  let rpcCallCount = 0;
  const mockClient = createMockSupabaseClient({
    resetHandler: async (params) => {
      rpcCallCount++;
      return {
        data: {
          status: 'reset',
          persistence: 'cloud',
          schema_version: 1,
          user_id: OWNER_A,
          request_id: params.p_request_id,
          reset_version: '1',
          previous_reset_version: '0',
          items_reset: true,
          replayed: false,
        },
        error: null,
      };
    },
  });

  // Inject storage quota write failure for learning_document_v1
  storage.setThrowPattern((key) => key.includes('learning_document_v1'));

  const service = createLearningResetService({
    storageOwner,
    getClient: () => mockClient,
  });

  // 1. Initial reset call: server succeeds, but local storage write throws
  const res1 = await service.resetAccountLearning({
    accountId: OWNER_A,
    isCurrent: () => true,
  });

  assert.equal(res1.status, 'local_cleanup_failed');
  assert.equal(rpcCallCount, 1);

  // Pending record is preserved in 'server_confirmed' state
  const pending = readPendingLearningReset(storage, OWNER_A).state;
  assert.equal(pending.status, 'server_confirmed');

  // 2. Storage quota clears; user clicks "Retry local cleanup"
  storage.setThrowPattern(null);

  const res2 = service.retryLocalAccountCleanup({
    accountId: OWNER_A,
    isCurrent: () => true,
  });

  assert.equal(res2.status, 'success');
  // Crucial: ZERO additional RPC calls to server!
  assert.equal(rpcCallCount, 1, 'Local cleanup retry must not make another server reset RPC call');

  // Local data is now clean
  const doc = scope.readLearningDocument().value;
  assert.equal(doc.tables.zh_saved_words, '[]');
  assert.equal(doc.cloudSync.resetVersion, '1');
  assert.equal(readPendingLearningReset(storage, OWNER_A).state, null);
});

// ---------------------------------------------------------------------------
// 10. Account Switch Protection
// ---------------------------------------------------------------------------
test('Account Switch Protection: in-flight reset for Account A aborts when account switches to Account B', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);

  let resolveRpc;
  const deferredRpc = new Promise((resolve) => {
    resolveRpc = resolve;
  });

  const mockClient = createMockSupabaseClient({
    resetHandler: async (params) => {
      await deferredRpc;
      return {
        data: {
          status: 'reset',
          persistence: 'cloud',
          schema_version: 1,
          user_id: OWNER_A,
          request_id: params.p_request_id,
          reset_version: '1',
          previous_reset_version: '0',
          items_reset: true,
        },
        error: null,
      };
    },
  });

  const service = createLearningResetService({
    storageOwner,
    getClient: () => mockClient,
  });

  let isCurrentA = true;
  const resetPromise = service.resetAccountLearning({
    accountId: OWNER_A,
    isCurrent: () => isCurrentA,
  });

  // User logs out or switches to Account B while reset is in flight!
  isCurrentA = false;
  storageOwner.setOwner(OWNER_B);

  // Seed Account B data
  const bScope = storageOwner.scope(OWNER_B);
  bScope.setItem('zh_saved_words', JSON.stringify([{ phrase: '用户B的重要数据' }]));

  // Server completes
  resolveRpc();
  const res = await resetPromise;

  assert.equal(res.status, 'account_changed');

  // Account B data was not touched
  assert.equal(JSON.parse(bScope.getItem('zh_saved_words'))[0].phrase, '用户B的重要数据');
});


// ---------------------------------------------------------------------------
// 11. Data Integrity Regressions (Checkpoint 2)
// ---------------------------------------------------------------------------
test('Regression: collectLocalLearning must throw on corrupted JSON data rather than returning empty arrays', () => {
  const storage = createMemoryStorage({
    s2s_zh_saved_words: '{"invalid-json":',
  });
  const storageOwner = createStorageOwner({ storage: () => storage });
  const scope = storageOwner.scope(null);

  assert.throws(
    () => collectLocalLearning(scope),
    /corrupt|invalid|error/i,
    'Corrupt learning table data must throw actionable error'
  );
});

test('Regression: exportAccountLearningData must throw when pending metadata readers fail', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);

  storage.setItem(getPendingPreferencesKey(OWNER_A), '{invalid-json');

  const mockClient = createMockSupabaseClient();
  const service = createLearningExportService({
    storageOwner,
    getClient: () => mockClient,
  });

  await assert.rejects(
    () => service.exportAccountLearningData({ accountId: OWNER_A, isCurrent: () => true }),
    /export failed|pending|corrupt/i,
    'Corrupt pending metadata must fail export closed'
  );
});

test('Regression: resetGuestLearning must report failure when storage write fails', () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });

  storage.setThrowPattern(() => true);

  const service = createLearningResetService({ storageOwner });
  const res = service.resetGuestLearning();

  assert.equal(res.status, 'failed', 'Guest reset must not return success on write failure');
  assert.match(res.error, /storage|failed/i);
});

test('Regression: resetAccountLearning must strictly validate response binding (user_id, request_id, items_reset)', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);

  const mockClient = createMockSupabaseClient({
    resetHandler: async () => ({
      data: {
        status: 'reset',
        user_id: '99999999-9999-4999-8999-999999999999',
        request_id: 'bad-request-id',
        items_reset: false,
      },
      error: null,
    }),
  });

  const service = createLearningResetService({
    storageOwner,
    getClient: () => mockClient,
  });

  const res = await service.resetAccountLearning({
    accountId: OWNER_A,
    isCurrent: () => true,
  });

  assert.equal(res.status, 'failed', 'Invalid response binding must be rejected');
  assert.match(res.error, /invalid|mismatch|failed|confirm/i);
});

test('Regression: corrupt pending reset envelope must fail closed without network dispatch or replacement', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);

  const key = getPendingLearningResetKey(OWNER_A);
  storage.setItem(key, '{"ownerId":"' + OWNER_A + '", invalid');

  let rpcCalled = false;
  const mockClient = {
    rpc: async () => {
      rpcCalled = true;
      return { data: {}, error: null };
    },
  };

  const service = createLearningResetService({
    storageOwner,
    getClient: () => mockClient,
  });

  const res = await service.resetAccountLearning({
    accountId: OWNER_A,
    isCurrent: () => true,
  });

  assert.equal(res.status, 'failed');
  assert.equal(rpcCalled, false, 'Corrupt pending reset must not dispatch network request');
});

test('Regression: pre-reset sync ACK must NOT overwrite post-reset document generation or clear newer envelopes', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);
  const scope = storageOwner.scope(OWNER_A);

  const initialDoc = {
    version: 1,
    revision: 1,
    tables: { zh_saved_words: JSON.stringify([{ id: 'zh:saved_words:你好:nǐ hǎo' }]) },
    cloudSync: {
      schemaVersion: 1,
      ownerId: OWNER_A,
      resetVersion: '0',
      records: {
        'zh:saved_words:你好:nǐ hǎo': { status: 'dirty', localMutationId: 1 },
      },
    },
    guestImport: { fingerprint: '0'.repeat(64), choice: 'account-only', decidedAt: '2026-01-01', handled: {} },
  };
  scope.commitLearningDocument(null, initialDoc, {});

  let resolveSync;
  const deferredSync = new Promise((resolve) => { resolveSync = resolve; });

  const mockClient = {
    rpc: async (fn, params) => {
      if (fn === 's2s_apply_mutations') {
        await deferredSync;
        return {
          data: {
            status: 'committed',
            user_id: OWNER_A,
            request_id: params.p_request_id,
            reset_version: '0',
            acknowledged: [
              { client_id: 'zh:saved_words:你好:nǐ hǎo', server_revision: '1' },
            ],
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };

  const syncService = createOnlineSyncService({
    storageOwner,
    getClient: () => mockClient,
  });

  const syncPromise = syncService.performSync({
    accountId: OWNER_A,
    isCurrent: () => true,
  });

  const resetDoc = {
    version: 1,
    revision: 2,
    tables: { zh_saved_words: '[]' },
    cloudSync: {
      schemaVersion: 1,
      ownerId: OWNER_A,
      resetVersion: '1',
      records: {},
    },
    guestImport: { fingerprint: '0'.repeat(64), choice: 'account-only', decidedAt: '2026-01-01', handled: {} },
  };
  scope.commitLearningDocument(scope.readLearningDocument().raw, resetDoc, {});

  resolveSync();
  await syncPromise;

  const finalDoc = scope.readLearningDocument().value;
  assert.equal(finalDoc.cloudSync.resetVersion, '1', 'Pre-reset ACK must NOT rewrite resetVersion to 0');
  assert.equal(finalDoc.tables.zh_saved_words, '[]', 'Post-reset tables must NOT be contaminated');
});

test('Regression: repeat-safe local cleanup recovery must NOT wipe post-reset learning created after confirmed reset', () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);
  const scope = storageOwner.scope(OWNER_A);

  const postResetDoc = {
    version: 1,
    revision: 5,
    tables: { zh_saved_words: JSON.stringify([{ id: 'zh:saved_words:新词:xīn cí' }]) },
    cloudSync: {
      schemaVersion: 1,
      ownerId: OWNER_A,
      resetVersion: '1',
      records: {},
    },
    guestImport: { fingerprint: '0'.repeat(64), choice: 'account-only', decidedAt: '2026-01-01', handled: {} },
  };
  scope.commitLearningDocument(null, postResetDoc, {});

  writePendingLearningReset(storage, OWNER_A, {
    ownerId: OWNER_A,
    requestId: '11111111-2222-3333-4444-555555555555',
    expectedResetVersion: '0',
    status: 'server_confirmed',
    serverResult: {
      status: 'reset',
      reset_version: '1',
      previous_reset_version: '0',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const service = createLearningResetService({ storageOwner });
  const res = service.retryLocalAccountCleanup({ accountId: OWNER_A, isCurrent: () => true });

  assert.equal(res.status, 'success');
  const finalDoc = scope.readLearningDocument().value;
  assert.equal(finalDoc.cloudSync.resetVersion, '1');
  assert.notEqual(finalDoc.tables.zh_saved_words, '[]', 'Post-reset word must NOT be wiped by repeat cleanup');
});
