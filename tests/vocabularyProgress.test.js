import test from 'node:test';
import assert from 'node:assert/strict';

import { createStorageOwner } from '../src/lib/storageOwner.js';
import { createLocalDatabase } from '../src/lib/localDatabase.js';
import {
  recordWordAction,
  getLearnedWords,
  getCourseProgress,
  getLevelProgress,
  resetVocabularyProgress,
} from '../src/lib/vocabularyProgress.js';
const zhCourse = {
  id: 'zh',
  name: 'Chinese',
  levels: [
    { id: 'HSK1', name: 'HSK 1', words: 150 },
    { id: 'HSK2', name: 'HSK 2', words: 200 },
  ],
};
import { createOnlineSyncService } from '../src/lib/onlineSyncService.js';

const OWNER_A = '11111111-1111-4111-8111-111111111111';
const OWNER_B = '22222222-2222-4222-8222-222222222222';

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
  };
}

test('vocabularyProgress: initial state reports honest 0 progress', () => {
  const storage = createMemoryStorage();
  const owner = createStorageOwner({ storage: () => storage });
  const db = createLocalDatabase({
    getScope: () => owner.scope(),
    getLanguage: () => 'zh',
  });

  const words = getLearnedWords(db);
  assert.deepEqual(words, []);

  const progress = getCourseProgress(db, zhCourse);
  assert.equal(progress.uniqueSeen, 0);
  assert.equal(progress.uniqueLearned, 0);
  assert.equal(progress.levels['HSK1'].uniqueSeen, 0);
  assert.equal(progress.levels['HSK1'].uniqueLearned, 0);
  assert.equal(progress.levels['HSK1'].percent, 0);
});

test('vocabularyProgress: swipe right records learned state and clears review queue', () => {
  const storage = createMemoryStorage();
  const owner = createStorageOwner({ storage: () => storage });
  const db = createLocalDatabase({
    getScope: () => owner.scope(),
    getLanguage: () => 'zh',
  });

  // Seed review queue with card
  const card = { character: '你好', pronunciation: 'nǐ hǎo', level: 'HSK1' };
  db.set('review_cards', [card]);
  assert.equal(db.get('review_cards').length, 1);

  // Swipe right (learned)
  const result = recordWordAction(db, { card, direction: 'right', levelId: 'HSK1' });
  assert.equal(result.isLearned, true);
  assert.equal(result.status, 'known');
  assert.equal(result.row.seen, 1);
  assert.equal(result.row.last_action, 'learned');

  // Removed from review queue
  assert.equal(db.get('review_cards').length, 0);

  // Progress updated
  const progress = getCourseProgress(db, zhCourse);
  assert.equal(progress.uniqueSeen, 1);
  assert.equal(progress.uniqueLearned, 1);
  assert.equal(progress.levels['HSK1'].uniqueSeen, 1);
  assert.equal(progress.levels['HSK1'].uniqueLearned, 1);
});

test('vocabularyProgress: retries and repeated swipes do NOT inflate unique counts', () => {
  const storage = createMemoryStorage();
  const owner = createStorageOwner({ storage: () => storage });
  const db = createLocalDatabase({
    getScope: () => owner.scope(),
    getLanguage: () => 'zh',
  });
  const card = { character: '你好', pronunciation: 'nǐ hǎo', level: 'HSK1' };

  // Swipe right 5 times
  for (let i = 0; i < 5; i++) {
    recordWordAction(db, { card, direction: 'right', levelId: 'HSK1' });
  }

  const rows = getLearnedWords(db);
  assert.equal(rows.length, 1, 'Only one row created for word');
  assert.equal(rows[0].seen, 5, 'Seen counter accurately increments');

  const progress = getCourseProgress(db, zhCourse);
  assert.equal(progress.uniqueSeen, 1, 'Unique seen remains exactly 1');
  assert.equal(progress.uniqueLearned, 1, 'Unique learned remains exactly 1');
});

test('vocabularyProgress: swipe left places word in review queue and is not counted as learned', () => {
  const storage = createMemoryStorage();
  const owner = createStorageOwner({ storage: () => storage });
  const db = createLocalDatabase({
    getScope: () => owner.scope(),
    getLanguage: () => 'zh',
  });
  const card = { character: '谢谢', pronunciation: 'xiè xie', level: 'HSK1' };

  // Swipe left (review)
  const result = recordWordAction(db, { card, direction: 'left', levelId: 'HSK1' });
  assert.equal(result.isLearned, false);
  assert.equal(result.status, 'learning');
  assert.equal(result.row.seen, 1);
  assert.equal(result.row.last_action, 'review');

  // Added to review queue
  const reviewCards = db.get('review_cards');
  assert.equal(reviewCards.length, 1);
  assert.equal(reviewCards[0].character, '谢谢');

  // Course progress: seen = 1, learned = 0
  const progress = getCourseProgress(db, zhCourse);
  assert.equal(progress.uniqueSeen, 1);
  assert.equal(progress.uniqueLearned, 0);
});

test('vocabularyProgress: demotion from learned to review and promotion back to learned', () => {
  const storage = createMemoryStorage();
  const owner = createStorageOwner({ storage: () => storage });
  const db = createLocalDatabase({
    getScope: () => owner.scope(),
    getLanguage: () => 'zh',
  });
  const card = { character: '水', pronunciation: 'shuǐ', level: 'HSK1' };

  // 1. Learns the word
  recordWordAction(db, { card, direction: 'right', levelId: 'HSK1' });
  assert.equal(getCourseProgress(db, zhCourse).uniqueLearned, 1);
  assert.equal(db.get('review_cards').length, 0);

  // 2. Later forgets the word (swipes left)
  recordWordAction(db, { card, direction: 'left', levelId: 'HSK1' });
  assert.equal(getCourseProgress(db, zhCourse).uniqueLearned, 0, 'Demoted from learned');
  assert.equal(getCourseProgress(db, zhCourse).uniqueSeen, 1, 'Still counted as seen');
  assert.equal(db.get('review_cards').length, 1, 'In review queue');

  // 3. Reviews and learns again (swipes right)
  recordWordAction(db, { card, direction: 'right', levelId: 'HSK1' });
  assert.equal(getCourseProgress(db, zhCourse).uniqueLearned, 1, 'Promoted back to learned');
  assert.equal(db.get('review_cards').length, 0, 'Cleared from review queue');
});

