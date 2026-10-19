import { makeProgress, KNOWN_AT, LEVELS, levelFor, countKnown } from './progress';

/* Radical drill progress — see lib/progress.js for how mastery works. */

const store = makeProgress('learned_radicals', 'radical');

export { KNOWN_AT, LEVELS, levelFor, countKnown };
export const readProgress = () => store.read();
export const recordAnswer = (radical, wasCorrect) => store.record(radical, wasCorrect);
export const resetProgress = () => store.reset();
