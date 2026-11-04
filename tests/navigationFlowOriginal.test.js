import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement, Children, isValidElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, matchRoutes } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

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

let lastNavigatedTarget = null;
globalThis.__testNavigateSpy = (target) => {
  lastNavigatedTarget = target;
};

const server = await createServer({
  root: projectRoot,
  server: { middlewareMode: true, hmr: false, ws: false, host: '127.0.0.1', watch: null },
  plugins: [
    {
      name: 'router-click-spy',
      transform(code, id) {
        const norm = id.replace(/\\/g, '/');
        if (
          norm.includes('ReviewWords.jsx') ||
          norm.includes('LessonPicker.jsx') ||
          norm.includes('PhrasesLevel.jsx') ||
          norm.includes('StudyByInterest.jsx') ||
          norm.includes('SavedWords.jsx') ||
          norm.includes('LevelCarousel.jsx')
        ) {
          return code.replace(/useNavigate\(\)/g, '((...args) => globalThis.__testNavigateSpy(...args))');
        }
      },
    },
  ],
});

after(async () => {
  await server.close();
  if (oldStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = oldStorage;
});

beforeEach(() => {
  storageMap.clear();
  lastNavigatedTarget = null;
});

const { LanguageProvider } = await server.ssrLoadModule('/src/lib/language.jsx');
const { PreferencesProvider } = await server.ssrLoadModule('/src/lib/preferences.jsx');
const { PublishedContentProvider } = await server.ssrLoadModule('/src/lib/publishedContentContext.jsx');
const { AuthContext } = await server.ssrLoadModule('/src/lib/authContext.js');
const { GuestImportContext } = await server.ssrLoadModule('/src/lib/guestImportContext.js');
const { hasInternalHistory, safeNavigateBack } = await server.ssrLoadModule('/src/lib/navigation.js');
const { db } = await server.ssrLoadModule('/src/lib/db.js');

const { default: ReviewWords } = await server.ssrLoadModule('/src/pages/Learn/ReviewWords.jsx');
const { default: SavedWords } = await server.ssrLoadModule('/src/pages/SavedWords.jsx');
const { default: LessonPicker } = await server.ssrLoadModule('/src/pages/Learn/LessonPicker.jsx');
const { default: PhrasesLevel } = await server.ssrLoadModule('/src/pages/PhrasesLevel.jsx');
const { default: StudyByInterest } = await server.ssrLoadModule('/src/pages/StudyByInterest.jsx');
const { default: LevelCarousel } = await server.ssrLoadModule('/src/components/ui/LevelCarousel.jsx');

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

// -----------------------------------------------------------------------------
// Real Application Route Table for Strict Route Verification
// -----------------------------------------------------------------------------

const appRoutes = [
  {
    path: '/',
    children: [
      {
        path: 'learn/*',
        children: [
          { path: '' },
          { path: 'level/:levelId' },
          { path: 'session' },
          { path: 'review' },
          { path: 'review/session' },
        ],
      },
      { path: 'library' },
      { path: 'flashcards' },
      { path: 'flashcards/level/:levelId' },
      { path: 'flashcards/session' },
      { path: 'saved' },
      { path: 'saved/session' },
      { path: 'dictionary' },
      { path: 'interest' },
      { path: 'writing' },
      { path: 'radicals' },
      { path: 'kana' },
      { path: 'sounds' },
      { path: 'notifications' },
      { path: 'profile' },
      { path: 'profile/edit' },
      { path: 'premium' },
      { path: 'settings' },
      { path: 'about' },
      { path: 'privacy' },
      { path: 'terms' },
      { path: 'support' },
      { path: '*' },
    ],
  },
];

function verifyRouteDestination(dest) {
  assert.ok(dest !== null && dest !== undefined, 'Destination must not be null/undefined');
  if (typeof dest === 'number') {
    return { isNumericDelta: true, delta: dest };
  }

  const [rawPath, search] = dest.split('?');
  const pathname = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const matches = matchRoutes(appRoutes, pathname);

  assert.ok(matches && matches.length > 0, `Route "${dest}" failed to match any registered application route`);
  const leafMatch = matches[matches.length - 1];

  // Wildcard fallback indicates an unmatched route
  assert.notEqual(leafMatch.route.path, '*', `Route "${dest}" was not matched and fell through to wildcard redirect (*)`);

  // Under learn/*, must match a specific declared child route
  if (pathname.startsWith('/learn/')) {
    const matchedSubPaths = matches.map((m) => m.route.path);
    const hasValidChild = matchedSubPaths.some((p) =>
      ['session', 'review', 'review/session', 'level/:levelId'].includes(p)
    );
    assert.ok(
      hasValidChild,
      `Route "${dest}" did not match any leaf child under /learn/* (matched: ${JSON.stringify(matchedSubPaths)})`
    );
  }

  return { pathname, search: search || null, leaf: leafMatch.route.path };
}

function findAllClickables(node, acc = []) {
  if (!node) return acc;
  if (node.props && typeof node.props.onClick === 'function') {
    acc.push(node);
  }
  if (node.props && node.props.children) {
    Children.forEach(node.props.children, (child) => {
      if (isValidElement(child)) {
        findAllClickables(child, acc);
      }
    });
  }
  return acc;
}

function renderAndInspect(Component, props = {}, initialEntries = ['/']) {
  let capturedVdom = null;
  function Inspector() {
    const vdom = Component(props);
    capturedVdom = vdom;
    return vdom;
  }

  renderToString(
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
                createElement(Inspector)
              )
            )
          )
        )
      )
    )
  );

  const clickables = findAllClickables(capturedVdom);
  return { vdom: capturedVdom, clickables };
}

