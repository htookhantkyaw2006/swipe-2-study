import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PGlite } from '@electric-sql/pglite';

import { parseCsv } from '../tools/content-csv/parser.mjs';
import {
  mapCsvRowsToItems,
  stageContent,
  publishStagedContent,
  rollbackContent,
  fetchCurrentCourseContent,
} from '../tools/content-csv/contentImportEngine.mjs';
import { fetchPublishedCourseContent } from '../src/lib/publishedContentService.js';
import { reconcileSnapshotWithLocal } from '../src/lib/cloudSnapshotHydration.js';

const db = new PGlite();
const alice = '11111111-1111-4111-8111-111111111111';
const query = (sql, params) => db.query(sql, params);

const DATA_DIR = path.resolve(process.cwd(), 'tools/content-csv/data');
const N5_CSV_PATH = path.join(DATA_DIR, 'N5_Swipe2Study_import.csv');
const N5_MAPPING_PATH = path.join(DATA_DIR, 'N5_Swipe2Study_mapping.json');

let tempBackupDir;

async function as(role, userId, action) {
  await db.exec(`begin; set local role ${role};`);
  try {
    if (userId) {
      await query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    }
    return await action();
  } finally {
    await db.exec('rollback;');
  }
}

function createSupabaseDbWrapper(pgliteInstance) {
  return {
    from: (table) => {
      const filters = [];
      let orderCol = null;
      let orderAsc = true;
      let rangeFrom = 0;
      let rangeTo = Infinity;

      const builder = {
        select: () => builder,
        eq: (col, val) => {
          filters.push({ col, op: '=', val });
          return builder;
        },
        order: (col, { ascending = true } = {}) => {
          orderCol = col;
          orderAsc = ascending;
          return builder;
        },
        range: (from, to) => {
          rangeFrom = from;
          rangeTo = to;
          return builder.then();
        },
        maybeSingle: async () => {
          const res = await builder.then();
          if (res.error) return res;
          return { data: res.data?.[0] || null, error: null };
        },
        then: async (resolve) => {
          try {
            const res = await as('anon', null, async () => {
              let sql = `select * from public.${table}`;
              const params = [];
              if (filters.length > 0) {
                const whereClauses = filters.map((f, i) => {
                  params.push(f.val);
                  return `${f.col} ${f.op} $${i + 1}`;
                });
                sql += ` where ${whereClauses.join(' and ')}`;
              }
              if (orderCol) {
                sql += ` order by ${orderCol} ${orderAsc ? 'asc' : 'desc'}`;
              }
              return await pgliteInstance.query(sql, params);
            });

            const rows = res.rows.slice(rangeFrom, rangeTo + 1);
            const result = { data: rows, error: null };
            if (resolve) resolve(result);
            return result;
          } catch (err) {
            const errResult = { data: null, error: { message: err.message } };
            if (resolve) resolve(errResult);
            return errResult;
          }
        },
      };
      return builder;
    },
  };
}

before(async () => {
  tempBackupDir = fs.mkdtempSync(path.join(os.tmpdir(), 's2s-db-backup-'));

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

  await query('insert into auth.users (id, raw_user_meta_data) values ($1, $2)', [alice, { full_name: 'Alice Learner' }]);

  // Apply full sequential migration chain in timestamp order
  const migrations = [
    '../supabase/migrations/20261027000100_backend_foundation.sql',
    '../supabase/migrations/20261028000100_guest_import_foundation.sql',
    '../supabase/migrations/20261029000100_account_deletion_foundation.sql',
    '../supabase/migrations/20261029000200_account_deletion_attempt_reservation.sql',
    '../supabase/migrations/20261029000300_online_sync_foundation.sql',
    '../supabase/migrations/20261029000400_learned_words_sync.sql',
    '../supabase/migrations/20261029000500_study_streaks_yangon.sql',
    '../supabase/migrations/20261029000600_sync_progress_hardening.sql',
    '../supabase/migrations/20261030000100_content_publication_foundation.sql',
    '../supabase/migrations/20261030000200_content_publication_hardening.sql',
    '../supabase/migrations/20261030000300_consistent_publication_reads.sql',
    '../supabase/migrations/20261102000200_vocabulary_japanese_fields.sql',
  ];

  for (const m of migrations) {
    const sql = await readFile(new URL(m, import.meta.url), 'utf8');
    await db.exec(sql);
  }
});

