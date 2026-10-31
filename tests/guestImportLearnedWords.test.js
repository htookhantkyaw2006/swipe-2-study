import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorageOwner } from '../src/lib/storageOwner.js';
import { createLocalDatabase } from '../src/lib/localDatabase.js';
import { createGuestImportService } from '../src/lib/guestImportService.js';
import { createCloudGuestImportService } from '../src/lib/cloudGuestImportService.js';
import { buildCloudImportItems } from '../src/lib/cloudImportRecords.js';
import { readGuestSnapshot } from '../src/lib/guestImportData.js';
import { studyWordKey, buildStudiedKeySet, buildNormalSessionCards } from '../src/lib/studyWords.js';
import { recordWordAction, getCourseProgress, getLevelProgress } from '../src/lib/vocabularyProgress.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function fixture() {
  const data = new Map();
  const writes = [];
  let failure = null;
  const storage = {
    get length() { return data.size; },
    key: index => [...data.keys()][index] ?? null,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => {
      if (failure === 'before') throw new Error('Quota exceeded');
      data.set(key, value);
      writes.push(key);
      if (failure === 'after') throw new Error('Response lost after commit');
    },
    removeItem: key => data.delete(key),
  };
  const owner = createStorageOwner({ storage: () => storage });
  owner.setOwner(A);
  let generation = 1;
  let authPatch = {};
  const getAuthState = () => ({ user: owner.getOwner() ? { id: owner.getOwner() } : null, generation, ...authPatch });
  let verify = async () => {};
  let sequence = 0;
  let makeId = () => `imported-${++sequence}`;
  const options = {
    storageOwner: owner,
    getAuthState,
    verifyUser: (...args) => verify(...args),
    makeId: () => makeId(),
    now: () => '2026-10-28T10:00:00.000Z',
  };
  const service = createGuestImportService(options);
  const database = id => createLocalDatabase({ getScope: () => owner.scope(id), getLanguage: () => 'zh' });
  const put = (id, language, table, rows) => owner.scope(id).setTable(language, table, JSON.stringify(rows));
  return {
    data, writes, storage, owner, service, options, database, put,
    fail: mode => { failure = mode; },
    verify: implementation => { verify = implementation; },
    makeId: implementation => { makeId = implementation; },
    auth: patch => { authPatch = patch; },
    switchTo: id => { generation += 1; owner.setOwner(id); },
  };
}

test('guest with only learned_words receives an offer with progressRecords > 0 without automatic writes', async () => {
  const f = fixture();
  const guestDb = createLocalDatabase({ getScope: () => f.owner.scope(null), getLanguage: () => 'zh' });

  // Simulate guest swiping 30 HSK1 words right
  for (let i = 1; i <= 30; i++) {
    const pad = String(i).padStart(3, '0');
    recordWordAction(guestDb, {
      card: { id: `zh-hsk1-${pad}`, character: `词${i}`, pronunciation: `cí${i}`, level: 'HSK1' },
      direction: 'right',
      levelId: 'HSK1',
    });
  }

  const beforeData = [...f.data];
  const offer = await f.service.inspect();

  assert.equal(offer.status, 'available');
  assert.equal(offer.persistence, 'device-only');
  assert.deepEqual(offer.summary, [
    { languageId: 'zh', languageLabel: 'Chinese', savedWords: 0, reviewWords: 0, progressRecords: 30 },
  ]);

  // Inspection must be read-only: no writes to account or guest data
  assert.deepEqual([...f.data], beforeData);
  assert.equal(f.database(A).get('learned_words').length, 0);
});

test('explicit decision is required: implicit choices and forged offers are rejected', async () => {
  const f = fixture();
  const guestDb = createLocalDatabase({ getScope: () => f.owner.scope(null), getLanguage: () => 'zh' });
  recordWordAction(guestDb, {
    card: { id: 'zh-hsk1-001', character: '爱', pronunciation: 'ài', level: 'HSK1' },
    direction: 'right',
    levelId: 'HSK1',
  });

  const offer = await f.service.inspect();
  assert.equal(offer.status, 'available');

  for (const invalidChoice of [undefined, null, '', 'later', 'close', 'merge-silently']) {
    await assert.rejects(f.service.choose(offer, invalidChoice), TypeError);
  }

  // Forged offer object rejected
  await assert.rejects(f.service.choose({ ...offer }, 'merge'), /Reload/);

  // Account has not been modified
  assert.equal(f.database(A).get('learned_words').length, 0);
});