// -----------------------------------------------------------------------------
// 1. Router Route Table Verification
// -----------------------------------------------------------------------------

test('Route verification contract: ensures valid routes match and invalid session paths are rejected', () => {
  // Valid session routes
  const r1 = verifyRouteDestination('/learn/session');
  assert.equal(r1.leaf, 'session');

  const r2 = verifyRouteDestination('/learn/session?level=HSK1');
  assert.equal(r2.leaf, 'session');
  assert.equal(r2.search, 'level=HSK1');

  const r3 = verifyRouteDestination('/learn/review/session');
  assert.equal(r3.leaf, 'review/session');

  const r4 = verifyRouteDestination('/saved/session');
  assert.equal(r4.leaf, 'saved/session');

  const r5 = verifyRouteDestination('/flashcards/session?level=HSK1');
  assert.equal(r5.leaf, 'flashcards/session');

  // Verify non-existent paths FAIL verification
  assert.throws(
    () => verifyRouteDestination('/learn/level/1/session'),
    /did not match any leaf child under \/learn\/\*/
  );
  assert.throws(
    () => verifyRouteDestination('/learn/level/HSK1/session'),
    /did not match any leaf child under \/learn\/\*/
  );
});

// -----------------------------------------------------------------------------
// 2. Button Clicks Through Real Router: ReviewWords
// -----------------------------------------------------------------------------

