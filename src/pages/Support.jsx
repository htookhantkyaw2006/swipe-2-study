import React from 'react';
import { Link } from 'react-router-dom';
import { HelpCircle, ArrowLeft, Settings, Volume2, BookOpen } from 'lucide-react';
import { usePageMetadata } from '../lib/metadata.js';
import './PublicContent.css';

export default function Support() {
  usePageMetadata({
    title: 'Support & Help',
    description: 'Support and assistance status for the Swipe 2 Study application.',
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
          Official customer support channels and contact addresses have not yet been designated by the application owner.
        </p>
      </div>

      <div className="public-card">
        <div className="public-callout">
          <h3>Support Status</h3>
          <p>
            Direct contact channels are currently unavailable. For self-service guidance and audio troubleshooting, refer to the resources below.
          </p>
        </div>

        <section className="public-section" aria-labelledby="self-service-title">
          <h2 id="self-service-title">Self-Service Resources</h2>
          <ul>
            <li>
              <strong>
                <Volume2 size={16} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} aria-hidden="true" />
                Pronunciation audio:
              </strong>{' '}
              If audio is silent, check your device volume and verify that speech synthesis is enabled in your browser. Speech speed and audio options can be adjusted in{' '}
              <Link to="/settings" style={{ color: 'var(--color-primary-blue)', fontWeight: 600 }}>
                Settings
              </Link>.
            </li>
            <li style={{ marginTop: 12 }}>
              <strong>
                <Settings size={16} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} aria-hidden="true" />
                Language & preferences:
              </strong>{' '}
              Switch between Chinese (HSK 1) and Japanese (JLPT N5) via the language selector in Settings or your Profile.
            </li>
          </ul>
        </section>

        <div className="public-actions">
          <Link to="/settings" className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Settings size={16} aria-hidden="true" /> Open Settings
          </Link>
          <Link to="/learn" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <BookOpen size={16} aria-hidden="true" /> Start Learning
          </Link>
          <Link to="/about" className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={16} aria-hidden="true" /> Back to About
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
