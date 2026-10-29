# Snapshot Recovery Guards: Fail-Safe Restoration & Metadata Integrity

## 1. Problem Context & Defect Analysis

During account snapshot restoration (`restoreAccountSnapshot`) and reconciliation (`reconcileSnapshotWithLocal`), previous implementations exhibited three critical data-loss failure modes when encountering unreadable local learning tables or corrupted sync metadata:

1. **Silent Fallback to Empty Arrays on Corrupt Local Data (`Confirmed Failure 1`):**
   `reconcileSnapshotWithLocal` wrapped JSON deserialization of local tables in a generic `try/catch` and fell back to `localRows = []`. When local learning data was malformed (e.g. truncated JSON or corrupt disk bytes), the reconciliation loop assumed the device had zero local records and allowed incoming cloud items or clean state to effectively wipe or discard pre-existing un-synced entries without warning.

2. **Metadata Overwrite & Data Loss on Corrupt Metadata (`Confirmed Failure 2`):**
   When `s2s_user_<owner>_cloud_sync_state_v1` contained malformed JSON, `readSyncState()` returned `{ state: null, error: 'Storage access error' }`. `restoreAccountSnapshot()` discarded the `error` property and treated `syncState` as `null`. As a consequence, it assumed no dirty tracking existed, allowed cloud items with newer timestamps to overwrite local un-synced edits (such as custom vocabulary notes), replaced the corrupted metadata with a fresh record set, and reported outcome `restored`. The user's un-synced modifications and the corrupt metadata on disk were permanently destroyed.

3. **Silent Overwrite on Storage Adapter Exceptions (`Confirmed Failure 3`):**
   When device storage threw an exception while reading sync state (e.g. storage access restriction or transient driver error), `restoreAccountSnapshot` ignored the failure, evaluated table differences as unchanged, and returned outcome `'up_to_date'`, while failing to track sync statuses properly.

4. **Mutation Metadata Overwrite on Failure:**
   `recordLocalDirty()` and `recordLocalDeletion()` checked `readSyncState()` but ignored any reported error, defaulting `nextState = state || { ... }`. If sync metadata became corrupted, the first local modification or deletion would blow away the existing metadata file with an empty records map instead of failing closed and preserving the bytes for recovery.

---

## 2. Recovery Guards & Invariants

To guarantee data preservation and predictable fail-closed semantics, the following guards have been implemented:

### A. Local Table Parsing & Row Identity Validation
- `reconcileSnapshotWithLocal` validates `localTables` input and delegates string row deserialization directly to `parseLearningRows` from `src/lib/learningDocument.js`.
- If a table cannot be parsed as a valid array of row objects, or contains non-object rows (such as `null` or primitives), it immediately throws:
  ```text
  Error: Stored learning data has an unsupported format. It has been kept for recovery.
  ```
- Every row within every table is validated by `identityOfRow(table, row)`:
  - For `saved_words` and `review_cards`, a non-empty `written` form (`wordOf(row)`) and valid string `reading` are required.
  - For other kinds (`search_history`, `written_chars`, `learned_radicals`, `learned_kana`, `learned_sounds`), the specific field (`term`, `character`, `radical`, `kana`, `sound`) must be a non-empty string.
  - Missing or blank identity fields fail fast with the recovery error.

### B. Strict `readSyncState` Classification
`readSyncState(storage, ownerId)` strictly differentiates among four states:
1. **Genuine Storage Access Errors:** If `storage.getItem()` throws, returns `{ state: null, error: 'Storage access error' }`.
2. **Valid Absent State:** If the key is truly absent (`null` or `undefined`), returns `{ state: null, error: null }` (valid uninitialized sync state).
3. **Empty / Corrupt JSON:** If the value exists but is empty, whitespace, or invalid JSON, returns `{ state: null, error: 'Malformed sync state JSON' }`.
4. **Schema / Owner Validation:** If JSON parses but is not a plain object, has `schemaVersion !== 1`, has an `ownerId` mismatch, or contains a malformed `records` mapping, returns `{ state: null, error: 'Invalid sync state schema' }`.

