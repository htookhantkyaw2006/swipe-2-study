import test from 'node:test';
import assert from 'node:assert/strict';
import { filterStudyWords, readSessionCards, wordDetails } from '../src/lib/studyWords.js';

const card = Object.freeze({ id: 'vocab-1', character: '你好', pronunciation: 'nǐ hǎo', definition: 'Hello', burmese_definition: 'မင်္ဂလာပါ', level: 'HSK1', examples: Object.freeze([{ text: '你好。' }]) });
const saved = Object.freeze({ id: 'saved-2', phrase: '学校', kana: 'がっこう', pinyin: 'gakkō', english: 'School', burmese: 'ကျောင်း' });
const database = tables => ({ get: table => tables[table] ?? [] });

test('selected level session contains only that level, preserving source ids and examples', () => {
  const other = { ...card, id: 'vocab-2', level: 'HSK2' };
  const source = Object.freeze([card, other]);
  const deck = readSessionCards(database({ flashcards: source }), { levelId: 'HSK2' });
  assert.equal(deck.length, 1);
  assert.equal(deck[0].id, 'vocab-2');
  assert.equal(deck[0].examples, other.examples);
  assert.deepEqual(source, [card, other]);
});

test('empty and unavailable levels never silently substitute another level', () => {
  assert.deepEqual(readSessionCards(database({ flashcards: [card] }), { levelId: 'HSK9' }), []);
  assert.deepEqual(readSessionCards(database({})), []);
});

test('saved sessions read bookmarks rather than course vocabulary, adapting legacy readings and kana', () => {
  const deck = readSessionCards(database({ saved_words: [saved], flashcards: [card] }), { mode: 'saved' });
  assert.equal(deck.length, 1);
  assert.equal(deck[0].id, saved.id);
  assert.equal(deck[0].character, '学校');
  assert.equal(deck[0].pronunciation, 'gakkō');
  assert.equal(deck[0].kana, 'がっこう');
  assert.equal(deck[0].definition, 'School');
  assert.equal(deck[0].burmese_definition, 'ကျောင်း');
  assert.equal(saved.character, undefined, 'stored bookmark is not rewritten');
});

test('review sessions use only the real queue and retain all queued cards', () => {
  const review = Array.from({ length: 31 }, (_, i) => ({ ...card, id: `review-${i}` }));
  const deck = readSessionCards(database({ review_cards: review, saved_words: [saved], flashcards: [card] }), { mode: 'review', levelId: 'HSK9' });
  assert.equal(deck.length, 31);
  assert.equal(deck[0].id, 'review-0');
  assert.deepEqual(readSessionCards(database({ flashcards: [card] }), { mode: 'review' }), []);
});

test('word display reads vocabulary meanings and dictionary meanings without modifying either', () => {
  assert.equal(wordDetails(card).english, 'Hello');
  assert.equal(wordDetails(card).burmese, 'မင်္ဂလာပါ');
  assert.equal(wordDetails(saved).english, 'School');
  assert.equal(wordDetails(saved).reading, 'gakkō');
  assert.equal(card.phrase, undefined);
});

test('course and collection search match accent-free readings, Japanese kana, and Burmese meanings', () => {
  const words = [card, saved];
  assert.deepEqual(filterStudyWords(words, 'ni hao'), [card]);
  assert.deepEqual(filterStudyWords(words, 'がっこう'), [saved]);
  assert.deepEqual(filterStudyWords(words, 'ကျောင်း'), [saved]);
  assert.deepEqual(filterStudyWords(words, 'HELLO'), [card]);
});

test('blank search preserves all records and a missing query result stays empty', () => {
  const words = [card, saved];
  assert.equal(filterStudyWords(words, '  '), words);
  assert.deepEqual(filterStudyWords(words, 'does-not-exist'), []);
});
