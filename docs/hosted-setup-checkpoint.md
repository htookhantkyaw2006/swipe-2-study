# Hosted Setup Checkpoint

**Date:** October 31, 2026<br>
**Status:** Verified Test Backend Checkpoint & Operator Acceptance Runbook<br>
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

### Account & State Baseline Row Counts
Baseline record counts across core user state tables remained exactly 2 each:
- `auth.users`: 2 accounts
- `public.profiles`: 2 rows
- `public.user_preferences`: 2 rows
- `private.account_state`: 2 rows

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
> - **Vercel Preview Environment Variable Scoping:** Environment variables were scoped in Vercel specifically to preview branch `fix/deployment-config-readiness`. New preview branches do not inherit them automatically unless configured in Vercel (**Settings -> Environment Variables -> Preview** scope).

---

## 5. Local Backup & Disaster Recovery Readiness (Historical Checkpoint)

- **Local Database Archive:** A database dump exists locally.
- **Archive Integrity Check:** Inspection via `pg_restore --list` succeeded with valid table definitions, sequences, and RPC signatures.
- **Pending Restore Test:** Actual restore execution into an isolated target test database remains pending.
- **Storage Objects:** Demo avatar object backup in Supabase Storage was intentionally skipped, as avatars were disposable development test fixtures.

---

## 6. Deletion Deployment Guidance & Edge Runtime Status

### Managed vs. Custom Secrets
- **Runtime-Provided Secrets:** In the Supabase Edge Functions runtime, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are automatically injected by the platform.
- **Reserved Prefix Prohibition:** The Supabase CLI and Management API strictly prohibit setting secret names starting with the `SUPABASE_` prefix (`Secret name must not start with the SUPABASE_ prefix.`). Operators **must NOT** run `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...`.
- **Custom Secret (`ALLOWED_ORIGINS`):** The only custom secret required for account deletion is `ALLOWED_ORIGINS` (or `ALLOWED_ORIGIN`). Set it with the active preview origin placeholder:
  ```powershell
  supabase secrets set ALLOWED_ORIGINS="https://<your-active-preview-origin>" --project-ref olwicxljwfemgrsbobtg
  ```
  *(Replace `https://<your-active-preview-origin>` with the exact URL of the Vercel preview deployment being tested, e.g. `https://s2-s-anti-gravity-3739ky7ll-htookhantkyaw2006-9042s-projects.vercel.app`)*.

### Gateway JWT Verification Decision
- **Application-Level Security:** In `src/server/accountDeletion.js`, caller authentication is unconditionally verified in application code via `userClient.auth.getUser()` and fresh password reauthentication against `user.email`. Authentication is never bypassed regardless of gateway settings.
- **Gateway Compatibility Check:**
  - In Supabase Dashboard -> **Project Settings -> API -> JWT Settings / JWT Keys**, inspect whether project `olwicxljwfemgrsbobtg` uses **Symmetric (HS256)** or **Asymmetric (ECC / ES256 / RS256)** keys.
  - If the project uses standard HS256 and Kong passes browser CORS preflight `OPTIONS`, deploy with standard gateway verification:
    ```powershell
    supabase functions deploy delete-account --project-ref olwicxljwfemgrsbobtg
    ```
  - If the project uses asymmetric keys (ES256) and Kong rejects tokens with `401 Invalid JWT`, or if Kong blocks unauthenticated `OPTIONS` preflights before reaching the function, deploy with:
    ```powershell
    supabase functions deploy delete-account --no-verify-jwt --project-ref olwicxljwfemgrsbobtg
    ```
  - *Status:* Because live hosted gateway compatibility has not yet been executed against project `olwicxljwfemgrsbobtg`, the final choice between standard deployment and `--no-verify-jwt` remains **pending operator verification**.

### Native Deno Runtime Status
- **Verification Boundary:** Local automated Node.js tests, syntax checks, and Vite builds do **NOT** prove native Deno or Supabase Edge runtime execution. Standalone `deno` CLI is not installed on the Windows host and local Docker is stopped. Native Deno/Edge runtime execution has not been verified locally and remains **pending hosted deployment**.

### Google-Only Account Deletion Boundary
- Self-service account deletion via password reauthentication requires an email/password identity.
- Accounts created solely via third-party OAuth (e.g. Google-only) fail closed on the server with `400 UNSUPPORTED_AUTH_PROVIDER`.
- In the frontend dialog, provider metadata is inspected (`isOAuthOnly`); for Google-only accounts, the dialog displays an informational notice and disables password submission.
- *Status:* Third-party provider reauthentication remains an **unsupported, explicitly unresolved limitation** in this version.

---

## 7. Two-User / Two-Browser Manual Acceptance Runbook