test('explicit merge preserves learned_words state, assigns fresh IDs, and enables normal Learn beyond 30 words', async () => {
  const f = fixture();
  const guestDb = createLocalDatabase({ getScope: () => f.owner.scope(null), getLanguage: () => 'zh' });

  // Guest swipes 30 words right
  for (let i = 1; i <= 30; i++) {
    const pad = String(i).padStart(3, '0');
    recordWordAction(guestDb, {
      card: { id: `zh-hsk1-${pad}`, character: `词${i}`, pronunciation: `cí${i}`, level: 'HSK1' },
      direction: 'right',
      levelId: 'HSK1',
      now: () => `2026-10-28T09:${String(i).padStart(2, '0')}:00.000Z`,
    });
  }

  const guestWordsBefore = f.database(null).get('learned_words');
  assert.equal(guestWordsBefore.length, 30);

  const offer = await f.service.inspect();
  const result = await f.service.choose(offer, 'merge');

  assert.deepEqual(result, { status: 'saved', choice: 'merge', persistence: 'device-only', addedRecords: 30 });

  // Verify account learned_words records
  const accountWords = f.database(A).get('learned_words');
  assert.equal(accountWords.length, 30);

  // Verify fields are preserved and IDs are fresh
  const first = accountWords[0];
  const guestFirst = guestWordsBefore[0];
  assert.equal(first.character, '词1');
  assert.equal(first.pronunciation, 'cí1');
  assert.equal(first.level, 'HSK1');
  assert.equal(first.seen, 1);
  assert.equal(first.status, 'known');
  assert.equal(first.last_action, 'learned');
  assert.equal(first.created_at, guestFirst.created_at, 'created_at timestamp must be preserved');
  assert.equal(first.last_reviewed_at, guestFirst.last_reviewed_at, 'last_reviewed_at timestamp must be preserved');
  assert.ok(first.id.startsWith('imported-'), 'IDs must be uniquely assigned on merge');

  // Verify course and level progress recognize 30 learned words
  const course = { id: 'zh', levels: [{ id: 'HSK1', name: 'HSK 1', words: 300 }] };
  const courseProgress = getCourseProgress(f.database(A), course, 'zh');
  assert.equal(courseProgress.uniqueSeen, 30);
  assert.equal(courseProgress.uniqueLearned, 30);
  assert.equal(courseProgress.levels.HSK1.uniqueLearned, 30);
  assert.equal(courseProgress.levels.HSK1.percent, 10); // 30 / 300 = 10%

  const levelProgress = getLevelProgress(f.database(A), 'HSK1', course, 'zh');
  assert.equal(levelProgress.uniqueLearned, 30);
  assert.equal(levelProgress.uniqueSeen, 30);
  assert.equal(levelProgress.percent, 10);

  // Build active cards for all 300 HSK1 words
  const activeCards = Array.from({ length: 300 }, (_, idx) => {
    const i = idx + 1;
    const pad = String(i).padStart(3, '0');
    return {
      id: `zh-hsk1-${pad}`,
      character: `词${i}`,
      pronunciation: `cí${i}`,
      definition: `Meaning ${i}`,
      burmese_definition: `ဗမာ ${i}`,
      level: 'HSK1',
    };
  });

  // Verify normal Learn continues beyond the 30 imported words
  const studiedKeys = buildStudiedKeySet(accountWords);
  assert.equal(studiedKeys.size, 30);

  const session = buildNormalSessionCards(activeCards, studiedKeys, {
    isGuest: false,
    sessionSize: 10,
    shuffle: false,
  });

  assert.equal(session.allStudied, false);
  assert.equal(session.totalStudied, 30);
  assert.equal(session.totalActive, 300);
  assert.equal(session.cards.length, 10);
  assert.equal(session.cards[0].id, 'zh-hsk1-031', 'Session starts at card 31');
  assert.equal(session.cards[9].id, 'zh-hsk1-040', 'Session presents cards 31-40');
});

