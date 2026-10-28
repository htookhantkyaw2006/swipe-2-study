# Guest Import Dialog

Integrated after the original IDE-agent checkpoint `3d85c61`. The current
device-only flow is described in [guest-import.md](guest-import.md). Parent
integration adds an optional `onReload` callback and explicit device/cloud-limit
copy. The original agent's validation report below is historical; combined
browser results are recorded in development-log.md.

## 1. Overview and Purpose

`GuestImportDialog` is an isolated presentation component for Swipe 2 Study. When a learner signs in or creates an account on a device that already holds guest learning records, this dialog presents a choice between:
- **Merging** the local guest learning data into their account, or
- **Using account data only** (leaving this device's guest records unmerged).

It also provides a **"Decide later"** option to defer the decision.

---

## 2. Ownership Boundaries

To keep architectural responsibilities decoupled and testable, ownership boundaries are strictly partitioned:

| Domain | Owner | Responsibility |
|---|---|---|
| **Presentation & Accessibility** | `GuestImportDialog` | Dialog markup, responsive styling down to 320px, accessible labeling, pending state indicators, and error presentation. |
| **Import & Merge Service** | Integrating developer | Deduplication, conflict resolution and atomic device-cache decisions. No cloud progress writes. |
| **Auth & Routing** | Another Developer | Checking whether guest records exist upon login/signup, mounting the dialog, and routing. |
| **Persistence & Cache** | Integrating developer | Owner-scoped effective table reads, the import document/receipt and preserving original guest records. |

The component performs **no side effects**:
- No `localStorage` or `sessionStorage` access.
- No Supabase client calls or network requests.
- No Auth coordinator or user session hooks.
- No navigation or URL history manipulation.

---

## 3. Component Contract & Props

The component is exported as the default export from `src/components/GuestImportDialog.jsx`:

```jsx
import GuestImportDialog from './components/GuestImportDialog.jsx';
```

### Props Table

| Prop | Type | Default | Description |
|---|---|---|---|
| `open` | `boolean` | `false` | When `false`, returns `null`. Mounts `AppDialog` only when `true`. |
| `summary` | `Array<SummaryItem>` | `[]` | Array of per-language summary items (detailed below). |
| `pending` | `boolean` | `false` | When `true`, disables all actions, suppresses dialog dismissal, renders "Please wait…", and sets `aria-busy="true"`. |
| `error` | `string \| null` | `null` | When non-empty, displays an accessible `role="alert"` banner while keeping the dialog open for retry. |
| `onChoose` | `(choice: 'merge' \| 'account-only') => void` | `undefined` | Callback invoked with the learner's explicit choice. |
| `onClose` | `() => void` | `undefined` | Callback invoked when the user dismisses or defers (close button, Escape, backdrop click, or "Decide later"). Never implies a choice. |
| `onReload` | `() => void` | `undefined` | Optional recheck action shown after an error; the parent obtains a fresh source summary/offer. Disabled while pending. |

### `SummaryItem` Shape

```typescript
interface SummaryItem {
  languageId: string;       // e.g. 'zh', 'ja', 'en'
  languageLabel: string;    // e.g. 'Chinese (HSK 1)', 'Japanese (JLPT N5)'
  savedWords: number;       // Count of bookmarked / saved words
  reviewWords: number;      // Count of cards in the review queue
  progressRecords: number;  // Count of writing / drill progress records, not completed lessons
}
```

---

## 4. Callback Semantics

- **`onChoose('merge')`**: Learner explicitly selected **"Merge guest data"**. The parent triggers the merge workflow.
- **`onChoose('account-only')`**: Learner explicitly selected **"Use account data only"**. The parent preserves current device account data and records the decision without importing guest records.
- **`onClose()`**: Learner clicked **"Decide later"**, the header close button (`X`), pressed the Escape key, or clicked the dialog backdrop. **Dismissal never implies either choice** and must not trigger data migration or deletion.
- **Dismissal Suppression**: When `pending === true`, all close triggers (Escape, backdrop click, close button, decide later) are inert; `onClose` is not invoked.

---

## 5. UI & Accessibility Details

1. **Title**: "Bring your guest learning with you".
2. **Progress Labeling**: Progress is strictly labeled as `"progress records"`. No percentages, completion ratios, or invented totals are generated.
3. **No Preselection**: Neither choice is preselected, autofocus-selected, or automatically submitted.
4. **Responsive Coverage**:
   - `320px` (narrow mobile): Actions and summary stats wrap cleanly without horizontal scrollbars.
   - `375px` to `768px` (standard mobile and tablet): Fluid padding with contained layout.
   - `1024px` and `1440px` (desktop): Centered modal dialog using existing `AppDialog` constraints.
   - Touch targets for all buttons and interactive controls are at least **44px**.
   - Long language labels use `overflow-wrap: anywhere` to prevent clipping or layout breakage.
5. **Brand Identity**: Reuses the approved Sky/Navy/Blue color palette and design tokens (`--color-primary-blue`, `--color-secondary-blue`, `--color-text-navy`, `--color-ghost-blue`, `--color-border`, `--color-page-bg`).

---

## 6. Verification and Validation Results

Original IDE-agent report at `3d85c61`:

- **`npm test`**: **116 passed / 116 total** (0 failures).
- **`npm run lint`**: **0 errors**, 8 pre-existing fast-refresh warnings preserved.
- **`npm run build`**: **Success** (`dist/` build completed cleanly in 3.42s).
- **`git diff --check`**: Clean (no trailing whitespace or conflict markers).
- **Component Harness Checks**:
  - `open=false` renders `null`.
  - `open=true` renders title, per-language summary stats, action buttons, and hints.
  - `pending=true` disables buttons, shows "Please wait…", and sets `aria-busy="true"`.
  - `error="…"` renders `role="alert"` for accessibility.
  - Empty `summary=[]` renders an honest empty state without inventing metrics.
  - Long multilingual course labels render cleanly without breaking layout.

### Remaining acceptance
- The integrating developer now browser-tests the component and combined flow in
  Chromium using the installed SDK and simulated responses. SSR rendering alone
  did not establish layout, focus or click behavior.
- Physical iOS/Android, Safari and actual configured Supabase account acceptance
  remain pending. Learning cloud sync is not part of this implementation.
