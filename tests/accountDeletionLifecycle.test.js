import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import {
  ownsAvatarPath,
  cleanupUserAvatars,
  markAccountDeleting,
  recordDeletionProgress,
  getDeletionState,
  executeAccountDeletion,
  reconcilePendingDeletion,
  createDeletionHttpHandler,
  createAttemptLimiter,
} from '../src/server/accountDeletion.js';

const db = new PGlite();
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const TEST_ENV = {
  SUPABASE_URL: 'https://staging-project.supabase.co',
  SUPABASE_ANON_KEY: 'mock-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key',
};

async function asRole(role, userId, run) {
  await db.exec(`begin; set local role ${role};`);
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [userId ?? '']);
    return await run();
  } finally {
    await db.exec('rollback;');
  }
}

before(async () => {
  // Set up mock auth and storage schemas for PGlite
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated;
    create function storage.foldername(name text) returns text[] language sql immutable as
      $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
  `);

  // Apply migrations in order
  await db.exec(await readFile(new URL('../supabase/migrations/20261027000100_backend_foundation.sql', import.meta.url), 'utf8'));
  await db.query('insert into auth.users(id, email) values ($1, $2), ($3, $4)', [
    USER_A, 'user-a@example.com',
    USER_B, 'user-b@example.com',
  ]);
  await db.exec(await readFile(new URL('../supabase/migrations/20261028000100_guest_import_foundation.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261029000100_account_deletion_foundation.sql', import.meta.url), 'utf8'));
});

after(async () => {
  await db.close();
});

// ---------------------------------------------------------------------------
// 1. Database Locking & Immediate Write/Import Blocking
// ---------------------------------------------------------------------------
test('database locking: markAccountDeleting immediately blocks RLS writes, reads, imports and snapshots', async () => {
  // Verify User A can initially read profile
  await asRole('authenticated', USER_A, async () => {
    const profileRes = await db.query('select * from public.profiles where id = $1', [USER_A]);
    assert.equal(profileRes.rows.length, 1);
  });

  // Execute begin deletion as service_role
  const lockResult = await markAccountDeleting(db, USER_A);
  assert.equal(lockResult.deleting, true);
  assert.equal(lockResult.status, 'pending');

  // Verify that an ordinary authenticated client CANNOT call s2s_begin_account_deletion
  await asRole('authenticated', USER_A, async () => {
    await assert.rejects(
      async () => {
        await db.query('select public.s2s_begin_account_deletion($1::uuid)', [USER_A]);
      },
      /permission denied/i
    );
  });

  // Verify RLS read on profiles is blocked because private.is_active_user() is false
  await asRole('authenticated', USER_A, async () => {
    const profileRes = await db.query('select * from public.profiles where id = $1', [USER_A]);
    assert.equal(profileRes.rows.length, 0, 'Profiles read must be blocked when deleting = true');
  });

  // Verify RLS update on profiles is blocked
  await asRole('authenticated', USER_A, async () => {
    await db.query('update public.profiles set display_name = $1 where id = $2', ['New Name', USER_A]);
    const check = await db.query('select display_name from public.profiles where id = $1', [USER_A]);
    assert.equal(check.rows.length, 0, 'Profile update must not take effect');
  });

  // Verify snapshot RPC is blocked
  await asRole('authenticated', USER_A, async () => {
    await assert.rejects(
      async () => {
        await db.query('select public.s2s_account_snapshot($1::uuid)', [USER_A]);
      },
      /ACCOUNT_UNAVAILABLE/
    );
  });

  // Verify guest import RPC is blocked
  await asRole('authenticated', USER_A, async () => {
    await assert.rejects(
      async () => {
        await db.query(
          'select public.s2s_import_guest($1::uuid, $2::uuid, $3::bigint, $4::text, $5::text, $6::jsonb)',
          [USER_A, '33333333-3333-4333-8333-333333333333', 0, 'a'.repeat(64), 'merge', '[]']
        );
      },
      /ACCOUNT_UNAVAILABLE/
    );
  });

  // Meanwhile, User B is active and unaffected
  await asRole('authenticated', USER_B, async () => {
    const profileRes = await db.query('select * from public.profiles where id = $1', [USER_B]);
    assert.equal(profileRes.rows.length, 1, 'User B must remain fully active');
  });
});

// ---------------------------------------------------------------------------
// 2. Avatar Ownership Validation & Storage Removal
// ---------------------------------------------------------------------------
test('ownsAvatarPath: strictly validates path bounds and ownership', () => {
  assert.equal(ownsAvatarPath(USER_A, `${USER_A}/avatar.jpg`), true);
  assert.equal(ownsAvatarPath(USER_A, `${USER_A}/photo_123.png`), true);
  assert.equal(ownsAvatarPath(USER_A, `${USER_A}/old-upload.webp`), true);

  // Different user folder
  assert.equal(ownsAvatarPath(USER_A, `${USER_B}/avatar.jpg`), false);

  // Directory traversal
  assert.equal(ownsAvatarPath(USER_A, `${USER_A}/../other.jpg`), false);

  // Shared assets / wrong bucket paths
  assert.equal(ownsAvatarPath(USER_A, 'course-assets/image.png'), false);
  assert.equal(ownsAvatarPath(USER_A, 'shared/logo.png'), false);

  // Invalid extensions
  assert.equal(ownsAvatarPath(USER_A, `${USER_A}/script.js`), false);
});

test('cleanupUserAvatars: removes all and only user-owned files in avatars bucket', async () => {
  const removedBatches = [];
  const mockStorage = {
    from: (bucket) => {
      assert.equal(bucket, 'avatars', 'Must only target avatars bucket');
      return {
        list: async (folder) => {
          assert.equal(folder, USER_A);
          return {
            data: [
              { name: 'current.jpg' },
              { name: 'orphaned_1.png' },
              { name: 'replaced.webp' },
            ],
            error: null,
          };
        },
        remove: async (paths) => {
          removedBatches.push(paths);
          return { data: paths, error: null };
        },
      };
    },
  };

  const adminClient = { storage: mockStorage };
  const res = await cleanupUserAvatars(adminClient, USER_A);

  assert.equal(res.cleanedCount, 3);
  assert.deepEqual(removedBatches[0], [
    `${USER_A}/current.jpg`,
    `${USER_A}/orphaned_1.png`,
    `${USER_A}/replaced.webp`,
  ]);
});

test('cleanupUserAvatars: safe when user has no avatar files', async () => {
  let removeCalled = false;
  const mockStorage = {
    from: () => ({
      list: async () => ({ data: [], error: null }),
      remove: async () => { removeCalled = true; return { data: [], error: null }; },
    }),
  };

  const res = await cleanupUserAvatars({ storage: mockStorage }, USER_A);
  assert.equal(res.cleanedCount, 0);
  assert.equal(removeCalled, false);
});

// ---------------------------------------------------------------------------
// 3. Storage Failure Followed by Safe Retry
// ---------------------------------------------------------------------------
test('lifecycle failure: storage failure halts before Auth deletion; retry succeeds', async () => {
  let storageFailOnce = true;
  let authDeleteCalled = false;

  const mockAdminClient = {
    storage: {
      from: () => ({
        list: async () => ({ data: [{ name: 'avatar.jpg' }], error: null }),
        remove: async () => {
          if (storageFailOnce) {
            return { data: null, error: { message: 'Storage connection timeout' } };
          }
          return { data: ['avatar.jpg'], error: null };
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async () => {
          authDeleteCalled = true;
          return { data: { user: null }, error: null };
        },
      },
    },
  };

  const mockUserClient = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: USER_B,
            email: 'user-b@example.com',
            app_metadata: { provider: 'email' },
          },
        },
        error: null,
      }),
    },
  };

  const mockReauthClient = {
    auth: {
      signInWithPassword: async () => ({
        data: {
          user: { id: USER_B, email: 'user-b@example.com' },
          session: { access_token: 'temp' },
        },
        error: null,
      }),
    },
  };

  // Attempt 1: storage fails
  storageFailOnce = true;
  await assert.rejects(
    async () => {
      await executeAccountDeletion({
        userClient: mockUserClient,
        adminClient: mockAdminClient,
        dbClient: db,
        authHeader: 'Bearer valid-b-token',
        rawBody: { password: 'valid-pass' },
        env: TEST_ENV,
        attemptLimiter: createAttemptLimiter(),
        createClient: () => mockReauthClient,
      });
    },
    { name: 'AccountDeletionError', code: 'STORAGE_CLEANUP_FAILED', status: 502 }
  );

  // Auth delete was NOT called because storage failed first
  assert.equal(authDeleteCalled, false, 'Auth deletion must not be called when storage fails');

  // Verify deletion state in database: marked deleting with error recorded
  const state1 = await getDeletionState(db, USER_B);
  assert.equal(state1.deleting, true, 'Must remain marked deleting');
  assert.equal(state1.deletion_record.status, 'pending');
  assert.match(state1.deletion_record.error, /Failed to remove user avatar/);

  // Attempt 2 (Retry): Storage network recovered
  storageFailOnce = false;
  const result2 = await executeAccountDeletion({
    userClient: mockUserClient,
    adminClient: mockAdminClient,
    dbClient: db,
    authHeader: 'Bearer valid-b-token',
    rawBody: { password: 'valid-pass' },
    env: TEST_ENV,
    attemptLimiter: createAttemptLimiter(),
    createClient: () => mockReauthClient,
  });

  assert.equal(result2.success, true);
  assert.equal(result2.status, 'deleted');
  assert.equal(authDeleteCalled, true);

  // Verify state finalized
  const state2 = await getDeletionState(db, USER_B);
  assert.equal(state2.deletion_record.status, 'finalized');
  assert.ok(state2.deletion_record.finalized_at);
});

// ---------------------------------------------------------------------------
// 4. Relational Cascades Verification
// ---------------------------------------------------------------------------
test('relational cascades: deleting auth user cascades dependent tables and retains durable deletion record', async () => {
  const TEST_USER = '44444444-4444-4444-8444-444444444444';

  // Seed user and dependent rows directly
  await db.query('insert into auth.users(id, email) values ($1, $2)', [TEST_USER, 'test-cascade@example.com']);
  await db.query('insert into public.user_items(user_id, item_key, language, kind, written_form, data, observed_at) values ($1, $2, $3, $4, $5, $6, now())', [
    TEST_USER, 'c'.repeat(64), 'zh', 'saved_words', '电脑', '{}',
  ]);
  await db.query('insert into private.guest_import_receipts(user_id, request_id, source_fingerprint, input_hash, reset_version, result) values ($1, $2, $3, $4, $5, $6)', [
    TEST_USER, '55555555-5555-4555-8555-555555555555', 'd'.repeat(64), 'e'.repeat(64), 0, '{}',
  ]);

  // Mark deleting and finalize in private.account_deletions
  await markAccountDeleting(db, TEST_USER);
  await recordDeletionProgress(db, TEST_USER, 'storage_cleaned');
  await recordDeletionProgress(db, TEST_USER, 'finalized');

  // Verify rows exist before auth deletion
  const p1 = await db.query('select * from public.profiles where id = $1', [TEST_USER]);
  assert.equal(p1.rows.length, 1);
  const items1 = await db.query('select * from public.user_items where user_id = $1', [TEST_USER]);
  assert.equal(items1.rows.length, 1);
  const state1 = await db.query('select * from private.account_state where user_id = $1', [TEST_USER]);
  assert.equal(state1.rows.length, 1);

  // Simulate Supabase Auth administrative delete (delete from auth.users)
  await db.query('delete from auth.users where id = $1', [TEST_USER]);

  // Verify all cascaded rows are deleted
  const p2 = await db.query('select * from public.profiles where id = $1', [TEST_USER]);
  assert.equal(p2.rows.length, 0, 'profiles must cascade');
  const items2 = await db.query('select * from public.user_items where user_id = $1', [TEST_USER]);
  assert.equal(items2.rows.length, 0, 'user_items must cascade');
  const prefs2 = await db.query('select * from public.user_preferences where user_id = $1', [TEST_USER]);
  assert.equal(prefs2.rows.length, 0, 'user_preferences must cascade');
  const receipts2 = await db.query('select * from private.guest_import_receipts where user_id = $1', [TEST_USER]);
  assert.equal(receipts2.rows.length, 0, 'guest_import_receipts must cascade');
  const state2 = await db.query('select * from private.account_state where user_id = $1', [TEST_USER]);
  assert.equal(state2.rows.length, 0, 'account_state must cascade');

  // CRITICAL GUARANTEE: private.account_deletions is RETAINED!
  const durableDel = await db.query('select * from private.account_deletions where user_id = $1', [TEST_USER]);
  assert.equal(durableDel.rows.length, 1, 'private.account_deletions must be preserved after user cascade');
  assert.equal(durableDel.rows[0].status, 'finalized');
});

// ---------------------------------------------------------------------------
// 5. Operator Reconciliation & Lost Response Handling
// ---------------------------------------------------------------------------
test('reconcilePendingDeletion: operator can safely finalize an unconfirmed or lost-response deletion', async () => {
  const PENDING_USER = '66666666-6666-4666-8666-666666666666';
  await db.query('insert into auth.users(id, email) values ($1, $2)', [PENDING_USER, 'pending@example.com']);

  // Simulate an interrupted deletion that cleaned storage but failed before/during Auth delete
  await markAccountDeleting(db, PENDING_USER);
  await recordDeletionProgress(db, PENDING_USER, 'storage_cleaned');

  let adminDeletedUser = false;
  const mockAdminClient = {
    storage: {
      from: () => ({
        list: async () => ({ data: [], error: null }),
        remove: async () => ({ data: [], error: null }),
      }),
    },
    auth: {
      admin: {
        deleteUser: async (id) => {
          assert.equal(id, PENDING_USER);
          adminDeletedUser = true;
          await db.query('delete from auth.users where id = $1', [id]);
          return { data: { user: null }, error: null };
        },
      },
    },
  };

  const reconRes = await reconcilePendingDeletion({
    adminClient: mockAdminClient,
    dbClient: db,
    targetUserId: PENDING_USER,
  });

  assert.equal(reconRes.status, 'finalized');
  assert.equal(reconRes.reconciled, true);
  assert.equal(adminDeletedUser, true);

  // Subsequent reconciliation on already finalized account reports clean idempotent status
  const reconRes2 = await reconcilePendingDeletion({
    adminClient: mockAdminClient,
    dbClient: db,
    targetUserId: PENDING_USER,
  });
  assert.equal(reconRes2.status, 'finalized');
  assert.equal(reconRes2.reconciled, false);
  assert.equal(reconRes2.message, 'Account was already deleted and finalized.');
});

// ---------------------------------------------------------------------------
// 6. HTTP Web Handler Endpoint Integration
// ---------------------------------------------------------------------------
test('createDeletionHttpHandler: processes standard web Request/Response and emits correct statuses', async () => {
  const HTTP_USER = '77777777-7777-4777-8777-777777777777';
  await db.query('insert into auth.users(id, email) values ($1, $2)', [HTTP_USER, 'http-user@example.com']);

  const mockAdminClient = {
    storage: {
      from: () => ({
        list: async () => ({ data: [], error: null }),
        remove: async () => ({ data: [], error: null }),
      }),
    },
    auth: {
      admin: {
        deleteUser: async (id) => {
          await db.query('delete from auth.users where id = $1', [id]);
          return { data: { user: null }, error: null };
        },
      },
    },
  };

  const mockCreateClient = () => {
    // If it's reauth client (persistSession: false)
    return {
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: HTTP_USER,
              email: 'http-user@example.com',
              app_metadata: { provider: 'email' },
            },
          },
          error: null,
        }),
        signInWithPassword: async ({ password }) => {
          if (password === 'good-password') {
            return {
              data: { user: { id: HTTP_USER }, session: {} },
              error: null,
            };
          }
          return { data: { user: null }, error: { message: 'Wrong password' } };
        },
      },
    };
  };

  const handler = createDeletionHttpHandler({
    adminClient: mockAdminClient,
    dbClient: db,
    env: TEST_ENV,
    attemptLimiter: createAttemptLimiter(),
    createClient: mockCreateClient,
  });

  // 1. Method not allowed (GET)
  const getReq = new Request('https://api.example.com/delete-account', { method: 'GET' });
  const getRes = await handler(getReq);
  assert.equal(getRes.status, 405);

  // 2. Wrong password (401)
  const wrongPassReq = new Request('https://api.example.com/delete-account', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer user-token',
    },
    body: JSON.stringify({ password: 'bad-password' }),
  });
  const wrongPassRes = await handler(wrongPassReq);
  assert.equal(wrongPassRes.status, 401);
  const wrongPassJson = await wrongPassRes.json();
  assert.equal(wrongPassJson.code, 'INVALID_CREDENTIALS');

  // 3. Successful deletion (200)
  const goodReq = new Request('https://api.example.com/delete-account', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer user-token',
    },
    body: JSON.stringify({ password: 'good-password' }),
  });
  const goodRes = await handler(goodReq);
  assert.equal(goodRes.status, 200);
  const goodJson = await goodRes.json();
  assert.equal(goodJson.success, true);
  assert.equal(goodJson.status, 'deleted');
  assert.equal(goodJson.userId, HTTP_USER);
});
