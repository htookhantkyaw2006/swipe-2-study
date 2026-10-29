# Local Conflict Preservation During Cloud Snapshot Restoration

## Overview

When a learner signs into an authenticated account, Swipe-2-Study restores and reconciles the account's local cache with the authoritative cloud snapshot (`s2s_account_snapshot`).

This document details the reconciliation invariants and conflict-resolution rules enforced to guarantee that unacknowledged local mutations (edits, creations, and deletions) are never lost, overwritten, or resurrected during repeated snapshot restorations or device-server clock skews.

---

## 1. Invariants & Rules

1. **Snapshot Reception is Not Mutation Acknowledgment**:
   - Receiving a cloud snapshot only informs the client of the current server state.
   - It does **not** confirm that local offline edits have been uploaded or processed by the server.
   - Local rows with unacknowledged mutations must remain marked `dirty` across repeated snapshot restorations.

2. **Unacknowledged Deletions (Tombstones) Win**:
   - When a row is deleted locally, a tombstone (`status: 'deleted'`, `deletedAt: ...`) is recorded in the sync metadata.
   - A cloud item matching this identity must **never** be resurrected, regardless of whether the cloud `updated_at` is earlier than, equal to, or later than the device's `deletedAt` timestamp.
   - The tombstone must be preserved in sync state until explicit two-way synchronization resolves it.

3. **Content-Aware Change Tracking**:
   - Mutations that preserve identity keys (e.g. updating a word's `notes`, `definition`, or study fields while keeping `phrase` and `reading` unchanged) must be tracked as `dirty`.
   - Conversely, rewriting a table without altering row contents must **not** mark unchanged rows `dirty`.

4. **Multi-Owner Isolation & Invariant Preservation**:
   - All local tables and sync states are strictly partitioned by user UUID (`s2s_user_${ownerId}_...`).
   - Synchronous database APIs (`db.insert`, `db.update`, `db.remove`, `scope.setTable`, `scope.getTable`) remain synchronous and unaltered.

---

## 2. Implemented Fixes

### A. Retention of Local Edits & Dirty Metadata Across Repeated Restores (`cloudSnapshotHydration.js`)
- **Before**: `reconcileSnapshotWithLocal` retained the local row if it was dirty or newer, but unconditionally executed:
  ```javascript
  nextRecords[itemKey] = { status: 'synced', cloudRevision: item.revision, updatedAt: item.updated_at };
  ```
  This falsely marked the un-uploaded local mutation as `synced`. On the subsequent restore, the row was no longer considered dirty and was overwritten by the older cloud data.
- **After**: When a local row is retained because it is dirty or has newer local learning, its sync metadata explicitly retains `status: 'dirty'`:
  ```javascript
  if (localIsDirty || (localTime && Date.parse(localTime) > Date.parse(cloudTime))) {
    mergedRows.push(existingLocal);
    nextRecords[itemKey] = {
      status: 'dirty',
      updatedAt: tracked?.updatedAt || localTime || now(),
    };
    continue;
  }
  ```
  The row and its `dirty` status survive across arbitrary numbers of restores.

### B. Prevention of Deletion Tombstone Resurrection (`cloudSnapshotHydration.js`)
- **Before**: Tombstone check evaluated:
  ```javascript
  if (Date.parse(tracked.deletedAt) >= Date.parse(item.updated_at)) { continue; }
  ```
  If cloud `updated_at` was newer than `deletedAt` (due to clock skew or server clock), the item was resurrected into the table and marked `synced`.
- **After**: The tombstone is honored unconditionally:
  ```javascript
  if (tracked?.status === 'deleted') {
    nextRecords[itemKey] = tracked;
    continue;
  }
  ```
  The deleted item remains absent from `mergedRows`, and the tombstone is preserved in `nextRecords`.

### C. Content-Aware Mutation Tracking (`storageOwner.js`)
- **Before**: `trackTableChanges` only mapped `prevKeys` and `nextKeys` by identity (`language:table:written:reading`). If only a note or property was modified, identity membership did not change, so `recordLocalDirty` was never called.
- **After**: Rows are mapped into `prevMap` and `nextMap`. A deep equality helper `rowsEqual(prevRow, row)` compares all properties:
  - If a row is missing from `nextMap`: `recordLocalDeletion` is called.
  - If a row is newly present in `nextMap` or `!rowsEqual(prevRow, row)`: `recordLocalDirty` is called.
  - If `rowsEqual(prevRow, row)` is `true`: no dirty status is recorded, leaving unchanged rows `synced`.

---

## 3. Verification & Evidence

All scenarios are covered by `tests/snapshotLocalConflicts.test.js`:
- **Defect 1**: Local custom note with older timestamp survives 3+ consecutive restores and retains `dirty` status.
- **Defect 2**: Tombstone prevents resurrection across cloud timestamps before, equal to, and after the device timestamp.
- **Defect 3**: Modifying only notes via `scope.setTable()` or `db.update()` sets `status: 'dirty'`, while identical rewrites leave rows `synced`.
- **Owner Isolation**: Owner A data and sync state remain completely untouched when Owner B writes.
- **Cloud Restoration**: Genuine cloud-only additions restore normally with `status: 'synced'`.
