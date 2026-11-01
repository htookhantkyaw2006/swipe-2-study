import { useState, useCallback } from 'react';
import { db } from '../../lib/db';
import { useCourse } from '../../lib/language';
import WordCollection from '../../components/study/WordCollection';

export default function ReviewWords() {
  const course = useCourse();
  const [words, setWords] = useState(() => {
    try {
      return db.get('review_cards') || [];
    } catch {
      return null;
    }
  });
  const [error, setError] = useState(() => {
    try {
      db.get('review_cards');
      return null;
    } catch {
      return 'Unable to load review words.';
    }
  });

  const handleRetry = useCallback(() => {
    try {
      const loaded = db.get('review_cards') || [];
      setWords(loaded);
      setError(null);
    } catch {
      setWords(null);
      setError('Unable to load review words. Try again.');
    }
  }, []);

  return (
    <WordCollection
      kind="review"
      words={words}
      error={error}
      onRetry={handleRetry}
      courseName={course.name}
    />
  );
}