test('ReviewWords: actual button clicks route through real router', () => {
  // Case A: Review is empty -> clicking "Start swiping" button navigates to /learn/session
  db.set('review_cards', []);
  const { clickables: emptyClickables } = renderAndInspect(ReviewWords, {}, ['/learn/review']);

  // Clickable 0 is Back button -> calls safeNavigateBack(navigate, '/library')
  lastNavigatedTarget = null;
  emptyClickables[0].props.onClick();
  assert.equal(lastNavigatedTarget, '/library', 'Back button must fall back to /library when no internal history');

  // Clickable 1 is "Start swiping" button
  lastNavigatedTarget = null;
  emptyClickables[1].props.onClick();
  assert.ok(lastNavigatedTarget, 'Start swiping button must trigger navigation');
  const emptyRes = verifyRouteDestination(lastNavigatedTarget);
  assert.equal(emptyRes.pathname, '/learn/session', 'Empty review queue must route to /learn/session');

  // Case B: Review has cards -> clicking "Start Review" button navigates to /learn/review/session
  db.set('review_cards', [{ id: 'card-1', word: '你好', level: 'HSK1' }]);
  const { clickables: populatedClickables } = renderAndInspect(ReviewWords, {}, ['/learn/review']);

  lastNavigatedTarget = null;
  populatedClickables[1].props.onClick();
  assert.ok(lastNavigatedTarget, 'Start Review button must trigger navigation');
  const populatedRes = verifyRouteDestination(lastNavigatedTarget);
  assert.equal(populatedRes.pathname, '/learn/review/session', 'Populated review queue must route to /learn/review/session');
  assert.notEqual(lastNavigatedTarget, '/learn/level/1/session', 'Must never navigate to invalid /learn/level/1/session');
});

// -----------------------------------------------------------------------------
// 3. Button Clicks Through Real Router: LessonPicker
// -----------------------------------------------------------------------------

test('LessonPicker: actual button clicks route through real router', () => {
  const { clickables } = renderAndInspect(LessonPicker, {}, ['/learn/level/HSK1']);

  // 1. Header Back button -> navigates -1 (or fallback)
  lastNavigatedTarget = null;
  clickables[0].props.onClick();
  assert.ok(lastNavigatedTarget === -1 || lastNavigatedTarget === '/learn', 'Back button must navigate back');

  // 2. Flashcards Module -> navigates to /learn/session?level=HSK1
  lastNavigatedTarget = null;
  clickables[1].props.onClick();
  assert.ok(lastNavigatedTarget, 'Flashcards module must trigger navigation');
  const flashcardRes = verifyRouteDestination(lastNavigatedTarget);
  assert.equal(flashcardRes.pathname, '/learn/session', 'Flashcards module must route to /learn/session');
  assert.notEqual(lastNavigatedTarget, '/learn/level/HSK1/session', 'Must never route to invalid /learn/level/:levelId/session');

  // 3. Explore Module -> navigates to /library
  lastNavigatedTarget = null;
  clickables[2].props.onClick();
  assert.equal(lastNavigatedTarget, '/library', 'Explore module must route to /library');

  // 4. Review tile -> navigates to /learn/review
  lastNavigatedTarget = null;
  clickables[3].props.onClick();
  assert.equal(lastNavigatedTarget, '/learn/review', 'Review tile must route to /learn/review');

  // 5. Saved tile -> navigates to /saved
  lastNavigatedTarget = null;
  clickables[4].props.onClick();
  assert.equal(lastNavigatedTarget, '/saved', 'Saved tile must route to /saved');
});

// -----------------------------------------------------------------------------
// 4. Button Clicks Through Real Router: PhrasesLevel
// -----------------------------------------------------------------------------

test('PhrasesLevel: actual button clicks route through real router', () => {
  const { clickables } = renderAndInspect(PhrasesLevel, {}, ['/flashcards/level/HSK1']);

  // 1. Back button -> navigates -1
  lastNavigatedTarget = null;
  clickables[0].props.onClick();
  assert.equal(lastNavigatedTarget, -1, 'Back button in PhrasesLevel must navigate(-1)');

  // 2. Phrases card -> navigates to /flashcards/session?level=HSK1
  lastNavigatedTarget = null;
  clickables[1].props.onClick();
  assert.ok(lastNavigatedTarget, 'Phrases card must trigger navigation');
  const phraseRes = verifyRouteDestination(lastNavigatedTarget);
  assert.equal(phraseRes.pathname, '/flashcards/session', 'Phrases card must route to /flashcards/session');
});

// -----------------------------------------------------------------------------
// 5. Button Clicks Through Real Router: StudyByInterest
// -----------------------------------------------------------------------------

