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
  createDatabaseAttemptLimiter,
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
  await db.exec(await readFile(new URL('../supabase/migrations/20261029000200_account_deletion_attempt_reservation.sql', import.meta.url), 'utf8'));
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

test('cleanupUserAvatars: handles paginated results and explicit object paths across multiple pages', async () => {
  const PAGINATED_USER = '44444444-4444-4444-8444-444444444444';
  const folder = PAGINATED_USER.toLowerCase();

  // Simulate 150 items across 2 pages
  let allStoredFiles = Array.from({ length: 150 }, (_, i) => ({
    name: `avatar_${String(i).padStart(3, '0')}.webp`,
    id: `id_${i}`,
  }));

  const removedBatches = [];

  const mockStorage = {
    from(bucket) {
      assert.equal(bucket, 'avatars');
      return {
        list(targetFolder, options = {}) {
          assert.equal(targetFolder, folder);
          const limit = options.limit || 100;
          const offset = options.offset || 0;
          const page = allStoredFiles.slice(offset, offset + limit);
          return Promise.resolve({ data: page, error: null });
        },
        remove(paths) {
          removedBatches.push(paths);
          // Simulate storage removal from stored files
          const pathSet = new Set(paths);
          allStoredFiles = allStoredFiles.filter(f => !pathSet.has(`${folder}/${f.name}`));
          return Promise.resolve({ data: paths.map(p => ({ path: p })), error: null });
        },
      };
    },
  };

  const res = await cleanupUserAvatars({ storage: mockStorage }, PAGINATED_USER);
  assert.equal(res.cleanedCount, 150, 'All 150 files should be cleaned across pages');
  assert.equal(removedBatches.length, 2, 'Should perform 2 separate paginated list/remove cycles');
  assert.equal(removedBatches[0].length, 100, 'Page 1 should have 100 items');
  assert.equal(removedBatches[1].length, 50, 'Page 2 should have 50 items');
  assert.equal(allStoredFiles.length, 0, 'No files should remain in storage');
});

test('createDatabaseAttemptLimiter: atomically and durably throttles failed attempts across instances', async () => {
  const LIMITER_USER = '55555555-5555-4555-8555-555555555555';
  await db.query('insert into auth.users(id, email) values ($1, $2) on conflict do nothing', [
    LIMITER_USER, 'limiter@example.com',
  ]);

  // Instance 1 & Instance 2 share the same database
  const instance1 = createDatabaseAttemptLimiter(db, { maxAttempts: 3, windowSeconds: 60 });
  const instance2 = createDatabaseAttemptLimiter(db, { maxAttempts: 3, windowSeconds: 60 });

  assert.equal(await instance1.isThrottled(LIMITER_USER), false);
  assert.equal(await instance2.isThrottled(LIMITER_USER), false);

  // Instance 1 records failure 1
  const f1 = await instance1.recordFailure(LIMITER_USER);
  assert.equal(f1.failedAttempts, 1);
  assert.equal(f1.throttled, false);

  // Instance 2 sees failure 1 and records failure 2
  const f2 = await instance2.recordFailure(LIMITER_USER);
  assert.equal(f2.failedAttempts, 2);
  assert.equal(f2.throttled, false);

  // Instance 1 records failure 3 -> triggers throttling
  const f3 = await instance1.recordFailure(LIMITER_USER);
  assert.equal(f3.failedAttempts, 3);
  assert.equal(f3.throttled, true);
  assert.ok(f3.retryAfterSeconds > 0, 'Must have retryAfterSeconds');

  // Both instances immediately observe throttled state
  assert.equal(await instance1.isThrottled(LIMITER_USER), true);
  assert.equal(await instance2.isThrottled(LIMITER_USER), true);
  assert.ok(await instance2.getRetryAfter(LIMITER_USER) > 0);

  // Instance 1 resets upon successful auth
  await instance1.reset(LIMITER_USER);

  // Both instances immediately see throttling cleared
  assert.equal(await instance1.isThrottled(LIMITER_USER), false);
  assert.equal(await instance2.isThrottled(LIMITER_USER), false);
});

