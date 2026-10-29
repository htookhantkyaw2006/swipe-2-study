# Authentication Route Readiness & Protected-Route Architecture

## Overview
This document specifies the route matrix, access control boundaries, post-login navigation policies, and open-redirect defenses for Swipe 2 Study (Work Batch B3.2).

---

## 1. Route Matrix & Access Control

| Route Pattern | Component | Classification | Auth Loading (`loading \|\| isTransitioning`) | Verified User | Guest State (`!user`) | Verification Failure | Account Switching |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/` | `Home` | Public / Guest Learning | Gated by top-level `AuthProvider` neutral spinner | Rendered with user context | Rendered with guest learning context | Rendered with guest learning context | Spinner rendered until verified user & owner align |
| `/learn/*` | `Learn`, `LessonPicker`, `ReviewWords`, `SwipeSession` | Public / Guest Learning | Gated by `AuthProvider` | Rendered with user local store | Rendered with guest local store | Rendered with guest local store | Gated by `AuthProvider` spinner |
| `/library` | `Library` | Public / Guest Learning | Gated by `AuthProvider` | Rendered with user local store | Rendered with guest local store | Rendered with guest local store | Gated by `AuthProvider` spinner |
| `/flashcards` | `Flashcards` | Public / Guest Learning | Gated by `AuthProvider` | Rendered with user local store | Rendered with guest local store | Rendered with guest local store | Gated by `AuthProvider` spinner |
| `/flashcards/level/:levelId` | `PhrasesLevel` | Public / Guest Learning | Gated by `AuthProvider` | Rendered with user local store | Rendered with guest local store | Rendered with guest local store | Gated by `AuthProvider` spinner |
| `/flashcards/session` | `PhrasesSwipeSession` | Public / Guest Learning | Gated by `AuthProvider` | Rendered with user local store | Rendered with guest local store | Rendered with guest local store | Gated by `AuthProvider` spinner |
| `/saved` | `SavedWords` | Public / Guest Learning | Gated by `AuthProvider` | Rendered with user local store | Rendered with guest local store | Rendered with guest local store | Gated by `AuthProvider` spinner |
| `/saved/session` | `SwipeSession` | Public / Guest Learning | Gated by `AuthProvider` | Rendered with user local store | Rendered with guest local store | Rendered with guest local store | Gated by `AuthProvider` spinner |
| `/dictionary` | `Dictionary` | Public / Guest Learning | Gated by `AuthProvider` | Rendered with user local store | Rendered with guest local store | Rendered with guest local store | Gated by `AuthProvider` spinner |
| `/interest` | `StudyByInterest` | Public / Guest Learning | Gated by `AuthProvider` | Rendered with user local store | Rendered with guest local store | Rendered with guest local store | Gated by `AuthProvider` spinner |
| `/writing` | `WritingPractice` | Public / Guest Learning | Gated by `AuthProvider` | Rendered with user local store | Rendered with guest local store | Rendered with guest local store | Gated by `AuthProvider` spinner |
| `/radicals` | `LearnRadicals` | Public / Guest Learning | Gated by `AuthProvider` | Rendered with user local store | Rendered with guest local store | Rendered with guest local store | Gated by `AuthProvider` spinner |
| `/kana` | `LearnKana` | Public / Guest Learning | Gated by `AuthProvider` | Rendered with user local store | Rendered with guest local store | Rendered with guest local store | Gated by `AuthProvider` spinner |
| `/sounds` | `LearnSounds` | Public / Guest Learning | Gated by `AuthProvider` | Rendered with user local store | Rendered with guest local store | Rendered with guest local store | Gated by `AuthProvider` spinner |
| `/notifications` | `Notifications` | Public / Guest Learning | Gated by `AuthProvider` | Rendered with user local store | Rendered with guest local store | Rendered with guest local store | Gated by `AuthProvider` spinner |
| `/profile` | `Profile` | Public / Guest Learning | Gated by `AuthProvider` | Full account overview, cloud sync status, edit profile link, sign out & deletion actions | Guest Learner summary, local collection counts, quick settings, sign-in & sign-up CTA links | Displays actionable verification retry banner | Gated by `AuthProvider` spinner |
| `/premium` | `Premium` | Public / Information | Gated by `AuthProvider` | Plan info rendered | Plan info rendered | Plan info rendered | Gated by `AuthProvider` spinner |
| `/settings` | `SettingsSubpage` | Public / Guest Learning | Gated by `AuthProvider` | Settings rendered | Settings rendered | Settings rendered | Gated by `AuthProvider` spinner |
| `/profile/edit` | `EditProfile` | **Account-Only** | Render neutral connecting state (`Connecting your account…`); no private fields or buttons rendered | Profile editor rendered (`ProfileEditor`) | Redirects to `/login?returnTo=%2Fprofile%2Fedit` via `ProtectedRoute` & `Navigate` | Redirects to `/login?returnTo=%2Fprofile%2Fedit` | Gated by `ProtectedRoute` & `AuthProvider` spinner |
| `/login` | `Login` | Auth Entry | Waits for verification | Automatically redirects to sanitized `returnTo` (default `/`) | Renders login form, preserves safe `returnTo` | Displays error message, allows credential re-entry | Gated by `AuthProvider` spinner |
| `/signup` | `Signup` | Auth Entry | Waits for verification | Automatically redirects to sanitized `returnTo` (default `/`) | Renders signup form, preserves safe `returnTo` | Displays error message | Gated by `AuthProvider` spinner |
| `/forgot-password` | `ForgotPassword` | Recovery Request | Waits for verification | Renders reset request form | Renders reset request form, preserves `returnTo` in back link | Displays error message with cooldown timer | Gated by `AuthProvider` spinner |
| `/reset-password` | `ResetPassword` | Recovery Callback | Waits for verification | Renders password reset form only if `canResetPassword` verified | Shows error alert with link to `/forgot-password` | Shows actionable recovery error message | Invalidates recovery grant immediately on switch |
| `/verify-email` | `VerifyEmail` | Auth Guidance | Waits for verification | Renders verification instructions | Renders instructions, preserves `returnTo` in resend & sign-in links | Displays resend error message | Gated by `AuthProvider` spinner |
| `/auth/callback` | `AuthCallback` | Auth Exchange | Renders verifying spinner | Navigates to sanitized `returnTo` upon verified user & settled transition | N/A (waits for exchange) | Renders error card with actionable buttons: "Go to Sign In", "Resend verification email", "Continue as Guest" | Gated by `AuthProvider` spinner |

---

## 2. Guard Behaviors Across 5 Lifecycle States

1. **Auth Loading (`loading === true`)**:
   - `AuthProvider` gates rendering of entire application tree with top-level neutral spinner.
   - `ProtectedRoute` renders neutral connecting card (`Connecting your account…`) without leaking child account data or flashing empty states.
   - Prevents unverified guest UI from flashing prior to session restoration.

2. **Verified Signed-in State (`user !== null`)**:
   - Direct access permitted to all public, guest, and account-only routes.
   - Navigating to `/login` or `/signup` while authenticated automatically redirects to `returnTo` (safe fallback `/`).
   - `storageOwner` is strictly aligned with `user.id`.

3. **Guest State (`isGuest === true`)**:
   - All learning routes remain 100% functional without backend configuration.
   - Account-only routes (`/profile/edit`) automatically redirect to `/login?returnTo=<current_path>` using `{ replace: true }`.
   - `/login` provides a clear "Continue as Guest" fallback button.

4. **Verification Failure (`error !== null`)**:
   - `authCoordinator` resets to guest namespace (`storageOwner.setOwner(null)`) so unverified sessions cannot access private caches.
   - Surfaces actionable retry behavior:
     - `Profile.jsx` renders `ProfileError` with `retryVerification` button.
     - `AuthCallback.jsx` renders structured error card with 3 user choices: "Go to Sign In", "Resend verification email", "Continue as Guest".
   - Never enters automatic reload or cyclic redirect loops.

5. **Account Switching (`userA` -> `userB`)**:
   - `onAuthStateChange` immediately engages `isTransitioning = true`.
   - `AuthProvider` immediately renders neutral loading spinner until `getUser()` verifies User B and sets `storageOwner.setOwner(userB.id)`.
   - Stale data from Account A is never rendered or accessible to Account B.

---

## 3. Safe `returnTo` Validation & Redirect Loop Defense

Implemented in `src/lib/safeReturnPath.js`:
1. **Control Characters**: Rejects ASCII 0–31 and 127 in both raw and decoded strings.
2. **Backslash Defense**: Rejects literal `\` and URL-encoded `%5c` / `%5C` to prevent browser slash-normalization evasions.
3. **Protocol-Relative URLs**: Rejects `//...`, `///...`, `/\...`, and URL-encoded variants `/%2f...`, `/%2F%2F...`.
4. **Scheme Prefixes**: Rejects all external schemes (`https:`, `http:`, `javascript:`, `data:`, `vbscript:`).
5. **Origin Verification**: Verifies URL parsing against a fixed internal origin `https://safe-origin.internal`.
6. **Auth Loop Prevention**: Pathnames matching any authentication or recovery screens (`/login`, `/signup`, `/auth/callback`, `/verify-email`, `/forgot-password`, `/reset-password`) are strictly normalized to the safe fallback (default `/`).
7. **Safe Fallback**: Any custom fallback passed is itself sanitized through the safe origin and loop check, preventing tainted fallback parameters.
