# my.roots

A family space with a visual relationship tree, private member details, branch-level sharing, family conversations, gatherings, and an encrypted entry-workflow queue.

This is an MVP implementation, not a finished production service. The web app opens a **fictional, disposable demo** by default. Demo changes live in memory until reload. The separate API supports real accounts and PostgreSQL persistence when configured. No real SMS or WhatsApp automation is enabled.

## Project structure

```text
frontend/             React + Vite UI, API client, disposable demo repository
backend/
  src/                Fastify routes, OOP services, SQL repository, Drive worker
  migrations/         PostgreSQL tables, constraints, indexes, workflow outbox
shared/src/           Shared TypeScript models, validation, FamilyGraph class
docs/                 Architecture, privacy, deployment, entry-flow setup
```

UI and backend live in separate folders in the same repository so API contracts and changes can be reviewed together. Feature branches can be used normally; permanent UI/backend branches would make synchronization harder. A future Expo/React Native app can reuse `shared` and call the same API.

## Run the UI

Use Node 22.12+ (or a supported newer Node version).

```sh
npm ci
npm run dev -w frontend
```

Open `http://127.0.0.1:5173`. The sample tree needs no database or credentials.

## Run the backend and your own family

1. Start PostgreSQL with `docker compose up -d` (Docker required), or provision PostgreSQL separately.
2. Copy `backend/.env.example` to `backend/.env`.
3. Set `DATABASE_URL`. Generate **two different** 32-byte keys with `openssl rand -base64 32`, and set `CONTACT_ENCRYPTION_KEY` and `WORKFLOW_ENCRYPTION_KEY`. Keep these keys securely; losing one makes its encrypted records unrecoverable.
4. Apply migrations and start both apps:

```sh
npm run db:migrate
npm run dev
```

Use **Create your own space** in the UI. Registration creates an account, a family UUID, and your member UUID. All real member records start unverified. Passwords require at least 12 characters. The demo never becomes your real family tree.

## Entry flows and Google Drive

Every business-data save (family creation, member creation, profile or sharing update, message, gathering) inserts its own encrypted event **inside the same database transaction**. A separate backend worker archives one encrypted file per event to the selected Drive folder. Queue processing does not block entry creation.

The provided folder ID is in `.env.example`. A folder link is not API authorization. Follow [Drive setup](docs/ENTRY_FLOWS.md) to grant the server access, then run:

```sh
npm run workflows -w backend
# Or process one batch:
npm run workflows -w backend -- --once
```

The **Entry workflows** screen shows your events, statuses, and attempts. In demo mode these are simulated pending events; nothing is uploaded. Database backups are still required: entry-event archives are not a tested full-database recovery system.

## Validation

```sh
npm run typecheck
npm test
npm run build
```

API integration tests use `pg-mem` and the actual SQL migrations. They exercise authentication, tenant boundaries, private contacts, sharing, messages, and entry events. `pg-mem` is not PostgreSQL: deployment still needs real-PostgreSQL migration, rollback, concurrency, and worker-lease tests. Browser checks use the installed Chrome through Playwright; see `playwright.config.ts`.

## What works and what remains

Implemented: parent/child/partner graphs, sibling creation through shared parents, generated IDs, member lookup, shortest relationship paths, owner-only encrypted phone numbers, optional profile fields, server-enforced field sharing, descendant-branch preview, password sessions, family message polling, gathering creation, manual WhatsApp text sharing, exports, and transactional encrypted entry events with a Drive retry worker.

Pending before real public use: verified account recovery, phone OTP and explicit two-party relationship confirmation, secure invitation acceptance/member claiming, a second real account joining an existing family through the UI, minors/guardian handling, account deletion and retention jobs, backup restoration, notification adapters, abuse/reporting tools, realtime delivery at scale, deployment infrastructure, and legal review. Chat is family-scoped but not end-to-end encrypted. API query pagination is needed beyond the current last-100 message/event limits. See [architecture](docs/ARCHITECTURE.md) and [privacy requirements](docs/PRIVACY.md).

## Deployment

For `https://myroots-heritage.github.io/`, the GitHub Actions workflow in `.github/workflows/deploy-pages.yml` builds the frontend automatically on pushes to `main`. First select **Settings → Pages → Source → GitHub Actions** in the repository. See [the GitHub Pages steps](docs/DEPLOYMENT.md#github-pages-myroots-heritagegithubio). This hosts the demo UI; backend services need separate hosting.

`npm run build` produces `frontend/dist` and bundled backend entrypoints in `backend/dist`. Serve the frontend through HTTPS, and proxy `/api` to the separate Node API on a private network. Set `NODE_ENV=production`, `WEB_ORIGIN` to the exact frontend origin, and inject secrets from a secret manager. Start the worker separately with the same database and archive key configuration. The included Sites configuration hosts the frontend demo only; it does not deploy PostgreSQL, the Node API, or the worker. See [deployment notes](docs/DEPLOYMENT.md).
