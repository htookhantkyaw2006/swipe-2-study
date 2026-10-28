# Development log

## Latest — 28 October 2026 — Work batch A: offer timing and cloud-import foundation

- PT reported the configured device-only merge and refresh/logout/login checks
  passed. The automatic offer had been interrupted by same-account revalidation;
  manual Recheck opened a real offer with two saved Chinese words.
- Fixed read-only offer invalidation: same-account revalidation now prepares a
  fresh offer while discarding old results. Decide later stays deferred; a pending
  explicit save is never silently resubmitted. Real SDK/Chromium checks force a
  delayed SHA-256 inspection and cross-tab events: all **8 checks pass**, including
  stale results, pending-save interruption and a fresh explicit retry.
- Added a transactionally applied staging migration for user_items, private
  request receipts, owner-checked snapshot/import RPCs, RLS reads, controlled writes,
  stable server keys and reset/deletion guards. RPC expected-user binding blocks a
  token/account change between client verification and fetch authorization.
- Added pure legacy-record conversion, owner-bound retry envelopes, verified SDK
  transport and exact acknowledgement checking. Search history is retained within
  its limit; drill conflicts use higher seen/latest timestamp without summing.
  Explicit samples are filtered; seeded course origin alone preserves real reviews.
- **Not activated:** no hosted migration, cloud UI, durable request outbox or
  conflict-safe snapshot hydration has been shipped/applied. Existing app behavior
  remains device-only. See cloud-import-foundation.md for activation boundaries,
  reviewed SQL and pending hosted/multi-connection checks.
- Validation: **196 Node tests pass** (20 new PostgreSQL/RLS cases, 14 new
  record/transport cases and 2 added controller regressions), lint **0 errors / 8
  existing warnings**, production build and whitespace checks pass. The existing
  large-bundle warning remains. Mapper tests were also rerun after preserving
  genuine seeded-origin user records. Browser/SDK inputs are synthetic; this is
  not hosted migration/JWT/cross-device acceptance.
- External IDE task A owns only a new GlobalSignOutDialog JSX/CSS/doc on a separate
  branch from 7f1034d. No existing Auth/Profile/global style/log file belongs to
  that task; integration stays here. Next work batch B is deletion logic plus an
  isolated deletion confirmation UI, after task A review. No main/deployment change.

## Latest — 28 October 2026 — Integrated device-only guest learning import

- Reviewed and merged the IDE-agent dialog `3d85c61` with the import core
  `c55e015`. The original commits remain in history. The client-reported unrelated
  passwordRecovery.js whitespace edit is not part of this work.
- Added a Router-aware provider/controller above CourseShell, automatic offers
  after verified sign-in, explicit merge/account-only actions, and Profile →
  Guest learning re-entry. Deferral writes no decision and survives ordinary SPA
  navigation/course changes; a fresh reload/sign-in may offer undecided rows again.
- Reworded dialog copy to explicitly state device-only persistence, no cloud sync
  and preserved guest records. Added recheck after errors, accessible scrollable
  summaries and visible/focused result notices. An all-duplicate merge does not
  claim new records were added. Pending choices suppress dismissal/double-submit.
- Controller owner/generation/request guards discard stale UI results. Auth,
  recovery, Edit Profile and study routes suppress the modal. Verified same-user
  events never restart a study deck; if an import finishes after browser Back
  enters study, the list refresh/notice waits until session exit. Profile also
  stays usable when stored collection data cannot be read safely.
- Validation: **160 Node tests pass**, lint **0 errors / 8 existing warnings**,
  unconfigured and synthetic-configured production builds pass, diff whitespace
  checks pass. Existing large-bundle warnings remain. No new dependencies/SQL,
  hosted configuration, deployment or main-branch changes.
- Chromium production: **49 checks / 30 layout states**. Development StrictMode:
  **52 checks / 60 layout states**, including the isolated long multilingual-label
  harness and keyboard summary scrolling. Unconfigured production: **9 smoke
  checks**, including the accepted sidebar scroll/full-width collapse behavior.
  Total: **110 checks / 90 layouts**; no uncaught page errors/unexpected requests.
- Browser flows use the installed SDK with intercepted synthetic Auth/profile
  responses and native localStorage/crypto. They cover actual login, deferral,
  re-entry, stale-source/error/recheck, pending/merge, immediate counts, refresh,
  logout/login, separate account-only decisions, real quota/retry, corrupt cache,
  cross-tab sign-out and session preservation. These are not real hosted account,
  email, cloud sync, RLS, Safari or physical-device acceptance. See guest-import.md.

## Latest — 28 October 2026 — Guest import service, device-cache checkpoint

