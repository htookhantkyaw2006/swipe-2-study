import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';
const USER_D = '44444444-4444-4444-8444-444444444444';
const SOURCE_FINGERPRINT = 'a'.repeat(64);

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

const callReset = async ({
  expectedUserId = USER_A,
  requestId = randomUUID(),
  version = '0',
} = {}) => {
  const res = await db.query(
    'select public.s2s_reset_learning($1::uuid, $2::uuid, $3::bigint) as result',
    [expectedUserId, requestId, version],
  );
  return res.rows[0].result;
};

const callSnapshot = async (expectedUserId = USER_A) => {
  const res = await db.query('select public.s2s_account_snapshot($1::uuid) as result', [expectedUserId]);
  return res.rows[0].result;
};

const callGuestImport = async (items, {
  expectedUserId = USER_A,
  requestId = randomUUID(),
  version = '0',
  fingerprint = SOURCE_FINGERPRINT,
  choice = 'merge',
} = {}) => {
  const res = await db.query(
    'select public.s2s_import_guest($1::uuid,$2::uuid,$3::bigint,$4::text,$5::text,$6::jsonb) as result',
    [expectedUserId, requestId, version, fingerprint, choice, JSON.stringify(items)],
  );
  return res.rows[0].result;
};

const wordMutation = (written = '你好', reading = 'nǐ hǎo', extra = {}) => ({
  op: 'upsert',
  language: 'zh',
  kind: 'saved_words',
  written_form: written,
  reading,
  data: { english: 'Hello' },
  ...extra,
});

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

  // Load migrations in chronological order
  await db.exec(await readFile(new URL('../supabase/migrations/20261027000100_backend_foundation.sql', import.meta.url), 'utf8'));
  await db.query('insert into auth.users(id) values ($1),($2),($3),($4)', [USER_A, USER_B, USER_C, USER_D]);
  await db.exec(await readFile(new URL('../supabase/migrations/20261028000100_guest_import_foundation.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261029000100_account_deletion_foundation.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261029000200_account_deletion_attempt_reservation.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261029000300_online_sync_foundation.sql', import.meta.url), 'utf8'));
});

after(async () => {
  await db.close();
});

// ---------------------------------------------------------------------------
// 1. Owner Isolation and RPC Privileges
// ---------------------------------------------------------------------------
test('Owner Isolation: unauthenticated caller cannot execute mutations or reset', async () => {
  // Anon role has no execute permission on private RPCs
  await assert.rejects(
    as('anon', null, () => callMutations([wordMutation()])),
    /permission denied/
  );
  await assert.rejects(
    as('anon', null, () => callReset()),
    /permission denied/
  );

  // Authenticated role without user claim hits ACCOUNT_REQUIRED
  await assert.rejects(
    as('authenticated', null, () => callMutations([wordMutation()])),
    /ACCOUNT_REQUIRED/
  );
  await assert.rejects(
    as('authenticated', null, () => callReset()),
    /ACCOUNT_REQUIRED/
  );
});

test('Owner Isolation: caller cannot mutate another account (ACCOUNT_CHANGED)', async () => {
  await assert.rejects(
    as('authenticated', USER_A, () => callMutations([wordMutation()], { expectedUserId: USER_B })),
    /ACCOUNT_CHANGED/
  );
  await assert.rejects(
    as('authenticated', USER_A, () => callReset({ expectedUserId: USER_B })),
    /ACCOUNT_CHANGED/
  );
});

test('Owner Isolation: RLS prevents reading another user tombstones', async () => {
  await as('authenticated', USER_A, async () => {
    // Delete a word as User A
    await callMutations([{ op: 'delete', language: 'zh', kind: 'saved_words', written_form: '私有', reading: 'sī yǒu' }]);
  });

  // User B cannot read User A's tombstones
  await as('authenticated', USER_B, async () => {
    const res = await db.query('select count(*)::int as count from public.user_item_tombstones');
    assert.equal(res.rows[0].count, 0, 'User B must see 0 tombstones from User A');
  });
});

