import test from 'node:test';
import assert from 'node:assert/strict';

import { createStorageOwner } from '../src/lib/storageOwner.js';
import {
  reconcileSnapshotWithLocal,
  recordKey,
  readSyncState,
  persistSyncState,
} from '../src/lib/cloudSnapshotHydration.js';
import { createLocalDatabase } from '../src/lib/localDatabase.js';

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

// ---------------------------------------------------------------------------
// 1. Defect Reproductions
// ---------------------------------------------------------------------------

test('Reproduction 1: Repeated restore loses a local edit', () => {
  const localRow = {
    id: 'local-1',
    phrase: '苹果',
    reading: 'píngguǒ',
    notes: 'local custom note',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z', // older row timestamp
  };

  const initialSyncState = {
    schemaVersion: 1,
    ownerId: OWNER_A,
    resetVersion: '1',
    lastServerTime: '2026-01-01T00:00:00.000Z',
    records: {
      'zh:saved_words:苹果:píngguǒ': {
        status: 'dirty',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    },
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const cloudItem = {
    language: 'zh',
    kind: 'saved_words',
    written_form: '苹果',
    reading: 'píngguǒ',
    item_key: 'cloud-1',
    revision: '1',
    created_at: '2026-01-02T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z', // newer cloud timestamp
    data: { notes: 'old cloud note' },
  };

  const snapshot = {
    schema_version: 1,
    user_id: OWNER_A,
    reset_version: '1',
    server_time: '2026-01-02T00:00:00.000Z',
    items: [cloudItem],
  };

  // Restore 1
  const r1 = reconcileSnapshotWithLocal({
    localTables: { zh_saved_words: JSON.stringify([localRow]) },
    snapshot,
    syncState: initialSyncState,
  });

  const r1Rows = JSON.parse(r1.reconciledTables.zh_saved_words);
  assert.equal(r1Rows[0].notes, 'local custom note');
  assert.equal(r1.nextSyncState.records['zh:saved_words:苹果:píngguǒ'].status, 'dirty', 'First restore must keep dirty status');

  // Restore 2
  const r2 = reconcileSnapshotWithLocal({
    localTables: r1.reconciledTables,
    snapshot,
    syncState: r1.nextSyncState,
  });

  const r2Rows = JSON.parse(r2.reconciledTables.zh_saved_words);
  assert.equal(r2Rows[0].notes, 'local custom note', 'Second restore must not overwrite local custom note');
  assert.equal(r2.nextSyncState.records['zh:saved_words:苹果:píngguǒ'].status, 'dirty', 'Second restore must keep dirty status');

  // Restore 3 (verify it survives across multiple repeated restores)
  const r3 = reconcileSnapshotWithLocal({
    localTables: r2.reconciledTables,
    snapshot,
    syncState: r2.nextSyncState,
  });

  const r3Rows = JSON.parse(r3.reconciledTables.zh_saved_words);
  assert.equal(r3Rows[0].notes, 'local custom note', 'Third restore must retain local custom note');
  assert.equal(r3.nextSyncState.records['zh:saved_words:苹果:píngguǒ'].status, 'dirty', 'Third restore must keep dirty status');
});

test('Reproduction 2: Pending deletion is resurrected when cloud timestamp is newer', () => {
  const initialSyncState = {
    schemaVersion: 1,
    ownerId: OWNER_A,
    resetVersion: '1',
    lastServerTime: '2026-01-01T00:00:00.000Z',
    records: {
      'zh:saved_words:苹果:píngguǒ': {
        status: 'deleted',
        deletedAt: '2026-01-02T00:00:00.000Z',
      },
    },
    updatedAt: '2026-01-02T00:00:00.000Z',
  };

  // Cloud item has updated_at later than deletedAt (e.g. clock skew)
  const cloudItem = {
    language: 'zh',
    kind: 'saved_words',
    written_form: '苹果',
    reading: 'píngguǒ',
    item_key: 'cloud-1',
    revision: '1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-03T00:00:00.000Z', // later than deletedAt!
    data: {},
  };

  const snapshot = {
    schema_version: 1,
    user_id: OWNER_A,
    reset_version: '1',
    server_time: '2026-01-03T00:00:00.000Z',
    items: [cloudItem],
  };

  const res = reconcileSnapshotWithLocal({
    localTables: { zh_saved_words: '[]' },
    snapshot,
    syncState: initialSyncState,
  });

  const rows = JSON.parse(res.reconciledTables.zh_saved_words);
  assert.equal(rows.length, 0, 'Deleted word must remain absent regardless of clock ordering');
  assert.equal(res.nextSyncState.records['zh:saved_words:苹果:píngguǒ'].status, 'deleted', 'Tombstone must be preserved');
});

test('Reproduction 3: Same-identity edits are not tracked by trackTableChanges', () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);
  const scope = storageOwner.scope(OWNER_A);

  // 1. Write word
  scope.setTable('zh', 'saved_words', JSON.stringify([{
    id: 'w1',
    phrase: '苹果',
    reading: 'píngguǒ',
    notes: 'initial note',
  }]));

  // 2. Mark its metadata synced
  const key = recordKey('zh', 'saved_words', '苹果', 'píngguǒ');
  const syncState = {
    schemaVersion: 1,
    ownerId: OWNER_A,
    resetVersion: '1',
    lastServerTime: '2026-01-01T00:00:00.000Z',
    records: {
      [key]: {
        status: 'synced',
        cloudRevision: '1',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    },
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  persistSyncState(storage, syncState);

  // 3. Change only its note, keeping ID, written form and reading unchanged
  scope.setTable('zh', 'saved_words', JSON.stringify([{
    id: 'w1',
    phrase: '苹果',
    reading: 'píngguǒ',
    notes: 'edited note',
  }]));

  const afterState = readSyncState(storage, OWNER_A).state;
  assert.equal(afterState.records[key].status, 'dirty', 'Same-identity edit must be tracked as dirty');
});

// ---------------------------------------------------------------------------
// 2. Tombstone Clock Ordering Tests (Before, Equal To, After)
// ---------------------------------------------------------------------------

test('Tombstones survive cloud timestamps before, equal to, and after the device timestamp', () => {
  const deletedAt = '2026-05-10T12:00:00.000Z';
  const key = 'zh:saved_words:时间:shíjiān';

  const baseSyncState = {
    schemaVersion: 1,
    ownerId: OWNER_A,
    resetVersion: '1',
    lastServerTime: '2026-05-10T00:00:00.000Z',
    records: {
      [key]: {
        status: 'deleted',
        deletedAt,
      },
    },
    updatedAt: deletedAt,
  };

  const timestamps = [
    { label: 'before', cloudTime: '2026-05-10T10:00:00.000Z' },
    { label: 'equal to', cloudTime: '2026-05-10T12:00:00.000Z' },
    { label: 'after', cloudTime: '2026-05-10T14:00:00.000Z' },
  ];

  for (const { label, cloudTime } of timestamps) {
    const cloudItem = {
      language: 'zh',
      kind: 'saved_words',
      written_form: '时间',
      reading: 'shíjiān',
      item_key: 'cloud-time-test',
      revision: '1',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: cloudTime,
      data: { definition: 'time' },
    };

    const snapshot = {
      schema_version: 1,
      user_id: OWNER_A,
      reset_version: '1',
      server_time: '2026-05-11T00:00:00.000Z',
      items: [cloudItem],
    };

    const res = reconcileSnapshotWithLocal({
      localTables: { zh_saved_words: '[]' },
      snapshot,
      syncState: baseSyncState,
    });

    const rows = JSON.parse(res.reconciledTables.zh_saved_words);
    assert.equal(rows.length, 0, `Deleted word must remain absent when cloud timestamp is ${label} deletedAt`);
    assert.equal(res.nextSyncState.records[key].status, 'deleted', `Tombstone must be preserved when cloud timestamp is ${label} deletedAt`);
    assert.equal(res.nextSyncState.records[key].deletedAt, deletedAt);
  }
});

// ---------------------------------------------------------------------------
// 3. Database APIs: scope.setTable() and createLocalDatabase.update()/remove()
// ---------------------------------------------------------------------------

test('Exercise scope.setTable() and createLocalDatabase.update()/remove()', () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  storageOwner.setOwner(OWNER_A);

  const localDb = createLocalDatabase({
    getScope: () => storageOwner.scope(),
    getLanguage: () => 'zh',
  });

  // 1. Insert word through db API
  const inserted = localDb.insert('saved_words', {
    phrase: '学习',
    reading: 'xuéxí',
    notes: 'initial note',
  });
  assert.ok(inserted.id);

  const key = recordKey('zh', 'saved_words', '学习', 'xuéxí');
  let state = readSyncState(storage, OWNER_A).state;
  assert.equal(state.records[key].status, 'dirty', 'Insert must mark record dirty');

  // 2. Mark synced
  state.records[key] = {
    status: 'synced',
    cloudRevision: '1',
    updatedAt: new Date().toISOString(),
  };
  persistSyncState(storage, state);

  // 3. Update notes through db.update()
  localDb.update('saved_words', inserted.id, { notes: 'updated note via db.update' });
  state = readSyncState(storage, OWNER_A).state;
  assert.equal(state.records[key].status, 'dirty', 'db.update with modified note must mark record dirty');

  // Verify the row in table has the update
  const rowsAfterUpdate = localDb.get('saved_words');
  assert.equal(rowsAfterUpdate[0].notes, 'updated note via db.update');

  // 4. Mark synced again
  state.records[key] = {
    status: 'synced',
    cloudRevision: '2',
    updatedAt: new Date().toISOString(),
  };
  persistSyncState(storage, state);

  // 5. Remove through db.remove()
  const removed = localDb.remove('saved_words', inserted.id);
  assert.equal(removed, true);
  state = readSyncState(storage, OWNER_A).state;
  assert.equal(state.records[key].status, 'deleted', 'db.remove must record deletion tombstone');
  assert.ok(state.records[key].deletedAt);

  // Verify table is empty
  assert.equal(localDb.get('saved_words').length, 0);
});

// ---------------------------------------------------------------------------
// 4. Unchanged Table Rewrites & Multi-Owner Data Isolation
// ---------------------------------------------------------------------------

test('Unchanged table rewrites do not mark rows dirty', () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);
  const scope = storageOwner.scope(OWNER_A);

  const rows = [
    { id: '1', phrase: '一', reading: 'yī', notes: 'one' },
    { id: '2', phrase: '二', reading: 'èr', notes: 'two' },
  ];

  scope.setTable('zh', 'saved_words', JSON.stringify(rows));

  const key1 = recordKey('zh', 'saved_words', '一', 'yī');
  const key2 = recordKey('zh', 'saved_words', '二', 'èr');

  // Mark both synced
  const syncState = {
    schemaVersion: 1,
    ownerId: OWNER_A,
    resetVersion: '1',
    lastServerTime: '2026-01-01T00:00:00.000Z',
    records: {
      [key1]: { status: 'synced', cloudRevision: '1', updatedAt: '2026-01-01T00:00:00.000Z' },
      [key2]: { status: 'synced', cloudRevision: '1', updatedAt: '2026-01-01T00:00:00.000Z' },
    },
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  persistSyncState(storage, syncState);

  // Rewrite table with identical rows
  scope.setTable('zh', 'saved_words', JSON.stringify(rows));

  const stateAfter = readSyncState(storage, OWNER_A).state;
  assert.equal(stateAfter.records[key1].status, 'synced', 'Unchanged row 1 must remain synced');
  assert.equal(stateAfter.records[key2].status, 'synced', 'Unchanged row 2 must remain synced');
});

