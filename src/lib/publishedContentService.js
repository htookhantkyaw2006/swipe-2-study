import { getSupabaseClient } from './supabase.js';

export const SUPPORTED_PUBLISHED_COURSES = Object.freeze({
  'zh-hsk1': { courseId: 'zh-hsk1', languageId: 'zh', levelId: 'HSK1' },
  'ja-n5': { courseId: 'ja-n5', languageId: 'ja', levelId: 'N5' },
});

/**
 * Resolves app language + level identifier to a supported published course ID.
 * Returns null if the level is not an in-scope published course.
 */
export function resolvePublishedCourseId(languageId, levelId) {
  if (!languageId || !levelId) return null;
  const lang = String(languageId).toLowerCase();
  const lvl = String(levelId).trim().toUpperCase();

  if (lang === 'zh' && (lvl === 'HSK1' || lvl === '1' || lvl === 'HSK 1')) {
    return 'zh-hsk1';
  }
  if (lang === 'ja' && (lvl === 'N5' || lvl === '5' || lvl === 'JLPT N5' || lvl === 'JLPTN5')) {
    return 'ja-n5';
  }
  return null;
}

/**
 * Checks whether a language + level is in-scope for published content integration.
 */
export function isPublishedCourseLevel(languageId, levelId) {
  return Boolean(resolvePublishedCourseId(languageId, levelId));
}

/**
 * Maps a public.vocabulary database record into the client's flashcard card contract.
 */
export function mapVocabularyToCard(vocab, courseData, index = 0) {
  if (!vocab || typeof vocab !== 'object') {
    throw new TypeError('Vocabulary record must be an object');
  }

  const isJa = (courseData?.language || (vocab.course_id === 'ja-n5' ? 'ja' : 'zh')) === 'ja';
  const reading = vocab.reading || '';
  const levelId = courseData?.level_id || (vocab.course_id === 'zh-hsk1' ? 'HSK1' : 'N5');

  return {
    id: vocab.id,
    course_id: vocab.course_id,
    language: courseData?.language || (vocab.course_id === 'zh-hsk1' ? 'zh' : 'ja'),
    level: levelId,
    character: vocab.written_form,
    pronunciation: reading,
    reading,
    ...(isJa ? { kana: reading } : {}),
    definition: vocab.meaning_english || '',
    burmese_definition: vocab.meaning_burmese || '',
    audio_path: vocab.audio_path || null,
    examples: Array.isArray(vocab.examples) ? vocab.examples : [],
    sort_order: typeof vocab.sort_order === 'number' ? vocab.sort_order : index,
    card_order: index + 1,
    lesson_order: 1,
    lesson_name: vocab.course_id === 'zh-hsk1' ? 'HSK 1 Vocabulary' : 'JLPT N5 Vocabulary',
    is_active: Boolean(vocab.is_active),
  };
}

/**
 * Loads published course content for zh-hsk1 or ja-n5.
 * Uses public read permissions (anon / authenticated) and handles complete pagination.
 *
 * Returns:
 *   { isPublished: boolean, version: number | null, items: Card[], courseId: string }
 */
export async function fetchPublishedCourseContent(courseId, { client = null, pageSize = 1000 } = {}) {
  if (!SUPPORTED_PUBLISHED_COURSES[courseId]) {
    throw new Error(`Unsupported published course '${courseId}'. Only 'zh-hsk1' and 'ja-n5' are permitted.`);
  }

  const dbClient = client || getSupabaseClient();
  if (!dbClient) {
    throw new Error('Supabase client is required to fetch published content.');
  }

  // 1. Verify course exists and is published in public.courses
  const { data: courseData, error: courseError } = await dbClient
    .from('courses')
    .select('id, language, level_id, title, is_published, content_version')
    .eq('id', courseId)
    .maybeSingle();

  if (courseError) {
    throw new Error(`Failed to query course '${courseId}': ${courseError.message}`);
  }

  if (!courseData || !courseData.is_published) {
    return {
      isPublished: false,
      version: null,
      items: [],
      courseId,
    };
  }

  // 2. Fetch active vocabulary items with complete pagination
  const allRows = [];
  let from = 0;

  while (true) {
    const { data: rows, error: vocabError } = await dbClient
      .from('vocabulary')
      .select('id, course_id, written_form, reading, meaning_english, meaning_burmese, audio_path, examples, sort_order, is_active')
      .eq('course_id', courseId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (vocabError) {
      throw new Error(`Failed to query vocabulary for course '${courseId}': ${vocabError.message}`);
    }

    if (!rows || rows.length === 0) {
      break;
    }

    allRows.push(...rows);

    if (rows.length < pageSize) {
      break;
    }
    from += pageSize;
  }

  const items = allRows.map((vocab, index) => mapVocabularyToCard(vocab, courseData, index));

  return {
    isPublished: true,
    version: Number(courseData.content_version),
    items,
    courseId,
  };
}

