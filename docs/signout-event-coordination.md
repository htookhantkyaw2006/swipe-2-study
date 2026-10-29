# Sign-Out Event Coordination Architecture

## Overview
This document records the root cause analysis, architectural resolution, fail-safe guarantees, boundary follow-up findings, and verification suite for coordinating local (`signOut`) and global (`signOutGlobal`) sign-out completion with the Supabase Auth SDK's event lifecycle.

---

## 1. Root Cause Analysis

### Background
In `src/lib/authCoordinator.js`, operations are guarded by a monotonic sequence counter (`generation`). When an operation begins, it captures `opGen = nextGeneration()`. Upon asynchronous completion, the operation verifies `isCurrent(opGen)`: if `generation !== opGen`, the operation concludes that the user session or authentication state changed concurrently and discards or rejects the result with:
```
Error: Account changed during sign out.
```

### Initial Defect Mechanism
1. When `coordinator.signOut()` or `coordinator.signOutGlobal()` was called, it advanced `generation` to `opGen` and called `client.auth.signOut({ scope })`.
2. Supabase Auth SDK (`@supabase/auth-js`) internally clears local storage session and synchronously emits `_notifyAllSubscribers('SIGNED_OUT', null)` *before* returning or resolving the `signOut()` promise.
3. The coordinator's `onAuthStateChange` subscription immediately received the `SIGNED_OUT` event and called `nextGeneration()`, incrementing `generation` past `opGen`.
4. When `client.auth.signOut` resolved `{ error: null }` (or `{ error: sdkError }`), the resumed `signOut()` method evaluated `!isCurrent(opGen)`.
5. Because `generation` had advanced during the SDK's own synchronous event emission, `isCurrent(opGen)` evaluated to `false`.
6. This produced two critical failures:
   - Successful local and global sign-out was falsely reported to callers and UI as `Error: Account changed during sign out.`.
   - In global sign-out where remote session revocation failed on the server (e.g., network disconnect or remote rejection), the actual SDK error was masked and hidden behind the false account-change error.

---

## 2. Boundary Follow-Up Defects & Resolutions

### Defect 1: Genuine SIGNED_OUT Dropped During In-Flight Sign-Out
- **Vulnerability**: An early return was previously added when `activeSignOut` was present but its generation differed from the current generation (`activeSignOut && !isMatchingSignOut`).
- **Defect**: If Account A started a slow sign-out, Account B subsequently signed in and verified, and then Account B's session was genuinely revoked (emitting `SIGNED_OUT(null)`), the subscriber dropped the event. Account B remained authenticated and in control of storage ownership despite genuine external revocation.
- **Root Cause**: `SIGNED_OUT(null)` carries no owner ID or operation token. A generation mismatch does not establish that the event belongs to Account A.
- **Resolution**:
  1. Never drop a `SIGNED_OUT` event.
  2. For unattributed events (or generation mismatches), immediately perform a fail-closed synchronous teardown: advance generation (`const eventGen = nextGeneration()`) and select guest storage owner (`resetToGuest(null)`).
  3. Schedule asynchronous reconciliation outside the synchronous event callback using `Promise.resolve().then(...)`.
  4. Query the SDK via `client.auth.getSession()`. If no session exists, the state remains guest. If the SDK still holds a valid session (e.g. for Account B), trigger independent current-session verification via `verifySessionUser(client, eventGen)`.
  5. Account A's late promise completion evaluates `!isSignOutCurrent`, rejects with `Account changed during sign out.`, and is strictly prevented from resetting Account B or leaking errors into Account B's state.

### Defect 2: False Local Confirmation on Failure
- **Vulnerability**: Error and exception handlers previously returned `confirmedLocal: true` unconditionally.
- **Defect**: If the SDK failed *before* removing its stored session tokens (with no `SIGNED_OUT` event emitted, and the stored session still containing Account A), the coordinator falsely reported `confirmedLocal: true` and claimed:
  `"You have been signed out on this device."`
- **Resolution**:
  1. Local session removal is only confirmed (`confirmedLocal: true`) if:
     - The SDK emitted `SIGNED_OUT` during this operation (`currentSignOut.signedOutGen !== null`), OR
     - An independent readback check via `checkLocalSessionRemoved(client, currentSignOut)` confirms `!sessionData?.session?.user`.
  2. If removal is unconfirmed (`confirmedLocal: false`):
     - Do not claim `"You have been signed out on this device."`
     - Return `confirmedLocal: false` (and for global, `remoteConfirmed: false`).
     - Preserve the real SDK error or exception.
     - Provide honest retry guidance: `"Sign-out could not be confirmed on this device. Please try again."`

---

## 3. Architectural Design & Coordination

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

