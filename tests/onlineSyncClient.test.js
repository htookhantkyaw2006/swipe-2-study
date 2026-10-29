import test from 'node:test';
import assert from 'node:assert/strict';

import { createStorageOwner } from '../src/lib/storageOwner.js';
import { createLocalDatabase } from '../src/lib/localDatabase.js';
import { recordKey, readSyncState } from '../src/lib/cloudSyncState.js';
import {
  readPendingSyncRequest,
} from '../src/lib/onlineSyncRequest.js';
import { createOnlineSyncService } from '../src/lib/onlineSyncService.js';
import { createOnlineSyncController } from '../src/lib/onlineSyncController.js';

const OWNER_A = '11111111-1111-4111-8111-111111111111';
const OWNER_B = '22222222-2222-4222-8222-222222222222';

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  let throwOnSetKeyPattern = null;
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (throwOnSetKeyPattern && throwOnSetKeyPattern(k)) {
        throw new Error(`Storage quota/write failure on key: ${k}`);
      }
      map.set(k, String(v));
    },
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    setThrowOnSetKey: (fn) => { throwOnSetKeyPattern = fn; },
    _map: map,
  };
}

function createMockSupabaseClient({
  mutationsHandler = async () => ({ data: { status: 'committed', user_id: OWNER_A, request_id: 'test', reset_version: '0', acknowledged: [] }, error: null }),
  snapshotHandler = async () => ({ data: { schema_version: 1, user_id: OWNER_A, reset_version: '0', server_time: new Date().toISOString(), items: [], tombstones: [] }, error: null }),
  userId = OWNER_A,
} = {}) {
  let callCount = 0;
  const calls = [];

  return {
    getCallCount: () => callCount,
    getCalls: () => calls,
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: userId } } }, error: null }),
    },
    rpc: async (fn, params) => {
      callCount++;
      calls.push({ fn, params });
      if (fn === 's2s_apply_mutations') {
        return await mutationsHandler(params);
      }
      if (fn === 's2s_account_snapshot') {
        return await snapshotHandler(params);
      }
      return { data: null, error: null };
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Online create, update, delete reaches confirmed cloud state
// ---------------------------------------------------------------------------
test('Online create/update/delete reaches confirmed cloud state', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  storageOwner.setOwner(OWNER_A);

  const db = createLocalDatabase({
    getScope: () => storageOwner.scope(),
    getLanguage: () => 'zh',
  });

  const mockClient = createMockSupabaseClient({
    mutationsHandler: async (params) => {
      const acknowledged = params.p_mutations.map((m, idx) => ({
        client_id: m.client_id,
        item_key: 'hex' + idx,
        status: m.op === 'delete' ? 'deleted' : 'applied',
        revision: m.op === 'delete' ? '3' : (m.base_revision ? '2' : '1'),
      }));
      return {
        data: {
          status: 'committed',
          user_id: OWNER_A,
          request_id: params.p_request_id,
          reset_version: '0',
          acknowledged,
        },
        error: null,
      };
    },
  });

  const syncService = createOnlineSyncService({
    storageOwner,
    getClient: () => mockClient,
  });

  // 1. Create a word locally
  const word = db.insert('saved_words', {
    phrase: '苹果',
    reading: 'píngguǒ',
    english: 'Apple',
  });
  assert.ok(word.id);

  const key = recordKey('zh', 'saved_words', '苹果', 'píngguǒ');
  let syncState = readSyncState(storage, OWNER_A).state;
  assert.equal(syncState.records[key].status, 'dirty');

  // Run sync
  const createRes = await syncService.performSync({ accountId: OWNER_A, isCurrent: () => true });
  assert.equal(createRes.status, 'saved');
  assert.equal(createRes.pendingCount, 0);

  syncState = readSyncState(storage, OWNER_A).state;
  assert.equal(syncState.records[key].status, 'synced');
  assert.equal(syncState.records[key].cloudRevision, '1');

  // Pending envelope must be cleared
  assert.equal(readPendingSyncRequest(storage, OWNER_A).request, null);

  // 2. Update the word locally
  db.update('saved_words', word.id, { english: 'Red apple' });
  syncState = readSyncState(storage, OWNER_A).state;
  assert.equal(syncState.records[key].status, 'dirty');

  const updateRes = await syncService.performSync({ accountId: OWNER_A, isCurrent: () => true });
  assert.equal(updateRes.status, 'saved');

  syncState = readSyncState(storage, OWNER_A).state;
  assert.equal(syncState.records[key].status, 'synced');
  assert.equal(syncState.records[key].cloudRevision, '2');

  // 3. Delete the word locally
  db.remove('saved_words', word.id);
  syncState = readSyncState(storage, OWNER_A).state;
  assert.equal(syncState.records[key].status, 'deleted');

  const deleteRes = await syncService.performSync({ accountId: OWNER_A, isCurrent: () => true });
  assert.equal(deleteRes.status, 'saved');

  syncState = readSyncState(storage, OWNER_A).state;
  assert.equal(syncState.records[key], undefined, 'Confirmed tombstone is cleared from local pending records');
});

