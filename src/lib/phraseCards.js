import { readingOf } from './entry.js';

const key = value => String(value ?? '').toLowerCase().replace(/[\s-]/g, '');
export function phraseLevel(course, value) {
  return course.levels.find(level => [level.id, level.name, level.badge].some(name => key(name) === key(value)));
}
export function phraseCards(course, levelId = null) {
  const level = levelId ? phraseLevel(course, levelId) : course.levels[0];
  if (!level) return [];
  return (course.phrases ?? []).filter(card => [level.id, level.name, level.badge].some(name => key(name) === key(card.level))).map(card => ({
    ...card, character: card.phrase, pronunciation: readingOf(card),
    definition: card.english, burmese_definition: card.burmese,
  }));
}
