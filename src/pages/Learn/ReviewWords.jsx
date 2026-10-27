import { useState } from 'react';
import { db } from '../../lib/db';
import { useCourse } from '../../lib/language';
import WordCollection from '../../components/study/WordCollection';

export default function ReviewWords() {
  const course = useCourse();
  const [words] = useState(() => db.get('review_cards'));
  return <WordCollection kind="review" words={words} courseName={course.name} />;
}
