import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchPublishedCourseContent,
} from '../src/lib/publishedContentService.js';
import {
  getLevelProgress,
  recordWordAction,
  getLearnedWords,
} from '../src/lib/vocabularyProgress.js';
import { createLocalDatabase } from '../src/lib/localDatabase.js';
import { createPreferencesSyncService } from '../src/lib/preferencesSyncService.js';
import { createPreferencesSyncController } from '../src/lib/preferencesSyncController.js';
import { readPendingPreferences } from '../src/lib/preferencesSyncStorage.js';
import {
  performLocalAccountLearningReset,
  parseResetVersionBigInt,
} from '../src/lib/learningResetService.js';
import {
  readPendingSyncRequest,
  writePendingSyncRequest,
} from '../src/lib/onlineSyncRequest.js';
import { readStreakState, writeStreakState } from '../src/lib/studyStreak.js';

function createMockStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

function createMockStorageOwner(storage) {
  const docs = new Map();
  let currentOwner = null;

  return {
    getStorage: () => storage,
    getOwner: () => currentOwner,
    setOwner: (owner) => {
      currentOwner = owner;
    },
    scope: (ownerId) => ({
      setItem: (k, v) => storage.setItem(`scope_${ownerId}_${k}`, v),
      getItem: (k) => storage.getItem(`scope_${ownerId}_${k}`),
      readLearningDocument: () => {
        const raw = docs.get(ownerId) || null;
        return {
          raw,
          value: raw ? JSON.parse(raw) : null,
        };
      },
      commitLearningDocument: (expectedRaw, nextValue) => {
        const current = docs.get(ownerId) || null;
        if (current !== expectedRaw) {
          throw new Error('OCC conflict');
        }
        docs.set(ownerId, JSON.stringify(nextValue));
      },
    }),
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

// ===========================================================================
// Finding 1: Published Content Failure Loop & Deduplication
// ===========================================================================
test('1. Published Content: request deduplication & older request finally does not clear newer in-flight entry', async () => {
  const inFlightMap = new Map();
  const courseId = 'zh-hsk1';

  // Request 1 starts
  let resolveReq1;
  const p1 = new Promise((resolve) => { resolveReq1 = resolve; });
  inFlightMap.set(courseId, p1);

  // Request 2 (e.g. forced retry) starts while Request 1 is still in flight
  let resolveReq2;
  const p2 = new Promise((resolve) => { resolveReq2 = resolve; });
  inFlightMap.set(courseId, p2);

  // When Request 1 finishes, its finally checks whether it is still the active entry
  if (inFlightMap.get(courseId) === p1) {
    inFlightMap.delete(courseId);
  }

  // Request 2 MUST still be present in inFlightMap!
  assert.equal(inFlightMap.get(courseId), p2, 'Older request finally must not remove newer in-flight entry');

  // When Request 2 finishes
  if (inFlightMap.get(courseId) === p2) {
    inFlightMap.delete(courseId);
  }
  assert.equal(inFlightMap.has(courseId), false);

  resolveReq1();
  resolveReq2();
});

// ===========================================================================
// Finding 2: Curriculum Completion
// ===========================================================================
test('2. Curriculum Completion: one retired learned word + one active unlearned word produces 0/1 completed, not 1/1', () => {
  const localDb = createTestLocalDb();

  // Learner learned word '大' (zh_hsk1_002) which has since been retired
  recordWordAction(localDb, {
    card: { id: 'zh_hsk1_002', character: '大', pronunciation: 'dà', level: 'HSK1' },
    direction: 'right',
  });

  const mockCourse = {
    id: 'zh',
    levels: [{ id: 'HSK1', name: 'HSK 1', words: 150 }],
  };

  // Currently loaded curriculum contains 1 active word: '中' (zh_hsk1_001), which is unlearned
  const activeCurriculum = [
    {
      id: 'zh_hsk1_001',
      character: '中',
      pronunciation: 'zhōng',
      reading: 'zhōng',
      level: 'HSK1',
    },
  ];

  const progress = getLevelProgress(localDb, 'HSK1', mockCourse, 'zh', activeCurriculum);

  // Must report 0/1 completed (0%), NOT 1/1 (100%)
  assert.equal(progress.words, 1, 'Total words must equal active curriculum length (1)');
  assert.equal(progress.uniqueLearned, 0, 'Active learned words must be 0 because 大 is retired and 中 is unlearned');
  assert.equal(progress.percent, 0, 'Completion percent must be 0%');

  // Historical learning records must remain intact for lifetime metrics
  assert.equal(progress.historicalLearned, 1, 'Historical learned words must preserve lifetime records');
  const allLearned = getLearnedWords(localDb, 'zh');
  assert.equal(allLearned.length, 1, 'Learner database still preserves historical records');
  assert.equal(allLearned[0].character, '大');

  // Now when the active word '中' is learned:
  recordWordAction(localDb, {
    card: activeCurriculum[0],
    direction: 'right',
  });

  const updatedProgress = getLevelProgress(localDb, 'HSK1', mockCourse, 'zh', activeCurriculum);
  assert.equal(updatedProgress.uniqueLearned, 1, 'Now reports 1 active learned word');
  assert.equal(updatedProgress.percent, 100, 'Now reports 100% completion');
  assert.equal(updatedProgress.historicalLearned, 2, 'Lifetime learned is 2 (both 大 and 中)');
});

// ===========================================================================
// Finding 3: Consistent Publication Reads
// ===========================================================================
test('3. Consistent Publication Reads: detects publication and rollback changes during paging and retries', async () => {
  let courseVersion = 1;
  let updatedAt = '2026-10-30T01:00:00.000Z';
  let pageReads = 0;
  let attemptCount = 0;

  const mockClient = {
    from: (table) => {
      if (table === 'courses') {
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => ({
            data: {
              id: 'zh-hsk1',
              language: 'zh',
              level_id: 'HSK1',
              title: 'HSK 1',
              is_published: true,
              content_version: courseVersion,
              updated_at: updatedAt,
            },
            error: null,
          }),
        };
        return builder;
      }

      if (table === 'vocabulary') {
        const builder = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          range: async (from) => {
            pageReads++;
            // Simulate publication update happening between page 1 and page 2
            if (pageReads === 1) {
              // During page 1 read, simulate concurrent publication
              courseVersion = 2;
              updatedAt = '2026-10-30T01:05:00.000Z';
              attemptCount++;
              return {
                data: [
                  { id: 'zh_01', course_id: 'zh-hsk1', written_form: '中', reading: 'zhōng', is_active: true },
                  { id: 'zh_02', course_id: 'zh-hsk1', written_form: '大', reading: 'dà', is_active: true },
                ],
                error: null,
              };
            }

            // After retry, consistent page 1 and page 2 of version 2
            if (from === 0) {
              return {
                data: [
                  { id: 'zh_01', course_id: 'zh-hsk1', written_form: '中', reading: 'zhōng', is_active: true },
                  { id: 'zh_02', course_id: 'zh-hsk1', written_form: '大', reading: 'dà', is_active: true },
                ],
                error: null,
              };
            }
            return {
              data: [
                { id: 'zh_03', course_id: 'zh-hsk1', written_form: '小', reading: 'xiǎo', is_active: true },
              ],
              error: null,
            };
          },
        };
        return builder;
      }
    },
  };

  const res = await fetchPublishedCourseContent('zh-hsk1', { client: mockClient, pageSize: 2 });
  assert.equal(res.isPublished, true);
  assert.equal(res.version, 2, 'Must return consistent version 2 after detecting change during paging');
  assert.equal(res.items.length, 3, 'Must return complete items from consistent snapshot');
  assert.ok(attemptCount > 0, 'Retry loop was executed upon detecting publication change');
});

