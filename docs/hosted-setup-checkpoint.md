# Hosted Setup Checkpoint

**Date:** October 31, 2026<br>
**Status:** Verified Test Backend, Resend SMTP, Google Auth & Preview Checkpoint<br>
**Branch:** `fix/release-readiness-pass`

---

## 1. Overview & Backend Scope

This document records the verified hosted infrastructure checkpoint for Swipe 2 Study across Supabase, Resend, Google Cloud, and Vercel.

- **Current Supabase Project:** `olwicxljwfemgrsbobtg`
- **Environment Classification:** Current **test backend** containing synthetic test accounts and development data.
- **Production Status:** A dedicated, isolated Production Supabase project remains **pending**. Staging credentials and test data must not be promoted or reused for production without clean project provisioning and official cutover.

---

## 2. Hosted Database Migrations

PT manually applied the ten migrations following `20261027000100_backend_foundation.sql` in strict filename order through `psql`:

1. `20261028000100_guest_import_foundation.sql`
2. `20261029000100_account_deletion_foundation.sql`
3. `20261029000200_account_deletion_attempt_reservation.sql`
4. `20261029000300_online_sync_foundation.sql`
5. `20261029000400_learned_words_sync.sql`
6. `20261029000500_study_streaks_yangon.sql`
7. `20261029000600_sync_progress_hardening.sql`
8. `20261030000100_content_publication_foundation.sql`
9. `20261030000200_content_publication_hardening.sql`
10. `20261030000300_consistent_publication_reads.sql`

All 11 repository migrations are present in the test backend database schema. These migrations were applied directly to PostgreSQL via `psql`; no claim is made that Supabase CLI migration history (e.g. `supabase_migrations.schema_migrations`) was recorded or tracked in the database.

---

## 3. Schema & Access Control Status

### Application Tables (16 Total)
Row-Level Security (RLS) is enabled on all 16 application tables across public and private schemas:

- **Public Schema (8 tables, all RLS enabled):**
  - `public.profiles`
  - `public.user_preferences`
  - `public.courses`
  - `public.vocabulary`
  - `public.user_items`
  - `public.user_item_tombstones`
  - `public.user_study_streaks`
  - `public.user_study_activity`
- **Private Schema (8 tables, all RLS enabled):**
  - `private.account_state`
  - `private.guest_import_receipts`
  - `private.account_deletions`
  - `private.account_deletion_attempts`
  - `private.sync_mutation_receipts`
  - `private.learning_reset_receipts`
  - `private.content_stages`
  - `private.content_publication_history`

### Remote Procedure Calls (RPCs)
Eleven checked public RPCs were inspected in the test backend database catalog:

- **Callable by Authenticated Role (`authenticated = true`):**
  1. `public.s2s_account_snapshot`
  2. `public.s2s_import_guest`
  3. `public.s2s_apply_mutations`
  4. `public.s2s_reset_learning`
  5. `public.s2s_get_study_streak`

- **Privileged / Restricted Functions (`authenticated = false`):**
  6. `public.s2s_begin_account_deletion`
  7. `public.s2s_reserve_deletion_attempt`
  8. `public.s2s_stage_course_content`
  9. `public.s2s_publish_staged_content`
  10. `public.s2s_rollback_course_content`
  11. `public.s2s_get_course_content_status`

- **Anonymous Access:**
  `anon = false` for all eleven checked functions (none are granted to the `anon` role).

> **Access Control Note:** The six `authenticated = false` functions are restricted server-side or owner operations (such as the account deletion Edge Function executing with `service_role` authority or curriculum release workflows). They are intentionally not exposed to the client `authenticated` role, and client access must not be broadened to grant them privileged access.

---

## 4. Current Hosted Infrastructure & Verification Status

### Verified Infrastructure & User-Reported Flows
1. **Resend Custom SMTP:**
   - Sending subdomain `auth.swipe2study.com` is verified in Resend.
   - Supabase custom SMTP configuration is active.
   - Password reset email delivery followed by successful login has passed manual user testing.
2. **Google OAuth Provider:**
   - Google provider is configured in Supabase Auth.
   - Google login flow using the user's Lamduan email has passed manual user testing.
3. **Core App Journeys:**
   - Email/password login passed manual user testing.
   - Guest vocabulary and progress merge into authenticated account passed manual user testing.
   - Saving words to personal collection passed manual user testing.

