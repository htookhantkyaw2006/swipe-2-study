/**
 * sessionBatch.test.js
 *
 * Acceptance tests for the bounded learning-session batch feature.
 *
 * Uses production helpers only:
 *   - buildNormalSessionCards, buildStudiedKeySet, studyWordKey (studyWords.js)
 *   - recordWordAction, getLearnedWords (vocabularyProgress.js)
 *   - createLocalDatabase (localDatabase.js)
 *
 * No React / browser globals required.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createLocalDatabase } from '../src/lib/localDatabase.js';
import { recordWordAction, getLearnedWords } from '../src/lib/vocabularyProgress.js';
import {
  buildNormalSessionCards,
  buildStudiedKeySet,
  readSessionCards,
  studyWordKey,
} from '../src/lib/studyWords.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** In-memory local database backed by a plain Map (no Auth / storage overhead). */
function createTestDb(language = 'zh') {
  const tables = new Map();
  return createLocalDatabase({
    getScope: () => ({
      getTable: (lang, table) => tables.get(`${lang}:${table}`) ?? null,
      setTable: (lang, table, json) => tables.set(`${lang}:${table}`, json),
    }),
    getLanguage: () => language,
  });
}

/** Make a vocabulary card in the shape returned by publishedContentService / readSessionCards. */
function makeCard(n, { level = 'HSK1', character, pronunciation } = {}) {
  return {
    id: `card-${n}`,
    character: character ?? `字${n}`,
    pronunciation: pronunciation ?? `pīn${n}`,
    definition: `meaning ${n}`,
    burmese_definition: `မ${n}`,
    level,
    sort_order: n,
  };
}

/** Build a pool of N cards in canonical sort order. */
function makePool(count, opts = {}) {
  return Array.from({ length: count }, (_, i) => makeCard(i + 1, opts));
}

/**
 * Swipe a card and return the studied-key set derived from the updated db.
 * direction: 'right' = learned, 'left' = review.
 */
function swipe(db, card, direction = 'right') {
  recordWordAction(db, { card, direction, levelId: card.level });
}

/** Build the studied key set from a test db. */
function studiedFrom(db) {
  return buildStudiedKeySet(getLearnedWords(db));
}

// ---------------------------------------------------------------------------
// 1. Consecutive ordered sessions advance
// ---------------------------------------------------------------------------

test('sessionBatch: ordered sessions advance — second session skips first N studied words', () => {
  const db = createTestDb();
  const pool = makePool(25);

  // Session 1: study first 10
  const s1 = buildNormalSessionCards(pool, new Set(), { sessionSize: 10 });
  assert.equal(s1.cards.length, 10, 'first session has 10 cards');
  assert.equal(s1.cards[0].id, 'card-1', 'first session starts at card-1');

  for (const card of s1.cards) swipe(db, card, 'right');

  // Session 2: should skip the 10 studied words
  const s2 = buildNormalSessionCards(pool, studiedFrom(db), { sessionSize: 10 });
  assert.equal(s2.cards.length, 10, 'second session has 10 cards');
  assert.equal(s2.cards[0].id, 'card-11', 'second session starts at card-11');
  assert.equal(s2.totalStudied, 10, 'totalStudied reflects first session');
});

test('sessionBatch: final session is smaller when fewer unstudied cards remain', () => {
  const db = createTestDb();
  const pool = makePool(12);

  // Study first 10
  const s1 = buildNormalSessionCards(pool, new Set(), { sessionSize: 10 });
  for (const card of s1.cards) swipe(db, card, 'right');

  // Session 2 should contain only 2 remaining cards
  const s2 = buildNormalSessionCards(pool, studiedFrom(db), { sessionSize: 10 });
  assert.equal(s2.cards.length, 2, 'last session contains remaining 2 cards');
});

// ---------------------------------------------------------------------------
// 2. Early exit: unswiped cards remain eligible
// ---------------------------------------------------------------------------

test('sessionBatch: early-exit preserves eligibility — unswiped cards appear in next session', () => {
  const db = createTestDb();
  const pool = makePool(20);

  // Session 1: present 10, only swipe 3
  const s1 = buildNormalSessionCards(pool, new Set(), { sessionSize: 10 });
  for (const card of s1.cards.slice(0, 3)) swipe(db, card, 'right');

  // Session 2 should exclude only the 3 swiped words
  const s2 = buildNormalSessionCards(pool, studiedFrom(db), { sessionSize: 10 });
  assert.equal(s2.totalStudied, 3, 'only 3 words are studied');
  assert.equal(s2.cards.length, 10, 'full session size from remaining 17 words');

  // The 3 studied words must not appear in session 2
  const s2Ids = new Set(s2.cards.map(c => c.id));
  for (const card of s1.cards.slice(0, 3)) {
    assert.ok(!s2Ids.has(card.id), `studied card ${card.id} must not re-appear`);
  }
  // The 7 unswiped words from session 1 must be offered again (they come first in canonical order)
  for (const card of s1.cards.slice(3)) {
    assert.ok(s2Ids.has(card.id), `unswiped card ${card.id} must reappear in session 2`);
  }
});

