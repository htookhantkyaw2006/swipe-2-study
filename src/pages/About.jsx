import React from 'react';
import { Link } from 'react-router-dom';
import { Layers, BookOpen, Volume2, Bookmark, ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../lib/useAuth.js';
import { usePageMetadata } from '../lib/metadata.js';
import './PublicContent.css';

export default function About() {
  const { user } = useAuth();

  usePageMetadata({
    title: 'About',
    description: 'Swipe 2 Study is an interactive bilingual flashcard application for HSK 1 Chinese and JLPT N5 Japanese language learners.',
    canonicalPath: '/about',
  });

  return (
    <div className="public-page">
      <div className="public-hero">
        <span className="public-badge public-badge--active">
          <CheckCircle2 size={14} aria-hidden="true" />
          Active Release · HSK 1 & JLPT N5
        </span>
        <h1>About Swipe 2 Study</h1>
        <p>
          A focused, bilingual flashcard companion designed to build vocabulary and character
          recognition through natural swipe gestures and spoken pronunciation.
        </p>

        <div className="public-actions">
          <Link to="/learn" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Start Learning <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link to="/dictionary" className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            Browse Dictionary
          </Link>
          {!user && (
            <Link to="/login?returnTo=%2Fabout" className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
              Sign In / Register
            </Link>
          )}
        </div>
      </div>

      <div className="public-card">
        <section className="public-section" aria-labelledby="core-experience-title">
          <h2 id="core-experience-title">
            <Layers size={22} color="var(--color-primary-blue)" aria-hidden="true" />
            The Learning Experience
          </h2>
          <p>
            Swipe 2 Study turns daily vocabulary acquisition into a fluid, tactile habit. Flashcards are
            designed with clear typography and high contrast for rapid review:
          </p>
          <ul>
            <li><strong>Swipe Right:</strong> Mark a card learned and advance your curriculum completion.</li>
            <li><strong>Swipe Left:</strong> Send a card to your personal review queue for spaced reinforcement.</li>
            <li><strong>Tap to Flip:</strong> Reveal bilingual definitions, example sentences, and grammatical usage notes.</li>
          </ul>
        </section>

        <section className="public-section" aria-labelledby="curricula-title">
          <h2 id="curricula-title">
            <BookOpen size={22} color="var(--color-primary-blue)" aria-hidden="true" />
            Curricula in this Release
          </h2>
          <p>
            This release strictly covers official beginner standards with verified vocabulary and examples:
          </p>
          <ul>
            <li><strong>Chinese HSK 1:</strong> Essential beginner Mandarin vocabulary with standard Pinyin pronunciation, English and Burmese meanings, and stroke-level radical breakdowns.</li>
            <li><strong>Japanese JLPT N5:</strong> Fundamental Japanese vocabulary featuring Kana (Hiragana and Katakana) readings, bilingual definitions, and foundational Kanji radicals.</li>
          </ul>
        </section>

        <section className="public-section" aria-labelledby="audio-title">
          <h2 id="audio-title">
            <Volume2 size={22} color="var(--color-primary-blue)" aria-hidden="true" />
            Pronunciation & Audio
          </h2>
          <p>
            Train listening and speaking with audio pronunciation support:
          </p>
          <ul>
            <li>Listen to native speech audio references where available.</li>
            <li>Built-in speech synthesis fallback keeps pronunciation practice accessible across supported devices.</li>
            <li>Configurable auto-play and speech-rate controls in Settings.</li>
          </ul>
        </section>

        <section className="public-section" aria-labelledby="study-tools-title">
          <h2 id="study-tools-title">
            <Bookmark size={22} color="var(--color-primary-blue)" aria-hidden="true" />
            Personal Vocabulary Collection
          </h2>
          <p>
            Beyond the core curriculum, learners can explore and collect words:
          </p>
          <ul>
            <li><strong>Searchable Dictionary:</strong> Search words by character, reading, or translation definition.</li>
            <li><strong>Saved Words:</strong> Bookmark words into your personal collection for custom study sessions anytime.</li>
            <li><strong>Practice Drills:</strong> Sharpen your skills with radical, Kana, and character stroke practice drills.</li>
          </ul>
        </section>

        <section className="public-section" aria-labelledby="privacy-posture-title">
          <h2 id="privacy-posture-title">
            <ShieldCheck size={22} color="var(--color-primary-blue)" aria-hidden="true" />
            Privacy & Local-First Storage
          </h2>
          <p>
            Learn at your own pace without unnecessary data collection:
          </p>
          <ul>
            <li><strong>Guest Mode:</strong> Study immediately without an account. All progress is isolated to your local device storage.</li>
            <li><strong>Optional Accounts:</strong> Secure your learning identity with email and password to prepare your account for future features.</li>
            <li><strong>Zero Tracking:</strong> No third-party advertising cookies, fingerprinting, or invasive analytics tracking.</li>
          </ul>
        </section>
      </div>

      <nav className="public-footer-links" aria-label="Public Information Links">
        <Link to="/about">About</Link>
        <span>·</span>
        <Link to="/privacy">Privacy Policy</Link>
        <span>·</span>
        <Link to="/terms">Terms of Service</Link>
        <span>·</span>
        <Link to="/support">Support & Help</Link>
      </nav>
    </div>
  );
}

