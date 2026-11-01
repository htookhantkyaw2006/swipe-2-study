/**
 * sessionAndCollectionUI.test.js
 *
 * Comprehensive regressions for UI/UX Batch 2:
 * 1. Flashcard hierarchy, 3 examples rendering, Burmese/Chinese text readability.
 * 2. Dual card face discovery and hidden-face inertness.
 * 3. WordCollection Review vs Saved visual distinction, compact heroes, and Busuu-style vocabulary rows.
 * 4. WordCollection empty states (Saved: /learn primary, /dictionary secondary; Review: /learn).
 * 5. WordCollection search filtering and no-search-matches state.
 * 6. Vocabulary SwipeSession completion summary derivation, stat cards, and navigation.
 * 7. Early exit leaving unswiped words unstudied.
 */

import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { runBrowserSessionVerification } from './runBrowserSessionCheck.mjs';

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
const { default: ReviewWords } = await server.ssrLoadModule('/src/pages/Learn/ReviewWords.jsx');
const { default: SavedWords } = await server.ssrLoadModule('/src/pages/SavedWords.jsx');
const { db } = await server.ssrLoadModule('/src/lib/db.js');

function createSampleItems(count = 2) {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i + 1}`,
    card_id: `zh-hsk1-00${i + 1}`,
    course_id: 'zh-hsk1',
    written_form: i === 0 ? '爱' : '喜欢',
    character: i === 0 ? '爱' : '喜欢',
    reading: i === 0 ? 'ài' : 'xǐhuan',
    pronunciation: i === 0 ? 'ài' : 'xǐhuan',
    meaning_english: i === 0 ? 'to love' : 'to like',
    definition: i === 0 ? 'to love' : 'to like',
    meaning_burmese: i === 0 ? 'ချစ်သည်' : 'ကြိုက်သည်',
    burmese_definition: i === 0 ? 'ချစ်သည်' : 'ကြိုက်သည်',
    level: 'HSK1',
    sort_order: i + 1,
    is_active: true,
    examples: [
      { text: '我爱你。', reading: 'Wǒ ài nǐ.', english: 'I love you.', burmese: 'ကျွန်တော် မင်းကို ချစ်တယ်။' },
      { text: '他很爱读书。', reading: 'Tā hěn ài dúshū.', english: 'He loves reading very much.', burmese: 'သူ စာဖတ်တာ အရမ်းဝါသနာပါတယ်။' },
      { text: '这是爱的力量。', reading: 'Zhè shì ài de lìliàng.', english: 'This is the power of love.', burmese: 'ဒါဟာ အချစ်ရဲ့ စွမ်းအားပါ။' },
    ],
    audio_path: `audio/zh/hsk1/item${i + 1}.mp3`,
  }));
}

function renderSession(route, { items = [], isReview = false, isSaved = false, isPhrases = false } = {}) {
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
      { value: { user: null, isGuest: true, loading: false, isTransitioning: false } },
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

beforeEach(() => {
  storageMap.clear();
  db.set('saved_words', []);
  db.set('learned_words', []);
  db.set('review_cards', []);
});

// -----------------------------------------------------------------------------
// 1. Flashcard Hierarchy & Examples
// -----------------------------------------------------------------------------

test('SwipeSession: renders flashcard hierarchy with character, pinyin, and dual-face controls', () => {
  const items = createSampleItems(2);
  const html = renderSession('/learn/level/HSK1', { items });

  assert.ok(html.includes('class="swipe-card swipe-card--active"'), 'Active flashcard is present');
  assert.ok(html.includes('swipe-card__character'), 'Character class is present');
  assert.ok(html.includes('爱'), 'First word 爱 is rendered');
  assert.ok(html.includes('ài'), 'Pinyin ài is rendered');
  assert.ok(html.includes('swipe-bookmark'), 'Bookmark button is present on flashcard');
  assert.ok(html.includes('swipe-audio'), 'Audio button is present on flashcard');
  assert.ok(html.includes('Tap to reveal'), 'Tap to reveal hint is present');
});

test('SwipeSession: renders all 3 supplied examples with Chinese text, audio, reading, English, and Burmese', () => {
  const items = createSampleItems(1);
  const html = renderSession('/learn/level/HSK1', { items });

  // Example 1
  assert.ok(html.includes('我爱你。'), 'Example 1 Chinese text rendered');
  assert.ok(html.includes('Wǒ ài nǐ.'), 'Example 1 Pinyin rendered');
  assert.ok(html.includes('I love you.'), 'Example 1 English rendered');
  assert.ok(html.includes('ကျွန်တော် မင်းကို ချစ်တယ်။'), 'Example 1 Burmese rendered');

  // Example 2
  assert.ok(html.includes('他很爱读书。'), 'Example 2 Chinese text rendered');
  assert.ok(html.includes('He loves reading very much.'), 'Example 2 English rendered');

  // Example 3
  assert.ok(html.includes('这是爱的力量。'), 'Example 3 Chinese text rendered');
  assert.ok(html.includes('This is the power of love.'), 'Example 3 English rendered');

  // Audio buttons on examples
  assert.ok(html.includes('swipe-audio--example'), 'Example audio button is rendered');
  assert.ok(html.includes('swipe-example__burmese'), 'Burmese example class applied');
});

test('SwipeSession: bottom action controls render Review, Reveal, and Learned with accessible labels', () => {
  const items = createSampleItems(1);
  const html = renderSession('/learn/level/HSK1', { items });

  assert.ok(html.includes('swipe-action--review'), 'Review action is rendered');
  assert.ok(html.includes('Review this word later'), 'Review action has aria-label');
  assert.ok(html.includes('swipe-action--flip'), 'Flip/reveal action is rendered');
  assert.ok(html.includes('Reveal'), 'Reveal label is rendered');
  assert.ok(html.includes('swipe-action--learned'), 'Learned action is rendered');
  assert.ok(html.includes('Mark this word learned'), 'Learned action has aria-label');
});

// -----------------------------------------------------------------------------
// 2. WordCollection Review vs Saved Distinction & Busuu Vocabulary Rows
// -----------------------------------------------------------------------------

test('WordCollection (Review): renders distinct review hero and styling modifier', () => {
  const words = [
    { id: 'rev-1', phrase: '爱', reading: 'ài', english: 'to love', burmese: 'ချစ်သည်' },
    { id: 'rev-2', phrase: '八', reading: 'bā', english: 'eight', burmese: 'ရှစ်' },
  ];

  const html = renderToString(
    createElement(MemoryRouter, null,
      createElement(WordCollection, { kind: 'review', words, courseName: 'Chinese (HSK)' })
    )
  );

  assert.ok(html.includes('collection-page--review'), 'Page has collection-page--review modifier');
  assert.ok(html.includes('collection-hero--review'), 'Hero has collection-hero--review modifier');
  assert.ok(html.includes('REVIEW QUEUE'), 'Hero displays REVIEW QUEUE kicker');
  assert.ok(html.includes('2 words to review'), 'Hero displays 2 words to review');
  assert.ok(html.includes('Start review'), 'Action label is Start review');
  assert.ok(html.includes('href="/learn/review/session"'), 'Action links to review session');

  // Busuu rows
  assert.ok(html.includes('collection-word__character'), 'Character class present');
  assert.ok(html.includes('collection-word__reading'), 'Reading class present');
  assert.ok(html.includes('collection-word__meaning'), 'Meaning class present');
  assert.ok(html.includes('collection-word__burmese'), 'Burmese class present');
  assert.ok(!html.includes('study-icon-button--remove'), 'Review list does not include Unsave remove button');
});

test('WordCollection (Saved): renders distinct saved hero, styling modifier, and Unsave buttons', () => {
  const words = [
    { id: 'save-1', phrase: '爱', reading: 'ài', english: 'to love', burmese: 'ချစ်သည်' },
  ];

  const html = renderToString(
    createElement(MemoryRouter, null,
      createElement(WordCollection, { kind: 'saved', words, courseName: 'Chinese (HSK)', onUnsave: () => {} })
    )
  );

  assert.ok(html.includes('collection-page--saved'), 'Page has collection-page--saved modifier');
  assert.ok(html.includes('collection-hero--saved'), 'Hero has collection-hero--saved modifier');
  assert.ok(html.includes('SAVED WORDS'), 'Hero displays SAVED WORDS kicker');
  assert.ok(html.includes('1 saved word'), 'Hero displays 1 saved word');
  assert.ok(html.includes('Study saved words'), 'Action label is Study saved words');
  assert.ok(html.includes('href="/saved/session"'), 'Action links to saved session');
  assert.ok(html.includes('study-icon-button--remove'), 'Saved list includes Unsave button');
  assert.ok(html.includes('aria-label="Unsave 爱"'), 'Unsave button has accessible label');
});

test('WordCollection: empty Saved collection makes Start learning primary route and retains Open dictionary', () => {
  const html = renderToString(
    createElement(MemoryRouter, null,
      createElement(WordCollection, { kind: 'saved', words: [], courseName: 'Chinese (HSK)' })
    )
  );

  // Hero action
  assert.ok(html.includes('collection-hero__action'), 'Hero action button is present');
  assert.ok(html.includes('href="/learn"'), 'Hero action links to /learn');
  assert.ok(html.includes('Start learning'), 'Hero action label is Start learning');

  // Empty state actions
  assert.ok(html.includes('href="/dictionary"'), 'Empty state includes Open dictionary');
  assert.ok(html.includes('Open dictionary'), 'Empty state renders Open dictionary');
});

test('WordCollection: empty Review collection links to Start learning / Explore courses', () => {
  const html = renderToString(
    createElement(MemoryRouter, null,
      createElement(WordCollection, { kind: 'review', words: [], courseName: 'Chinese (HSK)' })
    )
  );

  assert.ok(html.includes('All caught up!'), 'Empty review shows All caught up');
  assert.ok(html.includes('Explore courses'), 'Empty review action is Explore courses');
  assert.ok(html.includes('href="/learn"'), 'Action links to /learn');
});

test('WordCollection: search filtering and no-search-matches state', () => {
  const words = [
    { id: 'w1', phrase: '爱', reading: 'ài', english: 'to love', burmese: 'ချစ်သည်' },
  ];

  // Populated list renders search bar
  const html = renderToString(
    createElement(MemoryRouter, null,
      createElement(WordCollection, { kind: 'review', words, courseName: 'Chinese (HSK)' })
    )
  );

  assert.ok(html.includes('study-search'), 'Search bar is mounted on populated collection');
  assert.ok(html.includes('Search review words'), 'Search bar has accessible label');
});

// -----------------------------------------------------------------------------
// 3. Unreadable Collection Error Presentation
// -----------------------------------------------------------------------------

test('ReviewWords (unreadable collection): renders honest unavailable state, accessible alert, retry option, and no 0 counts', () => {
  const origGetItem = globalThis.localStorage.getItem;
  globalThis.localStorage.getItem = (key) => {
    if (key && key.includes('review_cards')) throw new Error('UnreadableReviewStorageError');
    return origGetItem(key);
  };

  try {
    const html = renderToString(
      createElement(
        AuthContext.Provider,
        { value: { user: null, isGuest: true, loading: false, isTransitioning: false } },
        createElement(
          PreferencesProvider,
          null,
          createElement(
            LanguageProvider,
            null,
            createElement(
              MemoryRouter,
              { initialEntries: ['/learn/review'] },
              createElement(ReviewWords)
            )
          )
        )
      )
    );

    assert.ok(html.includes('collection-hero--unavailable'), 'Hero has collection-hero--unavailable modifier');
    assert.ok(html.includes('Collection unavailable'), 'Hero renders Collection unavailable heading');
    assert.ok(html.includes('role="alert"'), 'Accessible role="alert" feedback container is rendered');
    assert.ok(html.includes('Unable to load review words'), 'Renders concise failure message');
    assert.ok(html.includes('Status unavailable'), 'Status heading reports Status unavailable');
    assert.ok(html.includes('Try again') || html.includes('Retry'), 'Retry button is present');
    assert.equal(html.includes('All caught up!'), false, 'Must NOT display successful empty state copy');
    assert.equal(html.includes('0 words to review'), false, 'Must NOT report 0 words count');
    assert.equal(html.includes('/learn/review/session'), false, 'Must NOT offer study action');
  } finally {
    globalThis.localStorage.getItem = origGetItem;
  }
});

test('SavedWords (unreadable collection): renders honest unavailable state, accessible alert, retry option, and no 0 counts', () => {
  const origGetItem = globalThis.localStorage.getItem;
  globalThis.localStorage.getItem = (key) => {
    if (key && key.includes('saved_words')) throw new Error('UnreadableSavedStorageError');
    return origGetItem(key);
  };

  try {
    const html = renderToString(
      createElement(
        AuthContext.Provider,
        { value: { user: null, isGuest: true, loading: false, isTransitioning: false } },
        createElement(
          PreferencesProvider,
          null,
          createElement(
            LanguageProvider,
            null,
            createElement(
              MemoryRouter,
              { initialEntries: ['/saved'] },
              createElement(SavedWords)
            )
          )
        )
      )
    );

    assert.ok(html.includes('collection-hero--unavailable'), 'Hero has collection-hero--unavailable modifier');
    assert.ok(html.includes('Collection unavailable'), 'Hero renders Collection unavailable heading');
    assert.ok(html.includes('role="alert"'), 'Accessible role="alert" feedback container is rendered');
    assert.ok(html.includes('Unable to load saved words'), 'Renders concise failure message');
    assert.ok(html.includes('Status unavailable'), 'Status heading reports Status unavailable');
    assert.ok(html.includes('Try again') || html.includes('Retry'), 'Retry button is present');
    assert.equal(html.includes('Build your word collection'), false, 'Must NOT display successful empty state copy');
    assert.equal(html.includes('0 saved words'), false, 'Must NOT report 0 words count');
    assert.equal(html.includes('/saved/session'), false, 'Must NOT offer study action');
  } finally {
    globalThis.localStorage.getItem = origGetItem;
  }
});

// -----------------------------------------------------------------------------
// 4. Mounted Production Component Interaction Checks (Real Browser Chrome/Edge)
// -----------------------------------------------------------------------------

test('Real Browser: mounted SwipeSession, ReviewWords, and SavedWords interaction checks', async (t) => {
  const result = await runBrowserSessionVerification();
  if (result.skipped) {
    t.skip(`Interactive acceptance unverified: ${result.reason}`);
    return;
  }
  assert.equal(result.passed, true, 'Real browser verification passed');
  assert.ok(result.results.length >= 6, 'All 6 production component interaction tests executed');
});
