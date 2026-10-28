# Password recovery

## Current implementation

- Login links to `/forgot-password`. A trimmed email is sent through
  `resetPasswordForEmail` with the current app origin's fixed `/reset-password`
  redirect. Responses do not reveal whether an account exists.
- A 60-second minimum resend cooldown prevents immediate repeat submissions.
  A specific email-quota response explains that sending another request will not
  help. The cooldown does not claim when the hosted quota resets or change it.
- The new template (`supabase/templates/recovery.html`) sends a custom
  `/reset-password#token_hash=…&type=recovery` link. The fragment is not sent to
  hosting. Before Auth/Router initialization, the app captures the token privately
  in memory and removes the callback payload from history. Referrers are disabled;
  the credential is never put in app storage or logs.
- Opening a custom link shows **Continue** without verifying it. A click calls
  SDK `verifyOtp` with `token_hash` and `type: 'recovery'`. This does not need the
  requesting browser's PKCE verifier. Duplicate clicks/remounts share one request.
  Invalid/wrong-type/mixed callbacks fail closed. No automatic retries follow an
  uncertain or failed verification.
- SDK `PASSWORD_RECOVERY` still goes through the Auth coordinator's independent
  server `getUser` verification. Only that verified account can open the password
  form. A normal login or cached session alone cannot authorize reset.
- The form shows the verified email, validates confirmation, rechecks intended
  user/session before SDK `updateUser`, handles password policy errors and
  consumes recovery state after confirmed success. Owner-scoped caches stay
  isolated. The SDK remains configured for PKCE for other authentication flows.
- Old `?code=…` emails retain SDK-owned PKCE exchange, requiring the original
  browser/profile and origin. The app never manually re-exchanges them.
- Unconfigured guest builds explicitly show recovery as unavailable.

## Template activation is required

New source alone does **not** change existing Supabase emails or remove email
sending limits. Activate the matching Reset password template only after the
new code runs in the intended environment. Validate URL allowlisting and app
destination. Steps, rollback order, manual acceptance and custom SMTP requirements
are in [Auth email setup](auth-email-setup.md).

No hosted template, SMTP setting, DNS record, account password or project
configuration was changed by this implementation. Real hosted acceptance remains
pending.

## Memory-only recovery

Recovery permission deliberately does not survive a full page reload. After
confirming the link, complete the form without reloading. If reloaded, request a
fresh email. Before confirmation, reopening the original unconsumed email link
is enough after an accidental reload. A new template cannot repair an already
consumed, superseded or expired token.

Explicit Continue reduces simple email-link prefetch consumption. It is not a
guarantee against every scanner or delivery issue. Link secrecy and Supabase's
server expiry/single-use checks still matter.

## Verification — current checkpoint

- **92 Node tests pass**, including installed-SDK TokenHash recovery with empty
  initiating storage, one verification across duplicate clicks, URL cleanup,
  wrong-type/duplicate/mixed-token rejection, failed/mismatched responses and no
  automatic retry. Existing coordinator identity/lifecycle and legacy PKCE cases
  remain passing. Test endpoints, users and credentials are synthetic.
- Lint: **0 errors, 10 pre-existing warnings**. Guest/unconfigured and synthetic
  configured production builds pass. Existing large JS chunk warning remains;
  no performance claim is made.
- Chromium production and development StrictMode each passed 11 layouts:
  confirmation/reset at 320/375/768/1024/1440px, plus phone success. No page/card
  overflow, page errors or unmocked external requests.
- Browser A requested recovery via the installed SDK, generating its verifier.
  Isolated browser context B had no shared storage or verifier. It opened the
  custom link, made zero verification requests before Continue, then performed
  one recovery verification and one password update. Rapid clicks did not
  duplicate either action. Mismatched confirmation, consumed/expired tokens,
  wrong-type links, server identity mismatch and normal cached sessions could not
  open/submit an authorized reset. Legacy originating-browser PKCE recovery and
  the new rate-limit UI also passed.
- These are isolated Chromium contexts with intercepted Auth API responses,
  not a real Edge/Chrome email-delivery test. Hosted template rendering, actual
  token consumption, SMTP/DNS/delivery, old/new-password login, Safari and physical
  devices still require acceptance in the intended environment.

## Official references

- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/reference/javascript/auth-verifyotp
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/rate-limits
