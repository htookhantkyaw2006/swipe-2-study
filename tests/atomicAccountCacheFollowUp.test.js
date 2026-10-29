import test from 'node:test';
import assert from 'node:assert/strict';

import { createStorageOwner } from '../src/lib/storageOwner.js';
import { createLocalDatabase } from '../src/lib/localDatabase.js';
import {
  restoreAccountSnapshot,
  getSyncStateKey,
  recordKey,
  persistSyncState,
  recordLocalDeletion,
  recordLocalDirty,
} from '../src/lib/cloudSnapshotHydration.js';

const OWNER_A = '11111111-1111-4111-8111-111111111111';

function getLearningDocKey(ownerId) {
  return `s2s_user_${ownerId}_learning_document_v1`;
}

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  let throwOnSetKeyPattern = null;
  let throwOnGetKeyPattern = null;
  let corruptReadbackKeyPattern = null;
  return {
    getItem: (k) => {
      if (throwOnGetKeyPattern && throwOnGetKeyPattern(k)) {
        throw new Error(`Storage read failure on key: ${k}`);
      }
      if (corruptReadbackKeyPattern && corruptReadbackKeyPattern(k)) {
        return 'corrupted_readback_value';
      }
      return map.has(k) ? map.get(k) : null;
    },
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
    setThrowOnGetKey: (fn) => { throwOnGetKeyPattern = fn; },
    setCorruptReadbackKey: (fn) => { corruptReadbackKeyPattern = fn; },
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
// Finding 1: Restore writes the authoritative document twice
// ---------------------------------------------------------------------------

test('Finding 1: restoreAccountSnapshot must commit authoritative document exactly once (changed path)', async () => {
  const storage = createMemoryStorage();
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

  let docWriteCount = 0;
  const docKey = getLearningDocKey(OWNER_A);
  const origSetItem = storage.setItem;
  storage.setItem = (k, v) => {
    if (k === docKey) {
      docWriteCount++;
    }
    origSetItem(k, v);
  };

  const mockClient = createMockClient(cloudSnapshot);
  const result = await restoreAccountSnapshot(mockClient, storageOwner, {
    expectedUserId: OWNER_A,
    isCurrent: () => true,
  });

  assert.equal(result.outcome, 'restored');
  assert.equal(docWriteCount, 1, `Expected exactly 1 document write, got ${docWriteCount}`);
});

test('Finding 1: restoreAccountSnapshot must commit authoritative document exactly once (up_to_date path)', async () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  storageOwner.setOwner(OWNER_A);

  const db = createLocalDatabase({
    getScope: () => storageOwner.scope(),
    getLanguage: () => 'zh',
    now: () => '2026-06-01T00:00:00.000Z',
  });
  db.insert('saved_words', {
    phrase: '苹果',
    reading: 'píngguǒ',
  });

  const cloudSnapshot = {
    schema_version: 1,
    user_id: OWNER_A,
    reset_version: '0',
    server_time: '2026-06-02T00:00:00.000Z',
    items: [{
      language: 'zh',
      kind: 'saved_words',
      written_form: '苹果',
      reading: 'píngguǒ',
      item_key: 'a'.repeat(64),
      revision: '1',
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
      observed_at: '2026-06-01T00:00:00.000Z',
      data: {},
    }],
  };

  let docWriteCount = 0;
  const docKey = getLearningDocKey(OWNER_A);
  const origSetItem = storage.setItem;
  storage.setItem = (k, v) => {
    if (k === docKey) {
      docWriteCount++;
    }
    origSetItem(k, v);
  };

  const mockClient = createMockClient(cloudSnapshot);
  const result = await restoreAccountSnapshot(mockClient, storageOwner, {
    expectedUserId: OWNER_A,
    isCurrent: () => true,
  });

  assert.equal(result.outcome, 'up_to_date');
  assert.equal(docWriteCount, 1, `Expected exactly 1 document write, got ${docWriteCount}`);
});

// ---------------------------------------------------------------------------
// Finding 2: Metadata helpers hide authoritative write failure
// ---------------------------------------------------------------------------

test('Finding 2: recordLocalDeletion must propagate authoritative document write failure', () => {
  const docKey = getLearningDocKey(OWNER_A);
  const doc = {
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
      ownerId: OWNER_A,
      resetVersion: '1',
      records: {},
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
  };

  const storage = createMemoryStorage({
    [docKey]: JSON.stringify(doc),
  });

  // Make document writes throw while sidecar writes succeed
  storage.setThrowOnSetKey((k) => k === docKey);

  assert.throws(
    () => recordLocalDeletion(storage, OWNER_A, 'zh', 'saved_words', '苹果', 'píngguǒ'),
    /Storage quota\/write failure|write failure|CacheStorageError/i
  );
});