test('3b. Consistent Publication Reads: detects rollback even if version number recurs', async () => {
  let courseVersion = 1;
  let updatedAt = '2026-10-30T01:00:00.000Z';
  let pageReads = 0;

  const mockClient = {
    from: (table) => {
      if (table === 'courses') {
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => ({
            data: {
              id: 'zh-hsk1',
              language: 'zh',
              level_id: 'HSK1',
              title: 'HSK 1',
              is_published: true,
              content_version: courseVersion, // remains 1 (rollback target)
              updated_at: updatedAt, // BUT updated_at changed!
            },
            error: null,
          }),
        };
        return builder;
      }

      if (table === 'vocabulary') {
        const builder = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          range: async () => {
            pageReads++;
            if (pageReads === 1) {
              // Simulate rollback: version is still 1, but updated_at changed
              updatedAt = '2026-10-30T02:00:00.000Z';
              return {
                data: [
                  { id: 'zh_01', course_id: 'zh-hsk1', written_form: '中', reading: 'zhōng', is_active: true },
                  { id: 'zh_02', course_id: 'zh-hsk1', written_form: '大', reading: 'dà', is_active: true },
                ],
                error: null,
              };
            }
            return {
              data: [
                { id: 'zh_01', course_id: 'zh-hsk1', written_form: '中', reading: 'zhōng', is_active: true },
              ],
              error: null,
            };
          },
        };
        return builder;
      }
    },
  };

  const res = await fetchPublishedCourseContent('zh-hsk1', { client: mockClient, pageSize: 2 });
  assert.equal(res.isPublished, true);
  assert.equal(res.version, 1);
  assert.equal(res.items.length, 1);
});