- PT confirmed the sidebar is good and asked to leave it until final QA. PT also
  reported a successful real profile-photo upload that survives logout/login.
  These are user-reported acceptance results, not new hosted tests run here.
- Started guest import in parallel with an external IDE-agent dialog task. The
  dialog owns only three new UI/document files; this checkpoint does not integrate
  it, modify routes, show a login prompt or claim the full feature is delivered.
- Added read-only guest inspection, explicit merge/account-only decisions,
  per-language counts, server-user/live-session verification and owner/generation
  guards. Only actual learning tables are included; course seeds, search history,
  settings, Auth keys and other accounts are excluded. Guest data is never deleted.
- Account records win semantic conflicts, imported IDs are fresh, and counters
  are not added. Account-specific handled identities prevent retries/new guest
  additions from resurrecting a word the user subsequently removed or skipped.
  Review membership/removal now matches word identity across different deck IDs.
- Added an authoritative single-key account document for imported tables plus
  the receipt. Existing synchronous DB CRUD follows that document; untouched
  tables retain their format and old keys remain for recovery. A rejected quota
  write cannot leave a half-imported set of tables; lost-response retries reconcile.
- LocalStorage checks do not provide cross-tab compare-and-swap. This is a
  device-cache service, not cloud sync. UI integration/re-entry, multi-tab
  safeguards and hosted progress sync remain pending. See guest-import-core.md.
- Validation: 145 Node tests pass (29 added), lint zero errors/eight existing
  warnings, production build and whitespace checks pass. All 15 Chromium
  native-storage and actual review-action checks pass; details in guest-import-core.md.

## Latest — 28 October 2026 — Test suite stability and concurrency resolution

- Investigated test failures in `authCallback.test.js` and `authIntegration.test.js` where `renderToString` and hook execution threw `Cannot read properties of null`.
- Root cause: Node.js 22 test runner runs test files concurrently by default. Multiple test files spinning up in-process Vite SSR servers collided on HMR WebSocket port 24678 and mutated `globalThis.localStorage` concurrently, corrupting SSR module evaluation and hook dispatchers.
- Added `ws: false` to test Vite servers in `authCallback.test.js`, `authIntegration.test.js`, and `cacheIntegration.test.js` to eliminate port binding collisions.
- Configured `"test": "node --test --test-concurrency=1"` in `package.json` to serialize test file execution, ensuring safe `globalThis.localStorage` mock state isolation.
- Validation: all **116 Node tests pass** (0 failures), lint **0 errors / 8 pre-existing warnings**, production build passes cleanly, and whitespace checks pass.

## 28 October 2026 — Sidebar alignment and collapse refinement

- Reviewed the actual merged `dfe10b4`, including IDE-agent commit `fffef4d` and
  Edit Profile. Reproduced a concrete defect: at 300px scroll, collapsing focused
  the newly inserted Show button and reset main scroll to 0. The old Hide label
  also started 13px left of the navigation-label column at the tested short size.
- Replaced the two conditional controls with one persistent sticky desktop
  toolbar control. Its height is the same expanded/collapsed, focus stays on the
  same button, and it remains reachable when scrolled. Sidebar icons use one
  40px grid column and labels share the same start, including Settings.
- Sidebar slides with transform/visibility; main width/offset transition together
  over 220ms, reaching full viewport width when collapsed. Hidden desktop links
  are inert immediately. The breakpoint subscription re-enables mobile nav;
  sessions/Auth remain navigation-free and reduced motion disables transitions.
- Scroll handlers now capture a pending position and persist after 150ms idle,
  flushing on route change/pagehide/unmount. The 15-event browser sample produced
  one Storage write. Default sessionStorage getter failures are caught as well
  as method failures; added a regression for that case.
- Validation: 116 Node tests pass, lint 0 errors / 8 existing warnings, build and
  whitespace checks pass. Chromium production and dev StrictMode each passed
  22 behavioral checks and 60 layout states (44 / 120 total), including scroll
  preservation/restoration, animated intermediate widths, focus, persistence,
  keyboard, mobile/desktop resizing, enlarged text and reduced motion. No page
  errors or external requests. Screenshots inspected; no universal device/FPS
  claim. Hosted profile/Storage acceptance and final device review remain pending.

## Latest — 28 October 2026 — Profile name and private avatar editing

- PT marked the existing-screen UI step complete with final acceptance deferred,
  then authorized Edit Profile as the next account milestone. Sidebar/collapse
  remains a separate IDE-agent handoff. No sidebar, Layout or global theme file
  is changed by this feature.
