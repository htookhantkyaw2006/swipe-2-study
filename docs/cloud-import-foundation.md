# Cloud guest-import foundation checkpoint

28 October 2026. Prepared against `7f1034d`. This is a reviewed local migration,
RPC transport and record-conversion layer, **not an activated cloud import UI**.
The currently delivered app continues using device-only guest import. No hosted
SQL, Auth setting, account data, deployment or production branch was changed.

## Scope and progress

Phase 1 includes a one-time cloud guest import and an appropriate account snapshot
restore at sign-in. Ongoing online learning sync belongs to the following work.
The device-only implementation alone does not finish that Phase 1 requirement.

This checkpoint provides:

- `public.user_items`, stable server-derived item keys, user ownership, timestamps,
  revisions, RLS reads and cascading relational deletion;
- `public.s2s_account_snapshot(p_expected_user_id)`;
- `public.s2s_import_guest(p_expected_user_id, p_request_id,
  p_expected_reset_version, p_source_fingerprint, p_choice, p_items)`;
- private per-request receipts for idempotent retry, atomic import and lifecycle
  locking; no global account-level imported flag;
- pure guest-record preparation, snapshot conversion and verified SDK transport;
- the separate user-reported automatic-offer timing fix.

Next, before activating cloud UI: inspect/apply the migration in confirmed staging,
implement durable owner-bound request storage and retry reconciliation, integrate
cloud offers with the existing local decision history, and implement conflict-safe
snapshot hydration. Test two real accounts/devices. This checkpoint deliberately
does not replace a newer local cache with a cloud snapshot or clear guest data.

## Safe staging application

Migration: `supabase/migrations/20261028000100_guest_import_foundation.sql`.
It requires the existing `20261027000100_backend_foundation.sql` schema/policies.
Do not rerun that first migration or reset a project to install this one.

In the confirmed staging SQL environment, inspect existing objects first:

```sql
select to_regclass('private.account_state') as lifecycle,
       to_regclass('public.profiles') as profiles,
       to_regclass('public.user_items') as items,
       to_regclass('private.guest_import_receipts') as import_receipts;
```

If the new objects already exist, reconcile their definitions and migration
history; do not overwrite/drop them. Review a staging backup and the complete new
migration before applying it. It is transactional and fails on conflicting objects
rather than silently changing them. Record the successful migration in the chosen
CLI/dashboard workflow. No `service_role` key belongs in the browser or Git.

After application, verify RPC grants and two-user behavior through the real SDK,
not by pasting the tests' simplified Auth/Storage fixture into hosted Supabase.
The existing main/Vercel demo stays separate from this feature branch.

## Server ownership and request contract

Both RPCs derive the owner from `auth.uid()` and reject an absent/mismatched
`p_expected_user_id`. The expected ID is a guard against a request selecting a new
SDK session token during an account switch; it never selects a writable owner.
Both reject missing/deleting account state. Public/anon execution is revoked.
Authenticated users may read only their own active rows; they cannot directly
insert/update/delete learning rows or inspect private receipts/helper functions.

The RPCs are security-definer functions because they enforce private lifecycle
state and controlled writes that the caller cannot access directly. They use an
empty search path, qualified application objects, explicit Auth checks and narrow
execution grants. Never grant public/anon access or remove the expected-ID check.

Import locks the owner's `private.account_state` row `FOR UPDATE`, and snapshot
locks it `FOR SHARE`. Future reset/deletion/learning-write RPCs must participate in
the same account-lock protocol. PGlite tests do not establish real multi-connection
lock contention or hosted JWT verification.

The complete import is one database transaction, including its receipt. Malformed
records or capacity failures roll back earlier rows. The request UUID is scoped
to the account and bound to the complete canonical request by a server hash.
Replaying the same UUID/body returns the prior receipt without rewriting items;
reusing it for a changed body/choice fails. Another device uses its own UUID, so
an earlier import does not disable future device imports.

`reset_version` is checked **before** receipt lookup. Old retries cannot resurrect
data after a reset. Reset/deletion operations themselves are not implemented by
this migration. Snapshot/reset/revision values use decimal strings in the API,
avoiding JavaScript integer precision loss. Client timestamps are clamped to
1970..server-now for imported history/drill conflict comparison; imports never
create server-confirmed study events or streak activity.

## Records, stable identity and merge policy

