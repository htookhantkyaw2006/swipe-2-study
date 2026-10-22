import { makeProgress, KNOWN_AT, LEVELS, levelFor, countKnown } from './progress';

/* Sounds of English quiz progress — see lib/progress.js for how
   mastery works. Rows keyed by IPA symbol. */

const store = makeProgress('learned_sounds', 'sound');

export { KNOWN_AT, LEVELS, levelFor, countKnown };
export const readSoundProgress = () => store.read();
export const recordSoundAnswer = (sound, wasCorrect) => store.record(sound, wasCorrect);
export const resetSoundProgress = () => store.reset();