### Crucial Boundaries & Unverified Items
> [!IMPORTANT]
> The successful user checks above confirm basic auth, email delivery, and single-session local/cloud merge.
> **They do NOT prove background cloud sync, cross-account isolation, or account deletion:**
> - **Account Deletion Edge Function has NOT been deployed:** The function `supabase/functions/delete-account` has not been deployed to project `olwicxljwfemgrsbobtg`.
> - **Vercel Preview Environment Variable Scoping:** Environment variables were scoped in Vercel specifically to preview branch `fix/deployment-config-readiness`. New branches (including `fix/release-readiness-pass`) do not inherit them automatically unless configured in Vercel (**Settings -> Environment Variables -> Preview** scope).

---

## 5. Edge Function Deployment & Gateway JWT Guidance

### Signing-Key Verification (Action for PT)
In Supabase Dashboard -> **Project Settings -> API -> JWT Settings / JWT Keys**:
- Check whether project `olwicxljwfemgrsbobtg` uses **Symmetric (HS256)** or **Asymmetric (ECC / ES256 / RS256)** signing keys.
- **If HS256:** Deploy with standard gateway verification:
  ```bash
  supabase functions deploy delete-account
  ```
- **If Asymmetric (ES256) or if Gateway blocks preflight OPTIONS:**
  The Supabase gateway may reject ES256 tokens with `401 Invalid JWT` or block browser CORS preflight. If this occurs, deploy with:
  ```bash
  supabase functions deploy delete-account --no-verify-jwt
  ```
- **Security Guarantee:** Server-side caller authentication and password reauthentication are **never bypassed**. The function code in `src/server/accountDeletion.js` independently verifies the Bearer JWT via `userClient.auth.getUser()` and reauthenticates the account password before executing any deletion or database mutation.

### Required Server Secrets
```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<staging-service-role-key>" ALLOWED_ORIGINS="https://s2-s-anti-gravity-3739ky7ll-htookhantkyaw2006-9042s-projects.vercel.app"
```

### Third-Party / Google-Only Accounts Handling
- **Limitation:** Self-service deletion via password reauthentication is strictly limited to accounts with an email/password identity.
- **Behavior:** Accounts created solely via third-party OAuth (e.g. Google-only) fail closed on the server with `400 UNSUPPORTED_AUTH_PROVIDER`.
- **UI Presentation:** The frontend `DeleteAccountDialog` inspects account provider metadata; for Google-only accounts, it displays an explicit informational notice (*"Password reauthentication is not supported for accounts signed in with a third-party provider (such as Google). Self-service account deletion is unavailable for this account in this version. Please contact support if you need assistance deleting this account."*) and disables password submission.

---

## 6. Two-User / Two-Browser Manual Acceptance Runbook

To establish verified proof of cross-account isolation, learning reset, and account boundaries, PT should execute this sequence:

### Setup
- **Session 1 (Browser A):** Standard browser window on Device/Profile A.
- **Session 2 (Browser B):** Separate browser profile or Incognito on Device/Profile B.
- Both sessions point to the active preview URL.

### Test Sequence
1. **Guest Isolation:**
   - In Browser A, learn 3 words and bookmark 2 cards in Guest mode.
   - In Browser B, open the app in Guest mode.
   - *Verification:* Browser B shows 0 saved cards (guest records remain strictly local to Browser A).
2. **Account A Registration & Guest Merge:**
   - In Browser A, register a new disposable account `user-a@example.com`.
   - Confirm guest import offer dialog. Complete import.
   - *Verification:* `user-a` sees all 3 learned words and 2 bookmarks in collection.
3. **Account B Isolation:**
   - In Browser B, sign in as second disposable account `user-b@example.com`.
   - *Verification:* `user-b` has zero saved items, zero streak, and default preferences. `user-a` data is completely invisible.
4. **Preferences Persistence & Independence:**
   - In Browser A (`user-a`), change theme to dark, speech rate to 0.75x, and active language to Japanese. Reload page.
   - *Verification:* Browser A preserves settings. Browser B (`user-b`) remains on its own independent preferences.
5. **Learning Export & Reset:**
   - In Browser A (`user-a`), navigate to Settings/Profile -> Export Learning Data.
   - *Verification:* Downloads valid JSON file containing `user-a`'s items and streak history.
   - In Browser A (`user-a`), click Reset Learning Progress -> Confirm with `RESET`.
   - *Verification:* `user-a`'s learned items are reset to zero. Profile and account remain signed in.
   - *Cross-Check:* Refresh Browser B (`user-b`); verify `user-b` is completely unaffected.
6. **Account Deletion (Email/Password):**
   - In Browser A (`user-a`), click Delete Account.
   - Submit incorrect password -> Verify error alert; session preserved.
   - Type `DELETE` and correct password -> Submit.
   - *Verification:* Client returns to guest mode with success banner. Attempting login as `user-a` fails with invalid credentials.