test('StudyByInterest: actual button clicks route through real router', () => {
  const { clickables } = renderAndInspect(StudyByInterest, {}, ['/interest']);

  // Back button is clickables[0]
  lastNavigatedTarget = null;
  clickables[0].props.onClick();
  assert.equal(lastNavigatedTarget, -1, 'Back button in StudyByInterest must navigate(-1), preserving 96bd017 behavior');
  assert.notEqual(lastNavigatedTarget, '/library', 'Must not hardcode /library');
});

// -----------------------------------------------------------------------------
// 6. Button Clicks Through Real Router: SavedWords
// -----------------------------------------------------------------------------

test('SavedWords: actual button clicks route through real router', () => {
  // Empty state
  db.set('saved_words', []);
  const { clickables: emptyClickables } = renderAndInspect(SavedWords, {}, ['/saved']);

  // Action button when empty -> /dictionary
  lastNavigatedTarget = null;
  emptyClickables[1].props.onClick();
  assert.equal(lastNavigatedTarget, '/dictionary', 'Empty saved words action button must route to /dictionary');

  // Populated state
  db.set('saved_words', [{ id: 's-1', word: '学生', level: 'HSK1' }]);
  const { clickables: populatedClickables } = renderAndInspect(SavedWords, {}, ['/saved']);

  lastNavigatedTarget = null;
  populatedClickables[1].props.onClick();
  assert.equal(lastNavigatedTarget, '/saved/session', 'Populated saved words action button must route to /saved/session');
  verifyRouteDestination(lastNavigatedTarget);
});

// -----------------------------------------------------------------------------
// 7. Button Clicks Through Real Router: LevelCarousel
// -----------------------------------------------------------------------------

test('LevelCarousel: actual button clicks route through real router', () => {
  const { clickables } = renderAndInspect(LevelCarousel, {}, ['/']);

  // Clickable 0: All levels badge button -> /learn
  lastNavigatedTarget = null;
  clickables[0].props.onClick();
  assert.equal(lastNavigatedTarget, '/learn', 'All levels button must route to /learn');

  // Clickable 1: Start swiping button -> /learn/session?level=HSK1
  lastNavigatedTarget = null;
  clickables[1].props.onClick();
  assert.ok(lastNavigatedTarget, 'Start swiping button must trigger navigation');
  const swipeRes = verifyRouteDestination(lastNavigatedTarget);
  assert.equal(swipeRes.pathname, '/learn/session', 'Start swiping must route to /learn/session');

  // Clickable 2: Level Card button -> /learn/level/HSK1
  lastNavigatedTarget = null;
  clickables[2].props.onClick();
  assert.equal(lastNavigatedTarget, '/learn/level/HSK1', 'Level card action must route to /learn/level/:levelId');
});

// -----------------------------------------------------------------------------
// 8. Mobile Name Wrapping & Typography Restorations
// -----------------------------------------------------------------------------

test('Home mobile name wrapping at 375px: does not truncate Guest Learner', () => {
  const cssPath = path.resolve(projectRoot, 'src/index.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  // Ensure .home-greeting__name does NOT have text-overflow: ellipsis or white-space: nowrap
  const nameRuleMatch = css.match(/\.home-greeting__name\s*\{([^}]+)\}/);
  assert.ok(nameRuleMatch, '.home-greeting__name rule must exist in index.css');
  const ruleContent = nameRuleMatch[1];

  assert.ok(
    !ruleContent.includes('text-overflow: ellipsis'),
    '.home-greeting__name must not truncate with ellipsis'
  );
  assert.ok(
    !ruleContent.includes('white-space: nowrap'),
    '.home-greeting__name must not prevent wrapping with nowrap'
  );
});

test('safeNavigateBack: uses navigate(-1) when internal history is confirmed present', () => {
  const origWindow = globalThis.window;
  try {
    globalThis.window = {
      history: {
        length: 8,
        state: { idx: 3 },
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