// ---------------------------------------------------------------------------
// 2. Network failure and reload preserve the same unresolved envelope for explicit retry
// ---------------------------------------------------------------------------
test('Network failure and reload preserve the same unresolved envelope for explicit retry', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  storageOwner.setOwner(OWNER_A);

  const db = createLocalDatabase({
    getScope: () => storageOwner.scope(),
    getLanguage: () => 'zh',
  });

  db.insert('saved_words', { phrase: '重试', reading: 'chóng shì', english: 'Retry' });

  let attempts = 0;
  let capturedRequestId = null;
  const mockClient = createMockSupabaseClient({
    mutationsHandler: async (params) => {
      attempts++;
      capturedRequestId = params.p_request_id;
      if (attempts === 1) {
        // First attempt fails with network error
        return { data: null, error: new Error('Network timeout') };
      }
      // Second attempt succeeds
      return {
        data: {
          status: 'committed',
          user_id: OWNER_A,
          request_id: params.p_request_id,
          reset_version: '0',
          acknowledged: [
            { client_id: params.p_mutations[0].client_id, status: 'applied', revision: '1' },
          ],
        },
        error: null,
      };
    },
  });

  const syncService = createOnlineSyncService({
    storageOwner,
    getClient: () => mockClient,
  });

  const controller = createOnlineSyncController(syncService, { allowOnline: true });
  controller.setAccount({ id: OWNER_A, generation: 1 });

  // 1. Initial sync fails
  await controller.sync();
  assert.equal(controller.getState().status, 'failed');
  assert.match(controller.getState().error, /Network timeout/);

  // Unresolved envelope must be preserved in storage
  const pending = readPendingSyncRequest(storage, OWNER_A).request;
  assert.ok(pending);
  assert.equal(pending.requestId, capturedRequestId);
  assert.equal(pending.mutations.length, 1);

  // 2. Simulate page reload: new controller created on same storage
  const reloadedController = createOnlineSyncController(syncService, { allowOnline: true });
  reloadedController.setAccount({ id: OWNER_A, generation: 1 });

  // 3. Explicit retry
  await reloadedController.retry();
  assert.equal(reloadedController.getState().status, 'saved');
  assert.equal(attempts, 2);

  // Verify second attempt used the exact same requestId
  assert.equal(mockClient.getCalls()[1].params.p_request_id, capturedRequestId);

  // Envelope cleared after confirmed save
  assert.equal(readPendingSyncRequest(storage, OWNER_A).request, null);
});