### Required Frontend Feature Gates
To verify capabilities on the hosted preview, enable the corresponding feature flags in Vercel environment variables:
- `VITE_ONLINE_SYNC_ENABLED=true` (Background online progress sync)
- `VITE_CLOUD_IMPORT_STAGING=true` (Cloud guest import dialog & snapshot sync)
- `VITE_ACCOUNT_PREFERENCES_SYNC_ENABLED=true` (Preferences cloud persistence)
- `VITE_ACCOUNT_EXPORT_RESET_ENABLED=true` (Learning data export and reset)
- `VITE_GOOGLE_AUTH_ENABLED=true` (Google OAuth sign-in)
- `VITE_ACCOUNT_DELETION_ENABLED=true` (Self-service account deletion UI)
- `VITE_PUBLISHED_CONTENT_ENABLED=true` (Curriculum database reads)

> **Important:** Use operator-controlled disposable email accounts capable of receiving confirmation mail (e.g. via Zoho Mail or test inboxes). `@example.com` addresses are non-routable syntax placeholders only.

### Test Sequence
1. **Guest Isolation:**
   - In Browser 1, learn 3 words and bookmark 2 cards in Guest mode.
   - In Browser 2, open the app in Guest mode.
   - *Verification:* Browser 2 displays 0 saved cards (guest records remain strictly local to Browser 1).
2. **Account A Registration & Guest Merge:**
   - In Browser 1, register a new disposable account `user-a@<operator-domain>`. Complete email verification.
   - Confirm guest import offer dialog. Complete import.
   - *Verification:* Account A sees all 3 learned words and 2 bookmarks in collection.
3. **Same-Account Two-Session Cloud Persistence & Sync:**
   - In Browser 2, sign into the **same** Account A (`user-a@<operator-domain>`).
   - In Browser 1, learn 2 additional words -> Verify background sync completes.
   - In Browser 2, refresh or trigger sync -> Verify the 2 new words appear in Browser 2.
4. **Network Interruption & Sync Reconnect:**
   - In Browser 1, disconnect network (or set DevTools Network to Offline).
   - Learn 1 new word -> Verify local synchronous update and visible pending sync indicator.
   - Re-enable network -> Trigger explicit retry or wait for auto-retry -> Verify pending mutation confirms with cloud.
5. **Account-Switch Isolation (Same Browser):**
   - In Browser 1, log out of Account A.
   - Register or sign in as Account B (`user-b@<operator-domain>`) in Browser 1.
   - *Verification:* Account A's local cache is cleared. Account B starts with clean state and does not inherit Account A's words, streak, or preferences.
6. **Cross-Account Session Isolation (Two Browsers):**
   - Browser 1 = Account A, Browser 2 = Account B.
   - Change theme to dark and active language to Japanese in Browser 1.
   - *Verification:* Browser 2 (Account B) remains completely isolated with its own independent preferences and vocabulary.
7. **Learning Export & Reset (Verified Implementation Bounds):**
   - In Browser 1 (Account A), navigate to Settings/Profile -> Export Learning Data.
   - *Verification:* Downloads valid JSON containing all 8 learning tables across `zh` and `ja` (`saved_words`, `review_cards`, `search_history`, `written_chars`, `learned_radicals`, `learned_kana`, `learned_sounds`, `learned_words`), streak history, and preferences.
   - In Browser 1 (Account A), click Reset Learning Progress -> Type `RESET` -> Confirm.
   - *Verified Reset Scope:*
     - **Cleared:** All 8 learning tables across `zh` and `ja`, pre-reset pending sync envelopes, and study streak (`user_study_streaks` reset to 0).
     - **Retained:** Account session/auth (`auth.users`), profile (`public.profiles`, avatar, display name, email), user preferences (`public.user_preferences`, theme, speech rate, active language), and other local accounts.
   - *Cross-Check:* Refresh Browser 2 (Account B); verify Account B is completely unaffected.
8. **Account Deletion (Email/Password):**
   - In Browser 1 (Account A), open Profile -> Delete Account.
   - Submit incorrect password -> Verify error alert; session preserved.
   - Type `DELETE` and correct password -> Submit.
   - *Verification:* Client returns to guest mode with success banner. Attempting login as Account A fails with invalid credentials.
9. **Google-Only Account Boundary:**
   - In Browser 2, sign in using Google account.
   - Open Profile -> Delete Account.
   - *Verification:* Dialog shows explicit unsupported notice and disables password submission (unresolved limitation).

---

## 8. Content Handoff: Loading Client-Approved Curriculum

### Prerequisites & PowerShell Environment
In PowerShell, set operator environment variables:
```powershell
$env:SUPABASE_URL = "https://olwicxljwfemgrsbobtg.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<staging-service-role-key>"
```
*(Client-facing `VITE_*` keys are strictly rejected for write operations).*

### Exact CSV Schema & Field Limits (from `validator.mjs`)
Required CSV headers (all 11 columns required in exact order):
```csv
id,course_id,language,level_id,written_form,reading,meaning_english,meaning_burmese,audio_path,examples_json,sort_order
```