// ---------------------------------------------------------------------------
// 3. Left-swipe studied history survives Review removal
// ---------------------------------------------------------------------------

test('sessionBatch: left-swipe marks word studied; removing from Review does not erase studied record', () => {
  const db = createTestDb();
  const pool = makePool(5);

  // Left-swipe card 1
  swipe(db, pool[0], 'left');
  assert.equal(db.get('review_cards').length, 1, 'card added to review');

  // Remove from review queue manually (simulating user removing from review UI)
  db.set('review_cards', []);
  assert.equal(db.get('review_cards').length, 0, 'review queue cleared');

  // Studied record must still exist (seen >= 1)
  const studied = studiedFrom(db);
  const key = studyWordKey(pool[0]);
  assert.ok(studied.has(key), 'studied key survives review removal');

  // Session should not re-present the left-swiped word
  const s = buildNormalSessionCards(pool, studied, { sessionSize: 10 });
  const ids = new Set(s.cards.map(c => c.id));
  assert.ok(!ids.has(pool[0].id), 'left-swiped word excluded from next session');
});

// ---------------------------------------------------------------------------
// 4. Right-swiped words are not immediately re-queued
// ---------------------------------------------------------------------------

test('sessionBatch: right-swiped words are excluded from the next session', () => {
  const db = createTestDb();
  const pool = makePool(5);

  swipe(db, pool[0], 'right');
  const s = buildNormalSessionCards(pool, studiedFrom(db), { sessionSize: 10 });
  assert.ok(!s.cards.some(c => c.id === pool[0].id), 'right-swiped card not re-queued');
});

// ---------------------------------------------------------------------------
// 5. Database isolation — different language owners have independent progress
// ---------------------------------------------------------------------------

test('sessionBatch: progress is isolated per language scope', () => {
  const dbZh = createTestDb('zh');
  const dbJa = createTestDb('ja');
  const pool = makePool(5, { level: 'HSK1' });
  const poolJa = pool.map(c => ({ ...c, level: 'N5' }));

  // Swipe all ZH words
  for (const card of pool) swipe(dbZh, card, 'right');

  const studiedZh = buildStudiedKeySet(getLearnedWords(dbZh));
  const studiedJa = buildStudiedKeySet(getLearnedWords(dbJa));

  assert.equal(studiedZh.size, 5, 'zh scope has 5 studied words');
  assert.equal(studiedJa.size, 0, 'ja scope has 0 studied words — isolation confirmed');

  const zhSession = buildNormalSessionCards(pool, studiedZh, { sessionSize: 10 });
  const jaSession = buildNormalSessionCards(poolJa, studiedJa, { sessionSize: 10 });
  assert.equal(zhSession.allStudied, true, 'zh pool fully studied');
  assert.equal(jaSession.allStudied, false, 'ja pool not studied');
});

// ---------------------------------------------------------------------------
// 6. allStudied flag and empty cards on completion
// ---------------------------------------------------------------------------

test('sessionBatch: allStudied is true and cards is empty when all words have been studied', () => {
  const db = createTestDb();
  const pool = makePool(5);

  for (const card of pool) swipe(db, card, 'right');

  const result = buildNormalSessionCards(pool, studiedFrom(db), { sessionSize: 10 });
  assert.equal(result.allStudied, true);
  assert.equal(result.cards.length, 0);
  assert.equal(result.totalStudied, 5);
  assert.equal(result.totalActive, 5);
});

// ---------------------------------------------------------------------------
// 7. Newly added active words become eligible after studying all previous
// ---------------------------------------------------------------------------

test('sessionBatch: newly added words become eligible after all previous words studied', () => {
  const db = createTestDb();
  const pool = makePool(5);

  for (const card of pool) swipe(db, card, 'right');

  // Content refresh adds word 6
  const expandedPool = [...pool, makeCard(6)];
  const result = buildNormalSessionCards(expandedPool, studiedFrom(db), { sessionSize: 10 });
  assert.equal(result.allStudied, false, 'not all studied after content refresh');
  assert.equal(result.cards.length, 1, 'new word eligible');
  assert.equal(result.cards[0].id, 'card-6');
});

// ---------------------------------------------------------------------------
// 8. Duplicate swipe records do not inflate studied count
// ---------------------------------------------------------------------------

