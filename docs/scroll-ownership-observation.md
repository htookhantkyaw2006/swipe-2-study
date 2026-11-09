# iPhone fast-scroll comparison

Base commit: `2a03eb5`. Apply to the existing `fix/revealed-swipe-diagnostics` preview branch only.

IMG_1836.MP4 and PT's iPhone 11 Safari report confirm the second candidate did not resolve the reported fast vertical scrolling difficulty. Reveals and horizontal swipes work. The old banner shows native pointercancel and Motion offsets of zero during many vertical gestures; it does not expose raw touch movement, guard decisions, or actual scroll position. The recording does not show finger positions, so it cannot establish incorrect axis ownership by itself.

This patch adds observation and an opt-in comparison mode. It does not tune the axis rule or claim to fix fast scrolling.

- Normal URL: `/learn/session?level=N5&gestureDebug=1`
- Scroll-only comparison: `/learn/session?level=N5&gestureDebug=1&gestureScrollOnly=1`
- Replace N5 with HSK1 for Chinese. Select the matching language/course at Home first, in the same browser. Preserve the deployment's share parameter on both URLs.

The normal debug mode preserves current drag behavior. The comparison disables the touch ownership guard, Motion horizontal drag, and explicit pointer capture while preserving card layout/flip and answer overflow. The banner explicitly states horizontal drag is disabled. Both parameters are required, so gestureScrollOnly alone has no effect.

The observer stores the first four raw dx/dy samples, final dx/dy, selected guard axis, actual guard preventDefault count, pointer cancellation, starting/ending scrollTop, scroll limit, observed scroll range, and scroll-event count. It publishes one summary 250ms after touchend/cancel. Native pointercancel is recorded without ending observation. No move/scroll-frame React updates, network calls, card content, or credentials are recorded. Scroll range describes only the gesture plus the 250ms settling window, not the entire momentum lifetime.

Physical check on iPhone 11 Safari: reveal an overflowing answer, make several fast vertical flicks in normal mode, pause about one second after each, and record the banner. Repeat on the same card/content in scroll-only mode. Then return to normal mode to verify horizontal swipes.

Interpretation:
- x axis + blocked > 0 during an intended vertical flick: initial axis ownership is a concrete candidate. Consider a stronger horizontal dominance requirement in the revealed scroller, with dedicated diagonal regression coverage.
- y axis + blocked 0 + scroll room remaining: do not tune axis thresholds based on that flick. Compare the scroll-only recording.
- Scroll-only is smooth: investigate guard/drag/capture interactions, keeping horizontal swipe safeguards.
- Scroll-only also stalls with room remaining: investigate overflow/3D layout/compositing and native scrolling. Do not infer this from pointercancel alone.
- At a scroll boundary, blocked movement is expected; use scrollTop/limit and gesture direction to distinguish it.

Automated coverage adds real Chromium native-scroll observation, ambiguous x=10/y=9 locking with later vertical drift (observed, not changed), and scroll-only gating, reveal, scrolling and lack of swipe/progress. Existing gesture assertions remain unchanged. Physical iOS comparison remains necessary.

Local verification: Node 22.14 Chromium suite 34/34 passed, zero failures/skips. Lint zero errors with nine pre-existing warnings. Production build and git diff --check passed. No additional physical-device fix is claimed by these checks.