after(async () => {
  if (tempBackupDir && fs.existsSync(tempBackupDir)) {
    await rm(tempBackupDir, { recursive: true, force: true });
  }
  await db.close();
});

test('1. Schema Verification: vocabulary linguistic columns and tombstone sense_id', async () => {
  const colRes = await query(`
    select column_name, data_type, is_nullable
      from information_schema.columns
     where table_schema = 'public' and table_name = 'vocabulary'
       and column_name in ('kana', 'romaji', 'part_of_speech')
     order by column_name;
  `);
  assert.equal(colRes.rows.length, 3, 'Must have kana, romaji, part_of_speech on public.vocabulary');

  const tombRes = await query(`
    select column_name, data_type, is_nullable
      from information_schema.columns
     where table_schema = 'public' and table_name = 'user_item_tombstones'
       and column_name = 'sense_id';
  `);
  assert.equal(tombRes.rows.length, 1, 'Must have sense_id on public.user_item_tombstones');

  // Verify bogus s2s_publish_course_content function is dropped
  const fnRes = await query(`
    select proname from pg_proc where proname = 's2s_publish_course_content';
  `);
  assert.equal(fnRes.rows.length, 0, 'Bogus s2s_publish_course_content must be completely dropped');
});

test('2. Real Staging & CLI-Used Publication: all 706 N5 items and 2,118 examples with linguistic metadata', async () => {
  assert.ok(fs.existsSync(N5_CSV_PATH));
  assert.ok(fs.existsSync(N5_MAPPING_PATH));

  const csvRaw = fs.readFileSync(N5_CSV_PATH, 'utf8');
  const mapping = JSON.parse(fs.readFileSync(N5_MAPPING_PATH, 'utf8'));
  const parsed = parseCsv(csvRaw);
  assert.equal(parsed.rows.length, 706);

  const items = mapCsvRowsToItems(parsed.rows, { mapping });
  assert.equal(items.length, 706);

  // Verify all 706 items have complete linguistic fields
  for (const item of items) {
    assert.ok(item.kana && item.kana.trim().length > 0, `Item ${item.id} must have kana`);
    assert.ok(item.romaji && item.romaji.trim().length > 0, `Item ${item.id} must have romaji`);
    assert.ok(item.part_of_speech && item.part_of_speech.trim().length > 0, `Item ${item.id} must have part_of_speech`);
  }

  // 1. Stage content
  const stageRes = await stageContent({
    db,
    courseId: 'ja-n5',
    incomingItems: items,
    rawBuffer: Buffer.from(csvRaw, 'utf8'),
    operator: 'operator-alice',
  });
  assert.ok(stageRes.stage_id, 'Staging succeeds and returns stage_id');
  assert.equal(stageRes.item_count, 706);

  // 2. Publish staged content via CLI-used RPC: public.s2s_publish_staged_content
  const pubRes = await publishStagedContent({
    db,
    courseId: 'ja-n5',
    stageId: stageRes.stage_id,
    operator: 'operator-alice',
    reason: 'Initial publication of Japanese N5 curriculum',
    backupDir: tempBackupDir,
  });

  assert.equal(pubRes.course_id, 'ja-n5');
  assert.equal(pubRes.version, 1);
  assert.equal(pubRes.inserted, 706);
  assert.equal(pubRes.retired, 0);

  // 3. Query public.vocabulary directly
  const rowsRes = await query(`
    select count(*) as total,
           count(kana) as with_kana,
           count(romaji) as with_romaji,
           count(part_of_speech) as with_pos
      from public.vocabulary
     where course_id = 'ja-n5' and is_active = true;
  `);
  assert.equal(Number(rowsRes.rows[0].total), 706, 'Exactly 706 active items');
  assert.equal(Number(rowsRes.rows[0].with_kana), 706, 'All 706 items have kana');
  assert.equal(Number(rowsRes.rows[0].with_romaji), 706, 'All 706 items have romaji');
  assert.equal(Number(rowsRes.rows[0].with_pos), 706, 'All 706 items have part_of_speech');

  // Check total examples across all rows: exactly 2,118
  const exRes = await query(`
    select sum(jsonb_array_length(examples)) as total_examples
      from public.vocabulary
     where course_id = 'ja-n5';
  `);
  assert.equal(Number(exRes.rows[0].total_examples), 2118, 'Exactly 2,118 examples stored in database');

  // 4. Verify homonym pairs exist independently with distinct IDs
  for (const word of ['あの', 'ある', 'かける', 'キロ', 'もう']) {
    const homonymRes = await query(`
      select id, written_form, reading, kana, romaji, part_of_speech, meaning_english
        from public.vocabulary
       where course_id = 'ja-n5' and written_form = $1
       order by sort_order;
    `, [word]);
    assert.equal(homonymRes.rows.length, 2, `Homonym word '${word}' must have exactly 2 distinct rows`);
    assert.notEqual(homonymRes.rows[0].id, homonymRes.rows[1].id, `IDs must be distinct for senses of '${word}'`);
    assert.notEqual(homonymRes.rows[0].meaning_english, homonymRes.rows[1].meaning_english, `Meanings must be distinct for senses of '${word}'`);
  }

  // 5. Client fetch via publishedContentService
  const supabaseWrapper = createSupabaseDbWrapper(db);
  const clientFetch = await fetchPublishedCourseContent('ja-n5', { client: supabaseWrapper });
  assert.equal(clientFetch.isPublished, true);
  assert.equal(Number(clientFetch.version), 1);
  assert.equal(clientFetch.items.length, 706);
  assert.ok(clientFetch.items[0].kana, 'Client mapped card has kana');
  assert.ok(clientFetch.items[0].romaji, 'Client mapped card has romaji');
  assert.ok(clientFetch.items[0].part_of_speech, 'Client mapped card has part_of_speech');
});