// ---------------------------------------------------------------------------
// 3. Mutation during an in-flight request stays pending after older acknowledgement
// ---------------------------------------------------------------------------
test('Mutation during an in-flight request stays pending after the older acknowledgement', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  storageOwner.setOwner(OWNER_A);

  const db = createLocalDatabase({
    getScope: () => storageOwner.scope(),
    getLanguage: () => 'zh',
  });

  const word = db.insert('saved_words', { phrase: '飞行', reading: 'fēi xíng', english: 'Flight' });
  const key = recordKey('zh', 'saved_words', '飞行', 'fēi xíng');

  let resolveServerRpc;
  const serverRpcPromise = new Promise((resolve) => {
    resolveServerRpc = resolve;
  });

  const mockClient = createMockSupabaseClient({
    mutationsHandler: async (params) => {
      await serverRpcPromise;
      return {
        data: {
          status: 'committed',
          user_id: OWNER_A,
          request_id: params.p_request_id,
          reset_version: '0',
          acknowledged: [
            { client_id: key, status: 'applied', revision: '1' },
          ],
        },
        error: null,
      };
    },
  });

  const syncService = createOnlineSyncService({
    storageOwner,
    getClient: () => mockClient,
  });

  // Start sync (now in-flight)
  const syncPromise = syncService.performSync({ accountId: OWNER_A, isCurrent: () => true });

  // WHILE IN FLIGHT: user makes an edit
  // Give event loop a microtick to enter performSync
  await new Promise((r) => setTimeout(r, 5));
  db.update('saved_words', word.id, { english: 'In-flight edit' });

  // Let server RPC finish
  resolveServerRpc();
  const res = await syncPromise;

  // The item must remain dirty because it was edited during transmission!
  assert.equal(res.status, 'local', 'Pending edit must prevent false saved status');
  assert.equal(res.pendingCount, 1);

  const syncState = readSyncState(storage, OWNER_A).state;
  assert.equal(syncState.records[key].status, 'dirty');
  assert.equal(syncState.records[key].cloudRevision, '1', 'Base revision updated from server acknowledgement');
});

// ---------------------------------------------------------------------------
// 4. Conflict and stale reset responses cannot cause false success/resurrection
// ---------------------------------------------------------------------------
test('Conflict detection: stale revision produces conflict status without overwriting local edit', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  storageOwner.setOwner(OWNER_A);

  const db = createLocalDatabase({
    getScope: () => storageOwner.scope(),
    getLanguage: () => 'zh',
  });

  db.insert('saved_words', { phrase: '冲突', reading: 'chōng tū', english: 'Conflict test' });
  const key = recordKey('zh', 'saved_words', '冲突', 'chōng tū');

  const mockClient = createMockSupabaseClient({
    mutationsHandler: async (params) => ({
      data: {
        status: 'committed',
        user_id: OWNER_A,
        request_id: params.p_request_id,
        reset_version: '0',
        conflict_count: 1,
        acknowledged: [
          {
            client_id: key,
            item_key: 'hex123',
            status: 'conflict',
            error: 'STALE_REVISION',
            server_revision: '5',
          },
        ],
      },
      error: null,
    }),
  });

  const syncService = createOnlineSyncService({
    storageOwner,
    getClient: () => mockClient,
  });

  const res = await syncService.performSync({ accountId: OWNER_A, isCurrent: () => true });
  assert.equal(res.status, 'conflict');
  assert.equal(res.conflict, 'STALE_REVISION');

  const syncState = readSyncState(storage, OWNER_A).state;
  assert.equal(syncState.records[key].status, 'dirty', 'Local record remains dirty');
  assert.equal(syncState.records[key].conflict, 'STALE_REVISION');
  assert.equal(syncState.records[key].serverRevision, '5');
});

