import test from 'node:test';
import assert from 'node:assert/strict';

import { createStorageOwner } from '../src/lib/storageOwner.js';
import {
  reconcileSnapshotWithLocal,
  restoreAccountSnapshot,
  recordLocalDirty,
  recordLocalDeletion,
  readSyncState,
  getSyncStateKey,
  identityOfRow,
} from '../src/lib/cloudSnapshotHydration.js';

const OWNER_A = '11111111-1111-4111-8111-111111111111';
const OWNER_B = '22222222-2222-4222-8222-222222222222';

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  let throwOnKey = null;
  return {
    getItem: (k) => {
      if (throwOnKey && k === throwOnKey) throw new Error('Storage read failure');
      return map.has(k) ? map.get(k) : null;
    },
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    setThrowOnKey: (k) => { throwOnKey = k; },
  };
}

function createMockClient(snapshot, onRpc = null) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: OWNER_A } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: OWNER_A } } }, error: null }),
    },
    rpc: async (fn, params) => {
      if (onRpc) onRpc(fn, params);
      if (fn === 's2s_account_snapshot') {
        return { data: snapshot, error: null };
      }
      return { data: null, error: null };
    },
  };
}

// ---------------------------------------------------------------------------
// Confirmed Failure 1: reconcileSnapshotWithLocal silently treats broken JSON as []
// ---------------------------------------------------------------------------

test('Confirmed Failure 1: reconcileSnapshotWithLocal must throw on broken local rows JSON', () => {
  const cloudSnapshot = {
    schema_version: 1,
    user_id: OWNER_A,
    reset_version: '1',
    server_time: '2026-06-01T00:00:00.000Z',
    items: [],
  };

  assert.throws(
    () => reconcileSnapshotWithLocal({
      localTables: { zh_saved_words: '{broken local rows' },
      snapshot: cloudSnapshot,
      syncState: null,
    }),
    /Stored learning data has an unsupported format/
  );
});

// ---------------------------------------------------------------------------
// Confirmed Failure 2: restoreAccountSnapshot ignores malformed sync state metadata
// ---------------------------------------------------------------------------

