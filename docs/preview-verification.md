# Branch preview verification — 28 October 2026

## Starting checkpoint

PT accepted the local UI/account/settings checks through `195ec0a` on
`feat/backend-foundation`. Local tests/builds and the browser reports are in
`development-log.md`. GitHub reports a successful Vercel deployment for `195ec0a`. The associated
Preview Comments check exposes the branch URL below. Application access, hosted
environment values, project ownership, staging target and schema/policies are
not independently verified.

## Resolve the hosted targets

Record these from the connected accounts or their owner, without guessing URLs:

| Item | Current status |
| --- | --- |
| Vercel project/team and access | Check target identifies `s2-s-anti-gravity` under `htookhantkyaw2006-9042s-projects`; account access pending |
| Connected repository | Expected `htookhantkyaw2006/swipe-2-study`; verify |
| Production branch | PT reports `main`; verify project setting |
| Preview branch | `feat/backend-foundation` |
| Preview source commit | `195ec0ae3e78e4c5de683730aa3fc178680a737b`, Vercel commit status success |
| Confirmed staging Supabase project | Pending |
| Hosted foundation migration/policies | Inspect; do not infer from Auth success |

GitHub check links:

- Deployment: https://vercel.com/htookhantkyaw2006-9042s-projects/s2-s-anti-gravity/DAWqsaWvVRFz11LFTbhDUJbQTM6P
- Branch preview: https://s2-s-anti-gravity-git-f-a105eb-htookhantkyaw2006-9042s-projects.vercel.app
- Check evidence: https://github.com/htookhantkyaw2006/swipe-2-study/runs/122471888117

The preview origin is extracted from the check's Vercel feedback link, not a
guessed hostname. The external fetch surface could not open the deployment or
preview/login pages. PT subsequently reached a Vercel login wall and received
“Social Account is not yet connected to any Vercel user.” Application login and
backend configuration therefore remain unverified. The owner is currently
unavailable; request an owner-authorized shareable link or access when available.
Independent local fixes are continuing meanwhile.

Use the existing branch Preview environment. Do not promote it to Production,
change the production branch, replace production variables or reassign the live
domain as part of this checkpoint. Vercel supports separate preview environments
and variables; a new project’s first deployment has different production rules,
so do not assume a newly imported project is automatically an isolated preview.

## Preview build configuration

For this root-level React/Vite application, inspect the dashboard settings:

- Framework: Vite; install using the committed lockfile (`npm ci`).
- Build: `npm run build`; output directory: `dist`.
- Runtime: a Node version supported by the locked Vite release; README currently
  specifies Node 22.12+ or a supported newer LTS.
- The checked-in `vercel.json` already rewrites SPA routes to `index.html`.
- Supply `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the confirmed
  staging project in Preview, scoped to this branch where appropriate. Values
  from a local `.env.local` do not establish the hosted project’s configuration.
- A change to environment variables requires a new deployment to take effect.
  Keep privileged service-role/secret/database credentials out of browser env.

The existing `npm run check:backend -- production` validates production-mode
configuration on a machine where the corresponding values are securely present.
It does not check connectivity, project ownership, database policies or Vercel.
No env-file contents or session tokens need to be pasted into chat.

## Auth redirect configuration

After obtaining the exact preview origin, inspect the staging Auth URL settings.
The app sends signup/resend links to:

`<preview-origin>/auth/callback?returnTo=%2F`

Allow the actual callback, including the return-path query forms the app uses.
For a confirmed preview origin, `<preview-origin>/**` can cover its paths and
query variants; do not substitute a guessed team slug or all Vercel tenants.
Preserve working local redirects for the browser origin PT actually uses.
Changing the staging Site URL, if needed, must use the verified target. Review
email templates only if redirects use the wrong origin; successful local email
arrival does not establish custom SMTP ownership or delivery to all recipients.

## Verify the actual preview

1. Confirm the deployment’s branch and source commit. Open its exact URL and
   refresh deep links such as `/profile`, `/saved` and `/learn/level/HSK1`.
2. In a clean guest session, check Home, collection lists and navigation. A guest
   cache belongs to its origin/device; do not expect localhost lists to appear
   automatically on the new HTTPS origin.
3. Sign up with a fresh permitted test email on this preview. Open the fresh
   confirmation link in the same browser/profile and exact app origin used for
   signup. Verify automatic entry into the app, profile identity and refresh.
4. Verify logout/login and expired-link recovery. Preserve the SDK-owned PKCE
   exchange; do not add a second exchange as a configuration workaround.
5. Check two test accounts for cache separation, then independently verify hosted
   profile/preferences/RLS using their actual authenticated identities. Local
   browser isolation is not evidence of database policy enforcement.
6. Record the preview URL, tested commit, browser/device, passing cases and any
   failure. Physical phones/Safari and hosted Storage/RLS checks remain separate
   from the existing Chromium guest results.

## Official references

- https://vercel.com/docs/deployments/environments
- https://vercel.com/docs/environment-variables
- https://supabase.com/docs/guides/auth/redirect-urls

Reviewed 28 October 2026. Hosted actions remain pending access and target
resolution; this document does not assert that a preview has been deployed.
