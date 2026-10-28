# Responsive UI checkpoints — 28 October 2026

These checkpoints are chronological. The existing-screen pass is recorded under
[Remaining screens and interaction review](#remaining-screens-and-interaction-review),
followed by the latest [brand identity alignment](#brand-identity-alignment).
Earlier test counts and remaining-work notes describe their original checkpoints.

## Delivered in this checkpoint

- Original blue palette retained: primary `#0369A1`, secondary `#0284C7`, navy `#0C4A6E`, light-blue surfaces, white cards, and existing status colors.
- Home now has a clear greeting/language header, featured level card, keyboard/touch level controls, practice counts from device storage, and existing learning shortcuts. Shadows and floating card art use the original palette.
- The selected level opens its actual existing level route. Course completion is visibly labelled **Sample progress** until the real-progress milestone; Home saved/review counts no longer use Chinese demo totals.
- The shared frame uses full available width, a fixed desktop sidebar at 1024px+, and a floating bottom navigation on phones/tablets. Session routes still hide main navigation. Existing navigation destinations remain accessible. Premium remains accessible from existing account screens; the Home purchase promotion was removed because payments are excluded from this release.
- Real links/buttons replace Home's click-only containers. Added visible keyboard focus, skip-to-content, live level announcements, and CSS reduced-motion support. The existing JavaScript language-switch splash behavior is retained.
- Long names wrap rather than widening the page. Navigation/controls have consistent shapes and spacing. Language flags are vectors so flag-emoji availability does not affect the picker or switch splash.
- Inter and JetBrains Mono are retained. Self-hosted Noto Sans Myanmar, Noto Sans SC and Noto Sans JP supply script coverage; Japanese and Chinese have course-specific CJK preference. All font files carry their upstream licenses and pinned Fontsource provenance in `public/fonts/README.md`.
- Font subsets are requested on demand by Unicode range. Available font assets total approximately 10.6 MB; they are not all fetched on every visit. No Google Fonts connection is required. Public font CSS is linked separately to avoid duplicating fonts in Vite's generated asset directory.

## Verification performed

Production build tested with headless Chromium 153 through Playwright, using a clean guest browser and no Supabase credentials:

| Home viewport width | Document/main horizontal overflow |
| --- | --- |
| 320px | None |
| 375px | None |
| 768px | None |
| 1024px | None |
| 1440px | None |

- Visually inspected production screenshots at phone and desktop widths, including Japanese mode.
- Next-level control selects HSK 2; **Open level** navigates to `/learn/level/HSK2`.
- Chinese-to-Japanese switching updates Home to N5 after the existing splash completes.
- `/learn`, `/learn/level/N5`, `/learn/session`, `/library`, `/profile`, `/settings`, `/login`, and `/signup` load without uncaught page errors or main/document overflow at 375px and 1440px. Navigation is hidden on study sessions and Auth routes. Auth routes display their explicitly unconfigured guest state in this test environment.
- Keyboard first focus reaches **Skip to content**. Reduced-motion preference shortens CSS transitions.
- A long Burmese/Japanese name at 320px stays within the Home width. Chromium's rendered-font inspection confirms actual custom Noto Sans Myanmar and Noto Sans JP glyphs, with Inter for Latin spacing.
- Browser page errors: zero.
- `npm test`: 57 passed, zero failures. Existing tests cover account lifecycle, local owner isolation, callback recovery, and migration policy simulations.
- `npm run lint`: zero errors, 12 existing warnings (the two removed imports in touched navigation/layout files account for the reduction from 14).
- `npm run build`: passed; approximately 974 kB JS / 278 kB gzip. The existing large-JS-bundle warning remains; the ineffective dynamic-import warning from Home has been removed.
- `git diff --check`: passed.

## Next review and limits

PT should review Home on the staging-configured laptop and agree on the visual direction before we refine the remaining screens. Course/session/review/library/profile/settings page-specific layouts are subsequent checkpoints; loading those routes here is a smoke check, not a full redesign or full feature test.

No Auth lifecycle, hosted schema, security policies, environment credentials, content source files, or payment integrations were changed. Existing other languages/levels and helper routes remain present in the source; this checkpoint does not expand the agreed HSK 1 / N5 delivery scope. Physical iPhone/iPad/Android, Safari/Firefox, hosted authenticated UI, and complete accessibility audits were not tested in this environment.

## Follow-up: compact featured level card

PT requested a smaller HSK flashcard widget. Reduced card padding, body spacing, title size and decorative card art. Primary/secondary actions remain readable and at least 44px high; desktop actions no longer stretch across the entire card. The redundant leading icon on Open level was removed so both actions fit on one row at 320px.

Production Chromium measurements after the change: card heights approximately 276px at 320px, 282px at 375px, 298px at 768px, 290px at 1024px, and 300px at 1440px. Home/main horizontal overflow and page errors remain zero. Selected-level navigation, Japanese switching, existing-route smoke checks and the long multilingual-name check still pass. Build, lint (zero errors / 12 existing warnings), and whitespace checks pass. The 57-test suite result above belongs to the preceding checkpoint; it was not rerun for this presentation-only adjustment.

## Follow-up: vocabulary SwipeSession

The page-specific responsive pass now includes `/learn/session` and `/learn/review/session`. It retains the original blue palette, introduces class-based layout, readable answer/example typography, a capped 400×480px desktop card, flexible phone sizing, scrollable answers, safe-area padding and short-screen scrolling. Reveal/Show word provides a keyboard alternative to tapping the card; motion reduction and inactive-face accessibility are handled in the session.

Production Chromium checks at 320/375/768/1024/1440px, plus 667×375 landscape, passed without horizontal overflow. Japanese/English at phone and desktop widths, long words and multilingual answers were also inspected. Desktop mouse drag and emulated-phone touch drag advance cards; review insertion/removal, shuffle, keyboard reveal and display preferences pass. Local guest mode works without backend credentials. Tests: 57 pass; lint: zero errors, 10 warnings; build and whitespace checks pass. See the development log for precise coverage and limits.

This does not complete responsiveness for the rest of the app. Next: LessonPicker, SavedWords, ReviewWords, Library and Profile. Physical devices, Safari, staging/Vercel preview and hosted Supabase verification remain outstanding. `main` and deployment were not changed.

## Follow-up: lessons and word collections

LessonPicker, SavedWords and ReviewWords now use the same blue visual direction and class-based layout. Lesson overview/modules adapt from a phone stack to a desktop course column, and vocabulary rows show readable readings/meanings with audio controls. Saved/Review have consistent word cards, search, true counts and explicit empty states.

Review displays the real queue; opening Saved does not seed demo bookmarks. Existing bookmarks remain. Saved practice uses its own actual records through the responsive session, and selected-level practice cannot silently substitute another level. Course completion samples remain visibly labelled; the unsupported offline badge was removed. Seven Node tests cover the row adapter, session-source/level isolation and search. No dependencies, assets, hosted configuration or Auth lifecycle changed.

Verification: **64 tests pass**, lint **0 errors / 10 warnings**, production build/whitespace checks pass. Chromium production checks covered 49 language/screen/width/empty/long-text combinations with no horizontal or measured text overflow. Search, audio-button state, saved practice/preservation/keyboard removal/reload, review completion, legacy level links and empty higher levels were exercised. See the development log for exact coverage. The existing vocabulary gesture checks are separate from these new Node tests.

Next UI checkpoints: Library and Profile. Safari/physical-device, Vercel staging and hosted Supabase verification remain pending. `main` and deployment are unchanged.

## Follow-up: Library and Profile

Library/Profile now share the blue visual direction and responsive study frame. Library has a working tool search, keyboard grid/list controls, real current-course collection counts and clear unavailable-tool labels. Profile uses real saved/review counts, wrapping account identity, native language/goal selectors and a keyboard auto-play switch. The existing Auth/Profile hooks and language/preferences persistence remain authoritative. Pending features are marked Soon; guest text does not promise learning-data sync.

Verification: 46 Chromium production layout combinations across three languages, grid/list/Profile, five widths and one injected long-name/email case, with no measured overflow. Search, keyboard controls, goal/audio persistence and Settings agreement, language switching, guest Auth links, navigation clearance and reduced motion passed. Server rendering simulated connected/error/pending identity views without effects; hosted Auth/profile/logout are unverified. Existing tests: **64 pass**; lint **0 errors / 10 warnings**; build/whitespace checks pass.

The requested core-screen sequence is complete through Library/Profile. This is not a claim that every helper, phrase or Settings screen has received a full responsive refinement. Staging configuration/preview, hosted account checks, Safari and physical-device review remain pending. Main and production deployment are unchanged.

## Follow-up: narrow-screen Settings

A 90-layout smoke audit of the remaining main learning/phrase/settings/dictionary routes found clipped Settings labels at 320/375px while the document itself did not overflow. Settings now has scoped responsive rows, stacked phone values, two-column desktop groups, vector language flags, native keyboard-operable rows/switches and a focus-managed option dialog. Existing preference/data operations and confirmation prompts are retained; unfinished About actions are labelled Soon.

Targeted Settings/dialog checks cover 22 layout states plus keyboard/focus, persistence/Profile agreement, accent/language switching, synthetic-data clear cancel/confirm and JSON export. Tests: 64 pass; lint zero errors / 10 warnings; build/whitespace checks pass. No full page redesign or complete functional test is claimed for the other audited helper routes. Owner-authorized preview access and hosted checks remain pending; PT requested progressing with independent local work meanwhile.

## 28 October — stacked-card icon refinement

Home, the shared desktop/mobile navigation and Library now use a single SVG
illustration family based on PT's fourth reference (layered white cards, sky-blue
back cards, soft shadows). Existing blue/navy colors and readable labels are
retained. Other small action controls remain concise line icons.

Validation: 92 tests pass; lint 0 errors/10 existing warnings; build passes.
Chromium layout checks cover 45 Home/Library combinations across three courses,
grid/list and five widths (320–1440), plus keyboard navigation/search/carousel
interactions. No new UI unit tests were added for decorative art. These checks do
not complete the remaining Phrases/helper-screen pass, hosted Auth validation,
Safari or physical-device testing. SMTP activation is still pending.

## Remaining screens and interaction review

The existing-screen responsive pass now includes level selection, phrase levels
and sessions, Dictionary, LanguageSwitcher, radicals, Kana, English sounds,
writing, example notifications and plan previews, alongside the previously
refined Home, vocabulary sessions, collections, Library, Profile and Settings.
The original white/sky-blue/navy palette, stacked-card illustrations and each
helper's existing accent colors remain. No app dependency, font or audio asset
was added.

- `/learn` and `/flashcards` share a responsive level overview. Available counts
  come from the actual local course content; unavailable phrase levels show an
  empty state rather than starting another level's deck.
- Phrases reuse the vocabulary session presentation and gestures through a
  read-only card adapter. Phrase practice stays session-only and cannot insert
  colliding phrase IDs into vocabulary review. Directly opened sessions have a
  deterministic parent destination when leaving or finishing.
- Dictionary remains available: it supplies real Saved Words entries. Search,
  recent-search history, bookmarks, speech and collection sessions retain the
  owner/language-scoped local database API.
- Helper layouts have responsive class-based styles and constrained desktop
  widths. The writing SVG resizes to its container. Language, quiz, radical
  detail and Premium dialogs use native modal focus/inert behavior, Escape and
  opener restoration. In Chromium, Tab can visit browser chrome between cycles;
  background page controls remain excluded.
- Topic practice is visibly Coming soon, notification data is labelled as
  examples, and Premium is a plan/pricing preview without checkout. Working
  learning helpers remain accessible; this does not promise their inclusion in
  the contracted release scope.
- Scrollable flashcard faces declare `touch-action: pan-y` themselves. Declaring
  it only on the outer card lets the inner scroll container cancel horizontal
  touch drags. Both vertical answer scrolling and horizontal swiping were
  verified after the fix. Mobile navigation wraps enlarged labels and reserves
  its measured height instead of assuming a fixed bar height.

Verification in a clean guest environment without Supabase credentials:

- **95 Node tests pass**, including three phrase-level/adaptation regressions;
  lint has **0 errors / 8 existing Fast Refresh warnings**. Production build
  and whitespace checks pass. The existing large-JS-chunk warning remains.
- Chromium 153 production checks cover **445 route, result, empty and modal
  layouts** across Chinese/Japanese/English at widths 320/375/768/1024/1440.
  No measured document/main/modal horizontal overflow, clipped inspected text,
  unnamed visible buttons, uncaught page errors or external requests occurred.
  Course-gated helpers redirect to Library in unsupported languages.
- Development StrictMode checks cover real course switching, modal keyboard
  cycles/Escape/focus return, selected plan preview, Dictionary speech dispatch,
  history persistence, save → saved session → unsave, phrase reveal/audio,
  shuffle/completion, vocabulary review insertion/removal, mouse and emulated
  touch drags, complete/restart radical (5-question), Kana and sound (10-question)
  quizzes, writing controls/SVG resizing, notifications and Settings selection.
- Additional normal-motion checks cover repeated-action guards, direct-session
  exit, long bilingual answer scrolling, horizontal touch after vertical scroll,
  short landscape controls and enlarged text. Navigation and level tiles are
  checked at normal and doubled root text size across the five widths.
- Speech calls are intercepted for verification; audible voice quality is not
  tested. Touch uses Chromium emulation, not a physical phone. Screenshots were
  inspected at phone and desktop sizes; automated geometry checks do not replace
  a complete visual/accessibility audit.

This completes this pass over existing screens, not every future feature UI.
Edit Profile/avatar, guest-import choices, account deletion/reauthentication,
privacy/terms pages, cloud sync status and sign-out-everywhere still belong to
their feature milestones. Hosted Auth/email acceptance, SMTP activation,
staging preview, Safari/Firefox and physical devices remain unverified. `main`
and the production deployment were not changed.

## Brand identity alignment

PT clarified that the improved responsive UI should keep the client's original
brand identity. The current layouts, stacked-white-card illustrations, readable
fonts and study interactions remain. The original Lucide symbols now appear
inside the illustrations, and navigation uses the original Home / Layers /
Library / MessageCircle / User symbols directly. The mobile Library shortcut
regains its original blue circular emphasis.

All ten global `--color-*` tokens already matched the pre-responsive source
exactly; they remain unchanged. Restored the original tool color families from
`195ec0a^:src/pages/Library.jsx` and `4a4ff64^:src/pages/Home.jsx`: review red,
saved green, Dictionary orange (Home search purple), phrases blue, radicals
indigo, Kana pink, sounds cyan, writing teal and the other original tool accents.
Level cards use the existing course level accent colors. These are accents on
the current white/blue layout, not a new palette or a rollback of responsiveness.

Validation: **95 tests pass**, lint **0 errors / 8 existing warnings**, production
build and whitespace checks pass. Chromium checked **105 affected layouts**
(three courses, Home, Library grid/list, vocabulary/phrase overviews and two
phrase levels, at five widths), plus search and selected-level navigation.
**37 navigation/enlarged-text/reachability checks** also passed. No measured
overflow, unnamed inspected buttons, uncaught page errors or external requests.
Phone Home and desktop Library screenshots were visually reviewed. Earlier
gesture/Auth results above belong to their respective checkpoints; those flows
were not modified here. Safari and physical-device review remain pending.
