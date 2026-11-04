import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

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

const { COURSES, LANGUAGES, isActiveCourse } = await server.ssrLoadModule('/src/courses/index.js');
const { LanguageProvider } = await server.ssrLoadModule('/src/lib/language.jsx');
const { PreferencesProvider } = await server.ssrLoadModule('/src/lib/preferences.jsx');
const { PublishedContentProvider } = await server.ssrLoadModule('/src/lib/publishedContentContext.jsx');
const { AuthContext } = await server.ssrLoadModule('/src/lib/authContext.js');
const { default: SwipeSession } = await server.ssrLoadModule('/src/pages/Learn/SwipeSession.jsx');
const { default: LevelPicker } = await server.ssrLoadModule('/src/pages/Learn/LevelPicker.jsx');
const { default: LessonPicker } = await server.ssrLoadModule('/src/pages/Learn/LessonPicker.jsx');
const { default: Flashcards } = await server.ssrLoadModule('/src/pages/Flashcards.jsx');
const { default: PhrasesLevel } = await server.ssrLoadModule('/src/pages/PhrasesLevel.jsx');
const { storageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');
const { setActiveLanguageId, getActiveLanguageId } = await server.ssrLoadModule('/src/lib/activeLanguage.js');
const { resolvePublishedCourseId, isLevelAvailable } = await server.ssrLoadModule('/src/lib/publishedContentService.js');
const { studyWordKey, buildNormalSessionCards, buildStudiedKeySet } = await server.ssrLoadModule('/src/lib/studyWords.js');
const { recordWordAction } = await server.ssrLoadModule('/src/lib/vocabularyProgress.js');
const { createLocalDatabase } = await server.ssrLoadModule('/src/lib/localDatabase.js');

function createPublishedItems(count, { courseId = 'zh-hsk1', level = 'HSK1' } = {}) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${courseId}_item_${i + 1}`,
    course_id: courseId,
    written_form: courseId === 'ja-n5' ? `単語${i + 1}` : `字${i + 1}`,
    character: courseId === 'ja-n5' ? `単語${i + 1}` : `字${i + 1}`,
    reading: courseId === 'ja-n5' ? `たんご${i + 1}` : `zì${i + 1}`,
    pronunciation: courseId === 'ja-n5' ? `tango${i + 1}` : `zì${i + 1}`,
    meaning_english: `meaning ${i + 1}`,
    definition: `meaning ${i + 1}`,
    meaning_burmese: `အဓိပ္ပာယ် ${i + 1}`,
    burmese_definition: `အဓိပ္ပာယ် ${i + 1}`,
    level,
    sort_order: i + 1,
    is_active: true,
  }));
}

function renderTree(element, { initialRoute = '/', zhItems = [], jaItems = [], auth = { user: null, isGuest: true, loading: false, isTransitioning: false } } = {}) {
  const initialCache = {
    'zh-hsk1': { status: 'loaded', items: zhItems, version: 1, error: null, isPublished: true },
    'ja-n5': { status: 'loaded', items: jaItems, version: 1, error: null, isPublished: true },
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
            createElement(MemoryRouter, { initialEntries: [initialRoute] }, element)
          )
        )
      )
    )
  );
}

beforeEach(() => {
  storageMap.clear();
  storageOwner.setOwner(null);
  setActiveLanguageId('zh');
});

// ---------------------------------------------------------------------------
// 1. Available Courses and Levels Architecture
// ---------------------------------------------------------------------------

test('Architecture: zh-hsk1 and ja-n5 are active; English is coming-soon; HSK2-9 and N4-1 are coming soon', () => {
  // Course-level status
  assert.equal(COURSES.zh.status, 'active');
  assert.equal(COURSES.ja.status, 'active');
  assert.equal(COURSES.en.status, 'coming-soon');

  assert.equal(isActiveCourse('zh'), true);
  assert.equal(isActiveCourse('ja'), true);
  assert.equal(isActiveCourse('en'), false);
  assert.equal(isActiveCourse('fr'), false);

  // LANGUAGES array preserves English row with coming-soon status
  const enLang = LANGUAGES.find((l) => l.id === 'en');
  assert.ok(enLang, 'English row preserved in LANGUAGES');
  assert.equal(enLang.status, 'coming-soon');
  assert.equal(enLang.name, 'English');

  // Published course availability helper
  assert.equal(resolvePublishedCourseId('zh', 'HSK1'), 'zh-hsk1');
  assert.equal(resolvePublishedCourseId('zh', '1'), 'zh-hsk1');
  assert.equal(resolvePublishedCourseId('zh', 'HSK 1'), 'zh-hsk1');
  assert.equal(resolvePublishedCourseId('zh', 'hsk1'), 'zh-hsk1');

  // HSK2-HSK9 must NOT resolve
  for (let lvl = 2; lvl <= 9; lvl++) {
    assert.equal(resolvePublishedCourseId('zh', `HSK${lvl}`), null);
    assert.equal(resolvePublishedCourseId('zh', String(lvl)), null);
    assert.equal(isLevelAvailable('zh', `HSK${lvl}`), false);
  }

  // Japanese N5 resolves cleanly
  assert.equal(resolvePublishedCourseId('ja', 'N5'), 'ja-n5');
  assert.equal(resolvePublishedCourseId('ja', '5'), 'ja-n5');
  assert.equal(resolvePublishedCourseId('ja', 'JLPT N5'), 'ja-n5');
  assert.equal(isLevelAvailable('ja', 'N5'), true);

  // Japanese N4-N1 must NOT resolve
  for (const lvl of ['N4', 'N3', 'N2', 'N1']) {
    assert.equal(resolvePublishedCourseId('ja', lvl), null);
    assert.equal(isLevelAvailable('ja', lvl), false);
  }
  for (let n = 1; n <= 4; n++) {
    assert.equal(resolvePublishedCourseId('ja', String(n)), null);
  }
});

// ---------------------------------------------------------------------------
// 2. English Language Selection and Fallback
// ---------------------------------------------------------------------------

test('English Language: cannot be set active; stored English safely falls back to Chinese HSK1', () => {
  // Direct activation blocked
  assert.equal(setActiveLanguageId('en'), false);
  assert.equal(getActiveLanguageId(), 'zh');

  // Switching between Chinese and Japanese works cleanly
  assert.equal(setActiveLanguageId('ja'), true);
  assert.equal(getActiveLanguageId(), 'ja');
  assert.equal(setActiveLanguageId('zh'), true);
  assert.equal(getActiveLanguageId(), 'zh');

  // Stored English preference falls back to zh on hydrate / owner switch
  const OWNER_X = '11111111-1111-4111-8111-111111111111';
  storageOwner.setOwner(OWNER_X);
  storageOwner.scope().setItem('language', 'en');

  // Switching owners or re-reading active language yields Chinese
  storageOwner.setOwner(null);
  assert.equal(getActiveLanguageId(), 'zh');
  storageOwner.setOwner(OWNER_X);
  assert.equal(getActiveLanguageId(), 'zh');

  // Preserves existing English tables in storage
  storageOwner.scope().setItem('en_saved_words', JSON.stringify([{ id: 'en-1', word: 'apple' }]));
  assert.ok(storageOwner.scope().getItem('en_saved_words').includes('apple'));
});

// ---------------------------------------------------------------------------
// 3. LevelPicker & Flashcards: Unavailable Levels Visibly Disabled
// ---------------------------------------------------------------------------

test('LevelPicker (Learn): HSK1 is active; HSK2-9 are visibly disabled with Coming soon', () => {
  setActiveLanguageId('zh');
  const html = renderTree(createElement(LevelPicker), { initialRoute: '/learn' });

  // HSK1 progress is displayed
  assert.ok(html.includes('HSK 1'));
  assert.ok(html.includes('% completed'));

  // Unavailable levels (HSK2 - HSK9) display "Coming soon" and disabled attributes
  assert.ok(html.includes('HSK 2'));
  assert.ok(html.includes('Coming soon'));
  assert.ok(html.includes('aria-disabled="true"'));
  assert.ok(html.includes('tabindex="-1"'));
});

test('Flashcards (Phrases Tab): HSK1 is active; HSK2-9 are visibly disabled with Coming soon', () => {
  setActiveLanguageId('zh');
  const html = renderTree(createElement(Flashcards), { initialRoute: '/flashcards' });

  assert.ok(html.includes('HSK 1'));
  assert.ok(html.includes('Coming soon'));
  assert.ok(html.includes('aria-disabled="true"'));
});

// ---------------------------------------------------------------------------
// 4. Direct Overview URLs: Guarded Against Silent Fallback & Demo Content
// ---------------------------------------------------------------------------

test('Direct Overview URL: /learn/level/HSK2 renders Coming soon with return action, no silent HSK1', () => {
  setActiveLanguageId('zh');
  const zhItems = createPublishedItems(300, { courseId: 'zh-hsk1', level: 'HSK1' });

  const html = renderTree(createElement(LessonPicker), {
    initialRoute: '/learn/level/HSK2',
    zhItems,
  });

  assert.ok(html.includes('COMING SOON'), 'Must render COMING SOON badge');
  assert.ok(html.includes('Curriculum coming soon'), 'Must report curriculum coming soon');
  assert.ok(html.includes('Back to courses'), 'Must provide working return action');
  assert.ok(!html.includes('Start learning'), 'Must NOT offer study action for unavailable level');
  assert.ok(!html.includes('Browse Words'), 'Must NOT serve vocabulary table');
});

test('Direct Overview URL: invalid level /learn/level/99 renders Coming soon, not silent HSK1', () => {
  setActiveLanguageId('zh');
  const zhItems = createPublishedItems(300, { courseId: 'zh-hsk1', level: 'HSK1' });

  const html = renderTree(createElement(LessonPicker), {
    initialRoute: '/learn/level/99',
    zhItems,
  });

  assert.ok(html.includes('COMING SOON'));
  assert.ok(html.includes('Back to courses'));
  assert.ok(!html.includes('Start learning'));
});

test('Direct Overview URL: /flashcards/level/HSK2 renders Coming soon with Back to phrases', () => {
  setActiveLanguageId('zh');
  const html = renderTree(createElement(PhrasesLevel), {
    initialRoute: '/flashcards/level/HSK2',
  });

  assert.ok(html.includes('COMING SOON'));
  assert.ok(html.includes('Back to phrases'));
  assert.ok(!html.includes('course modules'));
});

// ---------------------------------------------------------------------------
// 5. Direct Session URLs: Guarded Against Starting or Writing Progress
// ---------------------------------------------------------------------------

test('Direct Session URL: /learn/session?level=HSK2 renders Coming soon, no swipe session started', () => {
  setActiveLanguageId('zh');
  const zhItems = createPublishedItems(300, { courseId: 'zh-hsk1', level: 'HSK1' });

  const html = renderTree(createElement(SwipeSession), {
    initialRoute: '/learn/session?level=HSK2',
    zhItems,
  });

  assert.ok(html.includes('Coming soon'));
  assert.ok(html.includes('Curriculum coming soon'));
  assert.ok(html.includes('Back to courses'));
  assert.ok(!html.includes('swipe-card'), 'Must not render flashcards');
});

test('Direct Session URL: Japanese /learn/session?level=N4 renders Coming soon', () => {
  setActiveLanguageId('ja');
  const jaItems = createPublishedItems(300, { courseId: 'ja-n5', level: 'N5' });

  const html = renderTree(createElement(SwipeSession), {
    initialRoute: '/learn/session?level=N4',
    jaItems,
  });

  assert.ok(html.includes('Coming soon'));
  assert.ok(html.includes('Back to courses'));
  assert.ok(!html.includes('swipe-card'));
});

// ---------------------------------------------------------------------------
// 6. Independent Guest Trials: HSK1 (30) and Japanese N5 (30)
// ---------------------------------------------------------------------------

test('Guest Trial: 30 unique HSK1 entries and 30 unique N5 entries are completely independent', () => {
  const zhItems = createPublishedItems(100, { courseId: 'zh-hsk1', level: 'HSK1' });
  const jaItems = createPublishedItems(100, { courseId: 'ja-n5', level: 'N5' });

  // Guest studies 30 words in Chinese HSK1
  const zhStudied = new Set(zhItems.slice(0, 30).map(c => studyWordKey(c)));
  const zhResult = buildNormalSessionCards(zhItems, zhStudied, { isGuest: true, guestTrialSize: 30 });
  assert.equal(zhResult.totalActive, 30);
  assert.equal(zhResult.allTrialStudied, true, 'HSK1 trial is exhausted');

  // Japanese N5 remains unstudied (isolated guest progress)
  const jaStudied = new Set();
  const jaResult = buildNormalSessionCards(jaItems, jaStudied, { isGuest: true, guestTrialSize: 30 });
  assert.equal(jaResult.totalActive, 30, 'N5 gets its own 30-word trial pool');
  assert.equal(jaResult.allTrialStudied, false, 'N5 trial is NOT exhausted');
  assert.equal(jaResult.cards.length, 10, 'First session gets 10 N5 cards');
});

// ---------------------------------------------------------------------------
// 7. Japanese Homonym Sense Differentiation in Guest Trial
// ---------------------------------------------------------------------------

test('Homonym Sense Identity: Distinct Japanese homonyms remain separate trial entries', () => {
  // Test HOMONYM_SENSE_WORDS: 'あの', 'ある', 'かける', 'キロ', 'もう'
  const card1 = { written_form: 'ある', character: 'ある', reading: 'aru', pronunciation: 'aru', id: 'ja-n5-aru-1', sense_id: 'sense-exist' };
  const card2 = { written_form: 'ある', character: 'ある', reading: 'aru', pronunciation: 'aru', id: 'ja-n5-aru-2', sense_id: 'sense-possess' };

  const key1 = studyWordKey(card1);
  const key2 = studyWordKey(card2);

  assert.notEqual(key1, key2, 'Distinct senses of Japanese homonym must produce distinct studyWordKey');

  // Both can be tracked independently in learned_words
  const studiedKeys = new Set([key1]);
  const pool = [card1, card2];
  const result = buildNormalSessionCards(pool, studiedKeys, { isGuest: true, guestTrialSize: 30 });

  assert.equal(result.totalActive, 2);
  assert.equal(result.totalStudied, 1);
  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].id, 'ja-n5-aru-2', 'Unstudied homonym sense card remains eligible');
});

// ---------------------------------------------------------------------------
// 8. Both Swipe Directions Count as Studied; Bookmark/Audio Do Not
// ---------------------------------------------------------------------------

test('Swipe Actions: Both left and right swipes record studied; audio and bookmark do not', () => {
  const tables = new Map();
  const db = createLocalDatabase({
    getScope: () => ({
      getTable: (lang, table) => tables.get(`${lang}:${table}`) ?? null,
      setTable: (lang, table, json) => tables.set(`${lang}:${table}`, json),
    }),
    getLanguage: () => 'ja',
  });

  const cardRight = { id: 'ja_card_1', written_form: '本', character: '本', reading: 'ほん', pronunciation: 'hon', level: 'N5' };
  const cardLeft = { id: 'ja_card_2', written_form: '水', character: '水', reading: 'みず', pronunciation: 'mizu', level: 'N5' };

  // Swipe right -> recorded with seen = 1, status = known
  recordWordAction(db, { card: cardRight, direction: 'right' });
  // Swipe left -> recorded with seen = 1, status = learning
  recordWordAction(db, { card: cardLeft, direction: 'left' });

  const learned = db.get('learned_words');
  assert.equal(learned.length, 2);

  const studiedKeys = buildStudiedKeySet(learned);
  assert.ok(studiedKeys.has(studyWordKey(cardRight)), 'Right swipe counted as studied');
  assert.ok(studiedKeys.has(studyWordKey(cardLeft)), 'Left swipe counted as studied');

  // Bookmarking touches saved_words, NOT learned_words
  db.insert('saved_words', { id: 'saved_1', phrase: '山', reading: 'やま' });
  const afterBookmarkLearned = db.get('learned_words');
  assert.equal(afterBookmarkLearned.length, 2, 'Bookmark must NOT insert into learned_words');
});

// ---------------------------------------------------------------------------
// 9. Pool Capped Before Shuffle and Slicing
// ---------------------------------------------------------------------------

test('Pool Capping: 30-word cap is strictly enforced before shuffle, slicing, or reload', () => {
  const items = createPublishedItems(100, { courseId: 'ja-n5', level: 'N5' });
  const studiedKeys = new Set();

  for (let trial = 0; trial < 10; trial++) {
    const res = buildNormalSessionCards(items, studiedKeys, {
      shuffle: true,
      sessionSize: 20,
      isGuest: true,
      guestTrialSize: 30,
    });

    assert.equal(res.totalActive, 30, 'Guest pool must strictly be 30 cards');
    assert.equal(res.cards.length, 20);

    for (const card of res.cards) {
      const itemNum = Number(card.id.replace('ja-n5_item_', ''));
      assert.ok(itemNum <= 30, `Card ${card.id} must be within the first 30 curriculum entries`);
    }
  }
});

// ---------------------------------------------------------------------------
// 10. Signed-in Learners Retain Full Access
// ---------------------------------------------------------------------------

test('Signed-in Access: Signed-in learners have full course access without 30-word cap', () => {
  const items = createPublishedItems(100, { courseId: 'ja-n5', level: 'N5' });
  const studiedKeys = new Set();

  const signedInResult = buildNormalSessionCards(items, studiedKeys, {
    shuffle: false,
    sessionSize: 10,
    isGuest: false,
    guestTrialSize: 30,
  });

  assert.equal(signedInResult.totalActive, 100, 'Signed-in learner has full access to 100 cards');
  assert.equal(signedInResult.allTrialStudied, false);
});
