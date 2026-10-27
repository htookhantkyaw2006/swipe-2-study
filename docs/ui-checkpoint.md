# Home and responsive app frame — 28 October 2026

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