test('mixed left-swiped and right-swiped vocabulary preserves both review queue and learned progress', async () => {
  const f = fixture();
  const guestDb = createLocalDatabase({ getScope: () => f.owner.scope(null), getLanguage: () => 'zh' });

  // 20 swiped right ('known'), 10 swiped left ('learning' -> added to review queue)
  for (let i = 1; i <= 20; i++) {
    const pad = String(i).padStart(3, '0');
    recordWordAction(guestDb, {
      card: { id: `zh-hsk1-${pad}`, character: `词${i}`, pronunciation: `cí${i}`, level: 'HSK1' },
      direction: 'right',
      levelId: 'HSK1',
    });
  }
  for (let i = 21; i <= 30; i++) {
    const pad = String(i).padStart(3, '0');
    recordWordAction(guestDb, {
      card: { id: `zh-hsk1-${pad}`, character: `词${i}`, pronunciation: `cí${i}`, level: 'HSK1' },
      direction: 'left',
      levelId: 'HSK1',
    });
  }

  const offer = await f.service.inspect();
  assert.deepEqual(offer.summary, [
    { languageId: 'zh', languageLabel: 'Chinese', savedWords: 0, reviewWords: 10, progressRecords: 30 },
  ]);

  const result = await f.service.choose(offer, 'merge');
  assert.equal(result.addedRecords, 40); // 30 learned_words + 10 review_cards

  const accountWords = f.database(A).get('learned_words');
  const accountReviews = f.database(A).get('review_cards');
  assert.equal(accountWords.length, 30);
  assert.equal(accountReviews.length, 10);

  // 20 known, 10 learning
  const course = { id: 'zh', levels: [{ id: 'HSK1', name: 'HSK 1', words: 300 }] };
  const courseProgress = getCourseProgress(f.database(A), course, 'zh');
  assert.equal(courseProgress.uniqueSeen, 30);
  assert.equal(courseProgress.uniqueLearned, 20);

  // All 30 words count as studied in normal Learn
  const studiedKeys = buildStudiedKeySet(accountWords);
  assert.equal(studiedKeys.size, 30);

  const activeCards = Array.from({ length: 50 }, (_, idx) => {
    const i = idx + 1;
    return { id: `zh-hsk1-${String(i).padStart(3, '0')}`, character: `词${i}`, pronunciation: `cí${i}`, level: 'HSK1' };
  });

  const session = buildNormalSessionCards(activeCards, studiedKeys, { isGuest: false, sessionSize: 10 });
  assert.equal(session.totalStudied, 30);
  assert.equal(session.cards[0].id, 'zh-hsk1-031');

  // Manual review queue retains the 10 left-swiped cards
  assert.equal(accountReviews[0].character, '词21');
  assert.equal(accountReviews[9].character, '词30');
});

test('bookmarking alone (saved_words) does NOT create learned_words progress or mark words studied', async () => {
  const f = fixture();
  // Guest bookmarks 5 words in saved_words without swiping
  const bookmarks = Array.from({ length: 5 }, (_, idx) => ({
    id: `bookmark-${idx + 1}`,
    phrase: `书签${idx + 1}`,
    reading: `shūqiān${idx + 1}`,
    english: `Bookmark ${idx + 1}`,
  }));
  f.put(null, 'zh', 'saved_words', bookmarks);

  // Guest also swipes 5 words
  const guestDb = createLocalDatabase({ getScope: () => f.owner.scope(null), getLanguage: () => 'zh' });
  for (let i = 1; i <= 5; i++) {
    recordWordAction(guestDb, {
      card: { id: `zh-hsk1-${i}`, character: `词${i}`, pronunciation: `cí${i}`, level: 'HSK1' },
      direction: 'right',
      levelId: 'HSK1',
    });
  }

  const offer = await f.service.inspect();
  assert.deepEqual(offer.summary, [
    { languageId: 'zh', languageLabel: 'Chinese', savedWords: 5, reviewWords: 0, progressRecords: 5 },
  ]);

  await f.service.choose(offer, 'merge');

  const accountSaved = f.database(A).get('saved_words');
  const accountLearned = f.database(A).get('learned_words');
  assert.equal(accountSaved.length, 5);
  assert.equal(accountLearned.length, 5);

  // Only the 5 swiped words are studied
  const studiedKeys = buildStudiedKeySet(accountLearned);
  assert.equal(studiedKeys.size, 5);
  for (let i = 1; i <= 5; i++) {
    assert.ok(studiedKeys.has(studyWordKey({ character: `词${i}`, pronunciation: `cí${i}` })));
    assert.ok(!studiedKeys.has(studyWordKey({ phrase: `书签${i}`, reading: `shūqiān${i}` })));
  }
});

