# Account Request Lifecycle Architecture & Safety Guarantees

## Overview
This document records the vulnerability analysis, architectural fixes, safety invariants, and verification suite for two critical account request lifecycle boundaries:
1. **Account Deletion Authorization & Binding (Checkpoint 1)**: Binding deletion dispatch and authorization strictly to the verified initiating account, preventing cross-account deletion during concurrent session transitions.
2. **Auth Callback Lifecycle & Refresh Resilience (Checkpoint 2)**: Ensuring `/auth/callback` survives routine same-owner verification updates (`TOKEN_REFRESHED`, `USER_UPDATED`) while maintaining fail-closed protection against logout, account replacement, and unmount.

---

## 1. Checkpoint 1: Binding Deletion to the Initiating Account

### Background & Threat Model
In account-based multi-user or shared-device environments, a user may confirm an irreversible action (such as account deletion) while a background session transition, token refresh, or account switch is occurring. If the client does not bind authorization strictly to the identity that initiated the confirmation dialog, an asynchronous account switch could result in the wrong account being deleted.

### Confirmed Defect & Root Cause
1. In `src/lib/accountDeletionClient.js`, `sendDeletionRequest` accepted an `initiatingUserId` parameter but relied on `client.auth.getSession()` to obtain the bearer token for HTTP transmission without verifying that `session.user.id === initiatingUserId`.
2. If User A confirmed deletion and an account switch to User B occurred before `getSession()` resolved, `getSession()` returned User B's access token.
3. The client dispatched User B's token to the backend deletion function (`s2s_delete_account`).
4. If both test accounts shared the password entered in the confirmation modal, the backend server authenticated User B and deleted User B.
5. Although the client subsequently checked whether the server response confirmed deletion of User A, that check was too late: User B had already been permanently deleted on the database.
6. Furthermore, if `getSession()` returned an error alongside stale cached session data, the code previously continued and dispatched the deletion request.

### Architectural Fix & Safety Guarantees
- **Fail-Closed Session Lookup**:
  `sendDeletionRequest` explicitly inspects `sessionRes.error`. If `sessionRes.error` is present or `sessionRes.data?.session?.access_token` is missing, the request fails closed immediately (`status: 'unauthenticated'`) without making any network call to the server.
- **Session Identity Validation**:
  The session user ID must match `initiatingUserId`. If `session.user.id !== initiatingUserId`, dispatch is blocked with `status: 'error', code: 'OWNER_MISMATCH'`.
- **Independent Token-Specific User Verification**:
  Before dispatching the request, the client captures `capturedToken = session.access_token` and independently verifies it with `client.auth.getUser(capturedToken)`. The verified user ID returned by `getUser(capturedToken)` must match `initiatingUserId`. If token verification returns an error, throws an exception, or returns a different user, dispatch is aborted with zero HTTP requests.
- **Pre- and Post-Authorization Generation Guards**:
  The caller provides an `isCurrent` predicate that checks both the coordinator generation and the active user ID. `sendDeletionRequest` checks `isCurrent()` at four distinct points:
  1. Before calling `getSession()`.
  2. After `getSession()` resolves.
  3. After `getUser(capturedToken)` resolves.
  4. Immediately before `fetcher` dispatch.
- **Clean Request Body**:
  The HTTP request body contains only `{ password }`. The caller-selected target parameter is omitted, and authorization is established solely via `Authorization: Bearer ${capturedToken}`.
- **Controller & UI Integration**:
  In `createAccountDeletionController`, `deleteAccount` captures `initiatingGen = authCoordinator.captureGeneration()` and checks `isOperationCurrent()` before and after network execution. In `src/pages/Profile.jsx`, `handleDeleteAccount` similarly checks `isOperationCurrent()` to prevent UI dialog execution after concurrent account changes.

---

## 2. Checkpoint 2: Auth Callback Lifecycle & Refresh Resilience

### Background & Lifecycle Mechanics
The `/auth/callback` route coordinates the completion of Supabase PKCE and OAuth (including Google) authentication flows. In a single-page application, Supabase SDK automatically inspects URL parameters (`detectSessionInUrl: true`) and exchanges the one-time authorization code. The centralized `authCoordinator` listens to `onAuthStateChange` and re-verifies session authenticity using `getUser()` before selecting private storage caches.

### Confirmed Defect & Root Cause
1. `src/pages/AuthCallback.jsx` captured `mountGen = captureGeneration()` on initial mount.
2. It guarded both `inspectAuthCallbackSession(auth)` completion and router navigation with `isCurrent(mountGen)`.
3. In `src/lib/authCoordinator.js`, routine internal session events—specifically `TOKEN_REFRESHED` and `USER_UPDATED`—increment `generation` via `nextGeneration()`.
4. If a routine token refresh or user profile update occurred for the *same* verified owner (Account A) while `inspectAuthCallbackSession` was pending, `generation` advanced from 1 to 2.
5. Consequently, `isCurrent(mountGen)` evaluated to `false`.
6. `setCallbackCheck({ pending: false, error })` was dropped, leaving `callbackCheck.pending` permanently `true`.
7. The navigation effect also evaluated `isCurrent(mountGen)` to `false`, permanently blocking `navigate(returnTo)`.
8. The component was frozen indefinitely on `"Verifying your account…"` until hitting the 10-second timeout, even though Account A was fully verified.
9. An identical control without `TOKEN_REFRESHED` reached the intended destination immediately.

