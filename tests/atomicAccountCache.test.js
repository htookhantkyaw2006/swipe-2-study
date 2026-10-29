import test from 'node:test';
import assert from 'node:assert/strict';

import { createStorageOwner } from '../src/lib/storageOwner.js';
import { createLocalDatabase } from '../src/lib/localDatabase.js';
import {
  restoreAccountSnapshot,
  readSyncState,
  getSyncStateKey,
  recordKey,
} from '../src/lib/cloudSnapshotHydration.js';

const OWNER_A = '11111111-1111-4111-8111-111111111111';
const OWNER_B = '22222222-2222-4222-8222-222222222222';

function getLearningDocKey(ownerId) {
  return `s2s_user_${ownerId}_learning_document_v1`;
}

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

function createMockClient(snapshot) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: OWNER_A } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: OWNER_A } } }, error: null }),
    },
    rpc: async (fn) => {
      if (fn === 's2s_account_snapshot') {
        return { data: snapshot, error: null };
      }
      return { data: null, error: null };
    },
  };
}

// ---------------------------------------------------------------------------
// Confirmed Failure A: Actual database deletion reports false success
// ---------------------------------------------------------------------------

test('Confirmed Failure A: db.remove() must not report false success when metadata/document write fails', () => {
  const syncKey = getSyncStateKey(OWNER_A);
  const wordKey = recordKey('zh', 'saved_words', '苹果', 'píngguǒ');
  const localRow = {
    id: 'word-1',
    phrase: '苹果',
    reading: 'píngguǒ',
    notes: 'custom note',
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  };

  const initialSyncState = {
    schemaVersion: 1,
    ownerId: OWNER_A,
    resetVersion: '1',
    lastServerTime: '2026-06-01T00:00:00.000Z',
    records: {
      [wordKey]: {
        status: 'synced',
        cloudRevision: '1',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    },
    updatedAt: '2026-06-01T00:00:00.000Z',
  };

  const storage = createMemoryStorage({
    [syncKey]: JSON.stringify(initialSyncState),
    [`s2s_user_${OWNER_A}_zh_saved_words`]: JSON.stringify([localRow]),
  });

  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);

  const localDb = createLocalDatabase({
    getScope: () => storageOwner.scope(),
    getLanguage: () => 'zh',
  });

  // Inject failure when writing metadata or authoritative learning document,
  // while legacy table writes would succeed.
  storage.setThrowOnSetKey((k) => k.includes('cloud_sync_state_v1') || k.includes('learning_document_v1'));

  // Attempting remove:
  // REQUIRED: Must throw or fail; must NOT report success (true) if tombstone cannot be committed!
  // And the word must NOT be removed without its tombstone!
  assert.throws(
    () => localDb.remove('saved_words', 'word-1'),
    /Storage quota\/write failure|save could not be confirmed|CacheStorageError/i
  );

  // Both table row and metadata must remain unchanged
  const rowsAfter = localDb.get('saved_words');
  assert.equal(rowsAfter.length, 1, 'Word must remain present when metadata write fails');
  assert.equal(rowsAfter[0].id, 'word-1');
});

// ---------------------------------------------------------------------------
// Confirmed Failure B: Snapshot restoration partially commits
// ---------------------------------------------------------------------------

test('Confirmed Failure B: restoreAccountSnapshot must not leave table updated without metadata on sidecar failure', async () => {
  const storage = createMemoryStorage();

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
      items: [{
        language: 'zh',
        kind: 'saved_words',
        written_form: '香蕉',
        reading: 'xiāngjiāo',
        item_key: 'b'.repeat(64),
        revision: '1',
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z',
        observed_at: '2026-06-01T00:00:00.000Z',
        data: { english: 'Banana' },
      }],
    };

    const mockClient = createMockClient(cloudSnapshot);

    // Inject failure on cloud_sync_state_v1 writes
    storage.setThrowOnSetKey((k) => k.includes('cloud_sync_state_v1'));

    const result = await restoreAccountSnapshot(mockClient, storageOwner, {
      expectedUserId: OWNER_A,
      isCurrent: () => true,
    });

    // REQUIRED DESIGN:
    // Snapshot restore stores effective rows AND associated sync state inside the same
    // learning_document_v1 JSON value in ONE authoritative setItem!
    // A second sidecar write must not be required for correctness.
    // If the single authoritative write succeeds, restore is 'restored' and metadata is embedded!
    assert.equal(result.outcome, 'restored', 'Restoration succeeds authoritatively inside learning_document_v1');

    // Both the word AND the sync state are present and valid
    const syncState = readSyncState(storage, OWNER_A).state;
    assert.ok(syncState, 'Sync state must be readable from authoritative document');
    const wordKey = recordKey('zh', 'saved_words', '香蕉', 'xiāngjiāo');
    assert.equal(syncState.records[wordKey]?.status, 'synced');
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
});

