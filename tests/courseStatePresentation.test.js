/**
 * courseStatePresentation.test.js
 *
 * Focused component regressions for course-state presentation:
 * - Loading, error, unpublished, loaded-empty, and loaded-ready states.
 * - Confirms badges, copy, and actions are distinct across states.
 * - Confirms COMING SOON is reserved strictly for unpublished/unavailable content.
 * - Confirms landmark semantics (no nested <main> in LessonPicker; Layout is single main).
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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
const { default: LevelOverview } = await server.ssrLoadModule('/src/components/study/LevelOverview.jsx');
const { default: LevelCarousel } = await server.ssrLoadModule('/src/components/ui/LevelCarousel.jsx');
const { default: LessonPicker } = await server.ssrLoadModule('/src/pages/Learn/LessonPicker.jsx');
const { default: Layout } = await server.ssrLoadModule('/src/components/Layout.jsx');
const { default: GuestImportProvider } = await server.ssrLoadModule('/src/components/GuestImportProvider.jsx');
const { AuthProvider } = await server.ssrLoadModule('/src/lib/auth.jsx');

function renderWithState({ Component, route = '/', initialCache, routePath = '*' }) {
  return renderToString(
    createElement(
      AuthProvider,
      null,
      createElement(
        PreferencesProvider,
        null,
        createElement(
          LanguageProvider,
          null,
          createElement(
            MemoryRouter,
            { initialEntries: [route] },
            createElement(
              GuestImportProvider,
              null,
              createElement(
                PublishedContentProvider,
                { enabledOverride: true, initialCache },
                createElement(
                  Routes,
                  null,
                  createElement(Route, { path: routePath, element: createElement(Component) })
                )
              )
            )
          )
        )
      )
    )
  );
}

const mockItem = {
  id: 'item-1',
  course_id: 'zh-hsk1',
  written_form: '爱',
  character: '爱',
  reading: 'ài',
  pronunciation: 'ài',
  meaning_english: 'to love',
  definition: 'to love',
  meaning_burmese: 'ချစ်သည်',
  burmese_definition: 'ချစ်သည်',
  sort_order: 10,
  is_active: true,
};

test('Course-state presentation: LOADING state', () => {
  const initialCache = {
    'zh-hsk1': {
      status: 'loading',
      items: [],
      version: null,
      error: null,
      isPublished: false,
    },
  };

  // 1. LevelOverview
  const overviewHtml = renderWithState({ Component: LevelOverview, route: '/learn', initialCache });
  // Must render distinct LOADING badge
  assert.match(overviewHtml, /level-tile__badge--loading[^>]*>LOADING<\/span>/);
  // Must render distinct loading copy
  assert.match(overviewHtml, /Loading content\.\.\./);
  // Action must be loading, not coming soon
  assert.match(overviewHtml, /level-tile__action--loading[^>]*>Loading…/);
  // Must NOT apply unavailable modifier to HSK 1
  assert.doesNotMatch(overviewHtml, /class="[^"]*level-tile--unavailable[^"]*"[^>]*>[^<]*<div[^>]*>[^<]*<[^>]*>[^<]*<\/div>[^<]*<h3>HSK 1<\/h3>/);
  // Must NOT render COMING SOON on HSK 1 tile
  const hsk1TileMatch = overviewHtml.match(/<a[^>]*href="\/learn\/level\/HSK1"[^>]*>([\s\S]*?)<\/a>/);
  assert.ok(hsk1TileMatch, 'HSK 1 tile is present');
  assert.doesNotMatch(hsk1TileMatch[1], /COMING SOON/);

  // 2. LessonPicker
  const pickerHtml = renderWithState({
    Component: LessonPicker,
    route: '/learn/level/HSK1',
    routePath: '/learn/level/:levelId',
    initialCache,
  });
  // Hero badge must be LOADING, not NOW LEARNING or COMING SOON
  assert.match(pickerHtml, /lesson-hero-card__badge--loading[^>]*>LOADING<\/span>/);
  assert.doesNotMatch(pickerHtml, /lesson-hero-card__badge[^>]*>NOW LEARNING<\/span>/);
  assert.doesNotMatch(pickerHtml, /lesson-hero-card__badge[^>]*>COMING SOON<\/span>/);
  // Subtitle must report loading
  assert.match(pickerHtml, /lesson-hero-card__completion[^>]*>Loading curriculum\.\.\.<\/p>/);
  // Study CTA must be disabled Loading… button
  assert.match(pickerHtml, /lesson-hero-card__study-btn--disabled[^>]*disabled[^>]*>Loading…<\/button>/);

  // 3. LevelCarousel
  const carouselHtml = renderWithState({ Component: LevelCarousel, route: '/', initialCache });
  assert.match(carouselHtml, /<span class="course-badge">LOADING<\/span>/);
  assert.match(carouselHtml, /<p class="course-word-count">Loading curriculum\.\.\.<\/p>/);
  assert.match(carouselHtml, /course-study-button--disabled[^>]*disabled[^>]*>Loading…<\/button>/);
});

test('Course-state presentation: ERROR state', () => {
  const initialCache = {
    'zh-hsk1': {
      status: 'error',
      items: [],
      version: null,
      error: new Error('Failed to retrieve published vocabulary'),
      isPublished: false,
    },
  };

  // 1. LevelOverview
  const overviewHtml = renderWithState({ Component: LevelOverview, route: '/learn', initialCache });
  // Must render distinct UNAVAILABLE badge, not COMING SOON
  assert.match(overviewHtml, /level-tile__badge--error[^>]*>UNAVAILABLE<\/span>/);
  assert.match(overviewHtml, /Unable to load content/);
  // Must NOT report Coming soon on HSK 1
  const hsk1TileMatch = overviewHtml.match(/<a[^>]*href="\/learn\/level\/HSK1"[^>]*>([\s\S]*?)<\/a>/);
  assert.ok(hsk1TileMatch, 'HSK 1 tile is present');
  assert.doesNotMatch(hsk1TileMatch[1], /COMING SOON/);
  assert.match(hsk1TileMatch[1], /Explore level/);

  // Unpublished HSK 2 tile displays Curriculum in preparation without numeric totals
  const hsk2TileMatch = overviewHtml.match(/<a[^>]*href="\/learn\/level\/HSK2"[^>]*>([\s\S]*?)<\/a>/);
  assert.ok(hsk2TileMatch, 'HSK 2 tile is present');
  assert.match(hsk2TileMatch[1], /level-tile__badge--soon[^>]*>COMING SOON<\/span>/);
  assert.match(hsk2TileMatch[1], /Curriculum in preparation/);
  assert.doesNotMatch(hsk2TileMatch[1], /\d+\s+(?:words|phrases)\s+curriculum/);

  // 2. LessonPicker
  const pickerHtml = renderWithState({
    Component: LessonPicker,
    route: '/learn/level/HSK1',
    routePath: '/learn/level/:levelId',
    initialCache,
  });
  // Hero badge must be UNAVAILABLE, not NOW LEARNING or COMING SOON
  assert.match(pickerHtml, /lesson-hero-card__badge--error[^>]*>UNAVAILABLE<\/span>/);
  assert.doesNotMatch(pickerHtml, /lesson-hero-card__badge[^>]*>NOW LEARNING<\/span>/);
  assert.doesNotMatch(pickerHtml, /lesson-hero-card__badge[^>]*>COMING SOON<\/span>/);
  // Subtitle must report error
  assert.match(pickerHtml, /lesson-hero-card__completion[^>]*>Error loading curriculum<\/p>/);
  // Action must offer Retry
  assert.match(pickerHtml, /lesson-hero-card__study-btn--retry[^>]*>Retry loading<\/button>/);

  // 3. LevelCarousel
  const carouselHtml = renderWithState({ Component: LevelCarousel, route: '/', initialCache });
  assert.match(carouselHtml, /<span class="course-badge">UNAVAILABLE<\/span>/);
  assert.match(carouselHtml, /<p class="course-word-count">Error loading curriculum<\/p>/);
  assert.match(carouselHtml, /course-study-button--retry[^>]*>Retry<\/button>/);
});

test('Course-state presentation: UNPUBLISHED / COMING SOON state', () => {
  const initialCache = {
    'zh-hsk1': {
      status: 'unpublished',
      items: [],
      version: null,
      error: null,
      isPublished: false,
    },
  };

  // 1. LevelOverview
  const overviewHtml = renderWithState({ Component: LevelOverview, route: '/learn', initialCache });
  // HSK 1 and HSK 2 both render COMING SOON
  const hsk1TileMatch = overviewHtml.match(/<a[^>]*href="\/learn\/level\/HSK1"[^>]*>([\s\S]*?)<\/a>/);
  assert.ok(hsk1TileMatch, 'HSK 1 tile is present');
  assert.match(hsk1TileMatch[1], /level-tile__badge--soon[^>]*>COMING SOON<\/span>/);
  assert.match(hsk1TileMatch[1], /Curriculum in preparation/);
  assert.doesNotMatch(hsk1TileMatch[1], /\d+\s+(?:words|phrases)\s+curriculum/);
  assert.match(hsk1TileMatch[1], /level-tile__action--disabled[^>]*>Coming soon<\/span>/);

  // 2. LessonPicker
  const pickerHtml = renderWithState({
    Component: LessonPicker,
    route: '/learn/level/HSK1',
    routePath: '/learn/level/:levelId',
    initialCache,
  });
  assert.match(pickerHtml, /lesson-hero-card__badge--soon[^>]*>COMING SOON<\/span>/);
  assert.doesNotMatch(pickerHtml, /lesson-hero-card__badge[^>]*>NOW LEARNING<\/span>/);
  assert.match(pickerHtml, /lesson-hero-card__completion[^>]*>Curriculum coming soon<\/p>/);
  assert.match(pickerHtml, /lesson-hero-card__study-btn--disabled[^>]*disabled[^>]*>Coming soon<\/button>/);

  // 3. LevelCarousel
  const carouselHtml = renderWithState({ Component: LevelCarousel, route: '/', initialCache });
  assert.match(carouselHtml, /<p class="course-word-count">Curriculum coming soon<\/p>/);
  assert.match(carouselHtml, /course-study-button--disabled[^>]*disabled[^>]*>Coming soon<\/button>/);
});

test('Course-state presentation: LOADED-EMPTY state', () => {
  const initialCache = {
    'zh-hsk1': {
      status: 'loaded',
      items: [],
      version: 1,
      error: null,
      isPublished: true,
    },
  };

  // 1. LevelOverview
  const overviewHtml = renderWithState({ Component: LevelOverview, route: '/learn', initialCache });
  const hsk1TileMatch = overviewHtml.match(/<a[^>]*href="\/learn\/level\/HSK1"[^>]*>([\s\S]*?)<\/a>/);
  assert.ok(hsk1TileMatch, 'HSK 1 tile is present');
  // Must NOT render COMING SOON
  assert.doesNotMatch(hsk1TileMatch[1], /COMING SOON/);
  // Renders tier or level indicator
  assert.match(hsk1TileMatch[1], /level-tile__tier/);
  assert.match(hsk1TileMatch[1], /No cards available/);
  assert.match(hsk1TileMatch[1], /Explore level/);

  // 2. LessonPicker
  const pickerHtml = renderWithState({
    Component: LessonPicker,
    route: '/learn/level/HSK1',
    routePath: '/learn/level/:levelId',
    initialCache,
  });
  // Does NOT render NOW LEARNING or COMING SOON
  assert.doesNotMatch(pickerHtml, /lesson-hero-card__badge[^>]*>NOW LEARNING<\/span>/);
  assert.doesNotMatch(pickerHtml, /lesson-hero-card__badge--soon[^>]*>COMING SOON<\/span>/);
  // Subtitle indicates no words yet
  assert.match(pickerHtml, /No words available yet/);
  assert.match(pickerHtml, /lesson-hero-card__study-btn--disabled[^>]*disabled[^>]*>No cards available<\/button>/);

  // 3. LevelCarousel
  const carouselHtml = renderWithState({
    Component: LevelCarousel,
    route: '/',
    initialCache,
  });
  // Does NOT render "Coming soon" on primary study action
  const studyBtnMatch = carouselHtml.match(/<button[^>]*class="[^"]*course-study-button[^"]*"[^>]*>([\s\S]*?)<\/button>/);
  assert.ok(studyBtnMatch, 'Study button is present in carousel');
  assert.doesNotMatch(studyBtnMatch[1], /Coming soon/);
  // Renders disabled "No cards available" action
  assert.match(carouselHtml, /course-study-button--disabled[^>]*disabled[^>]*>No cards available<\/button>/);
  // Word count text indicates "No words available yet"
  assert.match(carouselHtml, /<p class="course-word-count"[^>]*>No words available yet<\/p>/);
  // Does NOT render active NOW LEARNING badge
  assert.doesNotMatch(carouselHtml, /course-badge--active/);
});

test('Course-state presentation: LOADED-READY state', () => {
  const initialCache = {
    'zh-hsk1': {
      status: 'loaded',
      items: [mockItem],
      version: 1,
      error: null,
      isPublished: true,
    },
  };

  // 1. LevelOverview
  const overviewHtml = renderWithState({ Component: LevelOverview, route: '/learn', initialCache });
  const hsk1TileMatch = overviewHtml.match(/<a[^>]*href="\/learn\/level\/HSK1"[^>]*>([\s\S]*?)<\/a>/);
  assert.ok(hsk1TileMatch, 'HSK 1 tile is present');
  // First level with content shows NOW LEARNING
  assert.match(hsk1TileMatch[1], /level-tile__badge--learning[^>]*>NOW LEARNING<\/span>/);
  assert.match(hsk1TileMatch[1], /1 card available/);
  assert.match(hsk1TileMatch[1], /Explore level/);

  // 2. LessonPicker
  const pickerHtml = renderWithState({
    Component: LessonPicker,
    route: '/learn/level/HSK1',
    routePath: '/learn/level/:levelId',
    initialCache,
  });
  // Active level shows NOW LEARNING
  assert.match(pickerHtml, /lesson-hero-card__badge[^>]*>NOW LEARNING<\/span>/);
  assert.match(pickerHtml, /0 \/ 1 completed/);
  // Retains active learning link to /learn/session
  assert.match(pickerHtml, /href="\/learn\/session\?level=HSK1"[^>]*>Start learning<\/a>/);

  // 3. LevelCarousel
  const carouselHtml = renderWithState({ Component: LevelCarousel, route: '/', initialCache });
  assert.match(carouselHtml, /course-badge--active[^>]*>NOW LEARNING<\/span>/);
  assert.match(carouselHtml, /0 \/ 1 completed/);
  assert.match(carouselHtml, /course-study-button[^>]*>(?:Start swiping|Start learning)<\/button>/);
});

test('Landmark semantics: single main landmark across Layout and LessonPicker', () => {
  const initialCache = {
    'zh-hsk1': {
      status: 'loaded',
      items: [mockItem],
      version: 1,
      error: null,
      isPublished: true,
    },
  };

  // Render LessonPicker directly
  const pickerHtml = renderWithState({
    Component: LessonPicker,
    route: '/learn/level/HSK1',
    routePath: '/learn/level/:levelId',
    initialCache,
  });

  // LessonPicker must NOT have any <main> tag
  assert.doesNotMatch(pickerHtml, /<main/i, 'LessonPicker must not contain any <main> landmark tag');
  assert.match(pickerHtml, /<div class="lesson-content"/, 'LessonPicker uses <div class="lesson-content">');

  // Render Layout wrapping LessonPicker
  const fullPageHtml = renderToString(
    createElement(
      AuthProvider,
      null,
      createElement(
        PreferencesProvider,
        null,
        createElement(
          LanguageProvider,
          null,
          createElement(
            MemoryRouter,
            { initialEntries: ['/learn/level/HSK1'] },
            createElement(
              GuestImportProvider,
              null,
              createElement(
                PublishedContentProvider,
                { enabledOverride: true, initialCache },
                createElement(
                  Routes,
                  null,
                  createElement(
                    Route,
                    { path: '/', element: createElement(Layout) },
                    createElement(Route, { path: 'learn/level/:levelId', element: createElement(LessonPicker) })
                  )
                )
              )
            )
          )
        )
      )
    )
  );

  // There must be exactly one <main> tag in the entire document (the one from Layout)
  const mainMatches = fullPageHtml.match(/<main\b/gi);
  assert.equal(mainMatches?.length, 1, 'Exactly one <main> landmark exists on the page');
  assert.match(fullPageHtml, /<main id="main-content"/, 'The single main landmark is Layout main-content');
});