- Added `/profile/edit` and its signed-in Profile entry. Guests receive a sign-in
  return path. Names support Burmese/CJK/emoji within the existing 100-character
  database limit. Photo selection/removal is staged with local preview and undo;
  invalid, oversized, undecodable and unsupported image files are rejected.
- Profile service uses verified Auth identity/current session, owner/generation
  guards and `updated_at` compare-and-swap. Photos use unique owned paths in the
  existing private bucket; signed reads live in memory for five minutes and
  refresh before expiry. Confirmed updates refresh Profile/Home, including after
  navigating away during a save. New image sources recover from earlier errors.
- Old-photo deletion follows a confirmed profile update and has explicit retry.
  Lost update responses require reload and retain possibly committed files.
  Storage/profile updates are not atomic; private orphan cleanup is not durably
  queued in this milestone. See profile-editing.md for the boundaries.
- Validation: **110 Node tests pass** (15 new service cases); lint **0 errors /
  8 existing warnings**; regular and synthetic-configured builds and whitespace
  checks pass. Chromium production and dev StrictMode each passed 32 flow checks
  and 50 layouts. Another 12 boundary/renewal/reachability checks and 20 real
  unconfigured guest layouts passed: **76 checks / 120 layouts** total.
- No page errors or unmocked external requests; phone/desktop screenshots
  reviewed. Auth/PostgREST/Storage responses and files were synthetic. Hosted
  profile/Storage/RLS acceptance, Safari and physical devices remain pending.
  No migration, hosted configuration, privileged key, dependency or main change.

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

## 28 October 2026 — Responsive vocabulary SwipeSession

- Refined `/learn/session` and `/learn/review/session` in the existing blue palette. Static layout moved into scoped `SwipeSession.css`; the remaining inline styles are motion values and calculated word sizes.
- Capped the study card at 400 × 480px, with a flexible smaller phone layout. Short landscape screens can scroll to their controls; long definitions/examples scroll inside the card. Pronunciation uses the existing darker primary blue for readable contrast. No new font, audio, dependency or content assets were added.
- Added an explicit keyboard-operable Reveal/Show word action, accessible word audio on both faces, labelled navigation/shuffle controls, semantic session progress, hidden/inert inactive card faces, and reduced-motion behavior. Buttons retain at least 44px touch targets.
- Drag distance now uses card width rather than window width. A brief action lock prevents concurrent shuffle/classification or repeated advancement during card exit; pending timers are cleared when the session unmounts. Shuffle uses the existing Fisher–Yates helper and preserves the completed prefix. Review add/remove semantics and the existing completion destination are retained. Removed two unused values from this touched screen.
- Production Chromium 153/Playwright checks: Chinese front/back at 320×568, 375×667, 768×1024, 1024×768, 1440×900 and 667×375; Japanese and English front/back at 320px and 1440px; synthetic long word/multilingual answer at 320px. All 22 measured layouts had no document/main horizontal overflow. Landscape controls remained reachable by scrolling.
- Browser interaction checks passed: keyboard reveal, word/example audio buttons preserving card state, review queue insertion, 110px desktop right drag, emulated-phone left touch drag, shuffle retaining progress, final review removal/completion/empty state, translation/pronunciation preference fallback, and reduced-motion reveal/advance. Audio output/voice quality was not verified. Browser page errors: zero.
- Learning and review routes use separate session keys so an in-app history transition starts the correct deck rather than retaining a previous session snapshot.
- Guest evidence: the local production build had no `.env` credentials, made no external requests during the tested desktop flow, and `/login` explicitly displayed the unconfigured guest state. This is local evidence only; a Vercel preview with staging configuration and live hosted Auth/RLS still needs testing.
- Validation: existing 57 tests passed; lint zero errors / 10 existing warnings; production build passed (JS approximately 968 kB / 277 kB gzip, existing large-chunk warning retained); `git diff --check` passed.
- Scope remains Home + shared navigation/frame + vocabulary SwipeSession. LessonPicker, SavedWords, ReviewWords, Library, Profile, phrase sessions and other screens have not received this refinement. Safari, physical devices and hosted sessions are unverified. No merge to `main`, push, deployment, environment configuration, Auth or database schema changes were performed here.

## 28 October 2026 — Responsive LessonPicker, SavedWords and ReviewWords