test('3. Rollback & Snapshot Preservation: restores linguistic metadata from publication history', async () => {
  // Update one item and publish version 2
  const currentItems = await fetchCurrentCourseContent({ db, courseId: 'ja-n5' });
  assert.equal(currentItems.length, 706);

  const modifiedItems = currentItems.map((item) => ({ ...item }));
  modifiedItems[0].meaning_english = 'to meet; to encounter (updated in v2)';

  const stage2Res = await stageContent({
    db,
    courseId: 'ja-n5',
    incomingItems: modifiedItems,
    rawBuffer: Buffer.from(JSON.stringify(modifiedItems)),
    operator: 'operator-alice',
  });

  const pub2Res = await publishStagedContent({
    db,
    courseId: 'ja-n5',
    stageId: stage2Res.stage_id,
    operator: 'operator-alice',
    reason: 'v2 test update',
    backupDir: tempBackupDir,
  });
  assert.equal(pub2Res.version, 2);

  const checkV2 = await query("select meaning_english from public.vocabulary where id = $1", [modifiedItems[0].id]);
  assert.equal(checkV2.rows[0].meaning_english, 'to meet; to encounter (updated in v2)');

  // Now rollback to version 1 using rollbackContent (which invokes public.s2s_rollback_course_content)
  const rbRes = await rollbackContent({
    db,
    courseId: 'ja-n5',
    targetVersion: 1,
    operator: 'operator-alice',
    reason: 'Rollback to v1 verification',
    backupDir: tempBackupDir,
  });

  assert.equal(rbRes.target_version, 1);

  // Verify linguistic fields are completely preserved after rollback
  const checkV1 = await query(`
    select written_form, kana, romaji, part_of_speech, meaning_english
      from public.vocabulary
     where id = $1;
  `, [modifiedItems[0].id]);
  assert.equal(checkV1.rows[0].meaning_english, currentItems[0].meaning_english, 'English reverted to v1');
  assert.equal(checkV1.rows[0].kana, currentItems[0].kana, 'kana preserved through rollback');
  assert.equal(checkV1.rows[0].romaji, currentItems[0].romaji, 'romaji preserved through rollback');
  assert.equal(checkV1.rows[0].part_of_speech, currentItems[0].part_of_speech, 'part_of_speech preserved through rollback');
});