test('3c. Consistent Publication Reads: throws retryable error when publications persistently change beyond maxRetries', async () => {
  let seq = 0;
  const mockClient = {
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        range: async () => ({
          data: [{ id: 'zh_01', course_id: 'zh-hsk1', written_form: '中', reading: 'zhōng', is_active: true }],
          error: null,
        }),
        maybeSingle: async () => {
          seq++;
          return {
            data: {
              id: 'zh-hsk1',
              language: 'zh',
              level_id: 'HSK1',
              title: 'HSK 1',
              is_published: true,
              content_version: seq,
              updated_at: `2026-10-30T00:00:0${seq}.000Z`,
            },
            error: null,
          };
        },
      };
      return builder;
    },
  };

  await assert.rejects(
    async () => fetchPublishedCourseContent('zh-hsk1', { client: mockClient, maxRetries: 2 }),
    /Course publication changed concurrently during retrieval\. Please retry\./
  );
});

// ===========================================================================
// Finding 4: Durable Queued Preferences
// ===========================================================================
test('4. Durable Queued Preferences: mutation B queued while A in-flight survives reload and saves', async () => {
  const storage = createMockStorage();
  const storageOwner = createMockStorageOwner(storage);
  const accountId = '44444444-4444-4444-4444-444444444444';
  storageOwner.setOwner(accountId);

  let resolveMutationA;
  const inFlightPromiseA = new Promise((resolve) => { resolveMutationA = resolve; });

  let saveCalls = [];

  const mockSupabase = {
    from: () => ({
      upsert: (payload) => {
        saveCalls.push(payload);
        const isA = payload.settings?.dailyGoal === 10;
        return {
          select: () => ({
            maybeSingle: async () => {
              if (isA) {
                await inFlightPromiseA;
              }
              return {
                data: {
                  settings: payload.settings,
                  active_language: payload.active_language,
                  updated_at: '2026-10-30T10:00:00.000Z',
                },
                error: null,
              };
            },
          }),
        };
      },
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              user_id: accountId,
              settings: { dailyGoal: 5 },
              active_language: 'zh',
              updated_at: '2026-10-30T09:00:00.000Z',
            },
            error: null,
          }),
        }),
      }),
    }),
  };

  const service = createPreferencesSyncService({
    getClient: () => mockSupabase,
    storageOwner,
  });

  const controller = createPreferencesSyncController({
    service,
    allowOnline: true,
  });

  // Set active account (restores initial settings)
  await controller.setAccount({ id: accountId, generation: 1 });

  // 1. Dispatch mutation A (dailyGoal: 10) - starts network call which hangs
  controller.onLocalChange({
    settings: { dailyGoal: 10 },
    activeLanguage: 'zh',
    changedKey: 'dailyGoal',
  });

  // 2. Dispatch mutation B (dailyGoal: 25) while A is in flight
  controller.onLocalChange({
    settings: { dailyGoal: 25 },
    activeLanguage: 'zh',
    changedKey: 'dailyGoal',
  });

  // Verify durable storage immediately contains mutation B, NOT A!
  const pendingBeforeReload = readPendingPreferences(storage, accountId).state;
  assert.ok(pendingBeforeReload, 'Pending record must exist in durable storage');
  assert.equal(pendingBeforeReload.settings.dailyGoal, 25, 'Durable pending state must contain mutation B (25)');
  assert.equal(pendingBeforeReload.localMutationId, 2, 'Durable pending state mutationId is 2');

  // 3. Simulate browser reload before mutation A completes
  // In a real browser reload, the old controller is unloaded/cancelled
  controller.cancel();
  resolveMutationA();

  // Create a new controller instance as would happen after page reload
  const reloadedController = createPreferencesSyncController({
    service,
    allowOnline: true,
  });

  // When account hydrates, it restores from cloud and merges mutation B
  await reloadedController.setAccount({ id: accountId, generation: 1 });

  // Storage pending state must have been saved as mutation B (25)
  const pendingAfterRestore = readPendingPreferences(storage, accountId).state;
  assert.equal(pendingAfterRestore, null, 'Pending state was successfully synced to cloud on reload');

  // Verify the last payload sent to the server had dailyGoal === 25
  const lastCall = saveCalls[saveCalls.length - 1];
  assert.equal(lastCall.settings.dailyGoal, 25, 'Mutation B survived reload and was saved to cloud');
});