test('Multi-owner isolation: Owner A data and sync state are preserved when Owner B writes', () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });

  // 1. Owner A writes a word and has sync state
  storageOwner.setOwner(OWNER_A);
  const scopeA = storageOwner.scope(OWNER_A);
  scopeA.setTable('zh', 'saved_words', JSON.stringify([{
    id: 'a1',
    phrase: '中文',
    reading: 'zhōngwén',
  }]));

  const keyA = recordKey('zh', 'saved_words', '中文', 'zhōngwén');
  persistSyncState(storage, {
    schemaVersion: 1,
    ownerId: OWNER_A,
    resetVersion: '1',
    lastServerTime: '2026-01-01T00:00:00.000Z',
    records: {
      [keyA]: { status: 'dirty', updatedAt: '2026-01-01T00:00:00.000Z' },
    },
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  // 2. Switch to Owner B
  storageOwner.setOwner(OWNER_B);
  const scopeB = storageOwner.scope(OWNER_B);
  scopeB.setTable('zh', 'saved_words', JSON.stringify([{
    id: 'b1',
    phrase: '日语',
    reading: 'rìyǔ',
  }]));

  // 3. Switch back to Owner A and verify isolation
  storageOwner.setOwner(OWNER_A);
  const rowsA = JSON.parse(scopeA.getTable('zh', 'saved_words'));
  assert.equal(rowsA.length, 1);
  assert.equal(rowsA[0].phrase, '中文');

  const syncA = readSyncState(storage, OWNER_A).state;
  assert.equal(syncA.records[keyA].status, 'dirty');
  assert.equal(syncA.ownerId, OWNER_A);

  // Check Owner B's sync state and tables are also intact
  const rowsB = JSON.parse(scopeB.getTable('zh', 'saved_words'));
  assert.equal(rowsB.length, 1);
  assert.equal(rowsB[0].phrase, '日语');
});

