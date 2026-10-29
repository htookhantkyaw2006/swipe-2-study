# Accounts Integration Release Candidate (RC) Specification

This document defines the consolidated status, technical verification, startup prerequisites, hosted dependencies, and manual acceptance runbook for the **Accounts Integration Release Candidate**.

---

## 1. Release Candidate Identity & Source Lineage

- **Integration Branch**: `integration/accounts-release-candidate`
- **Base Commit**: `4e0b703460bd5de63f221d89ca32e0eb887f0f23`
- **Linear Feature Ancestry**: Verified via `git merge-base --is-ancestor`. All remote account feature branch tips are verified ancestors of this release candidate:
  1. `feat/backend-foundation`
  2. `feat/guest-import-dialog`
  3. `feat/account-cloud-integration`
  4. `feat/account-deletion-server`
  5. `feat/account-deletion-ui`
  6. `fix/deletion-attempt-reservation`
  7. `feat/avatar-processing`
  8. `feat/auth-route-readiness`
  9. `feat/google-signin-readiness`
  10. `feat/staging-preflight`
  11. `fix/guest-import-retry-consent`
  12. `fix/snapshot-local-conflicts`
  13. `fix/snapshot-recovery-guards`
  14. `fix/atomic-account-cache`
  15. `fix/atomic-account-cache-followup`
  16. `fix/signout-event-coordination`
  17. `fix/signout-boundary-followup`
  18. `fix/account-request-lifecycle`
- **Explicit Exclusions**: `feat/content-csv-validator` is strictly excluded from this branch and preserved separately in the primary checkout.

---

## 2. Technical Clarifications & Corrections

To maintain documentation integrity, the following inaccuracies from earlier report drafts are corrected:

1. **Account Deletion Payload Contract**:
   The server deletion endpoint (`delete-account` Edge Function) only accepts `{ password }` in the request body; caller-selected user IDs were never accepted in the JSON body. The actual vulnerability was that `sendDeletionRequest` captured the bearer token via `client.auth.getSession()` without verifying that `session.user.id` or `getUser(capturedToken)` matched the initiating owner ID (`initiatingUserId`). This has been resolved: tokens are now cryptographically verified and bound strictly to `initiatingUserId` with multi-stage cancellation guards.
2. **Commit Lineage of `305f4b2`**:
   Commit `305f4b2be2dfa6ebf9a888c340d8aa536b3f9429` belongs to the sign-out boundary follow-up chain (`fix/signout-boundary-followup`), not the original `review/accounts-checkpoint` tip (`48af749d9508fc7a0fc7916f02ebfe1a073df43b`).
3. **Installed Tooling Versions**:
   The installed bundler in this checkout is **Vite v8.1.4** (verified via `npm list vite`), not older v7.x versions reported in earlier notes.

---

## 3. Implementation, Testing & Staging Status Matrix

| Capability / Subsystem | Implemented in RC | Locally Tested (Mocked / Automated) | Hosted Staging Acceptance Pending | Capability Default |
| :--- | :---: | :---: | :---: | :---: |
| **Unconfigured Guest Mode** | Yes | Yes (SSR & Browser) | N/A (Fully offline/local) | Enabled |
| **Protected Routes (`/profile/edit`)** | Yes | Yes (SSR & Navigation Guard) | Pending staged auth session | Enabled |
| **Profile & Avatar Processing** | Yes | Yes (Canvas/WebP & Dimensions) | Pending Supabase Storage Bucket (`avatars`) | Enabled |
| **Google Sign-In Readiness** | Yes | Yes (Defense against open redirect) | Pending Google Cloud Console OAuth setup | `VITE_GOOGLE_AUTH_ENABLED=false` |
| **PKCE / OAuth Callback Lifecycle** | Yes | Yes (Node + Real Chrome/Edge DOM) | Pending single-use email callback test | Enabled |
| **Fresh Callback Stale Storage Defense** | Yes | Yes (Node + Real Chrome/Edge DOM) | Pending cross-account email link test | Enabled |
| **Guest Import Consent & Retry** | Yes | Yes (Atomic cache & repair tests) | Pending staged cloud import test | `VITE_CLOUD_IMPORT_STAGING=false` |
| **Snapshot Conflicts & Atomic Cache** | Yes | Yes (Zero-partial commit tests) | Pending live cloud sync restore | Enabled |
| **Local & Global Sign-Out Coordination**| Yes | Yes (Honest local session removal) | Pending multi-device session revocation | Enabled |
| **Account Deletion HTTP Boundary & Server** | Yes | Yes (CORS, Throttling, Headers) | Pending Supabase Edge Function deploy | `VITE_ACCOUNT_DELETION_ENABLED=false` |
| **Account Deletion Owner Token Binding** | Yes | Yes (Owner mismatch abort tests) | Pending staged live deletion flow | `VITE_ACCOUNT_DELETION_ENABLED=false` |

---

## 4. Local Environment & Startup Prerequisites

### 4.1 Prerequisites
- **Node.js**: v20.x or higher
- **Package Manager**: npm v10.x or higher
- **Local Browser**: Google Chrome or Microsoft Edge (for automated headless browser runner)

### 4.2 Local Startup
```bash
# 1. Switch to review worktree
cd C:\Users\VivoBook\Desktop\swipe-2-study-review

# 2. Install dependencies (if not already installed)
npm install

# 3. Start local development server
npm run dev
```

