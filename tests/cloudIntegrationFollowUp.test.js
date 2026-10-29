import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudGuestImportService } from '../src/lib/cloudGuestImportService.js';
import { createStorageOwner } from '../src/lib/storageOwner.js';
import { createAuthCoordinator } from '../src/lib/authCoordinator.js';
import { createLocalDatabase } from '../src/lib/localDatabase.js';
import { createGuestImportController } from '../src/lib/guestImportController.js';
import { restoreAccountSnapshot, readSyncState } from '../src/lib/cloudSnapshotHydration.js';
import { readDurableRecord, persistDurableRecord } from '../src/lib/cloudImportDurableRequest.js';
import { isCloudImportStagingEnabled } from '../src/lib/cloudImportGate.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

function createMockStorage() {
  const store = new Map();
  return {
    get length() { return store.size; },
    key: index => [...store.keys()][index] ?? null,
    getItem: key => store.get(key) ?? null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: key => store.delete(key),
    _store: store,
  };
}

function makeHashKey(char) {
  return char.repeat(64);
}

function makeMockAuth(userId) {
  return {
    getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    getSession: async () => ({ data: { session: { user: { id: userId } } }, error: null }),
  };
}

function makeMockAck(params) {
  const items = params.p_items || [];
  return {
    status: 'committed',
    persistence: 'cloud',
    schema_version: 1,
    user_id: params.p_expected_user_id || USER_A,
    request_id: params.p_request_id,
    reset_version: params.p_expected_reset_version,
    source_fingerprint: params.p_source_fingerprint,
    choice: params.p_choice,
    accepted_count: items.length,
    added_count: items.length,
    updated_count: 0,
    replayed: false,
  };
}

// ---------------------------------------------------------------------------
// 1. Sign-in restore
// ---------------------------------------------------------------------------
test('sign-in restore: verified sign-in restores cloud snapshot with 0 guest records and dialog never opens', async () => {
  const storage = createMockStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(USER_A);

  const oldStorage = globalThis.localStorage;
  globalThis.localStorage = storage;

  try {
    // Guest tables have 0 records
    const guestScope = storageOwner.scope(null);
    guestScope.setTable('zh', 'saved_words', '[]');

    // Cloud snapshot has 2 saved words for USER_A
    const cloudSnapshot = {
      schema_version: 1,
      user_id: USER_A,
      reset_version: '0',
      server_time: '2026-01-06T00:00:00.000Z',
      items: [
        {
          language: 'zh',
          kind: 'saved_words',
          item_key: makeHashKey('1'),
          written_form: '猫',
          reading: 'māo',
          revision: '1',
          observed_at: '2026-01-05T00:00:00.000Z',
          created_at: '2026-01-05T00:00:00.000Z',
          updated_at: '2026-01-05T00:00:00.000Z',
          data: { english: 'Cat' },
        },
        {
          language: 'zh',
          kind: 'saved_words',
          item_key: makeHashKey('2'),
          written_form: '狗',
          reading: 'gǒu',
          revision: '1',
          observed_at: '2026-01-05T00:00:00.000Z',
          created_at: '2026-01-05T00:00:00.000Z',
          updated_at: '2026-01-05T00:00:00.000Z',
          data: { english: 'Dog' },
        },
      ],
    };

    const mockClient = {
      auth: makeMockAuth(USER_A),
      rpc: async (fn) => {
        if (fn === 's2s_account_snapshot') {
          return { data: cloudSnapshot, error: null };
        }
        return { data: null, error: null };
      },
    };

    const service = createCloudGuestImportService({
      storageOwner,
      getAuthState: () => ({
        user: { id: USER_A },
        generation: 1,
        loading: false,
        isTransitioning: false,
        error: null,
      }),
      getClient: () => mockClient,
    });

    const controller = createGuestImportController(service, { allowCloud: true });
    controller.setAccount({ id: USER_A, generation: 1 });

    // Inspect triggers sign-in restore through the controller entry point
    await controller.inspect({ automatic: true });

    const state = controller.getState();
    assert.equal(state.open, false, 'Guest dialog must NEVER open when guest records are 0');
    assert.equal(state.offer, null);

    // Verify local account tables were hydrated with cloud data
    const accountScope = storageOwner.scope(USER_A);
    const restoredRaw = accountScope.getTable('zh', 'saved_words');
    assert.ok(restoredRaw, 'Account table zh_saved_words must be populated');
    const restoredRows = JSON.parse(restoredRaw);
    assert.equal(restoredRows.length, 2);
    assert.equal(restoredRows[0].phrase, '猫');
    assert.equal(restoredRows[1].phrase, '狗');

    // Genuine guest records remain 0 and separate
    const guestRows = JSON.parse(guestScope.getTable('zh', 'saved_words'));
    assert.equal(guestRows.length, 0, 'Guest records remain untouched');
  } finally {
    globalThis.localStorage = oldStorage;
  }
});

