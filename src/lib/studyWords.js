import { matchesQuery, readingOf, wordOf } from './entry.js';

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
