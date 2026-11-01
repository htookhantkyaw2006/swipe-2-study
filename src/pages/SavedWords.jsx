import { useState } from 'react';
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
      return [];
    }
  });
  const [notice, setNotice] = useState('');
  const handleUnsave = (id, phrase) => {
    try {
      db.remove('saved_words', id);
      setWords(db.get('saved_words') || []);
      setNotice(`Removed ${phrase} from saved words.`);
    } catch {
      setNotice(`Unable to remove ${phrase}. Try again.`);
    }
  };
  return <WordCollection kind="saved" words={words} onUnsave={handleUnsave} courseName={course.name} notice={notice} />;
}
