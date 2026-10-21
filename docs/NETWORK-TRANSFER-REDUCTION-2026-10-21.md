# Network transfer reduction — 2026-10-21

Neon Console showed 5.02 GB of the Free project's 5 GB transfer allowance used, while storage was 69.71 MB. The compute was still ACTIVE when inspected; no paid plan was enabled. The exact contribution of individual queries to the exhausted allowance has not been measured.

## Changes

- Bounded server memory caches coalesce concurrent reads and reuse validated source reports. Ratings TTL: 60 seconds; Performance, tStar, Noon/Deliveroo operations, Keeta periods and Talabat comparison history: 300 seconds.
- Caches hold source data, not authenticated responses. Authentication and feature/branch authorization still run per request. Keys isolate source credentials, periods and query scope; database pools partition local reads. Returned values are cloned to prevent one scope filter mutating another caller's copy. No browser persistent storage or public response caching was added.
- Each owner cache is limited to 12 MB and 32 entries/pending keys. Failed results and rejected loads are not retained. Oversized results can share an in-flight load but are not retained. Cold or separate Vercel instances have independent caches; no globally shared cache is claimed.
- Lens reuses its authorized response in browser memory for five minutes, clears on authentication reset and coalesces concurrent loads. Explicit refresh bypasses browser reuse, but not the bounded source cache. Source and browser TTLs can compound: daily report updates may take roughly ten minutes to become visible through a warm browser; ratings roughly two minutes. Original observation dates remain visible.
- Automatic periodic refresh skips hidden tabs and respects existing page caches; manual refresh remains available. No collection schedule was changed.
- Keeta's historical comparison SQL omits items, per-shop item catalogs and customer datasets that the comparison does not use. Sales, orders and prior shop service fields remain intact. No source records were removed.

## Verification and limits

- Full suite: 256 passed, zero failed. Both TypeScript builds passed. Cache tests cover 50 concurrent reads, expiry, rejected/error retries, copy isolation, owner separation, entry/byte bounds. Existing permission and source-quality tests passed.
- PostgreSQL-compatible PGlite test executes the reduced JSON projection and confirms unchanged sales/order comparison.
- Synthetic measurement, **not production savings**: 50 requests transferred one source payload instead of fifty (606,700 to 12,134 bytes, 98% reduction). A deliberately item-heavy historical fixture dropped from 63,004 to 138 bytes (99.78%); this does not estimate the actual production payload distribution.
- This work reduces subsequent usage. It does not restore consumed Neon quota or guarantee that Free plan operation continues after a hard limit. Actual project-wide reduction requires comparing later Neon usage over comparable workloads.

No new dependency, paid service, schema migration, permission change, collector alteration or data deletion is required.
