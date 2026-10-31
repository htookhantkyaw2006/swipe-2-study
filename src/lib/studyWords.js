import { matchesQuery, readingOf, wordOf } from './entry.js';

// IDs in old guest/account starter decks were generated independently. Compare
// written form + pronunciation, preserving tones and distinct readings.
export function studyWordKey(word) {
  const normalize = value => typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase() : '';
  const written = normalize(wordOf(word));
  return written ? JSON.stringify([written, normalize(word?.pronunciation ?? readingOf(word))]) : null;
}

export function sameStudyWord(left, right) {
  const key = studyWordKey(left);
  return key !== null ? key === studyWordKey(right) : left?.id !== undefined && left.id === right?.id;
}

// Dictionary bookmarks and vocabulary cards have different stored shapes.
// Adapt them for display/session use without rewriting the saved records.
export function wordDetails(word) {
  return {
    ...word,
    phrase: wordOf(word),
    reading: word.pronunciation ?? readingOf(word),
    english: word.definition ?? word.english ?? '',
    burmese: word.burmese_definition ?? word.burmese ?? '',
  };
}

export function filterStudyWords(words, query) {
  return query.trim() ? words.filter(word => matchesQuery(wordDetails(word), query)) : words;
}

export function readSessionCards(database, { mode = 'learn', levelId = null } = {}) {
  const table = mode === 'saved' ? 'saved_words' : mode === 'review' ? 'review_cards' : 'flashcards';
  const words = database.get(table);
  const selected = mode === 'learn' && levelId ? words.filter(word => word.level === levelId) : words;
  return selected.map(word => {
    const detail = wordDetails(word);
    return {
      ...word,
      character: detail.phrase,
      pronunciation: detail.reading,
      definition: detail.english,
      burmese_definition: detail.burmese,
    };
  });
}

// Fisher-Yates in-place shuffle (returns the mutated array).
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Build a snapshotted normal-Learn session deck for a single level.
 *
 * @param {object[]} activeCards
 *   All active cards for the selected level in canonical sort_order.
 *   These are already adapted to the card contract (character / pronunciation /
 *   definition / burmese_definition fields present).
 *
 * @param {Set<string>} studiedKeys
 *   Set of studyWordKey() strings that the learner has already swiped (seen >= 1).
 *   Build it from getLearnedWords() *before* calling this function so the caller
 *   controls which database / language scope to use.
 *
 * @param {object} options
 *   - shuffle {boolean}       Randomise the unstudied pool before slicing. Default false.
 *   - sessionSize {number}    Maximum cards in one session. Default 10.
 *   - isGuest {boolean}       Whether the current user is a confirmed guest. Default false.
 *   - guestTrialSize {number} Pool cap for guest users. Default 30.
 *
 * @returns {{
 *   cards: object[],           Cards to present in this session (snapshotted).
 *   totalActive: number,       Total active cards in the effective pool.
 *   totalStudied: number,      Studied cards within the effective pool.
 *   allStudied: boolean,       Every card in the effective pool has been studied.
 *   allTrialStudied: boolean,  Guest-specific: all trial words have been studied.
 *   trialSize: number,         Guest trial pool size (0 for signed-in learners).
 * }}
 */
export function buildNormalSessionCards(activeCards, studiedKeys, {
  shuffle = false,
  sessionSize = 10,
  isGuest = false,
  guestTrialSize = 30,
} = {}) {
  // For guests, cap the eligible pool to the first guestTrialSize cards by
  // canonical sort_order (the caller is responsible for sort order).
  const pool = isGuest ? activeCards.slice(0, guestTrialSize) : activeCards;

  const totalActive = pool.length;
  let studiedInPool = 0;
  const unstudied = [];

  for (const card of pool) {
    const key = studyWordKey(card);
    const seen = key !== null ? studiedKeys.has(key) : false;
    if (seen) {
      studiedInPool++;
    } else {
      unstudied.push(card);
    }
  }

  const totalStudied = studiedInPool;
  const allStudied = unstudied.length === 0;
  const allTrialStudied = isGuest && allStudied;

  if (allStudied) {
    return {
      cards: [],
      totalActive,
      totalStudied,
      allStudied: true,
      allTrialStudied,
      trialSize: isGuest ? guestTrialSize : 0,
    };
  }

  const deck = shuffle ? shuffleInPlace([...unstudied]) : [...unstudied];
  const cards = deck.slice(0, sessionSize);

  return {
    cards,
    totalActive,
    totalStudied,
    allStudied: false,
    allTrialStudied: false,
    trialSize: isGuest ? guestTrialSize : 0,
  };
}

/**
 * Build a Set of studyWordKey() strings for all words the learner has swiped
 * (seen >= 1) from a raw learned_words array returned by getLearnedWords().
 */
export function buildStudiedKeySet(learnedWords) {
  const keys = new Set();
  for (const row of learnedWords) {
    if (!row || typeof row !== 'object') continue;
    if ((row.seen || 0) < 1) continue;
    const key = studyWordKey(row);
    if (key !== null) keys.add(key);
  }
  return keys;
}
