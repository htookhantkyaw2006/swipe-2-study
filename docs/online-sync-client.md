# Client Online Sync Orchestrator

29 October 2026. Prepared on branch `feat/online-sync-client`.

This document specifies the client-side online synchronization orchestrator for saved words and manual review records, including local persistence, pre-transmission request envelopes, concurrency protection, retry semantics, and UI status integration.

---

## 1. Scope & Architecture

The **Client Online Sync Orchestrator** provides reliable, repeat-safe synchronization of learning records between client-side local cache and the Supabase backend.

### In Scope
- Synchronous local reads and writes remain authoritative and non-blocking in `db.js`.
- Durable owner-scoped mutation queue and pending request envelope persisted **before** network transmission.
- In-flight concurrency protection: newer edits occurring during an active sync pass remain pending after older acknowledgements.
- Repeat-safe retry using identical request UUID, generation, and payload.
- Server reset generation handling: detected `RESET_VERSION_CHANGED` invalidates old-generation learning cache and reloads confirmed snapshot without touching other scopes.
- Server tombstone consumption preventing resurrection of deleted items during snapshot restoration.
- Dedicated capability gate (`isOnlineSyncEnabled`), disabled by default and requiring configured Supabase backend.
- Lifecycle provider mounted above the language-remount boundary (`OnlineSyncProvider`).
- Settings status row exposing `local`, `syncing`, `cloud-saved`, `failed`, and `conflict` states plus explicit Retry.

### Out of Scope (Deliberately Excluded)
- Automatic reconnect event listeners or exponential backoff loops.
- Service workers, PWA caching, or offline-first sync engines.
- Progress, streak, or radical/kana aggregates sync (scheduled for subsequent batches).
- Preferences cloud synchronization.
- Hosted migration deployment or live flag changes.

---

## 2. Request Envelope & Pre-Transmission Persistence

To ensure repeatability and guard against page reloads or device crashes during network transit, an immutable request envelope is persisted to storage **before** the network request is initiated.

### Storage Key
`s2s_user_${ownerId}_pending_sync_request_v1`

### Envelope Schema
```json
{
  "schemaVersion": 1,
  "ownerId": "11111111-1111-4111-8111-111111111111",
  "requestId": "99999999-9999-4999-8999-999999999999",
  "resetVersion": "0",
  "mutations": [
    {
      "op": "upsert",
      "language": "zh",
      "kind": "saved_words",
      "written_form": "你好",
      "reading": "nǐ hǎo",
      "client_id": "zh:saved_words:你好:nǐ hǎo",
      "base_revision": "1",
      "observed_at": "2026-10-29T12:00:00.000Z",
      "data": { "english": "Hello" }
    }
  ],
  "itemsSnapshot": {
    "zh:saved_words:你好:nǐ hǎo": {
      "status": "dirty",
      "timestamp": "2026-10-29T12:00:00.000Z"
    }
  },
  "createdAt": "2026-10-29T12:00:00.000Z"
}
```

### Invariant Guarantees
1. **Pre-Transmission Write:** If writing the envelope to storage fails (e.g. storage quota exceeded), network transmission is aborted, and local data is preserved without false success.
2. **Deterministic Retry:** Any unresolved sync pass (interrupted by network drop or page reload) reuses the exact persisted `requestId`, `resetVersion`, and `mutations` array.
3. **Receipt Matching:** The server's idempotency receipts table matches `(user_id, request_id)`. If the request had reached the server before the disconnect, the server returns the cached result (`replayed: true`), which the client applies cleanly.
4. **Post-Commit Clearance:** The pending envelope is cleared from storage **only after** local authoritative learning document updates are successfully committed to disk.

---

## 3. In-Flight Concurrency Protection

A critical failure mode in online synchronization is the "lost local edit" race condition:
1. At $T_1$, item $X$ is dirty.
2. Sync pass begins; envelope captures item $X$ snapshot with timestamp $T_1$.
3. While the request is in flight to the server, the learner edits item $X$ again at $T_2$ ($T_2 > T_1$).
4. Synchronous `db.update` writes the row and advances `syncState.records[X].updatedAt` to $T_2$.
5. Server acknowledges the $T_1$ mutation at revision $R$.

### Resolution Protocol
When applying acknowledgements:
- The orchestrator compares `envelope.itemsSnapshot[X].timestamp` ($T_1$) with current `syncState.records[X].updatedAt` ($T_2$).
- Because $T_1 \neq T_2$, the orchestrator detects an in-flight modification.
- **The record is NOT marked `synced`.**
- It remains `status: 'dirty'`, but records `cloudRevision: R` (the acknowledged server revision).
- The sync pass finishes with status `local` (pending changes remaining), and a subsequent sync pass transmits the newer $T_2$ edit with `base_revision: R`.

---

## 4. Reset Generation & Tombstones

