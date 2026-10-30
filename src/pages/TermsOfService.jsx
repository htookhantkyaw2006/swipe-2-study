import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, Info, FileQuestion, ArrowLeft } from 'lucide-react';
import { usePageMetadata } from '../lib/metadata.js';
import './PublicContent.css';

export default function TermsOfService() {
  usePageMetadata({
    title: 'Terms of Service',
    description: 'Terms of service status and service scope for the Swipe 2 Study application.',
    canonicalPath: '/terms',
  });

  return (
    <div className="public-page">
      <div className="public-hero">
        <span className="public-badge public-badge--pending">
          <ShieldAlert size={14} aria-hidden="true" />
          Pending Owner Publication
        </span>
        <h1>Terms of Service</h1>
        <p>
          Official terms of service, acceptable use guidelines, and commercial licensing
          policies have not yet been published by the application owner.
        </p>
      </div>

      <div className="public-card">
        <div className="public-callout">
          <h3>
            <Info size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} aria-hidden="true" />
            Service Scope Notice
          </h3>
          <p>
            The software is currently made available for evaluation and study practice of
            HSK 1 (Chinese) and JLPT N5 (Japanese) vocabulary curricula. Binding legal
            agreements between the operating entity and end users will be established upon
            formal policy publication.
          </p>
        </div>

        <section className="public-section" aria-labelledby="current-scope-title">
          <h2 id="current-scope-title">Current Operating Boundaries</h2>
          <p>
            During this build phase, users should note the following operational facts:
          </p>
          <ul>
            <li>
              <strong>Content & Scope:</strong> This release incorporates verified starter
              vocabulary for HSK 1 and JLPT N5. Advanced levels and other languages are disabled
              or labeled as coming soon.
            </li>
            <li>
              <strong>No Active Payments or Subscriptions:</strong> Premium purchase flows, payment
              gateways, and billing recurring charges are not active in this release. No monetary
              transactions are processed.
            </li>
            <li>
              <strong>Guest Data Retention:</strong> Guest learning data lives exclusively in your
              browser cache. Clearing browser history, private browsing, or storage wipe will remove
              guest progress unless backed up or synced to an account.
            </li>
            <li>
              <strong>Software Provisioning:</strong> The application is provided on an “as-is” basis
              for evaluation and testing without warranty of uninterrupted availability.
            </li>
          </ul>
        </section>

        <section className="public-section" aria-labelledby="owner-requirements-title">
          <h2 id="owner-requirements-title">
            <FileQuestion size={22} color="var(--color-primary-blue)" aria-hidden="true" />
            Owner Publication Checklist
          </h2>
          <p>
            The service owner must provide the following approved content to finalize these terms:
          </p>
          <div className="public-checklist">
            <h3>Required Owner Terms Content</h3>
            <ul>
              <li>
                <span aria-hidden="true">☐</span>
                <span><strong>Governing Law & Dispute Resolution:</strong> Applicable state/country jurisdiction and arbitration clauses.</span>
              </li>
              <li>
                <span aria-hidden="true">☐</span>
                <span><strong>Age Restrictions:</strong> Minimum age requirements and parental consent stipulations for minors.</span>
              </li>
              <li>
                <span aria-hidden="true">☐</span>
                <span><strong>Intellectual Property:</strong> Trademark, logo ownership, and curriculum content licensing terms.</span>
              </li>
              <li>
                <span aria-hidden="true">☐</span>
                <span><strong>Acceptable Use & Abuse:</strong> Prohibitions against scraping, reverse engineering, or unauthorized automated access.</span>
              </li>
              <li>
                <span aria-hidden="true">☐</span>
                <span><strong>Account Termination:</strong> Terms governing account suspension, voluntary deletion, and data forfeiture.</span>
              </li>
            </ul>
          </div>
        </section>

        <div className="public-actions">
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