test('createDeletionHttpHandler: returns Retry-After header and retryAfter body on 429 RATE_LIMITED', async () => {
  const THROTTLED_USER = '66666666-6666-4666-8666-666666666666';
  await db.query('insert into auth.users(id, email) values ($1, $2) on conflict do nothing', [
    THROTTLED_USER, 'throttled@example.com',
  ]);

  const mockLimiter = {
    isThrottled: () => true,
    getRetryAfter: () => 540,
    recordFailure: () => ({ throttled: true, retryAfterSeconds: 540 }),
    reset: () => {},
  };

  const mockUserClient = {
    auth: {
      getUser: () => Promise.resolve({
        data: {
          user: {
            id: THROTTLED_USER,
            email: 'throttled@example.com',
            app_metadata: { provider: 'email' },
          },
        },
        error: null,
      }),
    },
  };

  const handler = createDeletionHttpHandler({
    adminClient: {},
    dbClient: db,
    env: TEST_ENV,
    attemptLimiter: mockLimiter,
    createClient: () => mockUserClient,
  });

  const req = new Request('https://api.example.com/delete-account', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer user-token',
    },
    body: JSON.stringify({ password: 'any-password' }),
  });

  const res = await handler(req);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('Retry-After'), '540');
  const json = await res.json();
  assert.equal(json.code, 'RATE_LIMITED');
  assert.equal(json.retryAfter, 540);
});

// ---------------------------------------------------------------------------
// 5. Deletion Throttling Attempt Reservation & Concurrency Race Fix
// ---------------------------------------------------------------------------
test('concurrency race fix: 20 simultaneous handler calls admit at most 5 to password verification; excess 15 are rate-limited with 429', async () => {
  const RACE_USER = '77777777-7777-4777-8777-777777777777';
  await db.query('insert into auth.users(id, email) values ($1, $2) on conflict do nothing', [
    RACE_USER, 'race@example.com',
  ]);

  const limiter = createDatabaseAttemptLimiter(db, { maxAttempts: 5, windowSeconds: 900 });

  let passwordVerificationsStarted = 0;
  let releaseGate;
  const passwordGate = new Promise((resolve) => {
    releaseGate = resolve;
  });

  const mockCreateClient = (url, key, options) => {
    if (options?.global?.headers?.Authorization) {
      return {
        auth: {
          getUser: async () => ({
            data: {
              user: {
                id: RACE_USER,
                email: 'race@example.com',
                app_metadata: { provider: 'email' },
              },
            },
            error: null,
          }),
        },
      };
    }

    return {
      auth: {
        signInWithPassword: async () => {
          passwordVerificationsStarted += 1;
          await passwordGate;
          return {
            data: {
              user: { id: RACE_USER, email: 'race@example.com' },
              session: { access_token: 'temp-token' },
            },
            error: null,
          };
        },
      },
    };
  };

  const handler = createDeletionHttpHandler({
    adminClient: {
      storage: {
        from: () => ({
          list: () => Promise.resolve({ data: [] }),
          remove: () => Promise.resolve({ data: [] }),
        }),
      },
      auth: {
        admin: {
          deleteUser: () => Promise.resolve({ data: {}, error: null }),
        },
      },
    },
    dbClient: db,
    env: TEST_ENV,
    attemptLimiter: limiter,
    createClient: mockCreateClient,
  });

  const requestPromises = Array.from({ length: 20 }, () =>
    handler(new Request('https://api.example.com/delete-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer race-token',
      },
      body: JSON.stringify({ password: 'valid-password' }),
    }))
  );

  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(
    passwordVerificationsStarted,
    5,
    'Exactly 5 requests should be admitted to password verification before responses return'
  );

  releaseGate();

  const responses = await Promise.all(requestPromises);

  const rateLimited = responses.filter((r) => r.status === 429);
  const admitted = responses.filter((r) => r.status === 200);

  assert.equal(rateLimited.length, 15, 'Excess 15 requests must be rate-limited (429)');
  assert.equal(admitted.length, 5, 'Admitted 5 requests should succeed (200)');

  for (const res of rateLimited) {
    const retryHeader = res.headers.get('Retry-After');
    assert.ok(Number(retryHeader) > 0, 'Must include Retry-After header');
    const body = await res.json();
    assert.equal(body.code, 'RATE_LIMITED');
    assert.ok(body.retryAfter > 0, 'Must include retryAfter in response payload');
  }
});