// ---------------------------------------------------------------------------
// 2. Normal Create/Update/Delete Acknowledgements
// ---------------------------------------------------------------------------
test('Mutations: normal create, update, and delete yield canonical acknowledgements', async () => {
  await as('authenticated', USER_A, async () => {
    // 1. Create (upsert on empty)
    const createReqId = randomUUID();
    const createRes = await callMutations([
      wordMutation('学习', 'xué xí', { client_id: 'client-m1', data: { english: 'To study' } }),
    ], { requestId: createReqId });

    assert.equal(createRes.status, 'committed');
    assert.equal(createRes.applied_count, 1);
    assert.equal(createRes.deleted_count, 0);
    assert.equal(createRes.conflict_count, 0);
    assert.equal(createRes.replayed, false);
    assert.equal(createRes.acknowledged.length, 1);
    assert.equal(createRes.acknowledged[0].client_id, 'client-m1');
    assert.equal(createRes.acknowledged[0].status, 'applied');
    assert.equal(createRes.acknowledged[0].revision, '1');

    const itemKey = createRes.acknowledged[0].item_key;
    assert.match(itemKey, /^[a-f0-9]{64}$/);

    // 2. Update (upsert with base_revision 1)
    const updateRes = await callMutations([
      wordMutation('学习', 'xué xí', {
        client_id: 'client-m2',
        base_revision: 1,
        data: { english: 'To study; to learn' },
      }),
    ]);

    assert.equal(updateRes.status, 'committed');
    assert.equal(updateRes.applied_count, 1);
    assert.equal(updateRes.acknowledged[0].client_id, 'client-m2');
    assert.equal(updateRes.acknowledged[0].status, 'applied');
    assert.equal(updateRes.acknowledged[0].revision, '2');

    // 3. Delete (with base_revision 2)
    const deleteRes = await callMutations([
      {
        op: 'delete',
        language: 'zh',
        kind: 'saved_words',
        written_form: '学习',
        reading: 'xué xí',
        client_id: 'client-m3',
        base_revision: 2,
      },
    ]);

    assert.equal(deleteRes.status, 'committed');
    assert.equal(deleteRes.deleted_count, 1);
    assert.equal(deleteRes.acknowledged[0].client_id, 'client-m3');
    assert.equal(deleteRes.acknowledged[0].status, 'deleted');
    assert.equal(deleteRes.acknowledged[0].revision, '3');

    // Verify row removed from user_items and present in tombstones
    const snap = await callSnapshot();
    const itemInSnap = snap.items.find((i) => i.item_key === itemKey);
    assert.equal(itemInSnap, undefined, 'Deleted item must not exist in active snapshot items');

    const tombstoneInSnap = snap.tombstones.find((t) => t.item_key === itemKey);
    assert.ok(tombstoneInSnap, 'Tombstone must be recorded in snapshot tombstones');
    assert.equal(tombstoneInSnap.revision, '3');
  });
});

// ---------------------------------------------------------------------------
// 3. Identical Retry Without Duplicate Effects (Idempotency)
// ---------------------------------------------------------------------------
test('Idempotency: identical retry returns cached result without duplicate effects', async () => {
  await as('authenticated', USER_A, async () => {
    const reqId = randomUUID();
    const mutation = wordMutation('重复', 'chóng fù', { data: { english: 'Repeat' } });

    // First call
    const firstRes = await callMutations([mutation], { requestId: reqId });
    assert.equal(firstRes.replayed, false);
    assert.equal(firstRes.applied_count, 1);

    const firstSnap = await callSnapshot();

    // Replay call
    const replayRes = await callMutations([mutation], { requestId: reqId });
    assert.equal(replayRes.replayed, true);
    assert.equal(replayRes.status, 'committed');
    assert.equal(replayRes.applied_count, 1);
    assert.deepEqual(replayRes.acknowledged, firstRes.acknowledged);

    const secondSnap = await callSnapshot();
    assert.deepEqual(secondSnap.items, firstSnap.items, 'Replayed retry must not alter snapshot rows or revisions');
  });
});

