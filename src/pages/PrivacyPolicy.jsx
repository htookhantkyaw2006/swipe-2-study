import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, Info, FileQuestion, ArrowLeft } from 'lucide-react';
import { usePageMetadata } from '../lib/metadata.js';
import './PublicContent.css';

export default function PrivacyPolicy() {
  usePageMetadata({
    title: 'Privacy Policy',
    description: 'Privacy practices and data handling status for the Swipe 2 Study application.',
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
          Formal legal policy documentation has not yet been published by the application owner.
          Below is a description of the application's actual data-handling architecture and the
          disclosures required for commercial deployment.
        </p>
      </div>

      <div className="public-card">
        <div className="public-callout">
          <h3>
            <Info size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} aria-hidden="true" />
            Evaluation & Development Status Notice
          </h3>
          <p>
            This application is currently provided for evaluation and language study practice.
            A formalized legal privacy statement specifying the registered corporate entity,
            governing jurisdiction, and statutory privacy rights will be supplied by the
            application owner prior to public commercial operation.
          </p>
        </div>

        <section className="public-section" aria-labelledby="data-handling-title">
          <h2 id="data-handling-title">Current Technical Data-Handling Posture</h2>
          <p>
            In this build, the application enforces the following technical privacy boundaries:
          </p>
          <ul>
            <li>
              <strong>Guest Learners:</strong> All flashcard progress, vocabulary review records,
              saved words, search queries, and local user preferences are stored strictly inside
              your browser's local storage (`localStorage`). No guest learning activity is
              transmitted to external servers.
            </li>
            <li>
              <strong>Authenticated Accounts:</strong> If you choose to register an account, your
              email address and display name are authenticated through Supabase Authentication.
              Passwords are salted and hashed by the authentication backend and are never accessible
              to client-side scripts.
            </li>
            <li>
              <strong>No Tracking or Advertising:</strong> There is no third-party ad network integration,
              cross-site tracking cookie, device fingerprinting, or session replay tooling in this application.
            </li>
            <li>
              <strong>Observability & Telemetry:</strong> Error monitoring and analytics telemetry are
              disabled by default. If enabled by an operator, error reports automatically strip passwords,
              authorization tokens, emails, and sensitive URL query parameters; analytics collection is
              strictly limited to coarse, aggregated event counts without personal identifiers.
            </li>
          </ul>
        </section>

        <section className="public-section" aria-labelledby="owner-requirements-title">
          <h2 id="owner-requirements-title">
            <FileQuestion size={22} color="var(--color-primary-blue)" aria-hidden="true" />
            Owner Publication Checklist
          </h2>
          <p>
            The service owner must provide the following approved content to finalize this document:
          </p>
          <div className="public-checklist">
            <h3>Required Owner Disclosures</h3>
            <ul>
              <li>
                <span aria-hidden="true">☐</span>
                <span><strong>Legal Entity & Address:</strong> Official registered company name, corporate address, and contact jurisdiction.</span>
              </li>
              <li>
                <span aria-hidden="true">☐</span>
                <span><strong>Data Controller & Contact:</strong> Designated privacy contact or Data Protection Officer (DPO) email address.</span>
              </li>
              <li>
                <span aria-hidden="true">☐</span>
                <span><strong>Data Retention Schedules:</strong> Explicit retention periods for account data, backup snapshots, and server logs.</span>
              </li>
              <li>
                <span aria-hidden="true">☐</span>
                <span><strong>User Rights Procedures:</strong> Formal mechanisms for users to request data access, export, rectification, and complete erasure (e.g. GDPR, CCPA).</span>
              </li>
              <li>
                <span aria-hidden="true">☐</span>
                <span><strong>Subprocessor Disclosures:</strong> Approved list of third-party cloud hosting, database, and infrastructure providers.</span>
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