7. **Google-Only Account Boundary:**
   - In Browser B, sign in using Google account.
   - Open Profile -> Delete Account.
   - *Verification:* Dialog shows explicit third-party provider notice; password input is disabled; no unauthenticated or broken requests sent.

---

## 7. Content Handoff: Loading Client-Approved Curriculum

To load official, client-approved HSK1 or JLPT N5 vocabulary, use the verified content pipeline.

### Prerequisites & Credentials
Set operator environment variables:
```bash
export SUPABASE_URL="https://olwicxljwfemgrsbobtg.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<staging-service-role-key>"
```
*(Client-facing `VITE_*` keys are strictly rejected for write operations).*

### Input CSV Schema & Templates
Templates are located at:
- `tools/content-csv/templates/hsk1-template.csv`
- `tools/content-csv/templates/n5-template.csv`

Required CSV headers (all 11 columns required in exact order):
```csv
id,course_id,language,level_id,written_form,reading,meaning_english,meaning_burmese,audio_path,examples_json,sort_order
```

**Column Rules:**
- `id`: Alphanumeric identifier, max 64 characters (e.g. `zh-hsk1-001`, `ja-n5-001`).
- `course_id`: Strictly `zh-hsk1` or `ja-n5`.
- `language`: Strictly `zh` or `ja`.
- `level_id`: Strictly `HSK1` or `N5`.
- `written_form`: Hanzi or Kanji/Kana. **Natural identity key** (cannot be altered after publication).
- `reading`: Pinyin with tone marks for Chinese; Kana for Japanese. **Natural identity key**.
- `meaning_english`: English definition, max 255 chars.
- `meaning_burmese`: Burmese definition, max 255 chars. (At least one meaning must be provided).
- `audio_path`: Relative path under audio assets (e.g. `audio/zh/hsk1/001.mp3`), no leading `/` or `..`.
- `examples_json`: Valid JSON array of up to 3 sentence objects: `[{"sentence":"...", "reading":"...", "translation":"..."}]`, or `[]`.
- `sort_order`: Integer between 1 and 32767.

### Step-by-Step Operator Commands
1. **Validate CSV (Offline):**
   ```bash
   node tools/content-csv/content-manager.mjs validate <path-to-approved-content.csv>
   ```
   Confirm output displays `"valid": true` and zero errors.
2. **Dry-Run (Online diff comparison):**
   ```bash
   node tools/content-csv/content-manager.mjs dry-run <path-to-approved-content.csv> --target staging
   ```
   Inspect inserted, updated, unchanged, and retired item counts without modifying the database.
3. **Stage Content:**
   ```bash
   node tools/content-csv/content-manager.mjs stage <path-to-approved-content.csv> --target staging --operator "pt"
   ```
   Copy the returned `stage_id` UUID from the output.
4. **Publish Staged Content:**
   ```bash
   node tools/content-csv/content-manager.mjs publish zh-hsk1 --stage-id <uuid> --target staging --reason "Client-approved HSK1 release"
   ```
   *(Automatically writes a pre-update backup to `./content-backups` before publishing).*
5. **Inspect Status:**
   ```bash
   node tools/content-csv/content-manager.mjs status zh-hsk1 --target staging
   ```
6. **Rollback (if needed):**
   ```bash
   node tools/content-csv/content-manager.mjs rollback zh-hsk1 --to-version <previous_version> --target staging --reason "Revert content typo"
   ```

---

## 8. Exact Next Operator Steps

1. **Vercel Preview Configuration:**
   - Configure preview environment variables in Vercel for the current branch:
     - `VITE_SUPABASE_URL=https://olwicxljwfemgrsbobtg.supabase.co`
     - `VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key>`
     - Optional capability gates: `VITE_ACCOUNT_DELETION_ENABLED=true`, `VITE_CLOUD_IMPORT_STAGING=true`.
   - Redeploy the preview build with cleared build cache.
2. **Deploy Deletion Edge Function:**
   - Set secrets:
     ```bash
     supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<staging-service-role-key>" ALLOWED_ORIGINS="https://s2-s-anti-gravity-3739ky7ll-htookhantkyaw2006-9042s-projects.vercel.app"
     ```
   - Deploy:
     ```bash
     supabase functions deploy delete-account
     ```
   - Test preflight OPTIONS and POST using curl.
3. **Execute Two-User Acceptance Sequence:**
   - Follow the 7-step sequence in Section 6.
4. **Validate & Publish Client-Approved Curriculum:**
   - Follow the 6-step content pipeline in Section 7.
5. **Preserve Production Infrastructure:**
   - Do NOT switch root DNS or Zoho Mail MX records until official production cutover.

---

## 9. Zero-Credentials Compliance

In accordance with repository security policies, this document contains zero passwords, tokens, JWTs, secret keys, or database dump contents.