test('Idempotency: altered payload with reused request_id is rejected', async () => {
  const reqId = randomUUID();
  await as('authenticated', USER_A, async () => {
    await callMutations([wordMutation('一', 'yī')], { requestId: reqId });
  });

  // Same request ID but different word in separate transaction
  await assert.rejects(
    as('authenticated', USER_A, () => callMutations([wordMutation('二', 'èr')], { requestId: reqId })),
    /MUTATION_REQUEST_REUSED/
  );
});

// ---------------------------------------------------------------------------
// 4. Stale Revision Conflicts
// ---------------------------------------------------------------------------
test('Conflict Detection: stale base_revision is rejected in non-atomic and atomic modes', async () => {
  await as('authenticated', USER_A, async () => {
    // 1. Create word at revision 1
    const createRes = await callMutations([wordMutation('冲突', 'chōng tū', { data: { english: 'Conflict' } })]);
    assert.equal(createRes.acknowledged[0].revision, '1');

    // 2. Advance word to revision 2
    const updateRes = await callMutations([
      wordMutation('冲突', 'chōng tū', { base_revision: 1, data: { english: 'Conflict v2' } }),
    ]);
    assert.equal(updateRes.acknowledged[0].revision, '2');

    // 3. Stale edit with base_revision: 1 (non-atomic mode: returns conflict status)
    const staleRes = await callMutations([
      wordMutation('冲突', 'chōng tū', {
        client_id: 'stale-edit-1',
        base_revision: 1, // Stale! Server is at 2
        data: { english: 'Stale overwrite attempt' },
      }),
    ], { atomic: false });

    assert.equal(staleRes.conflict_count, 1);
    assert.equal(staleRes.applied_count, 0);
    assert.equal(staleRes.acknowledged[0].status, 'conflict');
    assert.equal(staleRes.acknowledged[0].error, 'STALE_REVISION');
    assert.equal(staleRes.acknowledged[0].server_revision, '2');

    // Verify row data was NOT changed
    const snap = await callSnapshot();
    const item = snap.items.find((i) => i.written_form === '冲突');
    assert.equal(item.data.english, 'Conflict v2');
    assert.equal(item.revision, '2');
  });

  // 4. Stale edit in atomic mode (throws REVISION_CONFLICT)
  await assert.rejects(
    as('authenticated', USER_A, () => callMutations([
      wordMutation('冲突', 'chōng tū', { base_revision: 1, data: { english: 'Fails' } }),
    ], { atomic: true })),
    /REVISION_CONFLICT/
  );
});

// ---------------------------------------------------------------------------
// 5. Delete Followed by Stale Edit/Import Cannot Resurrect Record
// ---------------------------------------------------------------------------
test('Tombstones: delete followed by stale edit or guest import cannot resurrect record', async () => {
  await as('authenticated', USER_A, async () => {
    const wordWritten = '墓碑';
    const wordReading = 'mù bēi';

    // 1. Create word at revision 1
    await callMutations([wordMutation(wordWritten, wordReading, { data: { english: 'Tombstone' } })]);

    // 2. Delete word (creates tombstone at revision 2)
    const delRes = await callMutations([{
      op: 'delete',
      language: 'zh',
      kind: 'saved_words',
      written_form: wordWritten,
      reading: wordReading,
      base_revision: 1,
    }]);
    assert.equal(delRes.acknowledged[0].status, 'deleted');
    assert.equal(delRes.acknowledged[0].revision, '2');

    // 3. Stale edit attempting resurrection with base_revision: 1
    const staleEditRes = await callMutations([
      wordMutation(wordWritten, wordReading, { base_revision: 1, data: { english: 'Resurrected?' } }),
    ]);
    assert.equal(staleEditRes.acknowledged[0].status, 'conflict');
    assert.equal(staleEditRes.acknowledged[0].error, 'RECORD_DELETED');

    // 4. Guest import containing the deleted word
    const importRes = await callGuestImport([
      {
        language: 'zh',
        kind: 'saved_words',
        written_form: wordWritten,
        reading: wordReading,
        data: { english: 'Imported tombstone word' },
        observed_at: '2026-01-01T00:00:00Z',
      },
    ]);
    assert.equal(importRes.added_count, 0, 'Guest import must respect server tombstone and NOT add deleted word');

    // 5. Verify snapshot still has zero active learning items for this word
    const snap = await callSnapshot();
    const activeItem = snap.items.find((i) => i.written_form === wordWritten);
    assert.equal(activeItem, undefined, 'Deleted record must NEVER restore as an active learning row');
  });
});

