# Guest learning import

28 October 2026. This combines the device-cache service (`c55e015`) and the
IDE-agent dialog (`3d85c61`) without changing the main branch or hosted services.
See [the service and storage design](guest-import-core.md) and
[the dialog contract](guest-import-dialog.md).

## Delivered flow

After verified sign-in or session restoration, the first eligible app screen
checks guest learning on this browser origin. If there are undecided records,
the modal shows per-course saved words, review words and progress-record counts.
It explicitly says that data remains on this device, cloud sync is unavailable,
and original guest records will be kept.

- **Merge guest data**: re-verifies the server user and live SDK session, then
  applies the explicit device-cache decision. Existing account records win
  semantic conflicts. A confirmed merge remounts the current route's learning
  views so their counts/lists update without a page refresh. If browser Back has
  entered study while verification was pending, this refresh is deferred until
  session exit so the active deck is not replaced. A focused visible
  message confirms the local result. Auth and navigation are not remounted.
- **Use account data only**: records that this account declines the offered
  guest identities. Account lists and original guest records remain separate.
- **Decide later / Close / Escape / backdrop**: defer without writing a decision
  or copying/deleting data. Ordinary SPA navigation and course switching do not
  prompt again in that provider lifecycle. A fresh sign-in/reload may offer the
  still-undecided records again. Deferral is not a persisted import decision.
- **Profile → Guest learning**: manually rechecks and reopens a deferred/new
  offer. If everything is already handled or there are no guest records, a
  message says “No new guest learning found on this device.”

Guest mode is never prompted. Auth/callback/recovery screens, Edit Profile and
study-session routes do not display the modal. A successful Auth callback may
redirect to Home, where an offer is appropriate. Recovery authority also blocks
the service until recovery completes. An offer already prepared before entering
a suppressed route can be displayed after returning to an eligible screen.

## Errors, pending work and account changes

The UI sets pending before starting a choice, disables actions and suppresses
Escape/backdrop dismissal while saving. Repeated choices are ignored. A failure
keeps the dialog open without a success message; **Recheck guest data** obtains a
fresh summary/opaque offer. Source changes require that fresh offer before a
new decision. Read/quota problems retain guest data and do not report success.
Unexpected upstream text is replaced by generic guidance.

Inspection failures appear in a notice with recheck/dismiss controls. Profile
handles unreadable collection caches with a recovery-preserving message and a
retry button, rather than throwing during render.

The controller discards delayed UI results after sign-out, owner/generation
changes or unmount. The service separately checks verified ownership/generation
before its write. Same-account revalidation invalidates an old read-only offer
and automatically prepares a fresh one if it was being checked/displayed. It does
not reopen a deferred offer or remount a running study deck. If an explicit save
was pending, it requires manual re-entry and does not silently resubmit that choice
under a new generation. Another browser tab may trigger same-account revalidation.

Saved choices are account-specific on this origin. Another account must make
its own explicit choice. Logout restores the original guest cache; logging back
in retains that account's decision and imported local rows. A lost response can
reconcile as “already handled” rather than adding duplicate records or claiming
new data was added. See the core document for incremental-import and deletion
semantics, quota limits and remaining cross-tab write-race limitations.

## Architecture

`GuestImportProvider` lives inside Router and above `CourseShell`, below verified
Auth and the owner boundary. It persists through ordinary route/course changes.
`guestImportController.js` controls offers, pending/error/notice state and request
invalidation; it does not select storage owners or write data. The existing
service owns verification and persistence. The dialog remains presentation-only.

`Layout` consumes a learning revision to remount only its Outlet after a confirmed
merge/reconciliation. Session/owner verification alone never advances that
revision. Notices are placed in the main content, receive focus when ready, and
are hidden during study sessions. Sidebar styling, collapse behavior, original
icons and global brand tokens are unchanged.

## Local validation and limits

The local suite covers the core service plus controller lifecycle, stale results,
StrictMode cleanup/setup, explicit deferral, confirmation-only success, repeated
actions, malformed results and route suppression. Chromium checks exercise the
installed Supabase SDK with intercepted Auth/profile responses and synthetic
users; learning persistence uses native localStorage/crypto, including a real
browser quota rejection. They are not hosted Auth/RLS acceptance tests.

The browser checks cover login → defer → Profile re-entry → verification/source
errors → recheck → pending → merge → refreshed counts → reload → logout/login,
account B's separate account-only decision, malformed caches, quota/retry,
same-account revalidation during study, and cross-tab sign-out during a pending
choice. Five viewport widths (320/375/768/1024/1440), 200% root text, default/error/
pending states and a dev-only long multilingual-label component harness are
checked. Final result counts are recorded in development-log.md.

Final checks: 160 Node tests; lint zero errors/eight existing warnings;
unconfigured and synthetic-configured builds; 49 production + 52 development
browser checks across 90 layout states, plus nine unconfigured smoke checks.
Screenshots inspected. No uncaught browser errors or unexpected requests.

No real email, password, account, database or Storage write was performed in
this workspace. The only intercepted remote mutations are synthetic Auth
login/logout. There is no learning RPC, new SQL migration, service key, cloud
hydration or background sync. Safari, physical devices and the combined flow
with PT's actual configured test accounts still need acceptance.

Subsequent PT acceptance: the configured device-only offer displayed two Chinese
saved words, merge reflected them in the signed-in Home, and PT reported all the
provided refresh/logout/login checks worked. The initial automatic-offer timing
defect is fixed by refreshing read-only offers after same-user revalidation; eight
targeted Chromium checks cover it. Hosted cloud import remains unactivated and
Safari/physical-device acceptance remains separate.

## PT's configured local acceptance

Use the same localhost origin throughout. As a guest, save a recognizable word
in Dictionary and optionally add a card to Review. Sign in to a test account,
choose Decide later, then Profile → Guest learning → Merge guest data. Confirm
the expected lists/counts and the device-only message. Refresh and logout/login;
the account rows should remain and the same handled offer should not repeat.
Logout should still show the original guest words. With a second test account,
choose Use account data only and confirm it does not inherit the first account's
cache. Never use browser storage clearing as an import/reset test on real data.
