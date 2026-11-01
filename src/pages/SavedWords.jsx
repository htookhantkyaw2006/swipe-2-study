import { useState, useCallback } from 'react';
import { db } from '../lib/db';
import { useCourse } from '../lib/language';
import WordCollection from '../components/study/WordCollection';

export default function SavedWords() {
  const course = useCourse();
  // Existing bookmarks, including older sample rows, stay intact. Opening an
  // empty collection must not silently insert or resurrect sample bookmarks.
  const [words, setWords] = useState(() => {
    try {
      return db.get('saved_words') || [];
    } catch {
      return null;
    }
  });
  const [error, setError] = useState(() => {
    try {
      db.get('saved_words');
      return null;
    } catch {
      return 'Unable to load saved words.';
    }
  });
  const [notice, setNotice] = useState('');

  const handleRetry = useCallback(() => {
    try {
      const loaded = db.get('saved_words') || [];
      setWords(loaded);
      setError(null);
    } catch {
      setWords(null);
      setError('Unable to load saved words. Try again.');
    }
  }, []);

  const handleUnsave = useCallback((id, phrase) => {
    try {
      db.remove('saved_words', id);
      setWords(db.get('saved_words') || []);
      setNotice(`Removed ${phrase} from saved words.`);
    } catch {
      setNotice(`Unable to remove ${phrase}. Try again.`);
    }
  }, []);

  return (
    <WordCollection
      kind="saved"
      words={words}
      error={error}
      onRetry={handleRetry}
      onUnsave={handleUnsave}
      courseName={course.name}
      notice={notice}
    />
  );
}
