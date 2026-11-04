# Deployment boundaries

For the complete step-by-step setup, including account creation, database, keys, commands, and persistence checks, use [ONLINE_HOSTING.md](ONLINE_HOSTING.md).

## GitHub Pages: myroots-heritage.github.io

The included `.github/workflows/deploy-pages.yml` builds and publishes the frontend demo on pushes to `main`. The repository must be `myroots-heritage/myroots-heritage.github.io` to use the root address `https://myroots-heritage.github.io/`.

1. Open [the repository's Pages settings](https://github.com/myroots-heritage/myroots-heritage.github.io/settings/pages).
2. Under **Build and deployment → Source**, select **GitHub Actions**.
3. Commit and push the workflow and project source to `main`.
4. Open the repository's **Actions** tab and watch **Deploy my.roots to GitHub Pages**. Once both jobs succeed, open `https://myroots-heritage.github.io/`.

You can also use **Actions → Deploy my.roots to GitHub Pages → Run workflow** after the workflow is on `main`. Later pushes rebuild and update the website automatically. No `gh-pages` branch or committed `dist` folder is needed. GitHub runs `npm ci` in its own build environment; npm does not need to be reinstalled on your computer.

The workflow installs from the root lockfile, builds the `frontend` workspace, and uploads only `frontend/dist`. Vite's default `base: '/'` is already correct for this root GitHub Pages domain. A project hosted under a different repository subpath would need its own base path.

GitHub Pages hosts static files. This publishes the demo tree and in-browser interactions; it does not run the Node API, PostgreSQL, the Drive worker, account signup, or real verification. The site's sample changes reset on reload. Do not put provider secrets or real family records into the static build. To make the full product work, deploy the backend services separately and deliberately configure authentication and cross-origin access as described below.

References: [Vite GitHub Pages guide](https://vite.dev/guide/static-deploy#github-pages), [GitHub publishing-source settings](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Other static hosting

The Sites manifest can also package `frontend/dist` for an owner-private demo, with sample data in browser memory. The previous Sites publication was not completed. The Node/PostgreSQL API and Drive worker are separate services and are not deployed by that static manifest.

## Backend services

For the real product, deploy:

1. The frontend static build behind HTTPS.
2. `backend/dist/server.mjs` on a Node host, bound on loopback/private networking behind an HTTPS proxy.
3. PostgreSQL on a private network, with encryption at rest, managed backups and least-privilege database roles.
4. `backend/dist/worker.mjs` as an independently supervised process with Drive OAuth secrets.

Set `SERVE_FRONTEND=true` to serve `frontend/dist` directly from the Node API, or proxy `/api` from the frontend origin to the separate API. Keep `WEB_ORIGIN` exactly equal to the browser origin, set `NODE_ENV=production`, and set a supported Node LTS version. On Render, omit `WEB_ORIGIN` to use the provided `RENDER_EXTERNAL_URL`. The session uses `SameSite=Strict`; cross-site frontend/API deployments need a deliberate cookie/CSRF redesign rather than simply setting a different API URL. Vite's dev proxy is not included in the production build.

Production bundling inlines the shared TypeScript package and leaves external npm runtime dependencies in place. Install workspace dependencies with `npm ci`, run `npm run build`, and start with `npm run start -w backend`. Inject credentials through your host's secrets manager. Keep the archive-encryption and contact-encryption keys distinct and backed up securely.

The API binds `127.0.0.1` in development and `0.0.0.0` in production, with an optional `HOST` override and platform-supplied `PORT`. Restrict ingress appropriately for the host. Rate limiting currently uses process memory; use a shared store and trusted proxy configuration for a multi-instance deployment. Remove or restrict demo account registration if deploying a review environment against a shared database.

Before production: run the migrations against a disposable real PostgreSQL instance, test rollback and concurrency, test Drive recovery after crashes, verify folder access, perform restore and deletion drills, load-test graph/visibility queries, validate mobile accessibility, and complete the privacy items in `PRIVACY.md`.
