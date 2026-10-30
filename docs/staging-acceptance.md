# Staging Acceptance & Activation Runbook
_Swipe 2 Study — Work Batch B3.4_

This runbook specifies the step-by-step procedures for validating, migrating, deploying, and acceptance-testing Swipe 2 Study against a dedicated Supabase staging project.

---

## Prerequisites & Local Tooling Status

| Tool / Requirement | Local Host Status | Notes |
| :--- | :--- | :--- |
| **Node.js (v22+) & npm** | Installed ✅ | Test runner (301 tests pass), Vite build, Oxlint |
| **Chromium Browser** | Installed ✅ | Headless browser verification passes |
| **Docker Desktop Engine** | Installed, Stopped ⚠️ | Daemon not running; local Supabase container unavailable |
| **Supabase CLI (`supabase`)** | Not in PATH ⚠️ | Owner must run migration/deploy from CLI-equipped workstation or CI/CD runner |
| **Deno CLI (`deno`)** | Not in PATH ⚠️ | Edge Function local execution not validated in standalone Deno; verified via Node syntax check, Oxlint, Vite SSR, and mock Web Request/Response tests |

---

## Stage 1: Confirm Staging Ownership and Separation from Main/Demo

- **Prerequisite**: Staging project URL and project reference from Supabase Dashboard.
- **Verification Steps**:
  1. Open **Supabase Dashboard** -> Select Project -> **Project Settings** -> **General**.
  2. Note the **Reference ID** (e.g. `abcdefghijklmnopqrst`).
  3. Confirm that the Reference ID does **NOT** match the production project or demo project reference.
  4. Verify frontend configuration in staging environment (`.env.local` or hosting provider environment settings):
     ```bash
     VITE_SUPABASE_URL=https://<staging-project-ref>.supabase.co
     VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<staging-key>
     ```
     Ensure the publishable key matches the staging project's **API Settings** (never use `sb_secret_*` or `service_role` JWT in frontend).
- **Expected Result**: Distinct staging project confirmed; zero shared credentials or endpoints with production/demo.
- **Stop Condition on Failure**: Project Reference ID matches production or demo. Halt immediately before running any database or Edge Function operations.

---

## Stage 2: Inspect Existing Schema and Migration History (Read-Only)

- **Prerequisite**: Access to Supabase Dashboard **SQL Editor** with administrative role.
- **Inspection Queries**: Run the following read-only queries to determine existing schema state:

```sql
-- 1. Check existing migration records
select version, inserted_at
from supabase_migrations.schema_migrations
order by version;

-- 2. Inspect application schemas
select schema_name
from information_schema.schemata
where schema_name in ('public', 'private', 'storage');

-- 3. Check application tables
select table_schema, table_name
from information_schema.tables
where table_schema in ('public', 'private')
  and table_name in (
    'account_state', 'profiles', 'user_preferences', 'course_content',
    'user_items', 'guest_import_receipts', 'account_deletions', 'account_deletion_attempts'
  )
order by table_schema, table_name;

-- 4. Check application RPC functions
select routine_schema, routine_name, security_type
from information_schema.routines
where routine_schema in ('public', 'private')
  and routine_name in (
    'is_active_user', 'set_updated_at', 'on_auth_user_created',
    's2s_apply_guest_import', 's2s_get_import_receipt', 's2s_restore_snapshot',
    's2s_begin_account_deletion', 's2s_record_storage_cleaned', 's2s_record_auth_deleted',
    's2s_record_deletion_failure', 's2s_check_deletion_throttled', 's2s_record_deletion_attempt_failure',
    's2s_reset_deletion_attempts', 's2s_reserve_deletion_attempt'
  )
order by routine_schema, routine_name;

-- 5. Check RLS policies
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname in ('public', 'private', 'storage')
  and tablename in (
    'account_state', 'profiles', 'user_preferences', 'course_content',
    'user_items', 'guest_import_receipts', 'account_deletions', 'account_deletion_attempts', 'objects'
  )
order by schemaname, tablename, policyname;

-- 6. Check Storage avatars bucket
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'avatars';
```

- **Expected Result**: A clear inventory of existing tables, functions, and migration versions.
- **Stop Condition on Failure**: Schema drift detected (e.g. existing tables with mismatched columns or incompatible types). Stop and reconcile manually before running any migration.

---

## Stage 3: Review Backup/Recovery and Apply Only Required Migrations

