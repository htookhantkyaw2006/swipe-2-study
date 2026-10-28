# IDE task A — isolated global sign-out dialog

Implement only this task. The integrating developer handles Auth, cloud import,
Profile wiring and all server changes. Do not begin deletion or any other task.

Base commit: `7f1034d`. New branch: `feat/global-signout-dialog`.

1. Run `git status --short --branch`. If there are uncommitted changes, stop and
   report the filenames. Do not reset, stash, commit or format those changes.
2. Verify `7f1034d` exists, then create the new branch from that exact commit.
   Do not use main or switch another developer's active working tree mid-task.
3. Create only these three files:
   - `src/components/GlobalSignOutDialog.jsx`
   - `src/components/GlobalSignOutDialog.css`
   - `docs/global-signout-dialog.md`

Do not modify existing files, add dependencies, edit package/migration files,
change global CSS, or touch Profile.jsx, App.jsx, main.jsx, Auth, AppDialog or
development-log.md. Use the established blue/white brand variables.

Default export:

```jsx
GlobalSignOutDialog({
  open = false,
  pending = false,
  error = null,
  accountLabel = '',
  onConfirm,
  onClose
})
```

Requirements:

- Return null when closed. When open use the existing `AppDialog.jsx`.
- Accessible label and visible title: **Sign out on all devices?**
- Show `accountLabel` as normal React text when provided.
- Explain: “You will be signed out here and on your other devices. Some
  already-open pages may stay signed in briefly.”
- Explain: “Saved learning data on this device will be kept.”
- Exactly two buttons: **Cancel**, **Sign out on all devices**.
- Cancel/Escape/backdrop call onClose only. Confirm calls onConfirm only.
  Opening or confirming never closes optimistically or performs Auth operations.
- Pending disables both buttons, suppresses dismissal, sets aria-busy and shows
  **Signing out…** as the confirm label.
- Error uses role="alert". Stay open and permit retry when pending clears.
- Reuse native modal/focus behavior from AppDialog. No custom focus trap.
- No Supabase, Auth hooks, storage, network, routing, timers or data deletion.
- Scoped `global-signout-dialog` class names; no static inline styles or global
  selectors. Long labels must wrap, buttons are at least 44px, focus is visible,
  motion respects reduced-motion preference. Keep JSX/CSS compact.
- Document props, callbacks and checks actually performed in the allowed doc.

Run npm test, npm run lint, npm run build and git diff --check. Do not fix unrelated
warnings or alter tests. Browser-check 320/375/768/1024/1440px and enlarged text
if available. SSR is not browser layout evidence; report unavailable checks.

Before commit, inspect git status and diff filenames. Commit only the three new
allowed files on feat/global-signout-dialog. After commit run
`git status --short --branch` and report it verbatim. Do not leave uncommitted
formatting changes, merge, push, deploy or change hosted settings.

Return commit SHA, filenames, validation results and limitations. Stop after A.
