# Guest Import Retry Consent & Recovery

## Overview

When a learner signs into an account with existing guest learning data on their device, the application offers an explicit choice:
- **`merge`**: Combine guest learning records with the authenticated account in the cloud.
- **`account-only`**: Retain the account's existing cloud data and leave guest records separate on the local device.

During network transmission, an import request may be interrupted or unconfirmed by the server (e.g. transient network loss, server timeouts, or browser termination). This document outlines the durability, consent integrity, zero-item retryability, and storage corruption recovery architecture implemented to ensure guest data is never lost or corrupted.

---

## 1. Immutable Durable Request Envelope

A cloud import request must be durable and immutable across attempts:
- **Storage Key**: `s2s_user_${ownerId}_cloud_import_request_v1`
- **Fields**:
  - `ownerId`: Target account UUID.
  - `requestId`: Idempotency UUID (`crypto.randomUUID()`), generated once and reused across retries.
  - `expectedResetVersion`: Decimal string representing the account's snapshot generation.
  - `sourceFingerprint`: 64-character SHA-256 hash of the guest snapshot source.
  - `choice`: Either `'merge'` or `'account-only'`.
  - `items`: Array of canonical guest items (populated for `merge`, empty `[]` for `account-only`).
  - `state`: Lifecycle state (`not_sent`, `unconfirmed`, `server_acknowledged`, `locally_applied`, `server_rejected`).

### Immutability Guarantees
Once an unconfirmed request is persisted:
1. **No Silent Modification**: The user's original consent (`choice`) and payload cannot be silently substituted or altered.
2. **Identical UUID & Payload**: A retry must resubmit the exact same envelope (`requestId`, `expectedResetVersion`, `sourceFingerprint`, `choice`, `items`).

---

## 2. Multi-Layer Choice Mismatch Enforcement

Learners cannot change their decision on an in-flight or unconfirmed request without first resolving or discarding the pending request. This is enforced across three distinct layers:

1. **User Interface (`GuestImportDialog`)**:
   - When `isRetry` is `true`:
     - If `retryChoice === 'merge'`: The `Merge guest data` button is rendered with retry copy (`Retry merging guest data`) and enabled; the `Use account data only` button is disabled.
     - If `retryChoice === 'account-only'`: The `Use account data only` button is rendered with retry copy (`Retry using account data only`) and enabled; the `Merge guest data` button is disabled.
     - `Decide later` and dialog dismissal (`X`) remain fully functional when `pending === false`.
     - When `pending === true`: All action buttons and dismissals are disabled.

2. **Service Layer (`cloudGuestImportService`)**:
   - In `choose(offer, choice)`:
     ```javascript
     if (prepared.isRetry && prepared.retryChoice && choice !== prepared.retryChoice) {
       throw new Error('Cannot change choice on an unresolved request.');
     }
     ```
   - Throws immediately **before** verifying the account session or dispatching any database RPC (`s2s_import_guest`), guaranteeing **0 import RPCs**.

3. **Durable Executor Layer (`cloudImportDurableRequest`)**:
   - In `executeDurableImport(client, storage, params)`:
     ```javascript
     if (choice && record.choice !== choice) {
       return {
         outcome: 'choice_mismatch',
         error: 'Cannot change choice on an unresolved request.',
         code: 'CHOICE_MISMATCH',
         record,
       };
     }
     ```
   - Independent protection against programmatic or bypassed service calls.

---

## 3. Zero-Item Account-Only Retryability

An `account-only` request deliberately carries `items: []` because no guest items are uploaded to the cloud.

### The Fix
Previously, `cloudGuestImportService.inspect()` determined availability via:
```javascript
status: summary.length ? 'available' : 'nothing-to-import'
```
Because `account-only` has 0 items, `summary.length` was `0`, returning `nothing-to-import` and hiding the dialog, leaving the unconfirmed request orphaned in storage without an explicit path to retry.

Under the updated implementation:
- `inspect()` checks `existingDurable.record?.state === 'unconfirmed'`.
- It sets `status: 'available'`, `isRetry: true`, `retryChoice: existingDurable.record.choice`, and builds `summary` honestly (`[]`).
- The UI displays honest empty summary text (`No records to merge (keeping account data separate).`) without fabricating numbers.
- The learner can click `Retry using account data only` to complete the request and transition the durable state to `locally_applied`.

---

## 4. Durable Storage Corruption & Recovery

If local storage contains corrupted JSON under the durable request key or storage throws access errors:
1. **Preserve Raw Bytes**: `readDurableRecord()` does not clear or overwrite corrupted data (`raw` string is preserved on disk).
2. **No Fallthrough to Fresh Decision**: `cloudGuestImportService.inspect()` checks `existingDurable.error` immediately. If present, it throws with `error.code` (`CORRUPTED_STORAGE` or `STORAGE_UNAVAILABLE`) rather than falling through to inspect local guest data and offering a conflicting new decision.
3. **No Database RPCs**: Zero RPCs are dispatched.
4. **Actionable UI Guidance**: `guestImportController` normalizes known error messages and surfaces safe, actionable error notices without exposing internal SDK stack traces.

---

## 5. Account Switch Isolation

- Durable storage keys are explicitly scoped by owner UUID (`s2s_user_${ownerId}_...`).
- When auth changes or switches between User A and User B, `setAccount()` increments internal operation tokens, invalidating any in-flight inspection or save requests.
- Account B cannot see, read, retry, or submit Account A's durable request.
- `executeDurableImport` and `submitCloudImport` verify that the active session matches `expectedUserId`, preventing cross-account pollution.
