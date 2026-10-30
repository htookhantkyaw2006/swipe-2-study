import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { RouteErrorBoundary, RouteLoadingFallback } from './components/RouteErrorBoundary';
import Home from './pages/Home';

// Lazy-loaded route pages
const Learn = lazy(() => import('./pages/Learn'));
const Library = lazy(() => import('./pages/Library'));
const Flashcards = lazy(() => import('./pages/Flashcards'));
const PhrasesLevel = lazy(() => import('./pages/PhrasesLevel'));
const PhrasesSwipeSession = lazy(() => import('./pages/PhrasesSwipeSession'));
const Profile = lazy(() => import('./pages/Profile'));
const EditProfile = lazy(() => import('./pages/EditProfile'));
const Premium = lazy(() => import('./pages/Premium'));
const SettingsSubpage = lazy(() => import('./pages/SettingsSubpage'));
const SavedWords = lazy(() => import('./pages/SavedWords'));
const SwipeSession = lazy(() => import('./pages/Learn/SwipeSession'));
const Dictionary = lazy(() => import('./pages/Dictionary'));
const Notifications = lazy(() => import('./pages/Notifications'));
const StudyByInterest = lazy(() => import('./pages/StudyByInterest'));
const WritingPractice = lazy(() => import('./pages/WritingPractice'));
const LearnRadicals = lazy(() => import('./pages/LearnRadicals'));
const LearnKana = lazy(() => import('./pages/LearnKana'));
const LearnSounds = lazy(() => import('./pages/LearnSounds'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const About = lazy(() => import('./pages/About'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const Support = lazy(() => import('./pages/Support'));

import './App.css';

function App() {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          {/* Auth screens — no bottom nav */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Main app with bottom nav */}
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="learn/*" element={<Learn />} />
            <Route path="library" element={<Library />} />
            <Route path="flashcards" element={<Flashcards />} />
            <Route path="flashcards/level/:levelId" element={<PhrasesLevel />} />
            <Route path="flashcards/session" element={<PhrasesSwipeSession />} />
            <Route path="saved" element={<SavedWords />} />
            <Route path="saved/session" element={<SwipeSession key="saved-session" isSaved />} />
            <Route path="dictionary" element={<Dictionary />} />
            <Route path="interest" element={<StudyByInterest />} />
            <Route path="writing" element={<WritingPractice />} />
            <Route path="radicals" element={<LearnRadicals />} />
            <Route path="kana" element={<LearnKana />} />
            <Route path="sounds" element={<LearnSounds />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="profile" element={<Profile />} />
            <Route path="profile/edit" element={<ProtectedRoute><EditProfile /></ProtectedRoute>} />
            <Route path="premium" element={<Premium />} />
            <Route path="settings" element={<SettingsSubpage />} />
            <Route path="about" element={<About />} />
            <Route path="privacy" element={<PrivacyPolicy />} />
            <Route path="terms" element={<TermsOfService />} />
            <Route path="support" element={<Support />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );
}

export default App;
