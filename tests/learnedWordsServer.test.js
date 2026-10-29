import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
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
  await db.query('insert into auth.users(id) values ($1),($2)', [USER_A, USER_B]);
  await db.exec(await readFile(new URL('../supabase/migrations/20261028000100_guest_import_foundation.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261029000100_account_deletion_foundation.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261029000200_account_deletion_attempt_reservation.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261029000300_online_sync_foundation.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261029000400_learned_words_sync.sql', import.meta.url), 'utf8'));
});

after(async () => {
  await db.close();
});

test('learnedWords Server: apply upsert mutation for learned_words succeeds with progress metadata', async () => {
  await as('authenticated', USER_A, async () => {
    const res = await callMutations([
      {
        op: 'upsert',
        language: 'zh',
        kind: 'learned_words',
        written_form: '中',
        reading: 'zhōng',
        data: {
          level: 'HSK1',
          status: 'known',
          last_action: 'learned',
          seen: 3,
        },
      },
    ]);

    assert.equal(res.status, 'committed');
    assert.equal(res.applied_count, 1);
    assert.equal(res.acknowledged[0].status, 'applied');
    assert.equal(res.acknowledged[0].kind, 'learned_words');

    const snap = await callSnapshot(USER_A);
    const item = snap.items.find(i => i.kind === 'learned_words' && i.written_form === '中');
    assert.ok(item);
    assert.equal(item.data.status, 'known');
    assert.equal(item.data.seen, 3);
  });
});

test('learnedWords Server: rejects learned_words with invalid seen counter', async () => {
  await as('authenticated', USER_A, async () => {
    await assert.rejects(
      async () => {
        await callMutations([
          {
            op: 'upsert',
            language: 'zh',
            kind: 'learned_words',
            written_form: '好',
            reading: 'hǎo',
            data: { seen: -1 },
          },
        ]);
      },
      (err) => err.message.includes('INVALID_MUTATION_COUNTERS'),
    );
  });
});

test('learnedWords Server: delete creates tombstone and prevents stale resurrection', async () => {
  await as('authenticated', USER_A, async () => {
    // 1. Delete the item
    const delRes = await callMutations([
      {
        op: 'delete',
        language: 'zh',
        kind: 'learned_words',
        written_form: '中',
        reading: 'zhōng',
      },
    ]);
    assert.equal(delRes.status, 'committed');
    assert.equal(delRes.deleted_count, 1);

    // 2. Snapshot verifies tombstone exists
    const snap = await callSnapshot(USER_A);
    assert.equal(snap.items.filter(i => i.kind === 'learned_words' && i.written_form === '中').length, 0);
    assert.ok(snap.tombstones.some(t => t.kind === 'learned_words'));

    // 3. Stale edit with base_revision null or 1 gets conflict error
    const staleRes = await callMutations([
      {
        op: 'upsert',
        language: 'zh',
        kind: 'learned_words',
        written_form: '中',
        reading: 'zhōng',
        base_revision: '1',
        data: { status: 'known' },
      },
    ]);
    assert.equal(staleRes.conflict_count, 1);
    assert.equal(staleRes.acknowledged[0].status, 'conflict');
    assert.equal(staleRes.acknowledged[0].error, 'RECORD_DELETED');
  });
});

test('learnedWords Server: learning reset wipes learned_words and advances generation', async () => {
  await as('authenticated', USER_A, async () => {
    // Re-create a word
    await callMutations([
      {
        op: 'upsert',
        language: 'zh',
        kind: 'learned_words',
        written_form: '谢谢',
        reading: 'xiè xie',
        data: { status: 'known', seen: 1 },
      },
    ]);

    // Reset learning
    const resetRes = await callReset({ version: '0' });
    assert.equal(resetRes.status, 'reset');
    assert.equal(resetRes.reset_version, '1');

    // Snapshot verifies all items and tombstones wiped
    const snap = await callSnapshot(USER_A);
    assert.equal(snap.items.length, 0);
    assert.equal(snap.tombstones.length, 0);
    assert.equal(snap.reset_version, '1');

    // Attempting mutation with stale reset_version fails
    await assert.rejects(
      async () => {
        await callMutations([
          {
            op: 'upsert',
            language: 'zh',
            kind: 'learned_words',
            written_form: '新词',
            reading: 'xīncí',
            data: { status: 'known' },
          },
        ], { version: '0' });
      },
      (err) => err.message.includes('RESET_VERSION_CHANGED'),
    );
  });
});

test('learnedWords Server: guest import imports and updates learned_words', async () => {
  await as('authenticated', USER_B, async () => {
    const importRes = await callGuestImport([
      {
        language: 'zh',
        kind: 'learned_words',
        written_form: '你好',
        reading: 'nǐ hǎo',
        data: { level: 'HSK1', status: 'known', seen: 2 },
        observed_at: new Date().toISOString(),
      },
    ], { expectedUserId: USER_B });

    assert.equal(importRes.status, 'committed');
    assert.equal(importRes.added_count, 1);

    const snap = await callSnapshot(USER_B);
    const item = snap.items.find(i => i.kind === 'learned_words' && i.written_form === '你好');
    assert.ok(item);
    assert.equal(item.data.seen, 2);
  });
});