Kinds: saved words, review cards, search history, written characters, radical,
kana and sound progress. `zh`/`ja` are the agreed learning courses; accepting legacy
`en` records preserves existing data without adding a new course/tool to scope.
Flashcard seeds, settings, language preference and Auth data are not imported.

The server derives a SHA-256 key from language, kind, normalized written form and
reading. It normalizes NFC, case and the explicit Unicode whitespace set while
retaining tone marks/distinct readings. Non-word identities have no reading.
Random device IDs cannot become identity/ownership/revision columns. The client
converts results back to existing DB row shapes with the server key as the ID.

- Saved/review conflicts retain existing account details.
- Drill conflicts keep the higher seen count; equal seen uses the later observed
  timestamp. The entire winning counter record is retained. Counters/streaks are
  never summed/maximized independently.
- Search history retains the newest ten per language, case-normalized by identity.
- Account-only accepts an empty item list and writes only its decision receipt.
- `added_count`/`updated_count` refer to retained distinct rows, including history
  trimming, not duplicate input/upsert attempts.

The builder excludes explicitly marked sample/demo records. A `seeded` course
provenance flag alone never discards a real bookmark/review. Unmarked legacy
sample fixtures still need an audited mapping before activation; guessing by word
text would discard real user bookmarks. Unknown timestamps fall back to epoch
rather than beating equally-seen account progress by pretending to be new.

Limits: 5,000 items / 2 MiB JSON per request, 16 KiB JSON details per item, 20,000
records / 4 MiB combined details/text per owner. PostgreSQL's serialized-byte check
is authoritative. Larger sources fail intact rather than partially publishing.
These are application bounds, not advertised provider quotas.

## JavaScript transport and activation boundary

`buildCloudImportItems(tables)` and `cloudSnapshotTables(snapshot)` are pure
conversion helpers. `prepareCloudImportRequest(...)` creates a JSON-serializable
owner-bound request envelope with a stable UUID. The future caller must durably
persist the exact request **before sending** and reuse it after lost responses or
reloads. It must not replace its UUID/payload while outcome is unconfirmed.

`submitCloudImport(client, { request, expectedUserId, isCurrent })` and
`readCloudSnapshot(client, { expectedUserId, isCurrent })` reverify `getUser()` and
the live SDK session. Every await is generation/owner guarded. The transport pins
a request copy before awaiting, checks response ownership/version/UUID/source/
counts, and exposes a receipt only after exact acknowledgement. A network loss or
late account switch after sending remains **unconfirmed**, not “not saved”.

Neither helper writes local storage, applies a snapshot, selects an owner, clears
guest data or auto-retries. A returned snapshot must not be blindly passed into
`db.setFor`: it may be older than current local activity, and a multi-key partial
save can fail. Hydration needs a reviewed dirty-record/reset-generation protocol
and an atomic effective-cache commit. The existing local import receipt must not
be mistaken for cloud completion or prevent offering a genuine cloud import.

Cloud activation must also update the UI's device/cloud copy and reconcile local
drill conflict rules with the server contract. Until then the existing popup and
success messages correctly continue to say **device-only / no cloud sync**.

## Validation and remaining checks

PGlite runs actual PostgreSQL functions/RLS with simplified managed schemas. Tests
cover atomic rollback, stable identities, retries/receipt binding, subsequent
device imports, progress/history rules, two-user isolation, spoofed owners,
counter/details validation, direct-write restrictions, reset/deletion blocking,
precise versions and relational cascades. Separate tests use the installed
Supabase SDK against intercepted Auth/RPC responses. No real cloud call is made.

Hosted migration application, real JWT/PostgREST behavior, separate-connection
lock races, durable request storage, conflict-safe hydration, orphan/file cleanup
and actual cross-device acceptance remain pending. See development-log.md for
this checkpoint's final local test results. This is not “Phase 1 complete”.

Final local evidence: 196 Node tests pass, lint zero errors/eight existing
warnings, production build and whitespace check pass. The 20 new database tests
and 14 record/transport tests use actual PostgreSQL or the installed SDK with
synthetic responses. Eight focused Chromium checks verify the separate automatic
offer timing fix. No broad production-scale or hosted result is inferred.

Primary references used during implementation:
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://www.postgresql.org/docs/16/functions-binarystring.html
- https://www.postgresql.org/docs/16/datatype-json.html