### C. Fail-Closed Snapshot Restoration (`restoreAccountSnapshot`)
- **Preflight Metadata Guard:** Before invoking cloud RPCs (`s2s_account_snapshot`) or reading local tables, `restoreAccountSnapshot` checks `readSyncState(storage, expectedUserId)`. If an error is returned, it halts immediately and returns:
  ```javascript
  {
    outcome: 'error',
    error: 'Could not verify current sync status. Your local data has been preserved.',
    changesCount: 0,
  }
  ```
  No RPC is executed, no local tables are modified, and no storage keys are altered.
- **Reconciliation & Document Safe-Catch:** Reconciliation is executed inside a safe `try/catch`. If local learning rows or the learning document (`learning_document_v1`) cannot be parsed, restoration catches the error and returns:
  ```javascript
  {
    outcome: 'error',
    error: 'Stored learning data has an unsupported format. It has been kept for recovery.',
    changesCount: 0,
  }
  ```
  Local device caches, raw learning documents, and metadata keys remain completely untouched.

### D. Fail-Closed Mutation Metadata Helpers
- `recordLocalDirty()` and `recordLocalDeletion()` inspect `readSyncState(storage, ownerId)`.
- If an error is detected, they throw an exception:
  ```javascript
  throw new Error(`Could not update sync state: ${error}`);
  ```
  Preventing the overwrite of corrupted sync state on disk and maintaining recovery bytes for debugging or external repair.

---

## 3. Test Coverage Matrix

The dedicated test suite in `tests/snapshotRecoveryGuards.test.js` exercises all confirmed failures and edge conditions:

| Test Name | Target Behavior Verified |
| :--- | :--- |
| `Confirmed Failure 1` | `reconcileSnapshotWithLocal` throws recovery error on broken local row JSON instead of defaulting to `[]`. |
| `Confirmed Failure 2` | `restoreAccountSnapshot` aborts when sync metadata is corrupt, prevents overwriting local notes, prevents corrupt metadata overwrite, and executes zero RPCs. |
| `Confirmed Failure 3` | `restoreAccountSnapshot` stops with outcome `error` when storage adapter throws on metadata read. |
| `Local table format validation` | Rejects non-array JSON, primitives, array with null elements, and rows missing identity fields across all course kinds. |
| `identityOfRow validation` | Verifies required row identity keys and throws recovery error on missing/whitespace fields. |
| `readSyncState classification` | Differentiates storage throws, absent keys, empty strings, whitespace, bad JSON, wrong schemaVersion, owner mismatch, and malformed records. |
| `recordLocalDirty & recordLocalDeletion fail-safe` | Throws on corrupt metadata and leaves corrupted storage bytes unaltered. |
| `recordLocalDirty & recordLocalDeletion absent init` | Correctly creates and persists initial sync state when metadata was legitimately absent. |
| `Local learning data corruption halt` | Restores fail closed when local table rows are malformed, leaving table data and sync keys untouched. |
| `learning_document_v1 corruption halt` | Restores fail closed when local document JSON is malformed. |
| `Zero writes assertion` | Confirms 0 `setItem` and 0 `removeItem` calls occur across storage when recovery guards trigger. |
| `Multi-owner isolation` | Confirms Owner A's corrupt metadata does not block Owner B from reading, restoring, or updating sync state. |

---

## 4. Operational & Regression Evidence

- **Reproduction Tests (`tests/snapshotRecoveryGuards.test.js`):** 12/12 passing (0 failures).
- **Full Test Suite (`npm test`):** 331/331 passing (0 failures).
- **Linter (`npm run lint`):** 0 errors, 8 pre-existing warnings in unrelated UI files.
- **Production Build (`npm run build`):** Built cleanly in ~980ms.
- **Git Boundaries:** Only permitted files touched in `../swipe-2-study-review`; primary workspace `swipe-2-study` and its CSV work remain 100% untouched.