### UI and navigation
- Replaced page-specific inline layout in these three screens with scoped study/lesson CSS and small shared header, search and collection components. The original blue palette and existing self-hosted multilingual fonts remain in use; no assets or dependencies were added.
- LessonPicker stacks its overview, modules and vocabulary on phones; tablets use a paired overview/module layout, and large desktops use a 280px course column beside the vocabulary. Meaning/reading lines wrap, audio buttons have 44px targets, and the page uses real links for course, review, saved and explore navigation.
- Course-wide completion remains demo data and is explicitly marked **Sample progress** / **Sample mastered**. Review and saved counts now come from the actual current language/owner tables. The previous unsupported offline-ready badge and per-row sample mastery checkmarks were removed; no PWA implementation is implied.
- Saved/Review use readable word cards, two columns on large desktops, separate Burmese meaning lines, labelled audio/remove controls, live list counts, query/empty states and keyboard focus styling. Search matches written forms, readings, kana and English/Burmese meanings. Clearing the search icon restores input focus. Long strings wrap while action buttons remain reachable above the floating navigation at the end of scrolling.

### List/session corrections
- ReviewWords now renders the actual `review_cards` queue for every language. Chinese sample review rows no longer hide that queue.
- Viewing an empty saved collection no longer inserts demo bookmarks. Existing bookmarks, including previously inserted sample rows, remain intact; removed bookmarks stay removed after reload.
- Saved practice now opens `/saved/session`, using the responsive vocabulary session and the actual bookmarked words rather than an unrelated course phrase deck. Bookmarks are adapted in memory, retain their ids/readings/kana/meanings, and are not rewritten or deleted by marking them learned. Left swipes still add a normalized card to the regular review queue.
- Lesson launch includes the selected canonical level id and filters the session deck to that level. An unavailable level shows an empty state instead of silently studying another level. Legacy numeric lesson URLs remain supported. Completed saved/review sessions return to their collection; learning sessions return to their selected level.
- Added `studyWords.js` for the shared stored-row adapter, search and session-source selection. It reads through the existing owner/language-scoped database API. No hosted schema, Auth lifecycle, environment or migration was changed.

### Evidence and limits
- Added seven meaningful Node regressions for level isolation, unavailable levels, saved deck source and legacy fields, full review queue selection, immutable row adaptation, multilingual/normalized search, and blank/missing query results. These test session data selection and search; they are not DOM/gesture component tests.
- `npm test`: **64 passed, 0 failed** (57 prior + 7 new). `npm run lint`: **0 errors, 10 existing warnings**. `npm run build`: passed, approximately 957.5 kB JS / 276.9 kB gzip; existing large-chunk warning remains. `git diff --check`: passed.
- Production Chromium 153/Playwright: all three screens in Chinese/Japanese/English at 320/375/768/1024/1440px, plus unavailable-level, empty saved/review and long-entry cases: **49 measured layouts**, no document/main horizontal overflow or overflowing text blocks. Phone and 1024/1440 desktop screenshots were visually inspected. These use clean local guest data and synthetic fixtures derived from the existing course cards, not hosted account data.
- Browser interactions passed: fresh collections without inserted samples; normalized lesson search/no-result/clear; canonical level launch; unavailable-level handling; legacy numeric level URL; saved-only practice and return without deleting bookmarks; collection search/audio-button state/keyboard unsave/reload persistence; actual review completion returning to its empty list; long strings, bottom-nav clearance and reduced motion. No uncaught page errors or external requests occurred in this flow. Audio output quality is unverified.
- Re-ran the vocabulary session browser suite: 22 front/back/long-text layouts plus keyboard, desktop drag, emulated-phone touch swipe, shuffle, real queue mutations, preferences and reduced motion passed. Additional targeted checks passed for a legacy saved bookmark flowing left into review then learned, preserving its stored fields/bookmark, and a synthetic HSK2-only session returning to HSK2.
- Library and Profile are subsequent UI checkpoints; other unrefined routes remain outside this pass. Physical devices, Safari, Vercel staging preview, hosted Supabase Auth and RLS still require verification. No push, `main` merge, hosted configuration or deployment was performed; delivery continues through a verified incremental Git bundle.

## 28 October 2026 — Responsive Library and Profile

