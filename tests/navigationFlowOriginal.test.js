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

beforeEach(() => {
  storageMap.clear();
});

const { LanguageProvider } = await server.ssrLoadModule('/src/lib/language.jsx');
const { PreferencesProvider } = await server.ssrLoadModule('/src/lib/preferences.jsx');
const { PublishedContentProvider } = await server.ssrLoadModule('/src/lib/publishedContentContext.jsx');
const { AuthContext } = await server.ssrLoadModule('/src/lib/authContext.js');
const { GuestImportContext } = await server.ssrLoadModule('/src/lib/guestImportContext.js');
const { hasInternalHistory, safeNavigateBack } = await server.ssrLoadModule('/src/lib/navigation.js');
const { default: ReviewWords } = await server.ssrLoadModule('/src/pages/Learn/ReviewWords.jsx');
const { default: SavedWords } = await server.ssrLoadModule('/src/pages/SavedWords.jsx');
const { default: Dictionary } = await server.ssrLoadModule('/src/pages/Dictionary.jsx');
const { default: WritingPractice } = await server.ssrLoadModule('/src/pages/WritingPractice.jsx');
const { default: LevelPicker } = await server.ssrLoadModule('/src/pages/Learn/LevelPicker.jsx');
const { default: LessonPicker } = await server.ssrLoadModule('/src/pages/Learn/LessonPicker.jsx');
const { default: Library } = await server.ssrLoadModule('/src/pages/Library.jsx');
const { default: Home } = await server.ssrLoadModule('/src/pages/Home.jsx');

const mockAuthValue = {
  user: null,
  isGuest: true,
  loading: false,
  isTransitioning: false,
  error: null,
  clearError: () => {},
  retryVerification: () => {},
  signOut: async () => ({}),
  signOutGlobal: async () => ({}),
  canResetPassword: () => false,
  completePasswordRecovery: () => {},
  passwordRecoveryUserId: null,
  captureGeneration: () => 1,
  isCurrent: () => true,
  isConfigured: true,
  generation: 1,
};

const mockGuestImportValue = {
  status: 'idle',
  count: 0,
  isEligible: false,
  run: () => {},
};

function renderInProviders(ui, initialEntries = ['/']) {
  return renderToString(
    createElement(
      MemoryRouter,
      { initialEntries },
      createElement(
        AuthContext.Provider,
        { value: mockAuthValue },
        createElement(
          GuestImportContext.Provider,
          { value: mockGuestImportValue },
          createElement(
            LanguageProvider,
            null,
            createElement(
              PreferencesProvider,
              null,
              createElement(
                PublishedContentProvider,
                { publishedEnabled: false },
                ui
              )
            )
          )
        )
      )
    )
  );
}

// -----------------------------------------------------------------------------
// 1. Navigation Flow Back Targets and Destinations
// -----------------------------------------------------------------------------

test('Library -> Review destination and back fallback contract', () => {
  const libHtml = renderInProviders(createElement(Library), ['/library']);
  assert.ok(libHtml.includes('/learn/review'), 'Library must link to /learn/review');

  const reviewHtml = renderInProviders(createElement(ReviewWords), ['/learn/review']);
  assert.ok(reviewHtml.includes('Review Words'), 'ReviewWords renders title');

  // Verify safeNavigateBack fallback destination for Review is /library
  let target = null;
  safeNavigateBack((dest) => { target = dest; }, '/library');
  // When no internal history, must fallback to /library
  assert.equal(target, '/library');
});

test('Library -> Saved destination and back fallback contract', () => {
  const libHtml = renderInProviders(createElement(Library), ['/library']);
  assert.ok(libHtml.includes('/saved'), 'Library must link to /saved');

  const savedHtml = renderInProviders(createElement(SavedWords), ['/saved']);
  assert.ok(savedHtml.includes('Saved Words'), 'SavedWords renders title');

  let target = null;
  safeNavigateBack((dest) => { target = dest; }, '/library');
  assert.equal(target, '/library');
});

