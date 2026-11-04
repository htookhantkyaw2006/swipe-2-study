import { wordOf, readingOf } from './entry.js';
import { sameStudyWord, studyWordKey, HOMONYM_SENSE_WORDS } from './studyWords.js';

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
  progressAlreadyPersisted = false,
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

  const words = database.get('learned_words') || [];
  const existing = words.find(w => sameStudyWord(w, card));

  const currentReviews = database.get('review_cards') || [];
  const inReviews = currentReviews.some(c => sameStudyWord(c, card));

  // Determine whether progress in learned_words has ALREADY been persisted
  // for this specific swipe action (e.g. previous attempt wrote learned_words but review_cards failed).
  // Do NOT infer successful persistence solely from matching last_action or a generic retry flag.
  const hasProgressPersisted = Boolean(progressAlreadyPersisted);

  let resultRow;
  if (existing) {
    resultRow = database.update('learned_words', existing.id, {
      level: card.level || existing.level || level,
      seen: hasProgressPersisted ? (existing.seen || 1) : ((existing.seen || 0) + 1),
      last_action: action,
      status,
      last_reviewed_at: nowIso,
      updated_at: nowIso,
    });
  } else {
    resultRow = database.insert('learned_words', {
      id: card.id ? `pw_${card.id}` : undefined,
      card_id: card.card_id || (typeof card.id === 'string' && /^(?:ja|zh)-/i.test(card.id) ? card.id : undefined),
      character: written.trim(),
      pronunciation: reading.trim(),
      level,
      seen: 1,
      last_action: action,
      status,
      last_reviewed_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
      ...(card.sense_key ? { sense_key: card.sense_key } : {}),
      ...(card.part_of_speech ? { part_of_speech: card.part_of_speech } : {}),
      ...(card.definition ? { definition: card.definition, english: card.definition } : {}),
      ...(card.burmese_definition ? { burmese_definition: card.burmese_definition, burmese: card.burmese_definition } : {}),
    });
  }

  // Manage manual review queue synchronously; if queue update fails, tag error with progressPersisted: true
  // so callers know that progress was already committed and should not be double-counted on retry.
  try {
    if (direction === 'right') {
      // Swiping right clears card from review queue if present
      if (inReviews) {
        database.set('review_cards', currentReviews.filter(c => !sameStudyWord(c, card)));
      }
    } else if (direction === 'left') {
      // Swiping left adds card to review queue if not already present
      if (!inReviews) {
        database.set('review_cards', [...currentReviews, card]);
      }
    }
  } catch (queueErr) {
    const err = new Error(queueErr?.message || 'Review queue persistence failed');
    err.name = queueErr?.name || 'QueuePersistenceError';
    err.cause = queueErr;
    err.progressPersisted = true;
    err.stage = 'review_queue';
    err.committedRow = resultRow;
    throw err;
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
    const key = studyWordKey(row) || `${written}:${reading}`.toLowerCase();

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
        const key = studyWordKey(row) || `${written}:${reading}`.toLowerCase();

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
    studiedCount: seenMap.size,
    uniqueSeen: seenMap.size,
    uniqueLearned: learnedMap.size,
    levels,
  };
}

