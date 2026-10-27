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

Base: `0bbe6fd` on `feat/backend-foundation`. Follow-up review corrections applied.

### Context & Staging Migration
- PT configured `.env.local` with verified Supabase staging credentials (`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`); `npm run check:backend` verified configuration.
- Operator record: PT manually applied `supabase/migrations/20261027000100_backend_foundation.sql` directly through the Supabase dashboard SQL Editor ("Success. No rows returned"). The migration was not rerun and hosted security behavior will be verified against that live schema. (CLI migration history remains to be reconciled separately before remote CI pushes).

### Implemented & Corrected
- **Session Verification & Auth Coordination (`src/lib/authCoordinator.js`, `src/lib/auth.jsx`)**:
  - `auth.jsx` no longer selects private cache based on raw local JWTs. Every session from `getSession()` or Auth events is verified against the server via `client.auth.getUser()` before selecting its private cache (`storageOwner.setOwner(user.id)`).
  - Every asynchronous operation (restoration, verification, profile loading) is guarded by an advancing operation generation (`generation`). Delayed responses arriving after logout or account switching are discarded.
  - Event listeners on `onAuthStateChange` remain synchronous. Asynchronous verification is scheduled outside the callback.
  - `AuthProvider` gates rendering during initial session restoration with a clean loading indicator, preventing unverified guest state or mismatched user/cache pairs from rendering.
  - Actionable error and retry state (`retryVerification`) is exposed when verification fails.
  - Fast Refresh lint warnings in `auth.jsx` resolved by separating context (`authContext.js`), hook (`useAuth.js`), and coordinator (`authCoordinator.js`).
- **Callback Completion (`src/pages/AuthCallback.jsx`)**:
  - Removed unconditional 800ms redirect timer. Navigation only occurs after the user has been genuinely verified by the Auth coordinator.
  - URL error parameters (`error`, `error_code`, `error_description`) in both query string and hash fragments are parsed into recoverable user-facing error notices.
  - Missing PKCE verifier / code parameters without an active session are surfaced with actionable links to sign in or resend verification.
  - Works with existing `@supabase/supabase-js` `flowType: 'pkce'` and `detectSessionInUrl: true` without attempting redundant code exchange.
- **Local Logout Correction**:
  - Explicitly calls `signOut({ scope: 'local' })`.
  - Checks returned `{ error }` and surfaces failures without reactivating the local account.
  - Synchronously resets owner to `null` (guest) and advances generation before the network request.
  - Genuine guest records (`s2s_...`) and other users' caches on disk are strictly preserved.
- **Hardened Open-Redirect Defense (`src/lib/safeReturnPath.js`)**:
  - Rejects control characters (ASCII 0–31 and 127) including embedded tab/newline (`/\t/evil.example`), backslashes, protocol-relative paths (`//`), and external URI schemes.
  - Resolves internal paths against a fixed safe base origin to guarantee the resolved URL stays internal.
- **Connected Account UI & Real Profile State**:
  - `src/pages/Home.jsx`: Dynamic greetings with verified user name or "Guest Learner" tag.
  - `src/pages/Flashcards.jsx`: Dynamic greeting with learner's verified first name or fallback.
  - `src/pages/Profile.jsx`: Profile hero card with initials, email, retry banner on profile failure, guest state with sign-in/create account CTAs, and local logout.
  - `src/index.css`: Mobile-first responsive styling down to 320px width and centered desktop layout.

### Automated Verification
- Full test suite: **37 tests passed** (`npm test`, Node test runner, 0 failures).
  - Covered: control-character return paths, profile fallback safety, session verification via `getUser()`, delayed restoration after logout, Account A verification completing after Account B, verification failure & retry, local logout errors & cache preservation.
- Linter: **0 errors**, 14 pre-existing warnings preserved; newly introduced auth warnings eliminated (`npm run lint`).
- Production build: **Success** in 891ms (`dist/assets/index-B1tlnuIV.js`, `npm run build`).
- Git whitespace: **Clean** (`git diff --check`).

### Unverified Hosted & Browser Behavior (Still Required on Staging)
- Automated tests mock client responses and test local storage isolation; they do not prove live network behavior.
- Live SMTP delivery and email spam inboxing still depend on the client's Supabase SMTP settings.
- Live browser PKCE code exchange and token redirect with email links must be validated by PT in the browser.
- Live multi-tenant row isolation across two real accounts still requires hosted verification against Supabase RLS.

### Bounded Limits (Deferred to Later Tasks)
- No Google OAuth, password reset, avatar file upload/editing, account deletion, guest data migration/import, or cloud progress synchronization in this task. These remain bounded for future checkpoints.

## 28 October 2026 — AuthCoordinator & AuthProvider Integration Corrections

