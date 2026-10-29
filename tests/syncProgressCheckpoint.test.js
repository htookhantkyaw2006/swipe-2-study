import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createStorageOwner } from '../src/lib/storageOwner.js';
import { createOnlineSyncService } from '../src/lib/onlineSyncService.js';
import { reconcileSnapshotWithLocal } from '../src/lib/cloudSnapshotHydration.js';
import { getPendingSyncRequestKey } from '../src/lib/onlineSyncRequest.js';

class MockStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.get(key) ?? null;
  }
  setItem(key, val) {
    this.store.set(key, String(val));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

// ===========================================================================
// SECTION 1: Client Unit Regressions (Findings 1, 2, 4)
// ===========================================================================

test('Finding 1A: Two edits sharing the same timestamp preserve newer local edit as dirty', async () => {
  const storage = new MockStorage();
  const owner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  const userId = '11111111-1111-4111-8111-111111111111';
  owner.setOwner(userId);
  const scope = owner.scope(userId);

  // Initial local state: row has note 'first'
  const sameTimestamp = '2026-10-29T12:00:00.000Z';
  scope.setTable('zh', 'saved_words', JSON.stringify([
    { id: 'w1', phrase: '你好', reading: 'nǐ hǎo', english: 'Hello', note: 'first', updated_at: sameTimestamp },
  ]));

  let rpcCallCount = 0;

  const mockClient = {
    rpc: async (fn, params) => {
      rpcCallCount++;
      assert.equal(fn, 's2s_apply_mutations');

      // While request is in-flight: user edits the note to 'second' with identical timestamp!
      scope.setTable('zh', 'saved_words', JSON.stringify([
        { id: 'w1', phrase: '你好', reading: 'nǐ hǎo', english: 'Hello', note: 'second', updated_at: sameTimestamp },
      ]));

      return {
        data: {
          status: 'committed',
          user_id: params.p_expected_user_id,
          request_id: params.p_request_id,
          reset_version: String(params.p_expected_reset_version),
          acknowledged: [
            {
              client_id: params.p_mutations[0].client_id,
              item_key: 'item-key-1',
              status: 'applied',
              revision: '1',
            },
          ],
        },
        error: null,
      };
    },
  };

  const syncService = createOnlineSyncService({
    storageOwner: owner,
    getClient: () => mockClient,
  });

  const res = await syncService.performSync({ accountId: userId });
  assert.equal(rpcCallCount, 1);
  assert.equal(res.status, 'local', 'Item remains pending (dirty) because a newer local edit occurred');

  // Verify the doc record is still dirty
  const doc = scope.readLearningDocument();
  const rec = doc.value.cloudSync.records['zh:saved_words:你好:nǐ hǎo'];
  assert.equal(rec.status, 'dirty', 'Newer edit was NOT marked synced');
  assert.equal(rec.cloudRevision, '1', 'Cloud revision was updated so next pass uses revision 1');
});

test('Finding 1B: Deleting a row while upsert is pending preserves tombstone as deleted', async () => {
  const storage = new MockStorage();
  const owner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  const userId = '11111111-1111-4111-8111-111111111111';
  owner.setOwner(userId);
  const scope = owner.scope(userId);

  scope.setTable('zh', 'saved_words', JSON.stringify([
    { id: 'w1', phrase: '谢谢', reading: 'xiè xie', english: 'Thanks' },
  ]));

  const mockClient = {
    rpc: async (fn, params) => {
      // While upsert is in flight: user deletes the row locally!
      scope.setTable('zh', 'saved_words', JSON.stringify([]));

      return {
        data: {
          status: 'committed',
          user_id: params.p_expected_user_id,
          request_id: params.p_request_id,
          reset_version: String(params.p_expected_reset_version),
          acknowledged: [
            {
              client_id: params.p_mutations[0].client_id,
              item_key: 'item-key-thanks',
              status: 'applied',
              revision: '1',
            },
          ],
        },
        error: null,
      };
    },
  };

  const syncService = createOnlineSyncService({
    storageOwner: owner,
    getClient: () => mockClient,
  });

  await syncService.performSync({ accountId: userId });

  const doc = scope.readLearningDocument();
  const rec = doc.value.cloudSync.records['zh:saved_words:谢谢:xiè xie'];
  assert.equal(rec.status, 'deleted', 'Tombstone must NOT be overwritten into dirty by old upsert ACK');
  assert.equal(rec.cloudRevision, '1', 'Updated base revision to 1 for the upcoming delete');
});

test('Finding 2A: Corrupted persisted request JSON fails closed and preserves recovery bytes', async () => {
  const storage = new MockStorage();
  const owner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  const userId = '11111111-1111-4111-8111-111111111111';
  owner.setOwner(userId);

  // Plant corrupt JSON in storage
  const reqKey = getPendingSyncRequestKey(userId);
  const corruptPayload = '{broken-json-not-valid';
  storage.setItem(reqKey, corruptPayload);

  let networkCalled = false;
  const mockClient = {
    rpc: async () => {
      networkCalled = true;
      return { data: null, error: null };
    },
  };

  const syncService = createOnlineSyncService({
    storageOwner: owner,
    getClient: () => mockClient,
  });

  const res = await syncService.performSync({ accountId: userId });
  assert.equal(res.status, 'failed');
  assert.match(res.error, /Corrupt pending sync request/);
  assert.equal(networkCalled, false, 'No network call dispatched on corrupt request');
  assert.equal(storage.getItem(reqKey), corruptPayload, 'Corrupt bytes preserved for recovery');
});

test('Finding 2B: Response with mismatched reset_version is rejected', async () => {
  const storage = new MockStorage();
  const owner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  const userId = '11111111-1111-4111-8111-111111111111';
  owner.setOwner(userId);
  const scope = owner.scope(userId);

  scope.setTable('zh', 'saved_words', JSON.stringify([
    { id: 'w1', phrase: '再见', reading: 'zài jiàn' },
  ]));

  const mockClient = {
    rpc: async (fn, params) => {
      return {
        data: {
          status: 'committed',
          user_id: params.p_expected_user_id,
          request_id: params.p_request_id,
          reset_version: '99', // Mismatched generation!
          acknowledged: [
            {
              client_id: params.p_mutations[0].client_id,
              item_key: 'item-key-bye',
              status: 'applied',
              revision: '1',
            },
          ],
        },
        error: null,
      };
    },
  };

  const syncService = createOnlineSyncService({
    storageOwner: owner,
    getClient: () => mockClient,
  });

  const res = await syncService.performSync({ accountId: userId });
  assert.equal(res.status, 'failed');
  assert.match(res.error, /Invalid response from sync server/);

  // Local reset_version must NOT be advanced
  const doc = scope.readLearningDocument();
  assert.equal(doc.value.cloudSync.resetVersion, '0');
});

test('Finding 2C: Failed snapshot restoration on reset does NOT report success or write fabricated 1', async () => {
  const storage = new MockStorage();
  const owner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  const userId = '11111111-1111-4111-8111-111111111111';
  owner.setOwner(userId);
  const scope = owner.scope(userId);

  scope.setTable('zh', 'saved_words', JSON.stringify([
    { id: 'w1', phrase: '苹果', reading: 'píng guǒ' },
  ]));

  const mockClient = {
    rpc: async (fn) => {
      if (fn === 's2s_apply_mutations') {
        return { data: null, error: { message: 'RESET_VERSION_CHANGED' } };
      }
      if (fn === 's2s_account_snapshot') {
        // Hydration snapshot fails / throws
        return { data: null, error: { message: 'Snapshot unavailable' } };
      }
      return { data: null, error: null };
    },
  };

  const syncService = createOnlineSyncService({
    storageOwner: owner,
    getClient: () => mockClient,
  });

  const res = await syncService.performSync({ accountId: userId });
  assert.equal(res.status, 'failed');
  assert.match(res.error, /Reset reload failed/);

  // Verify local tables were not wiped and fabricated resetVersion '1' was not committed
  const doc = scope.readLearningDocument();
  assert.equal(doc.value.cloudSync.resetVersion, '0');
  assert.ok(doc.value.tables.zh_saved_words.includes('苹果'));
});

test('Finding 4: Remotely deleted row with server tombstone is removed locally and does not become dirty', () => {
  // Local state: was previously synced, has cloudItemKey
  const itemKey = 'zh:saved_words:你好:nǐ hǎo';
  const shaKey = 'a'.repeat(64);

  const localTables = {
    zh_saved_words: JSON.stringify([
      { id: 'w1', phrase: '你好', reading: 'nǐ hǎo', english: 'Hello' },
    ]),
  };

  const syncState = {
    schemaVersion: 1,
    ownerId: '11111111-1111-4111-8111-111111111111',
    resetVersion: '0',
    records: {
      [itemKey]: {
        status: 'synced',
        cloudRevision: '1',
        cloudItemKey: shaKey,
      },
    },
  };

  // Server snapshot: item is deleted, tombstone has item_key (no written_form)
  const snapshot = {
    schema_version: 1,
    user_id: '11111111-1111-4111-8111-111111111111',
    reset_version: '0',
    server_time: '2026-10-29T12:00:00Z',
    items: [],
    tombstones: [
      {
        item_key: shaKey,
        language: 'zh',
        kind: 'saved_words',
        deleted_at: '2026-10-29T11:59:00Z',
        revision: '2',
      },
    ],
  };

  const result = reconcileSnapshotWithLocal({
    localTables,
    snapshot,
    syncState,
  });

  const rows = JSON.parse(result.reconciledTables.zh_saved_words);
  assert.equal(rows.length, 0, 'Remotely deleted row must be removed from local table');
  assert.equal(result.nextSyncState.records[itemKey].status, 'deleted');
  assert.notEqual(result.nextSyncState.records[itemKey].status, 'dirty');
});

test('Finding 4: Genuinely pending local dirty row is preserved despite server tombstone', () => {
  const itemKey = 'zh:saved_words:你好:nǐ hǎo';
  const shaKey = 'b'.repeat(64);

  const localTables = {
    zh_saved_words: JSON.stringify([
      { id: 'w1', phrase: '你好', reading: 'nǐ hǎo', english: 'Hello (edited offline)' },
    ]),
  };

  const syncState = {
    schemaVersion: 1,
    ownerId: '11111111-1111-4111-8111-111111111111',
    resetVersion: '0',
    records: {
      [itemKey]: {
        status: 'dirty', // Pending edit!
        cloudRevision: '1',
        cloudItemKey: shaKey,
      },
    },
  };

  const snapshot = {
    schema_version: 1,
    user_id: '11111111-1111-4111-8111-111111111111',
    reset_version: '0',
    server_time: '2026-10-29T12:00:00Z',
    items: [],
    tombstones: [
      {
        item_key: shaKey,
        language: 'zh',
        kind: 'saved_words',
        deleted_at: '2026-10-29T11:59:00Z',
        revision: '2',
      },
    ],
  };

  const result = reconcileSnapshotWithLocal({
    localTables,
    snapshot,
    syncState,
  });

  const rows = JSON.parse(result.reconciledTables.zh_saved_words);
  assert.equal(rows.length, 1, 'Genuinely pending dirty row must be preserved');
  assert.equal(result.nextSyncState.records[itemKey].status, 'dirty');
});

// ===========================================================================
// SECTION 2: Database Server Regressions (Findings 3 & 5)
// ===========================================================================

const db = new PGlite();
const USER_A = '11111111-1111-4111-8111-111111111111';

async function as(role, userId, run) {
  await db.exec(`begin; set local role ${role};`);
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [userId ?? '']);
    const result = await run();
    await db.exec('commit;');
    return result;
  } catch (err) {
    await db.exec('rollback;');
    throw err;
  }
}

