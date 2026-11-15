# FRB Core — Ratings API v1

Status: RCC production API activated on 2026-11-15 for the owner-approved eight brands. Core-side implementation remains the Core team's responsibility. This document contains no credential. Example data is synthetic.

## Purpose and architecture

FRB Core's server fetches saved ratings from Rating Control Center (RCC) every **4 hours** (14,400 seconds; six checks/day). RCC collectors and portal sessions remain unchanged. Core stores its own copy in Firebase and serves its users from that copy. No portal credentials, database credentials, dashboard cookies, sales, reviews text or user data are shared.

```
Aggregator portals -> existing collectors -> saved RCC data
                                           |
                                scoped read-only Ratings API
                                           |
                                  FRB Core server (Vercel)
                                           |
                                  Firebase -> Core users
```

## Request

`GET https://frb-rcc.vercel.app/api/integrations/core/ratings`

Headers:

```
Authorization: Bearer <CORE_RATINGS_API_KEY>
Accept: application/json
If-None-Match: <previous ETag, when available>
```

No query parameters, request body, dashboard login or browser CORS access. Do not put the key in URLs, frontend bundles, Firebase client documents or logs. Use a dedicated Core server environment variable. The endpoint is routed internally through `/api/config?integration=core-ratings` to preserve the existing 12-function deployment ceiling; consumers should use the clean public URL above.

## Response

HTTP 200, illustrative synthetic record:

```json
{
  "schemaVersion": "1",
  "asOf": "2026-11-15T10:00:00.000Z",
  "pollIntervalSeconds": 14400,
  "scope": {"brands": ["FRB Kabab"], "activeBranchesOnly": true},
  "partial": false,
  "sources": [
    {"platform": "talabat", "state": "SUCCESS", "count": 1},
    {"platform": "keeta", "state": "EMPTY", "count": 0},
    {"platform": "noon", "state": "DISABLED", "count": 0},
    {"platform": "deliveroo", "state": "DISABLED", "count": 0}
  ],
  "ratings": [{
    "id": "<64 lowercase hexadecimal characters>",
    "branchId": "<RCC registry branch ID>",
    "brand": "FRB Kabab",
    "branchName": "Synthetic branch",
    "displayName": "FRB Kabab — Synthetic branch",
    "platform": "talabat",
    "sourceIdentity": "TB_AE;EXAMPLE",
    "sourceName": "Synthetic source name",
    "rating": 4.39,
    "ratingStatus": "ACCEPTABLE",
    "reviewCount": null,
    "observedAt": "2026-11-15T06:00:00.000Z",
    "syncedAt": "2026-11-15T06:00:00.000Z",
    "carriedForward": false,
    "freshness": "LIVE"
  }]
}
```

- `id`: deterministic SHA-256 of platform + NUL + sourceIdentity; suitable as a Firestore document ID. One record per source identity, not an average across platforms/accounts.
- `branchId`: RCC's existing registry identity. Core must maintain an explicit mapping from this ID to its own branch ID; never join by display name. Multiple source identities can map to the same branch/platform. Preserve them separately until an agreed selection policy exists; do not overwrite them by branch/platform alone.
- Only existing registered, active, explicitly allowed-brand sources are included. Unregistered sources are omitted; this read endpoint never creates branches or changes aliases.
- `sourceIdentity` retains the exact composite platform/account/shop identity. Do not parse it as a Core branch ID or a display alias. No source merge is introduced.
- `rating`: original precision, 1–5 or null. Null means unavailable, not zero. No rounding before classification: >=4.4 HEALTHY; >=4.3 ACCEPTABLE; >4.0 WARNING; <=4.0 CRITICAL; null UNKNOWN. This is RCC management policy, not a vendor SLA.
- `reviewCount`: null means unavailable; do not replace with zero or compare counts across incompatible snapshots.
- `observedAt`: actual source observation, UTC. `syncedAt`: collection time. `asOf`: API projection time, not source freshness or proof that every branch is covered.
- `carriedForward`: true/false/null provenance, preserved from the source. A recent sync can contain an older observed rating.
- `freshness` uses **observedAt**: Talabat LIVE below 7 hours, DELAYED from 7 through 12 hours, STALE above 12; daily platforms LIVE below 26 hours, DELAYED through 48, STALE above 48. Missing/future/invalid time is UNKNOWN. Core should recalculate age locally between polls using these rules; never label a missing rating as a healthy score just because its observation is recent.
- Source state SUCCESS means scoped records were returned; it does not establish complete expected branch coverage. EMPTY means no current scoped rows. ERROR means the source read failed. DISABLED means that source is not enabled in this deployment, not that Core lacks a physical branch there. Counts are scoped only, not whole-portfolio counts. Careem is not supported by this endpoint.

## Core synchronization behavior

