import { matchesQuery, readingOf, wordOf, kanaOf } from './entry.js';

export const HOMONYM_SENSE_WORDS = new Set(['あの', 'ある', 'かける', 'キロ', 'もう']);

export function extractCanonicalSenseId(word) {
  if (!word || typeof word !== 'object') return '';
  if (typeof word.sense_id === 'string' && word.sense_id.trim()) {
    return word.sense_id.trim();
  }
  if (typeof word.sense_key === 'string' && word.sense_key.trim()) {
    return word.sense_key.trim();
  }
  if (typeof word.card_id === 'string' && word.card_id.trim()) {
    return word.card_id.trim();
  }
  if (typeof word.id === 'string') {
    if (word.id.startsWith('pw_')) return word.id.slice(3);
    if (/^(?:ja|zh)-/i.test(word.id)) return word.id.trim();
  }
  return '';
}

export function extractCanonicalId(word) {
  const senseId = extractCanonicalSenseId(word);
  return senseId || null;
}

// IDs in old guest/account starter decks were generated independently. Compare
// written form + pronunciation, preserving tones and distinct readings.
// For words with intentional multiple senses (e.g. Japanese N5 homonyms), incorporate
// canonical course ID or sense discriminator so senses remain distinct and independent.
// Do not encode definitions or guess ambiguous legacy senses.
export function studyWordKey(word) {
  if (!word || typeof word !== 'object') return null;
  const normalize = value => typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase() : '';
  const written = normalize(wordOf(word));
  if (!written) return null;

  const pronunciation = normalize(word?.pronunciation ?? readingOf(word));
  const isHomonym = HOMONYM_SENSE_WORDS.has(written) || Boolean(word.sense_key || word.sense_id);

  if (isHomonym) {
    const canonicalSense = extractCanonicalSenseId(word);
    if (canonicalSense) {
      return JSON.stringify([written, pronunciation, canonicalSense]);
    }
  }

  return JSON.stringify([written, pronunciation]);
}

