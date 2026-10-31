import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  SUPPORTED_COURSES,
  computeSha256,
  calculateContentDiff,
  isContentEqual,
  validateIdentityCompatibility,
  exportRecoverableBackup,
  fetchCourseStatus,
  stageContent,
  publishStagedContent,
  rollbackContent,
} from '../tools/content-csv/contentImportEngine.mjs';
import { runCli, parseCliArgs } from '../tools/content-csv/content-manager.mjs';

const db = new PGlite();
const alice = '11111111-1111-4111-8111-111111111111';
const TEST_BACKUP_DIR = path.resolve(process.cwd(), './test-temp-backups');

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

  await query('insert into auth.users (id, raw_user_meta_data) values ($1, $2)', [alice, { full_name: 'Alice Learner' }]);

  const baseMigration = await readFile(new URL('../supabase/migrations/20261027000100_backend_foundation.sql', import.meta.url), 'utf8');
  await db.exec(baseMigration);

  const guestImportMigration = await readFile(new URL('../supabase/migrations/20261028000100_guest_import_foundation.sql', import.meta.url), 'utf8');
  await db.exec(guestImportMigration);

  const contentMigration = await readFile(new URL('../supabase/migrations/20261030000100_content_publication_foundation.sql', import.meta.url), 'utf8');
  await db.exec(contentMigration);

  const hardeningMigration = await readFile(new URL('../supabase/migrations/20261030000200_content_publication_hardening.sql', import.meta.url), 'utf8');
  await db.exec(hardeningMigration);
});