// ---------------------------------------------------------------------------
// Atomic mutations: insert, update, and remove commit tables and sync together
// ---------------------------------------------------------------------------

test('atomic mutations: insert, update, and remove commit tables and sync metadata together', () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  storageOwner.setOwner(OWNER_A);

  const db = createLocalDatabase({
    getScope: () => storageOwner.scope(),
    getLanguage: () => 'zh',
    now: () => '2026-06-15T12:00:00.000Z',
  });

  // 1. Insert
  const inserted = db.insert('saved_words', {
    phrase: '猫',
    reading: 'māo',
    english: 'Cat',
  });
  assert.ok(inserted.id);

  const scope = storageOwner.scope();
  const docAfterInsert = scope.readLearningDocument().value;
  assert.ok(docAfterInsert);
  const zhSavedWords = JSON.parse(docAfterInsert.tables.zh_saved_words);
  assert.equal(zhSavedWords.length, 1);
  assert.equal(zhSavedWords[0].phrase, '猫');
  const catKey = recordKey('zh', 'saved_words', '猫', 'māo');
  assert.equal(docAfterInsert.cloudSync?.records[catKey]?.status, 'dirty');

  // 2. Update
  const updated = db.update('saved_words', inserted.id, {
    english: 'Kitty',
  });
  assert.equal(updated.english, 'Kitty');

  const docAfterUpdate = scope.readLearningDocument().value;
  const updatedWords = JSON.parse(docAfterUpdate.tables.zh_saved_words);
  assert.equal(updatedWords[0].english, 'Kitty');
  assert.equal(docAfterUpdate.cloudSync?.records[catKey]?.status, 'dirty');

  // 3. Remove
  const removed = db.remove('saved_words', inserted.id);
  assert.equal(removed, true);

  const docAfterRemove = scope.readLearningDocument().value;
  const removedWords = JSON.parse(docAfterRemove.tables.zh_saved_words);
  assert.equal(removedWords.length, 0);
  assert.equal(docAfterRemove.cloudSync?.records[catKey]?.status, 'deleted');
});

// ---------------------------------------------------------------------------
// Quota / storage failure before authoritative commit leaves exact previous bytes
// ---------------------------------------------------------------------------

test('storage failure before authoritative commit leaves exact previous bytes unchanged', () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  storageOwner.setOwner(OWNER_A);

  const db = createLocalDatabase({
    getScope: () => storageOwner.scope(),
    getLanguage: () => 'zh',
    now: () => '2026-06-15T12:00:00.000Z',
  });

  const inserted = db.insert('saved_words', {
    phrase: '狗',
    reading: 'gǒu',
    english: 'Dog',
  });

  const docKey = getLearningDocKey(OWNER_A);
  const rawBytesBefore = storage.getItem(docKey);
  assert.ok(rawBytesBefore);

  // Inject failure when writing authoritative document
  storage.setThrowOnSetKey((k) => k === docKey);

  assert.throws(
    () => db.update('saved_words', inserted.id, { english: 'Puppy' }),
    /Storage quota\/write failure|save could not be confirmed|CacheStorageError/i
  );

  // Exact previous bytes remain unchanged
  assert.equal(storage.getItem(docKey), rawBytesBefore);

  // Querying db still returns original record
  const current = db.get('saved_words');
  assert.equal(current[0].english, 'Dog');
});

// ---------------------------------------------------------------------------
// Corrupt embedded metadata or legacy metadata halts writes safely
// ---------------------------------------------------------------------------