### 4.3 Test Execution
```bash
# Run unit & integration test suite (includes 7 smoke tests)
npm test

# Run real browser account safety & callback runner (Headless Chrome/Edge)
node tests/runBrowserAccountSafety.mjs
```

### 4.4 Environment Configuration (`.env.local`)
Capability flags remain at their secure defaults:
```ini
# Supabase Configuration (Leave unset for unconfigured guest mode)
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<public-anon-key>

# Capability Gates (Must remain false until hosted prerequisites are satisfied)
VITE_CLOUD_IMPORT_STAGING=false
VITE_ACCOUNT_DELETION_ENABLED=false
VITE_GOOGLE_AUTH_ENABLED=false
```

---

## 5. Hosted Infrastructure Prerequisites

Before activating staging capability flags or conducting production acceptance, the project owner must configure the following hosted services:

1. **Database Migrations (`supabase/migrations/*`)**:
   - Run database migrations to install user learning documents schema (`learning_document_v1`), profile tables, audit trails, and server-side RPC functions (`s2s_delete_account`).
2. **Account Deletion Edge Function (`supabase/functions/delete-account`)**:
   - Deploy the Edge Function to the Supabase project.
   - Configure Edge Function secrets: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
   - Ensure the server-side environment does not expose the service role key to clients.
3. **Supabase Auth & Custom SMTP**:
   - Configure custom SMTP provider in Supabase Dashboard (Auth -> Email Settings).
   - Configure Site URL: `https://<domain>` and Additional Redirect URLs: `https://<domain>/auth/callback`.
4. **Google Cloud Console OAuth 2.0**:
   - Create Web Application credentials in Google Cloud Console.
   - Set Authorized Redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
   - Add Client ID and Client Secret in Supabase Auth -> Providers -> Google.
5. **Private Avatars Storage Bucket**:
   - Create private storage bucket named `avatars`.
   - Apply Row-Level Security (RLS) policies allowing users to read/write only their own directory: `auth.uid() = (storage.foldername(name))[1]`.

---

## 6. Ordered Manual Acceptance Checklist

Perform the following manual acceptance checks on staging using disposable test accounts:

1. **Unconfigured / Guest Mode Smoke**:
   - Launch application without Supabase environment variables.
   - *Expected Result*: App opens in Guest mode; word collections and study sessions operate offline without network errors.
2. **Protected Route Gating**:
   - In guest mode, navigate directly to `/profile/edit`.
   - *Expected Result*: User is redirected to `/login?returnTo=%2Fprofile%2Fedit`. Form inputs and avatar controls are never rendered before sign-in.
3. **Magic Link / PKCE Callback**:
   - Sign in with an email link or confirmation code.
   - *Expected Result*: User lands on `/auth/callback?code=...`, sees "Verifying your account…", and is cleanly redirected to the destination (`/profile/edit` or `/library`).
4. **Stale Session Storage Defense**:
   - Abort or cancel an earlier callback for Account A, leaving `s2s_callback_owner` in `sessionStorage`.
   - In the same browser tab, open a valid verification link for Account B.
   - *Expected Result*: Account B is not blocked by Account A's stale key; verification completes and redirects to Account B's destination.
5. **Session Refresh Resilience**:
   - On the `/auth/callback` screen with simulated network latency, trigger `TOKEN_REFRESHED` or profile metadata update.
   - *Expected Result*: Verification completes successfully without dropping the callback or getting stuck on the spinner.
6. **Local & Global Sign-Out**:
   - Open Profile and select "Log out". Verify session resets to guest and account learning documents are not exposed.
   - Sign in again, open Profile, and select "Sign out on all devices". Verify local session is removed and remote sessions are invalidated.
7. **Account Deletion Capability Gating**:
   - In default environment (`VITE_ACCOUNT_DELETION_ENABLED=false`), inspect Profile.
   - *Expected Result*: Delete Account displays the disabled placeholder ("Available in a later update / Soon"). No deletion dialog can be opened.
8. **Staged Deletion Execution (with `VITE_ACCOUNT_DELETION_ENABLED=true`)**:
   - Open Delete Account dialog on a disposable staging account, enter incorrect password, verify rejection.
   - Enter correct password, confirm deletion.
   - *Expected Result*: Account is deleted from database and auth system, local storage is cleared, and app resets to guest mode with a confirmation message.

---

## 7. Remaining Blockers & Next Owner Actions

| Item | Action Required | Owner Responsibility |
| :--- | :--- | :--- |
| **1. Hosted Database Migrations** | Apply `supabase/migrations/` to the hosted Supabase project. | Backend / DevOps Owner |
| **2. Edge Function Deployment** | Deploy `supabase/functions/delete-account` and bind service role secrets. | Backend / DevOps Owner |
| **3. SMTP Email Configuration** | Configure production SMTP credentials in Supabase Auth Dashboard. | DevOps / Project Lead |
| **4. Google OAuth Credentials** | Configure Google Cloud Console Client ID & Secret in Supabase. | DevOps / Project Lead |
| **5. Storage Bucket Creation** | Create `avatars` bucket and apply RLS policies in Supabase Storage. | Backend / DevOps Owner |
| **6. Manual Acceptance Sign-off** | Execute manual checklist on staging environment with disposable accounts. | QA / Project Lead |