### 4.1. Server Reset Generation (`RESET_VERSION_CHANGED`)
When the server reports `RESET_VERSION_CHANGED`:
1. The pending envelope is discarded (`clearPendingSyncRequest`). Stale mutations are never relabeled or replayed against a new generation.
2. The old-generation learning cache in `learning_document_v1` is cleared (`tables = {}`, `records = {}`).
3. Confirmed cloud snapshot is hydrated for the new reset generation via `restoreAccountSnapshot`.
4. Other scopes (guest storage, other user caches, profiles, preferences, and avatars) remain strictly untouched.

### 4.2. Server Tombstones
During snapshot restoration (`restoreAccountSnapshot`):
1. `snapshot.tombstones` is inspected.
2. If a local row exists that is recorded as a tombstone on the server and is **not** dirty locally, it was deleted on another device.
3. The row is omitted from merged local tables, preventing deleted items from resurrecting.

---

## 5. UI Integration & Settings Wiring

### 5.1. Provider Placement
`OnlineSyncProvider` mounts inside `StorageOwnerBoundary` and **above** `LanguageProvider` in `src/main.jsx`:
```jsx
<AuthProvider>
  <StorageOwnerBoundary>
    <PreferencesProvider>
      <OnlineSyncProvider>
        <LanguageProvider>
          <BrowserRouter>
            <GuestImportProvider>
              <CourseShell />
            </GuestImportProvider>
          </BrowserRouter>
        </LanguageProvider>
      </OnlineSyncProvider>
    </PreferencesProvider>
  </StorageOwnerBoundary>
</AuthProvider>
```
Because it is mounted above `LanguageProvider`, switching the active learning language does not remount the sync lifecycle, cancel in-flight promises, or disrupt the pending mutation queue.

### 5.2. Settings Status Row
Located in `SettingsSubpage.jsx` under `Data & Storage`:
| State | Title | Subtitle | Value | Click Action |
| :--- | :--- | :--- | :--- | :--- |
| `saved` | Cloud sync | All learning data saved to cloud | Cloud saved | None |
| `syncing` | Cloud sync | Saving changes to cloud... | Syncing... | None |
| `local` | Cloud sync | Changes stored on this device | Local only | Manual sync trigger |
| `failed` | Cloud sync | Sync failed · [Error message] | Retry | Explicit `retry()` |
| `conflict` | Cloud sync | Sync conflict · Tap to resolve | Retry | Explicit `retry()` |

---

## 6. Capability Gate (`isOnlineSyncEnabled`)

Defined in `src/lib/onlineSyncGate.js`:
- Controlled by `VITE_ONLINE_SYNC_ENABLED === 'true'`.
- Requires `readSupabaseConfig().status === 'configured'`.
- Defaults to `false`.
- When disabled, unconfigured, or in guest mode:
  - Synchronous `db` reads and writes operate normally on device cache.
  - Zero sync network calls are dispatched.

---

## 7. Automated Test Coverage (`tests/onlineSyncClient.test.js`)

| # | Test Scenario | Verification |
| :--- | :--- | :--- |
| 1 | **Create/Update/Delete Lifecycle** | Validates upsert (rev 1), update (rev 2), and delete (tombstone confirmed). |
| 2 | **Network Failure & Reload** | Verifies envelope persistence, page reload, and retry with exact same request ID. |
| 3 | **In-Flight Mutation** | Edits during transit remain dirty with updated base revision; prevents false saved state. |
| 4 | **Conflict Detection** | Stale revision marked on record; preserves local edit without silent overwrite. |
| 5 | **Reset Version Invalidation** | Server reset wipes old generation and reloads confirmed snapshot; guest/Owner B preserved. |
| 6 | **Account Switch / Logout** | Stale responses in flight when account changes are safely discarded. |
| 7 | **Storage Failure Guard** | Disk quota errors when persisting envelope abort transit; never reports false save. |
| 8 | **Gate & Guest Safety** | Zero network calls when gate is off or owner is guest. |
| 9 | **Controller Status Transitions** | Status flow (`local` -> `syncing` -> `failed` -> `saved`) and language switch ownership. |
| 10 | **BigInt Precision** | Validates 64-bit integer revisions (`> 9007199254740991`) preserved as decimal strings. |
| 11 | **Server Tombstone Hydration** | Reconcile verifies server tombstones prevent resurrecting deleted local items. |

---

## 8. Mocked vs. Hosted Verification

- **Mocked Verification:** `tests/onlineSyncClient.test.js` runs in local Node.js with in-memory storage and mocked Supabase client. It exhaustively validates error cases, timing races, and storage boundaries without external dependencies.
- **Hosted Verification:** Staging verification requires deploying migration `20261029000300_online_sync_foundation.sql` to Supabase and setting `VITE_ONLINE_SYNC_ENABLED=true` in the staging environment.