**Field Rules:**
- `id`: Required string, max **150** characters, unique per course.
- `course_id`: Required string, max **100** characters (`zh-hsk1` or `ja-n5` currently supported).
- `language`: Required string, strictly `zh` or `ja`.
- `level_id`: Required string, max **100** characters (in database: `HSK1` for Chinese, `N5` for Japanese).
- `written_form`: Required string, max **500** characters. **Natural identity key** (cannot be changed once published).
- `reading`: Required string, max **2000** characters. **Natural identity key** (cannot be changed once published).
- `meaning_english`: String, max **2000** characters.
- `meaning_burmese`: String, max **2000** characters.
- *Meaning Rule:* At least one meaning (`meaning_english` or `meaning_burmese`) is required; warning issued if one is missing.
- `audio_path`: Optional string, max **256** characters. Relative storage path, forward slashes, no leading `/` or `..`, must end in `.mp3`, `.wav`, `.ogg`, `.m4a`, `.aac`, or `.webm`.
- `examples_json`: JSON array string of up to **3** items. Each item is a JSON object with:
  - `text`: Required non-empty string, max **1000** characters (the sentence text).
  - `reading`: Optional string (pronunciation).
  - `english`: Optional string (English translation).
  - `burmese`: Optional string (Burmese translation).
  - *Translation Rule:* At least one of `english` or `burmese` is required. Warning issued if one is missing.
- `sort_order`: Required signed 32-bit integer (**-2147483648** to **2147483647**).

### Illustrative CSV Example (Fixture)
```csv
id,course_id,language,level_id,written_form,reading,meaning_english,meaning_burmese,audio_path,examples_json,sort_order
zh_hsk1_001,zh-hsk1,zh,HSK1,中,zhōng,middle; center; China,အလယ်; အလယ်ဗဟို; တရုတ်,audio/zh/hsk1/001.mp3,"[{""text"": ""我是中国人。"", ""reading"": ""Wǒ shì Zhōngguó rén."", ""english"": ""I am Chinese."", ""burmese"": ""ကျွန်တော်/မ တရုတ်လူမျိုးပါ။""}]",10
zh_hsk1_002,zh-hsk1,zh,HSK1,你好,nǐ hǎo,hello,မင်္ဂလာပါ,,"[{""text"": ""你好，我是学生。"", ""reading"": ""Nǐ hǎo, wǒ shì xuéshēng."", ""english"": ""Hello, I am a student."", ""burmese"": ""မင်္ဂလာပါ၊ ကျွန်တော်/မက ကျောင်းသားပါ။""}]",20
zh_hsk1_003,zh-hsk1,zh,HSK1,谢谢,xiè xie,thank you,ကျေးဇူးတင်ပါတယ်,audio/zh/hsk1/003.mp3,[],30
```

### Executable Operator Commands (PowerShell)
1. **Validate CSV (Offline):**
   ```powershell
   node tools/content-csv/content-manager.mjs validate <path-to-approved-content.csv>
   ```
   *Executed Result:*
   `{"action":"validate","valid":true,"summary":{"total_rows":3,"valid_rows":3,"error_count":0,"warning_count":0}}`
2. **Dry-Run (Online comparison):**
   ```powershell
   node tools/content-csv/content-manager.mjs dry-run <path-to-approved-content.csv> --target staging
   ```
3. **Stage Content:**
   ```powershell
   node tools/content-csv/content-manager.mjs stage <path-to-approved-content.csv> --target staging --operator "pt"
   ```
4. **Publish Staged Content:**
   ```powershell
   node tools/content-csv/content-manager.mjs publish zh-hsk1 --stage-id <uuid> --target staging --reason "Client-approved HSK1 release"
   ```
   *(Automatically writes a pre-update backup to `./content-backups` before publishing).*
5. **Inspect Status:**
   ```powershell
   node tools/content-csv/content-manager.mjs status zh-hsk1 --target staging
   ```
6. **Rollback (if needed):**
   ```powershell
   node tools/content-csv/content-manager.mjs rollback zh-hsk1 --to-version <previous_version> --target staging --reason "Revert content typo"
   ```

---

## 9. Outstanding Production & Handover Tasks

The following administrative, infrastructural, and deployment tasks remain pending:

1. **SMTP & DNS Records**: Resend custom SMTP setup verified on sending subdomain `auth.swipe2study.com`. Preserve existing root domain DNS and Zoho Mail MX records without altering root configuration.
2. **Google OAuth**: Google Cloud Console OAuth 2.0 Client credentials configured and verified with Lamduan email.
3. **Account Deletion Edge Function**: Deploy `supabase/functions/delete-account` to project `olwicxljwfemgrsbobtg` after operator verification of gateway signing-key compatibility.
4. **Feature Activation & Acceptance**: Progressively enable feature flags in preview, verifying each capability before general release.
5. **Real Curriculum Content**: Validate and publish official HSK1 and JLPT N5 curriculum data using the content publication pipeline.
6. **Dedicated Production Supabase Setup**: Provision a separate, clean production Supabase instance, apply migrations in order, and maintain strict environment isolation from staging.
7. **Domain Cutover**: Complete official domain cutover to `swipe2study.com` after production verification.
8. **Disaster Recovery Demonstration**: Execute an end-to-end database restore demonstration against an isolated test target using the database dump.
9. **Final Polish & Review**: Perform final performance, security, and accessibility checks prior to launch.

---

## 10. Zero-Credentials Compliance

In accordance with repository security policies, this document contains zero passwords, tokens, JWTs, secret keys, or database dump contents.
