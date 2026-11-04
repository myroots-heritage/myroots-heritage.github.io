# Put the full my.roots app online

This guide uses Render for one Node web service and one PostgreSQL database. It keeps the UI and backend in separate source folders, but serves them at the same HTTPS address. That matches the app's current session cookies and origin checks. The existing GitHub Pages address remains a separate demo; it will not automatically acquire a backend when these resources are created.

No Render resources, subscriptions, database credentials, or cloud secrets are created by the code changes. You select the account, region, plan, and service names in your own Render dashboard.

## What each part does

| Part | Why it is needed | Where it runs |
| --- | --- | --- |
| GitHub repository | Keeps the source and supplies each deployment | Existing GitHub repo |
| Web service | Serves the UI, checks login/permissions, saves entries through the API | Render Node web service |
| PostgreSQL | Keeps accounts, family trees, profiles, messages and gatherings across restarts | Render Postgres |
| Environment variables | Provide database access and encryption keys privately | Render service settings |
| HTTPS address | Encrypts browser traffic and supports Secure login cookies | Render-provided address initially |
| Drive worker, optional later | Copies encrypted entry events from the database queue to Drive | Separate worker service |

The request path is: browser → HTTPS web service → API authorization → PostgreSQL. A database transaction also saves each entry's encrypted workflow event. The optional worker processes those events independently.

## 1. Publish the hosting preparation

The backend now supports serving `frontend/dist` with `SERVE_FRONTEND=true`. In production it listens on `0.0.0.0` and the platform's `PORT`. It uses `WEB_ORIGIN`, or Render's provided `RENDER_EXTERNAL_URL`, for the allowed browser origin.

From the project root:

```sh
npm run build
npm test
git add backend package-lock.json docs README.md
git commit -m "Prepare full-stack online hosting and setup guide"
git push origin main
```

The GitHub Pages workflow will still publish its demo. Render will separately build and deploy the full app once you connect it below.

## 2. Create your Render account

