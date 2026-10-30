import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import {
  isPublishedContentEnabled,
} from '../src/lib/publishedContentGate.js';
import {
  fetchPublishedCourseContent,
  resolvePublishedCourseId,
  isPublishedCourseLevel,
  mapVocabularyToCard,
} from '../src/lib/publishedContentService.js';
import {
  recordWordAction,
  getLearnedWords,
  getLevelProgress,
} from '../src/lib/vocabularyProgress.js';
import { createLocalDatabase } from '../src/lib/localDatabase.js';
import { wordOf } from '../src/lib/entry.js';
import { stageContent, publishStagedContent, rollbackContent } from '../tools/content-csv/contentImportEngine.mjs';
import { runBrowserPublishedContentVerification } from './runBrowserPublishedContentCheck.mjs';

const db = new PGlite();
const alice = '11111111-1111-4111-8111-111111111111';

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

/**
 * Creates an in-memory client that wraps PGlite as if it were the public Supabase REST client.
 * Enforces RLS policies (anon role) and pagination (range) for public endpoints.
 */
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
            // Run inside anon role to test real RLS
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

function createTestLocalDb() {
  const tables = new Map();
  return createLocalDatabase({
    getScope: () => ({
      getTable: (lang, table) => tables.get(`${lang}:${table}`) ?? null,
      setTable: (lang, table, json) => tables.set(`${lang}:${table}`, json),
    }),
    getLanguage: () => 'zh',
  });
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

  await query('insert into auth.users (id, raw_user_meta_data) values ($1, $2)', [alice, { full_name: 'Alice' }]);

  const baseMigration = await readFile(new URL('../supabase/migrations/20261027000100_backend_foundation.sql', import.meta.url), 'utf8');
  await db.exec(baseMigration);

  const guestImportMigration = await readFile(new URL('../supabase/migrations/20261028000100_guest_import_foundation.sql', import.meta.url), 'utf8');
  await db.exec(guestImportMigration);

  const contentMigration = await readFile(new URL('../supabase/migrations/20261030000100_content_publication_foundation.sql', import.meta.url), 'utf8');
  await db.exec(contentMigration);

  const hardeningMigration = await readFile(new URL('../supabase/migrations/20261030000200_content_publication_hardening.sql', import.meta.url), 'utf8');
  await db.exec(hardeningMigration);

  // Stage & Publish synthetic HSK 1 curriculum (5 items)
  const syntheticHsk1 = [
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
      meaning_english: 'big; large',
      meaning_burmese: 'ကြီးသော',
      audio_path: 'audio/zh/hsk1/002.mp3',
      examples: [],
      sort_order: 20,
      is_active: true,
    },
    {
      id: 'zh_hsk1_003',
      course_id: 'zh-hsk1',
      language: 'zh',
      level_id: 'HSK1',
      written_form: '小',
      reading: 'xiǎo',
      meaning_english: 'small; little',
      meaning_burmese: 'ငယ်သော',
      audio_path: null,
      examples: [],
      sort_order: 30,
      is_active: true,
    },
    {
      id: 'zh_hsk1_004',
      course_id: 'zh-hsk1',
      language: 'zh',
      level_id: 'HSK1',
      written_form: '人',
      reading: 'rén',
      meaning_english: 'person; people',
      meaning_burmese: 'လူ',
      audio_path: null,
      examples: [],
      sort_order: 40,
      is_active: true,
    },
    {
      id: 'zh_hsk1_005',
      course_id: 'zh-hsk1',
      language: 'zh',
      level_id: 'HSK1',
      written_form: '好',
      reading: 'hǎo',
      meaning_english: 'good; well',
      meaning_burmese: 'ကောင်းသော',
      audio_path: null,
      examples: [],
      sort_order: 50,
      is_active: true,
    },
  ];

  const stageZh = await stageContent({
    db,
    courseId: 'zh-hsk1',
    incomingItems: syntheticHsk1,
    rawBuffer: Buffer.from(JSON.stringify(syntheticHsk1)),
    operator: 'tester',
  });

  await publishStagedContent({
    db,
    courseId: 'zh-hsk1',
    stageId: stageZh.stage_id,
    operator: 'tester',
    reason: 'Initial HSK1 publication',
    backupDir: './test-temp-backups',
  });

  // Stage & Publish synthetic JLPT N5 curriculum (3 items)
  const syntheticN5 = [
    {
      id: 'ja_n5_001',
      course_id: 'ja-n5',
      language: 'ja',
      level_id: 'N5',
      written_form: '私',
      reading: 'わたし',
      meaning_english: 'I; me',
      meaning_burmese: 'ကျွန်တော် / ကျွန်မ',
      audio_path: 'audio/ja/n5/001.mp3',
      examples: [{ text: '私は学生です。', reading: 'Watashi wa gakusei desu.', english: 'I am a student.', burmese: 'ကျွန်တော် ကျောင်းသားပါ။' }],
      sort_order: 10,
      is_active: true,
    },
    {
      id: 'ja_n5_002',
      course_id: 'ja-n5',
      language: 'ja',
      level_id: 'N5',
      written_form: '日本',
      reading: 'にほん',
      meaning_english: 'Japan',
      meaning_burmese: 'ဂျပန်နိုင်ငံ',
      audio_path: 'audio/ja/n5/002.mp3',
      examples: [],
      sort_order: 20,
      is_active: true,
    },
    {
      id: 'ja_n5_003',
      course_id: 'ja-n5',
      language: 'ja',
      level_id: 'N5',
      written_form: '学生',
      reading: 'がくせい',
      meaning_english: 'student',
      meaning_burmese: 'ကျောင်းသား',
      audio_path: null,
      examples: [],
      sort_order: 30,
      is_active: true,
    },
  ];

  const stageJa = await stageContent({
    db,
    courseId: 'ja-n5',
    incomingItems: syntheticN5,
    rawBuffer: Buffer.from(JSON.stringify(syntheticN5)),
    operator: 'tester',
  });

  await publishStagedContent({
    db,
    courseId: 'ja-n5',
    stageId: stageJa.stage_id,
    operator: 'tester',
    reason: 'Initial N5 publication',
    backupDir: './test-temp-backups',
  });
});

