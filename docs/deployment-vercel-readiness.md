# Deployment & Vercel Configuration Readiness

This guide details the exact deployment configuration, Vercel project settings,
environment separation rules, feature-to-database prerequisite matrix, and remaining
owner-controlled operations for Swipe 2 Study.

---

## 1. Vercel Project & Build Settings

In the Vercel Dashboard (**Project Settings -> General / Build & Development Settings**):

| Setting | Required Value | Notes |
| :--- | :--- | :--- |
| **Framework Preset** | `Vite` | Automatically configures Vite build and output patterns. |
| **Root Directory** | `./` (repository root) | Monorepo/subfolder configurations must not be used. |
| **Build Command** | `npm run build` | Executes `vite build`. Never override with unvetted flags. |
| **Output Directory** | `dist` | Default build output destination for Vite. |
| **Install Command** | `npm ci` | Strictly enforces clean installs matching committed `package-lock.json`. |
| **Node.js Version** | `22.x` | Explicitly select **Node.js 22.x** in Vercel settings; matches `package.json` engines (`>=22.12.0 <23`) and CI (`.github/workflows/ci.yml`). |

---

## 2. Environment Separation: Preview vs. Production

Vercel provides isolated environments: **Production**, **Preview**, and **Development**.
Each environment must maintain strict boundary separation.

```
+-----------------------------------------------------------------------------------------+
|                                  ENVIRONMENT MATRIX                                     |
+-----------------------------------------+-----------------------------------------------+
| PREVIEW ENVIRONMENT (Branches/PRs)      | PRODUCTION ENVIRONMENT (main branch)          |
+-----------------------------------------+-----------------------------------------------+
| Vercel Scope: "Preview"                 | Vercel Scope: "Production"                    |
| Target: Staging Supabase Project        | Target: Dedicated Production Supabase         |
| VITE_PUBLIC_URL: (Omit or Preview URL)  | VITE_PUBLIC_URL: https://swipe2study.com      |
|                                         | (or fallback: https://swipe2study.vercel.app) |
| Staging Auth Redirect URLs              | Production Auth Redirect URLs                 |
| Working Preview:                        | Existing production URL:                      |
| https://s2-s-anti-gravity-3739ky7ll-    | https://swipe2study.vercel.app                |
| htookhantkyaw2006-9042s-projects.       |                                               |
| vercel.app/                             |                                               |
| Safe test data / synthetic users        | Production client data / real accounts        |
+-----------------------------------------+-----------------------------------------------+
```

### Critical Rules:
1. **Never copy Staging credentials into Production scope**: Production must point to a dedicated, separate production Supabase instance.
2. **Never promote Preview to Production without applying migrations**: A successful Preview build does not mean database tables, policies, or functions exist in Production.
3. **Preview Deployments & Working Preview URL**: The active working Preview deployment URL is `https://s2-s-anti-gravity-3739ky7ll-htookhantkyaw2006-9042s-projects.vercel.app/` (recorded in the October 30, 2026 checkpoint: [`docs/hosted-setup-checkpoint.md`](./hosted-setup-checkpoint.md)). When configuring Supabase Staging Auth redirect allowlists for new preview branches or PRs, use exact Vercel deployment origins rather than wildcard team slugs.
4. **Domain & Existing Infrastructure**:
   - Confirmed client production domain: `swipe2study.com`.
   - Existing Vercel production deployment URL: `https://swipe2study.vercel.app`.
   - The domain `swipe2study.com` currently powers an active website with existing Zoho Mail MX records. Do NOT alter production DNS or Supabase Site URL until the new deployment is fully verified and the owner schedules the cutover.

---

## 3. SPA Deep-Link Routing & Static Asset Behavior