- **Prerequisite**: Stage 2 completed. Staging backup point verified in **Dashboard -> Database -> Backups**.
- **Migration Dependency Order**: Apply only migrations that have not yet been recorded in `supabase_migrations.schema_migrations`:
  1. `supabase/migrations/20261027000100_backend_foundation.sql` (if `private.account_state` or `public.profiles` absent)
  2. `supabase/migrations/20261028000100_guest_import_foundation.sql` (if `public.user_items` absent)
  3. `supabase/migrations/20261029000100_account_deletion_foundation.sql` (if `private.account_deletions` absent)
  4. `supabase/migrations/20261029000200_account_deletion_attempt_reservation.sql` (if `private.account_deletion_attempts.attempt_count` absent)
- **Execution Method**:
  - Via Supabase CLI (if available):
    ```bash
    supabase db push
    ```
  - Via Supabase Dashboard SQL Editor: Paste each unapplied file's exact contents enclosed in `begin; ... commit;`.
- **Expected Result**: Migrations execute cleanly with zero errors. All four migration versions recorded in `supabase_migrations.schema_migrations`.
- **Stop Condition on Failure**: Any SQL error, permission failure, or constraint conflict. Roll back the transaction and do not proceed.

---

## Stage 4: Validate and Deploy Deletion Function with Server-Only Secrets

- **Prerequisite**: Stage 3 completed (both `20261029000100_account_deletion_foundation.sql` and `20261029000200_account_deletion_attempt_reservation.sql` applied). Supabase CLI installed on deploy machine or CI runner.
- **Configuration & Secrets Setup**:
  1. In Supabase Dashboard -> **Project Settings** -> **Edge Functions** -> **Secrets** (or via `supabase secrets set`):
     * Set `SUPABASE_SERVICE_ROLE_KEY` to the staging service role secret.
     * Set `ALLOWED_ORIGINS` to the verified staging preview origin: `https://s2-s-anti-gravity-3739ky7ll-htookhantkyaw2006-9042s-projects.vercel.app` (do not add unverified wildcard `*` or guessed production origins).
     * Note: `SUPABASE_URL` and `SUPABASE_ANON_KEY` are automatically provided by the Supabase Edge runtime (or pass explicitly when running outside managed runtime).
     * ⚠️ **Security Boundary**: Never put `SUPABASE_SERVICE_ROLE_KEY` into frontend `.env` or Git.
- **Deployment Command**:
  ```bash
  supabase functions deploy delete-account
  ```
  *(Note: Standard API Gateway JWT verification is retained. The client contract in `accountDeletionClient.js` passes `Authorization: Bearer <token>`. Do NOT pass `--no-verify-jwt`. The gateway enforces bearer token structure, and the function executes application-level caller identity validation and fresh password reauthentication).*
- **HTTP Boundary Verification (curl)**:
  1. **Test OPTIONS Preflight with Allowlisted Origin**:
     ```bash
     curl -i -X OPTIONS "https://<staging-project-ref>.supabase.co/functions/v1/delete-account" \
       -H "Origin: https://s2-s-anti-gravity-3739ky7ll-htookhantkyaw2006-9042s-projects.vercel.app" \
       -H "Access-Control-Request-Method: POST" \
       -H "Access-Control-Request-Headers: authorization, content-type, apikey, x-client-info"
     ```
     *Expected*: HTTP 200 `ok`, with headers `Access-Control-Allow-Origin: https://s2-s-anti-gravity-3739ky7ll-htookhantkyaw2006-9042s-projects.vercel.app`, `Vary: Origin`, `Access-Control-Allow-Methods: POST, OPTIONS`, `Access-Control-Expose-Headers: Retry-After, Content-Type`.
  2. **Test OPTIONS Preflight with Disallowed Origin**:
     ```bash
     curl -i -X OPTIONS "https://<staging-project-ref>.supabase.co/functions/v1/delete-account" \
       -H "Origin: https://malicious.example.com" \
       -H "Access-Control-Request-Method: POST"
     ```
     *Expected*: HTTP 403 `{"error":"Origin not allowed by CORS policy.","code":"CORS_ORIGIN_DENIED"}` and no `Access-Control-Allow-Origin` header.
  3. **Test Unauthenticated POST**:
     ```bash
     curl -i -X POST "https://<staging-project-ref>.supabase.co/functions/v1/delete-account" \
       -H "Origin: https://s2-s-anti-gravity-3739ky7ll-htookhantkyaw2006-9042s-projects.vercel.app" \
       -H "Content-Type: application/json" \
       -d '{"password":"test"}'
     ```
     *Expected*: HTTP 401 with JSON `{"error":"Authentication header is required.","code":"UNAUTHENTICATED"}` (or gateway 401) with CORS headers matching the allowlisted Origin.
  4. **Test POST with Valid JWT and Wrong Password**:
     ```bash
     curl -i -X POST "https://<staging-project-ref>.supabase.co/functions/v1/delete-account" \
       -H "Origin: https://s2-s-anti-gravity-3739ky7ll-htookhantkyaw2006-9042s-projects.vercel.app" \
       -H "Authorization: Bearer <disposable_user_access_token>" \
       -H "apikey: <staging-anon-key>" \
       -H "Content-Type: application/json" \
       -d '{"password":"wrong-password"}'
     ```
     *Expected*: HTTP 401 `{"error":"Incorrect password.","code":"INVALID_CREDENTIALS","status":"pending"}` and `Vary: Origin`.