test('fixed-window expiry: capacity resets after window duration elapses', async () => {
  const EXPIRY_USER = '88888888-8888-4888-8888-888888888888';
  await db.query('insert into auth.users(id, email) values ($1, $2) on conflict do nothing', [
    EXPIRY_USER, 'expiry@example.com',
  ]);

  const limiter = createDatabaseAttemptLimiter(db, { maxAttempts: 2, windowSeconds: 1 });

  const r1 = await limiter.reserve(EXPIRY_USER);
  assert.equal(r1.allowed, true);
  assert.equal(r1.attemptCount, 1);

  const r2 = await limiter.reserve(EXPIRY_USER);
  assert.equal(r2.allowed, true);
  assert.equal(r2.attemptCount, 2);

  const r3 = await limiter.reserve(EXPIRY_USER);
  assert.equal(r3.allowed, false);
  assert.ok(r3.retryAfterSeconds >= 1);

  await new Promise((resolve) => setTimeout(resolve, 1100));

  const r4 = await limiter.reserve(EXPIRY_USER);
  assert.equal(r4.allowed, true, 'Window expiration should reset reservation capacity');
  assert.equal(r4.attemptCount, 1);
});

test('concurrent first reservation: safe concurrent initial row creation with ON CONFLICT', async () => {
  const CONCURRENT_USER = '99999999-9999-4999-8999-999999999999';
  await db.query('insert into auth.users(id, email) values ($1, $2) on conflict do nothing', [
    CONCURRENT_USER, 'concurrent@example.com',
  ]);

  await db.query('delete from private.account_deletion_attempts where user_id = $1', [CONCURRENT_USER]);

  const limiter = createDatabaseAttemptLimiter(db, { maxAttempts: 3, windowSeconds: 60 });

  const results = await Promise.all(
    Array.from({ length: 10 }, () => limiter.reserve(CONCURRENT_USER))
  );

  const allowed = results.filter((r) => r.allowed);
  const rejected = results.filter((r) => !r.allowed);

  assert.equal(allowed.length, 3, 'Exactly 3 requests should be admitted');
  assert.equal(rejected.length, 7, 'Remaining 7 requests should be throttled');

  const rowRes = await db.query('select * from private.account_deletion_attempts where user_id = $1', [CONCURRENT_USER]);
  assert.equal(rowRes.rows.length, 1);
  assert.equal(rowRes.rows[0].attempt_count, 3);
});

test('limiter failure: fails closed with 500 LIMITER_UNAVAILABLE before password verification is reached', async () => {
  const FAIL_USER = 'baaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await db.query('insert into auth.users(id, email) values ($1, $2) on conflict do nothing', [
    FAIL_USER, 'fail@example.com',
  ]);

  let passwordVerificationReached = false;

  const failingLimiter = {
    reserve: async () => {
      throw new Error('Database connection timed out');
    },
  };

  const mockCreateClient = (url, key, options) => {
    if (options?.global?.headers?.Authorization) {
      return {
        auth: {
          getUser: async () => ({
            data: {
              user: {
                id: FAIL_USER,
                email: 'fail@example.com',
                app_metadata: { provider: 'email' },
              },
            },
            error: null,
          }),
        },
      };
    }
    return {
      auth: {
        signInWithPassword: async () => {
          passwordVerificationReached = true;
          return { data: { user: {} }, error: null };
        },
      },
    };
  };

  const handler = createDeletionHttpHandler({
    adminClient: {},
    dbClient: db,
    env: TEST_ENV,
    attemptLimiter: failingLimiter,
    createClient: mockCreateClient,
  });

  const res = await handler(new Request('https://api.example.com/delete-account', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer fail-token',
    },
    body: JSON.stringify({ password: 'any-password' }),
  }));

  assert.equal(res.status, 500);
  const json = await res.json();
  assert.equal(json.code, 'LIMITER_UNAVAILABLE');
  assert.equal(
    passwordVerificationReached,
    false,
    'Password verification must NEVER be reached when attempt reservation fails'
  );
});

