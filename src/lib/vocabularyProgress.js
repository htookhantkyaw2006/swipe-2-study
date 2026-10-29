import { wordOf, readingOf } from './entry.js';
import { sameStudyWord } from './studyWords.js';

/**
 * Vocabulary Learning Progress Store & Completion Rules
 *
 * Completion Rule:
 * 1. A vocabulary item is uniquely counted as "seen" if it has at least one recorded action (seen >= 1).
 * 2. A vocabulary item is uniquely counted as "learned" (mastered) if and only if its latest action
 *    was swipe right (status === 'known').
 * 3. Swiping left marks the word as 'learning' (status === 'learning', last_action === 'review') and
 *    places it in the review queue. It does NOT count as learned until swiped right again.
 * 4. Repeated actions or retries increment the item's seen count and update its latest timestamp,
 *    but never create duplicate records or inflate unique learned/seen totals.
 * 5. Level completion percentage is derived from uniqueLearned / totalWords in that level.
 */

export function getLearnedWords(database, language = null) {
  if (!database) return [];
  try {
    return language ? database.getFor(language, 'learned_words') : database.get('learned_words');
  } catch {
    return [];
  }
}

export function recordWordAction(database, {
  card,
  direction,
  levelId = null,
  now = () => new Date().toISOString(),
}) {
  if (!database || !card) return null;

  const written = wordOf(card);
  if (!written || typeof written !== 'string' || written.trim().length === 0) {
    return null;
  }

  const reading = card.pronunciation ?? readingOf(card) ?? '';
  const level = card.level || levelId || 'unknown';
  const action = direction === 'right' ? 'learned' : 'review';
  const status = direction === 'right' ? 'known' : 'learning';
  const nowIso = now();

  const words = database.get('learned_words');
  const existing = words.find(w => sameStudyWord(w, card));

  let resultRow;
  if (existing) {
    resultRow = database.update('learned_words', existing.id, {
      level: card.level || existing.level || level,
      seen: (existing.seen || 0) + 1,
      last_action: action,
      status,
      last_reviewed_at: nowIso,
      updated_at: nowIso,
    });
  } else {
    resultRow = database.insert('learned_words', {
      id: card.id ? `pw_${card.id}` : undefined,
      character: written.trim(),
      pronunciation: reading.trim(),
      level,
      seen: 1,
      last_action: action,
      status,
      last_reviewed_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    });
  }

  // Manage manual review queue
  try {
    const currentReviews = database.get('review_cards');
    if (direction === 'right') {
      // Swiping right clears card from review queue if present
      if (currentReviews.some(c => sameStudyWord(c, card))) {
        database.set('review_cards', currentReviews.filter(c => !sameStudyWord(c, card)));
      }
    } else if (direction === 'left') {
      // Swiping left adds card to review queue if not already present
      if (!currentReviews.some(c => sameStudyWord(c, card))) {
        database.set('review_cards', [...currentReviews, card]);
      }
    }
  } catch {
    // Review queue updates are best effort alongside progress record
  }

  return {
    row: resultRow,
    status,
    isLearned: status === 'known',
  };
}

export function getCourseProgress(database, course, language = null) {
  const lang = language || course?.id;
  const learnedWords = getLearnedWords(database, lang);

  const seenMap = new Map();
  const learnedMap = new Map();

  for (const row of learnedWords) {
    if (!row || typeof row !== 'object') continue;
    const written = wordOf(row);
    if (!written) continue;
    const reading = row.pronunciation ?? readingOf(row) ?? '';
    const key = `${written}:${reading}`.toLowerCase();

    if ((row.seen || 0) >= 1) {
      seenMap.set(key, row);
    }
    if (row.status === 'known') {
      learnedMap.set(key, row);
    } else {
      learnedMap.delete(key);
    }
  }

  const levels = {};
  if (course?.levels && Array.isArray(course.levels)) {
    for (const lvl of course.levels) {
      const levelId = lvl.id;
      const levelWords = learnedWords.filter(w => w.level === levelId);

      const levelSeenMap = new Set();
      const levelLearnedMap = new Set();

      for (const row of levelWords) {
        const written = wordOf(row);
        if (!written) continue;
        const reading = row.pronunciation ?? readingOf(row) ?? '';
        const key = `${written}:${reading}`.toLowerCase();

        if ((row.seen || 0) >= 1) {
          levelSeenMap.add(key);
        }
        if (row.status === 'known') {
          levelLearnedMap.add(key);
        } else {
          levelLearnedMap.delete(key);
        }
      }

      let bundledCount = 0;
      try {
        const flashcards = lang ? database.getFor(lang, 'flashcards') : database.get('flashcards');
        bundledCount = flashcards.filter(c => c.level === levelId).length;
      } catch {
        bundledCount = 0;
      }

      const totalTarget = lvl.words || bundledCount || 0;
      const uniqueLearned = levelLearnedMap.size;
      const percent = totalTarget > 0 ? Math.min(100, Math.floor((uniqueLearned / totalTarget) * 100)) : 0;

      levels[levelId] = {
        id: levelId,
        name: lvl.name,
        words: lvl.words,
        bundledCount,
        uniqueSeen: levelSeenMap.size,
        uniqueLearned,
        percent,
      };
    }
  }

  return {
    uniqueSeen: seenMap.size,
    uniqueLearned: learnedMap.size,
    levels,
  };
}

export function getLevelProgress(database, levelId, course, language = null) {
  const courseProgress = getCourseProgress(database, course, language);
  return courseProgress.levels[levelId] || {
    id: levelId,
    name: levelId,
    words: 0,
    bundledCount: 0,
    uniqueSeen: 0,
    uniqueLearned: 0,
    percent: 0,
  };
}

export function resetVocabularyProgress(database, language = null) {
  if (!database) return;
  if (language) {
    database.setFor(language, 'learned_words', []);
  } else {
    database.set('learned_words', []);
  }
}