The repository contains `vercel.json`:
```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### How Vercel Resolves Incoming Requests:
1. **Static Filesystem First**: Vercel evaluates static assets in `dist/` before rewrites:
   - Built chunks: `/assets/index-*.js`, `/assets/chunk-*.css` are served directly with immutable cache headers.
   - Root static assets: `/favicon.ico`, `/index.html` are served directly.
2. **Client-Side Routes Fall Through to Rewrite**:
   - Requests to client routes (`/learn`, `/login`, `/profile`, `/settings`, `/saved`, `/learn/level/HSK1`, etc.) do not match static disk files and rewrite to `/index.html`.
   - Browser client scripts load `/index.html`, boot React Router, and mount the deep-linked view without HTTP 404s.
3. **No Routing Redesign**: The rewrite in `vercel.json` is minimal, standard, and preserved as-is.

---

## 4. Build-Time Environment Baking & Rebuild Requirement

> [!IMPORTANT]
> **Vite bakes all `VITE_*` variables statically into client JavaScript bundles at BUILD TIME.**

- When `npm run build` runs, Vite replaces occurrences of `import.meta.env.VITE_*` with their literal string values.
- Modifying environment variables in the Vercel Dashboard **has zero runtime effect** on existing deployed bundles.
- **Required Action**: After adding or modifying any environment variable in Vercel, you **must trigger a new deployment** (e.g. via *Redeploy* in the dashboard with *"Clear Build Cache"*, or by pushing a new commit).
- **Security Reminder**: Never place database passwords, service-role keys, or `sb_secret_*` tokens in `VITE_*` variables. They are public to any user inspecting browser network requests.

---

## 5. Feature-to-Prerequisite Matrix

Every feature gate in the application is disabled by default (`false`). Enabling a capability requires both setting its `VITE_*` flag to `'true'` and verifying its specific hosted prerequisites:

| Capability | Environment Variable | Default | Hosted Database / Edge / Provider Prerequisites |
| :--- | :--- | :--- | :--- |
| **Core Auth & Profiles** | `VITE_SUPABASE_URL`<br>`VITE_SUPABASE_PUBLISHABLE_KEY` | *(blank)* | `20261027000100_backend_foundation.sql`<br>- Tables: `public.profiles`, `public.user_preferences`, `private.account_state`<br>- Storage: `avatars` bucket + storage RLS policies<br>- Auth trigger: `s2s_auth_user_created` executing `private.create_account_records()` on `auth.users`<br>- Access controls: `private.is_active_user()` for profile/preferences RLS and `private.set_updated_at()` |
| **Published HSK1/N5 Content** | `VITE_PUBLISHED_CONTENT_ENABLED` | `false` | `20261030000100_content_publication_foundation.sql`<br>`20261030000200_content_publication_hardening.sql`<br>`20261030000300_consistent_publication_reads.sql`<br>- Tables: `public.courses`, `public.vocabulary`, `private.content_stages`, `private.content_publication_history`<br>- Owner/admin publication RPCs: `public.s2s_stage_course_content`, `public.s2s_publish_staged_content`, `public.s2s_rollback_course_content`, `public.s2s_get_course_content_status` (restricted; `authenticated=false`, `anon=false`)<br>- Seeded published rows for `zh-hsk1` and `ja-n5` |
| **Online Progress Sync** | `VITE_ONLINE_SYNC_ENABLED` | `false` | `20261029000300_online_sync_foundation.sql`<br>`20261029000400_learned_words_sync.sql`<br>`20261029000500_study_streaks_yangon.sql`<br>`20261029000600_sync_progress_hardening.sql`<br>- Tables: `public.user_items`, `public.user_item_tombstones`, `public.user_study_streaks`, `public.user_study_activity`, `private.sync_mutation_receipts`<br>- RPCs: `public.s2s_apply_mutations`, `public.s2s_get_study_streak` (`authenticated=true`, `anon=false`) |
| **Self-Service Account Deletion** | `VITE_ACCOUNT_DELETION_ENABLED` | `false` | `20261029000100_account_deletion_foundation.sql`<br>`20261029000200_account_deletion_attempt_reservation.sql`<br>- Tables: `private.account_deletions`, `private.account_deletion_attempts`<br>- Restricted deletion RPCs: `public.s2s_reserve_deletion_attempt`, `public.s2s_begin_account_deletion`, `public.s2s_record_deletion_progress`, `public.s2s_record_deletion_attempt_failure`, `public.s2s_get_deletion_state`, `public.s2s_check_deletion_throttled`, `public.s2s_reset_deletion_attempts` (`authenticated=false`, `anon=false`)<br>- Supabase Edge Function `delete-account` deployed with runtime-provided service role authority and `ALLOWED_ORIGINS` secret (application caller verification enforced; gateway JWT verification setting pending hosted compatibility check) |
| **Learning Data Export & Reset** | `VITE_ACCOUNT_EXPORT_RESET_ENABLED` | `false` | `20261028000100_guest_import_foundation.sql`<br>`20261029000300_online_sync_foundation.sql`<br>`20261029000500_study_streaks_yangon.sql`<br>`20261029000600_sync_progress_hardening.sql`<br>- Tables: `public.user_items`, `public.user_item_tombstones`, `public.user_study_streaks`, `public.user_study_activity`, `private.learning_reset_receipts`<br>- RPCs: `public.s2s_account_snapshot` (for verified export) and `public.s2s_reset_learning` (for cloud reset) (`authenticated=true`, `anon=false`)<br>- *Note: Export and reset require these snapshot and reset RPC migrations independently of whether background sync (`VITE_ONLINE_SYNC_ENABLED`) is enabled.* |
| **Preferences Cloud Sync** | `VITE_ACCOUNT_PREFERENCES_SYNC_ENABLED` | `false` | `20261027000100_backend_foundation.sql`<br>- Table: `public.user_preferences` and RLS policies (`active_language`, theme, audio, streak preferences) |
| **Google OAuth Sign-In** | `VITE_GOOGLE_AUTH_ENABLED` | `false` | Google Cloud OAuth Client ID & Secret configured in **Supabase Dashboard -> Auth -> Providers -> Google**.<br>- Authorized redirect: `https://<ref>.supabase.co/auth/v1/callback` |
| **Cloud Guest Import Staging** | `VITE_CLOUD_IMPORT_STAGING` | `false` | `20261028000100_guest_import_foundation.sql`<br>`20261029000300_online_sync_foundation.sql`<br>`20261029000400_learned_words_sync.sql`<br>- Tables: `public.user_items`, `private.guest_import_receipts`<br>- RPCs: `public.s2s_import_guest`, `public.s2s_account_snapshot` (`authenticated=true`, `anon=false`) |
| **Error Monitoring** | `VITE_ERROR_REPORTING_ENABLED`<br>`VITE_ERROR_REPORTING_URL` | `false`<br>*(blank)* | Remote telemetry collector endpoint capable of receiving POST JSON error reports. |
| **Privacy Analytics** | `VITE_ANALYTICS_ENABLED`<br>`VITE_ANALYTICS_URL` | `false`<br>*(blank)* | Remote analytics collector endpoint capable of receiving allowlisted event JSON. |