### Summary
Fixed four specific integration and lifecycle issues in `AuthCoordinator` and `AuthProvider` discovered following commit `d08e262`:
1. **Cached Immutable Snapshot (`src/lib/authCoordinator.js`)**:
   - `coordinator.getState()` now returns a cached, immutable snapshot (`Object.freeze(...)`).
   - Repeated calls without state change return the exact same reference (`Object.is(s1, s2) === true`), satisfying `useSyncExternalStore` snapshot stability.
   - A new snapshot is published before subscribers are notified across initialization, verification, error surfacing, retry, logout, and account transitions.
2. **Transition & Owner Gating (`src/lib/auth.jsx`)**:
   - `AuthProvider` gates rendering when `state.loading`, `state.isTransitioning`, or `!isOwnerAligned` (`state.user.id !== state.ownerId` when authenticated, or `state.ownerId !== null` when guest).
   - Renders spinner during account transitions so no mismatched user/private cache pair ever renders.
   - Resumes child rendering only after the verified user and selected storage owner agree.
3. **Cleanup Invalidation & StrictMode Support (`src/lib/authCoordinator.js`)**:
   - `initialize()` cleanup function advances the operation generation (`nextGeneration()`), sets `cancelled = true`, and unsubscribes from Auth events.
   - Pending `getUser()` and `getSession()` responses arriving after cleanup are invalidated and cannot modify user state or storage ownership.
   - Seamlessly supports React StrictMode mount/cleanup/remount cycles (`initialize -> cleanup -> initialize`).
4. **Removal of Same-User Verification Shortcut (`src/lib/authCoordinator.js`)**:
   - Removed direct assignment of unverified `session.user` for same-user events (`SIGNED_IN`, `TOKEN_REFRESHED`, `USER_UPDATED`, `INITIAL_SESSION`).
   - Keeps event callbacks strictly synchronous while scheduling asynchronous verification via Supabase `getUser()` outside the callback.
   - Updates user and storage ownership only after the server verification promise resolves.

### Automated Verification
- Full test suite: **42 tests passed** (`npm test`, Node test runner, 0 failures).
  - Added 5 new regression tests in `tests/authIntegration.test.js`:
    1. Snapshot reference stability across repeated reads and publication on state change.
    2. Invalidation of delayed verification completing after `initialize()` cleanup.
    3. StrictMode-style reinitialization (`initialize -> cleanup -> initialize`) without interference from stale responses.
    4. Verification of same-user Auth events with `getUser()` instead of direct session assignment.
    5. Mounted `AuthProvider` rendering gating during loading and account transitions using `react-dom/server` (`renderToString`).
- Linter: **0 errors**, 14 pre-existing warnings in unrelated modules preserved (`npm run lint`).
- Production build: **Success** in 797ms (`dist/assets/index-BO7tf5Y9.js`, `npm run build`).
- Git whitespace: **Clean** (`git diff --check`).

### Unverified Hosted & Browser Behavior (Still Required on Staging)
- Automated tests mock client responses and simulate component mounting; live browser session cookie/token exchange with hosted Supabase Auth still requires manual verification.
- Email deliverability with custom SMTP and live link clicking in client email clients remain unverified by local scripts.
- Multi-user RLS data isolation between two live authenticated accounts still requires hosted verification.

## 28 October 2026 — Email verification callback recovery

### Changes
- Callback error state now blocks success navigation, including when an existing user is already signed in. Loading, account transitions, Auth failures, and callback timeout also block success navigation.
- Extracted callback parsing and navigation decisions into `src/lib/authCallbackState.js`. Query/hash descriptions are decoded once by `URLSearchParams`; literal percent signs and plus signs no longer crash or change the message. Error-code-only links remain errors, and empty code/token values are treated as missing.
- The verification page now has an editable, required email field. Recovery from an expired callback works without an email in the URL; signup-supplied addresses remain prefilled. Resend submits the trimmed address through the existing Supabase SDK flow, preserving the safe return path. No email is inferred from a token or another account.
- Added nine regression tests for callback error precedence and navigation decisions, malformed/percent/plus descriptions, pending states, and server-rendered callback/resend views.

### Verification
- `npm test`: **51 passed, 0 failed** (42 existing plus nine new tests).
- `npm run lint`: **0 errors**, 14 existing warnings.
- `npm run build`: passed; existing bundle-size and ineffective dynamic-import warnings remain (JS approximately 982 kB, 278 kB gzip).
- `git diff --check`: passed.
- Tests use production callback decision functions and server rendering. `renderToString` does not mount browser effects or exercise interactive form submission; it is not a browser lifecycle test. The suite also emits an existing Vite test-server port warning but completes successfully.

