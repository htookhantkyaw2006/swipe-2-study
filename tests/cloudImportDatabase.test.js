import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const source = 'a'.repeat(64);
const word = (written = '你好', extra = {}) => ({ language: 'zh', kind: 'saved_words', written_form: written, reading: 'nǐ hǎo', data: { english: 'Hello' }, observed_at: '2026-01-01T00:00:00Z', ...extra });
const call = async (items, { expectedUserId = A, requestId = randomUUID(), version = '0', fingerprint = source, choice = 'merge' } = {}) => (await db.query(
  'select public.s2s_import_guest($1::uuid,$2::uuid,$3::bigint,$4::text,$5::text,$6::jsonb) as result',
  [expectedUserId, requestId, version, fingerprint, choice, JSON.stringify(items)],
)).rows[0].result;
const snapshot = async (expectedUserId = A) => (await db.query('select public.s2s_account_snapshot($1::uuid) as result', [expectedUserId])).rows[0].result;
async function as(role, userId, run) {
  await db.exec(`begin; set local role ${role};`);
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [userId ?? '']);
    return await run();
  } finally { await db.exec('rollback;'); }
}

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
  await db.query('insert into auth.users(id) values ($1),($2)', [A, B]);
  await db.exec(await readFile(new URL('../supabase/migrations/20261028000100_guest_import_foundation.sql', import.meta.url), 'utf8'));
});
after(async () => { await db.close(); });

test('cloud import commits owned rows and exposes a complete versioned account snapshot', async () => {
  await as('authenticated', A, async () => {
    const requestId = randomUUID();
    const result = await call([word()], { requestId });
    assert.equal(result.status, 'committed');
    assert.equal(result.persistence, 'cloud');
    assert.equal(result.user_id, A);
    assert.equal(result.request_id, requestId);
    assert.equal(result.reset_version, '0');
    assert.equal(result.added_count, 1);
    const saved = await snapshot();
    assert.equal(saved.user_id, A);
    assert.equal(saved.items.length, 1);
    assert.match(saved.items[0].item_key, /^[a-f0-9]{64}$/);
    assert.equal(saved.items[0].revision, '1');
    assert.equal(saved.items[0].data.english, 'Hello');
    assert.ok(saved.items[0].created_at);
  });
});

test('a failed item rolls back every earlier item AND the retry receipt', async () => {
  await assert.rejects(as('authenticated', A, () => call([word(), word('bad', { kind: 'not-a-kind' })])), /INVALID_IMPORT_ITEM/);
  assert.equal((await db.query('select count(*)::int as count from public.user_items')).rows[0].count, 0);
  assert.equal((await db.query('select count(*)::int as count from private.guest_import_receipts')).rows[0].count, 0);
});

test('retrying the same request is idempotent and does not update timestamps or revisions', async () => {
  await as('authenticated', A, async () => {
    const requestId = randomUUID();
    const first = await call([word()], { requestId });
    const before = await snapshot();
    const replay = await call([word()], { requestId });
    assert.deepEqual(replay, { ...first, replayed: true });
    assert.deepEqual((await snapshot()).items, before.items);
  });
});

test('a retry receipt cannot authorize a changed payload or a different choice', async () => {
  for (const second of [[word('changed')], []]) {
    await assert.rejects(as('authenticated', A, async () => {
      const requestId = randomUUID();
      await call([word()], { requestId });
      await call(second, { requestId, choice: second.length ? 'merge' : 'account-only' });
    }), /IMPORT_REQUEST_REUSED/);
  }
});

test('independent requests/devices are allowed while stable identities deduplicate their records', async () => {
  await as('authenticated', A, async () => {
    await call([word()]);
    const result = await call([word(), word('新', { reading: 'xīn' })]);
    assert.equal(result.replayed, false);
    assert.equal(result.added_count, 1);
    assert.equal((await snapshot()).items.length, 2);
  });
});

test('server identity normalizes Unicode/case/whitespace but keeps language, type and tones distinct', async () => {
  await as('authenticated', A, async () => {
    await call([
      word(' 学校 ', { reading: 'GAKKO\u0304' }), word('学校', { reading: 'gakkō' }),
      word('学校', { reading: 'gakkō', kind: 'review_cards' }),
      word('学校', { reading: 'gakkō', language: 'ja' }),
      word('妈', { reading: 'mā' }), word('妈', { reading: 'má' }),
      word('你好', { reading: 'NǏ\u00a0 HǍO' }), word('你好'),
    ]);
    assert.equal((await snapshot()).items.length, 6);
  });
});