export function getLevelProgress(database, levelId, course, language = null, targetOverrideOrItems = null) {
  const courseProgress = getCourseProgress(database, course, language);
  const base = courseProgress.levels[levelId] || {
    id: levelId,
    name: levelId,
    words: 0,
    bundledCount: 0,
    uniqueSeen: 0,
    uniqueLearned: 0,
    percent: 0,
  };

  // If loaded curriculum items are provided, calculate completion by intersecting
  // learner records with the currently loaded curriculum using stable and natural identity.
  const curriculumItems = Array.isArray(targetOverrideOrItems)
    ? targetOverrideOrItems
    : targetOverrideOrItems && typeof targetOverrideOrItems === 'object' && Array.isArray(targetOverrideOrItems.items)
      ? targetOverrideOrItems.items
      : null;

  if (curriculumItems !== null) {
    const lang = language || course?.id;
    const learnedWords = getLearnedWords(database, lang);

    const knownIds = new Set();
    const seenIds = new Set();
    const knownKeys = new Set();
    const seenKeys = new Set();
    const knownNaturalKeys = new Set();
    const seenNaturalKeys = new Set();

    for (const row of learnedWords) {
      if (!row || typeof row !== 'object') continue;
      const written = wordOf(row);
      const reading = (row.pronunciation ?? readingOf(row) ?? '').trim().toLowerCase();
      const rowKey = studyWordKey(row);
      const isHomonym = HOMONYM_SENSE_WORDS.has(written);
      const naturalKey = written && !isHomonym ? `${written}:${reading}` : null;

      const rawId = row.id ? String(row.id) : null;
      const bareId = rawId && rawId.startsWith('pw_') ? rawId.slice(3) : rawId;
      const cardId = row.card_id ? String(row.card_id) : null;

      if ((row.seen || 0) >= 1) {
        if (rawId) seenIds.add(rawId);
        if (bareId) seenIds.add(bareId);
        if (cardId) seenIds.add(cardId);
        if (rowKey) seenKeys.add(rowKey);
        if (naturalKey) seenNaturalKeys.add(naturalKey);
      }

      if (row.status === 'known') {
        if (rawId) knownIds.add(rawId);
        if (bareId) knownIds.add(bareId);
        if (cardId) knownIds.add(cardId);
        if (rowKey) knownKeys.add(rowKey);
        if (naturalKey) knownNaturalKeys.add(naturalKey);
      } else {
        if (rawId) knownIds.delete(rawId);
        if (bareId) knownIds.delete(bareId);
        if (cardId) knownIds.delete(cardId);
        if (rowKey) knownKeys.delete(rowKey);
        if (naturalKey) knownNaturalKeys.delete(naturalKey);
      }
    }

    let activeLearned = 0;
    let activeSeen = 0;

    for (const item of curriculumItems) {
      if (!item || typeof item !== 'object') continue;
      const itemId = item.id ? String(item.id) : null;
      const written = item.character || item.written_form || wordOf(item);
      const reading = (item.pronunciation ?? item.reading ?? readingOf(item) ?? '').trim().toLowerCase();
      const isHomonym = HOMONYM_SENSE_WORDS.has(written);
      const naturalKey = written && !isHomonym ? `${written}:${reading}` : null;
      const itemKey = studyWordKey(item);

      const isKnown = Boolean(
        (itemId && (knownIds.has(itemId) || knownIds.has(`pw_${itemId}`))) ||
        (itemKey && knownKeys.has(itemKey)) ||
        (naturalKey && knownNaturalKeys.has(naturalKey))
      );

      const isSeen = Boolean(
        isKnown ||
        (itemId && (seenIds.has(itemId) || seenIds.has(`pw_${itemId}`))) ||
        (itemKey && seenKeys.has(itemKey)) ||
        (naturalKey && seenNaturalKeys.has(naturalKey))
      );

      if (isKnown) activeLearned++;
      if (isSeen) activeSeen++;
    }

    const totalTarget = curriculumItems.length;
    const percent = totalTarget > 0 ? Math.min(100, Math.floor((activeLearned / totalTarget) * 100)) : 0;

    return {
      ...base,
      words: totalTarget,
      uniqueLearned: activeLearned,
      uniqueSeen: activeSeen,
      percent,
      historicalLearned: base.uniqueLearned,
      historicalSeen: base.uniqueSeen,
    };
  }

  if (targetOverrideOrItems !== null && targetOverrideOrItems !== undefined) {
    const totalTarget = typeof targetOverrideOrItems === 'number' ? targetOverrideOrItems : 0;
    const uniqueLearned = totalTarget === 0 ? 0 : base.uniqueLearned;
    const uniqueSeen = totalTarget === 0 ? 0 : base.uniqueSeen;
    const percent = totalTarget > 0 ? Math.min(100, Math.floor((uniqueLearned / totalTarget) * 100)) : 0;
    return {
      ...base,
      words: totalTarget,
      uniqueLearned,
      uniqueSeen,
      percent,
      historicalLearned: base.uniqueLearned,
      historicalSeen: base.uniqueSeen,
    };
  }

  return {
    ...base,
    historicalLearned: base.uniqueLearned,
    historicalSeen: base.uniqueSeen,
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

