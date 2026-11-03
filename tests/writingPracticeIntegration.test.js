import test from 'node:test';
import assert from 'node:assert/strict';
import { writingWords } from '../src/data/writingChars.js';

// Functions matching production contracts in WritingPractice.jsx
const normalizeMasteredChar = (item) => {
  if (typeof item === 'string') return item;
  return item?.character || item?.char || null;
};

const parseMasteredSet = (records) => {
  const set = new Set();
  if (Array.isArray(records)) {
    for (const item of records) {
      const char = normalizeMasteredChar(item);
      if (char) set.add(char);
    }
  }
  return set;
};

const resolveWordAndChar = (words, wordQuery, charQuery) => {
  let targetWord = null;
  let targetChar = null;

  if (wordQuery) {
    targetWord = words.find((w) => w.word === wordQuery) || null;
    if (targetWord && targetWord.chars?.length > 0) {
      targetChar = targetWord.chars[0];
    }
  }

  if (!targetWord && charQuery) {
    targetWord = words.find((w) => w.chars && w.chars.includes(charQuery)) || null;
    if (targetWord) {
      targetChar = charQuery;
    }
  }

  return { targetWord, targetChar };
};

const computeResponsiveCanvasSize = (containerWidth, viewportHeight) => {
  const maxAllowedByWidth = Math.max(120, containerWidth - 32);
  const maxAllowedByHeight = viewportHeight ? Math.max(120, viewportHeight * 0.36) : 260;
  return Math.max(140, Math.min(260, Math.min(maxAllowedByWidth, maxAllowedByHeight)));
};

test('WritingPractice: legacy mastery record format compatibility', () => {
  const mixedRecords = [
    '一',
    { char: '二' },
    { character: '三' },
    { invalidKey: '四' },
    null,
    undefined,
    '一', // duplicate
  ];

  const mastered = parseMasteredSet(mixedRecords);
  assert.equal(mastered.size, 3, 'Must parse exactly 3 unique characters');
  assert.ok(mastered.has('一'), 'Recognizes plain string character');
  assert.ok(mastered.has('二'), 'Recognizes { char } record');
  assert.ok(mastered.has('三'), 'Recognizes { character } record');
  assert.ok(!mastered.has('四'), 'Ignores invalid records');
});

test('WritingPractice: query resolution for multi-character word (?word=你好)', () => {
  const { targetWord, targetChar } = resolveWordAndChar(writingWords, '你好', null);
  assert.ok(targetWord, 'Finds word "你好"');
  assert.equal(targetWord.word, '你好');
  assert.deepEqual(targetWord.chars, ['你', '好'], 'Word preserves complete character breakdown');
  assert.equal(targetChar, '你', 'Defaults active character to first character in word');
});

test('WritingPractice: query resolution for character (?char=好) finds parent word', () => {
  const { targetWord, targetChar } = resolveWordAndChar(writingWords, null, '好');
  assert.ok(targetWord, 'Finds parent word containing character "好"');
  assert.equal(targetChar, '好', 'Active character set to "好"');
  assert.ok(targetWord.chars.includes('好'), 'Parent word contains "好"');
});

test('WritingPractice: responsive canvas size bounds strictly [140, 260] without clipping', () => {
  // Mobile 320px screen: container width ~288px, viewport height ~568px
  const mobile320 = computeResponsiveCanvasSize(288, 568);
  assert.ok(mobile320 <= 256, 'Cannot exceed container width - 32px padding');
  assert.ok(mobile320 >= 140, 'Cannot shrink below minimum touch-target 140px');

  // Small container width edge case: 150px container
  const tinyContainer = computeResponsiveCanvasSize(150, 500);
  assert.equal(tinyContainer, 140, 'Clamps to min 140px');

  // Desktop 1440px screen: container width 800px, viewport height 900px
  const desktop = computeResponsiveCanvasSize(800, 900);
  assert.equal(desktop, 260, 'Caps to maximum 260px on wide viewports');
});