- **Stop Condition on Failure**: Preflight returns 405/500; CORS headers missing or wildcard `*` emitted; gateway or function rejects valid tokens; function fails to deploy.

---

## Stage 5: Confirm Email and Redirect Prerequisites

- **Prerequisite**: Stage 1 completed.
- **Supabase Dashboard Configuration**:
  1. **Authentication** -> **URL Configuration**:
     * **Site URL**: `https://<staging-app-url>`
     * **Redirect URLs** (Allowlist):
       - `https://<staging-app-url>/auth/callback`
       - `http://localhost:5173/auth/callback` (for local verification against staging)
  2. **Authentication** -> **Email Templates**:
     * **Confirm signup**:
       ```html
       <h2>Confirm your signup</h2>
       <p>Follow this link to confirm your account:</p>
       <p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup">Confirm your email</a></p>
       ```
     * **Reset password**:
       ```html
       <h2>Reset Password</h2>
       <p>Follow this link to reset your password:</p>
       <p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery">Reset Password</a></p>
       ```
- **Expected Result**: Email templates link to `/auth/callback` with PKCE `token_hash` query parameters. Redirect URLs allowlist includes both staging app and localhost callback paths.
- **Stop Condition on Failure**: Redirect URLs allowlist missing `/auth/callback`; email templates using hash fragments (`#access_token`) instead of `token_hash`.

---

## Stage 6: Enable and Test Cloud Import Separately

- **Prerequisite**: Stages 1-5 completed.
- **Staging Configuration**:
  * Set `VITE_CLOUD_IMPORT_STAGING=true` in staging frontend `.env.local`.
  * Ensure `VITE_ACCOUNT_DELETION_ENABLED=false` and `VITE_GOOGLE_AUTH_ENABLED=false` remain disabled during this stage.
- **Verification Steps**:
  1. Open app in Browser A as Guest. Learn 3 words, bookmark 2 cards.
  2. Navigate to `/signup`, create disposable account (e.g. `import-test@example.com`), verify email.
  3. Upon sign-in, confirm the Guest Import dialog appears offering to import the guest records.
  4. Complete import. Verify items display in `/saved`.
  5. Check database read-only: `select count(*) from public.user_items where user_id = '<user-id>';` matches imported count.
  6. Verify receipt created: `select count(*) from private.guest_import_receipts where user_id = '<user-id>';` equals 1.
  7. Reload recovery: Refresh browser before dismissing dialog. Reconnects and restores snapshot without data duplication.
- **Expected Result**: Guest items imported cleanly into `public.user_items`; receipt acknowledged; subsequent visits restore from snapshot.
- **Stop Condition on Failure**: RLS violation on `user_items`; failure to record import receipt; guest records leaked into another account.

---

## Stage 7: Enable and Test Deletion Using Disposable Accounts Separately

- **Prerequisite**: Stage 6 completed; Disposable test account with saved words and avatar.
- **Staging Configuration**:
  * Set `VITE_ACCOUNT_DELETION_ENABLED=true` in staging frontend `.env.local`.
- **Verification Steps**:
  1. Log into the disposable test account. Upload an avatar in `/profile/edit`.
  2. Navigate to `/profile` -> Click **Delete Account**.
  3. Enter incorrect password -> Verify error message "Incorrect password" and dialog remains open.
  4. Exhaust attempt limiter: Enter wrong password 5 times. 6th attempt must show rate limit warning with countdown timer (429).
  5. Wait for countdown (or test with fresh account). Enter exact confirmation "DELETE" and correct password -> Click Delete.
  6. Verify client transitions to Guest mode with visible banner: "Your account and all associated data have been deleted."
  7. Check database read-only:
     * `select * from auth.users where id = '<disposable-user-id>';` returns 0 rows.
     * `select * from public.profiles where id = '<disposable-user-id>';` returns 0 rows (cascaded).
     * `select * from storage.objects where bucket_id = 'avatars' and name like '<disposable-user-id>/%';` returns 0 rows.
     * `select status from private.account_deletions where user_id = '<disposable-user-id>';` returns `'finalized'` or `'auth_deleted'`.
  8. Verify device cleanup: `localStorage` contains zero keys matching `s2s_user_<disposable-user-id>_*`.
