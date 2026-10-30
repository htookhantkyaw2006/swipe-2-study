# Hosted Setup Checkpoint

**Date:** October 30, 2026<br>
**Status:** Verified Test Backend & Preview Deployment Checkpoint<br>
**Branch:** `docs/hosted-setup-checkpoint`

---

## 1. Overview & Backend Scope

This document records the verified hosted infrastructure checkpoint for Swipe 2 Study across Supabase and Vercel.

- **Current Supabase Project:** `olwicxljwfemgrsbobtg`
- **Environment Classification:** Current **test backend** containing synthetic test accounts and development data.
- **Production Status:** A dedicated, isolated Production Supabase project remains **pending**. Staging credentials and test data must not be promoted or reused for production without clean project provisioning and official cutover.

---

## 2. Hosted Database Migrations

PT applied the ten migrations following `20261027000100_backend_foundation.sql` in strict filename order:

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

All 11 repository migrations are now present in the test backend database schema.

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
Eleven checked public RPCs have expected `anon` or `authenticated` EXECUTE grants aligned with security-definer boundaries:

1. `public.s2s_apply_mutations` (`authenticated`)
2. `public.s2s_account_snapshot` (`authenticated`)
3. `public.s2s_reset_learning` (`authenticated`)
4. `public.s2s_import_guest` (`authenticated`)
5. `public.s2s_get_study_streak` (`authenticated`)
6. `public.s2s_reserve_deletion_attempt` (`authenticated`)
7. `public.s2s_check_deletion_throttled` (`authenticated`)
8. `public.s2s_get_course_content_status` (`anon`, `authenticated`)
9. `public.s2s_stage_course_content` (`authenticated`, owner-checked)
10. `public.s2s_publish_staged_content` (`authenticated`, owner-checked)
11. `public.s2s_rollback_course_content` (`authenticated`, owner-checked)

> **Security Note:** Verification of RLS enablement and function EXECUTE grants confirms that expected access control flags and definitions are present in the catalog. *These catalog checks do not prove complete cross-account isolation under all edge cases.*

### Account & State Baseline Row Counts
Baseline record counts across core user state tables remained exactly 2 each:
- `auth.users`: 2 accounts
- `public.profiles`: 2 rows
- `public.user_preferences`: 2 rows
- `private.account_state`: 2 rows

---

## 4. Vercel Preview Deployment

- **Working Preview URL:** `https://s2-s-anti-gravity-3739ky7ll-htookhantkyaw2006-9042s-projects.vercel.app/`
- **Environment Variable Scoping:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are configured in Vercel scoped strictly to Preview branch `fix/deployment-config-readiness`.

### User-Reported Flow Verification
PT manually tested the hosted preview and reported success across the following user journeys:
- Account login
- Guest progress and vocabulary merge into authenticated account
- Word saving and study/review session operations

> **Verification Notice:** The above user-journey checks are **user-reported manual checks**, not agent-executed automated verification.

---

## 5. Local Backup & Disaster Recovery Readiness

- **Local Database Archive:** A database dump exists locally.
- **Archive Integrity Check:** Inspection via `pg_restore --list` succeeded with valid table definitions, sequences, and RPC signatures.
- **Pending Restore Test:** Actual restore execution into an isolated target test database remains pending.
- **Storage Objects:** Demo avatar object backup in Supabase Storage was intentionally skipped, as avatars were disposable development test fixtures.

---

## 6. Remaining Items Before Production Launch

The following administrative, infrastructural, and deployment tasks remain pending:

1. **SMTP & DNS Records**: Configure Resend sending subdomain (`auth.swipe2study.com`) in Namecheap DNS with exact dashboard MX, SPF TXT, and DKIM TXT records while preserving existing root website records and Zoho Mail MX records.
2. **Google OAuth**: Complete Google Cloud Console OAuth 2.0 Client credentials and configure Client ID/Secret in Supabase Dashboard.
3. **Account Deletion Edge Function**: Deploy `supabase/functions/delete-account` with `SUPABASE_SERVICE_ROLE_KEY`.
4. **Feature Activation & Acceptance**: Progressively enable feature flags in preview, verifying each capability before general release.
5. **Real Curriculum Content**: Validate and publish official HSK1 and JLPT N5 curriculum data using the content publication pipeline.
6. **Dedicated Production Supabase Setup**: Provision a separate, clean production Supabase instance, apply migrations in order, and maintain strict environment isolation from staging.
7. **Domain Cutover**: Complete official domain cutover to `swipe2study.com` after production verification.
8. **Disaster Recovery Demonstration**: Execute an end-to-end database restore demonstration against an isolated test target.
9. **Final Polish & Review**: Perform final performance, security, and accessibility checks prior to launch.

---

## 7. Zero-Credentials Compliance

In accordance with repository security policies, this document contains zero passwords, tokens, JWTs, secret keys, or database dump contents.