test('successful responses do not wipe reservations: prevents race condition reset exploits', async () => {
  const PERSIST_USER = 'caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await db.query('insert into auth.users(id, email) values ($1, $2) on conflict do nothing', [
    PERSIST_USER, 'persist@example.com',
  ]);

  const limiter = createDatabaseAttemptLimiter(db, { maxAttempts: 2, windowSeconds: 60 });

  const mockCreateClient = (url, key, options) => {
    if (options?.global?.headers?.Authorization) {
      return {
        auth: {
          getUser: async () => ({
            data: {
              user: {
                id: PERSIST_USER,
                email: 'persist@example.com',
                app_metadata: { provider: 'email' },
              },
            },
            error: null,
          }),
        },
      };
    }
    return {
      auth: {
        signInWithPassword: async () => ({
          data: {
            user: { id: PERSIST_USER, email: 'persist@example.com' },
            session: { access_token: 'temp-token' },
          },
          error: null,
        }),
      },
    };
  };

  const handler = createDeletionHttpHandler({
    adminClient: {
      storage: {
        from: () => ({
          list: () => Promise.resolve({ data: [] }),
          remove: () => Promise.resolve({ data: [] }),
        }),
      },
      auth: {
        admin: {
          deleteUser: () => Promise.resolve({ data: {}, error: null }),
        },
      },
    },
    dbClient: db,
    env: TEST_ENV,
    attemptLimiter: limiter,
    createClient: mockCreateClient,
  });

  const sendReq = () =>
    handler(new Request('https://api.example.com/delete-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer persist-token',
      },
      body: JSON.stringify({ password: 'correct-password' }),
    }));

  const res1 = await sendReq();
  assert.equal(res1.status, 200);

  const dbCheck1 = await db.query('select attempt_count from private.account_deletion_attempts where user_id = $1', [PERSIST_USER]);
  assert.equal(dbCheck1.rows[0].attempt_count, 1, 'Attempt 1 reservation must remain recorded after success');

  const res2 = await sendReq();
  assert.equal(res2.status, 200);

  const dbCheck2 = await db.query('select attempt_count from private.account_deletion_attempts where user_id = $1', [PERSIST_USER]);
  assert.equal(dbCheck2.rows[0].attempt_count, 2, 'Attempt 2 reservation must remain recorded after success');

  const res3 = await sendReq();
  assert.equal(res3.status, 429, 'Subsequent requests must be rate-limited; success did not wipe reservations');
  const json3 = await res3.json();
  assert.equal(json3.code, 'RATE_LIMITED');
});

test('exercise actual SQL reservation function: s2s_reserve_deletion_attempt security and behavior', async () => {
  const SQL_USER = 'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await db.query('insert into auth.users(id, email) values ($1, $2) on conflict do nothing', [
    SQL_USER, 'sqluser@example.com',
  ]);

  await asRole('authenticated', SQL_USER, async () => {
    await assert.rejects(
      async () => {
        await db.query('select public.s2s_reserve_deletion_attempt($1::uuid, 5, 900)', [SQL_USER]);
      },
      /permission denied/i,
      'Authenticated users must NOT have execute permissions on s2s_reserve_deletion_attempt'
    );
  });

  await asRole('anon', null, async () => {
    await assert.rejects(
      async () => {
        await db.query('select public.s2s_reserve_deletion_attempt($1::uuid, 5, 900)', [SQL_USER]);
      },
      /permission denied/i,
      'Anon role must NOT have execute permissions on s2s_reserve_deletion_attempt'
    );
  });

  await asRole('service_role', null, async () => {
    const res = await db.query(
      'select public.s2s_reserve_deletion_attempt($1::uuid, 3, 60) as result',
      [SQL_USER]
    );
    const data = res.rows[0].result;
    assert.equal(data.allowed, true);
    assert.equal(data.attempt_count, 1);
    assert.equal(data.remaining_attempts, 2);
    assert.equal(data.retry_after_seconds, 0);
  });
});
