# Global Sign-Out Dialog

## 1. Overview and Purpose

`GlobalSignOutDialog` is a compact, isolated confirmation dialog for Swipe 2 Study. When a user requests to sign out from all active devices, this dialog asks for explicit confirmation before terminating active sessions.

It explains the scope of the action:
- The user will be signed out on the current device and other active devices.
- Already-open pages may briefly stay signed in.
- Locally stored learning data on the current device is preserved.

---

## 2. Ownership Boundaries

This component is purely presentational and strictly decoupled from application side effects:

| Responsibility | Owner | Scope |
|---|---|---|
| **Presentation & Accessibility** | `GlobalSignOutDialog` | Dialog structure, accessible labelling, focus inheritance via `AppDialog`, pending states, error rendering, responsive layout. |
| **Authentication & Session Revocation** | Integration Developer | Calling Supabase global signOut (`scope: 'global'`), token invalidation, and session cleanup. |
| **Storage & Cache Coordination** | Integration Developer | Resetting local active owner, clearing session caches, and preserving guest data. |
| **Navigation & State Management** | Integration Developer | Toggling the `open` prop, tracking `pending` / `error`, and redirecting upon completion. |

The dialog contains:
- No Supabase client imports or calls.
- No Auth hooks or context subscriptions.
- No `localStorage` or `sessionStorage` reads/writes.
- No `fetch` or network requests.
- No client-side routing or timers.
- No automated actions merely because the dialog opens.

---

## 3. Component Contract & Props

The component is exported as the default export from `src/components/GlobalSignOutDialog.jsx`:

```jsx
import GlobalSignOutDialog from './components/GlobalSignOutDialog.jsx';
```

### Props Table

| Prop | Type | Default | Description |
|---|---|---|---|
| `open` | `boolean` | `false` | When `false`, returns `null`. Mounts `AppDialog` only when `true`. |
| `pending` | `boolean` | `false` | When `true`, disables both buttons, suppresses dismissal, sets `aria-busy="true"`, and changes confirm label to `"Signing out…"`. |
| `error` | `string \| null` | `null` | When provided, displays an accessible error banner with `role="alert"`. Keeps dialog open for retry. |
| `accountLabel` | `string` | `''` | Optional account display string (e.g. email or username) rendered as ordinary text. |
| `onConfirm` | `() => void` | `undefined` | Callback invoked when the user confirms sign-out. Does not auto-close the dialog. |
| `onClose` | `() => void` | `undefined` | Callback invoked when the user cancels, presses Escape, or clicks the backdrop. |

---

## 4. Callback Semantics

- **`onConfirm()`**:
  - Invoked strictly when the user clicks the **"Sign out on all devices"** button.
  - Does **not** close the dialog automatically. The parent handles the asynchronous revocation and updates `pending` / `open` accordingly.
  - While `pending === true`, clicking the button is a no-op.
- **`onClose()`**:
  - Invoked when the user clicks **"Cancel"**, presses the **Escape** key, or clicks the dialog **backdrop**.
  - Never implies confirmation.
  - While `pending === true`, all dismissal triggers are suppressed (`onClose` is not called).

---

## 5. UI and Accessibility Details

1. **Title & Accessible Label**:
   - Both accessible label on `AppDialog` and visible heading are `"Sign out on all devices?"`.
2. **Two Buttons Only**:
   - Exactly two buttons are rendered: `"Cancel"` and `"Sign out on all devices"` (changing to `"Signing out…"` during pending).
3. **Explanations Provided**:
   - `"You will be signed out here and on your other devices. Some already-open pages may stay signed in briefly."`
   - `"Saved learning data on this device will be kept."`
4. **Error Handling**:
   - Displayed with `role="alert"`. The dialog stays open so the user can review the error and retry by clicking confirm again once `pending` is reset to `false`.
5. **Pending State**:
   - Sets `aria-busy={pending}` on the content container.
   - Both buttons have `disabled={pending}`.
   - Confirm button label switches to `"Signing out…"`.
6. **Responsive Sizing & Touch Targets**:
   - Tested across `320px`, `375px`, `768px`, `1024px`, and `1440px`.
   - On narrow screens (`< 480px`), buttons stack vertically with full width to accommodate the 24-character label without clipping.
   - Touch targets for both buttons are at least `44px` in height.
   - Long account labels wrap via `overflow-wrap: anywhere` and `word-break: break-word`.
7. **Styling & Design Tokens**:
   - All classes begin with `global-signout-dialog`.
   - Reuses brand CSS variables (`--color-text-navy`, `--color-primary-blue`, `--color-ghost-blue`, `--color-border`, `--color-page-bg`, `--color-danger-red`, `--radius-btn`).
   - Visible keyboard focus ring (`:focus-visible`).
   - Disables button transitions when `prefers-reduced-motion: reduce` is active.

---

## 6. Checks Performed and Validation Results

- **`npm test`**: **116 passed / 116 total** (0 failures).
- **`npm run lint`**: **0 errors**, 8 pre-existing fast-refresh warnings preserved.
- **`npm run build`**: **Success** in 1.34s (`dist/assets/index-MDcuJipq.js`, 922 kB / 275 kB gzip).
- **`git diff --check`**: Clean (no whitespace issues).
- **Component Harness Checks**:
  - `open=false` returns `null`.
  - `open=true` renders accessible title, explanatory messages, account label, and exactly two buttons.
  - `accountLabel` absent: does not render empty container.
  - Long `accountLabel` (e.g. 80-character email) renders with proper text wrapping.
  - `pending=true` disables both buttons, suppresses dismissal, sets `aria-busy="true"`, and displays `"Signing out…"`.
  - `error="…"` renders `role="alert"`, keeps dialog open, and allows retry when pending is false.
  - `onConfirm` called only on confirm button click; does not call `onClose`.
  - `onClose` called on Cancel click, Escape, and backdrop click; does not call `onConfirm`.

### Limitations / Untested Items
- Interactive gestures in native mobile browsers (iOS WebKit / Android Chrome) were verified through component rendering and responsive CSS breakpoints, not on physical mobile hardware.
- Real global session revocation via Supabase server functions was not executed, as backend integration belongs to the parent workflow.

