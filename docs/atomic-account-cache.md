# Atomic Account Cache Architecture

## 1. Context and Problem Statement

Prior to this fix, tracked learning cache updates on account scopes operated with a split-key architecture:
1. Learning table rows were stored in individual table keys (or inside `s2s_user_<id>_learning_document_v1` via guest import/snapshot restoration).
2. Synchronization state was stored separately under `s2s_user_<id>_cloud_sync_state_v1`.

Because browser storage APIs (`localStorage` / Web Storage) do not provide multi-key ACID transactions, two critical split-brain defects occurred:

### Confirmed Failure A: Database Deletion Reports False Success
- **Reproduction**: When a user deleted a saved word through `createLocalDatabase.remove()`, `trackTableChanges()` attempted to write the deletion tombstone to the legacy sidecar key `s2s_user_<id>_cloud_sync_state_v1`.
- **Defect**: If the metadata write failed (e.g. storage quota exceeded or storage error), the error was swallowed in `trackTableChanges()`, while the empty table had already been written. `localDb.remove()` returned `true`.
- **Impact**: The local row was permanently deleted, but no deletion tombstone was committed. When subsequent cloud sync ran, the word was resurrected from the cloud because the server never received a deletion record.

### Confirmed Failure B: Snapshot Restoration Partially Commits
- **Reproduction**: During account snapshot restoration (`restoreAccountSnapshot()`), `learning_document_v1` was committed first with the restored tables, and then `cloud_sync_state_v1` was updated in a second `setItem` call.
- **Defect**: If the sidecar write threw a quota or device error, the transaction aborted after the table document had already committed.
- **Impact**: Table rows were modified in storage without corresponding synchronization state, leaving the cache in an un-synced state that could trigger duplicated work or split-brain sync loops.

---

## 2. Authoritative Atomic Document Architecture

To eliminate two-key split-brain vulnerabilities, the authoritative storage model consolidates both learning tables and cloud synchronization state into a single document key:

```
s2s_user_<ownerId>_learning_document_v1
```

### Document Schema
```json
{
  "version": 1,
  "revision": 2,
  "tables": {
    "zh_saved_words": "[{\"id\":\"...\",\"phrase\":\"...\"}]"
  },
  "cloudSync": {
    "schemaVersion": 1,
    "ownerId": "11111111-1111-4111-8111-111111111111",
    "resetVersion": "1",
    "lastServerTime": "2026-06-01T00:00:00.000Z",
    "records": {
      "zh:saved_words:苹果:píngguǒ": {
        "status": "dirty",
        "updatedAt": "2026-06-01T00:00:00.000Z"
      }
    },
    "updatedAt": "2026-06-01T00:00:00.000Z"
  },
  "guestImport": {
    "fingerprint": "0000000000000000000000000000000000000000000000000000000000000000",
    "choice": "account-only",
    "decidedAt": "2026-06-01T00:00:00.000Z",
    "handled": {}
  }
}
```

### Guarantees
1. **Single Authoritative Commit**: Every tracked table mutation and snapshot restoration calculates the complete next state and writes `tables` + `cloudSync` in **one atomic `setItem`**.
2. **Sidecar as Best-Effort Mirror**: The legacy sidecar `s2s_user_<id>_cloud_sync_state_v1` is written only as a best-effort compatibility mirror. Any failure writing to the legacy sidecar is ignored and never rolls back the authoritative commit.
3. **No Split State**: A quota or disk write failure during the single authoritative `setItem` leaves the previous document byte-for-byte unchanged.

---

## 3. Fail-Closed Guarantees & Actionable Errors

1. **Fail-Closed on Quota / Device Errors**:
   - If storage throws during `commitLearningDocument`, `localDb.remove()`, `update()`, or `insert()` rethrow an actionable `CacheStorageError`.
   - The method never returns false success (`true`).
   - The table data and metadata remain in their exact pre-mutation state.
2. **Fail-Closed on Metadata Corruption**:
   - If embedded `cloudSync` has an invalid schema, owner mismatch, or malformed JSON, subsequent writes throw immediately and refuse to overwrite data.
   - If embedded metadata is corrupt, `readSyncState()` fails closed and **never** falls back to an obsolete legacy sidecar.

---

## 4. Migration & Backward Compatibility

1. **Read Order**:
   - `readSyncState()` checks `doc.cloudSync` first.
   - If no embedded `cloudSync` exists, it falls back to reading `s2s_user_<id>_cloud_sync_state_v1`.
   - If embedded `cloudSync` is present but corrupt, it reports an error without checking the sidecar.
2. **On-Demand Migration**:
   - On the first tracked write to an account without an existing `learning_document_v1`, existing legacy table keys (`s2s_user_<id>_<table_name>`) and the legacy sidecar (`s2s_user_<id>_cloud_sync_state_v1`) are read and assembled into `learning_document_v1`.
3. **Non-Destructive Retention**:
   - Legacy keys are preserved intact in storage after migration to serve as offline disaster recovery data.
4. **Guest Isolation**:
   - Guest operations remain strictly device-only (`id === null`).
   - Guest data is stored without cloud metadata or account document wrappers.

---

## 5. Storage Resolution Consistency

