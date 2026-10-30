# Public App Information & Legal/Support Content Integration

This document specifies the routes, metadata management, technical privacy posture, and required owner-supplied items for Swipe 2 Study's public-facing pages.

---

## 1. Public Routes Architecture

The following public routes are available to all learners (guests and authenticated users) and support direct browser URL entry:

| Route | Component | Purpose | Access |
|---|---|---|---|
| `/about` | `About.jsx` | Public application description, HSK 1 / JLPT N5 feature explanation, and primary entry navigation. | Public (Guest & Authenticated) |
| `/privacy` | `PrivacyPolicy.jsx` | Technical data-handling posture, privacy boundaries, and pending owner policy checklist. | Public (Guest & Authenticated) |
| `/terms` | `TermsOfService.jsx` | Service boundaries, current evaluation scope, and pending owner terms checklist. | Public (Guest & Authenticated) |
| `/support` | `Support.jsx` | Self-service troubleshooting FAQ, audio/reset help, and pending owner support setup checklist. | Public (Guest & Authenticated) |

### Navigation Integration Points
- **Settings Subpage (`/settings`)**: "About" group features interactive rows navigating to `/about`, `/support`, `/privacy`, and `/terms`.
- **Profile (`/profile`)**: "Account & support" section provides direct links to `/support` and `/about`.
- **Authentication Pages (`/login`, `/signup`)**: Accessible footer navigation links directly to `/about`, `/privacy`, `/terms`, and `/support` without placing artificial acceptance checkboxes on unavailable terms.

---

## 2. Metadata & Search Engine Crawler Limitations

### Dynamic Metadata Management (`src/lib/metadata.js`)
The `usePageMetadata` hook updates:
- `document.title`: Formatted as `[Page Title] · Swipe 2 Study`.
- `<meta name="description">`: Page-specific summary.
- `<meta property="og:title">` and `<meta property="og:description">`: Social sharing summaries.
- Brand icon: Uses existing `/favicon.svg`.

### Canonical & Share URLs Policy
- Canonical (`<link rel="canonical">`) and OpenGraph (`<meta property="og:url">`) URLs are generated **only when the deployment origin is explicitly known and verified**:
  1. Via `VITE_PUBLIC_URL` environment configuration, or
  2. Via non-localhost/non-127.0.0.1 browser window origin.
- **Strict Guard**: Localhost and guessed staging/production domains are **never** hard-coded into metadata. If the origin is unverified or local, canonical tags are omitted to prevent emitting erroneous search engine directives.

### Single-Page Application (SPA) Crawler Limitations
- Modern search engine crawlers that execute JavaScript (such as Googlebot) will read the dynamically rendered DOM, `document.title`, and meta tags.
- However, traditional metadata scrapers (such as standard social platform link preview bots like Slack, Discord, Twitter/X, or Facebook) do not execute client-side JavaScript. They will only parse static tags present in the raw initial `index.html`.
- To achieve 100% rich social card previews across all platforms, the deployment infrastructure must implement either:
  1. Static edge pre-rendering / server-side rendering (SSR), or
  2. A lightweight reverse-proxy crawler pre-render cache (e.g. Prerender.io, Cloudflare Worker HTML rewriting).

---

## 3. Owner-Supplied Content Checklist

The application frontend provides accessible, clearly labeled "Pending Owner Publication/Configuration" states. Placeholders are never presented as finalized legal agreements. The application owner must supply the following exact items before public commercial launch:

### Privacy Policy Disclosures
- [ ] **Corporate Entity**: Legal business name, company registration number, and registered physical address.
- [ ] **Privacy Contact**: Designated Data Protection Officer (DPO) or privacy contact email address (e.g., `privacy@yourdomain.com`).
- [ ] **Statutory Privacy Notices**: Jurisdiction-specific consumer rights procedures (GDPR data access/rectification/erasure requests, CCPA "Do Not Sell/Share My Personal Information" notices).
- [ ] **Data Retention Schedules**: Formal retention windows for user accounts, backups, and operational server logs.
- [ ] **Subprocessor Registry**: Public disclosure of third-party cloud hosting, infrastructure, and authentication providers (e.g., Supabase, cloud hosting).

### Terms of Service Specifications
- [ ] **Governing Law**: Jurisdiction and governing law clauses (e.g., laws of Singapore, State of California, etc.).
- [ ] **Dispute Resolution**: Formal dispute procedures, arbitration terms, and class action waiver clauses if applicable.
- [ ] **Curriculum & Trademark IP**: Licensing agreements and copyright notices for HSK and JLPT vocabulary and learning materials.
- [ ] **Age & Eligibility**: Minimum user age requirements and parental consent policies for minor learners.
- [ ] **Acceptable Use & Termination**: Explicit user prohibitions against reverse engineering or content extraction, and owner rights regarding account suspension.

### Support & Help Desk Setup
- [ ] **Support Email**: Designated customer support inbox (e.g., `support@yourdomain.com`).
- [ ] **Help Desk / Knowledge Base**: URL to an external ticketing portal, status page, or public documentation site.
- [ ] **Service Level Agreement (SLA)**: Operating hours, target response times, and supported support languages.
- [ ] **Feedback & Errata Channel**: Designated reporting channel for vocabulary corrections or pronunciation issues.