test('sessionBatch: duplicate swipe records do not inflate studied count', () => {
  const db = createTestDb();
  const pool = makePool(3);

  // Swipe card 1 multiple times
  swipe(db, pool[0], 'right');
  swipe(db, pool[0], 'left');
  swipe(db, pool[0], 'right');

  const studied = studiedFrom(db);
  assert.equal(studied.size, 1, 'only one unique key despite multiple swipes');
});

// ---------------------------------------------------------------------------
// 9. Guest 30-word pool enforced
// ---------------------------------------------------------------------------

test('sessionBatch: guest trial pool is capped at 30 words regardless of full pool size', () => {
  const pool = makePool(300);

  const result = buildNormalSessionCards(pool, new Set(), {
    sessionSize: 10,
    isGuest: true,
    guestTrialSize: 30,
  });

  assert.equal(result.trialSize, 30, 'trialSize reported');
  assert.equal(result.totalActive, 30, 'pool capped at 30 for guests');
  assert.equal(result.cards.length, 10, 'session size still respected');
  // All cards must come from the first 30
  for (const card of result.cards) {
    assert.ok(Number(card.id.replace('card-', '')) <= 30, `card ${card.id} within trial pool`);
  }
});

test('sessionBatch: guest trial pool is enforced through shuffle', () => {
  const pool = makePool(300);

  const result = buildNormalSessionCards(pool, new Set(), {
    shuffle: true,
    sessionSize: 10,
    isGuest: true,
    guestTrialSize: 30,
  });

  assert.equal(result.totalActive, 30, 'shuffle does not expand guest pool');
  for (const card of result.cards) {
    assert.ok(Number(card.id.replace('card-', '')) <= 30, `shuffled card ${card.id} within trial pool`);
  }
});

// ---------------------------------------------------------------------------
// 10. Repeat swipes on trial words don't expand trial allowance
// ---------------------------------------------------------------------------

test('sessionBatch: studying all 30 trial words sets allTrialStudied regardless of repeat swipes', () => {
  const db = createTestDb();
  const pool = makePool(300);
  const trialPool = pool.slice(0, 30);

  // Swipe each trial word twice
  for (const card of trialPool) { swipe(db, card, 'right'); swipe(db, card, 'left'); }

  const result = buildNormalSessionCards(pool, studiedFrom(db), {
    sessionSize: 10,
    isGuest: true,
    guestTrialSize: 30,
  });

  assert.equal(result.allTrialStudied, true, 'allTrialStudied after completing trial pool');
  assert.equal(result.allStudied, true, 'allStudied within the 30-word pool');
  assert.equal(result.cards.length, 0, 'no cards to show for guest trial completion');
});

// ---------------------------------------------------------------------------
// 11. Non-guest user: allTrialStudied is always false
// ---------------------------------------------------------------------------

test('sessionBatch: allTrialStudied is always false for signed-in learners', () => {
  const db = createTestDb();
  const pool = makePool(5);
  for (const card of pool) swipe(db, card, 'right');

  const result = buildNormalSessionCards(pool, studiedFrom(db), {
    sessionSize: 10,
    isGuest: false,
    guestTrialSize: 30,
  });

  assert.equal(result.allTrialStudied, false, 'allTrialStudied is false for signed-in learners');
  assert.equal(result.allStudied, true);
  assert.equal(result.trialSize, 0, 'trialSize is 0 for signed-in learners');
});

// ---------------------------------------------------------------------------
// 12. buildStudiedKeySet: empty/invalid rows handled safely
// ---------------------------------------------------------------------------

test('buildStudiedKeySet: empty and invalid learned_words rows are handled safely', () => {
  const keys = buildStudiedKeySet([null, undefined, {}, { seen: 0, character: '好', pronunciation: 'hǎo' }]);
  assert.equal(keys.size, 0, 'unseen or invalid rows produce no keys');
});

test('buildStudiedKeySet: rows with seen >= 1 produce keys', () => {
  const rows = [
    { character: '你', pronunciation: 'nǐ', seen: 1 },
    { character: '好', pronunciation: 'hǎo', seen: 2 },
  ];
  const keys = buildStudiedKeySet(rows);
  assert.equal(keys.size, 2);
});

// ---------------------------------------------------------------------------
// 13. Session does not mutate the active-cards input array
// ---------------------------------------------------------------------------

test('sessionBatch: buildNormalSessionCards does not mutate the input activeCards array', () => {
  const pool = makePool(10);
  const originalIds = pool.map(c => c.id);

  buildNormalSessionCards(pool, new Set(), { shuffle: true, sessionSize: 5 });

  assert.deepEqual(pool.map(c => c.id), originalIds, 'input array order preserved');
});

