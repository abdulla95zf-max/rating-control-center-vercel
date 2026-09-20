# Deploy Rating Control Center to Vercel

This is the dashboard project only. The collector project and upstream API remain unchanged.

Architecture: public/ is served as static HTML/CSS/JavaScript. Independent Node.js 24 functions expose GET /api/config, GET /api/health, and GET /api/dashboard/ratings/latest. The last endpoint reuses the existing validated server-side proxy. Cloud functions never load .env files, TALABAT_DB_PATH, the Windows server or SQLite. The browser receives only cloud mode, refresh interval and projected ratings fields.

Preparation / deployment steps (manual):
1. Apply the patch to C:\RatingControlCenter-v2, or extract the standalone source ZIP into a separate project directory. Do not apply it to the collector repository.
2. Put this dashboard source into a separate Git repository. Never commit .env, tokens, databases, node_modules or private artifacts.
3. Create/import a separate Vercel project, with Framework Preset Other, Node.js 24.x, build command npm run build, output directory public. The supplied vercel.json sets the build/output and function durations. Do not select the Express preset or the local src/server.ts as an entrypoint.
4. Before enabling production access, configure Settings > Deployment Protection > Vercel Authentication > All Deployments. Standard Protection excludes production domains. Set up/invite the intended Vercel users. This protection is configured in Vercel, not by vercel.json; without it the ratings proxy is publicly reachable. No in-app username/password login is included.
5. Configure server-side environment variables for each intended environment:
   RATINGS_API_URL=https://talabat-rating-monitor-vercel-poc.vercel.app/api/ratings/latest
   RATINGS_API_TOKEN=<same private read token configured on the upstream PoC>
   Do not set a NEXT_PUBLIC_ or VITE_ token variable. Do not add TALABAT_DB_PATH, DATABASE_URL, Redis or Telegram credentials to this dashboard project.
6. Deploy when ready. This work has not deployed, created a Vercel project, changed access settings or called the live upstream.
7. In a signed-out browser confirm that the production page AND /api/dashboard/ratings/latest require Vercel sign-in. In an authorized browser verify ratings, names, filters and mobile layout. The Windows PC is not needed after the cloud deployment is running.

The dashboard upstream must remain reachable with its existing Bearer token. If an additional Vercel deployment-protection gate blocks the collector API, the dashboard will show a safe failure; this patch does not change or bypass upstream protection.

Health: /api/health returns {ok:true,mode:cloud}; this is process health, not an upstream connectivity check. /api/config always enables cloud mode and 60-second refresh. Missing/invalid RATINGS_API_TOKEN returns a sanitized 503 from the ratings proxy; it never falls back to local data.

No secrets are bundled into public/. API requests have no-store/private headers. All paths get the existing strict CSP and security headers from vercel.json. The API follows no upstream redirects and preserves the existing response validation, error sanitization and timeout. Platform authentication is required to protect business ratings from unauthorized users.

Local Windows mode is preserved: npm start still runs dist/server.js with existing loopback binding and .env behavior. Existing SQLite mode or cloud-proxy mode works locally. npm run build checks both local source and Vercel API TypeScript.

Files added: api/config.ts, api/health.ts, api/dashboard/ratings/latest.ts, src/cloud-api.ts, tsconfig.vercel.json, vercel.json, .vercelignore, tests/vercel-cloud.test.ts.
Files changed: package.json, package-lock.json (Node pinned to 24.x; build also checks cloud API).
Existing UI, proxy, collector and local application implementation unchanged.

Validation: 33 tests passed, 0 failed; npm run build passed; cloud headless Chrome smoke passed. All data used in tests was synthetic. A real Vercel deployment/build and platform access protection have not been verified because deployment was not authorized.

References:
https://vercel.com/docs/functions/runtimes/node-js
https://vercel.com/docs/deployment-protection#all-deployments
## Phase 2B live platforms

The dashboard proxy calls the existing ratings endpoint with `platform=all`. Talabat and Keeta are rendered in the existing Overview and platform tabs. The browser still calls only the same-origin dashboard endpoint and never receives the upstream URL or bearer token.

Display status is computed by the dashboard server from rating: HEALTHY at 4.4+, ACCEPTABLE at 4.3, WARNING above 4.0 and below 4.3, CRITICAL at 4.0 or below, and UNKNOWN for null. Cloud History remains unavailable; no history is inferred from latest data.