test('corrupt embedded metadata stops writes without damaging storage', () => {
  const docKey = getLearningDocKey(OWNER_A);
  const corruptDoc = {
    version: 1,
    revision: 1,
    tables: { zh_saved_words: '[]' },
    guestImport: {
      fingerprint: '0'.repeat(64),
      choice: 'account-only',
      decidedAt: '2026-06-01T00:00:00.000Z',
      handled: {},
    },
    cloudSync: {
      schemaVersion: 99, // unsupported schema
      ownerId: OWNER_A,
      resetVersion: '1',
      records: {},
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
  };

  const storage = createMemoryStorage({
    [docKey]: JSON.stringify(corruptDoc),
  });

  const storageOwner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  storageOwner.setOwner(OWNER_A);

  const db = createLocalDatabase({
    getScope: () => storageOwner.scope(),
    getLanguage: () => 'zh',
  });

  assert.throws(
    () => db.insert('saved_words', { phrase: '鸟', reading: 'niǎo' }),
    /unsupported format|Malformed sync state|CacheStorageError/i
  );

  // Corrupt document was not overwritten
  assert.equal(JSON.parse(storage.getItem(docKey)).cloudSync.schemaVersion, 99);
});

test('owner mismatch in embedded metadata stops writes', () => {
  const docKey = getLearningDocKey(OWNER_A);
  const mismatchDoc = {
    version: 1,
    revision: 1,
    tables: { zh_saved_words: '[]' },
    guestImport: {
      fingerprint: '0'.repeat(64),
      choice: 'account-only',
      decidedAt: '2026-06-01T00:00:00.000Z',
      handled: {},
    },
    cloudSync: {
      schemaVersion: 1,
      ownerId: OWNER_B, // Mismatch with OWNER_A
      resetVersion: '1',
      records: {},
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
  };

  const storage = createMemoryStorage({
    [docKey]: JSON.stringify(mismatchDoc),
  });

  const storageOwner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  storageOwner.setOwner(OWNER_A);

  const db = createLocalDatabase({
    getScope: () => storageOwner.scope(),
    getLanguage: () => 'zh',
  });

  assert.throws(
    () => db.insert('saved_words', { phrase: '鱼', reading: 'yú' }),
    /owner mismatch|unsupported format|CacheStorageError/i
  );
});

// ---------------------------------------------------------------------------
// Legacy migration: migrates tables and sidecar, retaining old keys as recovery data
// ---------------------------------------------------------------------------

test('legacy migration migrates tables and sidecar metadata, retaining old raw keys as recovery data', () => {
  const syncKey = getSyncStateKey(OWNER_A);
  const legacyTableKey = `s2s_user_${OWNER_A}_zh_saved_words`;
  const legacyRow = {
    id: 'legacy-1',
    phrase: '书',
    reading: 'shū',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  const legacySyncState = {
    schemaVersion: 1,
    ownerId: OWNER_A,
    resetVersion: '1',
    records: {
      [recordKey('zh', 'saved_words', '书', 'shū')]: {
        status: 'synced',
        cloudRevision: '1',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    },
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const storage = createMemoryStorage({
    [syncKey]: JSON.stringify(legacySyncState),
    [legacyTableKey]: JSON.stringify([legacyRow]),
  });

  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);

  const db = createLocalDatabase({
    getScope: () => storageOwner.scope(),
    getLanguage: () => 'zh',
  });

  // Perform a mutation (insert new word)
  db.insert('saved_words', {
    phrase: '笔',
    reading: 'bǐ',
  });

  // Verify authoritative learning document now contains both legacy and new rows
  const docKey = getLearningDocKey(OWNER_A);
  const doc = JSON.parse(storage.getItem(docKey));
  assert.ok(doc, 'Authoritative document must be created');
  const migratedZhSavedWords = JSON.parse(doc.tables.zh_saved_words);
  assert.equal(migratedZhSavedWords.length, 2);
  assert.equal(migratedZhSavedWords[0].phrase, '书');
  assert.equal(migratedZhSavedWords[1].phrase, '笔');

  // Both metadata records are embedded in doc.cloudSync
  assert.ok(doc.cloudSync);
  assert.equal(doc.cloudSync.records[recordKey('zh', 'saved_words', '书', 'shū')].status, 'synced');
  assert.equal(doc.cloudSync.records[recordKey('zh', 'saved_words', '笔', 'bǐ')].status, 'dirty');

  // Crucial: Old raw keys are preserved for disaster recovery
  assert.ok(storage.getItem(legacyTableKey), 'Old table key must be retained');
  assert.ok(storage.getItem(syncKey), 'Old sidecar sync key must be retained');
});

// ---------------------------------------------------------------------------
// StorageOwner injected storage differs from global localStorage
// ---------------------------------------------------------------------------

test('storageOwner uses injected storage, never falling back to unrelated global localStorage', async () => {
  const injectedStorage = createMemoryStorage();
  const globalStorage = createMemoryStorage();

  const originalLocalStorage = globalThis.localStorage;
  globalThis.localStorage = globalStorage;

  try {
    const storageOwner = createStorageOwner({ storage: () => injectedStorage, cloudTracking: true });
    storageOwner.setOwner(OWNER_A);

    const cloudSnapshot = {
      schema_version: 1,
      user_id: OWNER_A,
      reset_version: '1',
      server_time: '2026-06-02T00:00:00.000Z',
      items: [{
        language: 'zh',
        kind: 'saved_words',
        written_form: '太阳',
        reading: 'tàiyáng',
        item_key: 'c'.repeat(64),
        revision: '1',
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z',
        observed_at: '2026-06-01T00:00:00.000Z',
        data: { english: 'Sun' },
      }],
    };

    const mockClient = createMockClient(cloudSnapshot);

    const result = await restoreAccountSnapshot(mockClient, storageOwner, {
      expectedUserId: OWNER_A,
      isCurrent: () => true,
    });

    assert.equal(result.outcome, 'restored');

    // Global storage must remain completely untouched!
    assert.equal(globalStorage.length, 0, 'global localStorage must not be touched');

    // Injected storage has the document and data
    const injectedDoc = storageOwner.scope().readLearningDocument().value;
    assert.ok(injectedDoc);
    const injectedWords = JSON.parse(injectedDoc.tables.zh_saved_words);
    assert.equal(injectedWords.length, 1);
    assert.equal(injectedWords[0].phrase, '太阳');
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
});

// ---------------------------------------------------------------------------
// Owner A, Owner B, and guest isolation
// ---------------------------------------------------------------------------

test('Owner A, Owner B, and guest accounts remain strictly isolated in cache', () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage, cloudTracking: true });

  // 1. Guest writes
  storageOwner.setOwner(null);
  const guestDb = createLocalDatabase({
    getScope: () => storageOwner.scope(),
    getLanguage: () => 'zh',
  });
  guestDb.insert('saved_words', { phrase: '客人', reading: 'kèrén' });

  // Guest must NOT write cloudSync or account learning documents
  const guestDoc = storageOwner.scope().readLearningDocument().value;
  assert.equal(guestDoc?.cloudSync, undefined);

  // 2. Owner A writes
  storageOwner.setOwner(OWNER_A);
  const dbA = createLocalDatabase({
    getScope: () => storageOwner.scope(),
    getLanguage: () => 'zh',
  });
  dbA.insert('saved_words', { phrase: '甲', reading: 'jiǎ' });

  // 3. Owner B writes
  storageOwner.setOwner(OWNER_B);
  const dbB = createLocalDatabase({
    getScope: () => storageOwner.scope(),
    getLanguage: () => 'zh',
  });
  dbB.insert('saved_words', { phrase: '乙', reading: 'yǐ' });

  // Verify Owner A document
  storageOwner.setOwner(OWNER_A);
  const docA = storageOwner.scope().readLearningDocument().value;
  const wordsA = JSON.parse(docA.tables.zh_saved_words);
  assert.equal(wordsA.length, 1);
  assert.equal(wordsA[0].phrase, '甲');

  // Verify Owner B document
  storageOwner.setOwner(OWNER_B);
  const docB = storageOwner.scope().readLearningDocument().value;
  const wordsB = JSON.parse(docB.tables.zh_saved_words);
  assert.equal(wordsB.length, 1);
  assert.equal(wordsB[0].phrase, '乙');

  // Guest table has only guest word
  storageOwner.setOwner(null);
  assert.equal(guestDb.get('saved_words').length, 1);
  assert.equal(guestDb.get('saved_words')[0].phrase, '客人');
});

// ---------------------------------------------------------------------------
// Repeated restore preserving dirty edits and tombstones
// ---------------------------------------------------------------------------

test('repeated restore preserves dirty edits and tombstones across multiple snapshot passes', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  storageOwner.setOwner(OWNER_A);

  const db = createLocalDatabase({
    getScope: () => storageOwner.scope(),
    getLanguage: () => 'zh',
    now: () => '2026-06-15T12:00:00.000Z',
  });

  // Local word edited with custom note
  db.insert('saved_words', {
    phrase: '月亮',
    reading: 'yuèliang',
    notes: 'Local custom note',
  });

  // Local word deleted
  const wordToDelete = db.insert('saved_words', {
    phrase: '星星',
    reading: 'xīngxing',
  });
  db.remove('saved_words', wordToDelete.id);

  // Cloud snapshot with same reset_version ('0' as initialized on fresh storage)
  const cloudSnapshot = {
    schema_version: 1,
    user_id: OWNER_A,
    reset_version: '0',
    server_time: '2026-06-10T00:00:00.000Z',
    items: [
      {
        language: 'zh',
        kind: 'saved_words',
        written_form: '月亮',
        reading: 'yuèliang',
        item_key: 'd'.repeat(64),
        revision: '1',
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z',
        observed_at: '2026-06-01T00:00:00.000Z',
        data: { notes: 'Old cloud note' },
      },
      {
        language: 'zh',
        kind: 'saved_words',
        written_form: '星星',
        reading: 'xīngxing',
        item_key: 'e'.repeat(64),
        revision: '1',
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z',
        observed_at: '2026-06-01T00:00:00.000Z',
        data: {},
      },
    ],
  };

  const mockClient = createMockClient(cloudSnapshot);

  // First restore pass
  const res1 = await restoreAccountSnapshot(mockClient, storageOwner, {
    expectedUserId: OWNER_A,
    isCurrent: () => true,
  });
  assert.equal(res1.outcome, 'up_to_date');

  const doc1 = storageOwner.scope().readLearningDocument().value;
  const words1 = JSON.parse(doc1.tables.zh_saved_words);
  assert.equal(words1.length, 1);
  assert.equal(words1[0].phrase, '月亮');
  assert.equal(words1[0].notes, 'Local custom note');
  assert.equal(doc1.cloudSync.records[recordKey('zh', 'saved_words', '月亮', 'yuèliang')].status, 'dirty');
  assert.equal(doc1.cloudSync.records[recordKey('zh', 'saved_words', '星星', 'xīngxing')].status, 'deleted');

  // Second restore pass with identical snapshot
  const res2 = await restoreAccountSnapshot(mockClient, storageOwner, {
    expectedUserId: OWNER_A,
    isCurrent: () => true,
  });
  assert.equal(res2.outcome, 'up_to_date');

  const doc2 = storageOwner.scope().readLearningDocument().value;
  const words2 = JSON.parse(doc2.tables.zh_saved_words);
  assert.equal(words2.length, 1);
  assert.equal(words2[0].phrase, '月亮');
  assert.equal(words2[0].notes, 'Local custom note');
  assert.equal(doc2.cloudSync.records[recordKey('zh', 'saved_words', '月亮', 'yuèliang')].status, 'dirty');
  assert.equal(doc2.cloudSync.records[recordKey('zh', 'saved_words', '星星', 'xīngxing')].status, 'deleted');
});

// ---------------------------------------------------------------------------
// Concurrent edit retry check / optimistic concurrency guard
// ---------------------------------------------------------------------------

test('concurrent edit during mutation throws and prevents dirty overwrite', () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  storageOwner.setOwner(OWNER_A);

  const scope = storageOwner.scope();
  scope.setTable('zh', 'saved_words', JSON.stringify([{ id: '1', phrase: '一', reading: 'yī' }]));

  const docKey = getLearningDocKey(OWNER_A);
  const currentDoc = JSON.parse(storage.getItem(docKey));

  // If another process/tab modifies the document in storage
  const modifiedDoc = {
    ...currentDoc,
    revision: currentDoc.revision + 1,
    tables: {
      zh_saved_words: JSON.stringify([{ id: '1', phrase: '一', reading: 'yī' }, { id: '2', phrase: '二', reading: 'èr' }]),
    },
  };
  storage.setItem(docKey, JSON.stringify(modifiedDoc));

  // An update with stale expected state must throw
  assert.throws(
    () => {
      scope.commitLearningDocument(
        JSON.stringify(currentDoc),
        {
          ...currentDoc,
          revision: currentDoc.revision + 1,
          tables: { zh_saved_words: JSON.stringify([{ id: '1', phrase: '一-edited', reading: 'yī' }]) },
        },
        { zh_saved_words: JSON.stringify([{ id: '1', phrase: '一', reading: 'yī' }]) }
      );
    },
    /changed|CacheStorageError/i
  );
});