test('Finding 2: recordLocalDirty must propagate authoritative document write failure', () => {
  const docKey = getLearningDocKey(OWNER_A);
  const doc = {
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
      ownerId: OWNER_A,
      resetVersion: '1',
      records: {},
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
  };

  const storage = createMemoryStorage({
    [docKey]: JSON.stringify(doc),
  });

  storage.setThrowOnSetKey((k) => k === docKey);

  assert.throws(
    () => recordLocalDirty(storage, OWNER_A, 'zh', 'saved_words', '苹果', 'píngguǒ'),
    /Storage quota\/write failure|write failure|CacheStorageError/i
  );
});

test('Finding 2: persistSyncState must propagate failure when writing standalone legacy sidecar', () => {
  const storage = createMemoryStorage();
  const syncKey = getSyncStateKey(OWNER_A);
  storage.setThrowOnSetKey((k) => k === syncKey);

  const state = {
    schemaVersion: 1,
    ownerId: OWNER_A,
    resetVersion: '1',
    records: {},
    updatedAt: '2026-06-01T00:00:00.000Z',
  };

  assert.throws(
    () => persistSyncState(storage, state),
    /Storage quota\/write failure|write failure/i
  );
});

test('Finding 2: successful authoritative commit tolerates mirror failure', () => {
  const docKey = getLearningDocKey(OWNER_A);
  const syncKey = getSyncStateKey(OWNER_A);
  const doc = {
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
      ownerId: OWNER_A,
      resetVersion: '1',
      records: {},
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
  };

  const storage = createMemoryStorage({
    [docKey]: JSON.stringify(doc),
  });

  // Authoritative document write succeeds, but mirror sidecar write throws
  storage.setThrowOnSetKey((k) => k === syncKey);

  const nextState = {
    ...doc.cloudSync,
    records: {
      [recordKey('zh', 'saved_words', '桃子', 'táozi')]: {
        status: 'dirty',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    },
  };

  // Must not throw; mirror failure is tolerated
  assert.doesNotThrow(() => {
    persistSyncState(storage, nextState);
  });

  // Verify authoritative document committed the new sync state
  const updatedDoc = JSON.parse(storage.getItem(docKey));
  assert.equal(updatedDoc.cloudSync.records[recordKey('zh', 'saved_words', '桃子', 'táozi')].status, 'dirty');
});

test('Finding 2: readback failure after document write is reported as unconfirmed save', () => {
  const docKey = getLearningDocKey(OWNER_A);
  const doc = {
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
      ownerId: OWNER_A,
      resetVersion: '1',
      records: {},
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
  };

  const storage = createMemoryStorage({
    [docKey]: JSON.stringify(doc),
  });

  // Corrupt readback ONLY after write has occurred
  let writeOccurred = false;
  const origSetItem = storage.setItem;
  storage.setItem = (k, v) => {
    if (k === docKey) writeOccurred = true;
    origSetItem(k, v);
  };
  const origGetItem = storage.getItem;
  storage.getItem = (k) => {
    if (k === docKey && writeOccurred) {
      return 'mismatched_readback_value';
    }
    return origGetItem(k);
  };

  const nextState = { ...doc.cloudSync, resetVersion: '2' };
  assert.throws(
    () => persistSyncState(storage, nextState),
    /save could not be confirmed/i
  );
});

test('Finding 2: corrupt authoritative document halts persistSyncState and does not fall back to sidecar', () => {
  const docKey = getLearningDocKey(OWNER_A);
  const syncKey = getSyncStateKey(OWNER_A);

  const storage = createMemoryStorage({
    [docKey]: '{ corrupted json',
    [syncKey]: JSON.stringify({
      schemaVersion: 1,
      ownerId: OWNER_A,
      resetVersion: '1',
      records: {},
    }),
  });

  const nextState = {
    schemaVersion: 1,
    ownerId: OWNER_A,
    resetVersion: '2',
    records: {},
  };

  assert.throws(
    () => persistSyncState(storage, nextState),
    /unsupported format|Malformed|kept for recovery/i
  );

  // Sidecar must NOT have been updated with nextState
  const sidecar = JSON.parse(storage.getItem(syncKey));
  assert.equal(sidecar.resetVersion, '1', 'Sidecar must not be updated when authoritative document is corrupt');
});

// ---------------------------------------------------------------------------
// Finding 3: Tracking detection fails open
// ---------------------------------------------------------------------------

test('Finding 3: sidecar read error during tracking check must halt mutation and produce zero writes', () => {
  const syncKey = getSyncStateKey(OWNER_A);
  const wordKey = recordKey('zh', 'saved_words', '苹果', 'píngguǒ');
  const localRow = {
    id: 'word-1',
    phrase: '苹果',
    reading: 'píngguǒ',
    created_at: '2026-06-01T00:00:00.000Z',
  };

  let writeCount = 0;
  const storage = createMemoryStorage({
    [syncKey]: JSON.stringify({
      schemaVersion: 1,
      ownerId: OWNER_A,
      resetVersion: '1',
      records: {
        [wordKey]: { status: 'synced', updatedAt: '2026-06-01T00:00:00.000Z' },
      },
    }),
    [`s2s_user_${OWNER_A}_zh_saved_words`]: JSON.stringify([localRow]),
  });

  const origSetItem = storage.setItem;
  storage.setItem = (k, v) => {
    writeCount++;
    origSetItem(k, v);
  };

  // Throw ONLY when checking the sidecar
  storage.setThrowOnGetKey((k) => k === syncKey);

  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);

  const db = createLocalDatabase({
    getScope: () => storageOwner.scope(),
    getLanguage: () => 'zh',
  });

  assert.throws(
    () => db.remove('saved_words', 'word-1'),
    /Device storage read failed|Storage read failure|CacheStorageError/i
  );

  assert.equal(writeCount, 0, 'Zero writes must occur when tracking check fails');
});

