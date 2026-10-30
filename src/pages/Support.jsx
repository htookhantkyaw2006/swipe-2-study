import React from 'react';
import { Link } from 'react-router-dom';
import { HelpCircle, Info, FileQuestion, ArrowLeft, Settings, Volume2, Database } from 'lucide-react';
import { usePageMetadata } from '../lib/metadata.js';
import './PublicContent.css';

export default function Support() {
  usePageMetadata({
    title: 'Support & Help',
    description: 'Support, self-service help, and contact status for the Swipe 2 Study application.',
    canonicalPath: '/support',
  });

  return (
    <div className="public-page">
      <div className="public-hero">
        <span className="public-badge public-badge--pending">
          <HelpCircle size={14} aria-hidden="true" />
          Pending Owner Configuration
        </span>
        <h1>Support & Help</h1>
        <p>
          Official customer support desk channels and contact email addresses have not yet been
          designated by the application owner.
        </p>
      </div>

      <div className="public-card">
        <div className="public-callout">
          <h3>
            <Info size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} aria-hidden="true" />
            Support Routing Notice
          </h3>
          <p>
            For assistance during staging or evaluation, please contact your designated deployment
            administrator or organization lead directly. Public support ticketing will be
            activated upon commercial launch.
          </p>
        </div>

        <section className="public-section" aria-labelledby="faq-title">
          <h2 id="faq-title">Frequently Asked Questions & Self-Service</h2>
          <p>
            Common questions regarding app operation and troubleshooting:
          </p>
          <ul>
            <li>
              <strong>
                <Volume2 size={16} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} aria-hidden="true" />
                Pronunciation audio is silent:
              </strong>{' '}
              Swipe 2 Study uses native speech synthesis and spoken audio files. Verify your device volume
              is turned on, and ensure speech synthesis is enabled in your browser. You can test speech
              and adjust speech speed in{' '}
              <Link to="/settings" style={{ color: 'var(--color-primary-blue)', fontWeight: 600 }}>
                Settings
              </Link>.
            </li>
            <li style={{ marginTop: 12 }}>
              <strong>
                <Database size={16} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} aria-hidden="true" />
                How do I save words or reset my data?
              </strong>{' '}
              Words can be saved from the Dictionary (`/dictionary`) to your personal collection.
              To start fresh, you can safely wipe your local learning history anytime via{' '}
              <Link to="/settings" style={{ color: 'var(--color-primary-blue)', fontWeight: 600 }}>
                Settings &gt; Reset Learning Data
              </Link>.
            </li>
            <li style={{ marginTop: 12 }}>
              <strong>
                <Settings size={16} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} aria-hidden="true" />
                Switching between Chinese and Japanese:
              </strong>{' '}
              Select your desired curriculum from the language dropdown in your Profile (`/profile`)
              or through the Language Switcher in Settings.
            </li>
          </ul>
        </section>

        <section className="public-section" aria-labelledby="owner-requirements-title">
          <h2 id="owner-requirements-title">
            <FileQuestion size={22} color="var(--color-primary-blue)" aria-hidden="true" />
            Owner Configuration Checklist
          </h2>
          <p>
            The service owner must provide the following details to activate official support:
          </p>
          <div className="public-checklist">
            <h3>Required Owner Support Setup</h3>
            <ul>
              <li>
                <span aria-hidden="true">☐</span>
                <span><strong>Primary Support Email:</strong> Designated customer assistance email address (e.g. `support@yourdomain.com`).</span>
              </li>
              <li>
                <span aria-hidden="true">☐</span>
                <span><strong>Help Desk / Ticketing Portal:</strong> URL to external help desk, FAQ knowledge base, or issue tracker.</span>
              </li>
              <li>
                <span aria-hidden="true">☐</span>
                <span><strong>Service Level Expectations:</strong> Stated operating hours, response time target, and supported communication languages.</span>
              </li>
              <li>
                <span aria-hidden="true">☐</span>
                <span><strong>Bug & Feedback Channel:</strong> Dedicated mechanism for receiving learner feedback and reporting errata in vocabulary cards.</span>
              </li>
            </ul>
          </div>
        </section>

        <div className="public-actions">
          <Link to="/settings" className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Settings size={16} aria-hidden="true" /> Open Settings
          </Link>
          <Link to="/about" className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={16} aria-hidden="true" /> Back to About
          </Link>
          <Link to="/" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            Go to Home
          </Link>
        </div>
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

