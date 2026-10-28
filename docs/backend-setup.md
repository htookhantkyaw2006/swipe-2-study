# Staging backend setup

## Current state

Development branch: `feat/backend-foundation`. PT reports that `main` powers the
existing Vercel demo and must remain separate from this staging checkpoint.

As of 28 October 2026:

- Email/password signup, email confirmation callback, login, session restoration,
  verified account/cache ownership and logout are implemented. PT has reported
  successful configured local-browser checks, including a fresh confirmation
  link and the core UI checks through `195ec0a`.
- This workspace has no backend credentials or confirmed hosted project
  connection. Its browser tests run in explicit guest mode with no Supabase env.
- The hosted migration/policy state has not been independently inspected here.
  The successful local Auth flow does not prove the full schema, profile trigger,
  RLS or Storage setup. Inspect the confirmed staging project before deciding
  whether any migration is pending; do not blindly rerun the foundation SQL.
- GitHub reports Vercel deployment success for `195ec0a`; its check exposes a
  branch preview URL recorded in preview-verification.md. Dashboard access,
  Preview environment values and application access are still unverified. No
  hosted deployment or configuration action has been performed here.
- Learning lists/preferences currently use owner-scoped local caches. The guest
  import flow now integrates explicit device-only decisions, the IDE dialog,
  post-login offers and Profile re-entry. Configured acceptance is pending; see
  guest-import.md. Cloud progress
  sync remains unimplemented. Profile name editing and private avatar upload/removal
  are implemented and tested with simulated SDK/browser responses. PT reports an
  uploaded photo persisted through logout/login; broader hosted acceptance remains pending. See
  profile-editing.md. Custom SMTP, Google sign-in and account deletion remain
  unverified or unimplemented as described in the development log. Password recovery is now
  implemented and simulated locally; see password-recovery.md for callback
  allowlisting and the real-email checks that are still pending.

Follow [preview verification](preview-verification.md) for the next deployment
checkpoint. The client remains Owner of their hosted resources.

The first migration defines profiles, preferences, trusted content tables and a
private avatar bucket. Server-owned account_state reserves deleting/reset_version;
sync/reset RPCs and the deletion Edge Function are separate implementation steps.
Auth deletion cascades relational rows; file cleanup must use the Storage API.

## 1 Confirm staging

Record the staging project dashboard link/reference. The client remains Owner.
Inspect existing application tables, Auth users, buckets and policies before
applying any SQL. If application objects exist, reconcile rather than deleting
or silently overwriting them. Keep production in a separate project.

## 2 Configure local connection

Copy .env.example to .env.local. From staging's Connect panel, set
VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or a legacy anon key).
Run npm run check:backend. This checks configuration only, not connectivity.

Missing backend configuration leaves the guest app usable. Partial/invalid
configuration fails the setup check and build. Vite rejects privileged values
in VITE_ variables. Database passwords, secret keys, service-role JWTs and
personal access tokens stay in secure local/server configuration, never Git.
Publishable keys are browser-visible; RLS and grants still control data access.

## 3 Apply migration

File: supabase/migrations/20261027000100_backend_foundation.sql.

Prefer the Supabase CLI workflow after configuring the confirmed staging project
reference and securely supplying the database password. Preview pending changes.
This migration runs transactionally and fails on conflicting application objects
or an existing avatars bucket instead of overwriting them.

If using the dashboard SQL Editor for initial setup, run the complete file and
record the application. Reconcile the CLI migration history before later pushes;
do not blindly rerun this file. Review a backup before altering an existing
project. Production gets a separate reviewed deployment.

Never copy the tests' auth/storage schema fixtures into hosted Supabase.
Those managed schemas already exist there.

## 4 Hosted verification still required

- Create two real test users and check automatic profile/preferences creation.
- User A can read/update only their own allowed fields; user B's rows and
  server-owned IDs, timestamps and lifecycle flags remain inaccessible.
- Signup metadata cannot grant content administration access.
- Guests can read published course content, not drafts. Learners cannot edit it.
- Upload actual JPEG/PNG/WebP avatars in user-owned folders. Check the private
  bucket, 1,048,576-byte limit, signed reads, overwrite and deletion via Storage.
- A server-marked deleting account cannot read private rows or upload files.
- Test full account cleanup and stale-device writes when the deletion flow lands.

Local PGlite tests cover PostgreSQL rules with simplified managed schemas. They
do not prove hosted JWT verification, email/OAuth, Storage file behavior or sync.

## 5 Next inputs and work

Obtain staging's link/reference and place the project URL/publishable key in local
env. Keep privileged credentials out of chat. Confirm the client content/audio
folder, DNS/mailbox access, Google OAuth, SMTP and production hosting access.

Auth now lives above StorageOwnerBoundary and CourseShell. The coordinator
verifies the user before selecting a private cache and gates private rendering
during account transitions. Keep these boundaries intact. Wire safe guest import separately
before claiming guest preservation in cloud accounts. Keep db.js synchronous
and add online background sync; do not claim existing guest progress is synced.
Imports now use an authoritative account learning document for touched tables;
future sync/export/reset/deletion must use effective table reads and include that
document rather than enumerating legacy per-table storage keys alone.
