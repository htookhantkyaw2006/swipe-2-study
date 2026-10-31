/**
 * sessionBatchComponent.test.js
 *
 * Targeted regression checks of actual route and component wiring in SwipeSession
 * using controlled Server-Side Rendering (renderToString).
 *
 * NOTE: These are SSR checks verifying route parameter parsing, alias resolution,
 * effective trial pool bounding, and rendered screen markup. They do not substitute
 * for interactive browser-based verification of gestures and animation loops.
 */

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

const { LanguageProvider } = await server.ssrLoadModule('/src/lib/language.jsx');
const { PreferencesProvider } = await server.ssrLoadModule('/src/lib/preferences.jsx');
const { PublishedContentProvider } = await server.ssrLoadModule('/src/lib/publishedContentContext.jsx');
const { AuthContext } = await server.ssrLoadModule('/src/lib/authContext.js');
const { default: SwipeSession } = await server.ssrLoadModule('/src/pages/Learn/SwipeSession.jsx');
const { storageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');

function createPublishedItems(count, { courseId = 'zh-hsk1', level = 'HSK1' } = {}) {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i + 1}`,
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
  }));
}

function renderSession(route, { items = [], auth = { user: null, isGuest: true, loading: false, isTransitioning: false } } = {}) {
  const initialCache = {
    'zh-hsk1': {
      status: 'loaded',
      items,
      version: 1,
      error: null,
      isPublished: true,
    },
    'ja-n5': {
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
              createElement(SwipeSession)
            )
          )
        )
      )
    )
  );
}

function normalizeHtmlText(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/&#x27;/g, "'");
}

beforeEach(() => {
  storageMap.clear();
  storageOwner.setOwner(null);
});

// ---------------------------------------------------------------------------
// A. Canonical Route Aliases for HSK1
// ---------------------------------------------------------------------------

test('SwipeSession SSR: canonical HSK1 aliases (level=HSK1, level=1, level=HSK%201, default) all receive guest trial policy', () => {
  const items = createPublishedItems(300);

  // Mark first 30 words studied in guest learned_words table
  const studiedRows = items.slice(0, 30).map(c => ({
    character: c.written_form,
    pronunciation: c.reading,
    level: 'HSK1',
    seen: 1,
    status: 'known',
  }));
  storageMap.set('s2s_zh_learned_words', JSON.stringify(studiedRows));

  const routes = [
    '/learn/session?level=HSK1',
    '/learn/session?level=1',
    '/learn/session?level=HSK%201',
    '/learn/session',
  ];

  for (const route of routes) {
    const html = renderSession(route, { items });
    const text = normalizeHtmlText(html);

    assert.ok(
      text.includes('Free trial complete'),
      `Route '${route}' must render 'Free trial complete' for guest with 30 words studied`
    );
    assert.ok(
      text.includes("You've studied all 30 free trial words."),
      `Route '${route}' must report 'You've studied all 30 free trial words.'`
    );
    assert.ok(
      html.includes('href="/login?returnTo=%2Flearn%2Flevel%2FHSK1"'),
      `Route '${route}' CTA must return to canonical /learn/level/HSK1`
    );
  }
});

// ---------------------------------------------------------------------------
// Negative Control: Japanese N5 does NOT apply HSK1 guest trial policy
// ---------------------------------------------------------------------------

test('SwipeSession SSR: Japanese N5 does not apply HSK1 guest trial policy', () => {
  const items = createPublishedItems(300, { courseId: 'ja-n5', level: 'N5' });

  // Mark 30 words studied in JA learned_words
  const studiedRows = items.slice(0, 30).map(c => ({
    character: c.written_form,
    pronunciation: c.reading,
    level: 'N5',
    seen: 1,
    status: 'known',
  }));
  storageMap.set('s2s_ja_learned_words', JSON.stringify(studiedRows));

  // Switch active language to ja
  storageMap.set('s2s_language', JSON.stringify('ja'));

  const html = renderSession('/learn/session?level=N5', { items });
  const text = normalizeHtmlText(html);

  assert.ok(
    !text.includes('Free trial complete'),
    'Japanese N5 must NOT render Free trial complete screen'
  );
});

// ---------------------------------------------------------------------------
// B. Zero Active Vocabulary Renders Honest Empty State
// ---------------------------------------------------------------------------

test('SwipeSession SSR: zero active vocabulary renders honest empty state, not completion', () => {
  const html = renderSession('/learn/session?level=HSK1', { items: [] });
  const text = normalizeHtmlText(html);

  assert.ok(
    !text.includes('Free trial complete'),
    'Zero items must NOT render "Free trial complete"'
  );
  assert.ok(
    !text.includes('All words studied'),
    'Zero items must NOT render "All words studied"'
  );
  assert.ok(
    text.includes('No cards yet'),
    'Zero items must render honest "No cards yet" empty state'
  );
});

// ---------------------------------------------------------------------------
// C. Smaller Completed Pool Reports Actual Effective Trial Size
// ---------------------------------------------------------------------------

test('SwipeSession SSR: pool with fewer than 30 words reports actual effective count', () => {
  const items5 = createPublishedItems(5);

  // Mark all 5 words studied
  const studiedRows = items5.map(c => ({
    character: c.written_form,
    pronunciation: c.reading,
    level: 'HSK1',
    seen: 1,
    status: 'known',
  }));
  storageMap.set('s2s_zh_learned_words', JSON.stringify(studiedRows));

  const html = renderSession('/learn/session?level=HSK1', { items: items5 });
  const text = normalizeHtmlText(html);

  assert.ok(
    text.includes('Free trial complete'),
    'Five studied items must trigger trial complete'
  );
  assert.ok(
    text.includes("You've studied all 5 free trial words."),
    'Five studied items must report "all 5 free trial words", NOT 30'
  );
  assert.ok(
    !text.includes('30'),
    'Five studied items must not mention 30'
  );
});

// ---------------------------------------------------------------------------
// D. Signed-In Learner Continuation
// ---------------------------------------------------------------------------

test('SwipeSession SSR: signed-in learner with 30 words studied continues to next words', () => {
  const items = createPublishedItems(300);

  // Mark 30 words studied
  const studiedRows = items.slice(0, 30).map(c => ({
    character: c.written_form,
    pronunciation: c.reading,
    level: 'HSK1',
    seen: 1,
    status: 'known',
  }));
  storageOwner.setOwner('11111111-1111-4111-8111-111111111111');
  storageMap.set('s2s_user_11111111-1111-4111-8111-111111111111_zh_learned_words', JSON.stringify(studiedRows));

  const authUser = {
    user: { id: '11111111-1111-4111-8111-111111111111' },
    isGuest: false,
    loading: false,
    isTransitioning: false,
  };

  const html = renderSession('/learn/session?level=HSK1', { items, auth: authUser });
  const text = normalizeHtmlText(html);

  assert.ok(
    !text.includes('Free trial complete'),
    'Signed-in learner must NOT render Free trial complete screen'
  );
  assert.ok(
    text.includes('字31'),
    'Signed-in learner session continues from unstudied card-31'
  );
});