// ---------------------------------------------------------------------------
// 5. Cloud-Only Rows Restoration
// ---------------------------------------------------------------------------

test('Cloud-only rows restore normally into local tables with synced status', () => {
  const cloudItem1 = {
    language: 'zh',
    kind: 'saved_words',
    written_form: '猫',
    reading: 'māo',
    item_key: 'cloud-cat',
    revision: '5',
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-02T00:00:00.000Z',
    data: { english: 'cat', burmese: 'ကြောင်' },
  };

  const cloudItem2 = {
    language: 'zh',
    kind: 'review_cards',
    written_form: '狗',
    reading: 'gǒu',
    item_key: 'cloud-dog',
    revision: '3',
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-02T00:00:00.000Z',
    data: { character: '狗', pronunciation: 'gǒu' },
  };

  const snapshot = {
    schema_version: 1,
    user_id: OWNER_A,
    reset_version: '1',
    server_time: '2026-03-02T00:00:00.000Z',
    items: [cloudItem1, cloudItem2],
  };

  const res = reconcileSnapshotWithLocal({
    localTables: {},
    snapshot,
    syncState: null,
  });

  assert.equal(res.changesCount, 2, 'Must record 2 changes for new cloud items');

  const savedWords = JSON.parse(res.reconciledTables.zh_saved_words);
  assert.equal(savedWords.length, 1);
  assert.equal(savedWords[0].phrase, '猫');
  assert.equal(savedWords[0].reading, 'māo');
  assert.equal(savedWords[0].english, 'cat');

  const reviewCards = JSON.parse(res.reconciledTables.zh_review_cards);
  assert.equal(reviewCards.length, 1);
  assert.equal(reviewCards[0].character, '狗');
  assert.equal(reviewCards[0].pronunciation, 'gǒu');

  const key1 = recordKey('zh', 'saved_words', '猫', 'māo');
  const key2 = recordKey('zh', 'review_cards', '狗', 'gǒu');

  assert.equal(res.nextSyncState.records[key1].status, 'synced');
  assert.equal(res.nextSyncState.records[key1].cloudRevision, '5');

  assert.equal(res.nextSyncState.records[key2].status, 'synced');
  assert.equal(res.nextSyncState.records[key2].cloudRevision, '3');
});