test('Finding 3: authoritative embedded metadata does not depend on reading obsolete sidecar', () => {
  const docKey = getLearningDocKey(OWNER_A);
  const syncKey = getSyncStateKey(OWNER_A);
  const wordKey = recordKey('zh', 'saved_words', '苹果', 'píngguǒ');

  const doc = {
    version: 1,
    revision: 1,
    tables: {
      zh_saved_words: JSON.stringify([{ id: 'word-1', phrase: '苹果', reading: 'píngguǒ' }]),
    },
    guestImport: {
      fingerprint: '0'.repeat(64),
      choice: 'account-only',
      decidedAt: '2026-06-01T00:00:00.000Z',
      handled: {},
    },
    cloudSync: {
      schemaVersion: 1,
      ownerId: OWNER_A,
      resetVersion: '1',
      records: {
        [wordKey]: { status: 'synced', updatedAt: '2026-06-01T00:00:00.000Z' },
      },
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
  };

  const storage = createMemoryStorage({
    [docKey]: JSON.stringify(doc),
  });

  // Make sidecar throw on read. Since authoritative cloudSync exists, sidecar should not be read!
  storage.setThrowOnGetKey((k) => k === syncKey);

  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(OWNER_A);

  const db = createLocalDatabase({
    getScope: () => storageOwner.scope(),
    getLanguage: () => 'zh',
  });

  // Mutation succeeds without reading sidecar
  assert.doesNotThrow(() => {
    db.remove('saved_words', 'word-1');
  });

  const updatedDoc = JSON.parse(storage.getItem(docKey));
  assert.equal(updatedDoc.cloudSync.records[wordKey].status, 'deleted');
});

// ---------------------------------------------------------------------------
// Finding 4: Non-cloud tables break
// ---------------------------------------------------------------------------

test('Finding 4: non-cloud table write on tracked account must succeed and not corrupt or add sync records', () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  storageOwner.setOwner(OWNER_A);
  const scope = storageOwner.scope();

  const db = createLocalDatabase({
    getScope: () => scope,
    getLanguage: () => 'zh',
    now: () => '2026-06-01T00:00:00.000Z',
  });
  db.insert('saved_words', {
    phrase: '猫',
    reading: 'māo',
  });

  // Now seed/write flashcards
  scope.setTable('zh', 'flashcards', JSON.stringify([
    { id: 'seed-card', character: '月', pronunciation: 'yuè', english: 'Moon' }
  ]));

  const rawFlashcards = scope.getTable('zh', 'flashcards');
  assert.ok(rawFlashcards);
  const flashcards = JSON.parse(rawFlashcards);
  assert.equal(flashcards.length, 1);
  assert.equal(flashcards[0].character, '月');

  // Verify cloudSync metadata is preserved and has no flashcards records
  const doc = scope.readLearningDocument().value;
  assert.ok(doc.cloudSync);
  const hasFlashcardsRecord = Object.keys(doc.cloudSync.records).some((k) => k.includes('flashcards'));
  assert.equal(hasFlashcardsRecord, false);
});

test('Finding 4: guest non-cloud table writes maintain device-only behavior', () => {
  const storage = createMemoryStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(null);
  const scope = storageOwner.scope();

  scope.setTable('zh', 'flashcards', JSON.stringify([
    { id: 'guest-card', character: '日', pronunciation: 'rì', english: 'Sun' }
  ]));

  const rawFlashcards = scope.getTable('zh', 'flashcards');
  assert.ok(rawFlashcards);
  const flashcards = JSON.parse(rawFlashcards);
  assert.equal(flashcards.length, 1);
  assert.equal(flashcards[0].character, '日');

  // Must not have any cloud sync or account document
  assert.equal(storage.getItem(getLearningDocKey(OWNER_A)), null);
});