test('saved and review conflicts preserve account details rather than overwriting with a guest copy', async () => {
  await as('authenticated', A, async () => {
    await call([word('你好', { data: { english: 'Account version' } })]);
    const result = await call([word()]);
    assert.equal(result.added_count, 0);
    assert.equal(result.updated_count, 0);
    assert.equal((await snapshot()).items[0].data.english, 'Account version');
  });
});

test('drills use higher seen, then latest observed timestamp; counters/streaks are never summed', async () => {
  await as('authenticated', A, async () => {
    const drill = (seen, correct, wrong, streak, date) => word('あ', { kind: 'learned_kana', reading: '', data: { seen, correct, wrong, streak }, observed_at: date });
    await call([drill(5, 5, 0, 5, '2026-01-02T00:00:00Z')]);
    await call([drill(4, 4, 0, 4, '2026-01-03T00:00:00Z')]);
    assert.equal((await snapshot()).items[0].data.seen, 5);
    await call([drill(5, 4, 1, 0, '2026-01-04T00:00:00Z')]);
    let row = (await snapshot()).items[0];
    assert.deepEqual(row.data, { seen: 5, correct: 4, wrong: 1, streak: 0 });
    assert.equal(row.revision, '2');
    await call([drill(6, 5, 1, 1, '2026-01-01T00:00:00Z')]);
    row = (await snapshot()).items[0];
    assert.equal(row.data.seen, 6);
    assert.equal(row.data.streak, 1);
  });
});