const callMutations = async (mutations, {
  expectedUserId = USER_A,
  requestId = randomUUID(),
  version = '0',
  atomic = false,
} = {}) => {
  const res = await db.query(
    'select public.s2s_apply_mutations($1::uuid, $2::uuid, $3::bigint, $4::jsonb, $5::boolean) as result',
    [expectedUserId, requestId, version, JSON.stringify(mutations), atomic],
  );
  return res.rows[0].result;
};

const callGetStreak = async (expectedUserId = USER_A) => {
  const res = await db.query(
    'select public.s2s_get_study_streak($1::uuid) as result',
    [expectedUserId],
  );
  return res.rows[0].result;
};

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated;
    create function storage.foldername(name text) returns text[] language sql immutable as
      $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
  `);

  await db.exec(await readFile(new URL('../supabase/migrations/20261027000100_backend_foundation.sql', import.meta.url), 'utf8'));
  await db.query('insert into auth.users(id) values ($1)', [USER_A]);
  await db.exec(await readFile(new URL('../supabase/migrations/20261028000100_guest_import_foundation.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261029000100_account_deletion_foundation.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261029000200_account_deletion_attempt_reservation.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261029000300_online_sync_foundation.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261029000400_learned_words_sync.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261029000500_study_streaks_yangon.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261029000600_sync_progress_hardening.sql', import.meta.url), 'utf8'));
});

after(async () => {
  await db.close();
});

test('Finding 3: CAS rejects missing base_revision and fabricated future revision 999 on existing record', async () => {
  await as('authenticated', USER_A, async () => {
    // 1. Create record at revision 1
    const createRes = await callMutations([
      {
        op: 'upsert',
        language: 'zh',
        kind: 'saved_words',
        written_form: '电脑',
        reading: 'diàn nǎo',
        data: { english: 'Computer' },
      },
    ]);
    assert.equal(createRes.status, 'committed');
    assert.equal(createRes.acknowledged[0].status, 'applied');
    assert.equal(createRes.acknowledged[0].revision, '1');

    // 2. Attempt update with OMITTED base_revision -> conflict!
    const omitRes = await callMutations([
      {
        op: 'upsert',
        language: 'zh',
        kind: 'saved_words',
        written_form: '电脑',
        reading: 'diàn nǎo',
        data: { english: 'Computer (hacked)' },
      },
    ]);
    assert.equal(omitRes.conflict_count, 1);
    assert.equal(omitRes.acknowledged[0].status, 'conflict');
    assert.equal(omitRes.acknowledged[0].error, 'STALE_REVISION');

    // 3. Attempt update with FABRICATED FUTURE revision 999 -> conflict!
    const futureRes = await callMutations([
      {
        op: 'upsert',
        language: 'zh',
        kind: 'saved_words',
        written_form: '电脑',
        reading: 'diàn nǎo',
        base_revision: 999,
        data: { english: 'Computer (future)' },
      },
    ]);
    assert.equal(futureRes.conflict_count, 1);
    assert.equal(futureRes.acknowledged[0].status, 'conflict');
    assert.equal(futureRes.acknowledged[0].error, 'STALE_REVISION');

    // 4. Attempt delete with OMITTED base_revision -> conflict!
    const delOmitRes = await callMutations([
      {
        op: 'delete',
        language: 'zh',
        kind: 'saved_words',
        written_form: '电脑',
        reading: 'diàn nǎo',
      },
    ]);
    assert.equal(delOmitRes.conflict_count, 1);
    assert.equal(delOmitRes.acknowledged[0].status, 'conflict');

    // 5. Successful update with exact matching revision 1 -> revision 2
    const exactRes = await callMutations([
      {
        op: 'upsert',
        language: 'zh',
        kind: 'saved_words',
        written_form: '电脑',
        reading: 'diàn nǎo',
        base_revision: 1,
        data: { english: 'Computer (legit)' },
      },
    ]);
    assert.equal(exactRes.applied_count, 1);
    assert.equal(exactRes.acknowledged[0].status, 'applied');
    assert.equal(exactRes.acknowledged[0].revision, '2');

    // 6. Successful delete with exact matching revision 2 -> revision 3
    const exactDelRes = await callMutations([
      {
        op: 'delete',
        language: 'zh',
        kind: 'saved_words',
        written_form: '电脑',
        reading: 'diàn nǎo',
        base_revision: 2,
      },
    ]);
    assert.equal(exactDelRes.deleted_count, 1);
    assert.equal(exactDelRes.acknowledged[0].status, 'deleted');
    assert.equal(exactDelRes.acknowledged[0].revision, '3');
  });
});

test('Finding 5: Bookmark-only mutations do NOT increment study streak; qualifying study actions do', async () => {
  await as('authenticated', USER_A, async () => {
    // Current streak baseline
    const initialStreak = await callGetStreak(USER_A);
    const startStreak = initialStreak.current_streak;

    // 1. Apply bookmark mutation (saved_words)
    const bookmarkRes = await callMutations([
      {
        op: 'upsert',
        language: 'zh',
        kind: 'saved_words',
        written_form: '书本',
        reading: 'shū běn',
        data: { english: 'Book' },
      },
    ]);
    assert.equal(bookmarkRes.status, 'committed');
    assert.equal(bookmarkRes.applied_count, 1);
    assert.equal(bookmarkRes.streak.current_streak, startStreak, 'Bookmarking must NOT increment streak');
    assert.equal(bookmarkRes.streak.today_studied, false, 'Bookmarking must NOT mark today studied');

    // 2. Apply study progress mutation (learned_words)
    const studyRes = await callMutations([
      {
        op: 'upsert',
        language: 'zh',
        kind: 'learned_words',
        written_form: '学',
        reading: 'xué',
        data: { level: 'HSK1', status: 'known' },
      },
    ]);
    assert.equal(studyRes.status, 'committed');
    assert.equal(studyRes.applied_count, 1);
    assert.equal(studyRes.streak.current_streak, 1, 'Qualifying study action increments streak to 1');
    assert.equal(studyRes.streak.today_studied, true, 'Qualifying study action marks today studied');
  });
});
