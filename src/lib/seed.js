import { db } from './db';
import { getCourse } from '../courses';
import { getActiveLanguageId } from './activeLanguage';

const generateId = () => Math.random().toString(36).substring(2, 15);

/**
 * Put a course's starter vocabulary into its flashcards table.
 *
 * Re-seeds when the table is empty or holds rows from before the rich
 * schema (no examples / no Burmese) — the same rule the Chinese seed
 * always used, now applied per language.
 */
export function seedCourse(courseId) {
  const course = getCourse(courseId);
  const cards = db.getFor(course.id, 'flashcards');
  const needsSeed = cards.length === 0 || !cards[0].examples || !cards[0].burmese_definition;
  if (!needsSeed) return;

  const now = new Date().toISOString();
  const seeded = course.vocabulary.map((card, i) => ({
    id: generateId(),
    created_at: now,
    language: course.id,
    level: course.levels[0].id,
    lesson_name: course.copy.lessonName,
    lesson_order: 1,
    card_order: i + 1,
    ...card
  }));

  db.setFor(course.id, 'flashcards', seeded);
}

export function seedDB() {
  seedCourse(getActiveLanguageId());
}
