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
