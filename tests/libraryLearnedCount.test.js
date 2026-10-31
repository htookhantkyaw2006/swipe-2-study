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
const { default: Library } = await server.ssrLoadModule('/src/pages/Library.jsx');
const { db } = await server.ssrLoadModule('/src/lib/db.js');
const { storageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');
const { recordWordAction, getCourseProgress } = await server.ssrLoadModule('/src/lib/vocabularyProgress.js');
const { getCourse } = await server.ssrLoadModule('/src/courses/index.js');

function renderLibrary() {
  return renderToString(
    createElement(
      PreferencesProvider,
      null,
      createElement(
        LanguageProvider,
        null,
        createElement(MemoryRouter, null, createElement(Library))
      )
    )
  );
}

function extractLearnedCountStat(html) {
  const match = html.match(/<strong>(\d+)<\/strong><span>Learned words<\/span>/);
  return match ? parseInt(match[1], 10) : null;
}

beforeEach(() => {
  storageMap.clear();
  storageOwner.setOwner(null);
});

test('1. Empty learner data displays 0 in Library component and helper', () => {
  const zhCourse = getCourse('zh');
  const progress = getCourseProgress(db, zhCourse);

  assert.equal(progress.uniqueLearned, 0, 'Helper returns uniqueLearned: 0');
  assert.equal(progress.uniqueLearnedCount, undefined, 'Helper does NOT have uniqueLearnedCount');

  const html = renderLibrary();
  const count = extractLearnedCountStat(html);

  assert.equal(count, 0, 'Empty learner data must display 0 in Learned words stat');
  assert.ok(html.includes('Build your vocabulary'), 'Zero learned words renders default subtitle');
  assert.ok(!html.includes('words mastered'), 'Must not render words mastered when count is 0');
});

test('2. Actual known words display the correct unique count in Library component', () => {
  recordWordAction(db, { card: { character: '爱', reading: 'ài' }, direction: 'right' });
  recordWordAction(db, { card: { character: '八', reading: 'bā' }, direction: 'right' });
  recordWordAction(db, { card: { character: '爸爸', reading: 'bàba' }, direction: 'right' });

  const zhCourse = getCourse('zh');
  const progress = getCourseProgress(db, zhCourse);
  assert.equal(progress.uniqueLearned, 3);

  const html = renderLibrary();
  const count = extractLearnedCountStat(html);

  assert.equal(count, 3, 'Library must display 3 for 3 mastered words');
  assert.ok(html.includes('3 words mastered'), 'Library subtitle must display 3 words mastered');
});

test('3. Duplicate records do not inflate the learned count', () => {
  // Record the same word multiple times (e.g. repeated sessions or reviews)
  recordWordAction(db, { card: { character: '爱', reading: 'ài' }, direction: 'right' });
  recordWordAction(db, { card: { character: '爱', reading: 'ài' }, direction: 'right' });
  recordWordAction(db, { card: { character: '八', reading: 'bā' }, direction: 'right' });
  recordWordAction(db, { card: { character: '八', reading: 'bā' }, direction: 'right' });

  const zhCourse = getCourse('zh');
  const progress = getCourseProgress(db, zhCourse);
  assert.equal(progress.uniqueLearned, 2, 'Duplicate actions on same word do not inflate uniqueLearned');

  const html = renderLibrary();
  const count = extractLearnedCountStat(html);

  assert.equal(count, 2, 'Library must display 2 unique mastered words despite duplicate actions');
  assert.ok(html.includes('2 words mastered'));
});

test('4. Displayed count updates accurately after learning actions', () => {
  // Initial state with 1 word
  recordWordAction(db, { card: { character: '中', reading: 'zhōng' }, direction: 'right' });
  let html = renderLibrary();
  assert.equal(extractLearnedCountStat(html), 1);
  assert.ok(html.includes('1 words mastered'));

  // Learn a 2nd word
  recordWordAction(db, { card: { character: '大', reading: 'dà' }, direction: 'right' });
  html = renderLibrary();
  assert.equal(extractLearnedCountStat(html), 2);
  assert.ok(html.includes('2 words mastered'));

  // Swipe left on '大' (re-entering review/learning queue)
  recordWordAction(db, { card: { character: '大', reading: 'dà' }, direction: 'left' });
  html = renderLibrary();
  assert.equal(extractLearnedCountStat(html), 1, 'Swiping left demotes word from known status');
  assert.ok(html.includes('1 words mastered'));
});

test('5. Language and account changes continue to use the correct scoped data', () => {
  const USER_A = '11111111-1111-4111-8111-111111111111';
  const USER_B = '22222222-2222-4222-8222-222222222222';

  // 1. User A learns words in Chinese
  storageOwner.setOwner(USER_A);
  recordWordAction(db, { card: { character: '爱', reading: 'ài' }, direction: 'right' });
  recordWordAction(db, { card: { character: '八', reading: 'bā' }, direction: 'right' });

  const zhCourse = getCourse('zh');
  const jaCourse = getCourse('ja');

  // Verify language scoping within User A
  const progressZh = getCourseProgress(db, zhCourse, 'zh');
  const progressJa = getCourseProgress(db, jaCourse, 'ja');
  assert.equal(progressZh.uniqueLearned, 2, 'User A has 2 Chinese learned words');
  assert.equal(progressJa.uniqueLearned, 0, 'User A has 0 Japanese learned words');

  let htmlUserA = renderLibrary();
  assert.equal(extractLearnedCountStat(htmlUserA), 2, 'User A Library displays 2');

  // 2. Switch to User B
  storageOwner.setOwner(USER_B);
  let htmlUserB = renderLibrary();
  assert.equal(extractLearnedCountStat(htmlUserB), 0, 'User B starts with 0 learned words');

  // User B learns 1 word
  recordWordAction(db, { card: { character: '你好', reading: 'nǐ hǎo' }, direction: 'right' });
  htmlUserB = renderLibrary();
  assert.equal(extractLearnedCountStat(htmlUserB), 1, 'User B Library displays 1');

  // 3. Switch back to User A
  storageOwner.setOwner(USER_A);
  htmlUserA = renderLibrary();
  assert.equal(extractLearnedCountStat(htmlUserA), 2, 'User A Library still has 2 learned words (isolated from User B)');
});
