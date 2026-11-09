# Revealed swipe investigation

Base: `da73e7a316fac48cf7ab24ff9a7ebeb7311ab5df`.

This patch diagnoses the reported Safari failure; it does **not** claim to fix it.
The client recording shows front-face swipes advancing to 5/10, then the revealed
card moving sideways and returning to rest without advancing. A recording alone
cannot distinguish a cancelled pointer from a rejected distance/velocity.

## Preview workflow

1. Apply this patch to a separate branch based on the accepted release. Deploy a
   Vercel Preview with the existing preview configuration, not production/main.
2. Open `/learn/session?level=N5&gestureDebug=1` on that preview. For HSK1 use
   `/learn/session?level=HSK1&gestureDebug=1`. Select the matching language first.
3. Reveal a card and repeat the failing swipe. Capture the small diagnostic banner
   in the screenshot or recording. No device inventory or developer console needed.
4. Fix the observed failure path and verify it on that same device before release.

| Banner result | Meaning |
| --- | --- |
| `cancelled` | A pointer/touch cancellation occurred; zero progress is intentional. Investigate native scroll arbitration. Do not turn cancellations into commits. |
| `below-threshold` | Displacement and speed did not meet the existing commit rules. Compare the displayed dx, vx, limit and viewport. |
| `direction-conflict` | Displacement and release velocity did not agree with an accepted direction. |
| `commit-rejected` | The session declined the swipe. Check session locking, card identity and any visible persistence error. |
| `locked` / `inactive` | The drag ended while that card was locked or inactive. |
| `accepted-left` / `accepted-right` | The session accepted the swipe. If the screen remains stuck, investigate exit/presence cleanup. |

The banner is opt-in (`gestureDebug=1` exactly), does not receive pointer input,
and keeps only the latest report in React memory. It makes no diagnostic network
requests or storage writes and includes no card content, account identifiers,
credentials or tokens. Normal URLs render no banner. Thresholds, animation timing,
layout, progress persistence and cancellation safeguards are unchanged.

## Validation

Run `npm run lint`, `npm run build`, `git diff --check`, and
`node --test tests/swipeGestureBrowser.test.js` with Chrome/Edge available.
Use `CHROME_BIN` to select a local executable when necessary.

The added browser regression checks normal-mode invisibility, short-drag rejection,
cancel-with-zero-progress, a successful revealed N5 swipe and non-intercepting UI.
WebKit engine checks are useful but do not substitute for a physical Safari check;
in the Linux WPE runner native vertical scrolling is not simulated, even for a plain
scrollable control. Do not report that missing capability as an application failure.