// ---------------------------------------------------------------------------
// 14. Progress completeness: totalStudied + unstudied = totalActive
// ---------------------------------------------------------------------------

test('sessionBatch: totalStudied + remaining unstudied equals totalActive', () => {
  const db = createTestDb();
  const pool = makePool(15);

  const swiped = 7;
  for (const card of pool.slice(0, swiped)) swipe(db, card, 'right');

  const result = buildNormalSessionCards(pool, studiedFrom(db), { sessionSize: 10 });
  assert.equal(result.totalStudied + result.cards.length + (pool.length - swiped - result.cards.length), result.totalActive);
  assert.equal(result.totalStudied, swiped);
  assert.equal(result.totalActive, 15);
});

// ---------------------------------------------------------------------------
// 15. Review and Saved sessions are NOT affected by new batching logic
//     (these sessions use readSessionCards which is unchanged)
// ---------------------------------------------------------------------------

test('sessionBatch: readSessionCards review mode returns all queued cards unchanged', () => {
  const db = createTestDb();
  const pool = makePool(5);

  // Swipe cards left into review
  for (const card of pool.slice(0, 3)) {
    swipe(db, card, 'left');
  }

  // readSessionCards review should return all review_cards (not filtered by studied)
  const reviewCards = readSessionCards(db, { mode: 'review' });
  assert.equal(reviewCards.length, 3, 'review session returns all 3 queued cards');
});

// ---------------------------------------------------------------------------
// 16. Full 30-word guest trial lifecycle across consecutive sessions
// ---------------------------------------------------------------------------

test('sessionBatch: guest trial advances 10 -> 20 -> 30 words and triggers completion', () => {
  const db = createTestDb();
  const pool = makePool(100);

  // Session 1: 1-10
  const s1 = buildNormalSessionCards(pool, studiedFrom(db), { isGuest: true, guestTrialSize: 30, sessionSize: 10 });
  assert.equal(s1.cards.length, 10);
  assert.equal(s1.cards[0].id, 'card-1');
  assert.equal(s1.allTrialStudied, false);
  for (const c of s1.cards) swipe(db, c, 'right');

  // Session 2: 11-20
  const s2 = buildNormalSessionCards(pool, studiedFrom(db), { isGuest: true, guestTrialSize: 30, sessionSize: 10 });
  assert.equal(s2.cards.length, 10);
  assert.equal(s2.cards[0].id, 'card-11');
  assert.equal(s2.allTrialStudied, false);
  for (const c of s2.cards) swipe(db, c, 'left'); // left-swipe still marks studied!

  // Session 3: 21-30
  const s3 = buildNormalSessionCards(pool, studiedFrom(db), { isGuest: true, guestTrialSize: 30, sessionSize: 10 });
  assert.equal(s3.cards.length, 10);
  assert.equal(s3.cards[0].id, 'card-21');
  assert.equal(s3.allTrialStudied, false);
  for (const c of s3.cards) swipe(db, c, 'right');

  // Session 4: all 30 trial words completed
  const s4 = buildNormalSessionCards(pool, studiedFrom(db), { isGuest: true, guestTrialSize: 30, sessionSize: 10 });
  assert.equal(s4.cards.length, 0);
  assert.equal(s4.allStudied, true);
  assert.equal(s4.allTrialStudied, true);
  assert.equal(s4.totalStudied, 30);
  assert.equal(s4.totalActive, 30);

  // After sign-in (isGuest: false), the remaining 70 curriculum words become eligible!
  const sSignedIn = buildNormalSessionCards(pool, studiedFrom(db), { isGuest: false, sessionSize: 10 });
  assert.equal(sSignedIn.cards.length, 10);
  assert.equal(sSignedIn.cards[0].id, 'card-31', 'signed-in user continues from card-31');
  assert.equal(sSignedIn.allStudied, false);
  assert.equal(sSignedIn.allTrialStudied, false);
});

// ---------------------------------------------------------------------------
// 17. studyWordKey preserves tone and distinct readings
// ---------------------------------------------------------------------------

test('sessionBatch: studyWordKey differentiates words with different tones or distinct readings', () => {
  const ma1 = { character: '妈', pronunciation: 'mā' };
  const ma2 = { character: '麻', pronunciation: 'má' };
  const ma3 = { character: '马', pronunciation: 'mǎ' };
  const ma4 = { character: '骂', pronunciation: 'mà' };

  const key1 = studyWordKey(ma1);
  const key2 = studyWordKey(ma2);
  const key3 = studyWordKey(ma3);
  const key4 = studyWordKey(ma4);

  assert.notEqual(key1, key2);
  assert.notEqual(key1, key3);
  assert.notEqual(key1, key4);
  assert.notEqual(key2, key3);
  assert.notEqual(key3, key4);
});