// ---------------------------------------------------------------------------
// 6. Atomic Batch Rollback
// ---------------------------------------------------------------------------
test('Atomic Rollback: invalid item in batch rolls back all earlier items and receipt', async () => {
  const reqId = randomUUID();
  const batch = [
    wordMutation('有效', 'yǒu xiào', { data: { english: 'Valid' } }),
    {
      op: 'upsert',
      language: 'zh',
      kind: 'unsupported_kind', // Invalid kind!
      written_form: '无效',
      reading: '',
      data: {},
    },
  ];

  await assert.rejects(
    as('authenticated', USER_A, () => callMutations(batch, { requestId: reqId })),
    /INVALID_MUTATION_ITEM/
  );

  await as('authenticated', USER_A, async () => {
    // Verify row '有效' was rolled back
    const snap = await callSnapshot();
    assert.equal(snap.items.find((i) => i.written_form === '有效'), undefined);
  });

  // Verify receipt was rolled back (queried as superuser outside authenticated context)
  const receiptRes = await db.query(
    'select count(*)::int as count from private.sync_mutation_receipts where request_id = $1',
    [reqId]
  );
  assert.equal(receiptRes.rows[0].count, 0, 'Receipt must be rolled back on batch failure');
});

// ---------------------------------------------------------------------------
// 7. Reset Replay and Rejection of Pre-Reset Requests
// ---------------------------------------------------------------------------
test('Learning Reset: atomic reset, repeat-safe replay, and pre-reset rejection', async () => {
  // Use dedicated USER_C for clean reset testing
  await as('authenticated', USER_C, async () => {
    // 1. Seed learning items and a tombstone in generation 0
    await callMutations([
      wordMutation('重置前1', 'chóng zhì qián yī'),
      wordMutation('重置前2', 'chóng zhì qián èr'),
    ], { expectedUserId: USER_C });
    await callMutations([
      { op: 'delete', language: 'zh', kind: 'saved_words', written_form: '重置前2', reading: 'chóng zhì qián èr' },
    ], { expectedUserId: USER_C });

    const preResetSnap = await callSnapshot(USER_C);
    assert.equal(preResetSnap.items.length, 1);
    assert.equal(preResetSnap.tombstones.length > 0, true);
    assert.equal(preResetSnap.reset_version, '0');

    // 2. Perform Learning Reset (expected_reset_version: 0)
    const resetReqId = randomUUID();
    const resetRes = await callReset({ expectedUserId: USER_C, requestId: resetReqId, version: '0' });

    assert.equal(resetRes.status, 'reset');
    assert.equal(resetRes.user_id, USER_C);
    assert.equal(resetRes.previous_reset_version, '0');
    assert.equal(resetRes.reset_version, '1');
    assert.equal(resetRes.items_reset, true);
    assert.equal(resetRes.replayed, false);

    // 3. Verify learning items and tombstones are wiped
    const postResetSnap = await callSnapshot(USER_C);
    assert.equal(postResetSnap.reset_version, '1');
    assert.equal(postResetSnap.items.length, 0, 'All active learning items must be wiped');
    assert.equal(postResetSnap.tombstones.length, 0, 'All tombstones must be wiped');

    // Verify profile & preferences are preserved
    const profileRes = await db.query('select * from public.profiles where id = $1', [USER_C]);
    assert.equal(profileRes.rows.length, 1, 'Profile must be preserved');
    const prefRes = await db.query('select * from public.user_preferences where user_id = $1', [USER_C]);
    assert.equal(prefRes.rows.length, 1, 'Preferences must be preserved');

    // 4. Repeat Reset (same reset request_id) -> repeat-safe replay
    const replayResetRes = await callReset({ expectedUserId: USER_C, requestId: resetReqId, version: '0' });
    assert.equal(replayResetRes.replayed, true);
    assert.equal(replayResetRes.reset_version, '1', 'Reset replay must not bump reset_version repeatedly');
  });

  // 5. Mutation from pre-reset generation (version 0) is rejected
  await assert.rejects(
    as('authenticated', USER_C, () => callMutations([wordMutation('旧世代', 'jiù shì dài')], { expectedUserId: USER_C, version: '0' })),
    /RESET_VERSION_CHANGED/
  );

  // 6. Guest import from pre-reset generation (version 0) is rejected
  await assert.rejects(
    as('authenticated', USER_C, () => callGuestImport([wordMutation('旧导入', 'jiù dǎo rù')], { expectedUserId: USER_C, version: '0' })),
    /RESET_VERSION_CHANGED/
  );

  // 7. Mutation with current generation (version 1) succeeds
  await as('authenticated', USER_C, async () => {
    const newGenRes = await callMutations([wordMutation('新世代', 'xīn shì dài')], { expectedUserId: USER_C, version: '1' });
    assert.equal(newGenRes.status, 'committed');
    assert.equal(newGenRes.reset_version, '1');
    assert.equal(newGenRes.applied_count, 1);
  });
});