export function sameStudyWord(left, right) {
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;

  const leftCanonicalId = extractCanonicalId(left);
  const rightCanonicalId = extractCanonicalId(right);

  // If both have canonical course IDs, match strictly on canonical ID
  if (leftCanonicalId && rightCanonicalId && /^(?:ja|zh)-/i.test(leftCanonicalId) && /^(?:ja|zh)-/i.test(rightCanonicalId)) {
    return leftCanonicalId === rightCanonicalId;
  }

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

/**
 * Find an existing saved word matching a vocabulary card or dictionary entry.
 * Checks canonical card_id if present, natural identity (word + pronunciation/reading,
 * tone-preserving) to recognize compatible legacy/Dictionary bookmarks, and
 * fallback storage/card IDs.
 *
 * @param {object[]} savedWords  Array of stored rows from 'saved_words'.
 * @param {object}   card        Vocabulary card or entry to search for.
 * @returns {object|null}        The matched stored record (with its stored id), or null.
 */
export function findSavedWord(savedWords, card) {
  if (!Array.isArray(savedWords) || !card || typeof card !== 'object') return null;

  const cardCanonicalId = extractCanonicalId(card);

  // 1. Direct canonical card_id match if item has card_id and card has canonical ID
  if (cardCanonicalId) {
    for (const item of savedWords) {
      if (item && (item.card_id === cardCanonicalId || item.id === cardCanonicalId)) return item;
    }
  }

  // 2. Natural key match (written form + reading/pronunciation), preserving tones, polyphones, and sense disambiguation
  const cardKey = studyWordKey(card);
  if (cardKey !== null) {
    for (const item of savedWords) {
      if (!item) continue;
      const itemCanonicalId = extractCanonicalId(item);
      if (cardCanonicalId && itemCanonicalId && cardCanonicalId !== itemCanonicalId) {
        continue;
      }
      if (studyWordKey(item) === cardKey) return item;
    }
  }

  // 3. Fallback matching when card.id is a stable card reference matching item.card_id or item is the exact stored record by id (e.g. in saved session)
  if (card.id) {
    for (const item of savedWords) {
      if (item && (item.card_id === card.id || item.id === card.id)) return item;
    }
  }

  return null;
}

/**
 * Build a new record for inserting into 'saved_words' from a vocabulary card.
 * Preserves canonical card_id, level, phrase, reading, definitions, examples,
 * and optional audio_path / part_of_speech / sense_key.
 * Does NOT set a storage 'id', allowing db.insert to assign a dedicated storage UUID,
 * distinguishing vocabulary identity (card_id) from storage record id.
 *
 * @param {object} card  Vocabulary card to bookmark.
 * @returns {object}     Payload ready for db.insert('saved_words', ...).
 */
export function buildSavedWordRecord(card) {
  if (!card || typeof card !== 'object') return {};
  const phrase = wordOf(card);
  const reading = card.pronunciation ?? readingOf(card);
  const english = card.definition ?? card.english ?? '';
  const burmese = card.burmese_definition ?? card.burmese ?? '';
  const kana = kanaOf(card);
  const cardId = card.card_id ?? (card.id && typeof card.id === 'string' && !card.id.includes('/') ? card.id : undefined);

  const record = {
    phrase,
    reading,
    english,
    burmese,
    definition: english,
    burmese_definition: burmese,
  };

  if (kana) record.kana = kana;
  if (cardId) record.card_id = cardId;
  if (card.sense_id) record.sense_id = card.sense_id;
  if (card.level) record.level = card.level;
  if (card.sense_key) record.sense_key = card.sense_key;
  if (card.part_of_speech) record.part_of_speech = card.part_of_speech;
  if (Array.isArray(card.examples) && card.examples.length > 0) {
    record.examples = card.examples;
  }
  if (typeof card.audio_path === 'string' && card.audio_path) {
    record.audio_path = card.audio_path;
  }
  if (typeof card.part_of_speech === 'string' && card.part_of_speech) {
    record.part_of_speech = card.part_of_speech;
  }

  return record;
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
 *   totalCourseActive: number, Total active cards across the level (before trial cap).
 *   totalStudied: number,      Studied cards within the effective pool.
 *   allStudied: boolean,       Every card in the effective pool has been studied (false if 0 cards).
 *   allTrialStudied: boolean,  Guest-specific: all trial words have been studied (false if 0 cards).
 *   trialSize: number,         Effective guest trial pool size (0 for signed-in learners or 0 cards).
 * }}
 */
export function buildNormalSessionCards(activeCards, studiedKeys, {
  shuffle = false,
  sessionSize = 10,
  isGuest = false,
  guestTrialSize = 30,
} = {}) {
  const totalCourseActive = Array.isArray(activeCards) ? activeCards.length : 0;
  if (totalCourseActive === 0) {
    return {
      cards: [],
      totalActive: 0,
      totalCourseActive: 0,
      totalStudied: 0,
      allStudied: false,
      allTrialStudied: false,
      trialSize: 0,
    };
  }

  // Effective trial size is at most the total active vocabulary available.
  const effectiveTrialSize = isGuest ? Math.min(totalCourseActive, guestTrialSize) : 0;
  const pool = isGuest ? activeCards.slice(0, effectiveTrialSize) : activeCards;

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
  const allStudied = totalActive > 0 && unstudied.length === 0;
  const allTrialStudied = isGuest && allStudied;

  if (allStudied) {
    return {
      cards: [],
      totalActive,
      totalCourseActive,
      totalStudied,
      allStudied: true,
      allTrialStudied,
      trialSize: effectiveTrialSize,
    };
  }

  const deck = shuffle ? shuffleInPlace([...unstudied]) : [...unstudied];
  const cards = deck.slice(0, sessionSize);

  return {
    cards,
    totalActive,
    totalCourseActive,
    totalStudied,
    allStudied: false,
    allTrialStudied: false,
    trialSize: effectiveTrialSize,
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
