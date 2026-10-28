# Recovery email and SMTP activation

The app code and this email template must be activated together in the intended
environment. No hosted setting is changed by a build or this repository commit.
Confirm the Supabase project's purpose before editing it; keep production and
staging separate. Do not merge `main` to test this feature.

**Current dashboard blocker:** PT's hosted Reset password screen displays
`Set up custom SMTP to edit the source` and disables Source. In that project,
complete the SMTP setup below before attempting to replace the template. The
cross-browser code is ready, but the new template has not been activated.
The existing built-in emails retain the old same-browser PKCE requirements.

## Activate cross-browser recovery

1. Run/deploy the feature-branch code first at a known local/staging origin.
   If Source is locked behind SMTP, obtain provider/DNS access and complete the
   custom SMTP section before editing this hosted template.
2. In that Supabase project, inspect Authentication → URL Configuration. Allow
   the exact app origin's `/reset-password` route and SDK query variants. For
   local development, `http://localhost:5173/**` and
   `http://127.0.0.1:5173/**` are separate entries. Preview URLs need their own
   appropriate allowlist entries. Do not overwrite the production Site URL with
   localhost. Broad local wildcards are not a production allowlist recommendation.
3. Keep a private backup of the current **Reset password** email template.
   Copy `supabase/templates/recovery.html` into that template only. A suitable
   subject is `Reset your Swipe 2 Study password`. Do not change signup,
   magic-link or invite templates as part of this change.
4. The template links to `{{ .RedirectTo }}#token_hash={{ .TokenHash }}&type=recovery`.
   In HTML, the ampersand is written `&amp;`. The app supplies the full fixed
   `/reset-password` redirect URL. It must be allowed and reach this new code.
   Do not substitute `ConfirmationURL`: that invokes the old PKCE link flow.
   Do not use the project Site URL alone: its root may not be the reset route.
5. Request one **new** email. Existing emails keep their original format; the
   new template cannot fix an already-consumed or expired email token.

Acceptance: request in browser A, open the new email link in a clean browser B
with no initiating PKCE verifier. The URL is cleared and **Continue** appears.
Opening it alone must not verify the token. Continue opens the form showing the
verified account. Set a new password, sign out, verify old-password failure and
new-password success. Then verify that reopening the consumed link cannot reset
again. Do not refresh the form after confirming the link: recovery authority is
deliberately memory-only. Before confirmation, reopening the original unconsumed
email link is sufficient after an accidental reload.

If the template must be rolled back, restore its saved content. The new app
continues supporting old PKCE links in the initiating browser/profile and origin.
Do not roll back the app while still sending the new template: old code does not
understand the custom TokenHash confirmation step.

## Email capacity

First inspect whether custom SMTP is already enabled and check the actual
Auth error code/log. The generic UI rate-limit message is not proof of which
quota was reached. Never export logs containing credentials, tokens or emails.

The built-in Supabase sender currently allows 2 emails/hour across the project.
The recovery endpoint also defaults to a minimum 60-second gap per user.
Changing the app's resend cooldown cannot reset these server-side limits.

To use custom SMTP:

1. Use an owner-authorized SMTP provider account and sending domain. Obtain its
   host, port, username and password securely. Do not put them in chat, Git,
   screenshots, `VITE_*` variables or frontend bundles.
2. Verify the sender/domain with the provider and add its required SPF/DKIM DNS
   records. Review DMARC with the domain owner; do not replace unrelated records.
3. Enter the SMTP settings and verified From address in Supabase Auth email
   configuration. An existing business inbox address by itself does not prove
   SMTP credentials or domain verification are ready.
4. Review Authentication → Rate Limits and the provider's own quotas. Supabase
   documents an initial 30 messages/hour for newly configured custom SMTP;
   choose a suitable limit, retaining abuse protection. Do not disable limits
   or claim unlimited sending. Disable provider click tracking for Auth emails.
5. Send a controlled staging email, check inbox/spam delivery and complete the
   reset acceptance above. Record only sanitized commit/environment/results.

Owner/provider/DNS access is still required for this activation. No provider
account, credentials, subscription, DNS change or hosted email setting has been
created/changed by this local work.

## Official references

- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/reference/javascript/auth-verifyotp
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/rate-limits
