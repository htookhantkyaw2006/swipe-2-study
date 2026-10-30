import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, BookOpen } from 'lucide-react';
import { usePageMetadata } from '../lib/metadata.js';
import './PublicContent.css';

export default function PrivacyPolicy() {
  usePageMetadata({
    title: 'Privacy Policy',
    description: 'Privacy policy status for the Swipe 2 Study application.',
    canonicalPath: '/privacy',
  });

  return (
    <div className="public-page">
      <div className="public-hero">
        <span className="public-badge public-badge--pending">
          <ShieldAlert size={14} aria-hidden="true" />
          Pending Owner Publication
        </span>
        <h1>Privacy Policy</h1>
        <p>
          An official privacy policy has not yet been published by the application owner.
        </p>
      </div>

      <div className="public-card">
        <div className="public-callout">
          <h3>Policy Status</h3>
          <p>
            No approved privacy policy or designated privacy contact is currently available for this deployment.
          </p>
        </div>

        <div className="public-actions">
          <Link to="/about" className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={16} aria-hidden="true" /> Back to About
          </Link>
          <Link to="/learn" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <BookOpen size={16} aria-hidden="true" /> Start Learning
          </Link>
          <Link to="/" className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
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
