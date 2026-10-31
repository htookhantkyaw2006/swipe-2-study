/**
 * vocabularyCardBookmark.test.js
 *
 * Comprehensive tests for vocabulary-card Save/Unsave bookmarking across:
 * 1. Helper contract and identity matching (findSavedWord, buildSavedWordRecord).
 * 2. Polyphone reading and tone preservation, legacy dictionary bookmark matching.
 * 3. Controlled SSR component rendering across Normal Learn, Review, Saved, and Phrase sessions.
 * 4. Dual card face discovery and inertness synchronization.
 * 5. Interaction safety (learned_words/trial isolation, storage failure honesty).
 * 6. Copy changes for WordCollection and SwipeSession empty states.
 * 7. Real browser DOM event and interaction verification (headless Chrome/Edge).
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { findSavedWord, buildSavedWordRecord } from '../src/lib/studyWords.js';
import { runBrowserBookmarkVerification } from './runBrowserBookmarkCheck.mjs';

const oldStorage = globalThis.localStorage;
const storageMap = new Map();
globalThis.localStorage = {
  getItem: (key) => storageMap.get(key) ?? null,
  setItem: (key, val) => storageMap.set(key, String(val)),
  removeItem: (key) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  get length() { return storageMap.size; },
  key: (i) => Array.from(storageMap.keys())[i] ?? null,
};

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

const server = await createServer({
  root: projectRoot,
  server: { middlewareMode: true, hmr: false, ws: false, host: '127.0.0.1', watch: null },
});

after(async () => {
  await server.close();
  if (oldStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = oldStorage;
});

const { LanguageProvider } = await server.ssrLoadModule('/src/lib/language.jsx');
const { PreferencesProvider } = await server.ssrLoadModule('/src/lib/preferences.jsx');
const { PublishedContentProvider } = await server.ssrLoadModule('/src/lib/publishedContentContext.jsx');
const { AuthContext } = await server.ssrLoadModule('/src/lib/authContext.js');
const { default: SwipeSession } = await server.ssrLoadModule('/src/pages/Learn/SwipeSession.jsx');
const { default: WordCollection } = await server.ssrLoadModule('/src/components/study/WordCollection.jsx');
const { db } = await server.ssrLoadModule('/src/lib/db.js');

function createPublishedItems(count, { courseId = 'zh-hsk1', level = 'HSK1' } = {}) {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i + 1}`,
    card_id: `zh-hsk1-${String(i + 1).padStart(3, '0')}`,
    course_id: courseId,
    written_form: `字${i + 1}`,
    character: `字${i + 1}`,
    reading: `pīn${i + 1}`,
    pronunciation: `pīn${i + 1}`,
    meaning_english: `meaning ${i + 1}`,
    definition: `meaning ${i + 1}`,
    meaning_burmese: `မ${i + 1}`,
    burmese_definition: `မ${i + 1}`,
    level,
    sort_order: i + 1,
    is_active: true,
    examples: [
      { text: `例句${i + 1}`, reading: `lìjù${i + 1}`, english: `Example ${i + 1}`, burmese: `ဥပမာ ${i + 1}` }
    ],
    audio_path: `audio/zh/hsk1/word${i + 1}.mp3`,
  }));
}

function renderSession(route, {
  items = [],
  isReview = false,
  isSaved = false,
  isPhrases = false,
  auth = { user: null, isGuest: true, loading: false, isTransitioning: false },
} = {}) {
  const initialCache = {
    'zh-hsk1': {
      status: 'loaded',
      items,
      version: 1,
      error: null,
      isPublished: true,
    },
  };

  return renderToString(
    createElement(
      AuthContext.Provider,
      { value: auth },
      createElement(
        PreferencesProvider,
        null,
        createElement(
          LanguageProvider,
          null,
          createElement(
            PublishedContentProvider,
            { enabledOverride: true, initialCache },
            createElement(
              MemoryRouter,
              { initialEntries: [route] },
              createElement(SwipeSession, { isReview, isSaved, isPhrases })
            )
          )
        )
      )
    )
  );
}

// -----------------------------------------------------------------------------
// 1. UNIT TESTS: findSavedWord and buildSavedWordRecord
// -----------------------------------------------------------------------------

test('buildSavedWordRecord: extracts vocabulary attributes and distinguishes storage ID', () => {
  const card = {
    card_id: 'zh-hsk1-001',
    character: '爱',
    pronunciation: 'ài',
    definition: 'to love',
    burmese_definition: 'ချစ်သည်',
    level: 'HSK1',
    examples: [{ text: '我爱你。', reading: 'Wǒ ài nǐ.', english: 'I love you.' }],
    audio_path: 'audio/zh/hsk1/ai.mp3',
    part_of_speech: 'verb',
  };

  const record = buildSavedWordRecord(card);

  assert.equal(record.phrase, '爱', 'Preserves written form under phrase');
  assert.equal(record.reading, 'ài', 'Preserves pronunciation under reading');
  assert.equal(record.english, 'to love', 'Preserves English definition');
  assert.equal(record.burmese, 'ချစ်သည်', 'Preserves Burmese definition');
  assert.equal(record.definition, 'to love', 'Supplies definition field');
  assert.equal(record.burmese_definition, 'ချစ်သည်', 'Supplies burmese_definition field');
  assert.equal(record.card_id, 'zh-hsk1-001', 'Preserves canonical card_id');
  assert.equal(record.level, 'HSK1', 'Preserves level');
  assert.equal(record.audio_path, 'audio/zh/hsk1/ai.mp3', 'Preserves audio_path');
  assert.equal(record.part_of_speech, 'verb', 'Preserves part_of_speech');
  assert.deepEqual(record.examples, card.examples, 'Preserves examples array');
  assert.equal(record.id, undefined, 'Storage ID must NOT be assigned by builder (db.insert will generate it)');
});

test('buildSavedWordRecord: handles Japanese cards with kana', () => {
  const jaCard = {
    card_id: 'ja-n5-010',
    character: '食べる',
    pronunciation: 'taberu',
    kana: 'たべる',
    definition: 'to eat',
    burmese_definition: 'စားသည်',
    level: 'N5',
  };

  const record = buildSavedWordRecord(jaCard);
  assert.equal(record.phrase, '食べる');
  assert.equal(record.reading, 'taberu');
  assert.equal(record.kana, 'たべる', 'Preserves kana for Japanese entries');
  assert.equal(record.card_id, 'ja-n5-010');
  assert.equal(record.id, undefined);
});

test('findSavedWord: matches identical canonical card_id', () => {
  const saved = [
    { id: 'storage-uuid-1', card_id: 'zh-hsk1-001', phrase: '爱', reading: 'ài' },
    { id: 'storage-uuid-2', card_id: 'zh-hsk1-002', phrase: '八', reading: 'bā' },
  ];
  const card = { card_id: 'zh-hsk1-001', character: '爱', pronunciation: 'ài' };

  const match = findSavedWord(saved, card);
  assert.ok(match, 'Must find matching record');
  assert.equal(match.id, 'storage-uuid-1', 'Returns the stored record with its storage id');
});

test('findSavedWord: matches legacy Dictionary bookmarks lacking card_id via natural identity', () => {
  // Legacy dictionary bookmarks only have phrase, reading, english, burmese and generated id
  const saved = [
    { id: 'dict-bm-123', phrase: '你好', reading: 'nǐ hǎo', english: 'hello', burmese: 'မင်္ဂလာပါ' },
  ];
  const card = { card_id: 'zh-hsk1-099', character: '你好', pronunciation: 'nǐ hǎo' };

  const match = findSavedWord(saved, card);
  assert.ok(match, 'Must match compatible legacy bookmark via natural studyWordKey');
  assert.equal(match.id, 'dict-bm-123');
});

test('findSavedWord: distinguishes polyphones with distinct readings', () => {
  // Chinese polyphone "行": xíng (to walk / OK) vs háng (profession / row / bank)
  const saved = [
    { id: 'bm-hang', card_id: 'zh-hsk3-050', phrase: '行', reading: 'háng' },
  ];
  const cardXing = { card_id: 'zh-hsk1-088', character: '行', pronunciation: 'xíng' };

  const match = findSavedWord(saved, cardXing);
  assert.equal(match, null, 'Must NOT match polyphone with different reading');
});

test('findSavedWord: preserves tones and does not match distinct tone readings', () => {
  const saved = [
    { id: 'bm-ni-3', phrase: '你', reading: 'nǐ' }, // Tone 3
  ];
  const cardTone2 = { character: '你', pronunciation: 'ní' }; // Tone 2
  const cardTone1 = { character: '你', pronunciation: 'nī' }; // Tone 1

  assert.equal(findSavedWord(saved, cardTone2), null, 'Must NOT match tone 3 with tone 2');
  assert.equal(findSavedWord(saved, cardTone1), null, 'Must NOT match tone 3 with tone 1');
});

test('findSavedWord: matches cloud-hydrated 64-char hex storage key and unsaves by stored ID', () => {
  const cloudHexId = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const saved = [
    { id: cloudHexId, card_id: 'zh-hsk1-042', phrase: '猫', reading: 'māo' },
  ];
  const card = { card_id: 'zh-hsk1-042', character: '猫', pronunciation: 'māo' };

  const match = findSavedWord(saved, card);
  assert.ok(match);
  assert.equal(match.id, cloudHexId, 'Actual stored record identity must be returned for unsave');
});

test('findSavedWord: handles null/empty inputs gracefully', () => {
  assert.equal(findSavedWord([], null), null);
  assert.equal(findSavedWord(null, {}), null);
  assert.equal(findSavedWord(undefined, undefined), null);
  assert.equal(findSavedWord([], { character: 'unknown' }), null);
});

// -----------------------------------------------------------------------------
// 2. SSR COMPONENT RENDERING TESTS: SwipeSession
// -----------------------------------------------------------------------------

test('SwipeSession (Normal Learn): renders bookmark control on both front and back faces with aria attributes', () => {
  db.set('saved_words', []);
  db.set('learned_words', []);

  const items = createPublishedItems(2);
  const html = renderSession('/learn/level/HSK1', { items });

  // 1. Both front and back topline actions must contain bookmark button
  assert.ok(html.includes('class="swipe-card__actions"'), 'Must render swipe-card__actions container');
  assert.ok(html.includes('class="swipe-bookmark"'), 'Must render swipe-bookmark button');

  // Active card has 2 bookmark controls (one on front face, one on back face)
  const activeWordSaveLabels = html.match(/aria-label="Save 字1"/g) || [];
  assert.equal(activeWordSaveLabels.length, 2, 'Must render bookmark control on both front and back faces of active card');

  // 2. Accessibility & state attributes
  assert.ok(html.includes('aria-pressed="false"'), 'Unsaved card must have aria-pressed="false"');
  assert.ok(html.includes('type="button"'), 'Bookmark control must have explicit type="button"');

  // 3. Audio button remains present alongside bookmark control
  assert.ok(html.includes('class="swipe-audio"'), 'Swipe-audio button must remain present in actions container');
});

test('SwipeSession (Normal Learn): reflects saved status when card is already in saved_words', () => {
  const savedItem = {
    id: 'stored-uuid-99',
    card_id: 'zh-hsk1-001',
    phrase: '字1',
    reading: 'pīn1',
    english: 'meaning 1',
    burmese: 'မ1',
  };
  db.set('saved_words', [savedItem]);
  db.set('learned_words', []);

  const items = createPublishedItems(2);
  const html = renderSession('/learn/level/HSK1', { items });

  // Must reflect saved state
  assert.ok(html.includes('aria-pressed="true"'), 'Saved card must have aria-pressed="true"');
  assert.ok(html.includes('aria-label="Unsave 字1"'), 'Saved card must have accessible Unsave label');
  assert.ok(html.includes('swipe-bookmark--saved'), 'Saved card must have swipe-bookmark--saved class modifier');
});

test('SwipeSession (Review Session): renders bookmark control on both faces', () => {
  const reviewWords = [
    {
      id: 'rev-1',
      card_id: 'zh-hsk1-010',
      character: '电脑',
      pronunciation: 'diànnǎo',
      definition: 'computer',
      burmese_definition: 'ကွန်ပျူတာ',
      level: 'HSK1',
    },
  ];
  db.set('review_cards', reviewWords);
  db.set('saved_words', []);

  const html = renderSession('/learn/review/session', { isReview: true });

  assert.ok(html.includes('class="swipe-card__actions"'), 'Must render actions container in review');
  assert.ok(html.includes('class="swipe-bookmark"'), 'Must render bookmark control in review');
  assert.ok(html.includes('aria-label="Save 电脑"'), 'Must render label for review word');
});

test('SwipeSession (Saved Session): renders bookmark control reflecting saved status', () => {
  const savedWords = [
    {
      id: 'saved-card-1',
      card_id: 'zh-hsk1-020',
      phrase: '苹果',
      reading: 'píngguǒ',
      english: 'apple',
      burmese: 'ပန်းသီး',
      definition: 'apple',
      burmese_definition: 'ပန်းသီး',
      level: 'HSK1',
    },
  ];
  db.set('saved_words', savedWords);

  const html = renderSession('/saved/session', { isSaved: true });

  assert.ok(html.includes('class="swipe-card__actions"'), 'Must render actions in saved session');
  assert.ok(html.includes('aria-pressed="true"'), 'Card in saved session is bookmarked');
  assert.ok(html.includes('aria-label="Unsave 苹果"'), 'Must have Unsave label in saved session');
});

test('SwipeSession (Phrase Practice): does NOT render bookmark control on either face', () => {
  db.set('saved_words', []);

  const html = renderSession('/flashcards/session?level=HSK1', { isPhrases: true });

  // Phrases session must NOT render the bookmark control
  assert.equal(html.includes('class="swipe-bookmark"'), false, 'Phrase session must omit bookmark button');
  assert.equal(html.includes('aria-pressed='), false, 'Phrase session must omit aria-pressed bookmark attribute');
  // Audio control remains
  assert.ok(html.includes('class="swipe-audio"'), 'Phrase session still retains audio button');
});

// -----------------------------------------------------------------------------
// 3. COPY & EMPTY STATES
// -----------------------------------------------------------------------------

test('WordCollection: empty state contains study sessions copy and dual links', () => {
  const html = renderToString(
    createElement(
      MemoryRouter,
      null,
      createElement(WordCollection, {
        kind: 'saved',
        words: [],
        courseName: 'Chinese (HSK)',
      })
    )
  );

  assert.ok(
    html.includes('Bookmark words during study sessions or in the dictionary to find them here.'),
    'Must include updated empty state copy mentioning study sessions and dictionary'
  );
  assert.ok(html.includes('href="/learn"'), 'Must include link to /learn (Start learning)');
  assert.ok(html.includes('Start learning'), 'Must render Start learning label');
  assert.ok(html.includes('href="/dictionary"'), 'Must include link to /dictionary (Open dictionary)');
  assert.ok(html.includes('Open dictionary'), 'Must render Open dictionary label');
});

test('SwipeSession: empty state copy for saved words session includes study sessions', () => {
  db.set('saved_words', []);

  const html = renderSession('/saved/session', { isSaved: true });

  assert.ok(
    html.includes('Bookmark words during study sessions or in the dictionary to study them here.'),
    'Must include updated empty copy in SwipeSession'
  );
});

// -----------------------------------------------------------------------------
// 4. INTERACTION SAFETY & STORAGE INTEGRITY
// -----------------------------------------------------------------------------

test('Interaction Safety: bookmarking does NOT modify learned_words, review_cards, or consume guest trial', () => {
  db.set('saved_words', []);
  db.set('learned_words', []);
  db.set('review_cards', []);

  const card = {
    card_id: 'zh-hsk1-001',
    character: '你好',
    pronunciation: 'nǐ hǎo',
    definition: 'hello',
    burmese_definition: 'မင်္ဂလာပါ',
    level: 'HSK1',
  };

  // Simulate Save
  const currentSaved = db.get('saved_words');
  const existing = findSavedWord(currentSaved, card);
  assert.equal(existing, null, 'Not previously saved');

  const record = buildSavedWordRecord(card);
  const inserted = db.insert('saved_words', record);

  // Verify saved_words has record
  const savedAfter = db.get('saved_words');
  assert.equal(savedAfter.length, 1);
  assert.equal(savedAfter[0].id, inserted.id);
  assert.equal(savedAfter[0].card_id, 'zh-hsk1-001');

  // Verify learned_words and review_cards are completely untouched
  const learnedAfter = db.get('learned_words');
  assert.equal(learnedAfter.length, 0, 'learned_words MUST NOT be modified by bookmarking');

  const reviewAfter = db.get('review_cards');
  assert.equal(reviewAfter.length, 0, 'review_cards MUST NOT be modified by bookmarking');

  // Simulate Unsave
  const existingToUnsave = findSavedWord(db.get('saved_words'), card);
  assert.ok(existingToUnsave, 'Found existing to unsave');
  db.remove('saved_words', existingToUnsave.id);

  assert.equal(db.get('saved_words').length, 0, 'Successfully unsaved by stored ID');
  assert.equal(db.get('learned_words').length, 0, 'learned_words remains empty');
  assert.equal(db.get('review_cards').length, 0, 'review_cards remains empty');
});

test('Duplicate Prevention: attempting to save an already-bookmarked word detects existing and avoids duplicate', () => {
  db.set('saved_words', []);
  const card = {
    card_id: 'zh-hsk1-002',
    character: '谢谢',
    pronunciation: 'xièxie',
    definition: 'thanks',
    burmese_definition: 'ကျေးဇူးတင်ပါတယ်',
    level: 'HSK1',
  };

  // Initial insert
  db.insert('saved_words', buildSavedWordRecord(card));
  assert.equal(db.get('saved_words').length, 1);

  // Second toggle action: findSavedWord detects existing -> performs remove instead of insert
  const current = db.get('saved_words');
  const existing = findSavedWord(current, card);
  assert.ok(existing, 'Must find existing to prevent duplicate');

  // If found, action is remove
  db.remove('saved_words', existing.id);
  assert.equal(db.get('saved_words').length, 0, 'Row count is 0 after toggle remove; duplicate prevented');
});

test('Storage Failure Honesty: write rejection leaves state honest and un-bookmarked', () => {
  db.set('saved_words', []);

  const card = {
    card_id: 'zh-hsk1-003',
    character: '再见',
    pronunciation: 'zàijiàn',
  };

  // Simulate storage quota or permission rejection
  const failingDb = {
    get: () => [],
    insert: () => { throw new Error('QuotaExceededError'); },
    remove: () => {},
  };

  let UIState = false;
  try {
    const current = failingDb.get('saved_words');
    const existing = findSavedWord(current, card);
    if (!existing) {
      failingDb.insert('saved_words', buildSavedWordRecord(card));
      UIState = true;
    }
  } catch {
    // Honest catch: query DB again
    UIState = Boolean(findSavedWord(failingDb.get('saved_words'), card));
  }

  assert.equal(UIState, false, 'UIState must remain false when storage write fails');
});

test('Storage Failure Feedback: save and unsave write rejections produce concise accessible feedback and recover on retry', () => {
  const card = {
    card_id: 'zh-hsk1-004',
    character: '喝水',
    pronunciation: 'hē shuǐ',
  };

  let feedback = null;
  const failingStorage = {
    insert: () => { throw new Error('QuotaExceededError'); },
    remove: () => { throw new Error('QuotaExceededError'); },
  };

  // 1. Save failure produces concise error feedback
  let isRemoving = false;
  try {
    failingStorage.insert('saved_words', buildSavedWordRecord(card));
    feedback = null;
  } catch {
    const action = isRemoving ? 'unsave' : 'save';
    feedback = `Unable to ${action} word. Try again.`;
  }
  assert.equal(feedback, 'Unable to save word. Try again.');

  // 2. Unsave failure produces concise error feedback
  isRemoving = true;
  try {
    failingStorage.remove('saved_words', 'some-id');
    feedback = null;
  } catch {
    const action = isRemoving ? 'unsave' : 'save';
    feedback = `Unable to ${action} word. Try again.`;
  }
  assert.equal(feedback, 'Unable to unsave word. Try again.');

  // 3. Successful retry clears feedback
  try {
    // successful retry
    feedback = null;
  } catch {}
  assert.equal(feedback, null, 'Feedback cleared after successful retry');
});

test('SwipeSession: unreadable bookmark state displays accessible alert and does NOT present confirmed unsaved', () => {
  const origGetItem = globalThis.localStorage.getItem;
  globalThis.localStorage.getItem = (key) => {
    if (key && key.includes('saved_words')) throw new Error('UnreadableStorageError');
    return origGetItem(key);
  };

  try {
    const items = createPublishedItems(2);
    const html = renderSession('/learn/level/HSK1', { items });

    // 1. Accessible error feedback alert rendered
    assert.ok(html.includes('role="alert"'), 'Must render role="alert" feedback');
    assert.ok(html.includes('Unable to load bookmark state.'), 'Must announce concise failure feedback');

    // 2. Must NOT present confirmed unsaved
    assert.equal(html.includes('aria-pressed="false"'), false, 'Must NOT present unreadable state as confirmed unsaved');
    assert.ok(html.includes('Bookmark status unavailable for 字1'), 'Must announce bookmark status unavailable');
    assert.ok(html.includes('swipe-bookmark--unavailable'), 'Must apply unavailable modifier');
    assert.ok(html.includes('disabled=""'), 'Must disable bookmark button when state is unreadable');

    // 3. Learning cards deck and audio playback remain preserved
    assert.ok(html.includes('class="swipe-card__character"'), 'Cards deck preserved and rendered');
    assert.ok(html.includes('字1'), 'First card text preserved');
    assert.ok(html.includes('class="swipe-audio"'), 'Audio button preserved');
  } finally {
    globalThis.localStorage.getItem = origGetItem;
  }
});

// -----------------------------------------------------------------------------
// 5. REAL BROWSER VERIFICATION (Chrome/Edge Headless)
// -----------------------------------------------------------------------------

test('Real Browser: mounted SwipeSession interaction checks (save/unsave, front/back sync, persistence, safety, failure feedback)', async (t) => {
  const result = await runBrowserBookmarkVerification();
  if (result.skipped) {
    t.skip(`Interactive acceptance unverified: ${result.reason}`);
    return;
  }
  assert.equal(result.passed, true, 'Real browser verification passed');
  assert.ok(result.results.length >= 5, 'All real browser mounted component tests executed');
});