test('conflict resolution: existing account row wins, counters are not added or inflated', async () => {
  const f = fixture();
  const existingAccountRow = {
    id: 'account-word-1',
    character: '行',
    pronunciation: 'xíng',
    level: 'HSK1',
    seen: 10,
    status: 'known',
    last_action: 'learned',
    last_reviewed_at: '2026-10-20T10:00:00.000Z',
    created_at: '2026-10-01T10:00:00.000Z',
    updated_at: '2026-10-20T10:00:00.000Z',
  };
  f.put(A, 'zh', 'learned_words', [existingAccountRow]);

  // Guest has same word with lower seen and 'learning' status, plus a distinct new word
  const guestRows = [
    {
      id: 'guest-word-1',
      character: '行',
      pronunciation: 'xíng',
      level: 'HSK1',
      seen: 1,
      status: 'learning',
      last_action: 'review',
      last_reviewed_at: '2026-10-28T10:00:00.000Z',
      created_at: '2026-10-28T10:00:00.000Z',
      updated_at: '2026-10-28T10:00:00.000Z',
    },
    {
      id: 'guest-word-2',
      character: '走',
      pronunciation: 'zǒu',
      level: 'HSK1',
      seen: 2,
      status: 'known',
      last_action: 'learned',
      last_reviewed_at: '2026-10-28T10:00:00.000Z',
      created_at: '2026-10-28T10:00:00.000Z',
      updated_at: '2026-10-28T10:00:00.000Z',
    },
  ];
  f.put(null, 'zh', 'learned_words', guestRows);

  const offer = await f.service.inspect();
  const result = await f.service.choose(offer, 'merge');

  assert.equal(result.addedRecords, 1, 'Only non-conflicting guest-word-2 is added');

  const words = f.database(A).get('learned_words');
  assert.equal(words.length, 2);

  // Account row for 行 is completely preserved (seen=10, status='known', id='account-word-1')
  const xing = words.find(w => w.character === '行');
  assert.deepEqual(xing, existingAccountRow);

  // 走 is imported
  const zou = words.find(w => w.character === '走');
  assert.equal(zou.character, '走');
  assert.equal(zou.seen, 2);
  assert.equal(zou.status, 'known');
});

test('existing receipts do not suppress newly eligible vocabulary progress', async () => {
  const f = fixture();
  // Simulate an account that previously imported only saved_words
  f.put(null, 'zh', 'saved_words', [{ id: 'old-g-1', phrase: '苹果', reading: 'píngguǒ', english: 'Apple' }]);
  const firstOffer = await f.service.inspect();
  await f.service.choose(firstOffer, 'merge');

  // Verify first import succeeded
  assert.equal(f.database(A).get('saved_words').length, 1);

  // Now guest acquires vocabulary progress in learned_words
  const guestDb = createLocalDatabase({ getScope: () => f.owner.scope(null), getLanguage: () => 'zh' });
  recordWordAction(guestDb, {
    card: { id: 'zh-hsk1-001', character: '爱', pronunciation: 'ài', level: 'HSK1' },
    direction: 'right',
    levelId: 'HSK1',
  });

  // Second inspection: saved_words is suppressed by existing receipt, but learned_words is newly offered
  const secondOffer = await f.service.inspect();
  assert.equal(secondOffer.status, 'available');
  assert.deepEqual(secondOffer.summary, [
    { languageId: 'zh', languageLabel: 'Chinese', savedWords: 0, reviewWords: 0, progressRecords: 1 },
  ]);

  const mergeResult = await f.service.choose(secondOffer, 'merge');
  assert.equal(mergeResult.addedRecords, 1);
  assert.equal(f.database(A).get('learned_words').length, 1);
  assert.equal(f.database(A).get('learned_words')[0].character, '爱');
});

test('account-only choice preserves guest source and leaves account tables unchanged', async () => {
  const f = fixture();
  const guestDb = createLocalDatabase({ getScope: () => f.owner.scope(null), getLanguage: () => 'zh' });
  recordWordAction(guestDb, {
    card: { id: 'zh-hsk1-001', character: '爱', pronunciation: 'ài', level: 'HSK1' },
    direction: 'right',
    levelId: 'HSK1',
  });

  const originalGuestWords = f.database(null).get('learned_words');
  assert.equal(originalGuestWords.length, 1);

  const offer = await f.service.inspect();
  const result = await f.service.choose(offer, 'account-only');

  assert.deepEqual(result, { status: 'saved', choice: 'account-only', persistence: 'device-only', addedRecords: 0 });

  // Account has no words
  assert.equal(f.database(A).get('learned_words').length, 0);

  // Guest data is preserved untouched
  assert.deepEqual(f.database(null).get('learned_words'), originalGuestWords);

  // Re-inspecting for Account A reports nothing to import
  assert.equal((await f.service.inspect()).status, 'nothing-to-import');

  // Switching to Account B allows B to make its own choice
  f.switchTo(B);
  const offerB = await f.service.inspect();
  assert.equal(offerB.status, 'available');
  assert.equal(offerB.summary[0].progressRecords, 1);
});