- **Expected Result**: Account, profile, items, and avatars deleted; durable deletion record retained; local client returns to guest.
- **Stop Condition on Failure**: Server returns 500; avatar files remain orphaned in storage; attempt limiter allows unbounded attempts; local cache of another account purged.

---

## Stage 8: Configure and Test Google OAuth Separately

- **Prerequisite**: Stages 1-7 completed. Google Cloud Console credentials created.
- **Setup Steps**:
  1. **Google Cloud Console**:
     * Add `https://<staging-project-ref>.supabase.co/auth/v1/callback` to Authorized Redirect URIs.
  2. **Supabase Dashboard** -> **Authentication** -> **Providers** -> **Google**:
     * Enable Google provider.
     * Enter **Client ID** and **Client Secret**.
     * ⚠️ Never put Client Secret into frontend code or Git.
  3. **Staging Frontend Configuration**:
     * Set `VITE_GOOGLE_AUTH_ENABLED=true` in staging frontend `.env.local`.
- **Verification Steps**:
  1. Open `/login` -> Confirm "Continue with Google" button is visible.
  2. Click button -> Verify redirection to accounts.google.com with correct client ID.
  3. Complete Google sign-in -> Verify redirection to `<staging-app-url>/auth/callback` -> Lands on `/` (or `returnTo`).
  4. Verify user context: Profile shows Google email and display name.
  5. Test cancellation: Click "Continue with Google" -> Cancel or close popup -> Verify button re-enables; no crash.
  6. **Test Deletion Boundary**:
     * On the Google-authenticated account, navigate to `/profile` -> Click **Delete Account**.
     * Attempt deletion with dummy password -> Server responds with 400 `UNSUPPORTED_AUTH_PROVIDER`.
     * UI displays actionable message: *"Password reauthentication is not supported for this account. Accounts using third-party providers cannot be deleted from this version."*
- **Expected Result**: Google OAuth succeeds via PKCE; account cancellation handled gracefully; Google-only accounts cannot delete via password reauth (fails closed).
- **Stop Condition on Failure**: Redirect URI mismatch; client secret exposed in network requests; Google-only deletion permitted without password.

---

## Compact Two-User / Two-Browser Acceptance Checklist

| # | Acceptance Scenario | Expected Behavior | Status |
| :-: | :--- | :--- | :--- |
| **1** | **Guest Data Preservation** | Guest words in Browser A remain private; never visible in Browser B or leaked to newly registered accounts | `[Locally Passed]` (Unit/Browser tests pass; hosted pending verification) |
| **2** | **Signup / Verification / Reset** | User A registers, receives verification link with `token_hash`, verifies email via `/auth/callback`, resets password via recovery flow | `[Owner Setup Required]` (Hosted SMTP & Redirect URLs required) |
| **3** | **Avatar Upload / Replacement** | User A uploads image <= 8 MiB; image resized to <= 512×512 raster <= 1 MiB; previous avatar deleted only after new avatar committed | `[Locally Passed]` (Browser canvas tests pass; hosted Storage upload pending) |
| **4** | **Import Ack & Reload Recovery** | Guest items imported to User A; receipt recorded in `guest_import_receipts`; page reload before completion recovers gracefully | `[Locally Passed]` (PGlite lifecycle tests pass; hosted import RPC pending) |
| **5** | **Snapshot / Local-Deletion Protection** | User A cached data never exposed to User B or Guest; account switch invalidates in-flight operations | `[Locally Passed]` (Transition gating & generation guard tests pass) |
| **6** | **Local / Global Logout** | Local logout removes session on current device; global logout revokes refresh tokens across all devices; guest records intact | `[Locally Passed]` (Auth coordinator tests pass) |
| **7** | **Deletion & Owner-Only Cleanup** | User A deletes account with password; server cascades Auth/DB/Storage; only `s2s_user_<userA>_*` cleared; User B & Guest data intact | `[Locally Passed]` (HTTP boundary & client tests pass; hosted execution pending) |
| **8** | **Real Google Login / Cancellation** | "Continue with Google" redirects to consent screen; PKCE code exchange in `/auth/callback`; popup cancellation re-enables button | `[Owner Setup Required]` (Google Cloud Console & Supabase provider config required) |
| **9** | **Unsupported Google Deletion** | Google-only account attempting deletion receives 400 `UNSUPPORTED_AUTH_PROVIDER`; deletion is blocked safely | `[Locally Passed]` (Reauth & client tests pass; hosted verification pending) |
