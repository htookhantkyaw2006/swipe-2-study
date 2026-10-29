import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

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
} = {}) => {
  const res = await db.query(
    'select public.s2s_apply_mutations($1::uuid, $2::uuid, $3::bigint, $4::jsonb, false) as result',
    [expectedUserId, requestId, version, JSON.stringify(mutations)],
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
  await db.query('insert into auth.users(id) values ($1),($2)', [USER_A, USER_B]);
  await db.exec(await readFile(new URL('../supabase/migrations/20261028000100_guest_import_foundation.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261029000100_account_deletion_foundation.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261029000200_account_deletion_attempt_reservation.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261029000300_online_sync_foundation.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261029000400_learned_words_sync.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261029000500_study_streaks_yangon.sql', import.meta.url), 'utf8'));
});

after(async () => {
  await db.close();
});

test('studyStreaks: unauthenticated caller cannot query study streak', async () => {
  await as('anon', null, async () => {
    await assert.rejects(
      async () => { await callGetStreak(USER_A); },
      (err) => err.message.includes('permission denied') || err.message.includes('ACCOUNT_REQUIRED'),
    );
  });
});

test('studyStreaks: initial streak is 0 and today_studied is false', async () => {
  await as('authenticated', USER_A, async () => {
    const streak = await callGetStreak(USER_A);
    assert.equal(streak.current_streak, 0);
    assert.equal(streak.longest_streak, 0);
    assert.equal(streak.today_studied, false);
    assert.equal(streak.timezone, 'Asia/Yangon');
  });
});

test('studyStreaks: qualifying study action records streak = 1 in Asia/Yangon', async () => {
  await as('authenticated', USER_A, async () => {
    const res = await callMutations([
      {
        op: 'upsert',
        language: 'zh',
        kind: 'learned_words',
        written_form: '中',
        reading: 'zhōng',
        data: { level: 'HSK1', status: 'known' },
      },
    ]);

    assert.equal(res.status, 'committed');
    assert.ok(res.streak, 'Mutation returns streak payload');
    assert.equal(res.streak.current_streak, 1);
    assert.equal(res.streak.longest_streak, 1);
    assert.equal(res.streak.today_studied, true);
    assert.equal(res.streak.timezone, 'Asia/Yangon');

    // Confirm query matches
    const streak = await callGetStreak(USER_A);
    assert.equal(streak.current_streak, 1);
    assert.equal(streak.today_studied, true);
  });
});

test('studyStreaks: multiple actions on the same calendar day count day once', async () => {
  await as('authenticated', USER_A, async () => {
    // Second action today
    const res = await callMutations([
      {
        op: 'upsert',
        language: 'zh',
        kind: 'learned_words',
        written_form: '你好',
        reading: 'nǐ hǎo',
        data: { level: 'HSK1', status: 'known' },
      },
    ]);

    assert.equal(res.streak.current_streak, 1, 'Streak stays 1 on same day');
    assert.equal(res.streak.today_studied, true);

    // Verify activity table recorded count = 2
    const act = await db.query(
      'select action_count from public.user_study_activity where user_id = $1',
      [USER_A],
    );
    assert.equal(act.rows[0].action_count, 2);
  });
});

test('studyStreaks: replayed request does not add activity or mutate streak', async () => {
  await as('authenticated', USER_A, async () => {
    const reqId = randomUUID();
    const batch = [
      {
        op: 'upsert',
        language: 'zh',
        kind: 'learned_words',
        written_form: '水',
        reading: 'shuǐ',
        data: { status: 'known' },
      },
    ];

    const first = await callMutations(batch, { requestId: reqId });
    assert.equal(first.replayed, false);

    const replay = await callMutations(batch, { requestId: reqId });
    assert.equal(replay.replayed, true);

    // Activity count should still be 3 (2 from previous test + 1 from first)
    const act = await db.query(
      'select action_count from public.user_study_activity where user_id = $1',
      [USER_A],
    );
    assert.equal(act.rows[0].action_count, 3);
  });
});

test('studyStreaks: consecutive day extends streak', async () => {
  const todayRes = await db.query("select (timezone('Asia/Yangon', now()))::date as d");
  const today = todayRes.rows[0].d;

  // Setup seed streak as service_role
  await as('service_role', null, async () => {
    await db.query(`
      insert into public.user_study_streaks (user_id, current_streak, longest_streak, last_study_date, updated_at)
      values ($1, 4, 10, ($2::date - 1), now() - interval '1 day')
    `, [USER_B, today]);
  });

  await as('authenticated', USER_B, async () => {
    // Query before studying today: yesterday extends through today
    const beforeStudy = await callGetStreak(USER_B);
    assert.equal(beforeStudy.current_streak, 4, 'Yesterday extends through today');
    assert.equal(beforeStudy.today_studied, false, 'Not studied yet today');

    // Study today!
    const res = await callMutations([
      {
        op: 'upsert',
        language: 'zh',
        kind: 'learned_words',
        written_form: '大',
        reading: 'dà',
        data: { status: 'known' },
      },
    ], { expectedUserId: USER_B });

    assert.equal(res.streak.current_streak, 5, 'Consecutive day extends streak to 5');
    assert.equal(res.streak.longest_streak, 10, 'Longest streak preserved');
    assert.equal(res.streak.today_studied, true);
  });
});

test('studyStreaks: missed day breaks streak', async () => {
  const todayRes = await db.query("select (timezone('Asia/Yangon', now()))::date as d");
  const today = todayRes.rows[0].d;

  // Set last study date to 3 days ago as service_role
  await as('service_role', null, async () => {
    await db.query(`
      update public.user_study_streaks
        set current_streak = 5,
            last_study_date = ($1::date - 3)
        where user_id = $2
    `, [today, USER_B]);
  });

  await as('authenticated', USER_B, async () => {
    // Query before study: missed day broke streak
    const beforeStudy = await callGetStreak(USER_B);
    assert.equal(beforeStudy.current_streak, 0, 'Missed day broke streak');
    assert.equal(beforeStudy.today_studied, false);

    // Studying restarts streak at 1
    const res = await callMutations([
      {
        op: 'upsert',
        language: 'zh',
        kind: 'learned_words',
        written_form: '小',
        reading: 'xiǎo',
        data: { status: 'known' },
      },
    ], { expectedUserId: USER_B });

    assert.equal(res.streak.current_streak, 1, 'Restarts streak at 1');
    assert.equal(res.streak.today_studied, true);
  });
});

test('studyStreaks: learning reset wipes study activity and resets streaks to 0', async () => {
  await as('authenticated', USER_A, async () => {
    const resetRes = await callReset({ version: '0' });
    assert.equal(resetRes.status, 'reset');

    // Check activity table is empty for user A
    const act = await db.query(
      'select count(*) as c from public.user_study_activity where user_id = $1',
      [USER_A],
    );
    assert.equal(act.rows[0].c, 0);

    // Check streak is 0
    const streak = await callGetStreak(USER_A);
    assert.equal(streak.current_streak, 0);
    assert.equal(streak.longest_streak, 0);
    assert.equal(streak.today_studied, false);
  });
});
