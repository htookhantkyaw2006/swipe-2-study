# Server-Side Account Deletion Foundation (B2.1)

29 October 2026. Prepared on branch `feat/account-deletion-server`.

This document specifies the server-side architecture, API contract, reauthentication protocol, deletion lifecycle, partial-failure recovery, and operator reconciliation procedures for secure account deletion.

---

## 1. Overview & Scope Boundaries

Work Batch B2.1 implements **server-side account deletion only**:
- Password reauthentication on the server using an isolated, non-persisting client.
- Atomic account-row locking protocol (`deleting = true`) that immediately halts client writes, reads, imports, and snapshots across the application.
- Owner-bound Storage cleanup of all avatar files (`avatars/${userId}/*`).
- Administrative deletion of the `auth.users` identity (cascading all foreign keys in database).
- Durable deletion state recording retained after user cascade.
- Safe retries and operator reconciliation procedures.

> **Scope Note:** Client deletion UI (dialog, Profile button, local cache clearing, and frontend routing) is deliberately excluded from B2.1 and belongs to subsequent task B2.2.

---

## 2. API Endpoint & Request/Response Contract

### Endpoint
- **URL:** `POST /functions/v1/delete-account` (or `/api/delete-account`)
- **Headers:**
  - `Authorization: Bearer <user_access_token>` (Required)
  - `Content-Type: application/json` (Required)
- **Request Body (JSON):**
  ```json
  {
    "password": "<learner-password>"
  }
  ```

### Payload Constraints
- **Maximum Request Size:** 4,096 bytes (4 KB). Larger payloads are rejected with `413 PAYLOAD_TOO_LARGE`.
- **Maximum Password Length:** 1,024 characters. Exceeding length is rejected with `400 PASSWORD_TOO_LONG`.
- **Parameter Whitelist:** Only `"password"` is permitted. Any unexpected keys (such as `target_user_id` or `user_id`) cause immediate rejection with `400 UNEXPECTED_PARAMETER`. Target identity is strictly derived server-side from the verified JWT.

### Success Response (`200 OK`)
```json
{
  "success": true,
  "status": "deleted",
  "userId": "11111111-1111-4111-8111-111111111111"
}
```

### Error Response Format
```json
{
  "error": "Actionable English description.",
  "code": "ERROR_CODE",
  "status": "pending"
}
```

---

## 3. Authentication & Reauthentication Rules

1. **Server-Side Identity Verification:**
   - The server validates the caller's JWT token via `client.auth.getUser(token)`.
   - The target owner ID is derived exclusively from `user.id`. The caller cannot target an arbitrary account.
2. **Fresh Password Reauthentication:**
   - Reauthentication is executed through a separate, non-persisting Supabase client (`persistSession: false, autoRefreshToken: false, detectSessionInUrl: false`).
   - The email passed to `auth.signInWithPassword({ email, password })` is taken from the verified JWT user record (`user.email`), never from the caller body.
   - The freshly authenticated user ID returned by Supabase Auth must strictly match the initiating user ID (`IDENTITY_MISMATCH` check).
   - Newly issued session tokens (`access_token`, `refresh_token`) and passwords are never logged, persisted, or returned in HTTP responses.
3. **Attempt Throttling:**
   - A server-side attempt limiter enforces a maximum of **5 failed attempts per user ID within a 15-minute sliding window**.
   - If exceeded, subsequent requests are rejected immediately with `429 RATE_LIMITED` without contacting the Auth service.
   - Successful password verification resets the failed attempt counter.
4. **Provider-Only Accounts (OAuth/SSO):**
   - Accounts without an `email` provider (e.g. Google OAuth only) fail closed with `400 UNSUPPORTED_AUTH_PROVIDER`.
   - The server never bypasses verification or assumes Google reauthentication is implemented.

---

## 4. Deletion Order & Lifecycle Guarantees

The deletion lifecycle executes in strict sequential order:

```
[1. Verify JWT & Reauthenticate Password]
                   │
                   ▼
[2. Lock Account Row: private.account_state (deleting = true)]
    - Transaction commits immediately
    - RLS reads/writes & snapshot/import RPCs blocked instantly
    - Record created in private.account_deletions (status: pending)
                   │
                   ▼
[3. Storage Cleanup: avatars/${userId}/*]
    - Enumerate all objects under userId folder
    - Validate each path matches ownsAvatarPath()
    - Remove avatar objects via admin Storage API
    - Record status: storage_cleaned
                   │
                   ▼
[4. Administrative Auth Deletion: auth.admin.deleteUser()]
    - Delete user from auth.users
    - Triggers ON DELETE CASCADE in PostgreSQL:
        * public.profiles
        * public.user_preferences
        * public.user_items
        * private.guest_import_receipts
        * private.account_state
    - Record status: finalized in private.account_deletions
                   │
                   ▼
[5. Return 200 OK]
```

### Critical Architectural Guarantees
- **No Long-Running SQL Transactions:** Database row locking commits immediately before initiating external Storage or Auth network calls.
- **Relational Cascades Alone Are Insufficient:** Explicit Storage API cleanup removes all avatar objects (including previous/orphaned uploads) because S3/Storage files do not delete on SQL cascade.
- **Durable Retention:** The table `private.account_deletions` has no foreign key to `auth.users`, ensuring the audit trail survives relational cascade.
- **No Automatic Reactivation:** A partially deleted account is never un-marked; it remains `deleting = true` until completed.

---

## 5. Error Codes & Retry Behavior

| Error Code | HTTP Status | Meaning | Retry Behavior |
|---|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing, malformed, or expired Authorization header. | Sign in again to obtain a valid access token. |
| `INVALID_PAYLOAD` | 400 | Missing or non-object JSON body. | Fix client request body format. |
| `UNEXPECTED_PARAMETER` | 400 | Request body contains unexpected keys (e.g. `target_user_id`). | Remove extraneous parameters; only `password` is allowed. |
| `PAYLOAD_TOO_LARGE` | 413 | Body exceeds 4 KB. | Reduce request body size. |
| `PASSWORD_REQUIRED` | 400 | Empty or missing password string. | Provide password for reauthentication. |
| `PASSWORD_TOO_LONG` | 400 | Password exceeds 1,024 characters. | Correct password length. |
| `UNSUPPORTED_AUTH_PROVIDER` | 400 | Account was created via Google OAuth only; lacks password. | Display clear error that provider reauthentication is required. |
| `RATE_LIMITED` | 429 | Exceeded 5 failed attempts in 15 minutes. | Wait 15 minutes before retrying password verification. |
| `INVALID_CREDENTIALS` | 401 | Incorrect password for account email. | Enter the correct account password. |
| `IDENTITY_MISMATCH` | 403 | Reauthenticated user ID did not match JWT caller ID. | Verify session identity. |
| `STORAGE_CLEANUP_FAILED` | 502 | Storage service failed to list or remove avatar files. | Safe to retry immediately. Account remains locked; retry resumes avatar removal. |
| `AUTH_DELETION_FAILED` | 502 | Administrative `deleteUser()` failed. | Safe to retry immediately. Storage is already clean; retry resumes `deleteUser()`. |
| `ACCOUNT_NOT_FOUND` | 404 | Account does not exist or was already deleted. | Treat account as removed. |

---

## 6. Recovery & Lost Response Handling

### Partial Failure Recovery
- **If Storage fails:** The account is already marked `deleting = true` in PostgreSQL. All client writes remain blocked. An authenticated retry re-authenticates and resumes Storage removal.
- **If Auth deletion fails:** Avatar files have already been removed. An authenticated retry skips storage cleanup and proceeds directly to Auth deletion.

### Lost Response Scenario (Network Drop After Auth Deletion)
If the server successfully executes `auth.admin.deleteUser()`, but the client network drops before receiving the HTTP `200 OK` response:
1. The user record in `auth.users` has been deleted.
2. The caller's existing JWT session token is now invalid on Supabase Auth.
3. If the client retries with the same token, Supabase Auth returns `401 UNAUTHENTICATED`.
4. **Guiding Rule:** A generic 401 or missing session is **NOT proof of completed deletion**.
5. The future UI must recognize that if a deletion request timed out / disconnected and subsequent token verification returns 401:
   - Report status as **`unconfirmed`**.
   - Advise the learner: *"Deletion could not be confirmed. Being unable to sign in does not confirm deletion. Contact support for verification."*