- Replaced the remaining page-level inline layout in Library/Profile with scoped CSS, matching the existing blue surfaces, readable typography, rounded cards and shared study frame. No dependencies, fonts, audio or image assets were added.
- Library now has real current-course card/saved/review counts instead of demo swiped/phrase totals or an untracked streak. Tool search filters both sections, including a no-results state. Grid/list controls are labelled native buttons with pressed state; available tools are keyboard-operable links and unavailable tools retain an explicit Soon label. Desktop grids use three columns, list view uses two on large screens, and phones use a smaller grid or stacked list.
- Profile uses actual saved/review counts instead of fictional streak/swipe statistics. Account identity, loading, profile-fetch retry, verification errors and logout remain tied to the existing Auth/Profile hooks. Guest copy does not imply that local learning lists are already synced across devices. Long names/emails wrap, including multilingual names.
- Replaced Profile's click-only settings rows/sheets with labelled native language/daily-goal selects and a keyboard-operable auto-play switch. They use the same existing language/preferences providers and owner-scoped persistence. Language switching still lands on Home through CourseShell. SettingsSubpage and its existing shared controls were not redesigned in this checkpoint.
- Preserved sign-in, signup, all-settings, plan-preview and collection navigation. Logout retains its existing coordinator and prevents repeat submission while pending; unexpected thrown errors now receive a visible retry message. Account deletion and feedback remain unimplemented and are visibly marked Soon rather than presenting misleading active controls. No billing or account-deletion implementation was added.
- Production Chromium 153/Playwright: Chinese/Japanese/English Library grid/list plus Profile at 320/375/768/1024/1440px, plus a synthetic long identity/email at 320px: **46 measured layouts** without document/main or measured text overflow. Phone, 1024px and 1440px screenshots were visually inspected.
- Browser checks passed: real collection counts, search/no-result/clear, keyboard view toggle, tool navigation, daily-goal selection, keyboard auto-play, persistence after reload, agreement with SettingsSubpage, native language selection and Home transition, guest Auth links, last-row clearance above floating navigation and reduced motion. Zero uncaught page errors/external requests in this unconfigured local guest build.
- Additional server-rendered simulations checked guest, synthetic signed-in metadata/email/logout visibility, verification retry and pending account views. These do not execute effects or prove hosted profile fetch/logout behavior. The long-identity browser check injects display text only and is a layout check, not a signed-in session.
- Validation: **64 tests passed**, lint **0 errors / 10 existing warnings**, production build passed (approximately 945.2 kB JS / 274.8 kB gzip; existing large-chunk warning remains), and `git diff --check` passed. No new unit tests were added for this UI pass; existing Auth/cache/deck regressions were rerun.
- The refined core screens now include Home/navigation, vocabulary sessions, LessonPicker, SavedWords, ReviewWords, Library and Profile. LevelPicker, phrase screens, Dictionary, full Settings and other helper screens have not all received the same page-specific pass. Physical devices, Safari, Vercel staging preview and hosted Supabase Auth/profile/logout/RLS still need verification. No push, main merge, deployment, environment, schema or Auth-coordinator changes were performed.

## 28 October 2026 — Prepare branch preview verification

- PT confirmed that the four requested local UI/account/settings/phone checks were all fine through `195ec0a`. This is reported local acceptance, not independent hosted preview/RLS evidence.
- Updated stale README/backend-setup statements that incorrectly said Auth was not wired. Added `docs/preview-verification.md` with target resolution, Vite build/Preview env, origin-specific Auth callbacks and hosted checks, checked against current official Vercel/Supabase documentation.
- The existing SPA rewrite and origin-derived signup/resend callback already support the planned preview workflow; no app code/configuration changes were needed in this step.
- Vercel/Supabase integrations were available but not connected when inspected. The existing GitHub connection subsequently exposed Vercel success for `195ec0a` and its actual branch preview URL through the commit check output. External fetch could not open that origin/login page, so dashboard/application access, preview env, confirmed staging target and hosted schema/policy state remain unresolved. No hosted env, Auth settings, SQL migration, deployment, production branch or domain changes were made.
- Documentation-only change: `git diff --check` passed. The preceding checkpoint's 64 tests/build/lint remain its recorded results; they were not rerun for these documentation edits.

## 28 October 2026 — Fix narrow-screen Settings while preview access is pending

- PT reported that the preview redirects to Vercel login and the selected social account is not connected to a Vercel user. The project owner is currently unavailable; hosted access/configuration work remains pending. PT explicitly requested continuing independent work without waiting for the owner.
- Audited LevelPicker, phrase overview/level/session, Settings and Dictionary in Chinese/Japanese/English at 320/375/768/1024/1440px: 90 production Chromium layouts, zero document/main overflow and zero page errors. The audit found real clipped Settings labels/values at 320/375px. This is a layout smoke audit, not a complete functional test of every helper route.
- Moved the Settings screen and row controls to scoped class-based CSS. Narrow screens stack values below labels, while large desktops show two groups per row. Existing icon gradients/palette are preserved, and the selected language now reuses the vector flag rather than relying on unavailable emoji glyphs.
- Replaced click-only settings rows and switch divs with labelled native buttons/switches. OptionSheet now uses a native dialog with focus containment, Escape/backdrop closing, opener-focus restoration, readable option controls and reduced-motion behavior. The separate existing LanguageSheet remains in use and was checked for language switching; it has not received the same native-dialog rewrite.
- Kept the existing preferences/database handlers, confirmation prompts, language scopes, export and reset behavior. Placeholder About actions now show Soon; notification/text-size descriptions no longer expose implementation notes or imply that web notifications are impossible.
- Targeted production browser checks: 15 language/width Settings combinations, six phone/desktop goal dialogs and one accent dialog (22 layouts), with no measured text/page overflow or uncaught page errors. Keyboard selection/switches, dialog focus/Escape/return, goal/audio/display persistence, Profile agreement, accent and language switching passed. On synthetic local guest data, clear cancel/confirm preserved other languages, reset cancel preserved records, and JSON export downloaded/parsed with the expected preferences and language data.
- Validation: 64 existing tests passed, lint zero errors / 10 existing warnings, production build passed (approximately 942.4 kB JS / 274.6 kB gzip; existing chunk-size warning remains), and whitespace checks passed. No dependencies/assets, Auth lifecycle, hosted data, environment, access controls, production branch or deployment settings were changed. Safari/physical-device and hosted verification remain pending.