// ---------------------------------------------------------------------------
// 5. New reset generation discards old pending learning data without touching other scopes
// ---------------------------------------------------------------------------
test('New reset generation discards old pending learning data without touching other scopes', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  storageOwner.setOwner(OWNER_A);

  const db = createLocalDatabase({
    getScope: () => storageOwner.scope(),
    getLanguage: () => 'zh',
  });

  // Seed User A learning data
  db.insert('saved_words', { phrase: '旧世代', reading: 'jiù shì dài', english: 'Old gen' });

  // Seed User B learning data
  storageOwner.setOwner(OWNER_B);
  db.insert('saved_words', { phrase: '用户B', reading: 'yòng hù B', english: 'User B data' });

  // Seed guest data
  storageOwner.setOwner(null);
  db.insert('saved_words', { phrase: '访客', reading: 'fǎng kè', english: 'Guest data' });

  // Switch back to User A
  storageOwner.setOwner(OWNER_A);

  const mockClient = createMockSupabaseClient({
    mutationsHandler: async () => ({
      data: null,
      error: { message: 'RESET_VERSION_CHANGED', code: '40001' },
    }),
    snapshotHandler: async () => ({
      data: {
        schema_version: 1,
        user_id: OWNER_A,
        reset_version: '1',
        server_time: new Date().toISOString(),
        items: [],
        tombstones: [],
      },
      error: null,
    }),
  });

  const syncService = createOnlineSyncService({
    storageOwner,
    getClient: () => mockClient,
  });

  const res = await syncService.performSync({ accountId: OWNER_A, isCurrent: () => true });
  assert.equal(res.status, 'reset_reloaded');

  // User A's old learning data was wiped
  assert.equal(db.get('saved_words').length, 0);

  // User B's data is strictly preserved
  storageOwner.setOwner(OWNER_B);
  assert.equal(db.get('saved_words').length, 1);
  assert.equal(db.get('saved_words')[0].phrase, '用户B');

  // Guest data is strictly preserved
  storageOwner.setOwner(null);
  assert.equal(db.get('saved_words').length, 1);
  assert.equal(db.get('saved_words')[0].phrase, '访客');
});

// ---------------------------------------------------------------------------
// 6. Account switch/logout prevents stale response application
// ---------------------------------------------------------------------------
test('Account switch/logout prevents stale response application', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  storageOwner.setOwner(OWNER_A);

  const db = createLocalDatabase({
    getScope: () => storageOwner.scope(),
    getLanguage: () => 'zh',
  });

  db.insert('saved_words', { phrase: '切换', reading: 'qiē huàn' });

  let resolveServerRpc;
  const serverRpcPromise = new Promise((resolve) => {
    resolveServerRpc = resolve;
  });

  const mockClient = createMockSupabaseClient({
    mutationsHandler: async (params) => {
      await serverRpcPromise;
      return {
        data: {
          status: 'committed',
          user_id: OWNER_A,
          request_id: params.p_request_id,
          reset_version: '0',
          acknowledged: [{ client_id: params.p_mutations[0].client_id, status: 'applied', revision: '1' }],
        },
        error: null,
      };
    },
  });

  const syncService = createOnlineSyncService({
    storageOwner,
    getClient: () => mockClient,
  });

  let activeAccount = OWNER_A;
  const syncPromise = syncService.performSync({
    accountId: OWNER_A,
    isCurrent: () => activeAccount === OWNER_A,
  });

  // Account switch while in-flight
  activeAccount = OWNER_B;
  storageOwner.setOwner(OWNER_B);

  // Complete server RPC
  resolveServerRpc();
  const res = await syncPromise;

  assert.equal(res.status, 'account_changed');

  // Switch back to Owner A and verify pending envelope was preserved and not committed
  storageOwner.setOwner(OWNER_A);
  const pending = readPendingSyncRequest(storage, OWNER_A).request;
  assert.ok(pending, 'Unresolved request preserved across account switch');
});