### Operator Reconciliation Procedure
If an account deletion is stuck in `pending` or `storage_cleaned` due to an infrastructure outage:
Operators can safely reconcile and finalize the deletion without exposing any anonymous public endpoint:

1. **Using Server Module:**
   ```javascript
   import { reconcilePendingDeletion } from './src/server/accountDeletion.js';
   
   await reconcilePendingDeletion({
     adminClient,
     dbClient,
     targetUserId: '<user-uuid>',
   });
   ```
2. **Inspecting Database Audit State:**
   ```sql
   SELECT * FROM private.s2s_get_deletion_state('<user-uuid>');
   ```
3. **Manual SQL Inspection:**
   ```sql
   SELECT user_id, status, storage_cleaned_at, auth_deleted_at, finalized_at, error, updated_at
   FROM private.account_deletions
   WHERE user_id = '<user-uuid>';
   ```

---

## 7. Environment Variables & Staging Deployment

### Client & Server Environment Variable Names Only (No Secrets)
- `VITE_ACCOUNT_DELETION_ENABLED`: Client capability gate flag (boolean string `'true'`). Disabled by default. Completely independent of `VITE_CLOUD_IMPORT_STAGING`.
- `SUPABASE_URL` / `VITE_SUPABASE_URL`: HTTPS project origin of the Supabase project.
- `SUPABASE_ANON_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY`: Public anon/publishable key for user authentication.
- `SUPABASE_SERVICE_ROLE_KEY`: Privileged secret key for administrative Storage cleanup, Auth deletion, and durable attempt throttling.

> **Security Rule:** `SUPABASE_SERVICE_ROLE_KEY` must exist **only** in server environment variables or Supabase Edge Function secrets. It must **never** be prefixed with `VITE_` or included in frontend bundles.

### Staging Deployment & Verification Prerequisites
1. Apply additive migration `supabase/migrations/20261029000100_account_deletion_foundation.sql` to the staging project.
2. Verify durable throttling table and RPCs:
   ```sql
   SELECT to_regclass('private.account_deletion_attempts') AS attempts_table,
          to_regprocedure('public.s2s_check_deletion_throttled(uuid,integer,integer)') AS check_throttle_rpc,
          to_regprocedure('public.s2s_record_deletion_attempt_failure(uuid,integer,integer)') AS record_throttle_rpc,
          to_regprocedure('public.s2s_reset_deletion_attempts(uuid)') AS reset_throttle_rpc;
   ```
3. Deploy the Edge Function:
   ```bash
   supabase functions deploy delete-account
   ```
4. Verify function secrets:
   ```bash
   supabase secrets list
   # Ensure SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are set.
   ```
5. Enable the client gate for staging testing in `.env`:
   ```bash
   VITE_ACCOUNT_DELETION_ENABLED=true
   ```

### Local Tooling Validation & Remaining Validation Gaps
- **Local Automated Testing:** 256 Node/PGlite tests pass locally (11 database & lifecycle tests, 12 server reauth tests, 13 client coordination & dialog tests).
- **Edge Function Verification:** Entry point (`supabase/functions/delete-account/index.js`) and imports verified via Node syntax check, Oxlint, and Vite SSR bundling.
- **Validation Gap (Recorded):** Docker daemon is not active on this host, and Deno is not in Windows system PATH. Therefore `supabase functions serve` (local Docker container) and hosted deployment were not executed locally. Staging Edge Function execution remains to be validated upon staging deployment.

---

## 8. Remaining Limitations

- **Provider Reauthentication:** Google OAuth / Apple / SAML reauthentication is not supported in this version; provider-only accounts receive `UNSUPPORTED_AUTH_PROVIDER` and cannot be deleted via password.
- **Hosted Tests Not Performed:** No migrations were applied to live Supabase hosts, no live accounts were deleted, and no hosted JWT roundtrips were executed in this local work batch.