### Still to verify on staging
- Real email delivery, resend submission/rate limits, and a fresh confirmation link in the same browser that started the PKCE flow.
- Error recovery in a real browser, including opening an expired link while already signed in.
- Hosted multi-user RLS isolation remains unverified. No hosted schema, environment secrets, dependencies, or production deployment were changed in this checkpoint.

### Transfer status
- The connected account reports repository push permission, but publishing through the GitHub integration's create-tree endpoint returned HTTP 403 (`Resource not accessible by integration`). The remote branch was not updated. A verified Git bundle is supplied for importing this commit on PT's already-authenticated laptop and pushing normally.

## 28 October 2026 — Diagnose missing callback sessions

### Observed staging behavior
- PT reported receiving a signup confirmation email, then seeing the callback timeout. Subsequent email/password sign-in, refresh persistence, logout, and sign-in/logout repetition passed PT's manual browser checks.
- The exact cause of PT's callback failure is not established: browser profile/origin/verifier availability and the hosted token response were not captured. Manual login passing does not prove automatic callback completion.

### Changes and evidence
- Callback now inspects the installed SDK's cached `auth.initialize()` result before accepting success. SDK URL-exchange failures can be hidden by a later successful `getSession()` response containing no session.
- When initialization completes without a session, the page immediately offers email/password sign-in and explains the same-browser/profile/app-address requirement. It does not wait ten seconds and then imply the confirmation email definitely expired.
- Success navigation waits for both callback inspection and the existing coordinator's verified user. Cancellation guards discard inspection results after callback unmount. The SDK remains the only owner of automatic PKCE exchange; no manual duplicate exchange or verifier bypass was added.
- Six new tests include three using the actual installed Supabase Auth SDK with browser-shaped globals, a storage adapter, and a mocked token endpoint: successful exchange exactly once, missing-verifier skip, and rejected exchange whose error is absent from a subsequent `getSession()` call. All network credentials and responses in these tests are synthetic.

### Verification and limits
- `npm test`: **57 passed, 0 failed**.
- `npm run lint`: **0 errors**, 14 existing warnings.
- `npm run build` and `git diff --check`: passed. Existing bundle/dynamic-import and Vite test-server port warnings remain.
- These are SDK simulations, not a real browser or hosted email callback test. A fresh signup/confirmation in the same browser profile at exactly `http://127.0.0.1:5173` remains to be tested by PT. Real hosted RLS isolation is still pending.
- No hosted configuration, dependencies, account data, or production deployment changed. Integration write access remains blocked by the previously observed 403, so this checkpoint is transferred by Git bundle.

## 28 October 2026 — Home refinement and responsive frame

- Retained the client's existing blue palette while refining Home, course-card art, shortcuts, typography and shadows.
- Replaced the 500px app-wide constraint with a responsive shared frame: desktop sidebar at 1024px+, floating navigation below that, focused sessions without main navigation.
- Home uses device review/saved counts and labels existing level completion as sample progress. Opening a selected level preserves its route ID.
- Added self-hosted licensed variable fonts for English/readings, Burmese, Chinese and Japanese, with Unicode-subset loading and course-specific CJK preference; added vector language flags. Font packages are pinned and documented in `public/fonts/README.md`.
- Production browser checks passed at Home widths 320/375/768/1024/1440, plus selected-level navigation, language switching, keyboard skip link, long multilingual names, and smoke checks on eight existing routes at phone/desktop widths. Browser page errors: zero. Physical devices and live hosted Auth were not retested here.
- Validation: 57 tests passed; lint zero errors / 12 existing warnings; build passed; whitespace clean. Existing large bundle warning remains. The previous Home ineffective dynamic-import warning is resolved.
- Full scope, evidence and remaining screen refinements: `docs/ui-checkpoint.md`. This is the Home/shared-frame checkpoint, not completion of all responsive page refinements.
- Delivery uses the existing Git-bundle workflow because the integration write endpoint previously returned 403. No production merge or deployment was performed.

## 28 October 2026 — Compact featured flashcard widget

- Following PT's feedback, reduced Home's featured HSK/JLPT card height by trimming padding, vertical spacing, heading size and decorative art. Desktop actions are compact; phone actions retain 44px minimum height and fit side by side at 320px.
- Production browser checks: no Home/main overflow at 320/375/768/1024/1440; card heights approximately 276/282/298/290/300px. Navigation, language switching, route smoke checks and long-name layout still pass; zero page errors.
- Build, lint (zero errors, 12 existing warnings), and whitespace checks passed. No Auth/data behavior changed and no new unit tests were added or run for this styling adjustment.
- The replacement transfer bundle includes both this follow-up and the initial responsive Home checkpoint, based on `f319d91`.