test('4. Security & Role Permissions: anon and authenticated cannot execute privileged RPCs', async () => {
  const dummyChecksum = 'a'.repeat(64);
  const dummyStageId = '00000000-0000-0000-0000-000000000001';

  // 1. anon role attempts
  await as('anon', null, async () => {
    await assert.rejects(
      async () => query("select public.s2s_stage_course_content('ja-n5', $1, '[]'::jsonb)", [dummyChecksum]),
      /permission denied|42501/i,
      'anon cannot call s2s_stage_course_content'
    );
  });
  await as('anon', null, async () => {
    await assert.rejects(
      async () => query("select public.s2s_publish_staged_content('ja-n5', $1)", [dummyStageId]),
      /permission denied|42501/i,
      'anon cannot call s2s_publish_staged_content'
    );
  });
  await as('anon', null, async () => {
    await assert.rejects(
      async () => query("select public.s2s_rollback_course_content('ja-n5', 1)"),
      /permission denied|42501/i,
      'anon cannot call s2s_rollback_course_content'
    );
  });

  // 2. authenticated role attempts
  await as('authenticated', alice, async () => {
    await assert.rejects(
      async () => query("select public.s2s_stage_course_content('ja-n5', $1, '[]'::jsonb)", [dummyChecksum]),
      /permission denied|42501/i,
      'authenticated cannot call s2s_stage_course_content'
    );
  });
  await as('authenticated', alice, async () => {
    await assert.rejects(
      async () => query("select public.s2s_publish_staged_content('ja-n5', $1)", [dummyStageId]),
      /permission denied|42501/i,
      'authenticated cannot call s2s_publish_staged_content'
    );
  });
  await as('authenticated', alice, async () => {
    await assert.rejects(
      async () => query("select public.s2s_rollback_course_content('ja-n5', 1)"),
      /permission denied|42501/i,
      'authenticated cannot call s2s_rollback_course_content'
    );
  });
});

test('5. Prerequisite Enforcement: staging rejects N5 items without companion metadata', async () => {
  const incompleteItem = {
    id: 'ja-n5-incomplete-001',
    course_id: 'ja-n5',
    language: 'ja',
    level_id: 'N5',
    written_form: 'テスト',
    reading: 'てすと',
    meaning_english: 'test',
    meaning_burmese: 'စမ်းသပ်မှု',
    // missing kana, romaji, part_of_speech!
  };

  const checksum = 'b'.repeat(64);

  await assert.rejects(
    async () => {
      await query(
        "select public.s2s_stage_course_content('ja-n5', $1, $2::jsonb, '{}'::jsonb, 'operator')",
        [checksum, JSON.stringify([incompleteItem])]
      );
    },
    /MISSING_COMPANION_METADATA/
  );
});

