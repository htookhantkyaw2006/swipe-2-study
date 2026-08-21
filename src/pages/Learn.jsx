import { Routes, Route } from 'react-router-dom';
import LevelPicker from './Learn/LevelPicker';
import LessonPicker from './Learn/LessonPicker';
import SwipeSession from './Learn/SwipeSession';
import ReviewWords from './Learn/ReviewWords';

export default function Learn() {
  return (
    <Routes>
      <Route index element={<LevelPicker />} />
      <Route path="level/:levelId" element={<LessonPicker />} />
      <Route path="session" element={<SwipeSession />} />
      <Route path="review" element={<ReviewWords />} />
      <Route path="review/session" element={<SwipeSession isReview={true} />} />
    </Routes>
  );
}
