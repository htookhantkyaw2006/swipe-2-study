# Cloud Guest-Import and Snapshot Restoration — Staging Activation

29 October 2026. Prepared on branch `feat/account-cloud-integration`.

This document explains how to activate, test, and verify Work Batch B1 (Global Sign-Out, Durable Cloud-Import Requests, Conflict-Safe Snapshot Hydration, and Staging Guest-Import Activation) in confirmed staging environments.

---

## 1. Feature Gate & Environment Variables

Cloud import and cloud snapshot restoration are guarded by an explicit staging feature gate.
By default, the gate is **disabled**, keeping all established device-only guest import behavior 100% intact.

To activate cloud import on staging:

```bash
# In your local staging environment file (.env.local or staging build env)
VITE_CLOUD_IMPORT_STAGING=true
```

### Full Example Environment Configuration (No Secrets)

```env
# Confirmed Staging Supabase Project
VITE_SUPABASE_URL=https://your-staging-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...public-anon-key-only

# Cloud Import Staging Gate (disabled by default; set to true for staging evaluation)
VITE_CLOUD_IMPORT_STAGING=true
```

> **Security Note:** Never include `SUPABASE_SERVICE_ROLE_KEY` or any database password in client environment files or Git. Public anon key and URL only.

---

## 2. Server Prerequisites (Staging PostgreSQL)

Before enabling `VITE_CLOUD_IMPORT_STAGING=true`, verify that the staging Supabase database has applied:
1. `supabase/migrations/20261027000100_backend_foundation.sql` (profiles, private lifecycle, security definers)
2. `supabase/migrations/20261028000100_guest_import_foundation.sql` (`user_items`, `s2s_account_snapshot`, `s2s_import_guest`)

Verify in staging SQL console:
```sql
SELECT to_regclass('public.user_items') AS user_items,
       to_regclass('private.guest_import_receipts') AS receipts,
       to_regprocedure('public.s2s_import_guest(uuid,uuid,numeric,text,text,jsonb)') AS import_rpc,
       to_regprocedure('public.s2s_account_snapshot(uuid)') AS snapshot_rpc;
```

---

## 3. Architecture & Delivered Behaviors

### Checkpoint 1 — Complete Global Sign-Out
- **Centralized Auth coordinator:** `signOutGlobal()` calls `client.auth.signOut({ scope: 'global' })`, and local `signOut()` calls `client.auth.signOut({ scope: 'local' })`.
- **Generation guard:** Both local and global logout advance the coordinator generation immediately (`nextGeneration()`) and check `isCurrent(opGen)` at every asynchronous boundary (handling both returned SDK error objects and thrown exceptions). A delayed logout response or error from Account A can never displace or leak to Account B.
- **Cache isolation & preservation:**
  - Account A's learning cache remains preserved in local storage under `s2s_user_<A>_*`.
  - The active owner is synchronously reset to `null` (guest mode).
  - Guest mode displays only guest-owned records (`s2s_*`).
  - Account A's private records are NEVER visible to guest or Account B.
  - Genuine guest records remain available independently and are never overwritten or deleted.
- **Profile integration:** "Sign out on all devices" button opens `GlobalSignOutDialog` with email/account label, disables concurrent operations, handles both returned SDK error objects and thrown exceptions, and retains actionable retry path on failure.

### Checkpoint 2 — Durable Cloud-Import Requests
- **Persistence before send:** Request UUID, source fingerprint, choice, expected reset version, and payload are written to `s2s_user_<id>_cloud_import_request_v1` before network transmission.
- **Idempotency & Reload Recovery:** Re-executing an unconfirmed or reloaded request reuses the exact same request UUID and payload items.
- **Recovery of unconfirmed & acknowledged states:** An unconfirmed durable request is discovered on reload by the real controller/service and offered for idempotent retry. A server acknowledgement followed by local application failure remains in `server_acknowledged` state (recoverable on subsequent reload) without reporting full completion.
- **Storage failures:** Storage quota or security failure halts execution before calling the network.
- **State machine:** `not_sent` -> `unconfirmed` -> `server_acknowledged` -> `locally_applied` (or `server_rejected`).
- **Reset version change:** If `reset_version` changes on server, old replay is halted and marked rejected; does not auto-regenerate.

### Checkpoint 3 — Conflict-Safe Snapshot Hydration
- **Entry-Point Hydration:** A verified sign-in triggers snapshot restore through `cloudGuestImportService.inspect()` even when there are 0 guest records, the guest dialog never opens, or a pre-existing device-only import receipt exists.
- **3-Way Reconciliation:** Evaluates cloud snapshot against local records and tombstone tracking.
- **Tombstones & DB Deletions:** Deletions through the actual database mutation path (`db.remove`) automatically record local deletion tombstones with timestamps in `s2s_user_<id>_cloud_sync_state_v1`. Deleted items do not resurrect from older cloud snapshots.
- **Newer local learning & Concurrent Edits:** Local edits and offline bookmarks are preserved; cloud older timestamps do not overwrite newer local rows. Concurrent local mutations while snapshot restore is in flight trigger atomic retry without losing local changes.
- **Atomic effective-cache commit:** All tables in `learning_document_v1` are committed together; concurrent edits trigger re-evaluation without partial hydration.
- **Metadata preservation:** Preserves all opaque metadata (including `guestImport`) in `learning_document_v1`.

### Checkpoint 4 — Wire Guest-Import UI Behind Staging Gate
- When `VITE_CLOUD_IMPORT_STAGING=true`: uses `cloudGuestImportService` with cloud-specific notices and server receipts.
- When `VITE_CLOUD_IMPORT_STAGING` is unset/false: uses established device-only service.
- **Sample audit:** Excludes explicit samples (`is_sample: true`, `isSample: true`, `demo: true`) without dropping genuine reviews originating from seeded courses (`seeded: true`).
- **Account data only:** Submits choice receipt with zero items; leaves original guest records intact on device.

---

## 4. Test Environments & Verification Evidence

All automated verification runs across three distinct evaluation harnesses:
1. **In-process PostgreSQL (PGlite):** Runs the staging schema and functions (`s2s_account_snapshot`, `s2s_import_guest`, `user_items`, `receipts`) in `tests/cloudImportDatabase.test.js` validating RLS, unique constraints, and transaction rollbacks.
2. **Mocked Supabase SDK (Node test runner):** Validates the SDK interface contracts, request envelopes, idempotent retries, state machine transitions, tombstone reconciliation, and controller entry points in `tests/cloudIntegrationFollowUp.test.js` and `tests/cloudGuestImportIntegration.test.js`.
3. **Headless SSR Vite Evaluators:** Validates production bundle compilation, module imports, and React SSR rendering in `tests/globalSignOut.test.js`.

### Pending Hosted Verification (Lead Developer / PT Prerequisites)
- **Hosted Supabase Project:** Requires applying migrations `20261027000100_backend_foundation.sql` and `20261028000100_guest_import_foundation.sql` to the hosted staging instance.
- **Live Network / Multi-Client Checks:** Real network latency, physical device touch gesture interactions, and cross-tab multi-connection concurrency in live staging browsers remain subject to hosted PT verification.
- **Account Deletion (Batch B2):** Account deletion is intentionally excluded from B1 and will be implemented in subsequent batch B2.