---

## 6. Preflight Validation Command

Run the local preflight validator before deploying to inspect the environment:

```sh
# For development environment (.env.local)
npm run check:backend

# For production environment validation
npm run check:release
```

The preflight checker:
1. Validates `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` formats.
2. Checks that every enabled capability has its required frontend dependencies configured.
3. Distinguishes `[CONFIGURED]`, `[DISABLED]`, `[INVALID]`, and `[UNCONFIGURED]` states.
4. Redacts all credentials (never prints tokens/keys).
5. Explicitly notes that database migrations and external providers are **externally-unverified**.

---

## 7. Exact Remaining Owner-Controlled Operations

The following administrative actions require Owner-level credentials and dashboard access. They cannot be performed via code repository commits:

1. **Vercel Project Administration**:
   - Ensure repository `htookhantkyaw2006/swipe-2-study` is connected.
   - Explicitly select **Node.js 22.x** in Vercel Dashboard (**Project Settings -> General -> Node.js Version**).
   - Verify Framework Preset is `Vite`, Build Command is `npm run build`, Output Directory is `dist`, Install Command is `npm ci`.
   - Configure Environment Variables separately in **Preview** (Staging Supabase) and **Production** (Production Supabase) scopes according to `.env.example`.
2. **Supabase Database Migrations**:
   - Apply pending SQL migrations (`supabase/migrations/*.sql`) to the hosted Staging and Production databases via Supabase CLI (`supabase db push`) or the Supabase SQL Editor.