test('6. Cloud Sense Identity & Guest Import Round-trips: both senses of キロ coexist independently', async () => {
  // Query both senses of キロ from database to get their authoritative IDs
  const kiroRows = await query(`
    select id, written_form, reading, kana, romaji, part_of_speech, meaning_english, meaning_burmese
      from public.vocabulary
     where course_id = 'ja-n5' and written_form = 'キロ'
     order by sort_order;
  `);
  assert.equal(kiroRows.rows.length, 2);
  const kiro1 = kiroRows.rows[0];
  const kiro2 = kiroRows.rows[1];

  assert.notEqual(kiro1.id, kiro2.id);

  // 1. Guest Cloud Import: s2s_import_guest
  const guestRequestId = '22222222-2222-4222-8222-222222222222';
  const observedTime = '2026-11-02T12:00:00.000Z';

  const guestItems = [
    {
      language: 'ja',
      kind: 'saved_words',
      written_form: kiro1.written_form,
      reading: kiro1.reading,
      sense_id: kiro1.id,
      observed_at: observedTime,
      data: {
        card_id: kiro1.id,
        english: kiro1.meaning_english,
        burmese: kiro1.meaning_burmese,
        kana: kiro1.kana,
        part_of_speech: kiro1.part_of_speech,
      },
    },
    {
      language: 'ja',
      kind: 'saved_words',
      written_form: kiro2.written_form,
      reading: kiro2.reading,
      sense_id: kiro2.id,
      observed_at: observedTime,
      data: {
        card_id: kiro2.id,
        english: kiro2.meaning_english,
        burmese: kiro2.meaning_burmese,
        kana: kiro2.kana,
        part_of_speech: kiro2.part_of_speech,
      },
    },
  ];

  await as('authenticated', alice, async () => {
    // 1. Guest Cloud Import: s2s_import_guest
    const importRes = await query(`
      select public.s2s_import_guest(
        $1, $2, 0, $3, 'merge', $4::jsonb
      ) as result;
    `, [alice, guestRequestId, '0'.repeat(64), JSON.stringify(guestItems)]);

    assert.equal(importRes.rows[0].result.status, 'imported');
    assert.equal(importRes.rows[0].result.added, 2, 'Both senses of キロ added without collision');

    // Check stored items in public.user_items
    const userItems = await query(`
      select item_key, written_form, reading, data
        from public.user_items
       where user_id = $1 and language = 'ja' and kind = 'saved_words';
    `, [alice]);
    assert.equal(userItems.rows.length, 2, 'Two distinct rows exist for both キロ senses');
    assert.notEqual(userItems.rows[0].item_key, userItems.rows[1].item_key, 'Item keys must be distinct');

    // 2. Mutations: Delete Sense 1 via s2s_apply_mutations
    const deleteRequestId = '33333333-3333-4333-8333-333333333333';
    const deleteMutations = [
      {
        op: 'delete',
        language: 'ja',
        kind: 'saved_words',
        written_form: kiro1.written_form,
        reading: kiro1.reading,
        sense_id: kiro1.id,
        base_revision: '1',
        client_id: `ja:saved_words:キロ:${kiro1.reading}:${kiro1.id}`,
        observed_at: '2026-11-02T13:00:00.000Z',
      },
    ];

    const mutRes = await query(`
      select public.s2s_apply_mutations(
        $1, $2, 0, $3::jsonb, false
      ) as result;
    `, [alice, deleteRequestId, JSON.stringify(deleteMutations)]);

    assert.equal(mutRes.rows[0].result.status, 'committed');
    assert.equal(mutRes.rows[0].result.acknowledged[0].status, 'deleted');

    // Verify public.user_items has ONLY Sense 2 remaining (Sense 1 was deleted)
    const remaining = await query(`
      select item_key, written_form, data->>'card_id' as card_id
        from public.user_items
       where user_id = $1 and language = 'ja' and kind = 'saved_words';
    `, [alice]);
    assert.equal(remaining.rows.length, 1, 'Only Sense 2 remains active');
    assert.equal(remaining.rows[0].card_id, kiro2.id, 'Remaining item is Sense 2');

    // Verify public.user_item_tombstones contains Sense 1 tombstone with sense_id
    const tombstones = await query(`
      select item_key, written_form, reading, sense_id
        from public.user_item_tombstones
       where user_id = $1;
    `, [alice]);
    assert.equal(tombstones.rows.length, 1, 'Tombstone created for Sense 1');
    assert.equal(tombstones.rows[0].sense_id, kiro1.id, 'Tombstone carries Sense 1 ID');

    // 3. Account Snapshot: s2s_account_snapshot emits Sense 2 in items and Sense 1 in tombstones
    const snapRes = await query('select public.s2s_account_snapshot($1) as result;', [alice]);
    const snap = snapRes.rows[0].result;
    assert.equal(snap.items.length, 1);
    assert.equal(snap.items[0].data.card_id, kiro2.id);
    assert.equal(snap.tombstones.length, 1);
    assert.equal(snap.tombstones[0].sense_id, kiro1.id);

    // 4. Client hydration reconciliation
    const localTables = {
      ja_saved_words: JSON.stringify([
        {
          id: 'local_1',
          phrase: 'キロ',
          reading: kiro1.reading,
          card_id: kiro1.id,
          definition: kiro1.meaning_english,
        },
        {
          id: 'local_2',
          phrase: 'キロ',
          reading: kiro2.reading,
          card_id: kiro2.id,
          definition: kiro2.meaning_english,
        },
      ]),
    };

    const hydrated = reconcileSnapshotWithLocal({
      localTables,
      snapshot: snap,
      syncState: { schemaVersion: 1, resetVersion: snap.reset_version, records: {} },
    });

    const parsedHydrated = JSON.parse(hydrated.reconciledTables.ja_saved_words);
    assert.equal(parsedHydrated.length, 1, 'Hydrated table contains only Sense 2');
    assert.equal(parsedHydrated[0].card_id, kiro2.id, 'Hydrated table preserved Sense 2');
  });
});

