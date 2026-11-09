# Vertical scroll isolation (incremental patch)

Base: `a1a7840` on `fix/revealed-swipe-diagnostics`.

The iPhone recordings IMG_1834 and IMG_1835 show working horizontal swipes in N5 and HSK1. Native vertical scrolling can normally emit pointercancel; that alone is not a failed swipe. The remaining risk is Motion following sideways finger jitter while the answer scrolls, and a delayed scroll click flipping the card.

When the existing touch guard first resolves a vertical gesture, cancel Motion's drag session using the public DragControls.cancel API and reset its horizontal offset. Leave native scrolling enabled. Do not call stop, which can invoke onDragEnd. Meaningful touch movement/cancellation suppresses trailing clicks until a fresh primary pointerdown; keyboard activation and fresh taps remain available.

The existing horizontal ownership rule, swipe thresholds, velocity handling, persistence safeguards, flip animation, and layout remain unchanged.

Validation: new mounted-component regression test covers both HSK1 and N5, vertical-first gestures with later horizontal drift and no browser cancellation, no progress writes, delayed clicks, and a fresh touch flip. The old a1a7840 source fails the centered-card assertion; the patched source passes. Run the complete gesture suite, lint, and build before pushing.

Apply only to the existing preview branch. Do not merge main until the iPhone 11 preview check confirms vertical scrolling is smooth and horizontal swipes still work. Linux WebKit automation cannot certify physical iOS scrolling.

Local verification: Node 22.14 Chromium gesture suite 32/32 passed on confirmation run. First full run had a release-continuity timing failure (31/32); that unchanged test passed individually and the complete confirmation run passed without assertion changes. Lint: zero errors, nine pre-existing warnings. Production build and git diff --check passed. Linux WebKit horizontal regression checks: 8/8 passed (HSK1/N5, both directions, 120/250ms into flip). Patch applies cleanly to a1a7840. These results do not replace the physical iPhone scroll check.
