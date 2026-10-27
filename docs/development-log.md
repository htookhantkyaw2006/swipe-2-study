# Development log

## 27 October 2026 — Local owner isolation

Base: `83b4927` on `feat/backend-foundation`. This is the next implementation
checkpoint after the initial Supabase foundation.

### Implemented

- Guest keys remain unchanged (`s2s_<language>_<table>`, `s2s_preferences`,
  `s2s_language`). No guest records are migrated or deleted by this change.
- A future verified Auth owner uses `s2s_user_<user UUID>_<cache name>`.
  Selecting an owner alone does not import guest data or create a cloud session.
- The synchronous `db` contract now uses an owner-aware local database adapter.
  Missing tables are empty; corrupt learning rows are retained and reported
  instead of silently overwritten. Failed writes throw rather than returning a
  successfully saved record.
- Preferences and active language follow the selected owner. Switching ownership
  remounts the page/provider tree to discard the previous owner's rendered state.
  Starter course content is seeded for each newly selected local owner.
- Captured storage scopes keep delayed responses pinned to the original owner.
  Future asynchronous services must capture a scope and verify session/reset
  generation before applying their result; never use a later active owner.
- Settings storage usage counts only current-owner cache entries, excluding Auth
  tokens and other accounts. Export/Reset already use the owner-aware `db`, but
  remain local-only until server sync/reset/export are implemented.
- Signed-in owner caches are not automatically populated with Saved Words demo
  records. Existing guest demo behavior and existing source data remain intact;
  import-time sample filtering is still required.

### Verification

- Full suite: 29 tests passed (16 foundation tests plus 13 local-cache/module
  integration checks).
- After final hook-dependency and key-validation adjustments, all 13 affected
  cache/module checks passed again.
- Production build passed; bundle approximately 739.21 kB / 215.42 kB gzip.
- Lint: no errors; the 14 pre-existing warnings remain. No added warnings.
- `git diff --check` passed.
- Integration tests load the actual Vite application modules and check database,
  seeding, language and preference reads across owner changes. They are not
  interactive browser, provider-remount or hosted Supabase tests.

### Current limits / next task

- No authenticated UI, Auth owner coordination or hosted migration is wired yet.
  Until that lands, the app still runs as a guest. Local owner selection is not
  an authorization mechanism; hosted access depends on Supabase RLS.
- Preferences/language retain their previous best-effort in-memory fallback when
  browser persistence is unavailable. Visible storage failure/retry handling is
  still needed in the connected account/sync flows.
- No guest import, stable-content backfill, durable sync flags, cloud progress,
  tombstones, reset RPC or account-deletion function has been implemented here.
- No responsive adaptation is claimed by this cache-only checkpoint.
- Hosted staging URL/publishable-key configuration and target inspection are
  still needed. No hosted schema or deployment was modified.
- GitHub push dry-run failed because this runtime has no GitHub credentials.
  PT's browser collaborator access does not authenticate this runtime. Transfer
  reviewed commits to PT's laptop or connect an authorized GitHub integration.

Next: establish a shared branch on PT's laptop, configure the confirmed staging
project, inspect/apply its migration, then implement verified Auth ownership and
responsive account flows above the existing owner boundary.

## 28 October 2026 — Connected account flow & Auth owner coordination

Base: `0bbe6fd` on `feat/backend-foundation`.

### Context & Staging Migration
- PT configured `.env.local` with verified Supabase staging credentials (`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`); `npm run check:backend` verified configuration.
- Operator record: PT manually applied `supabase/migrations/20261027000100_backend_foundation.sql` directly through the Supabase dashboard SQL Editor ("Success. No rows returned"). The migration was not rerun and hosted security behavior will be verified against that live schema. (CLI migration history remains to be reconciled separately before remote CI pushes).

### Implemented
- **Auth Provider & Coordination (`src/lib/auth.jsx`)**:
  - Mounted `AuthProvider` above `StorageOwnerBoundary` and `CourseShell` in `main.jsx`.
  - Session restoration via `client.auth.getSession()`, Auth state subscription (`SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`, `USER_UPDATED`).
  - Owner synchronization: verified user UUID is forwarded to `storageOwner.setOwner(user.id)`; signout resets owner to `null` (guest) immediately, cleanly triggering boundary remount.
  - Race protection via generation counters (`captureGeneration`, `isCurrent`), ensuring stale async operations arriving after logout or account switching are discarded.
- **Open-Redirect Protection (`src/lib/safeReturnPath.js`)**:
  - Validates `returnTo` search parameters. Rejects absolute URLs, external schemes, protocol-relative paths (`//`), backslashes, and malformed inputs, defaulting safely to `/`.
- **Learner Profile Hook (`src/lib/profile.js`)**:
  - Fetches `public.profiles` for authenticated learners using normal credentials.
  - Generation-guarded against account switching / logout races.
  - Surfaces real errors with retry mechanism; never fabricates dummy profile data when loading or failed.
  - `displayName` & `initialsOf` helpers fall back safely through profile `display_name`, user metadata (`display_name`, `full_name`), email prefix, and finally `'Learner'`.
- **Connected Account & Guest UI**:
  - `src/pages/Home.jsx`: Replaced hardcoded "Htoo Khant Kyaw" with real auth state, dynamic greetings (morning/afternoon/evening for users, welcome for guests), guest badge, and direct click-through to profile.
  - `src/pages/Flashcards.jsx`: Replaced hardcoded "Hello Htoo," greeting with real learner first name or "Hello Learner,".
  - `src/pages/Profile.jsx`: Dynamic identity card showing user initials, name, and email for authenticated learners, or clear "Guest Learner" status with "Sign In" and "Create Account" CTAs. Inline retry banner for profile fetch failures.
  - Local logout: calls `signOut()`, reverting to local guest mode without destroying genuine guest data or other user caches.
- **Responsive Auth Views & Styling (`src/pages/Login.jsx`, `Signup.jsx`, `VerifyEmail.jsx`, `AuthCallback.jsx`, `src/index.css`)**:
  - Styled all auth screens with mobile-first design, specifically tested and styled down to 320px screen width and desktop centered layouts.
  - Accessible forms, input toggle for passwords, loading states, validation errors, and resend verification handling.
- **Automated Verification (`tests/authIntegration.test.js`)**:
  - 4 test suites covering open redirect defense, profile fallback safety, session restoration & cache preservation across logout, and generation counter race protection.

### Verification
- Full test suite: 33 tests passed (Node test runner, 0 failures).
- Lint: `npm run lint` passed with 0 errors (16 existing warnings preserved).
- Production build: `npm run build` completed successfully (`dist/assets/index-*.js`, 0 errors).

### Bounded Limits (Deferred to Later Tasks)
- No Google OAuth, password reset, avatar file upload/editing, account deletion, guest data migration/import, or cloud progress synchronization in this task. These remain bounded for future checkpoints.