test('sign-in restore: cloud snapshot restores even when pre-existing device-only import receipt exists', async () => {
  const storage = createMockStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(USER_A);

  const oldStorage = globalThis.localStorage;
  globalThis.localStorage = storage;

  try {
    // Account A already has an old device-only import receipt in learning_document_v1
    const accountScope = storageOwner.scope(USER_A);
    accountScope.commitLearningDocument(null, {
      version: 1,
      revision: 1,
      tables: { zh_saved_words: '[]' },
      guestImport: {
        fingerprint: makeHashKey('a'),
        choice: 'merge',
        decidedAt: '2026-01-01T00:00:00.000Z',
        handled: {},
      },
    });

    const cloudSnapshot = {
      schema_version: 1,
      user_id: USER_A,
      reset_version: '0',
      server_time: '2026-01-06T00:00:00.000Z',
      items: [
        {
          language: 'zh',
          kind: 'saved_words',
          item_key: makeHashKey('3'),
          written_form: '鸟',
          reading: 'niǎo',
          revision: '1',
          observed_at: '2026-01-05T00:00:00.000Z',
          created_at: '2026-01-05T00:00:00.000Z',
          updated_at: '2026-01-05T00:00:00.000Z',
          data: { english: 'Bird' },
        },
      ],
    };

    const mockClient = {
      auth: makeMockAuth(USER_A),
      rpc: async (fn) => {
        if (fn === 's2s_account_snapshot') return { data: cloudSnapshot, error: null };
        return { data: null, error: null };
      },
    };

    const service = createCloudGuestImportService({
      storageOwner,
      getAuthState: () => ({
        user: { id: USER_A },
        generation: 1,
        loading: false,
        isTransitioning: false,
        error: null,
      }),
      getClient: () => mockClient,
    });

    const offer = await service.inspect();
    assert.equal(offer.status, 'nothing-to-import');

    // Account tables must contain cloud item '鸟'
    const rows = JSON.parse(accountScope.getTable('zh', 'saved_words'));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].phrase, '鸟');

    // Document metadata preserved
    const doc = accountScope.readLearningDocument();
    assert.equal(doc.value.guestImport.choice, 'merge');
  } finally {
    globalThis.localStorage = oldStorage;
  }
});

