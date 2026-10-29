# Learning Data Export and Learning Reset

## 1. Overview
This document specifies the architecture, data contracts, and failure handling for **Learning Data Export** and **Learning Reset** across Guest and Verified Account modes in Swipe 2 Study.

---

## 2. Learning Data Export

### Scope & Structure
- **Guest Mode (`scope: "guest"`)**:
  - Exports device-only learning data from `storageOwner.scope(null)` across all supported courses (`zh`, `ja`, `en`).
  - Learning kinds exported: `saved_words`, `review_cards`, `search_history`, `written_chars`, `learned_radicals`, `learned_kana`, `learned_sounds`, `learned_words`.
  - Includes guest preferences and active language.
  - Excludes all auth tokens, credentials, and session data.
- **Verified Account Mode (`scope: "account"`)**:
  - Gated by `isLearningExportResetEnabled()`.
  - Requests a validated cloud snapshot from `s2s_account_snapshot`.
  - **Pending Data Disclosure**: Never silently claims a backup is complete when un-synced device changes exist. Clearly itemizes:
    - `pendingCount`: total dirty or deleted records pending sync
    - `dirtyItems`: uncommitted local modifications
    - `pendingDeletions`: uncommitted local deletions
    - `pendingEnvelope`: active in-flight or retrying sync request metadata
    - `pendingPreferences`: pending preference changes awaiting acknowledgement
  - Provides local effective learning tables and preferences for offline inspectability.
  - On network or validation failure: fails closed with an honest, actionable error; never produces an empty or truncated download.

---

## 3. Learning Reset Contract & Scope

### SQL Implementation Scope (`public.s2s_reset_learning`)
The server reset is executed atomically in PostgreSQL via the security definer function `s2s_reset_learning(p_expected_user_id, p_request_id, p_expected_reset_version)`.

| Resource | Action on Reset | Details |
| :--- | :--- | :--- |
| `public.user_items` | **Deleted** | All cloud learning records across all courses and kinds |
| `public.user_item_tombstones` | **Deleted** | All cloud tombstones |
| `public.user_study_activity` | **Deleted** | Daily activity and action history |
| `public.user_study_streaks` | **Deleted** | Cloud streak tracking records |
| `private.sync_mutation_receipts` | **Deleted** | Idempotency receipts for old mutations |
| `private.guest_import_receipts` | **Deleted** | Guest import records |
| `private.account_state.reset_version` | **Incremented** | Monotonically advances from `generation` to `generation + 1` |
| `public.profiles` | **Preserved** | User profile, display name, and avatar intact |
| `public.user_preferences` | **Preserved** | Audio speed, display options, and active course intact |
| `private.account_state` | **Preserved** | Account row remains active |
| Storage Avatars | **Preserved** | Profile photo files remain untouched |

### Local Cache Scope
Upon server confirmation:
- Authoritative `learning_document_v1` is committed with all learning tables reset to `'[]'`.
- `cloudSync.resetVersion` is updated to the server's new generation, with `records: {}`.
- Local streak cache is reset to 0 days (`todayStudied: false`).
- Stale pending sync envelopes (`s2s_user_${id}_pending_sync_request_v1`) are purged.
- Preferences, avatars, guest learning, and other user account scopes are preserved.

---

## 4. Replay Safety & Failure Recovery

### Durable Request ID
- When an account reset begins, a durable `requestId` UUID is stored in `s2s_user_${id}_pending_learning_reset_v1`.
- If an HTTP or network failure occurs while the request is in flight, retrying re-transmits the **exact same `requestId`**.
- The server checks `private.learning_reset_receipts`; if already processed, it safely replays the receipt with `{ replayed: true }` without advancing `reset_version` twice or erroring.

### Local Cleanup Failure Recovery
- If the server confirms reset but local device storage throws an error (e.g. quota error or disk error), the state transitions to `local_cleanup_failed`.
- The confirmation dialog surfaces a dedicated "Retry local cleanup" action.
- Retrying local cleanup clears device storage directly **without** initiating another server reset RPC.

---

## 5. Capability Gate
- **Flag**: `VITE_ACCOUNT_EXPORT_RESET_ENABLED === 'true'`.
- **Backend**: Requires a configured Supabase backend.
- Disabled by default. When disabled, account cloud export/reset remains unavailable, and guest learning actions operate locally on device.