after(async () => {
  try {
    await rm(TEST_BACKUP_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup error
  }
  await db.close();
});

test('1. Course scope restriction: only zh-hsk1 and ja-n5 permitted', async () => {
  assert.equal(SUPPORTED_COURSES.has('zh-hsk1'), true);
  assert.equal(SUPPORTED_COURSES.has('ja-n5'), true);
  assert.equal(SUPPORTED_COURSES.has('es-a1'), false);

  // Inserting unsupported course violates CHECK constraint
  await assert.rejects(
    async () => {
      await db.query(
        "insert into public.courses (id, language, level_id, title) values ('zh-hsk2', 'zh', 'HSK2', 'Chinese HSK 2')"
      );
    },
    /courses_supported_scope/
  );

  // Staging for unsupported course fails
  await assert.rejects(
    async () => {
      await stageContent({
        db,
        courseId: 'es-a1',
        incomingItems: [],
        rawBuffer: Buffer.from('test'),
      });
    },
    /Unsupported course 'es-a1'/
  );
});

test('2. RLS & authorization: public/anon/authenticated cannot see unpublished courses or modify content', async () => {
  // Initially zh-hsk1 is unpublished
  const anonCourses = await as('anon', null, async () => {
    const res = await query('select * from public.courses where id = $1', ['zh-hsk1']);
    return res.rows;
  });
  assert.equal(anonCourses.length, 0, 'Unpublished course must not be visible to anon');

  const authCourses = await as('authenticated', alice, async () => {
    const res = await query('select * from public.courses where id = $1', ['zh-hsk1']);
    return res.rows;
  });
  assert.equal(authCourses.length, 0, 'Unpublished course must not be visible to authenticated');

  // Anon cannot insert vocabulary
  await assert.rejects(
    async () => {
      await as('anon', null, async () => {
        await query(
          "insert into public.vocabulary (id, course_id, written_form) values ('v1', 'zh-hsk1', '中')"
        );
      });
    },
    /permission denied/
  );

  // Authenticated cannot execute staging RPC
  await assert.rejects(
    async () => {
      await as('authenticated', alice, async () => {
        await query(
          "select public.s2s_stage_course_content('zh-hsk1', $1, '[]'::jsonb)",
          ['a'.repeat(64)]
        );
      });
    },
    /permission denied/
  );

  // Authenticated cannot read private.content_stages
  await assert.rejects(
    async () => {
      await as('authenticated', alice, async () => {
        await query('select * from private.content_stages');
      });
    },
    /permission denied/
  );
});

test('3. Diff calculation and dry-run detection', async () => {
  const current = [
    {
      id: 'zh_001',
      course_id: 'zh-hsk1',
      written_form: '中',
      reading: 'zhōng',
      meaning_english: 'middle',
      meaning_burmese: 'အလယ်',
      audio_path: 'audio/001.mp3',
      examples: [],
      sort_order: 10,
      is_active: true,
    },
    {
      id: 'zh_002',
      course_id: 'zh-hsk1',
      written_form: '大',
      reading: 'dà',
      meaning_english: 'big',
      meaning_burmese: 'ကြီးသော',
      audio_path: null,
      examples: [],
      sort_order: 20,
      is_active: true,
    },
  ];

  const incoming = [
    // Unchanged item
    {
      id: 'zh_001',
      course_id: 'zh-hsk1',
      written_form: '中',
      reading: 'zhōng',
      meaning_english: 'middle',
      meaning_burmese: 'အလယ်',
      audio_path: 'audio/001.mp3',
      examples: [],
      sort_order: 10,
      is_active: true,
    },
    // Updated item (changed meaning and sort order)
    {
      id: 'zh_002',
      course_id: 'zh-hsk1',
      written_form: '大',
      reading: 'dà',
      meaning_english: 'large; big',
      meaning_burmese: 'ကြီးမားသော',
      audio_path: null,
      examples: [],
      sort_order: 25,
      is_active: true,
    },
    // Inserted item
    {
      id: 'zh_003',
      course_id: 'zh-hsk1',
      written_form: '小',
      reading: 'xiǎo',
      meaning_english: 'small',
      meaning_burmese: 'ငယ်သော',
      audio_path: null,
      examples: [],
      sort_order: 30,
      is_active: true,
    },
  ];

  const diff = calculateContentDiff({ currentItems: current, incomingItems: incoming });
  assert.equal(diff.counts.inserted, 1);
  assert.equal(diff.counts.updated, 1);
  assert.equal(diff.counts.unchanged, 1);
  assert.equal(diff.counts.retired, 0);

  // Test omission preserves items: omitting zh_002 without retiredIds does NOT retire it
  const diffOmitted = calculateContentDiff({
    currentItems: current,
    incomingItems: [incoming[0]],
  });
  assert.equal(diffOmitted.counts.retired, 0);
  assert.equal(diffOmitted.counts.omitted_preserved, 1);

  // Test explicit retirement detection: passing retiredIds retires zh_002
  const diffWithRetirement = calculateContentDiff({
    currentItems: current,
    incomingItems: [incoming[0]],
    retiredIds: ['zh_002'],
  });
  assert.equal(diffWithRetirement.counts.retired, 1);
  assert.equal(diffWithRetirement.retired[0].id, 'zh_002');
});

test('4. Natural identity change detection and rejection', async () => {
  const current = [
    {
      id: 'zh_001',
      course_id: 'zh-hsk1',
      written_form: '中',
      reading: 'zhōng',
      meaning_english: 'middle',
      meaning_burmese: 'အလယ်',
      audio_path: null,
      examples: [],
      sort_order: 10,
      is_active: true,
    },
  ];

  // Incoming changes both written_form and reading for same ID zh_001
  const ambiguousIncoming = [
    {
      id: 'zh_001',
      course_id: 'zh-hsk1',
      written_form: '人',
      reading: 'rén',
      meaning_english: 'person',
      meaning_burmese: 'လူ',
      audio_path: null,
      examples: [],
      sort_order: 10,
      is_active: true,
    },
  ];

  const compatibility = validateIdentityCompatibility({
    currentItems: current,
    incomingItems: ambiguousIncoming,
  });
  assert.equal(compatibility.valid, false);
  assert.equal(compatibility.ambiguousChanges.length, 1);
  assert.match(compatibility.errors[0], /NATURAL_IDENTITY_CHANGE/i);
});

test('5. Staging isolation: staging does not alter published content', async () => {
  const rawCsv = `id,course_id,language,level_id,written_form,reading,meaning_english,meaning_burmese,audio_path,examples_json,sort_order
zh_hsk1_001,zh-hsk1,zh,HSK1,中,zhōng,middle,အလယ်,,,10`;

  const items = [
    {
      id: 'zh_hsk1_001',
      course_id: 'zh-hsk1',
      language: 'zh',
      level_id: 'HSK1',
      written_form: '中',
      reading: 'zhōng',
      meaning_english: 'middle',
      meaning_burmese: 'အလယ်',
      audio_path: null,
      examples: [],
      sort_order: 10,
      is_active: true,
    },
  ];

  const stageResult = await stageContent({
    db,
    courseId: 'zh-hsk1',
    incomingItems: items,
    rawBuffer: Buffer.from(rawCsv, 'utf8'),
    operator: 'tester',
  });

  assert.ok(stageResult.stage_id);
  assert.equal(stageResult.status, 'staged');
  assert.equal(stageResult.item_count, 1);

  // Staging did NOT publish course
  const status = await fetchCourseStatus({ db, courseId: 'zh-hsk1' });
  assert.equal(status.is_published, false);
  assert.equal(status.active_count, 0);

  // Staging a second version supersedes first
  const stage2Result = await stageContent({
    db,
    courseId: 'zh-hsk1',
    incomingItems: items,
    rawBuffer: Buffer.from(rawCsv + '\n', 'utf8'),
    operator: 'tester',
  });

  const stages = await db.query(
    'select id, status from private.content_stages where course_id = $1 order by created_at desc',
    ['zh-hsk1']
  );
  assert.equal(stages.rows[0].id, stage2Result.stage_id);
  assert.equal(stages.rows[0].status, 'staged');
  assert.equal(stages.rows[1].id, stageResult.stage_id);
  assert.equal(stages.rows[1].status, 'superseded');
});

test('6. Recoverable backup fails closed and aborts before database mutation', async () => {
  // Passing an illegal backup directory (e.g. invalid chars or non-writable)
  const invalidDir = '\0invalid:dir';

  await assert.rejects(
    async () => {
      exportRecoverableBackup({
        courseId: 'zh-hsk1',
        version: 1,
        items: [{ id: '1' }],
        outDir: invalidDir,
      });
    },
    /RECOVERABLE_BACKUP_FAILED/
  );
});

test('7. Atomic publication & explicit retirement', async () => {
  // Stage two items
  const itemsV1 = [
    {
      id: 'zh_hsk1_001',
      course_id: 'zh-hsk1',
      language: 'zh',
      level_id: 'HSK1',
      written_form: '中',
      reading: 'zhōng',
      meaning_english: 'middle',
      meaning_burmese: 'အလယ်',
      audio_path: 'audio/zh/hsk1/001.mp3',
      examples: [{ text: '我是中国人。', reading: 'Wǒ shì zhōngguó rén.', english: 'I am Chinese.', burmese: 'ကျွန်တော် တရုတ်လူမျိုးပါ။' }],
      sort_order: 10,
      is_active: true,
    },
    {
      id: 'zh_hsk1_002',
      course_id: 'zh-hsk1',
      language: 'zh',
      level_id: 'HSK1',
      written_form: '大',
      reading: 'dà',
      meaning_english: 'big',
      meaning_burmese: 'ကြီးသော',
      audio_path: null,
      examples: [],
      sort_order: 20,
      is_active: true,
    },
  ];

  const stageV1 = await stageContent({
    db,
    courseId: 'zh-hsk1',
    incomingItems: itemsV1,
    rawBuffer: Buffer.from(JSON.stringify(itemsV1)),
    operator: 'tester',
  });

  const publishV1 = await publishStagedContent({
    db,
    courseId: 'zh-hsk1',
    stageId: stageV1.stage_id,
    operator: 'tester',
    reason: 'Initial v1 publication',
    backupDir: TEST_BACKUP_DIR,
  });

  assert.equal(publishV1.status, 'published');
  assert.equal(publishV1.inserted, 2);
  assert.equal(publishV1.total_active, 2);
  assert.equal(publishV1.version, 1);

  // Course is now published and readable by anon
  const anonVocab = await as('anon', null, async () => {
    const res = await query('select id, written_form, reading from public.vocabulary where course_id = $1', ['zh-hsk1']);
    return res.rows;
  });
  assert.equal(anonVocab.length, 2);

  // First verify omission preserves items: publish v2 omitting zh_hsk1_002 without retiredIds
  const itemsV2 = [
    {
      id: 'zh_hsk1_001',
      course_id: 'zh-hsk1',
      language: 'zh',
      level_id: 'HSK1',
      written_form: '中',
      reading: 'zhōng',
      meaning_english: 'center; middle; China',
      meaning_burmese: 'အလယ်ဗဟို',
      audio_path: 'audio/zh/hsk1/001.mp3',
      examples: [],
      sort_order: 10,
      is_active: true,
    },
    {
      id: 'zh_hsk1_003',
      course_id: 'zh-hsk1',
      language: 'zh',
      level_id: 'HSK1',
      written_form: '小',
      reading: 'xiǎo',
      meaning_english: 'small',
      meaning_burmese: 'ငယ်သော',
      audio_path: null,
      examples: [],
      sort_order: 30,
      is_active: true,
    },
  ];

  const stageV2Preserve = await stageContent({
    db,
    courseId: 'zh-hsk1',
    incomingItems: itemsV2,
    rawBuffer: Buffer.from(JSON.stringify(itemsV2)),
    operator: 'tester',
  });

  const publishV2Preserve = await publishStagedContent({
    db,
    courseId: 'zh-hsk1',
    stageId: stageV2Preserve.stage_id,
    operator: 'tester',
    reason: 'Version 2 with preserved omitted item',
    backupDir: TEST_BACKUP_DIR,
  });

  assert.equal(publishV2Preserve.version, 2);
  assert.equal(publishV2Preserve.inserted, 1); // zh_hsk1_003
  assert.equal(publishV2Preserve.updated, 1);  // zh_hsk1_001
  assert.equal(publishV2Preserve.retired, 0, 'Omitted item must NOT be retired without explicit intent');
  assert.equal(publishV2Preserve.total_active, 3, 'All 3 items must be active');

  // zh_hsk1_002 was omitted but remains active!
  const preservedRow = await query('select id, is_active from public.vocabulary where id = $1', ['zh_hsk1_002']);
  assert.equal(preservedRow.rows[0].is_active, true);

  // Now publish v3 with explicit retirement of zh_hsk1_002 via retiredIds
  const stageV3 = await stageContent({
    db,
    courseId: 'zh-hsk1',
    incomingItems: itemsV2,
    rawBuffer: Buffer.from(JSON.stringify(itemsV2) + 'v3'),
    operator: 'tester',
    retiredIds: ['zh_hsk1_002'],
  });

  const publishV3 = await publishStagedContent({
    db,
    courseId: 'zh-hsk1',
    stageId: stageV3.stage_id,
    operator: 'tester',
    reason: 'Version 3 with explicitly retired item',
    backupDir: TEST_BACKUP_DIR,
  });

  assert.equal(publishV3.version, 3);
  assert.equal(publishV3.retired, 1);  // zh_hsk1_002 explicitly retired
  assert.equal(publishV3.total_active, 2);

  // Backup of v2 was created before v3 was applied
  assert.ok(publishV3.backup?.backupPath);

  // zh_hsk1_002 is now in the database with is_active = false
  const retiredRow = await query('select id, is_active from public.vocabulary where id = $1', ['zh_hsk1_002']);
  assert.equal(retiredRow.rows[0].is_active, false);

  // Retired row is STILL readable by anon for learning history!
  const anonVocabV2 = await as('anon', null, async () => {
    const res = await query('select id, is_active from public.vocabulary where id = $1', ['zh_hsk1_002']);
    return res.rows;
  });
  assert.equal(anonVocabV2.length, 1);
  assert.equal(anonVocabV2[0].is_active, false);
});

test('8. Content rollback to prior version', async () => {
  // Course is at version 3. Rollback to version 1.
  const rollbackResult = await rollbackContent({
    db,
    courseId: 'zh-hsk1',
    targetVersion: 1,
    operator: 'tester',
    reason: 'Rolling back to v1',
    backupDir: TEST_BACKUP_DIR,
  });

  assert.equal(rollbackResult.status, 'rolled_back');
  assert.equal(rollbackResult.version, 1);

  // Check database state after rollback
  const status = await fetchCourseStatus({ db, courseId: 'zh-hsk1' });
  assert.equal(status.content_version, 1);

  // zh_hsk1_002 is reactivated, zh_hsk1_003 is deactivated
  const row002 = await query('select is_active from public.vocabulary where id = $1', ['zh_hsk1_002']);
  assert.equal(row002.rows[0].is_active, true);

  const row003 = await query('select is_active from public.vocabulary where id = $1', ['zh_hsk1_003']);
  assert.equal(row003.rows[0].is_active, false);

  // Rollback to non-existent version fails
  await assert.rejects(
    async () => {
      await rollbackContent({
        db,
        courseId: 'zh-hsk1',
        targetVersion: 99,
        backupDir: TEST_BACKUP_DIR,
      });
    },
    /VERSION_NOT_FOUND/
  );
});

test('9. Learner progress preservation: learner records in user_items are decoupled and untouched', async () => {
  const learnerKey = computeSha256('zh:saved_words:中:zhōng');

  // Insert learner record into user_items
  await query(
    `insert into public.user_items (
      user_id, item_key, language, kind, written_form, reading, data, observed_at, revision
    ) values ($1, $2, 'zh', 'saved_words', '中', 'zhōng', '{}'::jsonb, now(), 1)`,
    [alice, learnerKey]
  );

  // Verify learner record exists
  const initialLearnerRecord = await query('select * from public.user_items where user_id = $1 and item_key = $2', [
    alice,
    learnerKey,
  ]);
  assert.equal(initialLearnerRecord.rows.length, 1);

  // Perform content update on zh_hsk1_001
  const updateItems = [
    {
      id: 'zh_hsk1_001',
      course_id: 'zh-hsk1',
      language: 'zh',
      level_id: 'HSK1',
      written_form: '中',
      reading: 'zhōng',
      meaning_english: 'Updated middle definition',
      meaning_burmese: 'အလယ်',
      audio_path: null,
      examples: [],
      sort_order: 10,
      is_active: true,
    },
  ];

  const updateStage = await stageContent({
    db,
    courseId: 'zh-hsk1',
    incomingItems: updateItems,
    rawBuffer: Buffer.from(JSON.stringify(updateItems)),
  });

  await publishStagedContent({
    db,
    courseId: 'zh-hsk1',
    stageId: updateStage.stage_id,
    backupDir: TEST_BACKUP_DIR,
  });

  // Rollback content
  await rollbackContent({
    db,
    courseId: 'zh-hsk1',
    targetVersion: 1,
    backupDir: TEST_BACKUP_DIR,
  });

  // Learner record is 100% UNTOUCHED
  const postLearnerRecord = await query('select * from public.user_items where user_id = $1 and item_key = $2', [
    alice,
    learnerKey,
  ]);
  assert.equal(postLearnerRecord.rows.length, 1);
  assert.equal(postLearnerRecord.rows[0].written_form, '中');
  assert.equal(Number(postLearnerRecord.rows[0].revision), 1);
});

test('10. Operator CLI flags and write protection', async () => {
  // Test dry-run with valid fixture
  const fixturePath = path.resolve(process.cwd(), 'tools/content-csv/fixtures/valid-ja-n5.csv');
  const dryRunReport = await new Promise((resolve) => {
    let captured = '';
    const mockOut = {
      write: (str) => {
        captured += str;
        return true;
      },
      once: () => {},
    };
    // Intercept stdout
    const origWrite = process.stdout.write;
    process.stdout.write = mockOut.write;
    runCli(['dry-run', fixturePath], { dbClient: db })
      .finally(() => {
        process.stdout.write = origWrite;
        try {
          resolve(JSON.parse(captured));
        } catch {
          resolve(null);
        }
      });
  });

  assert.ok(dryRunReport);
  assert.equal(dryRunReport.action, 'dry-run');
  assert.equal(dryRunReport.valid, true);
  assert.equal(dryRunReport.course_id, 'ja-n5');
  assert.equal(dryRunReport.database_modified, false);
});

test('11. Cross-course ID conflict rejected at staging and publication', async () => {
  // zh_hsk1_001 exists in zh-hsk1. Try staging it under ja-n5.
  const crossCourseItem = [
    {
      id: 'zh_hsk1_001',
      course_id: 'ja-n5',
      language: 'ja',
      level_id: 'N5',
      written_form: '中',
      reading: 'なか',
      meaning_english: 'middle',
      meaning_burmese: 'အလယ်',
      audio_path: null,
      examples: [],
      sort_order: 1,
      is_active: true,
    },
  ];

  // Engine validation rejects
  const validation = validateIdentityCompatibility({
    currentItems: [{ id: 'zh_hsk1_001', course_id: 'zh-hsk1', written_form: '中', reading: 'zhōng' }],
    incomingItems: crossCourseItem,
  });
  assert.equal(validation.valid, false);
  assert.match(validation.errors[0], /CROSS_COURSE_ID_CONFLICT/i);

  // Staging RPC rejects
  await assert.rejects(
    async () => {
      await stageContent({
        db,
        courseId: 'ja-n5',
        incomingItems: crossCourseItem,
        rawBuffer: Buffer.from(JSON.stringify(crossCourseItem)),
      });
    },
    /CROSS_COURSE_ID_CONFLICT/i
  );
});

test('12. Natural identity modification (written_form or reading) rejected', async () => {
  // Try changing only written_form
  const changedWritten = [
    {
      id: 'zh_hsk1_001',
      course_id: 'zh-hsk1',
      language: 'zh',
      level_id: 'HSK1',
      written_form: '中心',
      reading: 'zhōng',
      meaning_english: 'center',
      meaning_burmese: 'အလယ်',
      audio_path: null,
      examples: [],
      sort_order: 10,
      is_active: true,
    },
  ];

  await assert.rejects(
    async () => {
      await stageContent({
        db,
        courseId: 'zh-hsk1',
        incomingItems: changedWritten,
        rawBuffer: Buffer.from(JSON.stringify(changedWritten)),
      });
    },
    /NATURAL_IDENTITY_CHANGE/i
  );

  // Try changing only reading
  const changedReading = [
    {
      id: 'zh_hsk1_001',
      course_id: 'zh-hsk1',
      language: 'zh',
      level_id: 'HSK1',
      written_form: '中',
      reading: 'zhòng',
      meaning_english: 'hit',
      meaning_burmese: 'ထိမှန်',
      audio_path: null,
      examples: [],
      sort_order: 10,
      is_active: true,
    },
  ];

  await assert.rejects(
    async () => {
      await stageContent({
        db,
        courseId: 'zh-hsk1',
        incomingItems: changedReading,
        rawBuffer: Buffer.from(JSON.stringify(changedReading)),
      });
    },
    /NATURAL_IDENTITY_CHANGE/i
  );
});

test('13. Stale stage version rejected at publication', async () => {
  const currentStatus = await fetchCourseStatus({ db, courseId: 'zh-hsk1' });
  const currentVer = currentStatus.content_version;

  // Stage content with current version
  const validItems = [
    {
      id: 'zh_hsk1_001',
      course_id: 'zh-hsk1',
      language: 'zh',
      level_id: 'HSK1',
      written_form: '中',
      reading: 'zhōng',
      meaning_english: 'middle',
      meaning_burmese: 'အလယ်',
      audio_path: null,
      examples: [],
      sort_order: 10,
      is_active: true,
    },
  ];

  const stage = await stageContent({
    db,
    courseId: 'zh-hsk1',
    incomingItems: validItems,
    rawBuffer: Buffer.from(JSON.stringify(validItems)),
  });

  // Advance course version behind the scenes
  await query('update public.courses set content_version = $1 where id = $2', [currentVer + 5, 'zh-hsk1']);

  // Publishing stale stage fails closed
  await assert.rejects(
    async () => {
      await publishStagedContent({
        db,
        courseId: 'zh-hsk1',
        stageId: stage.stage_id,
        backupDir: TEST_BACKUP_DIR,
      });
    },
    /STALE_STAGE_VERSION/i
  );

  // Restore course version
  await query('update public.courses set content_version = $1 where id = $2', [currentVer, 'zh-hsk1']);
});

test('14. CLI argument parsing safety: extra positional args, invalid target, and retire-ids', () => {
  // Test extra positional argument
  assert.throws(
    () => parseCliArgs(['dry-run', 'some/path.csv', 'extra_argument']),
    /Unexpected extra argument 'extra_argument'/
  );

  // Test invalid target
  assert.throws(
    () => parseCliArgs(['stage', 'some/path.csv', '--target', 'bogus-target']),
    /Invalid target 'bogus-target'/
  );

  // Test valid target
  const validTargetFlags = parseCliArgs(['stage', 'some/path.csv', '--target', 'staging']);
  assert.equal(validTargetFlags.target, 'staging');

  // Test --retire-ids parsing
  const retireFlags = parseCliArgs(['stage', 'some/path.csv', '--target', 'local', '--retire-ids', 'zh_001,zh_002']);
  assert.deepEqual(retireFlags.retireIds, ['zh_001', 'zh_002']);

  // Test --retire shorthand
  const retireShortFlags = parseCliArgs(['dry-run', 'some/path.csv', '--retire', 'zh_003']);
  assert.deepEqual(retireShortFlags.retireIds, ['zh_003']);
});

test('15. Production comparator: example property order insensitivity, value change detection, and array order sensitivity', () => {
  const current = {
    id: 'zh_001',
    course_id: 'zh-hsk1',
    written_form: '中',
    reading: 'zhōng',
    meaning_english: 'middle',
    meaning_burmese: 'အလယ်',
    audio_path: 'audio/001.mp3',
    examples: [
      {
        text: '我是中国人。',
        reading: 'Wǒ shì Zhōngguó rén.',
        english: 'I am Chinese.',
        burmese: 'ကျွန်တော်/မ တရုတ်လူမျိုးပါ။',
      },
      {
        text: '中文字很有意思。',
        reading: 'Zhōngwén zì hěn yǒu yìsi.',
        english: 'Chinese characters are interesting.',
        burmese: 'တရုတ်စာလုံးတွေက စိတ်ဝင်စားဖို့ကောင်းတယ်။',
      },
    ],
    sort_order: 10,
    is_active: true,
  };

  // 1. Reordered object properties remain unchanged
  const incomingReorderedProperties = {
    ...current,
    examples: [
      // Keys in completely reversed / mixed order compared to current
      {
        burmese: 'ကျွန်တော်/မ တရုတ်လူမျိုးပါ။',
        english: 'I am Chinese.',
        reading: 'Wǒ shì Zhōngguó rén.',
        text: '我是中国人。',
      },
      {
        reading: 'Zhōngwén zì hěn yǒu yìsi.',
        text: '中文字很有意思。',
        burmese: 'တရုတ်စာလုံးတွေက စိတ်ဝင်စားဖို့ကောင်းတယ်။',
        english: 'Chinese characters are interesting.',
      },
    ],
  };

  assert.equal(
    isContentEqual(current, incomingReorderedProperties),
    true,
    'Equivalent example objects with different property insertion order must be equal'
  );

  const diffReordered = calculateContentDiff({
    currentItems: [current],
    incomingItems: [incomingReorderedProperties],
  });
  assert.equal(diffReordered.counts.unchanged, 1);
  assert.equal(diffReordered.counts.updated, 0);

  // 2. Changed example text is detected
  const incomingChangedText = {
    ...current,
    examples: [
      {
        ...current.examples[0],
        text: '我不是中国人。',
      },
      current.examples[1],
    ],
  };

  assert.equal(
    isContentEqual(current, incomingChangedText),
    false,
    'Modified example text must be detected as different'
  );

  const diffChangedText = calculateContentDiff({
    currentItems: [current],
    incomingItems: [incomingChangedText],
  });
  assert.equal(diffChangedText.counts.unchanged, 0);
  assert.equal(diffChangedText.counts.updated, 1);

  // Changed example translation (English or Burmese) is detected
  const incomingChangedEnglish = {
    ...current,
    examples: [
      {
        ...current.examples[0],
        english: 'I am a Chinese citizen.',
      },
      current.examples[1],
    ],
  };

  assert.equal(
    isContentEqual(current, incomingChangedEnglish),
    false,
    'Modified English translation must be detected as different'
  );

  const diffChangedEnglish = calculateContentDiff({
    currentItems: [current],
    incomingItems: [incomingChangedEnglish],
  });
  assert.equal(diffChangedEnglish.counts.unchanged, 0);
  assert.equal(diffChangedEnglish.counts.updated, 1);

  const incomingChangedBurmese = {
    ...current,
    examples: [
      current.examples[0],
      {
        ...current.examples[1],
        burmese: 'တရုတ်စာလုံးတွေက အရမ်း စိတ်ဝင်စားဖို့ကောင်းတယ်။',
      },
    ],
  };

  assert.equal(
    isContentEqual(current, incomingChangedBurmese),
    false,
    'Modified Burmese translation must be detected as different'
  );

  const diffChangedBurmese = calculateContentDiff({
    currentItems: [current],
    incomingItems: [incomingChangedBurmese],
  });
  assert.equal(diffChangedBurmese.counts.unchanged, 0);
  assert.equal(diffChangedBurmese.counts.updated, 1);

  // 3. Changed example array order is detected
  const incomingReorderedArray = {
    ...current,
    examples: [
      // Swapped array order: example 2 is now first, example 1 is second
      // Keep individual object properties reordered to ensure array order check is independent
      {
        burmese: 'တရုတ်စာလုံးတွေက စိတ်ဝင်စားဖို့ကောင်းတယ်။',
        english: 'Chinese characters are interesting.',
        reading: 'Zhōngwén zì hěn yǒu yìsi.',
        text: '中文字很有意思。',
      },
      {
        burmese: 'ကျွန်တော်/မ တရုတ်လူမျိုးပါ။',
        english: 'I am Chinese.',
        reading: 'Wǒ shì Zhōngguó rén.',
        text: '我是中国人。',
      },
    ],
  };

  assert.equal(
    isContentEqual(current, incomingReorderedArray),
    false,
    'Changed example array order must be detected as different'
  );

  const diffReorderedArray = calculateContentDiff({
    currentItems: [current],
    incomingItems: [incomingReorderedArray],
  });
  assert.equal(diffReorderedArray.counts.unchanged, 0);
  assert.equal(diffReorderedArray.counts.updated, 1);
});
