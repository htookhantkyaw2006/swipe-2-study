import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileSnapshotWithLocal,
  recordLocalDeletion,
  readSyncState,
  restoreAccountSnapshot,
} from '../src/lib/cloudSnapshotHydration.js';
import { createStorageOwner } from '../src/lib/storageOwner.js';

const A = '11111111-1111-4111-8111-111111111111';

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

test('local deletion does not reappear from older cloud snapshot', () => {
  const storage = createMockStorage();
  const ownerId = A;

  // Record that user deleted word "你好" locally at 2026-01-05
  recordLocalDeletion(storage, ownerId, 'zh', 'saved_words', '你好', 'nǐ hǎo', () => '2026-01-05T00:00:00.000Z');

  const { state: syncState } = readSyncState(storage, ownerId);

  // Cloud snapshot has "你好" with updated_at: 2026-01-02 (older than deletion)
  const snapshot = {
    schema_version: 1,
    user_id: ownerId,
    reset_version: '0',
    server_time: '2026-01-06T00:00:00.000Z',
    items: [{
      language: 'zh',
      kind: 'saved_words',
      written_form: '你好',
      reading: 'nǐ hǎo',
      item_key: 'key1',
      revision: '1',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
      data: { english: 'Hello' },
    }],
  };

  const localTables = {
    zh_saved_words: '[]',
  };

  const { reconciledTables } = reconcileSnapshotWithLocal({
    localTables,
    snapshot,
    syncState,
    now: () => '2026-01-06T00:00:00.000Z',
  });

  const words = JSON.parse(reconciledTables.zh_saved_words);
  assert.equal(words.length, 0, 'Deleted item must NOT reappear from older snapshot');
});

test('newer local learning is NOT overwritten by older cloud snapshot item', () => {
  const ownerId = A;

  // Local word was updated locally at 2026-01-05 with local translation
  const localTables = {
    zh_saved_words: JSON.stringify([{
      id: 'local-1',
      phrase: '你好',
      reading: 'nǐ hǎo',
      english: 'Hello (Local updated)',
      updated_at: '2026-01-05T00:00:00.000Z',
    }]),
  };

  // Cloud item has older updated_at: 2026-01-02
  const snapshot = {
    schema_version: 1,
    user_id: ownerId,
    reset_version: '0',
    server_time: '2026-01-06T00:00:00.000Z',
    items: [{
      language: 'zh',
      kind: 'saved_words',
      written_form: '你好',
      reading: 'nǐ hǎo',
      item_key: 'key1',
      revision: '1',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
      data: { english: 'Hello (Cloud older)' },
    }],
  };

  const { reconciledTables } = reconcileSnapshotWithLocal({
    localTables,
    snapshot,
    syncState: null,
    now: () => '2026-01-06T00:00:00.000Z',
  });

  const words = JSON.parse(reconciledTables.zh_saved_words);
  assert.equal(words.length, 1);
  assert.equal(words[0].english, 'Hello (Local updated)', 'Must keep newer local learning');
});

test('pre-existing local cache predating cloud metadata is preserved alongside new cloud items', () => {
  const ownerId = A;

  // Pre-existing local cache has local word "谢谢"
  const localTables = {
    zh_saved_words: JSON.stringify([{
      id: 'local-pre-existing',
      phrase: '谢谢',
      reading: 'xiè xie',
      english: 'Thanks',
      created_at: '2026-01-01T00:00:00.000Z',
    }]),
  };

  // Cloud snapshot has different word "再见"
  const snapshot = {
    schema_version: 1,
    user_id: ownerId,
    reset_version: '0',
    server_time: '2026-01-06T00:00:00.000Z',
    items: [{
      language: 'zh',
      kind: 'saved_words',
      written_form: '再见',
      reading: 'zài jiàn',
      item_key: 'key-bye',
      revision: '1',
      created_at: '2026-01-02T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
      data: { english: 'Goodbye' },
    }],
  };

  const { reconciledTables, nextSyncState } = reconcileSnapshotWithLocal({
    localTables,
    snapshot,
    syncState: null, // no prior sync metadata
    now: () => '2026-01-06T00:00:00.000Z',
  });

  const words = JSON.parse(reconciledTables.zh_saved_words);
  assert.equal(words.length, 2, 'Both pre-existing local word and cloud word must be in effective cache');
  assert.ok(words.some(w => w.phrase === '谢谢'));
  assert.ok(words.some(w => w.phrase === '再见'));

  // Pre-existing local word is marked dirty for future cloud upload
  const localKey = 'zh:saved_words:谢谢:xiè xie';
  assert.equal(nextSyncState.records[localKey]?.status, 'dirty');
});

test('atomic effective-cache commit preserves opaque metadata in learning_document_v1', async () => {
  const storage = createMockStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  const ownerId = A;
  storageOwner.setOwner(ownerId);

  const scope = storageOwner.scope(ownerId);
  // Seed learning_document_v1 with custom opaque metadata
  scope.commitLearningDocument(null, {
    version: 1,
    revision: 5,
    customOpaqueKey: 'custom-val-123',
    tables: {
      zh_saved_words: JSON.stringify([{ id: 'local-1', phrase: '早上好', reading: 'zǎoshang hǎo' }]),
    },
    guestImport: {
      fingerprint: 'b'.repeat(64),
      choice: 'merge',
      decidedAt: '2026-01-01T00:00:00.000Z',
      handled: { zh_saved_words: ['zǎoshang hǎo'] },
    },
  });

  // Mock Supabase client returning snapshot with new word
  const mockClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: ownerId } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: ownerId } } }, error: null }),
    },
    rpc: async (fn) => {
      if (fn === 's2s_account_snapshot') {
        return {
          data: {
            schema_version: 1,
            user_id: ownerId,
            reset_version: '0',
            server_time: '2026-01-06T00:00:00.000Z',
            items: [{
              language: 'zh',
              kind: 'saved_words',
              written_form: '晚安',
              reading: 'wǎn\'ān',
              item_key: 'b'.repeat(64),
              revision: '1',
              created_at: '2026-01-02T00:00:00.000Z',
              updated_at: '2026-01-02T00:00:00.000Z',
              observed_at: '2026-01-02T00:00:00.000Z',
              data: { english: 'Good night' },
            }],
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };

  const oldStorage = globalThis.localStorage;
  globalThis.localStorage = storage;
  try {
    const res = await restoreAccountSnapshot(mockClient, storageOwner, {
      expectedUserId: ownerId,
      isCurrent: () => true,
    });

    assert.equal(res.outcome, 'restored');

    const doc = scope.readLearningDocument().value;
    assert.equal(doc.customOpaqueKey, 'custom-val-123', 'Opaque metadata must be preserved');
    assert.equal(doc.guestImport.choice, 'merge', 'Guest import metadata preserved');
    const words = JSON.parse(doc.tables.zh_saved_words);
    assert.equal(words.length, 2, 'Both words present');
  } finally {
    globalThis.localStorage = oldStorage;
  }
});