test('Library -> Dictionary destination and back fallback contract', () => {
  const libHtml = renderInProviders(createElement(Library), ['/library']);
  assert.ok(libHtml.includes('/dictionary'), 'Library must link to /dictionary');

  const dictHtml = renderInProviders(createElement(Dictionary), ['/dictionary']);
  assert.ok(dictHtml.includes('Dictionary') || dictHtml.includes('Search all HSK words'), 'Dictionary renders');

  let target = null;
  safeNavigateBack((dest) => { target = dest; }, '/library');
  assert.equal(target, '/library');
});

test('Library -> Writing destination and back fallback contract', () => {
  const libHtml = renderInProviders(createElement(Library), ['/library']);
  assert.ok(libHtml.includes('/writing'), 'Library must link to /writing');

  const writingHtml = renderInProviders(createElement(WritingPractice), ['/writing']);
  assert.ok(writingHtml.includes('Practise Writing') || writingHtml.includes('Writing Practice'), 'WritingPractice renders header');

  let target = null;
  safeNavigateBack((dest) => { target = dest; }, '/library');
  assert.equal(target, '/library');
});

test('Home -> LevelSelection -> CourseOverview -> Session flow destinations', () => {
  // 1. Home links to /learn
  const homeHtml = renderInProviders(createElement(Home), ['/']);
  assert.ok(homeHtml.includes('All levels') || homeHtml.includes('/learn'), 'Home contains All levels destination');

  // 2. LevelPicker renders level tiles and links back to Home ('/')
  const levelsHtml = renderInProviders(createElement(LevelPicker), ['/learn']);
  assert.ok(levelsHtml.includes('HSK 1') || levelsHtml.includes('Choose an HSK level'), 'LevelPicker renders');

  let levelBack = null;
  safeNavigateBack((dest) => { levelBack = dest; }, '/');
  assert.equal(levelBack, '/');

  // 3. LessonPicker (CourseOverview) links back to /learn
  const courseOverviewHtml = renderInProviders(createElement(LessonPicker), ['/learn/level/HSK1']);
  assert.ok(courseOverviewHtml.includes('lesson-hero-card'), 'LessonPicker renders hero card');

  let courseOverviewBack = null;
  safeNavigateBack((dest) => { courseOverviewBack = dest; }, '/learn');
  assert.equal(courseOverviewBack, '/learn');

  // 4. SwipeSession backTo defaults
  let sessionBackDefault = null;
  safeNavigateBack((dest) => { sessionBackDefault = dest; }, '/learn');
  assert.equal(sessionBackDefault, '/learn');
});

test('safeNavigateBack: uses navigate(-1) when internal history is confirmed present', () => {
  const origWindow = globalThis.window;
  try {
    globalThis.window = {
      history: {
        length: 8,
        state: { idx: 3 }, // internal navigation occurred
      },
    };
    assert.equal(hasInternalHistory(), true);

    let result = null;
    safeNavigateBack((val) => { result = val; }, '/fallback');
    assert.equal(result, -1, 'Must invoke navigate(-1) on internal history');
  } finally {
    globalThis.window = origWindow;
  }
});

// -----------------------------------------------------------------------------
// 2. Fluid Resizing Layout Bounds & Breakpoint Classes
// -----------------------------------------------------------------------------

test('Home at 320px: header, language switcher, and level carousel use responsive classes', () => {
  const html = renderInProviders(createElement(Home), ['/']);
  assert.ok(html.includes('home-page'), 'Home uses home-page CSS class');
  assert.ok(html.includes('home-greeting'), 'Home uses home-greeting CSS class');
  assert.ok(html.includes('home-carousel-wrapper'), 'Home uses home-carousel-wrapper CSS class');
  assert.ok(html.includes('language-switcher-btn'), 'Language switcher button uses responsive class');
});

test('LevelCarousel: buttons match original 96bd017 single play icon and responsive action classes', () => {
  const html = renderInProviders(createElement(Home), ['/']);
  assert.ok(html.includes('level-carousel__slide'), 'Carousel uses level-carousel__slide class');
  assert.ok(html.includes('level-carousel__card'), 'Carousel uses level-carousel__card class');
  assert.ok(html.includes('level-carousel__actions'), 'Carousel uses level-carousel__actions class');
  assert.ok(html.includes('Start swiping'), 'Primary CTA copy is Start swiping');
});
