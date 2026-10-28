import test from 'node:test';
import assert from 'node:assert/strict';
import { phraseCards, phraseLevel } from '../src/lib/phraseCards.js';

const course = { levels: [{ id: 'HSK1', name: 'HSK 1', badge: '1' }, { id: 'HSK2', name: 'HSK 2', badge: '2' }], phrases: [
  { id: 1, level: 'HSK 1', phrase: '你好', reading: 'Nǐ hǎo', english: 'Hello', burmese: 'မင်္ဂလာပါ' },
  { id: 2, level: 'HSK 2', phrase: '欢迎', reading: 'Huānyíng', english: 'Welcome', burmese: 'ကြိုဆိုပါသည်' },
] };
test('phrase levels match names/ids without substituting a different level', () => {
  assert.equal(phraseLevel(course, 'HSK 1').id, 'HSK1');
  assert.equal(phraseLevel(course, 'hsk2').id, 'HSK2');
  assert.equal(phraseLevel(course, 'missing'), undefined);
  assert.deepEqual(phraseCards(course, 'missing'), []);
});
test('phrase deck contains only the selected level and adapts without changing source records', () => {
  const before = JSON.stringify(course);
  const deck = phraseCards(course, 'HSK2');
  assert.equal(deck.length, 1);
  assert.equal(deck[0].id, 2);
  assert.equal(deck[0].character, '欢迎');
  assert.equal(deck[0].definition, 'Welcome');
  assert.equal(JSON.stringify(course), before);
  assert.equal(phraseCards(course)[0].id, 1);
});
test('unavailable phrase levels remain empty, including a course with no phrases', () => {
  assert.deepEqual(phraseCards({ ...course, phrases: course.phrases.slice(0,1) }, 'HSK2'), []);
  assert.deepEqual(phraseCards({ levels: [{ id: 'N5', name: 'N5', badge: 'N5' }] }), []);
});