## 28 October 2026 — Forgot password and recovery flow

- Added `/forgot-password`, `/reset-password` and a Login recovery link using the existing blue Auth UI. Requests use a same-origin reset URL and generic non-enumerating success message; inputs/errors/busy states and confirmation/policy failures are handled without storing passwords.
- AuthCoordinator now handles PASSWORD_RECOVERY via server `getUser` verification before exposing an in-memory recovery identity. Ordinary sessions do not authorize this UI, pending INITIAL_SESSION/duplicate SDK notifications are tolerated, same-account updates/refresh preserve the flow, and account switches/sign-out/completion clear it. Existing generation guards and owner boundaries remain intact.
- Reset submission checks the intended verified user and current session before the SDK update, guards repeated submission, and confirms the matching result/current recovery state before success. The SDK remains the only code-exchange owner. No schema, hosted configuration, access-control, dependency or production changes were made.
- Added 17 Node recovery regressions (10 helper cases, six coordinator lifecycle cases, one installed-SDK PKCE case), retaining all previous regressions: **81 tests pass**. Lint **0 errors / 10 existing warnings**; regular guest and synthetic-configured production builds pass; whitespace clean. Existing Vite fixture-port and large-chunk warnings remain.
- Production Chromium used synthetic credentials/identities and intercepted API responses with the actual SDK. Twelve configured layouts and two unconfigured 320px routes passed, including request/rate-limit/privacy, recovery exchange, matching email, URL-error priority, mismatched confirmation, server policy failure, repeated-submit prevention, success/receipt consumption, normal-login/missing-verifier rejection, refresh/fresh-link behavior and server-account mismatch. Zero page errors/unmocked external requests. No real mail was sent or hosted password changed.
- Material limit: reloading the reset form after exchange needs a fresh recovery link; its state deliberately does not persist across page loads. Real email delivery, allowed redirects, old/new-password login, hosted revocation/policy behavior, Safari and physical devices remain unverified. Setup and test steps: `docs/password-recovery.md`. Existing local signup/login acceptance is not evidence that this new recovery flow has been tested against hosted Supabase.

## 28 October 2026 — Diagnose and fix password recovery callback failure

### Observed behavior & Root Cause Analysis
- **Observed**: Demo1 requested a password reset, received an email, but clicking the link landed on `http://localhost:5173/reset-password?error=access_denied&error_code=otp_expired`. The form did not open.
- **Hosted Auth Server Rejection**: The query parameters `error=access_denied&error_code=otp_expired` are returned by Supabase GoTrue Auth server (`GET /auth/v1/verify`) before the app ever receives a code. GoTrue returns `otp_expired` when:
  1. An email token was already consumed (e.g. by an anti-phishing mail scanner/previewer making an automated GET, or double-clicking).
  2. Multiple reset requests were submitted in succession (each call to `resetPasswordForEmail` generates a new token hash in `auth.users`, invalidating all previous links).
  3. The OTP expiration window (`otp_exp`) elapsed.
  4. Email template in Supabase used an invalid verification type.
- **Origin Mismatch (`127.0.0.1` vs `localhost`)**:
  - The reset request was initiated from `http://127.0.0.1:5173`, storing the PKCE verifier in `127.0.0.1`'s `localStorage`.
  - Because `http://127.0.0.1:5173/**` was not configured in Supabase's allowed Redirect URLs, GoTrue fell back to the project's Site URL (`http://localhost:5173`).
  - Origin mismatch alone does not cause `otp_expired` (which is a server-side DB token check), but partitioned `localStorage` between `127.0.0.1` and `localhost` means that any code returned to `localhost` would subsequently fail PKCE exchange with `pkce_verifier_not_found`.
