# Swipe 2 Study

React/Vite language-learning frontend. The agreed release focuses on HSK 1 and
JLPT N5, using the client-owned UI and supplied vocabulary/audio.

## Run locally

Use Node 22.12+ or a supported newer LTS release.

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

The current frontend still uses guest localStorage. This foundation change does
not yet connect login, cloud progress sync, content imports or account deletion.

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

Follow [the staging setup instructions](docs/backend-setup.md). Never apply a
migration or reset to production as a test. Credentials stay outside Git.
Use development branches: the existing main branch may auto-deploy the demo.
Promote tested releases to the separate client-owned production repository.
