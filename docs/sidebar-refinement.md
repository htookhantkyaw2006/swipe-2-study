# Sidebar alignment and collapse refinement

Based on the merged feature head `dfe10b4` (IDE-agent sidebar `fffef4d` plus
profile editing). The current original-color card icon family is retained.

## Reproduced before changing code

- In Chromium at 1440 × 600 on Library, main scroll was 300px before collapsing
  and 0px afterward. The newly inserted Show control received focus inside the
  scroller, moving the page to the top.
- Hide and navigation labels started at x=51 and x=64 respectively in that short
  layout. Separate flex/padding/height rules made the action row differ from the
  navigation column, and short-height rules shrank controls below 44px.
- Collapse used `display: none` and an immediate padding change. The Show control
  added a row only when collapsed; there was no continuous transition, and that
  control scrolled out of view. Scroll events synchronously parsed and wrote
  sessionStorage on every event.

## Current behavior

- One persistent control in a sticky desktop toolbar changes its label between
  Hide sidebar and Show sidebar. Both states reserve the same toolbar height.
  It is outside the hidden navigation and keeps keyboard focus without calling
  focus on a new offscreen node. Main scroll is preserved through a toggle.
- Desktop links use a 40px icon column plus a flexible label column, including
  Settings. Icons, active treatment, original palette and wordmark are retained.
  Short screens simplify the decorative note before reducing usable controls;
  sidebar scrolling remains available where needed.
- Transform/visibility animate the sidebar; main width and offset animate with
  the same 220ms easing. Collapsed main bounds fill the viewport without a left
  rail/gap. Readable page/card width caps remain inside that region.
- Collapsed desktop links become inert/aria-hidden immediately. A media-query
  subscription restores mobile navigation below 1024px even when the saved
  desktop preference is collapsed. Auth/study sessions omit both nav and toolbar.
  Reduced motion removes the transitions.
- Scroll writes are deferred for 150ms idle and flushed on route changes,
  pagehide and unmount. Only pending scroll information is kept in memory;
  defensive reads still tolerate unavailable/malformed sessionStorage. No account
  data, Supabase flow, profile service or hosted configuration was changed.

## Verified

- 116 Node tests pass; lint 0 errors / 8 existing warnings; production build and
  whitespace checks pass. One new test covers a sessionStorage property getter
  throwing before getItem/setItem can even be called. Existing chunk/fixture-port
  warnings remain.
- Chromium production and development StrictMode each passed 22 behavior checks
  and 60 layout states. Widths: 320/375/768/1024/1440, with short desktop height,
  Japanese/English Home, enlarged text and reduced motion included.
- Both modes preserved 300px scroll when collapsing/expanding, restored route
  scroll, retained focus on the control and remembered collapse across reload.
  Fifteen scroll changes produced one cache write in the recorded sample.
- Animation sampling found intermediate main widths/offsets within viewport
  bounds. This confirms a continuous transition in the tested environment, not
  a guarantee of frame rate on other hardware or pages.
- Desktop hidden-link inertness, mobile usability after a saved collapse, browser
  resize, full collapsed width, same-column labels, keyboard toggling and the
  navigation-free Auth/session routes passed. No measured document/nav/main
  horizontal overflow, clipped inspected labels, uncaught page errors or
  external requests. Phone and desktop screenshots were inspected.

Safari, physical devices and PT's subjective smoothness review remain part of
final acceptance. To review, scroll partway down Library and toggle repeatedly:
content should stay at its current scroll position, expand horizontally, and
keep the control visible. Repeat after resizing to mobile and back.
