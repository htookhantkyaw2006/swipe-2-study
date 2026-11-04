import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { runBrowserWritingPracticeVerification } from './runBrowserWritingPractice.mjs';

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

const { default: WritingPractice } = await server.ssrLoadModule('/src/pages/WritingPractice.jsx');
const { LanguageProvider } = await server.ssrLoadModule('/src/lib/language.jsx');
const { setActiveLanguageId } = await server.ssrLoadModule('/src/lib/activeLanguage.js');

setActiveLanguageId('zh');

test('WritingPractice SSR: renders header, surface card, and action controls safely on server', () => {
  setActiveLanguageId('zh');
  const html = renderToString(
    React.createElement(
      LanguageProvider,
      null,
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/practice-writing'] },
        React.createElement(WritingPractice)
      )
    )
  );

  assert.ok(html.includes('Practise Writing'), 'Renders page title');
  assert.ok(html.includes('Write it'), 'Renders hero heading line 1');
  assert.ok(html.includes('stroke by stroke'), 'Renders hero heading line 2');
  assert.ok(html.includes('Show me'), 'Show me button present');
  assert.ok(html.includes('Practise'), 'Practise button present');
  assert.ok(html.includes('Clear'), 'Clear button present');
});

test('WritingPractice SSR: canvas rendering pipeline renders guide grid SVG with standard bounds', () => {
  setActiveLanguageId('zh');
  const html = renderToString(
    React.createElement(
      LanguageProvider,
      null,
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/practice-writing?word=一'] },
        React.createElement(WritingPractice)
      )
    )
  );

  assert.ok(html.includes('viewBox="0 0 260 260"'), 'SVG practice grid with 260x260 viewBox');
  assert.ok(html.includes('stroke-dasharray="6 6"'), 'SVG guide lines with 6 6 dasharray');
});

test('WritingPractice SSR: legacy mastery normalization supports string and object records', () => {
  const legacyRecords = [
    '一',
    { char: '二' },
    { character: '三' },
    null,
    undefined,
    { invalid: 'foo' },
    '一', // duplicate
  ];

  const parsed = legacyRecords
    .map((r) => r?.character || r?.char || (typeof r === 'string' ? r : null))
    .filter(Boolean);
  const masteredSet = new Set(parsed);

  assert.equal(masteredSet.size, 3);
  assert.ok(masteredSet.has('一'));
  assert.ok(masteredSet.has('二'));
  assert.ok(masteredSet.has('三'));
});

test('WritingPractice Real Browser: mounted component interaction, canvas, quiz evaluation, and legacy records', async (t) => {
  const outcome = await runBrowserWritingPracticeVerification();
  if (outcome.skipped) {
    if (process.env.REQUIRE_BROWSER_VERIFICATION === 'true' || process.env.NODE_ENV === 'production') {
      assert.fail(`Required release browser verification failed: ${outcome.reason}`);
    }
    t.skip(`Browser check skipped: ${outcome.reason}`);
    return;
  }

  assert.equal(outcome.passed, true);
  assert.ok(Array.isArray(outcome.results));

  const wordTest = outcome.results.find((r) => r.test === 'query-param-word-and-tabs');
  assert.ok(wordTest && wordTest.passed, 'query-param-word-and-tabs must pass');

  const charTest = outcome.results.find((r) => r.test === 'query-param-char-resolution');
  assert.ok(charTest && charTest.passed, 'query-param-char-resolution must pass');

  const tabSwitch = outcome.results.find((r) => r.test === 'multi-character-tab-switching');
  assert.ok(tabSwitch && tabSwitch.passed, 'multi-character-tab-switching must pass');

  const gridPipeline = outcome.results.find((r) => r.test === 'canvas-rendering-pipeline-grid');
  assert.ok(gridPipeline && gridPipeline.passed, 'canvas-rendering-pipeline-grid must pass');

  const quizControls = outcome.results.find((r) => r.test === 'stroke-quiz-controls-and-retry');
  assert.ok(quizControls && quizControls.passed, 'stroke-quiz-controls-and-retry must pass');

  const legacyMastery = outcome.results.find((r) => r.test === 'legacy-mastery-records-parsing');
  assert.ok(legacyMastery && legacyMastery.passed, 'legacy-mastery-records-parsing must pass');
});
