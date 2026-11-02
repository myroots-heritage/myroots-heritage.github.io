# Deployment boundaries

The Sites manifest packages only `frontend/dist`. This is an owner-private **demo deployment**, with sample data in browser memory. The Node/PostgreSQL API and Drive worker are separate services and are not deployed by this static manifest.

For the real product, deploy:

1. The frontend static build behind HTTPS.
2. `backend/dist/server.mjs` on a Node host, bound on loopback/private networking behind an HTTPS proxy.
3. PostgreSQL on a private network, with encryption at rest, managed backups and least-privilege database roles.
4. `backend/dist/worker.mjs` as an independently supervised process with Drive OAuth secrets.

Proxy `/api` from the frontend origin to the API. Keep `WEB_ORIGIN` exactly equal to the browser origin, set `NODE_ENV=production`, and set a supported Node LTS version. The session uses `SameSite=Strict`; cross-site frontend/API deployments need a deliberate cookie/CSRF redesign rather than simply setting a different API URL. Vite's dev proxy is not included in the production build.

Production bundling inlines the shared TypeScript package and leaves external npm runtime dependencies in place. Install workspace dependencies with `npm ci`, run `npm run build`, and start with `npm run start -w backend`. Inject credentials through your host's secrets manager. Keep the archive-encryption and contact-encryption keys distinct and backed up securely.

The API currently binds `127.0.0.1`; adapt binding to your container/private network deployment intentionally and restrict ingress. Rate limiting currently uses process memory; use a shared store and trusted proxy configuration for a multi-instance deployment. Remove or restrict demo account registration if deploying a review environment against a shared database.

Before production: run the migrations against a disposable real PostgreSQL instance, test rollback and concurrency, test Drive recovery after crashes, verify folder access, perform restore and deletion drills, load-test graph/visibility queries, validate mobile accessibility, and complete the privacy items in `PRIVACY.md`.
