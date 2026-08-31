import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Learn from './pages/Learn';
import Library from './pages/Library';
import Flashcards from './pages/Flashcards';
import PhrasesLevel from './pages/PhrasesLevel';
import PhrasesSwipeSession from './pages/PhrasesSwipeSession';
import Profile from './pages/Profile';
import SettingsSubpage from './pages/SettingsSubpage';
import SavedWords from './pages/SavedWords';
import Dictionary from './pages/Dictionary';
import Notifications from './pages/Notifications';
import StudyByInterest from './pages/StudyByInterest';
import WritingPractice from './pages/WritingPractice';
import LearnRadicals from './pages/LearnRadicals';
import './App.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="learn/*" element={<Learn />} />
        <Route path="library" element={<Library />} />
        <Route path="flashcards" element={<Flashcards />} />
        <Route path="flashcards/level/:levelId" element={<PhrasesLevel />} />
        <Route path="flashcards/session" element={<PhrasesSwipeSession />} />
        <Route path="saved" element={<SavedWords />} />
        <Route path="dictionary" element={<Dictionary />} />
        <Route path="interest" element={<StudyByInterest />} />
        <Route path="writing" element={<WritingPractice />} />
        <Route path="radicals" element={<LearnRadicals />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<SettingsSubpage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
