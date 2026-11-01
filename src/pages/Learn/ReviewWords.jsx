import { useState } from 'react';
import { db } from '../../lib/db';
import { useCourse } from '../../lib/language';
import WordCollection from '../../components/study/WordCollection';

export default function ReviewWords() {
  const course = useCourse();
  const [words] = useState(() => {
    try {
      return db.get('review_cards') || [];
    } catch {
      return [];
    }
  });
  return <WordCollection kind="review" words={words} courseName={course.name} />;
}
