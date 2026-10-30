# Observability Readiness: Error Monitoring & Analytics

This document specifies the architecture, privacy boundaries, configuration, and owner activation checklist for error monitoring and analytics within Swipe-2-Study.

---

## 1. Architecture Overview

### Centralized Error Monitoring (`src/lib/errorReporting.js`)
- **Frontend Unhandled Errors**: Intercepts unhandled window errors (`window.onerror`) and unhandled promise rejections (`window.onunhandledrejection`).
- **Route Error Boundaries**: Integrated into React route error boundaries (`src/components/RouteErrorBoundary.js`).
- **Edge Function / Server Errors**: Integrated via a reporting hook into `createDeletionHttpHandler` (`src/server/accountDeletion.js`).
- **Strict Privacy Scrubbing**: Automatically redacts email addresses, authorization headers, passwords, bearer tokens, JWTs, and scrubs all query parameters and hash fragments from URLs (especially authentication links and password recovery tokens).
- **Deduplication**: Uses memory-safe object tracking (`WeakSet`) and rolling signatures (5-second window) to ensure overlapping boundary catches and global listeners do not emit duplicate reports.
- **Fail-Safe & Anti-Recursion**: An internal reporting guard (`isReporting`) and isolated `try / catch` transport ensure that error reporting failures never break user actions or cause recursive reporting loops.

### Privacy-Conscious Analytics (`src/lib/analytics.js`)
- **Strict Event Allowlist**: Only 7 explicit business events are recognized:
  1. `auth:signup_success` (triggered when account registration succeeds)
  2. `auth:signin_success` (triggered when email/password or OAuth callback succeeds)
  3. `study:session_start` (triggered when a flashcard study/review session begins)
  4. `study:session_complete` (triggered when all cards in a session have been swiped)
  5. `study:word_saved` (triggered when a user bookmarks a word in the dictionary)
  6. `import:guest_completed` (triggered when a guest learning import successfully merges or commits)
  7. `learning:reset_confirmed` (triggered when user/guest confirms and completes learning data reset)
- **Coarse Metadata Only**: Permitted properties are limited to: `courseId`, `levelId`, `mode`, `cardCount`, `recordCount`, `choice`, `scope`.
- **Payload Privacy Boundaries**: No user IDs, account emails, free-text inputs, character strings, device fingerprints, session recordings, or persistent tracking identifiers in event payloads. (Note: Network-layer IP transmission is inherent to underlying HTTP socket connections and cannot be guaranteed anonymous without proxy/Tor routing).
- **Deduplication**: Deduplication cache protects against duplicate events caused by React 19 `StrictMode` or rapid component remounts.
- **Disabled by Default**: Requires explicit environment configuration to activate (`VITE_ANALYTICS_ENABLED=true` and non-empty `VITE_ANALYTICS_URL`).

---

## 2. Environment Configuration

| Variable | Type | Default | Description |
|---|---|---|---|
| `VITE_ERROR_REPORTING_ENABLED` | String (`'true'` \| `'false'`) | `false` | Master switch for frontend error reporting. |
| `VITE_ERROR_REPORTING_URL` | String (URL) | `""` | Destination endpoint for sanitized error reports via HTTP POST. |
| `VITE_ANALYTICS_ENABLED` | String (`'true'` \| `'false'`) | `false` | Master switch for analytics tracking. |
| `VITE_ANALYTICS_URL` | String (URL) | `""` | Destination endpoint for coarse analytics events via HTTP POST. |

When any variable is missing or set to `false`, monitoring and analytics are inert: zero network requests are dispatched, and core application workflows remain unaffected.

---

## 3. Owner Activation Checklist

Before activating error monitoring or analytics in production or staging environments, complete the following verification steps:

- [ ] **Provider Selection & Access**
  - Choose an ingest provider or self-hosted endpoint compatible with standard HTTP JSON POST payloads (e.g., Sentry generic HTTP endpoint, PostHog, or custom collector).
  - Verify that no service-role secrets, private API keys, or database administrative credentials are placed in client-accessible environment variables.
- [ ] **Approved Event Collection Verification**
  - Verify that only the 7 allowlisted events are consumed.
  - Confirm that incoming event payloads contain only coarse metadata keys (`courseId`, `levelId`, `mode`, `cardCount`, `recordCount`, `choice`, `scope`).
  - Verify that no user emails, passwords, auth tokens, or search queries appear in incoming payloads.
- [ ] **Data Retention & Governance**
  - Establish a data retention schedule (recommended: 30 days for error reports; aggregated or 90 days for coarse analytics).
  - Ensure data processing aligns with relevant privacy guidelines (e.g., GDPR, CCPA).
  - If required by applicable jurisdiction, ensure user consent banners or policy notices are in place prior to enabling `VITE_ANALYTICS_ENABLED=true`.
- [ ] **Staging Verification**
  - Configure `VITE_ERROR_REPORTING_ENABLED="true"` and `VITE_ERROR_REPORTING_URL="https://your-staging-ingest"` on a staging deployment.
  - Verify that intentionally triggered client errors produce sanitized reports without leaking URL parameters.
  - Verify that network failures to the reporting endpoint do not alter UI behavior or display error alerts to the user.