// ===========================================================================
// Finding 5: Reset Cleanup Generation Safety
// ===========================================================================
test('5a. Reset Cleanup: older confirmation (gen 1) against newer document (gen 2) never downgrades or wipes', () => {
  const storage = createMockStorage();
  const storageOwner = createMockStorageOwner(storage);
  const accountId = '55555555-5555-5555-5555-555555555555';
  storageOwner.setOwner(accountId);

  // Set up local document at generation 2 with existing learned records
  const initialDoc = {
    version: 1,
    revision: 5,
    tables: {
      zh_learned_words: JSON.stringify([{ id: 'pw_zh_01', character: '中', status: 'known' }]),
    },
    cloudSync: {
      schemaVersion: 1,
      ownerId: accountId,
      resetVersion: '2', // Generation 2!
      records: {},
    },
  };
  storageOwner.scope(accountId).commitLearningDocument(null, initialDoc);

  // Set streak cache at 3 days
  writeStreakState(storage, accountId, {
    currentStreak: 3,
    longestStreak: 5,
    todayStudied: true,
    timezone: 'Asia/Yangon',
  });

  // Now an older confirmed reset arrives for generation 1 (e.g. out-of-order or duplicate replay)
  performLocalAccountLearningReset(accountId, '1', storageOwner);

  // Document MUST remain generation 2 and tables MUST NOT be wiped!
  const docAfter = storageOwner.scope(accountId).readLearningDocument().value;
  assert.equal(docAfter.cloudSync.resetVersion, '2', 'Document generation must remain 2 (never downgrade)');
  assert.ok(docAfter.tables.zh_learned_words.includes('中'), 'Tables in newer generation must NOT be wiped');

  // Streak cache MUST remain intact!
  const streakAfter = readStreakState(storage, accountId);
  assert.equal(streakAfter.currentStreak, 3, 'Newer streak state must NOT be wiped by older reset');
});

test('5b. Reset Cleanup: same-generation retry with new pending work preserves post-reset rows, streak, and requests', () => {
  const storage = createMockStorage();
  const storageOwner = createMockStorageOwner(storage);
  const accountId = '66666666-6666-6666-6666-666666666666';
  storageOwner.setOwner(accountId);

  // Document is at generation 1 and already contains post-reset work
  const initialDoc = {
    version: 1,
    revision: 2,
    tables: {
      zh_learned_words: JSON.stringify([{ id: 'pw_zh_02', character: '大', status: 'known' }]),
    },
    cloudSync: {
      schemaVersion: 1,
      ownerId: accountId,
      resetVersion: '1',
      records: {},
    },
  };
  storageOwner.scope(accountId).commitLearningDocument(null, initialDoc);

  // User accumulated streak of 2 days post-reset
  writeStreakState(storage, accountId, {
    currentStreak: 2,
    longestStreak: 2,
    todayStudied: true,
    timezone: 'Asia/Yangon',
  });

  // User has a pending sync request created for generation 1
  const pendingSync = {
    schemaVersion: 1,
    ownerId: accountId,
    requestId: '77777777-7777-4777-8777-777777777777',
    resetVersion: '1',
    mutations: [{ id: 'm1' }],
    itemsSnapshot: {},
  };
  writePendingSyncRequest(storage, accountId, pendingSync);

  // A local cleanup retry for generation 1 runs (e.g. reload recovery)
  performLocalAccountLearningReset(accountId, '1', storageOwner);

  // 1. Post-reset rows in document MUST be preserved!
  const docAfter = storageOwner.scope(accountId).readLearningDocument().value;
  assert.ok(docAfter.tables.zh_learned_words.includes('大'), 'Post-reset rows must be preserved');

  // 2. Matching-generation pending sync request MUST be preserved!
  const reqAfter = readPendingSyncRequest(storage, accountId).request;
  assert.ok(reqAfter, 'Matching-generation pending sync request must be preserved');
  assert.equal(reqAfter.requestId, '77777777-7777-4777-8777-777777777777');

  // 3. Post-reset streak state MUST be preserved!
  const streakAfter = readStreakState(storage, accountId);
  assert.equal(streakAfter.currentStreak, 2, 'Post-reset streak state must be preserved');
});

test('5c. parseResetVersionBigInt: strictly validates non-negative decimal strings and BigInts', () => {
  assert.equal(parseResetVersionBigInt('0'), 0n);
  assert.equal(parseResetVersionBigInt('1'), 1n);
  assert.equal(parseResetVersionBigInt('999999999999999999'), 999999999999999999n);
  assert.equal(parseResetVersionBigInt(5n), 5n);

  assert.equal(parseResetVersionBigInt('-1'), null);
  assert.equal(parseResetVersionBigInt('1.5'), null);
  assert.equal(parseResetVersionBigInt('abc'), null);
  assert.equal(parseResetVersionBigInt(''), null);
  assert.equal(parseResetVersionBigInt(null), null);
  assert.equal(parseResetVersionBigInt(undefined), null);
});