Go to [Render](https://render.com/) and sign up. Connect the GitHub account that can access `myroots-heritage/myroots-heritage.github.io`. During GitHub authorization, grant repository access to this repository. If GitHub requires approval for the `myroots-heritage` organization, its owner must approve that access.

Why: Render needs permission to fetch the code and notice future pushes. Repository access does not provide the database or encryption keys; those are configured separately.

Check the current [pricing](https://render.com/pricing) before creating paid resources. For a durable pilot, use a paid Postgres plan and preferably a paid web service. For synthetic testing only, Free is an option: Render's [free-plan documentation](https://render.com/docs/free) currently says web services sleep after 15 minutes idle and free Postgres expires after 30 days with no backups. Do not rely on a free expiring database for family records you intend to keep.

## 3. Create PostgreSQL

In the Render dashboard, choose **New → Postgres** and fill in:

| Setting | Value |
| --- | --- |
| Name | `myroots-db` |
| Database | `myroots` (or accept the generated value) |
| User | Accept the generated value |
| Region | Choose the region appropriate for your users and data-location requirements |
| PostgreSQL version | `17`, matching the local development database |
| Plan | A paid plan for durable records; review its storage and backup terms |

Click the creation button, wait until the database is available, then open its connection details. Copy **Internal Database URL** privately for the next step. It contains credentials. The web service must be in the same Render region/workspace to use that address. The external URL is for tools outside Render and is unnecessary for this setup.

Why: the database is independent of the web server's temporary filesystem. Redeploying the app should not delete your family entries. See [Render database connections](https://render.com/docs/postgresql-creating-connecting).

## 4. Generate two encryption keys

On your Mac, run this twice in Terminal:

```sh
openssl rand -base64 32
```

Save the first result as `CONTACT_ENCRYPTION_KEY` and the second as `WORKFLOW_ENCRYPTION_KEY` in a password manager or secret manager. Use two different values. Do not add them to GitHub source, frontend environment variables, screenshots, or chat.

Why: the first key encrypts saved phone numbers; the second encrypts workflow records destined for Drive. These values must remain stable across deployments. Generating new replacements without a data-migration plan makes old encrypted records unreadable. If moving an existing database, use the keys that originally encrypted it.

## 5. Create the web service

Choose **New → Web Service**, connect the GitHub repository, and use:

| Render setting | Value |
| --- | --- |
| Name | An available name, e.g. `myroots-family-app` |
| Branch | `main` |
| Region | Exactly the database's region |
| Language/runtime | Node |
| Root directory | Leave blank; this is an npm workspace repository |
| Build command | `npm ci --include=dev && npm run build` |
| Pre-deploy command, paid service | `npm run db:migrate` |
| Start command, paid service | `npm run start -w backend` |
| Health check path | `/api/health` |
| Automatic deploy | Enable for the linked branch |

The build installs dependencies and compiles both the frontend and backend. `--include=dev` ensures the TypeScript/build tools are available even with `NODE_ENV=production`. The pre-deploy command creates/updates database tables before traffic reaches the new version. The start command runs the compiled backend, which also serves the built frontend.

For a **free testing web service**, pre-deploy commands are unavailable. Leave that field empty and use this start command instead:

```sh
npm run db:migrate && npm run start -w backend
```

Use that fallback for a single-instance test deployment; it is not a concurrent migration strategy for multiple production instances. [Render deployment stages](https://render.com/docs/deploys) explains the pre-deploy feature.

## 6. Enter the server's environment variables

Before the first deploy, add these in the web service's **Environment** settings:

| Name | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22` |
| `SERVE_FRONTEND` | `true` |
| `DATABASE_URL` | The database's Internal Database URL |
| `CONTACT_ENCRYPTION_KEY` | First generated key |
| `WORKFLOW_ENCRYPTION_KEY` | Second generated key |

For the initial Render address, omit `WEB_ORIGIN`: the app reads Render's automatic `RENDER_EXTERNAL_URL`. Render also supplies `PORT`, so leave it alone. Keep `VITE_API_URL` unset so the browser calls `/api` on the same host. Do not copy the local `.env` example's localhost `WEB_ORIGIN` into the hosted service.

If the dashboard offers a separate **Secret Files** feature, it is not needed for these values; use server environment variables. Save the configuration and create/deploy the service. See [Render environment variables](https://render.com/docs/environment-variables).

## 7. Verify that the full app works

Open the service's **Logs/Deploys** view and wait for the build, migrations, and startup to succeed. Typical success indicators include `Migration 001 applied`, `Migration 002 applied` on the first database setup, and the server listening on the assigned port.

Render supplies the actual HTTPS address. Use the exact address from its dashboard, not the example name above.

1. Visit `<your Render URL>/api/health`. It should return `{"status":"ok"}`. This checks the HTTP server; it does not by itself prove the database setup is correct.
2. Open `<your Render URL>/`. You will initially see the fictional demo.
3. Click **Create your own space**, register with a test account and a password of at least 12 characters.
4. Add a fictional relative to your own family. Refresh and verify that the entry remains.
5. Sign out and back in; verify the same family appears.
6. Redeploy/restart the web service and check the entry again. This confirms the record is in PostgreSQL rather than temporary browser/server memory.

If these fail, troubleshoot before entering real records:

| Symptom | Check |
| --- | --- |
| No open port detected | Updated hosting code is on `main`; server uses `0.0.0.0` and Render's `PORT` |
| Cannot find `index.html` | Root directory is blank, full build succeeded, `SERVE_FRONTEND=true` |
| Encryption-key startup error | Each key decodes from base64 to exactly 32 bytes |
| Database connection error | Internal URL is correct and app/database are in the same region/workspace |
| Relation/table does not exist | Migration command ran successfully |
| Request origin is not allowed | `WEB_ORIGIN` is absent for Render's own address, or equals the exact URL you use |
| Login works on one URL but fails on another | Use one canonical origin consistently; login cookies are tied to it |
| New entry vanishes on refresh | You entered it in the sample demo; create/sign into your own family space |

## 8. Decide which URL people should use

Share the Render HTTPS URL for the full app. `https://myroots-heritage.github.io/` continues to serve the standalone demo. The two addresses do not share accounts or browser sessions.

If you want a branded address later, buy/choose a domain, add it under the web service's **Custom Domains**, follow the exact DNS records Render supplies, and wait for validation/TLS. Then set `WEB_ORIGIN` to the complete HTTPS origin for that domain and redeploy. Use the new origin consistently and sign in again. A domain such as `my.roots` must be owned/registered; the project name alone does not grant it.

Keeping the full app at the GitHub Pages address would require a different cross-site API authentication design. The recommended setup avoids that extra work by serving UI and API together.

## 9. Backups and gradual launch

Check the database's backup/retention settings for the chosen plan and test restore using synthetic data. Keep the two encryption keys backed up separately. Database recovery without those keys cannot recover encrypted phone numbers or workflow contents.

Hosting enables durable entries, but the app is still an MVP: family-member claiming/joining, account recovery, SMS relationship verification, guardian handling, deletion/retention, and abuse/reporting are unfinished. Test the end-to-end pilot with fictional details first and complete the applicable items in [PRIVACY.md](PRIVACY.md) before public collection of real family data.

## Optional later: Google Drive archives

The database saves entries without Drive. To archive encrypted workflow events too, follow [ENTRY_FLOWS.md](ENTRY_FLOWS.md), configure operator OAuth and folder access, and deploy a separate background worker using the same repository, database, and region.

Its build command can be `npm ci --include=dev && npm run build -w backend`; its start command is `node backend/dist/worker.mjs`. It needs `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, and `GOOGLE_DRIVE_FOLDER_ID`. The code path uploads ciphertext without decrypting it; the `WORKFLOW_ENCRYPTION_KEY` must remain securely recoverable by authorized operators. Add migrations through the web service before starting the worker. Review worker pricing separately.

Drive archives do not substitute for tested PostgreSQL backups. Verification delivery and WhatsApp automation remain separate integrations.