1. Run one protected server-side job every four hours, with a single in-flight sync. Confirm how Core schedules jobs under its actual Vercel plan; do not assume the free plan supports a four-hour native cron. An existing external scheduler can call a protected Core route if needed.
2. Fetch once for the authorized portfolio, not once per branch/user. Use a 25-second timeout and do not follow redirects carrying the Authorization header.
3. Validate schemaVersion, source identities, timestamps and numeric types before persistence. Map branch IDs explicitly; flag unmapped IDs for administration instead of guessing.
4. Upsert changed records only, keyed by `id`. Do not rewrite every record because the response `asOf` changed. Store server synchronization metadata separately.
5. HTTP 304 retains stored records. The weak ETag reflects semantic data/scope/freshness; incidental `asOf` changes do not force retransmission. `X-Snapshot-As-Of` provides the latest projection time even with 304. Send the exact prior ETag. Both 200 and 304 still require the current API key.
6. On a source ERROR, preserve its previous records with an explicit unavailable/stale state. Never replace them with zero or interpret absence as branch closure. On a successful snapshot, reconcile that source against returned rows and current scope so removed/inactive/out-of-scope records are not served as current. If active-branch revocation is required during a source outage, hide that source until a successful reconciliation rather than retaining stale access indefinitely.
7. On 401, stop retries and alert an administrator. On 429, honor Retry-After. On network/503 failure, keep the last good snapshot, label it and retry at most twice with backoff; then alert. Never trigger collectors from retry, page load or filter changes.
8. Log status, duration, counts and last success only; redact keys and full private responses. Protect Firebase copies with Core's own server-side authorization and Firebase rules. RCC authentication is not a substitute for Core user authorization.

## HTTP behavior and performance

- 200: full current scoped response, possibly partial; inspect sources.
- 304: semantically unchanged; no body.
- 400: query parameters/invalid request or cross-site browser request.
- 401: missing/invalid key.
- 405: use GET.
- 429: process-local protection (60 authenticated requests/minute), Retry-After: 60. This is not a distributed quota or billing guarantee.
- 503: integration disabled/misconfigured or data temporarily unavailable. Error codes are fixed; no raw upstream/database diagnostics are exposed.

No public CDN cache. Responses use `private, no-store`, Vary: Authorization. A bounded process-local five-minute cache coalesces the source and registry projection. Separate/cold Vercel instances may each read the sources; 304 does not guarantee zero database reads after cache expiry. Partial error snapshots are not cached as successful data. Authorization and scope configuration are checked before cached data. Active-branch changes can take up to five minutes to invalidate a warm integration projection. Projection is bounded to 10,000 records and 2 MB; source readers keep their own bounds/deadlines. This adds no permanent report table, dependency or collector job.

## RCC operator setup (owner only)

Set private Production variables, then redeploy:

- CORE_RATINGS_ENABLED=1
- CORE_RATINGS_TOKEN_SHA256: lowercase SHA-256 of a dedicated high-entropy key (at least 32 random bytes encoded base64url). RCC stores the digest only; Core stores the actual key server-side.
- CORE_RATINGS_BRANDS: explicit JSON array, no wildcard. Supported persisted brand values: Kabab Fareej, FRB Shawarma, FRB Kabab, Taazaa Mumbai, Kabab Al Sham, Leekh, Marwareed, Tanoorna Ghyr.

Missing/invalid configuration fails closed before source reads. Do not reuse a portal token, dashboard password, collector secret or GitHub token. Deliver the Core key separately through an approved secret-sharing channel; never embed it in this guide. To revoke access, disable the integration and redeploy. To rotate, coordinate the new digest deployment and Core key update; only one key is accepted at a time. For immediate branch/scope revocation, redeploy to clear warm caches.

## Release checklist

- Build and all tests; review scope/security/partial data and unchanged dashboard config/scheduler routes.
- Publish disabled route; verify unauthorized/disabled responses without live credential writes.
- Owner approves exact brand scope and secure key delivery; activate and redeploy.
- Authorized read smoke test, partial/error handling and branch mapping verification with Core developer.
- Core confirms four-hour scheduling, Firebase authorization and no frontend credential exposure.

## Validation — 2026-11-15
Build and 318 tests passed. Separate standards/spec reviews completed; the registry timeout finding was resolved with a five-second lookup timeout and an eighteen-second cached-loader deadline. Tests cover authentication, scope/active sources, nulls/precision/provenance, partial failures, cache isolation/coalescing/304, recovery after lookup failure, rate protection and unchanged dashboard config authentication. Core-side scheduling/Firebase behavior still requires the Core team's implementation and validation.


Production verification: deployment BX1bkZqQEUfnZ4mjBCpHLe2j3kSh Ready, commit 261e937. Authorized request returned HTTP200, schema1, partial=false, 122 source records (Talabat49, Keeta35, Noon22, Deliveroo16), 60,259 bytes in approximately3.1seconds. Conditional request returned304 with empty body; missing key returned401. Counts are time-bound source records, not unique physical branches. No Core Firebase writes or four-hour Core job were executed by RCC. Key handoff is a temporary loopback-only page; the owner must save/share the raw key securely before that process stops.
