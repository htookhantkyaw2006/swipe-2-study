# Password recovery — local implementation checkpoint

## Implemented

- Login links to `/forgot-password`, which sends a trimmed address through
  `resetPasswordForEmail` with the current app origin’s `/reset-password` route.
  The success message does not reveal whether an account exists. Rate limits
  and connection errors remain errors.
- The installed Supabase SDK owns PKCE code exchange. No manual duplicate
  exchange, private keys, Edge Function or new database migration was added.
- The Auth coordinator recognizes `PASSWORD_RECOVERY`, verifies that account
  with `getUser`, and exposes a matching in-memory recovery state. A normal
  login or cached session alone does not open the reset form. Subsequent
  INITIAL_SESSION/refresh notifications retain the correct pending flow;
  account switches and logout clear it.
- `/reset-password` displays the verified email, confirms the new password,
  rechecks the intended user/session before `updateUser`, handles server password
  policies, and consumes its recovery state after confirmed success. Repeated
  submit clicks are blocked. Existing owner-scoped learning caches are retained.
- Both routes explicitly show unavailable states in an unconfigured guest build.

## Deliberate limitation

Recovery state is memory-only. Refreshing or reopening the reset form after its
code has been exchanged requires requesting a fresh email link. It is not a
persistent account-setting permission. Request/open the latest link using the
same browser/profile and exact app origin. Do not promise cross-browser or
cross-origin PKCE recovery.

## Verification performed

- **81 Node tests pass**: the previous 64 plus 17 recovery cases covering request
  validation, privacy-preserving responses, failures, intended-user checks,
  lifecycle events/generation races and real installed-SDK recovery exchange.
- The SDK test asserts one token exchange; the installed SDK can emit more than
  one recovery event for that exchange. Coordinator/browser behavior tolerates
  those notifications without submitting an extra password change.
- Chromium production build used only a synthetic Supabase URL/public key and
  intercepted Auth API responses. No real email or hosted account was modified.
  Request/form layouts passed at 320/375/768/1024/1440px; completion and consumed
  link states add two phone layouts (12 configured states). Unconfigured guest
  routes were also checked at 320px.
- Real SDK browser flow passed: recovery request, generic success/rate limits,
  one exchange for a fresh recovery link, error URL priority, mismatch/policy
  rejection, single successful update despite repeated submit, consumed link,
  existing-login/missing-verifier and ordinary-confirmation rejection, refresh
  requiring a new link, and server-user mismatch blocking the form. Browser page
  errors and unmocked external requests: zero.
- Build/lint/whitespace pass; lint retains 10 unrelated existing warnings. These
  tests do not prove email deliverability, hosted password policy, redirect
  allowlisting, real token revocation behavior or Safari/physical devices.

## Hosted/local-configured test still required

1. Use the confirmed staging Supabase project. Inspect its Auth URL allowlist
   before changing it. The recovery callback uses `<actual-app-origin>/reset-password`.
   Existing local/preview `<actual-app-origin>/**` entries cover this route and
   SDK query variants. If only the old signup callback is allowed, add the
   appropriate recovery URL for that exact origin. Keep production separate.
2. Use a disposable test account. Open Forgot password and request a fresh link.
   Verify delivery and that its destination is the same origin where requested.
3. Open the latest link in that browser/profile, check the intended email, set
   and confirm a new password without reloading the form, then continue.
4. Log out. Check that the old password fails and the new password signs in.
   Confirm profile identity/cache isolation still work. Also exercise an expired
   link and a reset request for an address without an account.
5. Record the tested commit/origin/browser and result. Do not paste passwords,
   tokens or env contents into the development log or chat.

## Official references

- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail
- https://supabase.com/docs/guides/auth/redirect-urls

Hosted checks remain pending while owner-authorized preview access is unavailable.
