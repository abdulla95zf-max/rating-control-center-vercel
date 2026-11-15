# FRB Core webhook contract — receiver preparation v1

Status: contract, HMAC helpers, synthetic test vector and owner-only dashboard reference are implemented. **No production receiver URL, webhook signing secret, durable outbox, retry worker or automatic webhook sender is activated/implemented by this preparation.** The existing pull APIs remain active. Do not tell Core that automatic delivery already exists.

Owner dashboard: `/core-integration.html` (link Core in the owner account menu). Template API: authenticated GET `/api/config?integration=core-webhook`; owner session only. Ordinary admins and the Core read API key do not grant setup access. The downloadable verifier is generic public code and contains no production credential.

## Agreed business data

Only rating numbers and brand/branch/source identity metadata are transmitted. Review counts, observation/sync timestamps, freshness and report metadata are not trigger fields. Unchanged semantic state produces no change event. A null rating means unavailable, never zero. Read failures, partial source responses and missing records caused by an outage must NOT be treated as removals. Branch identity is the RCC registry ID, with the existing catalog's physical-location review limitations preserved.

## Receiver request

POST to Core's exact HTTPS receiver URL (not supplied yet). Content-Type application/json. No redirects. Receiver should accept at most2MB raw body. Headers:

- X-RCC-Timestamp: decimal Unix seconds for this delivery attempt.
- X-RCC-Signature: `v1=<lowercase hex HMAC-SHA256>`.
- X-RCC-Event-Id: equal to body.eventId.

Signing input is UTF-8 `${timestamp}.${rawBody}`. Preserve exact raw bytes; never verify reserialized/pretty-printed JSON. A dedicated random >=32-byte base64url webhook secret will be shared privately, separately from the existing pull API key. The synthetic test key is PUBLIC and MUST NOT authenticate production requests.

Verify the timestamp within +/-300seconds, compute signature, compare timing-safely, then parse and validate the schema. Synchronize server clocks. Store eventId and last accepted sequence durably with the Firebase write transaction. A valid duplicate already saved should get200 without repeated writes. Reject or safely acknowledge an older already superseded sequence without overwriting newer state. Return2xx only after durable acceptance/application. Never log secret, signature or private body.

`public/core-webhook-verifier.mjs` is a Node server verification helper. In a Vercel receiver, read raw bytes with a strict byte limit before any JSON parsing/body parser; adapt this to Core's actual framework. After HMAC verification, validate schema, exact type, field types/limits, eventId header/body equality, platform allowlist and identifiers before Firebase writes. The helper is NOT a full Firebase receiver.

## Event shape

`schemaVersion: "1"`, `type: "rcc.ratings.changed"`, `eventId` unique UUID, `sequence` monotonically increasing integer for the one Core stream, `emittedAt` original UTC event creation time, `mode: "snapshot" | "delta"`, brands, branches, ratings, removedRatingIds, deactivatedBranchIds.

- First event: snapshot containing all approved active catalog entries and eligible latest ratings. Define bootstrap treatment with Core before enabling.
- Later events: delta arrays contain changed/new rows; explicit removedRatingIds and deactivatedBranchIds describe confirmed removals. An empty delta array is NOT a deletion instruction. Never delete Core-owned company entities on this integration's behalf.
- brands: id,name,displayName.
- branches: id,brandId,name,displayName,active,sources (platform,sourceIdentity,ratingId), including source mappings without a current rating.
- ratings: id,branchId,platform,sourceIdentity,rating (1..5 or null).
- Do not round before change detection. Keep account/source identities separate; no new name-based merge.

The owner dashboard offers a synthetic body, exact raw one-line body, signed headers and test key. Its historical timestamp is intentionally fixed for reproducibility: test the verifier with `now=Number(X-RCC-Timestamp)`. In production use current server time; the historical vector should fail a current-time freshness check.

## Sender implementation / activation still required after receiver details

1. Obtain/approve exact HTTPS URL and receiving company service. Validate DNS/IP and block loopback/private/metadata addresses, credentials in URLs and redirects; pin/validate connection destination against DNS rebinding. No generic arbitrary URL sender is exposed by this preparation.
2. Create/provision the separate production signing secret, stored server-side and never in this document or frontend.
3. Add durable PostgreSQL state/outbox and single-stream sequence allocation transactionally. Only complete validated scoped evidence can advance the comparison baseline. Persist event before delivery; source collection success must not depend on Core availability.
4. Coalesce close updates, retry failed delivery with bounded exponential backoff, preserve same eventId/body/sequence and sign each attempt with a fresh timestamp. Keep dead-letter/last-success visible. Serialize/coordinate dispatch so old retries cannot overwrite newer Core data.
5. Connect a verified trigger to saved-data updates (or an explicitly agreed dispatcher cadence). No collector schedule, automatic polling or portal access was added in this preparation.
6. Run signed synthetic round trip and duplicate/out-of-order/failure tests, then first real bootstrap and change-only tests. Enable only after these pass. Silence alone is not proof the collectors are healthy.

Validation so far: build and324tests passed including signature tampering, wrong key, replay window, ignored review/timestamp changes, rating/source changes, inactive filtering and owner-only setup. Browser verification and release status recorded separately when completed.


Final validation: build and325tests passed (including the downloadable verifier against the exact signed vector). Standards/spec review mapping finding resolved: branch source mappings participate even without ratings. Synthetic browser checks at1440/390px, light/dark, PersianRTL/codeLTR, keyboard access, contract/verifier downloads, non-owner denial and failure/retry passed with no page errors. Injected503 was expected. No live receiver or production webhook signing key was created.
