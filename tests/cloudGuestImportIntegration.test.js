import test from 'node:test';
import assert from 'node:assert/strict';
import { isCloudImportStagingEnabled } from '../src/lib/cloudImportGate.js';
import { getActiveGuestImportService } from '../src/lib/guestImport.js';
import { createCloudGuestImportService } from '../src/lib/cloudGuestImportService.js';
import { createStorageOwner } from '../src/lib/storageOwner.js';
import { readDurableRecord, createDurableRecord, persistDurableRecord } from '../src/lib/cloudImportDurableRequest.js';
import { createLocalDatabase } from '../src/lib/localDatabase.js';
import { recordWordAction } from '../src/lib/vocabularyProgress.js';

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

test('staging gate is disabled by default and selects device-only service', () => {
  assert.equal(isCloudImportStagingEnabled({}), false);
  assert.equal(isCloudImportStagingEnabled({ VITE_CLOUD_IMPORT_STAGING: 'false' }), false);
  assert.equal(isCloudImportStagingEnabled(undefined), false);
  assert.equal(isCloudImportStagingEnabled({ VITE_CLOUD_IMPORT_STAGING: 'true' }), true);

  const defaultService = getActiveGuestImportService(false);
  assert.ok(defaultService);
});

test('cloud guest import prepares offer with honest progress records and audited samples', async () => {
  const storage = createMockStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(A);

  // Seed guest cache
  const guestScope = storageOwner.scope(null);
  guestScope.setTable('zh', 'saved_words', JSON.stringify([
    { id: 'g1', phrase: '苹果', reading: 'píngguǒ', english: 'Apple' },
    { id: 'g2', phrase: '示例', is_sample: true }, // explicit sample -> must be excluded
    { id: 'g3', phrase: '真实', reading: 'zhēnshí', seeded: true }, // seeded course word -> must be kept!
  ]));
  guestScope.setTable('zh', 'review_cards', JSON.stringify([
    { id: 'g4', character: '水', pronunciation: 'shuǐ' },
  ]));
  guestScope.setTable('ja', 'learned_kana', JSON.stringify([
    { id: 'g5', kana: 'あ', seen: 2, correct: 2, wrong: 0, streak: 2 },
  ]));

  const mockClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: A } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: A } } }, error: null }),
    },
    rpc: async (fn) => {
      if (fn === 's2s_account_snapshot') {
        return {
          data: {
            schema_version: 1,
            user_id: A,
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

  const oldStorage = globalThis.localStorage;
  globalThis.localStorage = storage;

  try {
    const service = createCloudGuestImportService({
      storageOwner,
      getAuthState: () => ({
        user: { id: A },
        generation: 1,
        loading: false,
        isTransitioning: false,
        error: null,
      }),
      getClient: () => mockClient,
    });

    const offer = await service.inspect();
    assert.equal(offer.status, 'available');
    assert.equal(offer.persistence, 'cloud');
    assert.equal(offer.ownerId, A);

    const zhSummary = offer.summary.find(s => s.languageId === 'zh');
    assert.equal(zhSummary.savedWords, 2, '2 real saved words (sample excluded, seeded kept)');
    assert.equal(zhSummary.reviewWords, 1);
    assert.equal(zhSummary.progressRecords, 0);

    const jaSummary = offer.summary.find(s => s.languageId === 'ja');
    assert.equal(jaSummary.progressRecords, 1, 'Kana progress counted in progressRecords');
  } finally {
    globalThis.localStorage = oldStorage;
  }
});

test('cloud guest import "account-only" does not upload guest items and preserves guest records', async () => {
  const storage = createMockStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(A);

  const guestScope = storageOwner.scope(null);
  guestScope.setTable('zh', 'saved_words', JSON.stringify([
    { id: 'g1', phrase: '猫', reading: 'māo', english: 'Cat' },
  ]));

  let importGuestParams = null;
  const mockClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: A } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: A } } }, error: null }),
    },
    rpc: async (fn, params) => {
      if (fn === 's2s_account_snapshot') {
        return {
          data: {
            schema_version: 1,
            user_id: A,
            reset_version: '0',
            server_time: '2026-01-06T00:00:00.000Z',
            items: [],
          },
          error: null,
        };
      }
      if (fn === 's2s_import_guest') {
        importGuestParams = params;
        return {
          data: {
            status: 'committed',
            persistence: 'cloud',
            schema_version: 1,
            user_id: params.p_expected_user_id,
            request_id: params.p_request_id,
            reset_version: params.p_expected_reset_version,
            source_fingerprint: params.p_source_fingerprint,
            choice: params.p_choice,
            accepted_count: 0,
            added_count: 0,
            updated_count: 0,
            replayed: false,
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
    const service = createCloudGuestImportService({
      storageOwner,
      getAuthState: () => ({
        user: { id: A },
        generation: 1,
        loading: false,
        isTransitioning: false,
        error: null,
      }),
      getClient: () => mockClient,
    });

    const offer = await service.inspect();
    const result = await service.choose(offer, 'account-only');

    assert.equal(result.status, 'saved');
    assert.equal(result.choice, 'account-only');
    assert.equal(result.persistence, 'cloud');

    // Verify 0 items sent to server
    assert.deepEqual(importGuestParams.p_items, [], 'account-only must send 0 items');
    assert.equal(importGuestParams.p_choice, 'account-only');

    // Verify guest records were kept
    const guestWords = JSON.parse(guestScope.getTable('zh', 'saved_words'));
    assert.equal(guestWords.length, 1, 'Guest words must remain on device');

    // Verify durable record is marked applied
    const durable = readDurableRecord(storage, A);
    assert.equal(durable.record?.state, 'locally_applied');
  } finally {
    globalThis.localStorage = oldStorage;
  }
});

test('completed old request + new vocabulary progress offers newly eligible progress and suppresses handled items', async () => {
  const storage = createMockStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(A);

  const guestScope = storageOwner.scope(null);
  guestScope.setTable('zh', 'saved_words', JSON.stringify([
    { id: 'g1', phrase: '苹果', reading: 'píngguǒ', english: 'Apple' },
  ]));

  // Simulate legacy 6-table fingerprint when only saved_words was present
  const legacyTables = [
    'saved_words', 'review_cards', 'written_chars',
    'learned_radicals', 'learned_kana', 'learned_sounds',
  ];
  const legacySource = [];
  for (const lang of ['zh', 'ja', 'en']) {
    for (const table of legacyTables) {
      legacySource.push([`${lang}_${table}`, guestScope.getTable(lang, table)]);
    }
  }
  const bytes = new TextEncoder().encode(JSON.stringify(legacySource));
  const hashBuf = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const legacyFingerprint = [...new Uint8Array(hashBuf)].map(b => b.toString(16).padStart(2, '0')).join('');

  // Setup completed old request (locally_applied) for Account A
  const oldRecord = createDurableRecord({
    ownerId: A,
    expectedResetVersion: '0',
    sourceFingerprint: legacyFingerprint,
    choice: 'merge',
    items: [{
      language: 'zh',
      kind: 'saved_words',
      written_form: '苹果',
      reading: 'píngguǒ',
      data: { english: 'Apple' },
      observed_at: '2026-01-01T00:00:00.000Z',
    }],
  });
  oldRecord.state = 'locally_applied';
  oldRecord.receipt = {
    status: 'committed',
    persistence: 'cloud',
    schema_version: 1,
    user_id: A,
    request_id: oldRecord.requestId,
    reset_version: '0',
    source_fingerprint: legacyFingerprint,
    choice: 'merge',
    accepted_count: 1,
    added_count: 1,
    updated_count: 0,
    replayed: false,
  };
  persistDurableRecord(storage, oldRecord);

  // Now guest acquires 30 learned_words
  const guestDb = createLocalDatabase({ getScope: () => guestScope, getLanguage: () => 'zh' });
  for (let i = 1; i <= 30; i++) {
    const pad = String(i).padStart(3, '0');
    recordWordAction(guestDb, {
      card: { id: `zh-hsk1-${pad}`, character: `词${i}`, pronunciation: `cí${i}`, level: 'HSK1' },
      direction: 'right',
      levelId: 'HSK1',
    });
  }

  const mockClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: A } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: A } } }, error: null }),
    },
    rpc: async (fn) => {
      if (fn === 's2s_account_snapshot') {
        return {
          data: {
            schema_version: 1,
            user_id: A,
            reset_version: '0',
            server_time: '2026-01-06T00:00:00.000Z',
            items: [{
              item_key: 'b'.repeat(64),
              revision: '1',
              language: 'zh',
              kind: 'saved_words',
              written_form: '苹果',
              reading: 'píngguǒ',
              data: { english: 'Apple' },
              observed_at: '2026-01-01T00:00:00.000Z',
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z',
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
    const service = createCloudGuestImportService({
      storageOwner,
      getAuthState: () => ({
        user: { id: A },
        generation: 1,
        loading: false,
        isTransitioning: false,
        error: null,
      }),
      getClient: () => mockClient,
    });

    const offer = await service.inspect();
    assert.equal(offer.status, 'available', 'Must offer newly eligible vocabulary progress');
    assert.equal(offer.ownerId, A);

    const zhSummary = offer.summary.find(s => s.languageId === 'zh');
    assert.ok(zhSummary);
    assert.equal(zhSummary.savedWords, 0, 'Handled saved_words must be excluded');
    assert.equal(zhSummary.reviewWords, 0);
    assert.equal(zhSummary.progressRecords, 30, 'Newly eligible learned_words must be offered');
  } finally {
    globalThis.localStorage = oldStorage;
  }
});

test('unchanged completed request remains repeat-safe and returns nothing-to-import', async () => {
  const storage = createMockStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(A);

  const guestScope = storageOwner.scope(null);
  guestScope.setTable('zh', 'saved_words', JSON.stringify([
    { id: 'g1', phrase: '书', reading: 'shū', english: 'Book' },
  ]));

  const { readGuestSnapshot } = await import('../src/lib/guestImportData.js');
  const snap = readGuestSnapshot(guestScope);
  const bytes = new TextEncoder().encode(snap.source);
  const hashBuf = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const currentFingerprint = [...new Uint8Array(hashBuf)].map(b => b.toString(16).padStart(2, '0')).join('');

  // Completed request matches current guest snapshot exactly
  const completedRecord = createDurableRecord({
    ownerId: A,
    expectedResetVersion: '0',
    sourceFingerprint: currentFingerprint,
    choice: 'account-only',
    items: [],
  });
  completedRecord.state = 'locally_applied';
  completedRecord.receipt = {
    status: 'committed',
    persistence: 'cloud',
    schema_version: 1,
    user_id: A,
    request_id: completedRecord.requestId,
    reset_version: '0',
    source_fingerprint: currentFingerprint,
    choice: 'account-only',
    accepted_count: 0,
    added_count: 0,
    updated_count: 0,
    replayed: false,
  };
  persistDurableRecord(storage, completedRecord);

  let snapshotCalled = false;
  const mockClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: A } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: A } } }, error: null }),
    },
    rpc: async (fn) => {
      if (fn === 's2s_account_snapshot') {
        snapshotCalled = true;
        return {
          data: {
            schema_version: 1,
            user_id: A,
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

  const oldStorage = globalThis.localStorage;
  globalThis.localStorage = storage;

  try {
    const service = createCloudGuestImportService({
      storageOwner,
      getAuthState: () => ({
        user: { id: A },
        generation: 1,
        loading: false,
        isTransitioning: false,
        error: null,
      }),
      getClient: () => mockClient,
    });

    const offer = await service.inspect();
    assert.equal(offer.status, 'nothing-to-import', 'Unchanged completed request must return nothing-to-import');
    assert.equal(offer.ownerId, A);
    assert.deepEqual(offer.summary, []);
    assert.equal(snapshotCalled, true, 'Snapshot hydration obligation must still run');
  } finally {
    globalThis.localStorage = oldStorage;
  }
});

test('unconfirmed request remains unchanged, preserving envelope and retry semantics', async () => {
  const storage = createMockStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(A);

  const unconfirmedRecord = createDurableRecord({
    ownerId: A,
    expectedResetVersion: '0',
    sourceFingerprint: 'c'.repeat(64),
    choice: 'merge',
    items: [{
      language: 'zh',
      kind: 'saved_words',
      written_form: '水',
      reading: 'shuǐ',
      data: { english: 'Water' },
      observed_at: '2026-01-01T00:00:00.000Z',
    }],
  });
  unconfirmedRecord.state = 'unconfirmed';
  persistDurableRecord(storage, unconfirmedRecord);

  const originalRequestId = unconfirmedRecord.requestId;

  const mockClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: A } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: A } } }, error: null }),
    },
    rpc: async (fn) => {
      if (fn === 's2s_account_snapshot') {
        return {
          data: {
            schema_version: 1,
            user_id: A,
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

  const oldStorage = globalThis.localStorage;
  globalThis.localStorage = storage;

  try {
    const service = createCloudGuestImportService({
      storageOwner,
      getAuthState: () => ({
        user: { id: A },
        generation: 1,
        loading: false,
        isTransitioning: false,
        error: null,
      }),
      getClient: () => mockClient,
    });

    const offer = await service.inspect();
    assert.equal(offer.status, 'available');
    assert.equal(offer.isRetry, true, 'Must identify unconfirmed request as retry');
    assert.equal(offer.retryChoice, 'merge');
    assert.equal(offer.summary[0].savedWords, 1);

    // Verify durable record in storage was preserved untouched
    const stored = readDurableRecord(storage, A);
    assert.equal(stored.record.state, 'unconfirmed');
    assert.equal(stored.record.requestId, originalRequestId, 'RequestId must be preserved for idempotent retry');
    assert.equal(stored.record.choice, 'merge');
  } finally {
    globalThis.localStorage = oldStorage;
  }
});

test('account-only and merge decisions on newly eligible data remain safe and repeat-safe', async () => {
  // Part A: account-only decision
  {
    const storage = createMockStorage();
    const storageOwner = createStorageOwner({ storage: () => storage });
    storageOwner.setOwner(A);

    const guestScope = storageOwner.scope(null);
    guestScope.setTable('zh', 'saved_words', JSON.stringify([
      { id: 'g1', phrase: '苹果', reading: 'píngguǒ', english: 'Apple' },
    ]));

    // Legacy 6-table hash
    const legacyTables = ['saved_words', 'review_cards', 'written_chars', 'learned_radicals', 'learned_kana', 'learned_sounds'];
    const legacySource = [];
    for (const lang of ['zh', 'ja', 'en']) {
      for (const table of legacyTables) {
        legacySource.push([`${lang}_${table}`, guestScope.getTable(lang, table)]);
      }
    }
    const bytes = new TextEncoder().encode(JSON.stringify(legacySource));
    const hashBuf = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    const legacyFingerprint = [...new Uint8Array(hashBuf)].map(b => b.toString(16).padStart(2, '0')).join('');

    // Old completed request
    const oldRecord = createDurableRecord({
      ownerId: A,
      expectedResetVersion: '0',
      sourceFingerprint: legacyFingerprint,
      choice: 'account-only',
      items: [],
    });
    oldRecord.state = 'locally_applied';
    persistDurableRecord(storage, oldRecord);

    // Guest acquires 5 learned_words
    const guestDb = createLocalDatabase({ getScope: () => guestScope, getLanguage: () => 'zh' });
    for (let i = 1; i <= 5; i++) {
      recordWordAction(guestDb, {
        card: { id: `zh-hsk1-00${i}`, character: `词${i}`, pronunciation: `cí${i}`, level: 'HSK1' },
        direction: 'right',
        levelId: 'HSK1',
      });
    }

    let importRpcCalls = [];
    const mockClient = {
      auth: {
        getUser: async () => ({ data: { user: { id: A } }, error: null }),
        getSession: async () => ({ data: { session: { user: { id: A } } }, error: null }),
      },
      rpc: async (fn, params) => {
        if (fn === 's2s_account_snapshot') {
          return {
            data: { schema_version: 1, user_id: A, reset_version: '0', server_time: '2026-01-06T00:00:00.000Z', items: [] },
            error: null,
          };
        }
        if (fn === 's2s_import_guest') {
          importRpcCalls.push(params);
          return {
            data: {
              status: 'committed', persistence: 'cloud', schema_version: 1, user_id: A,
              request_id: params.p_request_id, reset_version: '0', source_fingerprint: params.p_source_fingerprint,
              choice: params.p_choice, accepted_count: 0, added_count: 0, updated_count: 0, replayed: false,
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
      const service = createCloudGuestImportService({
        storageOwner,
        getAuthState: () => ({ user: { id: A }, generation: 1, loading: false, isTransitioning: false, error: null }),
        getClient: () => mockClient,
      });

      const offer = await service.inspect();
      assert.equal(offer.status, 'available');
      assert.equal(offer.summary[0].progressRecords, 5);
      assert.equal(offer.summary[0].savedWords, 0);

      const result = await service.choose(offer, 'account-only');
      assert.equal(result.status, 'saved');
      assert.equal(result.choice, 'account-only');
      assert.equal(result.addedRecords, 0);

      assert.equal(importRpcCalls.length, 1);
      assert.deepEqual(importRpcCalls[0].p_items, []);

      // Guest records remain untouched on device
      const guestWords = JSON.parse(guestScope.getTable('zh', 'learned_words'));
      assert.equal(guestWords.length, 5);

      // Re-inspecting is repeat-safe: returns nothing-to-import
      const postInspect = await service.inspect();
      assert.equal(postInspect.status, 'nothing-to-import');
      assert.deepEqual(postInspect.summary, []);
    } finally {
      globalThis.localStorage = oldStorage;
    }
  }

  // Part B: merge decision
  {
    const storage = createMockStorage();
    const storageOwner = createStorageOwner({ storage: () => storage });
    storageOwner.setOwner(A);

    const guestScope = storageOwner.scope(null);
    guestScope.setTable('zh', 'saved_words', JSON.stringify([
      { id: 'g1', phrase: '苹果', reading: 'píngguǒ', english: 'Apple' },
    ]));

    // Legacy 6-table hash
    const legacyTables = ['saved_words', 'review_cards', 'written_chars', 'learned_radicals', 'learned_kana', 'learned_sounds'];
    const legacySource = [];
    for (const lang of ['zh', 'ja', 'en']) {
      for (const table of legacyTables) {
        legacySource.push([`${lang}_${table}`, guestScope.getTable(lang, table)]);
      }
    }
    const bytes = new TextEncoder().encode(JSON.stringify(legacySource));
    const hashBuf = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    const legacyFingerprint = [...new Uint8Array(hashBuf)].map(b => b.toString(16).padStart(2, '0')).join('');

    // Old completed request
    const oldRecord = createDurableRecord({
      ownerId: A,
      expectedResetVersion: '0',
      sourceFingerprint: legacyFingerprint,
      choice: 'merge',
      items: [{
        language: 'zh', kind: 'saved_words', written_form: '苹果', reading: 'píngguǒ',
        data: { english: 'Apple' }, observed_at: '2026-01-01T00:00:00.000Z',
      }],
    });
    oldRecord.state = 'locally_applied';
    persistDurableRecord(storage, oldRecord);

    // Guest acquires 5 learned_words
    const guestDb = createLocalDatabase({ getScope: () => guestScope, getLanguage: () => 'zh' });
    for (let i = 1; i <= 5; i++) {
      recordWordAction(guestDb, {
        card: { id: `zh-hsk1-00${i}`, character: `词${i}`, pronunciation: `cí${i}`, level: 'HSK1' },
        direction: 'right',
        levelId: 'HSK1',
      });
    }

    let cloudItems = [];
    let importRpcCalls = [];
    const mockClient = {
      auth: {
        getUser: async () => ({ data: { user: { id: A } }, error: null }),
        getSession: async () => ({ data: { session: { user: { id: A } } }, error: null }),
      },
      rpc: async (fn, params) => {
        if (fn === 's2s_account_snapshot') {
          return {
            data: { schema_version: 1, user_id: A, reset_version: '0', server_time: '2026-01-06T00:00:00.000Z', items: cloudItems },
            error: null,
          };
        }
        if (fn === 's2s_import_guest') {
          importRpcCalls.push(params);
          for (const it of params.p_items) {
            cloudItems.push({
              item_key: String(cloudItems.length + 1).padStart(64, '0'),
              revision: '1',
              language: it.language,
              kind: it.kind,
              written_form: it.written_form,
              reading: it.reading,
              data: it.data,
              observed_at: it.observed_at,
              created_at: '2026-01-06T00:00:00.000Z',
              updated_at: '2026-01-06T00:00:00.000Z',
            });
          }
          return {
            data: {
              status: 'committed', persistence: 'cloud', schema_version: 1, user_id: A,
              request_id: params.p_request_id, reset_version: '0', source_fingerprint: params.p_source_fingerprint,
              choice: params.p_choice, accepted_count: params.p_items.length, added_count: params.p_items.length,
              updated_count: 0, replayed: false,
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
      const service = createCloudGuestImportService({
        storageOwner,
        getAuthState: () => ({ user: { id: A }, generation: 1, loading: false, isTransitioning: false, error: null }),
        getClient: () => mockClient,
      });

      const offer = await service.inspect();
      assert.equal(offer.status, 'available');
      assert.equal(offer.summary[0].progressRecords, 5);

      const result = await service.choose(offer, 'merge');
      assert.equal(result.status, 'saved');
      assert.equal(result.choice, 'merge');
      assert.equal(result.addedRecords, 5);

      assert.equal(importRpcCalls.length, 1);
      assert.equal(importRpcCalls[0].p_items.length, 5);
      assert.equal(importRpcCalls[0].p_items[0].kind, 'learned_words');

      // Re-inspecting is repeat-safe: returns nothing-to-import
      const postInspect = await service.inspect();
      assert.equal(postInspect.status, 'nothing-to-import');
      assert.deepEqual(postInspect.summary, []);
    } finally {
      globalThis.localStorage = oldStorage;
    }
  }
});

test('server_acknowledged transitions to applied only after recovery and hydration complete', async () => {
  const storage = createMockStorage();
  const storageOwner = createStorageOwner({ storage: () => storage });
  storageOwner.setOwner(A);

  const ackRecord = createDurableRecord({
    ownerId: A,
    expectedResetVersion: '0',
    sourceFingerprint: 'e'.repeat(64),
    choice: 'merge',
    items: [],
  });
  ackRecord.state = 'server_acknowledged';
  ackRecord.receipt = {
    status: 'committed',
    persistence: 'cloud',
    schema_version: 1,
    user_id: A,
    request_id: ackRecord.requestId,
    reset_version: '0',
    source_fingerprint: 'e'.repeat(64),
    choice: 'merge',
    accepted_count: 0,
    added_count: 0,
    updated_count: 0,
    replayed: false,
  };
  persistDurableRecord(storage, ackRecord);

  let failHydration = true;
  const mockClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: A } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: A } } }, error: null }),
    },
    rpc: async (fn) => {
      if (fn === 's2s_account_snapshot') {
        if (failHydration) {
          return { data: null, error: { message: 'Network failure' } };
        }
        return {
          data: { schema_version: 1, user_id: A, reset_version: '0', server_time: '2026-01-06T00:00:00.000Z', items: [] },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };

  const oldStorage = globalThis.localStorage;
  globalThis.localStorage = storage;

  try {
    const service = createCloudGuestImportService({
      storageOwner,
      getAuthState: () => ({ user: { id: A }, generation: 1, loading: false, isTransitioning: false, error: null }),
      getClient: () => mockClient,
    });

    // Hydration failure halts inspect and keeps record as server_acknowledged
    await assert.rejects(service.inspect(), /Could not confirm the cloud import|Could not load a verified cloud snapshot/);
    const midRecord = readDurableRecord(storage, A);
    assert.equal(midRecord.record.state, 'server_acknowledged', 'Must not mark applied if hydration fails');

    // When hydration succeeds, server_acknowledged transitions to locally_applied
    failHydration = false;
    const offer = await service.inspect();
    const finalRecord = readDurableRecord(storage, A);
    assert.equal(finalRecord.record.state, 'locally_applied');
    assert.equal(offer.status, 'nothing-to-import');
  } finally {
    globalThis.localStorage = oldStorage;
  }
});