- All synchronization operations (`restoreAccountSnapshot`) resolve storage via `storageOwner.getStorage()`, falling back to `globalThis.localStorage` only when no custom storage provider is configured.
- Metadata helpers (`recordKey`, `identityOfRow`, `validateSyncState`, `readSyncState`, `persistSyncState`, `recordLocalDirty`, `recordLocalDeletion`, `mirrorSyncStateToSidecar`, `isCloudTable`) are factored into `src/lib/cloudSyncState.js` to prevent circular dependencies between `storageOwner.js` and `cloudSnapshotHydration.js`.

---

## 6. Concurrency Boundaries and Limitations

> [!IMPORTANT]
> A single `localStorage.setItem` call is synchronous and atomic per key within the JavaScript execution thread. However, **`localStorage` is NOT a distributed or cross-tab ACID transaction system**.
>
> To mitigate multi-tab race conditions:
> - `storageOwner.commitLearningDocument()` enforces optimistic concurrency verification via `revision`, `expectedRaw`, and `expectedTables`.
> - If another browser tab or concurrent operation mutates `learning_document_v1` between read and write, the mutation fails closed with `Learning data changed` rather than silently clobbering data.

---

## 7. Follow-Up Review Findings and Hardening

During audit of the atomic cache implementation, four critical defects were identified and resolved:

### Finding 1: Single Authoritative Commit per Restore
- **Defect**: `restoreAccountSnapshot()` called `scope.commitLearningDocument()` and subsequently invoked `persistSyncState()`, which re-serialized and re-wrote `learning_document_v1`, causing two document writes per restore.
- **Fix**: Replaced post-commit `persistSyncState` with `mirrorSyncStateToSidecar()`. Exactly one document write occurs for both changed and up-to-date snapshot restorations.

### Finding 2: Propagation of Authoritative and Legacy Write Failures
- **Defect**: `persistSyncState()` silently swallowed document write errors inside a `try { ... } catch {}` block and proceeded to write the sidecar, masking failures in `recordLocalDirty()` and `recordLocalDeletion()`.
- **Fix**:
  - `persistSyncState()` validates state schema and strictly propagates authoritative write errors.
  - Readback verification checks (`storage.getItem(key) === expected`) ensure unconfirmed writes throw actionable save confirmation errors.
  - Corrupt authoritative documents halt persistence without modifying storage or falling back to the sidecar.
  - When no document exists, legacy sidecar write errors propagate honestly.
  - Sidecar mirror updates only execute after a confirmed authoritative commit.

### Finding 3: Fail-Closed Sync Tracking Detection
- **Defect**: When checking whether an account scope was tracked, errors reading the sidecar were caught and swallowed, causing `isTracked` to evaluate to `false` and silently downgrading to device-only mode.
- **Fix**:
  - Authoritative embedded metadata (`value?.cloudSync`) bypasses sidecar inspection entirely.
  - When sidecar inspection is required, storage read errors propagate immediately and halt the mutation with zero storage writes.

### Finding 4: Scoped Cloud Mutation Tracking & Non-Cloud Tables
- **Defect**: `identityOfRow` was applied indiscriminately to all tables, throwing unsupported format errors when writing device-only tables such as `flashcards` (seeded by `seedCourse()`).
- **Fix**:
  - Cloud mutation tracking is strictly restricted to supported cloud languages (`zh`, `ja`, `en`) and kinds (`saved_words`, `review_cards`, `search_history`, `written_chars`, `learned_radicals`, `learned_kana`, `learned_sounds`) via `isCloudTable()`.
  - Non-cloud tables (e.g. `flashcards`) retain device-only behavior, updating table storage while preserving existing cloud metadata without injecting invalid sync records.

---

## 8. Test Coverage and Fixture Updates

- **`tests/atomicAccountCache.test.js`**:
  - Confirmed Failure A reproduction: `localDb.remove()` with metadata failure throws and leaves table and metadata untouched.
  - Confirmed Failure B reproduction: `restoreAccountSnapshot()` with sidecar failure succeeds via authoritative embedded document.
  - Insert, update, and remove verified with atomic dirty/deleted state transitions.
  - Pre-commit storage failure leaves raw bytes unchanged.
  - Corrupt embedded metadata and owner mismatch fail closed.
  - Legacy sidecar migration preserves legacy recovery keys.
  - Injected storage isolation from global `localStorage`.
  - Multi-owner (Owner A, Owner B, Guest) isolation.
  - Repeated restore passes preserve dirty edits and tombstones.
  - Concurrent modification detection via optimistic concurrency checks.
- **`tests/atomicAccountCacheFollowUp.test.js`**:
  - Exactly one authoritative document write verified for changed and up-to-date restores.
  - Authoritative document write failures propagate in `recordLocalDeletion` and `recordLocalDirty`.
  - Standalone legacy sidecar write failures propagate in `persistSyncState`.
  - Confirmed authoritative commits tolerate sidecar mirror failures.
  - Unconfirmed readback failures throw actionable save confirmation errors.
  - Corrupt authoritative documents halt `persistSyncState` without touching the sidecar.
  - Storage read errors during tracking detection halt mutations with zero storage writes.
  - Authoritative embedded metadata does not read the sidecar.
  - Non-cloud tables (e.g. `flashcards`) succeed on tracked and guest accounts without touching sync records.
- **Fixture Updates**:
  - `tests/snapshotLocalConflicts.test.js` and `tests/cloudIntegrationFollowUp.test.js` pass `cloudTracking: true` when instantiating `createStorageOwner` to test mutation tracking on fresh storage scopes without existing sidecars.