test('cloud import items correctly converts guest learned_words and reflects in cloud offer', async () => {
  const f = fixture();
  const guestDb = createLocalDatabase({ getScope: () => f.owner.scope(null), getLanguage: () => 'zh' });

  for (let i = 1; i <= 30; i++) {
    const pad = String(i).padStart(3, '0');
    recordWordAction(guestDb, {
      card: { id: `zh-hsk1-${pad}`, character: `词${i}`, pronunciation: `cí${i}`, level: 'HSK1' },
      direction: 'right',
      levelId: 'HSK1',
      now: () => `2026-10-28T10:${String(i).padStart(2, '0')}:00.000Z`,
    });
  }

  const snapshot = readGuestSnapshot(f.owner.scope(null));
  const cloudItems = buildCloudImportItems(snapshot.tables);

  assert.equal(cloudItems.length, 30);
  assert.equal(cloudItems[0].kind, 'learned_words');
  assert.equal(cloudItems[0].written_form, '词1');
  assert.equal(cloudItems[0].reading, 'cí1');
  assert.equal(cloudItems[0].data.level, 'HSK1');
  assert.equal(cloudItems[0].data.seen, 1);
  assert.equal(cloudItems[0].data.status, 'known');
  assert.equal(cloudItems[0].data.last_action, 'learned');

  // Test cloud guest import service inspection
  let rpcCalls = [];
  const mockClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: A } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: A } } }, error: null }),
    },
    rpc: async (fn, params) => {
      rpcCalls.push({ fn, params });
      if (fn === 's2s_account_snapshot') {
        return {
          data: { schema_version: 1, user_id: A, reset_version: '0', server_time: '2026-10-28T12:00:00.000Z', items: [] },
          error: null,
        };
      }
      if (fn === 's2s_import_guest') {
        return {
          data: {
            status: 'committed',
            persistence: 'cloud',
            schema_version: 1,
            user_id: params.p_expected_user_id,
            request_id: params.p_request_id,
            reset_version: params.p_expected_reset_version,
            source_fingerprint: params.p_source_fingerprint,
            choice: params.p_choice,
            accepted_count: params.p_items?.length ?? 0,
            added_count: params.p_items?.length ?? 0,
            updated_count: 0,
            replayed: false,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };

  const oldStorage = globalThis.localStorage;
  globalThis.localStorage = f.storage;
  try {
    const cloudService = createCloudGuestImportService({
      storageOwner: f.owner,
      getAuthState: () => ({ user: { id: A }, generation: 1, loading: false, isTransitioning: false, error: null }),
      getClient: () => mockClient,
      now: () => '2026-10-28T12:00:00.000Z',
    });

    const cloudOffer = await cloudService.inspect();
    assert.equal(cloudOffer.status, 'available');
    assert.equal(cloudOffer.persistence, 'cloud');
    assert.deepEqual(cloudOffer.summary, [
      { languageId: 'zh', languageLabel: 'Chinese', savedWords: 0, reviewWords: 0, progressRecords: 30 },
    ]);

    const cloudResult = await cloudService.choose(cloudOffer, 'merge');
    assert.equal(cloudResult.status, 'saved');
    assert.equal(cloudResult.choice, 'merge');
    assert.equal(cloudResult.addedRecords, 30);

    const importGuestRpc = rpcCalls.find(c => c.fn === 's2s_import_guest');
    assert.ok(importGuestRpc);
    assert.equal(importGuestRpc.params.p_choice, 'merge');
    assert.equal(importGuestRpc.params.p_items.length, 30);
    assert.equal(importGuestRpc.params.p_items[0].kind, 'learned_words');
  } finally {
    globalThis.localStorage = oldStorage;
  }
});

test('malformed learned_words records fail closed and are kept for recovery without writes', async () => {
  const badCases = [
    { name: 'negative seen', row: { character: '爱', pronunciation: 'ài', seen: -1 } },
    { name: 'float seen', row: { character: '爱', pronunciation: 'ài', seen: 1.5 } },
    { name: 'string seen', row: { character: '爱', pronunciation: 'ài', seen: '1' } },
    { name: 'number status', row: { character: '爱', pronunciation: 'ài', seen: 1, status: 123 } },
    { name: 'excessive length status', row: { character: '爱', pronunciation: 'ài', seen: 1, status: 'x'.repeat(2001) } },
    { name: 'missing character', row: { pronunciation: 'ài', seen: 1 } },
    { name: 'wrong language', row: { character: '爱', pronunciation: 'ài', seen: 1, language: 'ja' } },
  ];

  for (const { name, row } of badCases) {
    const f = fixture();
    f.data.set('s2s_zh_learned_words', JSON.stringify([row]));
    const before = [...f.data];
    await assert.rejects(f.service.inspect(), /recovery/, `Case "${name}" must reject with recovery error`);
    assert.deepEqual([...f.data], before, `Case "${name}" must make 0 storage writes`);
    assert.equal(f.writes.length, 0);
  }
});
