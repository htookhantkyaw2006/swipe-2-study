# Sign-Out Event Coordination Architecture

## Overview
This document records the root cause analysis, architectural resolution, fail-safe guarantees, and verification suite for coordinating local (`signOut`) and global (`signOutGlobal`) sign-out completion with the Supabase Auth SDK's synchronous `SIGNED_OUT` event.

---

## 1. Root Cause Analysis

### Background
In `src/lib/authCoordinator.js`, operations are guarded by a monotonic sequence counter (`generation`). When an operation begins, it captures `opGen = nextGeneration()`. Upon asynchronous completion, the operation verifies `isCurrent(opGen)`: if `generation !== opGen`, the operation concludes that the user session or authentication state changed concurrently and discards or rejects the result with:
```
Error: Account changed during sign out.
```

### Defect Mechanism
1. When `coordinator.signOut()` or `coordinator.signOutGlobal()` was called, it advanced `generation` to `opGen` and called `client.auth.signOut({ scope })`.
2. Supabase Auth SDK (`@supabase/auth-js`) internally clears local storage session and synchronously emits `_notifyAllSubscribers('SIGNED_OUT', null)` *before* returning or resolving the `signOut()` promise.
3. The coordinator's `onAuthStateChange` subscription immediately received the `SIGNED_OUT` event and called `nextGeneration()`, incrementing `generation` past `opGen`.
4. When `client.auth.signOut` resolved `{ error: null }` (or `{ error: sdkError }`), the resumed `signOut()` method evaluated `!isCurrent(opGen)`.
5. Because `generation` had advanced during the SDK's own synchronous event emission, `isCurrent(opGen)` evaluated to `false`.
6. This produced two critical failures:
   - Successful local and global sign-out was falsely reported to callers and UI as `Error: Account changed during sign out.`.
   - In global sign-out where remote session revocation failed on the server (e.g., network disconnect or remote rejection), the actual SDK error was masked and hidden behind the false account-change error.

---

## 2. Architectural Solution

### In-Flight Sign-Out Registration
`createAuthCoordinator` maintains an internal `activeSignOut` descriptor:
```javascript
let activeSignOut = null;
```
When `signOut({ scope: 'local' })` or `signOutGlobal({ scope: 'global' })` is initiated:
```javascript
const opGen = nextGeneration();
const currentSignOut = { opGen, scope: 'local', signedOutGen: null };
activeSignOut = currentSignOut;
resetToGuest(null);
```

### Generation Coordination
The helper `isSignOutCurrent(signOutOp)` determines whether an in-flight sign-out remains valid:
```javascript
function isSignOutCurrent(signOutOp) {
  if (!signOutOp || signOutOp !== activeSignOut) return false;
  if (generation === signOutOp.opGen) return true;
  if (signOutOp.signedOutGen !== null && generation === signOutOp.signedOutGen) return true;
  return false;
}
```
- If no events occurred during the call, `generation === signOutOp.opGen` (valid).
- If the SDK emitted `SIGNED_OUT`, `signedOutGen` records the exact post-event generation: `generation === signOutOp.signedOutGen` (valid).
- If an intervening event occurred (e.g. Account B signed in, or a new verification began), `generation` differs from both `opGen` and `signedOutGen`, causing `isSignOutCurrent` to return `false`.

### Coordinated Event Listener
Inside `onAuthStateChange`:
```javascript
if (event === 'SIGNED_OUT') {
  const isMatchingSignOut = Boolean(
    activeSignOut && (generation === activeSignOut.opGen || generation === activeSignOut.signedOutGen)
  );
  if (activeSignOut && !isMatchingSignOut) {
    // A stale in-flight sign-out from a previous session must not disrupt current session
    return;
  }
  const eventGen = nextGeneration();
  if (isMatchingSignOut) {
    activeSignOut.signedOutGen = eventGen;
  }
  resetToGuest(null);
  return;
}
```

### Safe Teardown & Cleanup
In both `signOut()` and `signOutGlobal()`, a `finally` block ensures that `activeSignOut` is released:
```javascript
finally {
  if (activeSignOut === currentSignOut) {
    activeSignOut = null;
  }
}
```

---

## 3. Guarantees & Edge Cases

| Scenario | Behavior | Guarantee |
| :--- | :--- | :--- |
| **Normal Local Sign-Out** | SDK emits `SIGNED_OUT` -> resolves `{ error: null }` | Returns `{ error: null, confirmedLocal: true }`. Owner reset to guest. Caches preserved. |
| **Normal Global Sign-Out** | SDK emits `SIGNED_OUT` -> resolves `{ error: null }` | Returns `{ error: null, confirmedLocal: true, remoteConfirmed: true }`. |
| **Global Sign-Out Remote Failure** | SDK emits `SIGNED_OUT` -> resolves `{ error: sdkError }` | Reports actual `sdkError` without masking. Returns `{ confirmedLocal: true, remoteConfirmed: false, guidance }`. Does not claim all-device success. |
| **Local Sign-Out Failure / Exception** | SDK returns error or network throws | Local session ends (guest). Actual error returned with `{ confirmedLocal: true }`. |
| **External `SIGNED_OUT` Event** | Event received with no `activeSignOut` | Immediately resets coordinator state and storage owner to guest (`nextGeneration()`). |
| **In-Flight Session Verification Race** | Verification pending when `signOut` called | Verification's captured `opGen` is invalidated immediately by `nextGeneration()`. Late session never restored. |
| **Account Switch Race** | Account B signs in while Account A `signOut` in flight | Generation advances for Account B. Account A completion sees `!isSignOutCurrent`, reports account changed, and preserves Account B without error leakage. |
| **Learning Data Cache Preservation** | Any sign-out sequence | All user and guest caches in `storageOwner` remain byte-identical. |

---

## 4. Test Verification

The dedicated test suite `tests/signOutEventCoordination.test.js` covers 10 targeted assertions:
1. **Reproduction 1**: Local `signOut` succeeds with `{ error: null }` when SDK emits `SIGNED_OUT` before resolving.
2. **Reproduction 2**: Global `signOutGlobal` succeeds with `{ error: null }` when SDK emits `SIGNED_OUT` before resolving.
3. **Reproduction 3**: Global sign-out emitting `SIGNED_OUT` before SDK error reports actual SDK error and actionable guidance; does not mask with false account change.
4. **Scope Verification**: `signOut()` passes `{ scope: 'local' }`; `signOutGlobal()` passes `{ scope: 'global' }`.
5. **Standard Completion**: Local and global sign-out succeed when SDK does not emit events.
6. **Local Sign-Out Errors**: Surfaces SDK errors and thrown exceptions honestly while maintaining guest ownership.
7. **External Event Handling**: External `SIGNED_OUT` event resets coordinator and storage owner immediately to guest.
8. **Stale Verification Invalidation**: Pending `getUser()` verification cannot restore signed-out account.
9. **Account Switch Protection**: Delayed Account A sign-out cannot displace Account B or leak errors.
10. **Storage Byte Preservation**: Guest and account learning records remain byte-identical before and after sign-out.

All 364 tests across the application suite pass cleanly.