test('Confirmed Failure 2: restoreAccountSnapshot must not overwrite local note or corrupt metadata', async () => {
  const corruptMetadata = '{ broken sync state json :::';
  const syncKey = getSyncStateKey(OWNER_A);

  const localRow = {
    id: 'local-1',
    phrase: '苹果',
    reading: 'píngguǒ',
    notes: 'unsynced custom note',
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  };

  const storage = createMemoryStorage({
    [syncKey]: corruptMetadata,
    [`s2s_user_${OWNER_A}_zh_saved_words`]: JSON.stringify([localRow]),
  });

  const originalLocalStorage = globalThis.localStorage;
  globalThis.localStorage = storage;

  try {
    const storageOwner = createStorageOwner({ storage: () => storage });
    storageOwner.setOwner(OWNER_A);

    // Cloud has same word with older note but newer timestamp
    const cloudItem = {
      language: 'zh',
      kind: 'saved_words',
      written_form: '苹果',
      reading: 'píngguǒ',
      item_key: 'cloud-1',
      revision: '1',
      created_at: '2026-06-02T00:00:00.000Z',
      updated_at: '2026-06-02T00:00:00.000Z',
      data: { notes: 'older cloud note' },
    };

    const cloudSnapshot = {
      schema_version: 1,
      user_id: OWNER_A,
      reset_version: '1',
      server_time: '2026-06-02T00:00:00.000Z',
      items: [cloudItem],
    };

    let rpcInvoked = false;
    const mockClient = createMockClient(cloudSnapshot, () => {
      rpcInvoked = true;
    });

    const result = await restoreAccountSnapshot(mockClient, storageOwner, {
      expectedUserId: OWNER_A,
      isCurrent: () => true,
    });

    assert.equal(result.outcome, 'error', 'Must fail with outcome error');
    assert.ok(result.error.includes('sync status'), 'Error message must explain sync status failure');
    assert.equal(rpcInvoked, false, 'Must NOT invoke RPC when sync status cannot be verified');

    // Verify corrupt metadata was preserved on disk (NOT replaced!)
    assert.equal(storage.getItem(syncKey), corruptMetadata, 'Original corrupt metadata must be preserved');

    // Verify local note was NOT overwritten
    const scope = storageOwner.scope(OWNER_A);
    const rows = JSON.parse(scope.getTable('zh', 'saved_words'));
    assert.equal(rows[0].notes, 'unsynced custom note', 'Local note must not be overwritten');
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
});

// ---------------------------------------------------------------------------
// Confirmed Failure 3: Storage adapter throws on metadata read
// ---------------------------------------------------------------------------

test('Confirmed Failure 3: restoreAccountSnapshot stops when storage throws reading sync state', async () => {
  const syncKey = getSyncStateKey(OWNER_A);
  const storage = createMemoryStorage({
    [syncKey]: JSON.stringify({ schemaVersion: 1, ownerId: OWNER_A, resetVersion: '1', records: {} }),
  });
  storage.setThrowOnKey(syncKey);

  const originalLocalStorage = globalThis.localStorage;
  globalThis.localStorage = storage;

  try {
    const storageOwner = createStorageOwner({ storage: () => storage });
    storageOwner.setOwner(OWNER_A);

    const cloudSnapshot = {
      schema_version: 1,
      user_id: OWNER_A,
      reset_version: '1',
      server_time: '2026-06-02T00:00:00.000Z',
      items: [],
    };
    let rpcInvoked = false;
    const mockClient = createMockClient(cloudSnapshot, () => {
      rpcInvoked = true;
    });

    const result = await restoreAccountSnapshot(mockClient, storageOwner, {
      expectedUserId: OWNER_A,
      isCurrent: () => true,
    });

    assert.equal(result.outcome, 'error');
    assert.ok(result.error.includes('sync status'));
    assert.equal(rpcInvoked, false, 'Must NOT invoke RPC when storage access fails');
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
});

// ---------------------------------------------------------------------------
// Category 1: Local table format validation in reconcileSnapshotWithLocal
// ---------------------------------------------------------------------------

test('reconcileSnapshotWithLocal rejects invalid local table types and row formats', () => {
  const snapshot = {
    schema_version: 1,
    user_id: OWNER_A,
    reset_version: '1',
    server_time: '2026-06-01T00:00:00.000Z',
    items: [],
  };

  // Non-array JSON
  assert.throws(
    () => reconcileSnapshotWithLocal({
      localTables: { zh_saved_words: '{"not": "an array"}' },
      snapshot,
      syncState: null,
    }),
    /Stored learning data has an unsupported format/
  );

  // Non-string / non-array table value
  assert.throws(
    () => reconcileSnapshotWithLocal({
      localTables: { zh_saved_words: 42 },
      snapshot,
      syncState: null,
    }),
    /Stored learning data has an unsupported format/
  );

  // Array containing non-object element
  assert.throws(
    () => reconcileSnapshotWithLocal({
      localTables: { zh_saved_words: '[null]' },
      snapshot,
      syncState: null,
    }),
    /Stored learning data has an unsupported format/
  );

  // Row in saved_words lacking written identity
  assert.throws(
    () => reconcileSnapshotWithLocal({
      localTables: { zh_saved_words: JSON.stringify([{ id: 'bad-row', notes: 'missing phrase' }]) },
      snapshot,
      syncState: null,
    }),
    /Stored learning data has an unsupported format/
  );

  // Row in saved_words with whitespace-only phrase
  assert.throws(
    () => reconcileSnapshotWithLocal({
      localTables: { zh_saved_words: JSON.stringify([{ phrase: '   ', reading: 'test' }]) },
      snapshot,
      syncState: null,
    }),
    /Stored learning data has an unsupported format/
  );

  // Row in search_history lacking term
  assert.throws(
    () => reconcileSnapshotWithLocal({
      localTables: { zh_search_history: JSON.stringify([{ id: '1', wrong_field: 'val' }]) },
      snapshot,
      syncState: null,
    }),
    /Stored learning data has an unsupported format/
  );

  // Row in learned_radicals lacking radical
  assert.throws(
    () => reconcileSnapshotWithLocal({
      localTables: { ja_learned_radicals: JSON.stringify([{ id: '1' }]) },
      snapshot,
      syncState: null,
    }),
    /Stored learning data has an unsupported format/
  );
});

test('identityOfRow validates required row identity fields per table kind', () => {
  // Valid rows
  assert.equal(identityOfRow('zh_saved_words', { phrase: '猫', reading: 'māo' }), 'zh:saved_words:猫:māo');
  assert.equal(identityOfRow('ja_review_cards', { character: '犬', pronunciation: 'いぬ' }), 'ja:review_cards:犬:いぬ');
  assert.equal(identityOfRow('zh_search_history', { term: '你好' }), 'zh:search_history:你好:');
  assert.equal(identityOfRow('ja_learned_kana', { kana: 'あ' }), 'ja:learned_kana:あ:');

  // Invalid rows throw recovery error
  assert.throws(() => identityOfRow('zh_saved_words', null), /Stored learning data has an unsupported format/);
  assert.throws(() => identityOfRow('zh_saved_words', {}), /Stored learning data has an unsupported format/);
  assert.throws(() => identityOfRow('zh_saved_words', { phrase: '' }), /Stored learning data has an unsupported format/);
  assert.throws(() => identityOfRow('zh_saved_words', { phrase: '   ' }), /Stored learning data has an unsupported format/);
  assert.throws(() => identityOfRow('zh_search_history', { query: 'test' }), /Stored learning data has an unsupported format/);
});

// ---------------------------------------------------------------------------
// Category 2: Sync metadata schema validation in readSyncState
// ---------------------------------------------------------------------------

test('readSyncState distinguishes storage errors, absent metadata, and malformed schemas', () => {
  const syncKey = getSyncStateKey(OWNER_A);

  // 1. Storage access error
  const storageThrows = createMemoryStorage();
  storageThrows.setThrowOnKey(syncKey);
  assert.deepEqual(readSyncState(storageThrows, OWNER_A), {
    state: null,
    error: 'Storage access error',
  });

  // 2. Truly absent metadata (valid uninitialized state)
  const emptyStorage = createMemoryStorage();
  assert.deepEqual(readSyncState(emptyStorage, OWNER_A), {
    state: null,
    error: null,
  });

  // 3. Empty string
  const storageEmpty = createMemoryStorage({ [syncKey]: '' });
  assert.deepEqual(readSyncState(storageEmpty, OWNER_A), {
    state: null,
    error: 'Malformed sync state JSON',
  });

  // 4. Whitespace string
  const storageWhitespace = createMemoryStorage({ [syncKey]: '   ' });
  assert.deepEqual(readSyncState(storageWhitespace, OWNER_A), {
    state: null,
    error: 'Malformed sync state JSON',
  });

  // 5. Malformed JSON
  const storageBadJson = createMemoryStorage({ [syncKey]: '{ bad json' });
  assert.deepEqual(readSyncState(storageBadJson, OWNER_A), {
    state: null,
    error: 'Malformed sync state JSON',
  });

  // 6. Non-object JSON
  const storagePrimitive = createMemoryStorage({ [syncKey]: '"just a string"' });
  assert.deepEqual(readSyncState(storagePrimitive, OWNER_A), {
    state: null,
    error: 'Invalid sync state schema',
  });

  // 7. Array JSON
  const storageArray = createMemoryStorage({ [syncKey]: '[]' });
  assert.deepEqual(readSyncState(storageArray, OWNER_A), {
    state: null,
    error: 'Invalid sync state schema',
  });

  // 8. Unsupported schemaVersion
  const storageOldVersion = createMemoryStorage({
    [syncKey]: JSON.stringify({ schemaVersion: 2, ownerId: OWNER_A, resetVersion: '1', records: {} }),
  });
  assert.deepEqual(readSyncState(storageOldVersion, OWNER_A), {
    state: null,
    error: 'Invalid sync state schema',
  });

  // 9. OwnerId mismatch
  const storageOwnerMismatch = createMemoryStorage({
    [syncKey]: JSON.stringify({ schemaVersion: 1, ownerId: OWNER_B, resetVersion: '1', records: {} }),
  });
  assert.deepEqual(readSyncState(storageOwnerMismatch, OWNER_A), {
    state: null,
    error: 'Invalid sync state schema',
  });

  // 10. Malformed records property
  const storageBadRecords = createMemoryStorage({
    [syncKey]: JSON.stringify({ schemaVersion: 1, ownerId: OWNER_A, resetVersion: '1', records: 'not an object' }),
  });
  assert.deepEqual(readSyncState(storageBadRecords, OWNER_A), {
    state: null,
    error: 'Invalid sync state schema',
  });

  // 11. Valid sync state
  const validState = { schemaVersion: 1, ownerId: OWNER_A, resetVersion: '1', records: {} };
  const storageValid = createMemoryStorage({
    [syncKey]: JSON.stringify(validState),
  });
  const res = readSyncState(storageValid, OWNER_A);
  assert.equal(res.error, null);
  assert.equal(res.state.ownerId, OWNER_A);
});

// ---------------------------------------------------------------------------
// Category 3: Mutation metadata helpers fail-safe behavior
// ---------------------------------------------------------------------------

test('recordLocalDirty and recordLocalDeletion throw and preserve corrupt metadata', () => {
  const syncKey = getSyncStateKey(OWNER_A);
  const corruptRaw = '{ corrupt metadata :::';
  const storage = createMemoryStorage({
    [syncKey]: corruptRaw,
  });

  // recordLocalDirty must throw and NOT overwrite storage
  assert.throws(
    () => recordLocalDirty(storage, OWNER_A, 'zh', 'saved_words', '书', 'shū'),
    /Could not update sync state/
  );
  assert.equal(storage.getItem(syncKey), corruptRaw, 'Corrupt metadata must remain untouched');

  // recordLocalDeletion must throw and NOT overwrite storage
  assert.throws(
    () => recordLocalDeletion(storage, OWNER_A, 'zh', 'saved_words', '书', 'shū'),
    /Could not update sync state/
  );
  assert.equal(storage.getItem(syncKey), corruptRaw, 'Corrupt metadata must remain untouched');
});

test('recordLocalDirty and recordLocalDeletion initialize correctly when metadata is absent', () => {
  const syncKey = getSyncStateKey(OWNER_A);
  const storage = createMemoryStorage();

  recordLocalDirty(storage, OWNER_A, 'zh', 'saved_words', '茶', 'chá', () => '2026-06-01T12:00:00.000Z');
  const afterDirty = JSON.parse(storage.getItem(syncKey));
  assert.equal(afterDirty.schemaVersion, 1);
  assert.equal(afterDirty.ownerId, OWNER_A);
  assert.equal(afterDirty.records['zh:saved_words:茶:chá'].status, 'dirty');

  recordLocalDeletion(storage, OWNER_A, 'zh', 'saved_words', '水', 'shuǐ', () => '2026-06-01T12:05:00.000Z');
  const afterDel = JSON.parse(storage.getItem(syncKey));
  assert.equal(afterDel.records['zh:saved_words:水:shuǐ'].status, 'deleted');
});

// ---------------------------------------------------------------------------
// Category 4: Restore safety when local learning data is corrupt
// ---------------------------------------------------------------------------

test('restoreAccountSnapshot halts and protects data when local learning rows are malformed', async () => {
  const badTableData = '{ broken json row table';
  const storage = createMemoryStorage({
    [`s2s_user_${OWNER_A}_zh_saved_words`]: badTableData,
  });

  const originalLocalStorage = globalThis.localStorage;
  globalThis.localStorage = storage;

  try {
    const storageOwner = createStorageOwner({ storage: () => storage });
    storageOwner.setOwner(OWNER_A);

    const cloudSnapshot = {
      schema_version: 1,
      user_id: OWNER_A,
      reset_version: '1',
      server_time: '2026-06-02T00:00:00.000Z',
      items: [],
    };
    const mockClient = createMockClient(cloudSnapshot);

    const result = await restoreAccountSnapshot(mockClient, storageOwner, {
      expectedUserId: OWNER_A,
      isCurrent: () => true,
    });

    assert.equal(result.outcome, 'error');
    assert.ok(result.error.includes('unsupported format'));

    // Verify broken table data was NOT overwritten
    assert.equal(storage.getItem(`s2s_user_${OWNER_A}_zh_saved_words`), badTableData);

    // Verify sync state was NOT written
    const syncKey = getSyncStateKey(OWNER_A);
    assert.equal(storage.getItem(syncKey), null);
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
});

test('restoreAccountSnapshot halts when learning_document_v1 is malformed', async () => {
  const docKey = `s2s_user_${OWNER_A}_learning_document_v1`;
  const corruptDoc = '{ broken learning document json :::';
  const storage = createMemoryStorage({
    [docKey]: corruptDoc,
  });

  const originalLocalStorage = globalThis.localStorage;
  globalThis.localStorage = storage;

  try {
    const storageOwner = createStorageOwner({ storage: () => storage });
    storageOwner.setOwner(OWNER_A);

    const cloudSnapshot = {
      schema_version: 1,
      user_id: OWNER_A,
      reset_version: '1',
      server_time: '2026-06-02T00:00:00.000Z',
      items: [],
    };
    const mockClient = createMockClient(cloudSnapshot);

    const result = await restoreAccountSnapshot(mockClient, storageOwner, {
      expectedUserId: OWNER_A,
      isCurrent: () => true,
    });

    assert.equal(result.outcome, 'error');
    assert.ok(result.error.includes('unsupported format'));
    assert.equal(storage.getItem(docKey), corruptDoc, 'Corrupt learning document must be preserved');
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
});

test('Zero writes occur on storage when restoreAccountSnapshot fails recovery guards', async () => {
  const syncKey = getSyncStateKey(OWNER_A);
  const writes = [];
  const baseStorage = createMemoryStorage({
    [syncKey]: '{ corrupt sync state',
  });
  const trackingStorage = {
    ...baseStorage,
    setItem: (k, v) => { writes.push({ action: 'set', k, v }); baseStorage.setItem(k, v); },
    removeItem: (k) => { writes.push({ action: 'remove', k }); baseStorage.removeItem(k); },
  };

  const originalLocalStorage = globalThis.localStorage;
  globalThis.localStorage = trackingStorage;

  try {
    const storageOwner = createStorageOwner({ storage: () => trackingStorage });
    storageOwner.setOwner(OWNER_A);

    const cloudSnapshot = {
      schema_version: 1,
      user_id: OWNER_A,
      reset_version: '1',
      server_time: '2026-06-02T00:00:00.000Z',
      items: [],
    };
    const mockClient = createMockClient(cloudSnapshot);

    const result = await restoreAccountSnapshot(mockClient, storageOwner, {
      expectedUserId: OWNER_A,
      isCurrent: () => true,
    });

    assert.equal(result.outcome, 'error');
    assert.equal(writes.length, 0, 'Zero storage mutations must occur on failed restore');
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
});

// ---------------------------------------------------------------------------
// Category 5: Multi-owner isolation under corrupted metadata
// ---------------------------------------------------------------------------

test('Corrupt metadata for Owner A does not impact Owner B operations', async () => {
  const syncKeyA = getSyncStateKey(OWNER_A);
  const syncKeyB = getSyncStateKey(OWNER_B);

  const storage = createMemoryStorage({
    [syncKeyA]: '{ corrupted owner A metadata :::',
    // Owner B has valid metadata
    [syncKeyB]: JSON.stringify({
      schemaVersion: 1,
      ownerId: OWNER_B,
      resetVersion: '1',
      records: {},
    }),
  });

  const originalLocalStorage = globalThis.localStorage;
  globalThis.localStorage = storage;

  try {
    const storageOwner = createStorageOwner({ storage: () => storage });

    // Owner A fails safe
    storageOwner.setOwner(OWNER_A);
    const mockClientA = createMockClient({
      schema_version: 1,
      user_id: OWNER_A,
      reset_version: '1',
      server_time: '2026-06-02T00:00:00.000Z',
      items: [],
    });
    const resultA = await restoreAccountSnapshot(mockClientA, storageOwner, {
      expectedUserId: OWNER_A,
      isCurrent: () => true,
    });
    assert.equal(resultA.outcome, 'error');

    // Owner B works normally
    storageOwner.setOwner(OWNER_B);
    const mockClientB = {
      auth: {
        getUser: async () => ({ data: { user: { id: OWNER_B } }, error: null }),
        getSession: async () => ({ data: { session: { user: { id: OWNER_B } } }, error: null }),
      },
      rpc: async (fn) => {
        if (fn === 's2s_account_snapshot') {
          return {
            data: {
              schema_version: 1,
              user_id: OWNER_B,
              reset_version: '1',
              server_time: '2026-06-02T00:00:00.000Z',
              items: [],
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    };

    const resultB = await restoreAccountSnapshot(mockClientB, storageOwner, {
      expectedUserId: OWNER_B,
      isCurrent: () => true,
    });
    assert.equal(resultB.outcome, 'up_to_date');
    assert.equal(resultB.error, null);

    // Verify Owner A's corrupt metadata remained unchanged
    assert.equal(storage.getItem(syncKeyA), '{ corrupted owner A metadata :::');
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
});