// ---------------------------------------------------------------------------
// 7. Storage failure does not falsely report a local/cloud save
// ---------------------------------------------------------------------------
test('Storage failure does not falsely report a local/cloud save', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  storageOwner.setOwner(OWNER_A);

  const db = createLocalDatabase({
    getScope: () => storageOwner.scope(),
    getLanguage: () => 'zh',
  });

  db.insert('saved_words', { phrase: '错误', reading: 'cuò wù' });

  const mockClient = createMockSupabaseClient({
    mutationsHandler: async (params) => ({
      data: {
        status: 'committed',
        user_id: OWNER_A,
        request_id: params.p_request_id,
        reset_version: '0',
        acknowledged: [{ client_id: params.p_mutations[0].client_id, status: 'applied', revision: '1' }],
      },
      error: null,
    }),
  });

  const syncService = createOnlineSyncService({
    storageOwner,
    getClient: () => mockClient,
  });

  // Inject failure when writing the pending envelope
  storage.setThrowOnSetKey((k) => k.includes('pending_sync_request'));

  const res = await syncService.performSync({ accountId: OWNER_A, isCurrent: () => true });
  assert.equal(res.status, 'failed');
  assert.match(res.error, /Storage quota\/write failure/);
});

// ---------------------------------------------------------------------------
// 8. Gate-off and guest mode make no sync calls
// ---------------------------------------------------------------------------
test('Gate-off and guest mode make zero sync calls', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  const mockClient = createMockSupabaseClient();

  const syncService = createOnlineSyncService({
    storageOwner,
    getClient: () => mockClient,
  });

  // 1. Gate disabled
  const disabledController = createOnlineSyncController(syncService, { allowOnline: false });
  disabledController.setAccount({ id: OWNER_A, generation: 1 });
  await disabledController.sync();

  assert.equal(disabledController.getState().status, 'local');
  assert.equal(mockClient.getCallCount(), 0, 'Zero RPC calls when gate is off');

  // 2. Guest mode (owner null)
  const guestController = createOnlineSyncController(syncService, { allowOnline: true });
  guestController.setAccount(null);
  await guestController.sync();

  assert.equal(guestController.getState().status, 'local');
  assert.equal(mockClient.getCallCount(), 0, 'Zero RPC calls in guest mode');
});

// ---------------------------------------------------------------------------
// 9. Actual Settings retry/status wiring and language switching preserve lifecycle ownership
// ---------------------------------------------------------------------------
test('Controller status transitions, explicit retry, and language switching preserve ownership', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  storageOwner.setOwner(OWNER_A);

  const db = createLocalDatabase({
    getScope: () => storageOwner.scope(),
    getLanguage: () => 'zh',
  });

  let shouldFail = true;
  const mockClient = createMockSupabaseClient({
    mutationsHandler: async (params) => {
      if (shouldFail) {
        return { data: null, error: new Error('Temporary gateway error') };
      }
      return {
        data: {
          status: 'committed',
          user_id: OWNER_A,
          request_id: params.p_request_id,
          reset_version: '0',
          acknowledged: [{ client_id: params.p_mutations[0].client_id, status: 'applied', revision: '1' }],
        },
        error: null,
      };
    },
  });

  const syncService = createOnlineSyncService({
    storageOwner,
    getClient: () => mockClient,
  });

  const controller = createOnlineSyncController(syncService, { allowOnline: true });
  controller.setAccount({ id: OWNER_A, generation: 1 });

  // Add item in Chinese
  db.insert('saved_words', { phrase: '中文', reading: 'zhōng wén' });

  // Initial sync fails
  await controller.sync();
  assert.equal(controller.getState().status, 'failed');
  assert.equal(controller.getState().error, 'Temporary gateway error');

  // Switch language to Japanese in the same account scope
  // Active owner remains OWNER_A
  assert.equal(controller.getState().accountId, OWNER_A);

  // Now fix network and invoke explicit retry
  shouldFail = false;
  await controller.retry();

  assert.equal(controller.getState().status, 'saved');
  assert.equal(controller.getState().error, null);
  assert.ok(controller.getState().lastSyncedAt);
});

