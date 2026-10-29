import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';

import { createStorageOwner } from '../src/lib/storageOwner.js';
import {
  createDurableRecord,
  persistDurableRecord,
  readDurableRecord,
  executeDurableImport,
} from '../src/lib/cloudImportDurableRequest.js';
import { createCloudGuestImportService } from '../src/lib/cloudGuestImportService.js';
import { createGuestImportController } from '../src/lib/guestImportController.js';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false, host: '127.0.0.1', watch: null },
});

after(async () => {
  await server.close();
});

const { default: GuestImportDialog } = await server.ssrLoadModule('/src/components/GuestImportDialog.jsx');

const OWNER_A = '11111111-1111-4111-8111-111111111111';
const OWNER_B = '22222222-2222-4222-8222-222222222222';
const FINGERPRINT = 'a'.repeat(64);

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

function createMockClient({ outcome = 'success', onRpc } = {}) {
  let rpcCalls = [];
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: OWNER_A } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: OWNER_A } } }, error: null }),
    },
    rpc: async (fn, params) => {
      rpcCalls.push({ fn, params });
      if (onRpc) onRpc(fn, params);

      if (fn === 's2s_account_snapshot') {
        return {
          data: {
            schema_version: 1,
            user_id: params?.p_expected_user_id || OWNER_A,
            reset_version: '1',
            server_time: new Date().toISOString(),
            items: [],
          },
          error: null,
        };
      }

      if (fn === 's2s_import_guest') {
        if (outcome === 'network_error') {
          throw new Error('Network timeout');
        }
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
      }

      return { data: null, error: null };
    },
    getCalls: () => rpcCalls,
  };
}

// ---------------------------------------------------------------------------
// Defect A, B, C Specific Tests
// ---------------------------------------------------------------------------

test('Defect A: executeDurableImport and service reject choice mismatch before import RPC', async () => {
  const storage = createMemoryStorage();
  const unconfirmedMerge = createDurableRecord({
    ownerId: OWNER_A,
    expectedResetVersion: '1',
    sourceFingerprint: FINGERPRINT,
    choice: 'merge',
    items: [{
      language: 'zh',
      kind: 'saved_words',
      written_form: '中',
      reading: 'zhōng',
      data: { english: 'middle' },
      observed_at: '2026-01-01T00:00:00.000Z',
    }],
  });
  unconfirmedMerge.state = 'unconfirmed';
  persistDurableRecord(storage, unconfirmedMerge);

  let rpcCalled = false;
  const mockClient = createMockClient({
    onRpc: (fn) => {
      if (fn === 's2s_import_guest') rpcCalled = true;
    },
  });

  // Direct durable executor check
  const result = await executeDurableImport(mockClient, storage, {
    ownerId: OWNER_A,
    expectedResetVersion: '1',
    sourceFingerprint: FINGERPRINT,
    choice: 'account-only', // Opposite choice!
    items: [],
    isCurrent: () => true,
  });

  assert.equal(rpcCalled, false, 's2s_import_guest RPC must NOT be called on choice mismatch');
  assert.equal(result.outcome, 'choice_mismatch');
  assert.equal(result.code, 'CHOICE_MISMATCH');
});