- **Client App Fixes**:
  - `src/lib/passwordRecovery.js`: `recoveryLinkError` now preserves and formats specific callback errors from `parseCallbackError` (such as expiration or link-already-used notices) rather than discarding them for a generic string.
  - `src/pages/ResetPassword.jsx`: Now reads and displays `authError` from `useAuth()` alongside `linkError`, preventing silent fallback to `RESET_LINK_REQUIRED` when the SDK reports an initialization or PKCE verification failure.
  - `src/lib/authCoordinator.js`: Preserves `recoveryCandidateId` across `getSession()` restoration and `retryVerification()`, preventing React StrictMode double-initialization from wiping the recovery state during remounts.
  - `src/pages/ForgotPassword.jsx`: Recovery note explicitly prints the active origin (`window.location.origin`), giving the developer immediate visibility into the origin that must be matched.
  - `vite.config.js`: Added `server: { host: true }` so Vite listens on all loopback interfaces (`127.0.0.1` and `localhost`).

### Verification
- Full test suite: **83 tests passed** (81 previous plus 2 new regressions covering StrictMode recovery preservation across remounts and detailed `recoveryLinkError` formatting).
- Linter: **0 errors**, 10 existing warnings preserved (`npm run lint`).
- Production build: **Success** (`npm run build`).
- Git whitespace: **Clean** (`git diff --check`).

## 28 October 2026 — Cross-browser password recovery preparation

- PT clarified that recovery was requested in Edge while the email link opened
  in Chrome. The existing PKCE verifier is browser/profile/origin scoped. This
  explains a missing verifier, not the earlier upstream `otp_expired` response;
  the exact cause of that token rejection remains unproven. The rate-limit
  message alone also did not establish which server quota was reached.
- Fast-forwarded the clean feature checkout to Antigravity's pushed `bf390be`.
  No `main`, production deployment, hosted Auth/email setting or real account
  password was changed.
- Added a custom fragment TokenHash recovery template and explicit Continue
  confirmation. Captures/scrubs the credential before Auth/Router startup,
  retains it privately in memory, disables referrers and verifies once with SDK
  `verifyOtp(type: recovery)` on click. Independently verified
  `PASSWORD_RECOVERY` permission still gates password mutation. No global Auth
  flow downgrade, service key, new backend endpoint or new dependency.
- Added minimum resend cooldown and specific email-quota guidance. These do not
  alter server quotas or claim an exact quota reset time. Template/SMTP setup,
  activation/rollback order and hosted acceptance are documented separately.
- **92 Node tests pass**; **lint 0 errors / 10 existing warnings**; regular guest
  and synthetic-configured builds pass; whitespace clean. Existing large-chunk
  and Vite fixture-port warnings remain.
- Installed SDK + mocked Auth API browser tests passed in production and dev
  StrictMode. Each mode checked 11 layouts (confirmation/reset at five widths,
  phone success). Isolated context B had none of context A's PKCE storage and
  completed one verification + one password update. No verification occurred on
  page load. Duplicate clicks, confirmation mismatch, expired/consumed/wrong-type
  links, server identity mismatch and ordinary cached sessions were checked.
  Legacy PKCE recovery remains supported. No page errors, horizontal overflow
  or unmocked external requests. Guest routes remain explicitly unavailable
  without backend configuration.
- Material limits: Chromium contexts and synthetic responses are not real
  Edge/Chrome, email delivery or hosted acceptance. Supabase template activation,
  confirmed staging access, SMTP/provider/DNS setup, fresh email, old/new-password
  login, Safari and physical devices remain pending. New code alone does not
  upgrade already-sent emails. See `docs/auth-email-setup.md`.

## 28 October 2026 — Illustrated learning icons and navigation refinement

- PT approved adapting the stacked white/blue card illustration from his fourth
  reference across the Home shortcuts, review/saved panel, sidebar and Library.
- Added reusable `LearningIcon` SVG illustrations: filled semantic artwork,
  layered cards, restrained shadows and the existing sky/navy palette. No raster
  assets, external icon service, font download or new app dependency. Decorative
  SVGs stay out of accessible names and use unique React IDs for gradients.
- Updated the five main navigation items, brand/study note and Settings artwork;
  desktop active states have a clearer border/indicator. Sidebar/mobile widths,
  navigation labels, destinations and existing responsive breakpoints remain.
- Home shortcuts/review/saved/study-tip and Library tools/counts use the same
  illustration family. Library grid/list, search, unavailable tools and actual
  local collection counts retain their existing behavior. This is a visual pass,
  not completion of remaining Phrases/helper-screen responsiveness.
- `npm test`: **92 passed**. Lint: **0 errors / 10 existing warnings**. Production
  build passes with the existing large-chunk warning. No new unit tests were
  added for decorative graphics; verification used the existing suite and real
  browser interaction/layout checks.