test('vocabularyProgress: owner isolation prevents cross-account cache leakage', () => {
  const storage = createMemoryStorage();
  const owner = createStorageOwner({ storage: () => storage, cloudTracking: true });

  // Owner A records progress
  owner.setOwner(OWNER_A);
  const dbA = createLocalDatabase({
    getScope: () => owner.scope(),
    getLanguage: () => 'zh',
  });
  recordWordAction(dbA, {
    card: { character: '猫', pronunciation: 'māo', level: 'HSK1' },
    direction: 'right',
    levelId: 'HSK1',
  });
  assert.equal(getLearnedWords(dbA).length, 1);

  // Owner B opens learning space
  owner.setOwner(OWNER_B);
  const dbB = createLocalDatabase({
    getScope: () => owner.scope(),
    getLanguage: () => 'zh',
  });
  assert.equal(getLearnedWords(dbB).length, 0, 'Owner B sees empty progress');

  // Switch back to Owner A
  owner.setOwner(OWNER_A);
  assert.equal(getLearnedWords(dbA).length, 1, 'Owner A progress preserved');
});

test('vocabularyProgress: language isolation keeps Chinese and Japanese progress separate', () => {
  const storage = createMemoryStorage();
  const owner = createStorageOwner({ storage: () => storage });
  let activeLang = 'zh';
  const db = createLocalDatabase({
    getScope: () => owner.scope(),
    getLanguage: () => activeLang,
  });

  // Learn Chinese word
  recordWordAction(db, {
    card: { character: '你好', pronunciation: 'nǐ hǎo', level: 'HSK1' },
    direction: 'right',
    levelId: 'HSK1',
  });
  assert.equal(getLearnedWords(db, 'zh').length, 1);
  assert.equal(getLearnedWords(db, 'ja').length, 0);

  // Switch to Japanese
  activeLang = 'ja';
  recordWordAction(db, {
    card: { character: '日', pronunciation: 'ひ', level: 'N5' },
    direction: 'right',
    levelId: 'N5',
  });
  assert.equal(getLearnedWords(db, 'ja').length, 1);
  assert.equal(getLearnedWords(db, 'zh').length, 1);
});

test('vocabularyProgress: online sync tracks and commits learned_words mutations', async () => {
  const storage = createMemoryStorage();
  const owner = createStorageOwner({ storage: () => storage, cloudTracking: true });
  owner.setOwner(OWNER_A);

  const db = createLocalDatabase({
    getScope: () => owner.scope(),
    getLanguage: () => 'zh',
  });

  // Record a word action
  recordWordAction(db, {
    card: { character: '朋友', pronunciation: 'péngyou', level: 'HSK1' },
    direction: 'right',
    levelId: 'HSK1',
  });

  let syncedMutations = [];
  const mockClient = {
    rpc: async (fn, params) => {
      if (fn === 's2s_apply_mutations') {
        syncedMutations = params.p_mutations;
        const acknowledged = params.p_mutations.map((m) => ({
          client_id: m.client_id,
          item_key: 'hex_key_1',
          status: 'applied',
          revision: '1',
        }));
        return {
          data: {
            status: 'committed',
            user_id: OWNER_A,
            request_id: params.p_request_id,
            reset_version: '0',
            acknowledged,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };

  const syncService = createOnlineSyncService({
    storageOwner: owner,
    getClient: () => mockClient,
  });

  assert.equal(syncService.countPending(OWNER_A), 1, '1 pending learned_words record');

  const syncResult = await syncService.performSync({ accountId: OWNER_A });
  assert.equal(syncResult.status, 'saved');
  assert.equal(syncResult.pendingCount, 0);

  // Verify mutation payload
  assert.equal(syncedMutations.length, 1);
  assert.equal(syncedMutations[0].kind, 'learned_words');
  assert.equal(syncedMutations[0].written_form, '朋友');
  assert.equal(syncedMutations[0].reading, 'péngyou');
  assert.equal(syncedMutations[0].data.status, 'known');
  assert.equal(syncedMutations[0].data.seen, 1);
});

test('vocabularyProgress: getLevelProgress and resetVocabularyProgress operate cleanly', () => {
  const storage = createMemoryStorage();
  const owner = createStorageOwner({ storage: () => storage });
  const db = createLocalDatabase({
    getScope: () => owner.scope(),
    getLanguage: () => 'zh',
  });

  recordWordAction(db, {
    card: { character: '茶', pronunciation: 'chá', level: 'HSK1' },
    direction: 'right',
    levelId: 'HSK1',
  });

  const levelProgress = getLevelProgress(db, 'HSK1', zhCourse);
  assert.equal(levelProgress.id, 'HSK1');
  assert.equal(levelProgress.uniqueLearned, 1);
  assert.equal(levelProgress.words, 150);

  const unavailable = getLevelProgress(db, 'HSK99', zhCourse);
  assert.equal(unavailable.uniqueLearned, 0);

  resetVocabularyProgress(db);
  assert.equal(getLearnedWords(db).length, 0);
});