// ---------------------------------------------------------------------------
// 2. Recovery after reload
// ---------------------------------------------------------------------------
test('recovery after reload: unconfirmed persisted request is discovered and retry reuses exact requestId and payload', async () => {
  const storage = createMockStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(USER_A);

  const oldStorage = globalThis.localStorage;
  globalThis.localStorage = storage;

  try {
    const fixedRequestId = '99999999-9999-4999-8999-999999999999';
    const originalFingerprint = makeHashKey('e');

    // Pre-populate an unconfirmed durable record simulating an interrupted network request before reload
    persistDurableRecord(storage, {
      schemaVersion: 1,
      ownerId: USER_A,
      requestId: fixedRequestId,
      expectedResetVersion: '0',
      sourceFingerprint: originalFingerprint,
      choice: 'merge',
      items: [
        {
          language: 'zh',
          kind: 'saved_words',
          written_form: '太阳',
          reading: 'tàiyáng',
          observed_at: '2026-01-01T00:00:00.000Z',
          data: { english: 'Sun' },
        },
      ],
      state: 'unconfirmed',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      error: null,
      receipt: null,
    });

    const receivedPayloads = [];

    const mockClient = {
      auth: makeMockAuth(USER_A),
      rpc: async (fn, params) => {
        if (fn === 's2s_account_snapshot') {
          return {
            data: {
              schema_version: 1,
              user_id: USER_A,
              reset_version: '0',
              server_time: '2026-01-06T00:00:00.000Z',
              items: [],
            },
            error: null,
          };
        }
        if (fn === 's2s_import_guest') {
          receivedPayloads.push(params);
          return {
            data: makeMockAck(params),
            error: null,
          };
        }
        return { data: null, error: null };
      },
    };

    const service = createCloudGuestImportService({
      storageOwner,
      getAuthState: () => ({
        user: { id: USER_A },
        generation: 1,
        loading: false,
        isTransitioning: false,
        error: null,
      }),
      getClient: () => mockClient,
    });

    const controller = createGuestImportController(service, { allowCloud: true });
    controller.setAccount({ id: USER_A, generation: 1 });

    // 1. Controller inspects on reload and discovers the unconfirmed offer
    await controller.inspect();
    const state = controller.getState();
    assert.equal(state.open, true, 'Controller must open offer for unconfirmed request');
    assert.equal(state.offer.status, 'available');
    assert.equal(state.offer.summary[0].savedWords, 1);

    // 2. User chooses merge to retry
    await controller.choose('merge');

    // 3. Verify server received exact same requestId and payload
    assert.equal(receivedPayloads.length, 1);
    assert.equal(receivedPayloads[0].p_request_id, fixedRequestId, 'Must reuse identical requestId');
    assert.equal(receivedPayloads[0].p_source_fingerprint, originalFingerprint);
    assert.equal(receivedPayloads[0].p_items.length, 1);
    assert.equal(receivedPayloads[0].p_items[0].written_form, '太阳');

    // 4. Verify durable record transitioned to locally_applied
    const durable = readDurableRecord(storage, USER_A);
    assert.equal(durable.record.state, 'locally_applied');
    assert.equal(controller.getState().notice.kind, 'success');
  } finally {
    globalThis.localStorage = oldStorage;
  }
});

