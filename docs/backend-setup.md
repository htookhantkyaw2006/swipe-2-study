# Staging backend setup

## Current state

Base source: origin/main at 96bd017. Development branch: feat/backend-foundation.
The client reports Supabase dashboard access and business email
admin@swipe2study.com. DNS, mailbox and SMTP access are not verified here.

This workspace has no project connection or credentials configured. No migration
has been applied to the client's hosted database. The app remains local-only.

Local storage ownership is now implemented (see development-log.md). Guest keys
stay unchanged; a future verified Auth session can select an isolated user cache.
There is no Auth coordinator or guest import yet, so the running app is still a
guest. This does not demonstrate cloud sync or a completed account feature.

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

Auth must live above StorageOwnerBoundary (and therefore above CourseShell).
Only select a private cache after restoring/verifying the actual account; block
private page rendering during that transition. Wire safe guest import separately
before claiming guest preservation in cloud accounts. Keep db.js synchronous
and add online background sync; do not claim existing guest progress is synced.