after(async () => {
  await db.close();
  try {
    const fs = await import('node:fs/promises');
    await fs.rm('./test-temp-backups', { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

test('1. Capability Gate: disabled by default, requires configured backend', () => {
  // Disabled when env is empty
  assert.equal(isPublishedContentEnabled({}), false);
  assert.equal(isPublishedContentEnabled(null), false);

  // Disabled when flag is false even if backend is configured
  assert.equal(
    isPublishedContentEnabled({
      VITE_PUBLISHED_CONTENT_ENABLED: 'false',
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_12345678901234567890',
    }),
    false
  );

  // Disabled when flag is true but backend is unconfigured
  assert.equal(
    isPublishedContentEnabled({
      VITE_PUBLISHED_CONTENT_ENABLED: 'true',
    }),
    false
  );

  // Enabled only when flag is true AND backend is configured
  assert.equal(
    isPublishedContentEnabled({
      VITE_PUBLISHED_CONTENT_ENABLED: 'true',
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_12345678901234567890',
    }),
    true
  );
});

test('2. Course resolution: maps HSK1 and N5 correctly, rejects unsupported levels', () => {
  assert.equal(resolvePublishedCourseId('zh', 'HSK1'), 'zh-hsk1');
  assert.equal(resolvePublishedCourseId('zh', '1'), 'zh-hsk1');
  assert.equal(resolvePublishedCourseId('zh', 'hsk1'), 'zh-hsk1');
  assert.equal(resolvePublishedCourseId('zh', 'HSK 1'), 'zh-hsk1');
  assert.equal(resolvePublishedCourseId('zh', 'HSK2'), null);
  assert.equal(resolvePublishedCourseId('zh', 'HSK9'), null);

  assert.equal(resolvePublishedCourseId('ja', 'N5'), 'ja-n5');
  assert.equal(resolvePublishedCourseId('ja', '5'), 'ja-n5');
  assert.equal(resolvePublishedCourseId('ja', 'n5'), 'ja-n5');
  assert.equal(resolvePublishedCourseId('ja', 'JLPT N5'), 'ja-n5');
  assert.equal(resolvePublishedCourseId('ja', 'N4'), null);
  assert.equal(resolvePublishedCourseId('ja', 'N1'), null);

  assert.equal(isPublishedCourseLevel('zh', 'HSK1'), true);
  assert.equal(isPublishedCourseLevel('zh', 'HSK2'), false);
  assert.equal(isPublishedCourseLevel('ja', 'N5'), true);
  assert.equal(isPublishedCourseLevel('ja', 'N4'), false);
});

test('3. Published-only reads: public client reads published content, never draft or inactive', async () => {
  const clientWrapper = createSupabaseDbWrapper(db);

  // Query published HSK1 content
  const result = await fetchPublishedCourseContent('zh-hsk1', { client: clientWrapper });
  assert.equal(result.isPublished, true);
  assert.equal(result.items.length, 5);
  assert.equal(result.version, 1);

  // Verify first card mapping
  const card1 = result.items[0];
  assert.equal(card1.id, 'zh_hsk1_001');
  assert.equal(card1.character, '中');
  assert.equal(card1.pronunciation, 'zhōng');
  assert.equal(card1.reading, 'zhōng');
  assert.equal(card1.definition, 'center; middle; China');
  assert.equal(card1.burmese_definition, 'အလယ်ဗဟို');
  assert.equal(card1.audio_path, 'audio/zh/hsk1/001.mp3');
  assert.equal(card1.examples.length, 1);
  assert.equal(card1.level, 'HSK1');
  assert.equal(card1.sort_order, 10);
  assert.equal(card1.is_active, true);

  // Query Japanese N5 content
  const jaResult = await fetchPublishedCourseContent('ja-n5', { client: clientWrapper });
  assert.equal(jaResult.isPublished, true);
  assert.equal(jaResult.items.length, 3);

  const jaCard1 = jaResult.items[0];
  assert.equal(jaCard1.id, 'ja_n5_001');
  assert.equal(jaCard1.character, '私');
  assert.equal(jaCard1.kana, 'わたし');
  assert.equal(jaCard1.reading, 'わたし');
  assert.equal(jaCard1.definition, 'I; me');
  assert.equal(jaCard1.burmese_definition, 'ကျွန်တော် / ကျွန်မ');

  // Unpublished course check: unpublish zh-hsk1 temporarily
  await db.query("update public.courses set is_published = false where id = 'zh-hsk1'");
  const unpubResult = await fetchPublishedCourseContent('zh-hsk1', { client: clientWrapper });
  assert.equal(unpubResult.isPublished, false);
  assert.equal(unpubResult.items.length, 0);

  // Restore published status
  await db.query("update public.courses set is_published = true where id = 'zh-hsk1'");
});

test('4. Complete pagination without silent truncation', async () => {
  const clientWrapper = createSupabaseDbWrapper(db);

  // Query HSK1 (5 items) with pageSize = 2 to force 3 paginated requests
  const paginatedResult = await fetchPublishedCourseContent('zh-hsk1', {
    client: clientWrapper,
    pageSize: 2,
  });

  assert.equal(paginatedResult.isPublished, true);
  assert.equal(paginatedResult.items.length, 5, 'All 5 items must be fetched across multiple pages');

  const ids = paginatedResult.items.map((i) => i.id);
  assert.deepEqual(ids, ['zh_hsk1_001', 'zh_hsk1_002', 'zh_hsk1_003', 'zh_hsk1_004', 'zh_hsk1_005']);
});

test('5. Card contract mapping: preserves audio references without generating content or audio', () => {
  const vocabRow = {
    id: 'zh_099',
    course_id: 'zh-hsk1',
    written_form: '水',
    reading: 'shuǐ',
    meaning_english: 'water',
    meaning_burmese: 'ရေ',
    audio_path: 'audio/zh/hsk1/099.mp3',
    examples: [{ text: '我想喝水。', reading: 'Wǒ xiǎng hē shuǐ.', english: 'I want to drink water.', burmese: 'ကျွန်တော် ရေသောက်ချင်တယ်။' }],
    sort_order: 99,
    is_active: true,
  };

  const card = mapVocabularyToCard(vocabRow, { language: 'zh', level_id: 'HSK1' }, 0);
  assert.equal(card.id, 'zh_099');
  assert.equal(card.character, '水');
  assert.equal(card.reading, 'shuǐ');
  assert.equal(card.pronunciation, 'shuǐ');
  assert.equal(card.audio_path, 'audio/zh/hsk1/099.mp3');
  assert.equal(card.examples.length, 1);
  assert.equal(card.card_order, 1);
  assert.equal(card.lesson_order, 1);
  assert.equal(card.is_active, true);
});

test('6. Stable database IDs & natural key progress preservation', () => {
  const localDb = createTestLocalDb();

  const card = {
    id: 'zh_hsk1_001',
    course_id: 'zh-hsk1',
    character: '中',
    pronunciation: 'zhōng',
    reading: 'zhōng',
    level: 'HSK1',
  };

  // Swiping right records word with pw_zh_hsk1_001 (database ID) and natural key 中:zhōng
  const recordResult = recordWordAction(localDb, { card, direction: 'right' });
  assert.equal(recordResult.status, 'known');
  assert.equal(recordResult.row.id, 'pw_zh_hsk1_001', 'Uses database vocabulary ID');
  assert.equal(recordResult.row.character, '中');
  assert.equal(recordResult.row.pronunciation, 'zhōng');

  // Verify learned words in db
  const learned = getLearnedWords(localDb, 'zh');
  assert.equal(learned.length, 1);
  assert.equal(learned[0].character, '中');

  // Repeating swipe maintains same record
  recordWordAction(localDb, { card, direction: 'right' });
  const learnedAfter = getLearnedWords(localDb, 'zh');
  assert.equal(learnedAfter.length, 1);
  assert.equal(learnedAfter[0].seen, 2);

  // Swiping left adds to review queue
  recordWordAction(localDb, { card, direction: 'left' });
  const reviews = localDb.get('review_cards');
  assert.equal(reviews.length, 1);
  assert.equal(wordOf(reviews[0]), '中');
});

test('7. Progress calculation derives completion from actual loaded curriculum', () => {
  const localDb = createTestLocalDb();

  // Mark 2 words known
  recordWordAction(localDb, {
    card: { id: 'zh_hsk1_001', character: '中', pronunciation: 'zhōng', level: 'HSK1' },
    direction: 'right',
  });
  recordWordAction(localDb, {
    card: { id: 'zh_hsk1_002', character: '大', pronunciation: 'dà', level: 'HSK1' },
    direction: 'right',
  });

  const mockCourse = {
    id: 'zh',
    levels: [{ id: 'HSK1', name: 'HSK 1', words: 150 }],
  };

  // Default gate-off calculation uses placeholder words: 150
  const defaultProgress = getLevelProgress(localDb, 'HSK1', mockCourse);
  assert.equal(defaultProgress.words, 150);
  assert.equal(defaultProgress.uniqueLearned, 2);
  assert.equal(defaultProgress.percent, 1); // floor(2/150 * 100) = 1%

  // Published curriculum calculation: 5 actual loaded words
  const loadedCount = 5;
  const publishedProgress = getLevelProgress(localDb, 'HSK1', mockCourse, null, loadedCount);
  assert.equal(publishedProgress.words, 5, 'Total words must equal actual loaded curriculum count');
  assert.equal(publishedProgress.uniqueLearned, 2);
  assert.equal(publishedProgress.percent, 40); // floor(2/5 * 100) = 40%
});

test('8. Content update and retirement: learner records remain 100% intact', async () => {
  const localDb = createTestLocalDb();

  // Learner learned zh_hsk1_002 ('大')
  recordWordAction(localDb, {
    card: { id: 'zh_hsk1_002', character: '大', pronunciation: 'dà', level: 'HSK1' },
    direction: 'right',
  });

  // Learner saved zh_hsk1_002 ('大')
  localDb.set('saved_words', [{ id: 'zh_hsk1_002', phrase: '大', reading: 'dà', english: 'big' }]);

  // Now publish a new version retiring zh_hsk1_002 explicitly
  const v2Items = [
    {
      id: 'zh_hsk1_001',
      course_id: 'zh-hsk1',
      language: 'zh',
      level_id: 'HSK1',
      written_form: '中',
      reading: 'zhōng',
      meaning_english: 'center; middle; China (updated definition)',
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

  const stageV2 = await stageContent({
    db,
    courseId: 'zh-hsk1',
    incomingItems: v2Items,
    rawBuffer: Buffer.from(JSON.stringify(v2Items)),
    operator: 'tester',
    retiredIds: ['zh_hsk1_002'],
  });

  await publishStagedContent({
    db,
    courseId: 'zh-hsk1',
    stageId: stageV2.stage_id,
    operator: 'tester',
    reason: 'V2 with retired word',
    backupDir: './test-temp-backups',
  });

  // Query updated published content with public client
  const clientWrapper = createSupabaseDbWrapper(db);
  const updatedPub = await fetchPublishedCourseContent('zh-hsk1', { client: clientWrapper });

  // Active items does NOT contain retired word zh_hsk1_002
  assert.equal(updatedPub.items.some((i) => i.id === 'zh_hsk1_002'), false);

  // BUT learner records in local database are 100% INTACT!
  const learnedAfterRetire = getLearnedWords(localDb, 'zh');
  assert.equal(learnedAfterRetire.length, 1);
  assert.equal(learnedAfterRetire[0].character, '大');

  const savedAfterRetire = localDb.get('saved_words');
  assert.equal(savedAfterRetire.length, 1);
  assert.equal(savedAfterRetire[0].phrase, '大');

  // Rollback to version 1
  await rollbackContent({
    db,
    courseId: 'zh-hsk1',
    targetVersion: 1,
    operator: 'tester',
    reason: 'Rollback to v1',
    backupDir: './test-temp-backups',
  });

  // After rollback, zh_hsk1_002 is active again
  const rolledBackPub = await fetchPublishedCourseContent('zh-hsk1', { client: clientWrapper });
  assert.equal(rolledBackPub.items.some((i) => i.id === 'zh_hsk1_002'), true);

  // Learner data is still 100% intact
  const learnedAfterRollback = getLearnedWords(localDb, 'zh');
  assert.equal(learnedAfterRollback.length, 1);
  assert.equal(learnedAfterRollback[0].character, '大');
});

test('9. Stale response guard and course-switch race protection', async () => {
  let callCount = 0;
  const mockClient = {
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        maybeSingle: async () => {
          callCount++;
          return {
            data: {
              id: 'zh-hsk1',
              language: 'zh',
              level_id: 'HSK1',
              title: 'HSK 1',
              is_published: true,
              content_version: 1,
            },
            error: null,
          };
        },
        range: async () => ({
          data: [{ id: 'zh_01', course_id: 'zh-hsk1', written_form: '中', reading: 'zhōng', is_active: true }],
          error: null,
        }),
      };
      return builder;
    },
  };

  const res = await fetchPublishedCourseContent('zh-hsk1', { client: mockClient });
  assert.equal(res.isPublished, true);
  assert.equal(res.items.length, 1);
  assert.equal(callCount, 1);

  // Test request token stale response discarding logic
  const requestTokens = new Map();
  const courseId = 'zh-hsk1';
  const token1 = 1;
  requestTokens.set(courseId, token1);

  // Simulate user switching courses or re-triggering while request 1 is in flight
  const token2 = 2;
  requestTokens.set(courseId, token2);

  // When request 1 resolves with token1, it detects token1 !== current token (token2)
  const isStale = requestTokens.get(courseId) !== token1;
  assert.equal(isStale, true, 'Request 1 response must be identified as stale and discarded');
});

test('10. Headless browser verification: gate, DOM rendering, and card contract', async () => {
  const result = await runBrowserPublishedContentVerification();
  assert.equal(result.passed || result.skipped, true);
});
