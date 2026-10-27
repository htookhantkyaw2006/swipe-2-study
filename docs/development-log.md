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
