import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readDurableRecord,
  persistDurableRecord,
  createDurableRecord,
  executeDurableImport,
  markDurableApplied,
  getDurableRequestKey,
} from '../src/lib/cloudImportDurableRequest.js';

const A = '11111111-1111-4111-8111-111111111111';
const FINGERPRINT = 'a'.repeat(64);

function createMockStorage() {
  const store = new Map();
  let failWrites = false;
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, val) => {
      if (failWrites) throw new Error('QuotaExceededError: storage full');
      store.set(key, String(val));
    },
    removeItem: (key) => store.delete(key),
    setFailWrites: (fail) => { failWrites = fail; },
    _store: store,
  };
}

function createMockClient({ outcome = 'success' } = {}) {
  let rpcCalls = [];
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: A } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: A } } }, error: null }),
    },
    rpc: async (fn, params) => {
      rpcCalls.push({ fn, params });
      if (outcome === 'network_error') {
        throw new Error('Network timeout');
      }
      if (outcome === 'reset_changed') {
        return { data: null, error: { code: '40001', message: 'RESET_VERSION_CHANGED' } };
      }
      // success
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
          accepted_count: params.p_items.length,
          added_count: params.p_items.length,
          updated_count: 0,
          replayed: false,
        },
        error: null,
      };
    },
    getCalls: () => rpcCalls,
  };
  return client;
}

test('durable record is persisted BEFORE sending and reuses requestId across attempts', async () => {
  const storage = createMockStorage();
  const client = createMockClient({ outcome: 'network_error' });
  const items = [{
    language: 'zh',
    kind: 'saved_words',
    written_form: '你好',
    reading: 'nǐ hǎo',
    data: { english: 'Hello' },
    observed_at: '2026-01-01T00:00:00.000Z',
  }];

  // Attempt 1: Network failure
  const res1 = await executeDurableImport(client, storage, {
    ownerId: A,
    expectedResetVersion: '0',
    sourceFingerprint: FINGERPRINT,
    choice: 'merge',
    items,
    isCurrent: () => true,
  });

  assert.equal(res1.outcome, 'unconfirmed');
  assert.equal(client.getCalls().length, 1);
  const firstRequestId = client.getCalls()[0].params.p_request_id;
  assert.ok(firstRequestId);

  // Check that durable record is in storage with state 'unconfirmed'
  const stored1 = readDurableRecord(storage, A);
  assert.equal(stored1.record.state, 'unconfirmed');
  assert.equal(stored1.record.requestId, firstRequestId);

  // Attempt 2: Re-executing reuses the EXACT same requestId
  const client2 = createMockClient({ outcome: 'success' });
  const res2 = await executeDurableImport(client2, storage, {
    ownerId: A,
    expectedResetVersion: '0',
    sourceFingerprint: FINGERPRINT,
    choice: 'merge',
    items,
    isCurrent: () => true,
  });

  assert.equal(res2.outcome, 'server_acknowledged');
  assert.equal(client2.getCalls().length, 1);
  const secondRequestId = client2.getCalls()[0].params.p_request_id;
  assert.equal(secondRequestId, firstRequestId, 'Must reuse identical requestId');

  // Verify state transitioned to server_acknowledged
  const stored2 = readDurableRecord(storage, A);
  assert.equal(stored2.record.state, 'server_acknowledged');
  assert.ok(stored2.record.receipt);

  // Mark locally applied
  markDurableApplied(storage, A);
  const stored3 = readDurableRecord(storage, A);
  assert.equal(stored3.record.state, 'locally_applied');
});

test('storage failure before sending halts execution without calling network', async () => {
  const storage = createMockStorage();
  storage.setFailWrites(true); // storage quota blocked
  const client = createMockClient({ outcome: 'success' });
  const items = [];

  const res = await executeDurableImport(client, storage, {
    ownerId: A,
    expectedResetVersion: '0',
    sourceFingerprint: FINGERPRINT,
    choice: 'account-only',
    items,
    isCurrent: () => true,
  });

  assert.equal(res.outcome, 'storage_error');
  assert.equal(client.getCalls().length, 0, 'Must NOT call network if initial persistence failed');
});

test('reset version mismatch stops old replay and does not auto-regenerate', async () => {
  const storage = createMockStorage();
  // Pre-seed an unconfirmed request with expectedResetVersion: '0'
  const record = createDurableRecord({
    ownerId: A,
    expectedResetVersion: '0',
    sourceFingerprint: FINGERPRINT,
    choice: 'account-only',
    items: [],
  });
  record.state = 'unconfirmed';
  persistDurableRecord(storage, record);

  const client = createMockClient();

  // Try to execute when server/account has reset to version '1'
  const res = await executeDurableImport(client, storage, {
    ownerId: A,
    expectedResetVersion: '1', // changed!
    sourceFingerprint: FINGERPRINT,
    choice: 'account-only',
    items: [],
    isCurrent: () => true,
  });

  assert.equal(res.outcome, 'reset_version_mismatch');
  assert.equal(res.code, 'RESET_VERSION_CHANGED');
  assert.equal(client.getCalls().length, 0, 'Must not replay request when reset version changed');

  // Stored state is marked rejected
  const stored = readDurableRecord(storage, A);
  assert.equal(stored.record.state, 'server_rejected');
});

test('corrupted storage returns recoverable error without clearing original bytes', () => {
  const storage = createMockStorage();
  const key = getDurableRequestKey(A);
  storage._store.set(key, '{ invalid json: true');

  const res = readDurableRecord(storage, A);
  assert.equal(res.record, null);
  assert.equal(res.code, 'CORRUPTED_STORAGE');
  assert.equal(res.raw, '{ invalid json: true', 'Must retain corrupted bytes intact');
  assert.equal(storage.getItem(key), '{ invalid json: true', 'Must not clear corrupted key');
});

test('account switch or generation mismatch halts import at async boundaries', async () => {
  const storage = createMockStorage();
  const client = createMockClient();
  let currentGen = 1;

  await assert.rejects(async () => {
    await executeDurableImport(client, storage, {
      ownerId: A,
      expectedResetVersion: '0',
      sourceFingerprint: FINGERPRINT,
      choice: 'account-only',
      items: [],
      isCurrent: () => currentGen === 2, // mismatch!
    });
  }, { message: /Your account changed/ });
});