test('recovery after reload: server ACK followed by local application failure remains recoverable after reload without reporting full completion', async () => {
  const storage = createMockStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(USER_A);

  const oldStorage = globalThis.localStorage;
  globalThis.localStorage = storage;

  try {
    // Pre-populate an unconfirmed request
    const fixedRequestId = '88888888-8888-4888-8888-888888888888';
    persistDurableRecord(storage, {
      schemaVersion: 1,
      ownerId: USER_A,
      requestId: fixedRequestId,
      expectedResetVersion: '0',
      sourceFingerprint: makeHashKey('f'),
      choice: 'merge',
      items: [
        {
          language: 'zh',
          kind: 'saved_words',
          written_form: '月亮',
          reading: 'yuèliang',
          observed_at: '2026-01-01T00:00:00.000Z',
          data: { english: 'Moon' },
        },
      ],
      state: 'unconfirmed',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      error: null,
      receipt: null,
    });

    let snapshotFailOnce = false;

    const mockClient = {
      auth: makeMockAuth(USER_A),
      rpc: async (fn, params) => {
        if (fn === 's2s_import_guest') {
          // Server successfully ACKs
          return {
            data: makeMockAck(params),
            error: null,
          };
        }
        if (fn === 's2s_account_snapshot') {
          if (snapshotFailOnce) {
            // Simulate network/server failure during local hydration after server ACK
            return { data: null, error: { message: 'Cloud snapshot network timeout' } };
          }
          return {
            data: {
              schema_version: 1,
              user_id: USER_A,
              reset_version: '0',
              server_time: '2026-01-06T00:00:00.000Z',
              items: [],
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    };

    const service = createCloudGuestImportService({
      storageOwner,
      getAuthState: () => ({
        user: { id: USER_A },
        generation: 1,
        loading: false,
        isTransitioning: false,
        error: null,
      }),
      getClient: () => mockClient,
    });

    const offer = await service.inspect();
    assert.equal(offer.status, 'available');

    // Trigger local application failure during choose
    snapshotFailOnce = true;
    await assert.rejects(
      async () => { await service.choose(offer, 'merge'); },
      /Could not confirm the cloud import|Could not load a verified cloud snapshot|Cloud snapshot network timeout/
    );

    // Verify durable record is in server_acknowledged state and NOT locally_applied
    const midDurable = readDurableRecord(storage, USER_A);
    assert.equal(midDurable.record.state, 'server_acknowledged', 'Must remain server_acknowledged');

    // Simulate page reload: inspect() discovers server_acknowledged
    // Network is now restored
    snapshotFailOnce = false;
    const reloadOffer = await service.inspect();
    assert.equal(reloadOffer.status, 'nothing-to-import');

    // Verify durable record is now successfully marked locally_applied
    const finalDurable = readDurableRecord(storage, USER_A);
    assert.equal(finalDurable.record.state, 'locally_applied');
  } finally {
    globalThis.localStorage = oldStorage;
  }
});

// ---------------------------------------------------------------------------
// 3. Local conflict protection via actual DB mutation path
// ---------------------------------------------------------------------------
test('local conflict protection: db.remove deletion survives later snapshot restore', async () => {
  const storage = createMockStorage();
  const storageOwner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  storageOwner.setOwner(USER_A);

  const oldStorage = globalThis.localStorage;
  globalThis.localStorage = storage;

  try {
    const db = createLocalDatabase({
      getScope: () => storageOwner.scope(USER_A),
      getLanguage: () => 'zh',
      now: () => '2026-01-06T12:00:00.000Z',
    });

    // 1. User has an existing saved word inserted through db
    const inserted = db.insert('saved_words', {
      phrase: '你好',
      reading: 'nǐ hǎo',
      english: 'Hello',
    });
    assert.ok(inserted.id);

    // 2. User deletes the word through actual db mutation path db.remove()
    const removed = db.remove('saved_words', inserted.id);
    assert.equal(removed, true);

    // Verify deletion tombstone was recorded in sync state
    const { state: syncState } = readSyncState(storage, USER_A);
    assert.ok(syncState);
    const tombstone = syncState.records['zh:saved_words:你好:nǐ hǎo'];
    assert.ok(tombstone, 'Tombstone must be recorded by setTable');
    assert.equal(tombstone.status, 'deleted');

    // 3. Later, snapshot restore runs with an older cloud snapshot containing "你好"
    const mockClient = {
      auth: makeMockAuth(USER_A),
      rpc: async (fn) => {
        if (fn === 's2s_account_snapshot') {
          return {
            data: {
              schema_version: 1,
              user_id: USER_A,
              reset_version: '0',
              server_time: '2026-01-06T00:00:00.000Z',
              items: [
                {
                  language: 'zh',
                  kind: 'saved_words',
                  item_key: makeHashKey('4'),
                  written_form: '你好',
                  reading: 'nǐ hǎo',
                  revision: '1',
                  observed_at: '2026-01-05T00:00:00.000Z',
                  created_at: '2026-01-05T00:00:00.000Z',
                  updated_at: '2026-01-05T00:00:00.000Z', // older than local deletion
                  data: { english: 'Hello' },
                },
              ],
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    };

    const restoreRes = await restoreAccountSnapshot(mockClient, storageOwner, {
      expectedUserId: USER_A,
      isCurrent: () => true,
      now: () => '2026-01-06T13:00:00.000Z',
    });

    assert.equal(restoreRes.outcome, 'up_to_date');

    // The deleted word MUST NOT be resurrected!
    const rows = db.get('saved_words');
    assert.equal(rows.length, 0, 'Deleted word must not be resurrected from older cloud snapshot');
  } finally {
    globalThis.localStorage = oldStorage;
  }
});

test('local conflict protection: concurrent local edit while snapshot restore is in flight commits without data loss', async () => {
  const storage = createMockStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(USER_A);

  const oldStorage = globalThis.localStorage;
  globalThis.localStorage = storage;

  try {
    const db = createLocalDatabase({
      getScope: () => storageOwner.scope(USER_A),
      getLanguage: () => 'zh',
      now: () => '2026-01-06T12:00:00.000Z',
    });

    // Cloud snapshot has word "咖啡"
    let callCount = 0;
    const mockClient = {
      auth: makeMockAuth(USER_A),
      rpc: async (fn) => {
        if (fn === 's2s_account_snapshot') {
          callCount++;
          // Simulate user locally inserting "茶" while restore snapshot network request was resolving
          if (callCount === 1) {
            db.insert('saved_words', {
              phrase: '茶',
              reading: 'chá',
              english: 'Tea',
            });
          }
          return {
            data: {
              schema_version: 1,
              user_id: USER_A,
              reset_version: '0',
              server_time: '2026-01-06T00:00:00.000Z',
              items: [
                {
                  language: 'zh',
                  kind: 'saved_words',
                  item_key: makeHashKey('5'),
                  written_form: '咖啡',
                  reading: 'kāfēi',
                  revision: '1',
                  observed_at: '2026-01-05T00:00:00.000Z',
                  created_at: '2026-01-05T00:00:00.000Z',
                  updated_at: '2026-01-05T00:00:00.000Z',
                  data: { english: 'Coffee' },
                },
              ],
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    };

    const restoreRes = await restoreAccountSnapshot(mockClient, storageOwner, {
      expectedUserId: USER_A,
      isCurrent: () => true,
      now: () => '2026-01-06T13:00:00.000Z',
    });

    assert.equal(restoreRes.outcome, 'restored');

    // Both the locally inserted "茶" and cloud "咖啡" must be present!
    const rows = db.get('saved_words');
    assert.equal(rows.length, 2, 'Must contain both local edit and cloud snapshot word');
    const phrases = rows.map(r => r.phrase).sort();
    assert.deepEqual(phrases, ['咖啡', '茶']);
  } finally {
    globalThis.localStorage = oldStorage;
  }
});

// ---------------------------------------------------------------------------
// 4. Ownership generation guard in local and global logout
// ---------------------------------------------------------------------------
test('ownership guard: local and global signOut errors do not displace or leak to User B', async () => {
  const storage = createMockStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });

  let signOutBehavior = 'resolve';
  let resolveSignOut;
  let signOutPromise;

  const mockAuthClient = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: USER_A } } }, error: null }),
      getUser: async () => ({ data: { user: { id: USER_A } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => {
        if (signOutBehavior === 'delayed-error') {
          return signOutPromise;
        }
        if (signOutBehavior === 'delayed-throw') {
          return signOutPromise;
        }
        return { error: null };
      },
    },
  };

  const coordinator = createAuthCoordinator({
    authClient: mockAuthClient,
    storageOwner,
    isConfigured: true,
  });

  const cleanup = coordinator.initialize();
  await new Promise(r => setTimeout(r, 20));

  assert.equal(coordinator.getState().user?.id, USER_A);

  // --- Test 4A: Local signOut with SDK returned error during concurrent login ---
  signOutBehavior = 'delayed-error';
  signOutPromise = new Promise(resolve => { resolveSignOut = resolve; });

  const slowLocalSignOut = coordinator.signOut();

  // User B signs in concurrently while User A local signOut is in-flight
  mockAuthClient.auth.getUser = async () => ({ data: { user: { id: USER_B } }, error: null });
  await coordinator.retryVerification();
  await new Promise(r => setTimeout(r, 20));

  assert.equal(coordinator.getState().user?.id, USER_B);
  assert.equal(storageOwner.getOwner(), USER_B);

  // User A local signOut finishes with an SDK error
  resolveSignOut({ error: { message: 'User A local signOut server rejection' } });
  const localRes = await slowLocalSignOut;

  assert.equal(localRes.error?.message, 'Account changed during sign out.');
  assert.equal(coordinator.getState().user?.id, USER_B, 'User B remains authenticated');
  assert.equal(coordinator.getState().error, null, 'User B must not receive User A error');

  // --- Test 4B: Local signOut with thrown exception during concurrent login ---
  signOutBehavior = 'delayed-throw';
  signOutPromise = new Promise((_, reject) => { resolveSignOut = () => reject(new Error('Network crash')); });

  const slowThrowSignOut = coordinator.signOut();

  // Re-verify User B
  await coordinator.retryVerification();
  await new Promise(r => setTimeout(r, 20));

  resolveSignOut();
  const throwRes = await slowThrowSignOut;

  assert.equal(throwRes.error?.message, 'Account changed during sign out.');
  assert.equal(coordinator.getState().user?.id, USER_B);
  assert.equal(coordinator.getState().error, null);

  cleanup();
});

test('ownership guard: stale session token verification cannot restore after logout', async () => {
  const storage = createMockStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });

  let resolveUserVerification;
  const slowGetUser = new Promise(resolve => { resolveUserVerification = resolve; });

  const mockAuthClient = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: USER_A } } }, error: null }),
      getUser: () => slowGetUser,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => ({ error: null }),
    },
  };

  const coordinator = createAuthCoordinator({
    authClient: mockAuthClient,
    storageOwner,
    isConfigured: true,
  });

  const cleanup = coordinator.initialize();

  // Immediate logout before slow getUser completes
  await coordinator.signOut();
  assert.equal(storageOwner.getOwner(), null);
  assert.equal(coordinator.getState().user, null);

  // Delayed verification finally finishes for User A
  resolveUserVerification({ data: { user: { id: USER_A } }, error: null });
  await new Promise(r => setTimeout(r, 30));

  // Must NOT restore USER_A!
  assert.equal(coordinator.getState().user, null, 'Stale verification must not restore user');
  assert.equal(storageOwner.getOwner(), null, 'Must remain guest scope');

  cleanup();
});

