# Public App Information & Legal/Support Content Integration

This document specifies the routes, metadata management, technical privacy posture, and required owner-supplied items for Swipe 2 Study's public-facing pages.

---

## 1. Public Routes Architecture

The following public routes are available to all learners (guests and authenticated users) and support direct browser URL entry:

| Route | Component | Purpose | Access |
|---|---|---|---|
| `/about` | `About.jsx` | Public application description, HSK 1 / JLPT N5 feature explanation, and primary entry navigation. | Public (Guest & Authenticated) |
| `/privacy` | `PrivacyPolicy.jsx` | Concise unavailable state indicating policy publication is pending, with helpful navigation. | Public (Guest & Authenticated) |
| `/terms` | `TermsOfService.jsx` | Concise unavailable state indicating terms publication is pending, with helpful navigation. | Public (Guest & Authenticated) |
| `/support` | `Support.jsx` | Concise unavailable state with self-service audio and language guidance, with helpful navigation. | Public (Guest & Authenticated) |

### Learner Content Boundaries
- Learner-facing pages present concise, accessible unavailable states without exposing internal developer/owner requirement checklists.
- All owner requirements and publication prerequisites are maintained exclusively in this documentation file.
- Learner pages avoid unapproved "as-is" clauses, commercial release promises, unverified curriculum assertions, or inaccurate claims regarding client-side data handling.

### Navigation Integration Points
- **Settings Subpage (`/settings`)**: "About" group features interactive rows navigating to `/about`, `/support`, `/privacy`, and `/terms`.
- **Profile (`/profile`)**: "Account & support" section provides direct links to `/support` and `/about`.
- **Authentication Pages (`/login`, `/signup`)**: Accessible footer navigation links directly to `/about`, `/privacy`, `/terms`, and `/support` without placing artificial acceptance checkboxes on unavailable terms.

---

## 2. Metadata & Search Engine Crawler Limitations

### Dynamic Metadata Management (`src/lib/metadata.js`)
The `usePageMetadata` hook and `setPageMetadata` utility manage:
- `document.title`: Formatted as `[Page Title] · Swipe 2 Study`.
- `<meta name="description">`: Page-specific summary.
- `<meta property="og:title">` and `<meta property="og:description">`: Social sharing summaries.
- Brand icon: Uses existing `/favicon.svg`.

### Origin Parsing & Validation (`getDeploymentOrigin`, `parseCleanOrigin`)
- Candidate URLs (from `VITE_PUBLIC_URL` or `window.location`) are validated strictly:
  - **Valid Schemes**: Web schemes only (`http:`, `https:`).
  - **Embedded Credentials**: Any URL containing embedded usernames or passwords (`user:pass@host`) is rejected.
  - **Local & Development Origins**: Hostnames such as `localhost`, `*.localhost`, `127.0.0.1`, `127.*`, `0.0.0.0`, `[::1]`, `*.local`, `*.test`, `*.example`, and `*.invalid` are rejected.
  - **Origin Derivation**: Clean origin is derived via `url.origin`, stripping any pathname, query parameters, or hash fragments.

### Exact Metadata Lifecycle Restoration
- On navigation / component unmount, `setPageMetadata` cleanup executes:
  - Pre-existing values for `document.title`, `meta[name="description"]`, `meta[property="og:title"]`, `meta[property="og:description"]`, `link[rel="canonical"]`, and `meta[property="og:url"]` are restored accurately to their prior contents.
  - If a metadata element was introduced by the page (did not exist previously), it is removed on cleanup.
  - Pre-existing DOM elements are never removed by cleanup; only their prior values are restored.
  - When the origin is unknown, local, or invalid, no canonical link or `og:url` is created, and no production URL is guessed or invented.

### Single-Page Application (SPA) Crawler Limitations
- Modern search engine crawlers that execute JavaScript (such as Googlebot) read the dynamically updated DOM, `document.title`, and meta tags.
- Traditional link-preview scrapers (e.g. Slack, Discord, Twitter/X, Facebook) do not execute client-side JavaScript and read only the initial static HTML file.
- To achieve social link card previews across all platforms, deployment infrastructure requires either edge HTML pre-rendering or server-side rendering (SSR).

---

## 3. Owner-Supplied Content Checklist

The application frontend provides accessible, clearly labeled "Pending Publication / Configuration" states. The application owner must supply the following exact items before public commercial launch:

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
