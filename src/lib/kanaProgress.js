import { makeProgress, KNOWN_AT, LEVELS, levelFor, countKnown } from './progress';

/* Kana quiz progress — see lib/progress.js for how mastery works.
   Hiragana and katakana are distinct characters, so one table holds both. */

const store = makeProgress('learned_kana', 'kana');

export { KNOWN_AT, LEVELS, levelFor, countKnown };
export const readKanaProgress = () => store.read();
export const recordKanaAnswer = (kana, wasCorrect) => store.record(kana, wasCorrect);
export const resetKanaProgress = () => store.reset();