test('Defect B: unconfirmed account-only request with 0 items returns available retry offer', async () => {
  const storage = createMemoryStorage();
  const unconfirmedAccountOnly = createDurableRecord({
    ownerId: OWNER_A,
    expectedResetVersion: '1',
    sourceFingerprint: FINGERPRINT,
    choice: 'account-only',
    items: [],
  });
  unconfirmedAccountOnly.state = 'unconfirmed';
  persistDurableRecord(storage, unconfirmedAccountOnly);

  const originalLocalStorage = globalThis.localStorage;
  globalThis.localStorage = storage;

  try {
    const storageOwner = createStorageOwner({ storage: () => storage });
    storageOwner.setOwner(OWNER_A);
    const mockClient = createMockClient();

    const service = createCloudGuestImportService({
      storageOwner,
      getAuthState: () => ({ user: { id: OWNER_A }, generation: 1 }),
      getClient: () => mockClient,
    });

    const offer = await service.inspect();
    assert.equal(offer.status, 'available', 'Unconfirmed account-only request must offer status "available"');
    assert.equal(offer.isRetry, true, 'Offer must be marked as isRetry');
    assert.equal(offer.retryChoice, 'account-only', 'Offer must expose retryChoice as "account-only"');
    assert.deepEqual(offer.summary, [], 'Zero items must produce empty summary without inventing counts');
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
});

test('Defect C: corrupted JSON under durable-request key is surfaced without preparing fresh decision', async () => {
  const storage = createMemoryStorage({
    [`s2s_user_${OWNER_A}_cloud_import_request_v1`]: '{ corrupted json :::',
  });

  const originalLocalStorage = globalThis.localStorage;
  globalThis.localStorage = storage;

  try {
    const storageOwner = createStorageOwner({ storage: () => storage });
    storageOwner.setOwner(OWNER_A);
    let rpcCalled = false;
    const mockClient = createMockClient({
      onRpc: (fn) => {
        if (fn === 's2s_import_guest') rpcCalled = true;
      },
    });

    const service = createCloudGuestImportService({
      storageOwner,
      getAuthState: () => ({ user: { id: OWNER_A }, generation: 1 }),
      getClient: () => mockClient,
    });

    await assert.rejects(
      async () => service.inspect(),
      (err) => {
        assert.equal(err.code, 'CORRUPTED_STORAGE');
        assert.ok(err.message.includes('Stored cloud import request is corrupted'));
        return true;
      }
    );

    // Verify original corrupted bytes are preserved
    assert.equal(storage.getItem(`s2s_user_${OWNER_A}_cloud_import_request_v1`), '{ corrupted json :::');
    assert.equal(rpcCalled, false, 'No import RPC should be called');
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
});

// ---------------------------------------------------------------------------
// Additional Required Coverage
// ---------------------------------------------------------------------------

test('Opposite choices rejected in both directions with zero import RPCs', async () => {
  const originalLocalStorage = globalThis.localStorage;

  try {
    // 1. Unconfirmed merge -> choosing account-only must be rejected
    {
      const storage = createMemoryStorage();
      const rec = createDurableRecord({
        ownerId: OWNER_A,
        expectedResetVersion: '1',
        sourceFingerprint: FINGERPRINT,
        choice: 'merge',
        items: [{
          language: 'zh',
          kind: 'saved_words',
          written_form: '中',
          reading: 'zhōng',
          data: { english: 'middle' },
          observed_at: '2026-01-01T00:00:00.000Z',
        }],
      });
      rec.state = 'unconfirmed';
      persistDurableRecord(storage, rec);
      globalThis.localStorage = storage;

      let rpcImportCalled = false;
      const mockClient = createMockClient({
        onRpc: (fn) => {
          if (fn === 's2s_import_guest') rpcImportCalled = true;
        },
      });

      const storageOwner = createStorageOwner({ storage: () => storage });
      storageOwner.setOwner(OWNER_A);
      const service = createCloudGuestImportService({
        storageOwner,
        getAuthState: () => ({ user: { id: OWNER_A }, generation: 1 }),
        getClient: () => mockClient,
      });

      const offer = await service.inspect();
      assert.equal(offer.isRetry, true);
      assert.equal(offer.retryChoice, 'merge');

      await assert.rejects(
        async () => service.choose(offer, 'account-only'),
        /Cannot change choice on an unresolved request/
      );
      assert.equal(rpcImportCalled, false, 'Zero import RPCs when rejecting account-only choice on merge request');
    }

    // 2. Unconfirmed account-only -> choosing merge must be rejected
    {
      const storage = createMemoryStorage();
      const rec = createDurableRecord({
        ownerId: OWNER_A,
        expectedResetVersion: '1',
        sourceFingerprint: FINGERPRINT,
        choice: 'account-only',
        items: [],
      });
      rec.state = 'unconfirmed';
      persistDurableRecord(storage, rec);
      globalThis.localStorage = storage;

      let rpcImportCalled = false;
      const mockClient = createMockClient({
        onRpc: (fn) => {
          if (fn === 's2s_import_guest') rpcImportCalled = true;
        },
      });

      const storageOwner = createStorageOwner({ storage: () => storage });
      storageOwner.setOwner(OWNER_A);
      const service = createCloudGuestImportService({
        storageOwner,
        getAuthState: () => ({ user: { id: OWNER_A }, generation: 1 }),
        getClient: () => mockClient,
      });

      const offer = await service.inspect();
      assert.equal(offer.isRetry, true);
      assert.equal(offer.retryChoice, 'account-only');

      await assert.rejects(
        async () => service.choose(offer, 'merge'),
        /Cannot change choice on an unresolved request/
      );
      assert.equal(rpcImportCalled, false, 'Zero import RPCs when rejecting merge choice on account-only request');
    }
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
});

test('Direct durable-executor mismatch rejection: choice and fingerprint', async () => {
  const storage = createMemoryStorage();
  const rec = createDurableRecord({
    ownerId: OWNER_A,
    expectedResetVersion: '1',
    sourceFingerprint: FINGERPRINT,
    choice: 'account-only',
    items: [],
  });
  rec.state = 'unconfirmed';
  persistDurableRecord(storage, rec);

  let rpcCalled = false;
  const mockClient = createMockClient({
    onRpc: (fn) => {
      if (fn === 's2s_import_guest') rpcCalled = true;
    },
  });

  // Choice mismatch
  const res1 = await executeDurableImport(mockClient, storage, {
    ownerId: OWNER_A,
    expectedResetVersion: '1',
    sourceFingerprint: FINGERPRINT,
    choice: 'merge',
    items: [],
    isCurrent: () => true,
  });
  assert.equal(res1.outcome, 'choice_mismatch');
  assert.equal(res1.code, 'CHOICE_MISMATCH');
  assert.equal(rpcCalled, false);

  // Fingerprint mismatch
  const res2 = await executeDurableImport(mockClient, storage, {
    ownerId: OWNER_A,
    expectedResetVersion: '1',
    sourceFingerprint: 'b'.repeat(64),
    choice: 'account-only',
    items: [],
    isCurrent: () => true,
  });
  assert.equal(res2.outcome, 'fingerprint_mismatch');
  assert.equal(res2.code, 'FINGERPRINT_MISMATCH');
  assert.equal(rpcCalled, false);
});

test('Successful retry preserves UUID and full payload', async () => {
  const storage = createMemoryStorage();
  const customUuid = '33333333-3333-4333-8333-333333333333';
  const customItems = [{
    language: 'zh',
    kind: 'saved_words',
    written_form: '你好',
    reading: 'nǐ hǎo',
    data: { english: 'hello' },
    observed_at: '2026-01-01T00:00:00.000Z',
  }];

  const rec = createDurableRecord({
    ownerId: OWNER_A,
    expectedResetVersion: '1',
    sourceFingerprint: FINGERPRINT,
    choice: 'merge',
    items: customItems,
    requestId: customUuid,
  });
  rec.state = 'unconfirmed';
  persistDurableRecord(storage, rec);

  let capturedRpc = null;
  const mockClient = createMockClient({
    onRpc: (fn, params) => {
      if (fn === 's2s_import_guest') capturedRpc = params;
    },
  });

  const res = await executeDurableImport(mockClient, storage, {
    ownerId: OWNER_A,
    expectedResetVersion: '1',
    sourceFingerprint: FINGERPRINT,
    choice: 'merge',
    items: customItems,
    isCurrent: () => true,
  });

  assert.equal(res.outcome, 'server_acknowledged');
  assert.ok(capturedRpc, 's2s_import_guest RPC must be executed');
  assert.equal(capturedRpc.p_request_id, customUuid, 'Must reuse identical UUID from unconfirmed record');
  assert.deepEqual(capturedRpc.p_items, customItems, 'Must preserve full items payload');

  const stored = readDurableRecord(storage, OWNER_A);
  assert.equal(stored.record.state, 'server_acknowledged');
  assert.equal(stored.record.requestId, customUuid);
});

test('Zero-item account-only retry reaches controller and completes explicitly', async () => {
  const storage = createMemoryStorage();
  const rec = createDurableRecord({
    ownerId: OWNER_A,
    expectedResetVersion: '1',
    sourceFingerprint: FINGERPRINT,
    choice: 'account-only',
    items: [],
  });
  rec.state = 'unconfirmed';
  persistDurableRecord(storage, rec);

  const originalLocalStorage = globalThis.localStorage;
  globalThis.localStorage = storage;

  try {
    const storageOwner = createStorageOwner({ storage: () => storage });
    storageOwner.setOwner(OWNER_A);
    let importCalled = false;
    const mockClient = createMockClient({
      onRpc: (fn) => {
        if (fn === 's2s_import_guest') importCalled = true;
      },
    });

    const service = createCloudGuestImportService({
      storageOwner,
      getAuthState: () => ({ user: { id: OWNER_A }, generation: 1 }),
      getClient: () => mockClient,
    });

    const controller = createGuestImportController(service, { allowCloud: true });
    controller.setAccount({ id: OWNER_A, generation: 1 });

    await controller.inspect();
    const inspectState = controller.getState();

    assert.equal(inspectState.open, true, 'Dialog must open for unconfirmed account-only retry');
    assert.equal(inspectState.offer.isRetry, true);
    assert.equal(inspectState.offer.retryChoice, 'account-only');
    assert.deepEqual(inspectState.offer.summary, []);

    // Perform explicit retry
    await controller.choose('account-only');

    const completedState = controller.getState();
    assert.equal(completedState.open, false, 'Dialog must close after explicit retry');
    assert.equal(completedState.pending, false);
    assert.equal(completedState.notice.kind, 'success');
    assert.ok(completedState.notice.message.includes('Using account data in the cloud'));
    assert.equal(importCalled, true, 'Import RPC was successfully sent for account-only retry');

    const stored = readDurableRecord(storage, OWNER_A);
    assert.equal(stored.record.state, 'locally_applied');
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
});

test('Corrupt bytes preserved and storage-read failures surfaced', async () => {
  const corruptedContent = '{"invalidJson":::badData';
  const storage = createMemoryStorage({
    [`s2s_user_${OWNER_A}_cloud_import_request_v1`]: corruptedContent,
  });

  const originalLocalStorage = globalThis.localStorage;
  globalThis.localStorage = storage;

  try {
    const storageOwner = createStorageOwner({ storage: () => storage });
    storageOwner.setOwner(OWNER_A);
    const mockClient = createMockClient();

    const service = createCloudGuestImportService({
      storageOwner,
      getAuthState: () => ({ user: { id: OWNER_A }, generation: 1 }),
      getClient: () => mockClient,
    });

    const controller = createGuestImportController(service, { allowCloud: true });
    controller.setAccount({ id: OWNER_A, generation: 1 });

    await controller.inspect();
    const state = controller.getState();

    assert.equal(state.open, false, 'Dialog must not open on corrupted storage error');
    assert.equal(state.notice.kind, 'error');
    assert.ok(state.notice.message.includes('Stored cloud import request is corrupted'));

    // Check storage bytes remained unmolested
    assert.equal(storage.getItem(`s2s_user_${OWNER_A}_cloud_import_request_v1`), corruptedContent);
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
});

test('Retry UI disables the opposite choice and pending dismissal', () => {
  // 1. Retry merge: merge button enabled, account-only button disabled, Decide later enabled
  {
    const html = renderToString(React.createElement(GuestImportDialog, {
      open: true,
      summary: [{ languageId: 'zh', languageLabel: 'Chinese', savedWords: 5, reviewWords: 0, progressRecords: 0 }],
      pending: false,
      isRetry: true,
      retryChoice: 'merge',
    }));

    assert.ok(html.includes('Resume guest learning import'));
    assert.ok(html.includes('Retry merging guest data'));
    // Merge button is not disabled
    assert.ok(!html.includes('guest-import-dialog__btn--merge" disabled=""'));
    // Account-only button is disabled
    assert.ok(html.includes('guest-import-dialog__btn--account-only" disabled=""'));
    // Decide later is enabled
    assert.ok(!html.includes('guest-import-dialog__btn--later" disabled=""'));
    // Close button is enabled
    assert.ok(!html.includes('guest-import-dialog__close-btn" aria-label="Close dialog" disabled=""'));
  }

  // 2. Retry account-only: merge button disabled, account-only enabled, empty summary honest
  {
    const html = renderToString(React.createElement(GuestImportDialog, {
      open: true,
      summary: [],
      pending: false,
      isRetry: true,
      retryChoice: 'account-only',
    }));

    assert.ok(html.includes('Resume guest learning import'));
    assert.ok(html.includes('Retry using account data only'));
    // Merge button is disabled
    assert.ok(html.includes('guest-import-dialog__btn--merge" disabled=""'));
    // Account-only button is not disabled
    assert.ok(!html.includes('guest-import-dialog__btn--account-only" disabled=""'));
    // Empty summary does not invent counts
    assert.ok(html.includes('No records to merge (keeping account data separate).'));
  }

  // 3. Pending state: all buttons and dismissal disabled
  {
    const html = renderToString(React.createElement(GuestImportDialog, {
      open: true,
      summary: [],
      pending: true,
      isRetry: true,
      retryChoice: 'merge',
    }));

    assert.ok(html.includes('guest-import-dialog__btn--merge" disabled=""'));
    assert.ok(html.includes('guest-import-dialog__btn--account-only" disabled=""'));
    assert.ok(html.includes('guest-import-dialog__btn--later" disabled=""'));
    assert.ok(html.includes('guest-import-dialog__close-btn" aria-label="Close dialog" disabled=""'));
    assert.ok(html.includes('Please wait…'));
  }
});

test('Account switch cannot submit previous owner request', async () => {
  const storage = createMemoryStorage();
  const recA = createDurableRecord({
    ownerId: OWNER_A,
    expectedResetVersion: '1',
    sourceFingerprint: FINGERPRINT,
    choice: 'merge',
    items: [],
  });
  recA.state = 'unconfirmed';
  persistDurableRecord(storage, recA);

  const originalLocalStorage = globalThis.localStorage;
  globalThis.localStorage = storage;

  try {
    const storageOwner = createStorageOwner({ storage: () => storage });
    storageOwner.setOwner(OWNER_B); // Logged in as User B!

    const mockClient = createMockClient();
    mockClient.auth.getUser = async () => ({ data: { user: { id: OWNER_B } }, error: null });
    mockClient.auth.getSession = async () => ({ data: { session: { user: { id: OWNER_B } } }, error: null });

    const service = createCloudGuestImportService({
      storageOwner,
      getAuthState: () => ({ user: { id: OWNER_B }, generation: 1 }),
      getClient: () => mockClient,
    });

    const controller = createGuestImportController(service, { allowCloud: true });
    controller.setAccount({ id: OWNER_B, generation: 1 });

    await controller.inspect();
    const state = controller.getState();

    // User B should NOT get User A's unconfirmed offer
    assert.equal(state.open, false);
    assert.equal(state.offer, null);

    // If someone maliciously attempted to call choose with an offer bound to OWNER_A
    const fakeOfferA = Object.freeze({
      status: 'available',
      persistence: 'cloud',
      ownerId: OWNER_A,
      expectedResetVersion: '1',
      summary: Object.freeze([]),
    });

    await assert.rejects(
      async () => service.choose(fakeOfferA, 'merge'),
      /Reload the guest import offer before choosing|Sign in and finish account verification/
    );

    // Direct durable executor check: User B executing with User A's stored record key is isolated
    const readB = readDurableRecord(storage, OWNER_B);
    assert.equal(readB.record, null, 'User B has no durable record');
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
});