test('7. HSK1 Curriculum Publication Stability: Chinese pipeline unaffected by Japanese fields', async () => {
  const hsk1Items = [
    {
      id: 'zh-hsk1-test-001',
      course_id: 'zh-hsk1',
      language: 'zh',
      level_id: 'HSK1',
      written_form: '人',
      reading: 'rén',
      meaning_english: 'person; people',
      meaning_burmese: 'လူ',
      audio_path: 'audio/zh/hsk1/001.mp3',
      examples: [{ text: '他是中国人。', reading: 'Tā shì zhōngguó rén.', english: 'He is Chinese.', burmese: 'သူသည် တရုတ်လူမျိုးဖြစ်သည်။' }],
      sort_order: 1,
      is_active: true,
      // Note: kana, romaji, part_of_speech are omitted (standard for Chinese)
    },
  ];

  const stageRes = await stageContent({
    db,
    courseId: 'zh-hsk1',
    incomingItems: hsk1Items,
    rawBuffer: Buffer.from(JSON.stringify(hsk1Items)),
    operator: 'operator-alice',
  });
  assert.ok(stageRes.stage_id);

  const pubRes = await publishStagedContent({
    db,
    courseId: 'zh-hsk1',
    stageId: stageRes.stage_id,
    operator: 'operator-alice',
    reason: 'HSK1 smoke publication',
    backupDir: tempBackupDir,
  });
  assert.equal(pubRes.course_id, 'zh-hsk1');
  assert.equal(pubRes.inserted, 1);
  assert.equal(pubRes.version, 1);

  // Check stored Chinese item: kana, romaji, part_of_speech are null
  const zhRow = await query("select * from public.vocabulary where id = 'zh-hsk1-test-001';");
  assert.equal(zhRow.rows.length, 1);
  assert.equal(zhRow.rows[0].kana, null);
  assert.equal(zhRow.rows[0].romaji, null);
  assert.equal(zhRow.rows[0].part_of_speech, null);
});