// ---------------------------------------------------------------------------
// 5. Activation & Evidence
// ---------------------------------------------------------------------------
test('activation & evidence: gate disabled + unconfigured preserves guest operation without network calls', async () => {
  const storage = createMockStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(null); // Guest mode

  let networkCalled = false;
  const mockClient = {
    auth: {
      getUser: async () => { networkCalled = true; return { data: { user: null }, error: null }; },
      getSession: async () => { networkCalled = true; return { data: { session: null }, error: null }; },
    },
    rpc: async () => { networkCalled = true; return { data: null, error: null }; },
  };

  const coordinator = createAuthCoordinator({
    authClient: mockClient,
    storageOwner,
    isConfigured: false, // unconfigured checkout
  });

  coordinator.initialize();
  await new Promise(r => setTimeout(r, 20));

  assert.equal(networkCalled, false, 'Unconfigured checkout must not attempt network calls');
  assert.equal(storageOwner.getOwner(), null, 'Remains in guest mode');
  assert.equal(isCloudImportStagingEnabled({}), false, 'Staging gate disabled by default');
});

test('activation & evidence: gate enabled + unavailable RPCs fails closed with actionable error', async () => {
  const storage = createMockStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(USER_A);

  const oldStorage = globalThis.localStorage;
  globalThis.localStorage = storage;

  try {
    const mockClient = {
      auth: makeMockAuth(USER_A),
      rpc: async (fn) => {
        if (fn === 's2s_account_snapshot') {
          return {
            data: null,
            error: {
              code: '42883',
              message: 'function public.s2s_account_snapshot(uuid) does not exist',
            },
          };
        }
        return { data: null, error: null };
      },
    };

    const service = createCloudGuestImportService({
      storageOwner,
      getAuthState: () => ({
        user: { id: USER_A },
        generation: 1,
        loading: false,
        isTransitioning: false,
        error: null,
      }),
      getClient: () => mockClient,
    });

    const controller = createGuestImportController(service, { allowCloud: true });
    controller.setAccount({ id: USER_A, generation: 1 });

    await controller.inspect();

    const state = controller.getState();
    assert.equal(state.open, false, 'Dialog must NOT open on RPC failure');
    assert.ok(state.error, 'Must report actionable error');
    assert.match(state.error, /Could not check or save guest learning/);

    // No durable request should be marked locally_applied
    const durable = readDurableRecord(storage, USER_A);
    assert.equal(durable.record, null, 'No request should be marked applied');
  } finally {
    globalThis.localStorage = oldStorage;
  }
});
