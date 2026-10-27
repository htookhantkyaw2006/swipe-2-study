import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Actual PostgreSQL/RLS semantics, with only Supabase's managed auth/storage
// schemas stubbed. Hosted Auth, JWT verification and file APIs still need QA.
const db = new PGlite();
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const preexisting = '33333333-3333-4333-8333-333333333333';
const query = (sql, params) => db.query(sql, params);

async function as(role, userId, action) {
  await db.exec(`begin; set local role ${role};`);
  try {
    await query("select set_config('request.jwt.claim.sub', $1, true)", [userId || '']);
    return await action();
  } finally {
    await db.exec('rollback;');
  }
}

before(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create schema storage;
    grant usage on schema public, auth, storage to anon, authenticated, service_role;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table storage.buckets (
      id text primary key, name text not null, public boolean,
      file_size_limit bigint, allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text references storage.buckets(id), name text not null
    );
    alter table storage.objects enable row level security;
    grant select, insert, update, delete on storage.objects to authenticated;
    create function storage.foldername(name text) returns text[] language sql immutable as
      $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1)-1] $$;
  `);
  await query('insert into auth.users (id, raw_user_meta_data) values ($1, $2)', [preexisting, { full_name: 'Existing user' }]);
  const migration = await readFile(new URL('../supabase/migrations/20261027000100_backend_foundation.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  for (const [id, name] of [[alice, 'Alice'], [bob, 'Bob']]) {
    await query('insert into auth.users (id, raw_user_meta_data) values ($1, $2)', [id, { display_name: name, role: 'admin' }]);
  }
  await db.exec(`
    insert into public.courses (id, language, level_id, title, is_published) values
      ('zh-hsk1', 'zh', 'hsk1', 'HSK 1', true),
      ('ja-n5', 'ja', 'n5', 'N5 draft', false);
    insert into public.vocabulary (id, course_id, written_form) values
      ('zh-word-1', 'zh-hsk1', '你好'), ('ja-word-1', 'ja-n5', 'こんにちは');
  `);
});
after(async () => { await db.close(); });

test('migration backfills existing users and creates records for new users', async () => {
  const result = await query('select id, display_name from public.profiles order by id');
  assert.equal(result.rows.length, 3);
  assert.deepEqual(result.rows.map(row => row.display_name), ['Alice', 'Bob', 'Existing user']);
  assert.equal((await query('select count(*)::int as total from public.user_preferences')).rows[0].total, 3);
});

test('learners can see only their own profile and preferences', async () => {
  await as('authenticated', alice, async () => {
    assert.deepEqual((await query('select id from public.profiles')).rows, [{ id: alice }]);
    assert.deepEqual((await query('select user_id from public.user_preferences')).rows, [{ user_id: alice }]);
    assert.equal((await query('update public.profiles set display_name = $1 where id = $2 returning id', ['No', bob])).rows.length, 0);
    assert.equal((await query('update public.user_preferences set active_language = $1 where user_id = $2 returning user_id', ['ja', bob])).rows.length, 0);
  });
});

test('profile and preference updates are allowed for the owner', async () => {
  await as('authenticated', alice, async () => {
    assert.equal((await query('update public.profiles set display_name = $1, avatar_path = $2 returning display_name', ['PT', `${alice}/avatar.webp`])).rows[0].display_name, 'PT');
    assert.equal((await query('update public.user_preferences set active_language = $1, settings = $2 returning active_language', ['ja', { cardsPerSession: 10 }])).rows[0].active_language, 'ja');
  });
});

test('clients cannot rewrite identity or server timestamps', async () => {
  for (const statement of [
    `update public.profiles set id = '${bob}'`,
    `update public.profiles set created_at = '2000-01-01'`,
    `update public.user_preferences set user_id = '${bob}'`,
    `update public.user_preferences set updated_at = '2000-01-01'`,
  ]) {
    await assert.rejects(as('authenticated', alice, () => query(statement)), { code: '42501' });
  }
});

test('signup metadata does not grant content or lifecycle privileges', async () => {
  for (const statement of [
    'select * from private.account_state',
    'update private.account_state set deleting = false',
    "insert into public.courses (id, language, level_id, title) values ('other', 'zh', 'hsk2', 'No')",
    "update public.vocabulary set meaning_english = 'tampered'",
    `insert into public.profiles (id) values ('44444444-4444-4444-8444-444444444444')`,
  ]) {
    await assert.rejects(as('authenticated', alice, () => query(statement)), { code: '42501' });
  }
});

test('anonymous visitors can read published course content but not private profiles', async () => {
  await as('anon', null, async () => {
    assert.deepEqual((await query('select id from public.courses')).rows, [{ id: 'zh-hsk1' }]);
    assert.deepEqual((await query('select id from public.vocabulary')).rows, [{ id: 'zh-word-1' }]);
  });
  await assert.rejects(as('anon', null, () => query('select * from public.profiles')), { code: '42501' });
});

test('avatar rows are restricted to the current user folder', async () => {
  await as('authenticated', alice, async () => {
    await query('insert into storage.objects (bucket_id, name) values ($1, $2)', ['avatars', `${alice}/avatar.webp`]);
    assert.equal((await query('select * from storage.objects')).rows.length, 1);
    assert.equal((await query('delete from storage.objects where name = $1 returning id', [`${bob}/avatar.webp`])).rows.length, 0);
  });
  await assert.rejects(as('authenticated', alice, () => query('insert into storage.objects (bucket_id, name) values ($1, $2)', ['avatars', `${bob}/avatar.webp`])), { code: '42501' });
  await assert.rejects(as('authenticated', alice, () => query('update public.profiles set avatar_path = $1', [`${bob}/avatar.webp`])), { code: '23514' });
});

test('deleting accounts cannot change or access private records or upload avatars', async () => {
  await query('update private.account_state set deleting = true where user_id = $1', [alice]);
  try {
    await as('authenticated', alice, async () => {
      assert.equal((await query('select * from public.profiles')).rows.length, 0);
      assert.equal((await query('select * from public.user_preferences')).rows.length, 0);
      assert.equal((await query("update public.profiles set display_name = 'No' returning id")).rows.length, 0);
    });
    await assert.rejects(as('authenticated', alice, () => query('insert into storage.objects (bucket_id, name) values ($1, $2)', ['avatars', `${alice}/late.webp`])), { code: '42501' });
  } finally {
    await query('update private.account_state set deleting = false where user_id = $1', [alice]);
  }
});

test('trusted content imports work while learner writes are denied', async () => {
  await as('service_role', null, async () => {
    assert.equal((await query("update public.vocabulary set meaning_english = 'hello' where id = 'zh-word-1' returning meaning_english")).rows[0].meaning_english, 'hello');
  });
});

test('deleting an auth user cascades profile, preferences and lifecycle rows', async () => {
  await db.exec('begin');
  try {
    await query('delete from auth.users where id = $1', [alice]);
    for (const [table, column] of [['public.profiles', 'id'], ['public.user_preferences', 'user_id'], ['private.account_state', 'user_id']]) {
      assert.equal((await query(`select * from ${table} where ${column} = $1`, [alice])).rows.length, 0);
    }
  } finally {
    await db.exec('rollback');
  }
});
