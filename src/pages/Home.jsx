import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Bookmark, BookOpen, Layers, Library, MessageCircle, RotateCw, Search } from 'lucide-react';
import LevelCarousel from '../components/ui/LevelCarousel';
import LanguageSwitcher from '../components/ui/LanguageSwitcher';
import Avatar from '../components/ui/Avatar';
import LanguageFlag from '../components/ui/LanguageFlag';
import { useCourse } from '../lib/language';
import { useAuth } from '../lib/useAuth.js';
import { useProfile, displayName } from '../lib/profile.js';
import { db } from '../lib/db';

export default function Home() {
  const { user, isGuest, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const course = useCourse();
  const [counts, setCounts] = useState({ review: null, saved: null, error: false });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = authLoading ? 'Loading…' : user
    ? displayName(profileLoading ? null : profile, user)
    : 'Guest Learner';

  useEffect(() => {
    try {
      setCounts({ review: db.get('review_cards').length, saved: db.get('saved_words').length, error: false });
    } catch {
      setCounts({ review: null, saved: null, error: true });
    }
  }, []);

  return (
    <div className="home-page">
      <header className="home-header">
        <Link to="/profile" className="home-identity" aria-label="Go to profile">
          <Avatar size={44} alt="Your profile" />
          <div className="home-greeting"><p>{user ? greeting : 'Welcome'}</p><div className="home-name"><h1>{name}</h1>{isGuest && <span className="guest-badge">Guest</span>}</div></div>
        </Link>
        <LanguageSwitcher />
      </header>
      <div className="home-heading">
        <div><p className="section-eyebrow">YOUR LEARNING SPACE</p><h2>A little practice, every day.</h2><p>Choose a level. Find a new word. Keep going.</p></div>
        <span className="home-course-label"><LanguageFlag id={course.id} size={22} />{course.name} · {course.levelSystem}</span>
      </div>
      <div className="home-dashboard">
        <div className="home-primary">
          <section aria-labelledby="flashcards-heading">
            <div className="section-heading"><h2 id="flashcards-heading">Your flashcards</h2><Link to="/learn">Browse levels <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
            <LevelCarousel />
          </section>
          <section aria-labelledby="explore-heading">
            <div className="section-heading"><h2 id="explore-heading">Explore & practice</h2></div>
            <div className="home-shortcuts">
              <Link to="/flashcards" className="home-shortcut"><span className="shortcut-icon"><MessageCircle size={23} aria-hidden="true" /></span><span><strong>Phrases</strong><span>Everyday words in context</span></span><ArrowUpRight size={18} aria-hidden="true" /></Link>
              <Link to="/dictionary" className="home-shortcut"><span className="shortcut-icon"><Search size={23} aria-hidden="true" /></span><span><strong>Dictionary</strong><span>Look up a word</span></span><ArrowUpRight size={18} aria-hidden="true" /></Link>
              <Link to="/library" className="home-shortcut"><span className="shortcut-icon"><Library size={23} aria-hidden="true" /></span><span><strong>Library</strong><span>Explore your learning tools</span></span><ArrowUpRight size={18} aria-hidden="true" /></Link>
            </div>
          </section>
        </div>
        <aside className="home-aside" aria-label="Practice and saved words">
          <section className="practice-panel" aria-labelledby="practice-heading">
            <div className="practice-panel-heading"><span className="section-eyebrow">MAKE IT STICK</span><Layers size={19} aria-hidden="true" /></div>
            <h2 id="practice-heading">A word worth revisiting.</h2><p>Your review queue and saved words, all in one place.</p>
            <div className="practice-links">
              <Link to="/learn/review" className="practice-link"><span className="practice-icon"><RotateCw size={20} aria-hidden="true" /></span><span><strong>Review queue</strong><span>Go over your cards</span></span><span className="practice-count">{counts.review ?? '—'}</span><ArrowRight size={16} aria-hidden="true" /></Link>
              <Link to="/saved" className="practice-link"><span className="practice-icon"><Bookmark size={20} aria-hidden="true" /></span><span><strong>Saved words</strong><span>Keep them close</span></span><span className="practice-count">{counts.saved ?? '—'}</span><ArrowRight size={16} aria-hidden="true" /></Link>
            </div>
            <p className="device-note">{counts.error ? 'Saved data could not be read on this device.' : 'Learning records on this device.'}</p>
          </section>
          <section className="study-note" aria-labelledby="study-note-heading">
            <span className="study-note-icon" aria-hidden="true"><BookOpen size={22} /></span><p className="section-eyebrow">A SMALL STUDY TIP</p>
            <h2 id="study-note-heading">Take a moment.<br />Say it out loud.</h2><p>Read the word, listen to its pronunciation, then try saying it yourself.</p>
            <Link to="/learn">Find your next word <ArrowRight size={17} aria-hidden="true" /></Link>
          </section>
        </aside>
      </div>
      <footer className="home-footer"><Layers size={15} aria-hidden="true" /><span>Swipe 2 Study</span><span>One word at a time.</span></footer>
    </div>
  );
}
