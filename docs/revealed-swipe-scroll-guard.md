# Revealed swipe scroll guard — preview candidate

Base: `39d9c0b`, branch `fix/revealed-swipe-diagnostics`.

Physical-device recordings confirm `cancelled | back | pointercancel`, including
dx -123px / dy 11px / vx -1510px/s with a 41px threshold. The separate Safari
recording also shows cancellation above threshold. This proves cancellation for
those attempts; it does not prove that every cancellation has the same cause.

The patch binds touch listeners to the stable outer card. A single-finger gesture
that starts horizontally prevents native scrolling for the remainder of that touch.
Vertical-first gestures, small tap movements, interactive controls and multi-touch
are left alone. End/cancel/unmount reset ownership. Flipping does not rebind the
listeners. Pointer capture keeps the pointer on the non-rotating outer card.

This targets scroll arbitration consistent with the WebKit report:
https://bugs.webkit.org/show_bug.cgi?id=232545

Actual cancellations still write zero progress. Commit thresholds, velocity rules,
directional agreement, animations, layout and persistence logic are unchanged.
The existing diagnostic mode remains available for the physical-device check.

## Validation and limits

Run `npm run lint`, `npm run build`, `git diff --check` and
`node --test tests/swipeGestureBrowser.test.js`. Set `CHROME_BIN` when needed.

Added browser checks cover horizontal ownership through vertical drift, native
vertical scroll, control/multi-touch exclusions, cancellation cleanup and stable
pointer capture during a flip. Existing failure/retry and exactly-once persistence
checks remain intact. Do not weaken existing flick thresholds or assertions to
accommodate a timing-sensitive host.

A serial WebKit 26.5 comparison checks both curricula, both directions, and 120ms /
250ms flip delays against the unmodified diagnostic build and this candidate.
All 16 checks pass when each injected move is allowed a browser animation frame.
Earlier unpaced/coalesced headless input checks timed out on both versions; those
failures are not evidence of a regression caused by this patch. The Linux WPE
protocol does not provide physical iOS scroll/compositor fidelity, so these checks
do not certify a fix on the reporting device.

## Release workflow

Apply on the existing diagnostic preview branch at `39d9c0b` so the existing branch
alias can be reused. Commit and push only that preview branch after validation.
Do not merge into main or deploy production yet. Return the latest deployment URL
and a shareable diagnostic session link. Select Japanese on the same origin before
opening `/learn/session?level=N5&gestureDebug=1` when preview content uses demo data.

On the reporting iPhone, verify the formerly cancelled horizontal swipe, swipe
during reveal, vertical scroll, and child controls. Only then prepare production
release. This candidate has not yet been tested on that physical device.