// ---------------------------------------------------------------------------
// 8. Deleting / Deleted Accounts Cannot Write
// ---------------------------------------------------------------------------
test('Account Deletion Guard: deleting or deleted accounts cannot write mutations or reset', async () => {
  // Use dedicated USER_D
  await db.query('select public.s2s_begin_account_deletion($1::uuid)', [USER_D]);

  // 1. Mutations rejected when deleting
  await assert.rejects(
    as('authenticated', USER_D, () => callMutations([wordMutation()], { expectedUserId: USER_D })),
    /ACCOUNT_UNAVAILABLE/
  );

  // 2. Reset rejected when deleting
  await assert.rejects(
    as('authenticated', USER_D, () => callReset({ expectedUserId: USER_D })),
    /ACCOUNT_UNAVAILABLE/
  );

  // 3. Snapshot rejected when deleting
  await assert.rejects(
    as('authenticated', USER_D, () => callSnapshot(USER_D)),
    /ACCOUNT_UNAVAILABLE/
  );

  // Now delete user from auth.users (cascades)
  await db.query('delete from auth.users where id = $1', [USER_D]);

  // 4. Mutations rejected when deleted
  await assert.rejects(
    as('authenticated', USER_D, () => callMutations([wordMutation()], { expectedUserId: USER_D })),
    /ACCOUNT_UNAVAILABLE/
  );
});

// ---------------------------------------------------------------------------
// 9. Existing Snapshot and Guest Import Compatibility
// ---------------------------------------------------------------------------
test('Compatibility: existing guest import and snapshot behavior remains fully compatible', async () => {
  // Use USER_B (generation 0, clean account)
  await as('authenticated', USER_B, async () => {
    const importRes = await callGuestImport([
      {
        language: 'ja',
        kind: 'saved_words',
        written_form: '猫',
        reading: 'ねこ',
        data: { english: 'Cat' },
        observed_at: '2026-02-01T00:00:00Z',
      },
    ], { expectedUserId: USER_B, version: '0' });

    assert.equal(importRes.status, 'committed');
    assert.equal(importRes.added_count, 1);

    const snap = await callSnapshot(USER_B);
    assert.equal(snap.schema_version, 1);
    assert.equal(snap.user_id, USER_B);
    assert.equal(snap.reset_version, '0');
    assert.ok(Array.isArray(snap.items));
    assert.ok(snap.items.some((i) => i.written_form === '猫'));
  });
});