3. **Supabase Edge Function Deployment**:
   - In Supabase Edge Functions runtime, `SUPABASE_SERVICE_ROLE_KEY` is automatically injected by the platform (CLI prohibits custom secrets starting with `SUPABASE_`).
   - Configure CORS allowlist secret in PowerShell:
     ```powershell
     supabase secrets set ALLOWED_ORIGINS="https://<your-active-preview-origin>" --project-ref olwicxljwfemgrsbobtg
     ```
   - Deploy `supabase/functions/delete-account` using Supabase CLI:
     ```powershell
     supabase functions deploy delete-account --project-ref olwicxljwfemgrsbobtg
     ```
     *(If the gateway blocks preflight OPTIONS or if project signing keys are asymmetric ES256, deploy with `--no-verify-jwt`; application-level caller authentication via `userClient.auth.getUser()` is unconditionally enforced either way).*
   - Never place `SUPABASE_SERVICE_ROLE_KEY` in frontend environment variables.
4. **Supabase Auth & Custom SMTP (Resend) Setup**:
   - In **Supabase Dashboard -> Authentication -> URL Configuration**:
     - Maintain working local development redirect URLs (`http://localhost:5173/**`, `http://127.0.0.1:5173/**`).
     - Add the recorded working Preview URL (`https://s2-s-anti-gravity-3739ky7ll-htookhantkyaw2006-9042s-projects.vercel.app/**`) and any future verified preview branch URLs to the Staging Auth redirect allowlist. Do not use invented wildcard team slugs.
     - Existing production URL is `https://swipe2study.vercel.app/**`. Do **NOT** change the Supabase Site URL or production URLs to `swipe2study.com` before the actual deployment is ready and verified.
   - In **Supabase Dashboard -> Settings -> Auth -> SMTP**:
     - Configure Resend SMTP credentials (host `smtp.resend.com`, port 587, user `resend`, password `re_...`).
     - Configure Sender email on the dedicated sending subdomain: `auth@auth.swipe2study.com` (or address under `auth.swipe2study.com`).
5. **DNS & Email Infrastructure (Namecheap)**:
   - **Status**: Resend custom SMTP setup is **pending**.
   - **Sending Subdomain Plan (`auth.swipe2study.com`)**:
     - To protect the existing website and business email routing, transactional email via Resend is designated strictly for the subdomain `auth.swipe2study.com`.
   - **Copy Authoritative Dashboard Records**:
     - Do not pre-fill or invent exact DNS record names, types, priorities, or values ahead of setup.
     - When `auth.swipe2study.com` is configured in the Resend Dashboard (**Domains -> Add Domain**), Resend generates the authoritative DNS verification records for that domain.
     - The operator must copy the **actual dashboard-provided records** directly into Namecheap DNS, including:
       - The sending subdomain SPF and DKIM verification records.
       - The generated return-path subdomain records (used by Resend for bounce, complaint, and delivery handling).
       - Any optional DMARC guidance specified in the dashboard for the subdomain.
   - **Preservation of Existing Root DNS & Zoho Records**:
     - The apex/root domain `swipe2study.com` has an active website and receives business mail via Zoho Mail MX records.
     - All Resend records must be configured strictly under `auth.swipe2study.com` and its generated return-path subdomain.
     - Do **NOT** alter or delete existing root domain (`@`) MX records for Zoho Mail, and do **NOT** modify root domain website DNS or root SPF records.
     - Do **NOT** switch root domain DNS or add CNAME/A records pointing `swipe2study.com` to Vercel until the new production deployment is fully tested, confirmed, and ready for official cutover.
6. **Google Cloud OAuth Credentials**:
   - In Google Cloud Console, configure OAuth 2.0 Client credentials under APIs & Services.
   - Add Authorized Redirect URI: `https://<supabase-project-ref>.supabase.co/auth/v1/callback`.
   - Paste Client ID and Client Secret into Supabase Auth Google provider settings.
