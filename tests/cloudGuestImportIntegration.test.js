import test from 'node:test';
import assert from 'node:assert/strict';
import { isCloudImportStagingEnabled } from '../src/lib/cloudImportGate.js';
import { getActiveGuestImportService } from '../src/lib/guestImport.js';
import { createCloudGuestImportService } from '../src/lib/cloudGuestImportService.js';
import { createStorageOwner } from '../src/lib/storageOwner.js';
import { readDurableRecord } from '../src/lib/cloudImportDurableRequest.js';

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