### Architectural Fix & Safety Guarantees
- **Durable Initiating Owner Binding**:
  `AuthCallback` captures `initiatingUserIdRef = useRef(user?.id || null)` on mount. If `user` is non-null at mount (or upon first verified settlement), it binds to that account ID. To prevent cross-mount redirection leaks, it durably records `sessionStorage.setItem('s2s_callback_owner', boundId)`.
- **Same-Owner Verification Resilience**:
  Instead of requiring strict scalar equality on `mountGen`, `isLifecycleValid` permits completion if the active session is a verified, same-owner continuation:
  ```javascript
  const isSameOwner = Boolean(
    boundUserId &&
    current.user?.id === boundUserId &&
    !current.isGuest &&
    !current.isTransitioning
  );
  ```
  Routine `TOKEN_REFRESHED` and `USER_UPDATED` events for Account A satisfy `current.user.id === boundUserId` and allow callback resolution and navigation to proceed smoothly.
- **Fail-Closed Teardown on Account Switch, Logout & Transition**:
  `isLifecycleValid` strictly fails closed (`return false`) when:
  1. The user logs out or enters guest state (`!current.user || current.isGuest`).
  2. The account is replaced by another user (`boundUserId && current.user.id !== boundUserId`).
  3. The coordinator is actively transitioning between accounts (`current.isTransitioning === true`).
- **Protection Against Stale Redirects on Newer Accounts**:
  If User A starts a callback with `returnTo=/secret-a` and User B logs in (replacing User A), the callback fails closed. Stale callback results for User A cannot redirect User B.
- **SDK Sole Ownership**:
  `inspectAuthCallbackSession` remains the sole coordinator of the SDK's initialization check (`auth.initialize()`) and session retrieval (`auth.getSession()`). No manual code exchanges or duplicate auth clients are introduced.
- **Safe Return Path Preservation**:
  `safeReturnPath` continues to sanitize `returnTo`, preventing open redirects and auth loops.

---

## 3. Verification & Safety Matrix

| Scenario | Checkpoint 1 Guard (Deletion) | Checkpoint 2 Guard (Callback) | Outcome |
| :--- | :--- | :--- | :--- |
| **Normal Verified Flow** | Captured token matches `initiatingUserId` | `isLifecycleValid` is true | Operation succeeds; navigates to `returnTo` |
| **Same-Owner `TOKEN_REFRESHED`** | N/A | `user.id === boundUserId` matches; generation advanced | Survives refresh; navigates to `returnTo` |
| **Same-Owner `USER_UPDATED`** | N/A | `user.id === boundUserId` matches; generation advanced | Survives update; navigates to `returnTo` |
| **Concurrent Account Switch** | Pre/post checks fail; token user mismatch | `boundUserId !== user.id`; `isTransitioning` true | Zero deletion requests dispatched; callback does not redirect |
| **Concurrent Logout / Guest** | `getSession()` error or missing session | `isGuest: true` or `!user`; fails closed | Zero deletion requests dispatched; callback does not redirect |
| **Unmount While Pending** | Operation cancelled via `isCurrent` | `cancelled = true` aborts async callback | Clean unmount; zero state updates or navigation |
| **Initialization / PKCE Error** | N/A | `inspectAuthCallbackSession` returns error string | Actionable error screen displayed with retry controls |

---

## 4. Mocked vs. Browser/Hosted Verification Breakdown

### 1. Mocked Verification (`node:test` in Node.js)
- **`tests/accountSafetyDeletion.test.js`**:
  5 comprehensive unit and lifecycle tests simulating:
  - Account B active session during Account A deletion operation (0 HTTP dispatches).
  - Stale session data with session error (0 HTTP dispatches).
  - Captured token verification returning User B or error (0 HTTP dispatches).
  - Account switch during token verification (0 HTTP dispatches).
  - Stable verified Account A succeeding with exactly the captured token.
- **`tests/accountSafetyCallback.test.js`**:
  6 unit and SSR tests validating `AuthCallback` rendering, actionable error UI, and `authCallbackState` state transitions under token refresh, user update, logout, and in-flight transitions.

### 2. Real Browser Verification (`tests/runBrowserAccountSafety.mjs` & Headless Chrome/Edge)
- Executes in real headless Chrome / Microsoft Edge on the host OS.
- Mounts the actual React 19 component tree via `createRoot` inside a real DOM container (`<div id="root">`).
- Executes actual React `useEffect` hooks, `useSyncExternalStore` coordinator subscriptions, and `react-router-dom` `MemoryRouter` navigations.
- Validated all 7 browser lifecycle cases:
  1. `successful-control-no-refresh` (navigated to `/library`).
  2. `same-owner-token-refreshed` (survived refresh, navigated to `/library`).
  3. `same-owner-user-updated` (survived update, navigated to `/library`).
  4. `initialization-failure-visible` (rendered error alert with actionable buttons).
  5. `logout-during-verification-fail-closed` (halted navigation on logout).
  6. `account-replacement-fail-closed` (halted navigation when User B replaced User A).
  7. `unmount-while-pending-clean` (unmounted cleanly without unhandled rejections).

### 3. Hosted / Staging Considerations
- **Single PKCE Code Exchange**: In hosted Supabase environments, authorization codes are strictly one-time-use. Inspecting `auth.initialize()` without calling duplicate `exchangeCodeForSession()` is required to avoid `AuthPKCECodeVerifierMissingError` or `flow_state_not_found`.
- **Same-Browser Requirement**: PKCE requires the code verifier stored in `localStorage` during initial sign-in to be present when the callback URL is opened. The actionable error UI correctly instructs users to open confirmation links in the same browser and profile.
