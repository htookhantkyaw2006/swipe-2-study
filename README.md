# Swipe 2 Study

React/Vite language-learning frontend. The agreed release focuses on HSK 1 and
JLPT N5, using the client-owned UI and supplied vocabulary/audio.

## Run locally

Use Node 22.12+ or a supported newer LTS release.

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

Email/password signup, confirmation callback, login, session restoration and
logout are implemented. PT has reported passing the configured local-browser
flow. Guest and signed-in learning lists remain in separate owner-scoped device
caches; cloud progress sync, guest import, password reset, Google sign-in and
account deletion are not implemented yet.

The core UI pass covers Home/navigation, vocabulary sessions, lessons, saved and
review words, Library and Profile. This is not a full pass over every helper or
phrase screen. See [UI evidence and limits](docs/ui-checkpoint.md).

## Checks

```sh
npm run lint
npm test
npm run build
```

PostgreSQL policy tests use PGlite with simplified Supabase Auth/Storage schemas.
They test RLS and migration behavior, not hosted Auth or actual file uploads.
PGlite is a test-only dependency; it is not part of the web bundle.

## Backend

Follow [the staging setup instructions](docs/backend-setup.md) and
[preview verification steps](docs/preview-verification.md). Never apply a
migration or reset to production as a test. Credentials stay outside Git.
Use development branches: the existing main branch may auto-deploy the demo.
Promote tested releases to the separate client-owned production repository.