- Chromium checked 45 layouts: Chinese/Japanese/English Home and Library grid/list
  at 320/375/768/1024/1440. No document/main/nav horizontal or measured text
  overflow; nav targets remain at least 44px, SVG gradient IDs are unique and
  illustrations are decorative. Keyboard navigation, one active destination,
  Settings, course carousel/open, Home shortcuts and Library search/clear/list
  were checked. No page errors or external requests. Safari and physical phones
  remain unverified.
- Recorded the observed hosted Source-editor SMTP lock in the activation guide.
  Hosted email template activation and SMTP/provider/DNS access remain pending;
  UI work did not change hosted Auth configuration or original `main`.

## 28 October 2026 — Remaining existing screens and interaction review

- Preserved PT's accepted blue/navy/white design and illustrated card family.
  Added a shared responsive vocabulary/phrase level overview; rebuilt phrase
  levels on available content and reused the swipe session through a read-only
  phrase adapter. Unavailable levels cannot silently start the first deck.
- Dictionary now uses the shared study frame, responsive result cards and
  readable Burmese/English meanings. Real bookmarks, recent searches and speech
  remain connected to local collections; Dictionary was kept accessible because
  Saved Words depends on it.
- Extracted static inline tool/shared layouts into stylesheets, keeping dynamic
  colors/progress and existing course behavior. Added constrained desktop and
  narrow-phone layouts for writing, radicals, Kana, sounds, topics, example
  notifications and plan previews. Writing uses a container-sized SVG.
- Native modal dialogs unify language selection, radical detail, quizzes and
  Premium preview, including Escape, background inertness and focus restoration.
  Topics are visibly Coming soon, notifications are labelled examples, and plan
  previews do not offer checkout. No new app dependencies or content assets.
- Interaction checks found horizontal touch cancellation inside scrollable card
  faces. Added the gesture policy to the scroll containers themselves; vertical
  long-answer scrolling and horizontal touch drags both pass. Session exit now
  has a reliable parent destination even when opened directly. Repeated clicks
  still advance once and phrase practice never pollutes vocabulary review.
- Enlarged-text review found overlapping mobile nav labels. Labels now wrap with
  a sensible Flash/cards break; a ResizeObserver reserves the bar's actual height
  so final content remains reachable. The accepted default navigation art stays.
- Verification: 95 Node tests pass, lint 0 errors / 8 existing Fast Refresh
  warnings, production build and whitespace checks pass. Three tests cover the
  phrase adapter's level matching, immutable mapping and missing content. Existing
  large-chunk and test-fixture port warnings remain. Production JS is about
  907 kB (270 kB gzip), CSS about 104 kB (16.5 kB gzip); this is not a performance
  acceptance claim.
- Chromium 153: 445 production route/result/empty/modal layouts at five widths
  across three courses, 43 development StrictMode interaction checks, 13 focused
  normal-motion/gesture/settings checks, and 37 navigation/text/reachability
  checks at normal and doubled text size passed. Browser scripts used synthetic
  local guest data and intercepted speech calls; no hosted credentials, real
  email, account mutation or payment operations were involved.
- Existing-screen refinement is not completion of future account/sync/public
  page UI. Hosted acceptance, SMTP, staging preview, Safari/Firefox and physical
  devices remain pending. Main and production deployment are untouched. Detailed
  evidence and limits: docs/ui-checkpoint.md.

## 28 October 2026 — Original brand identity on the responsive UI

- PT asked to retain the improved UI while honoring Htoo's brand identity.
  Compared pre-responsive Home/navigation and pre-refinement Library in Git.
  All ten global color tokens already match the original source exactly.
- Restored original Lucide symbol mappings and tool-specific accent families
  inside the current stacked white-card artwork. Home search is purple,
  Library Dictionary is orange, review is red, saved words green, and helper
  tools retain their original distinct accents. Level accents come from the
  existing course data instead of making every level blue.
- Navigation uses its original Home/Layers/Library/MessageCircle/User icons and
  the mobile Library blue circle; the responsive sidebar, keyboard labels,
  enlarged-text wrapping and measured navigation clearance remain.
- Kept current layouts and session functionality. No Auth, recovery, database,
  dependency, content, environment, hosted setting or main-branch change.
- Validation: 95 tests pass; lint 0 errors / 8 existing warnings; production
  build and whitespace checks pass. Chromium: 105 affected layouts, Library
  search/selected-level navigation, and 37 navigation/text/reachability checks
  pass. Phone Home and desktop Library screenshots reviewed. No new tests for
  decorative art. Safari/physical phones and hosted acceptance remain pending.