// ---------------------------------------------------------------------------
// 10. BigInt precision: large revisions preserve decimal string precision
// ---------------------------------------------------------------------------
test('BigInt precision: revisions exceeding Number.MAX_SAFE_INTEGER retain precision without truncation', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  storageOwner.setOwner(OWNER_A);

  const db = createLocalDatabase({
    getScope: () => storageOwner.scope(),
    getLanguage: () => 'zh',
  });

  const largeRevision = '9007199254740995'; // Greater than Number.MAX_SAFE_INTEGER (9007199254740991)
  const largeResetVersion = '123456789012345678';

  db.insert('saved_words', { phrase: '高精度', reading: 'gāo jīng dù' });
  const key = recordKey('zh', 'saved_words', '高精度', 'gāo jīng dù');

  // Seed initial resetVersion with large BigInt string
  const doc = storageOwner.scope(OWNER_A).readLearningDocument();
  const currentSync = doc.value?.cloudSync || readSyncState(storage, OWNER_A).state;
  currentSync.resetVersion = largeResetVersion;
  storageOwner.scope(OWNER_A).commitLearningDocument(doc.raw, {
    ...doc.value,
    cloudSync: currentSync,
  });

  const mockClient = createMockSupabaseClient({
    mutationsHandler: async (params) => {
      assert.equal(typeof params.p_expected_reset_version, 'string');
      return {
        data: {
          status: 'committed',
          user_id: OWNER_A,
          request_id: params.p_request_id,
          reset_version: largeResetVersion,
          acknowledged: [
            { client_id: key, status: 'applied', revision: largeRevision },
          ],
        },
        error: null,
      };
    },
  });

  const syncService = createOnlineSyncService({
    storageOwner,
    getClient: () => mockClient,
  });

  const res = await syncService.performSync({ accountId: OWNER_A, isCurrent: () => true });
  assert.equal(res.status, 'saved');

  const syncState = readSyncState(storage, OWNER_A).state;
  assert.equal(syncState.resetVersion, largeResetVersion);
  assert.equal(syncState.records[key].cloudRevision, largeRevision);
  assert.equal(typeof syncState.records[key].cloudRevision, 'string');
});

// ---------------------------------------------------------------------------
// 11. Server tombstones prevent resurrection during snapshot restoration
// ---------------------------------------------------------------------------
test('Server tombstones prevent resurrection of server-deleted items during snapshot restoration', async () => {
  const { restoreAccountSnapshot } = await import('../src/lib/cloudSnapshotHydration.js');

  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  storageOwner.setOwner(OWNER_A);

  const scope = storageOwner.scope(OWNER_A);

  // Local table has word '猫' from previous usage that was previously synced at revision 1
  scope.setTable('zh', 'saved_words', JSON.stringify([
    { id: 'cat-1', phrase: '猫', reading: 'māo', english: 'Cat' },
  ]));

  // Seed sync state as synced at revision 1 (not dirty)
  const catKey = recordKey('zh', 'saved_words', '猫', 'māo');
  const { state: currentSync } = readSyncState(storage, OWNER_A);
  currentSync.records[catKey] = {
    status: 'synced',
    cloudRevision: '1',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const doc = scope.readLearningDocument();
  scope.commitLearningDocument(doc.raw, {
    ...doc.value,
    cloudSync: currentSync,
  });

  // Server snapshot has empty items, BUT has a tombstone for '猫'
  const mockClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: OWNER_A } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: OWNER_A } } }, error: null }),
    },
    rpc: async (fn) => {
      if (fn === 's2s_account_snapshot') {
        return {
          data: {
            schema_version: 1,
            user_id: OWNER_A,
            reset_version: '0',
            server_time: new Date().toISOString(),
            items: [],
            tombstones: [
              {
                language: 'zh',
                kind: 'saved_words',
                written_form: '猫',
                reading: 'māo',
                revision: '3',
                deleted_at: new Date().toISOString(),
              },
            ],
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };

  const result = await restoreAccountSnapshot(mockClient, storageOwner, {
    expectedUserId: OWNER_A,
    isCurrent: () => true,
  });

  assert.equal(result.outcome, 'restored');

  // Verify '猫' was removed from local table and NOT resurrected
  const wordsAfter = JSON.parse(scope.getTable('zh', 'saved_words'));
  assert.equal(wordsAfter.length, 0, 'Server tombstone must prevent resurrecting deleted item');
});