test('search history keeps the newest ten per language, with correct retained-record counts', async () => {
  await as('authenticated', A, async () => {
    const rows = Array.from({ length: 15 }, (_, i) => word(`term-${i}`, { kind: 'search_history', reading: '', data: {}, observed_at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z` }));
    const result = await call([...rows, word('Japanese', { language: 'ja', kind: 'search_history', reading: '', data: {} })]);
    const saved = (await snapshot()).items;
    assert.equal(result.added_count, 11);
    assert.equal(saved.filter(row => row.language === 'zh').length, 10);
    assert.equal(saved.filter(row => row.language === 'ja').length, 1);
    assert.ok(!saved.some(row => row.written_form === 'term-0'));
  });
});

test('account-only records a choice without changing account items', async () => {
  await as('authenticated', A, async () => {
    await call([word()]);
    const before = await snapshot();
    const result = await call([], { choice: 'account-only' });
    assert.equal(result.choice, 'account-only');
    assert.equal(result.added_count, 0);
    assert.deepEqual((await snapshot()).items, before.items);
  });
  await assert.rejects(as('authenticated', A, () => call([word()], { choice: 'account-only' })), /IMPORT_LIMIT_OR_CHOICE_INVALID/);
});

test('anonymous and unsigned requests cannot invoke snapshot/import RPCs', async () => {
  await assert.rejects(as('anon', null, snapshot), { code: '42501' });
  await assert.rejects(as('anon', null, () => call([word()])), { code: '42501' });
  await assert.rejects(as('authenticated', null, snapshot), /ACCOUNT_REQUIRED/);
});

test('two users can use the same request UUID but never read each other rows or private receipts', async () => {
  await as('authenticated', A, async () => {
    const requestId = randomUUID();
    await call([word()], { requestId });
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [B]);
    assert.equal((await snapshot(B)).items.length, 0);
    assert.equal((await db.query('select * from public.user_items')).rows.length, 0);
    await call([word('B only')], { requestId, expectedUserId: B });
    assert.equal((await snapshot(B)).items[0].written_form, 'B only');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [A]);
    assert.equal((await snapshot()).items[0].written_form, '你好');
  });
  await assert.rejects(as('authenticated', A, () => db.query('select * from private.guest_import_receipts')), { code: '42501' });
});

test('clients cannot bypass the RPC to insert/update/delete rows or access private helper functions', async () => {
  for (const sql of [
    'delete from public.user_items', 'update public.user_items set revision=99',
    "insert into public.user_items(user_id,item_key,language,kind,written_form,data,observed_at) values ('" + A + "','" + source + "','zh','saved_words','x','{}',now())",
    "select private.s2s_item_text('secret')",
  ]) await assert.rejects(as('authenticated', A, () => db.query(sql)), { code: '42501' });
});

test('spoofed owner/identity/revision fields are rejected rather than applied', async () => {
  for (const row of [word('x', { user_id: B }), word('x', { data: { user_id: B } }), word('x', { data: { id: 'device-id' } }), word('x', { data: { reset_version: 0 } })]) {
    await assert.rejects(as('authenticated', A, () => call([row])), /INVALID_IMPORT_ITEM/);
  }
  await assert.rejects(as('authenticated', B, () => call([word()], { expectedUserId: A })), /ACCOUNT_CHANGED/);
  await assert.rejects(as('authenticated', B, () => snapshot(A)), /ACCOUNT_CHANGED/);
  assert.equal((await db.query('select count(*)::int as count from public.user_items')).rows[0].count, 0);
});

test('invalid counters, timestamps, shapes and capacity limits never create partial data', async () => {
  const badRows = [
    word('x', { data: [], kind: 'review_cards' }), word('x', { observed_at: 'infinity' }),
    word('x', { written_form: '' }), word('x', { language: 'xx' }),
    word('x', { kind: 'learned_kana', data: { seen: 3, correct: 2, wrong: 2, streak: 1 } }),
    word('x', { kind: 'learned_kana', data: { seen: 1, correct: 1, wrong: 0, streak: 2 } }),
    word('x', { kind: 'learned_kana', data: { seen: 1.5, correct: 1.5, wrong: 0, streak: 1 } }),
    word('x', { data: { english: 'x'.repeat(17000) } }), word('x', { data: { english: {} } }),
    word('x', { data: { examples: [null] } }), word('x', { data: { examples: [{ english: {} }] } }),
  ];
  for (const row of badRows) await assert.rejects(as('authenticated', A, () => call([word(), row])));
  await assert.rejects(as('authenticated', A, () => call(Array.from({ length: 5001 }, () => word()))), /IMPORT_LIMIT_OR_CHOICE_INVALID/);
  await assert.rejects(as('authenticated', A, () => call([word()], { fingerprint: source + '\n' })), /INVALID_IMPORT_REQUEST/);
  assert.equal((await db.query('select count(*)::int as count from public.user_items')).rows[0].count, 0);
});

test('receipt replay does not resurrect an item later removed by a trusted operation', async () => {
  await as('authenticated', A, async () => {
    const requestId = randomUUID();
    await call([word()], { requestId });
    // Test harness owner only: emulate a future authorized removal RPC.
    await db.exec('reset role;');
    await db.query('delete from public.user_items where user_id=$1', [A]);
    await db.exec('set local role authenticated;');
    assert.equal((await call([word()], { requestId })).replayed, true);
    assert.equal((await snapshot()).items.length, 0);
  });
});

test('advancing reset_version rejects even a previously committed request receipt', async () => {
  await assert.rejects(as('authenticated', A, async () => {
    const requestId = randomUUID();
    await call([word()], { requestId });
    await db.exec('reset role;');
    await db.query('update private.account_state set reset_version=1 where user_id=$1', [A]);
    await db.exec('set local role authenticated;');
    await call([word()], { requestId });
  }), /RESET_VERSION_CHANGED/);
});

test('Auth deletion cascades item/receipt rows; this is not a Storage file-cleanup implementation', async () => {
  await as('authenticated', A, async () => {
    await call([word()]);
    await db.exec('reset role;');
    await db.query('delete from auth.users where id=$1', [A]);
    assert.equal((await db.query('select count(*)::int as count from public.user_items where user_id=$1', [A])).rows[0].count, 0);
    assert.equal((await db.query('select count(*)::int as count from private.guest_import_receipts where user_id=$1', [A])).rows[0].count, 0);
  });
});

test('deleting accounts and stale reset generations cannot read/import, including retries', async () => {
  await db.query('update private.account_state set deleting=true where user_id=$1', [A]);
  try {
    await assert.rejects(as('authenticated', A, snapshot), /ACCOUNT_UNAVAILABLE/);
    await assert.rejects(as('authenticated', A, () => call([word()])), /ACCOUNT_UNAVAILABLE/);
    await as('authenticated', A, async () => assert.equal((await db.query('select * from public.user_items')).rows.length, 0));
  } finally { await db.query('update private.account_state set deleting=false where user_id=$1', [A]); }
  await assert.rejects(as('authenticated', A, () => call([word()], { version: '1' })), /RESET_VERSION_CHANGED/);
});

test('reset versions remain exact decimal strings beyond JavaScript integer precision', async () => {
  const version = '9223372036854775700';
  await db.query('update private.account_state set reset_version=$1 where user_id=$2', [version, A]);
  try {
    await as('authenticated', A, async () => {
      assert.equal((await snapshot()).reset_version, version);
      assert.equal((await call([word()], { version })).reset_version, version);
    });
  } finally { await db.query('update private.account_state set reset_version=0 where user_id=$1', [A]); }
});