### Local Session Removal Check
```javascript
async function checkLocalSessionRemoved(client, currentSignOut) {
  if (currentSignOut.signedOutGen !== null) {
    return true;
  }
  try {
    if (!client?.auth?.getSession) return false;
    const { data: sessionData, error: sessionErr } = await client.auth.getSession();
    if (sessionErr) return false;
    return !sessionData?.session?.user;
  } catch {
    return false;
  }
}
```

### Coordinated Event Listener
```javascript
if (event === 'SIGNED_OUT') {
  const isMatchingSignOut = Boolean(
    activeSignOut && (generation === activeSignOut.opGen || generation === activeSignOut.signedOutGen)
  );
  const eventGen = nextGeneration();
  if (isMatchingSignOut) {
    activeSignOut.signedOutGen = eventGen;
    resetToGuest(null);
    return;
  }

  // Unattributed SIGNED_OUT event: fail-closed synchronous teardown
  resetToGuest(null);

  // Asynchronous reconciliation outside synchronous callback
  Promise.resolve().then(async () => {
    if (cancelled || !isCurrent(eventGen)) return;
    try {
      const { data: sessionData, error: sessionErr } = await client.auth.getSession();
      if (cancelled || !isCurrent(eventGen)) return;
      if (sessionErr || !sessionData?.session?.user) {
        resetToGuest(null);
        return;
      }
      await verifySessionUser(client, eventGen);
    } catch (ex) {
      if (cancelled || !isCurrent(eventGen)) return;
      resetToGuest(ex.message || 'Session verification failed.');
    }
  });
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

## 4. Guarantees & Edge Cases

| Scenario | Behavior | Guarantee |
| :--- | :--- | :--- |
| **Normal Local Sign-Out** | SDK emits `SIGNED_OUT` -> resolves `{ error: null }` | Returns `{ error: null, confirmedLocal: true }`. Owner reset to guest. Caches preserved. |
| **Normal Global Sign-Out** | SDK emits `SIGNED_OUT` -> resolves `{ error: null }` | Returns `{ error: null, confirmedLocal: true, remoteConfirmed: true }`. |
| **Global Sign-Out Remote Failure (Established Removal)** | SDK emits `SIGNED_OUT` -> resolves `{ error: sdkError }` | Reports actual `sdkError` without masking. Returns `{ confirmedLocal: true, remoteConfirmed: false, guidance }`. Does not claim all-device success. |
| **SDK Failure Before Removal (Local or Global)** | SDK fails before token removal; no `SIGNED_OUT`; session remains | Returns `{ error, confirmedLocal: false, guidance }`. Does not claim device sign-out. Real error preserved with retry guidance. |
| **Genuine External Revocation During Pending Sign-Out** | Account B revoked while Account A sign-out in flight | Synchronous reset to guest. Reconciliation confirms no SDK session. Coordinator and storage owner remain guest. |
| **Late Unattributed Event With Valid Session** | Unattributed event while SDK still has valid B session | Fail-closed temporary guest. Outside synchronous callback, reconciliation queries `getSession()` and re-verifies Account B via `getUser()`. |
| **Account Switch Race** | Account B signs in while Account A `signOut` in flight | Generation advances for Account B. Account A completion sees `!isSignOutCurrent`, reports account changed, and preserves Account B without error leakage. |
| **Learning Data Cache Preservation** | Any sign-out sequence | All user and guest caches in `storageOwner` remain byte-identical. |

---

## 5. Mocked vs. Actually Verified Boundaries

### What is Mocked in Automated Tests
- **Supabase Auth Client**: `client.auth.getSession`, `client.auth.getUser`, `client.auth.onAuthStateChange`, and `client.auth.signOut` are deterministic mocks to control asynchronous event ordering, network latency, thrown errors, and session token presence.
- **Remote Supabase Auth Server**: HTTP network round-trips to the hosted GoTrue backend are mocked to allow isolated, reproducible unit testing without live network dependencies or credential configuration.

### What is Actually Verified
- **AuthCoordinator State Machine**: Complete verification of generation increments, snapshot immutability, synchronous owner transitions, listener notifications, and cleanup teardown.
- **StorageOwner Partitioning**: Verification that local storage reads and writes are strictly partitioned per owner (`owner:uuid` vs. `owner:null` for guest) and that all keys and learning records remain byte-identical before and after sign-outs.
- **Race Condition & Attribution Boundaries**: Verification that generation guards prevent late promise resolutions or errors from displaced accounts, and that genuine revocation is never suppressed due to an older pending operation.
- **API Return Shape Integrity**: Strict assertion of `confirmedLocal`, `remoteConfirmed`, `error`, and `guidance` fields under all success and failure matrices.

---

## 6. Test Suite Status

1. `tests/signOutEventCoordination.test.js`: 10/10 passing tests.
2. `tests/signOutBoundaryFollowUp.test.js`: 8/8 passing tests.
3. Full Application Regression Suite: 372/372 passing tests across all modules.
