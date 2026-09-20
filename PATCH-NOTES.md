# Phase 2B — Keeta Live dashboard

- Extends the existing server-side proxy to request and strictly validate `platform=all`.
- Computes display status centrally from rating and ignores legacy source status for presentation.
- Adds combined Overview, isolated Talabat and Keeta tabs, platform badges, independent freshness, partial-failure states, and deterministic sorting.
- Preserves null counts as `—` while numeric zero remains `0`.
- Marks carried-forward Keeta rows and keeps Cloud History explicitly unavailable.
- Removes raw Express error messages and the local database path from externally visible output/logs.

No collector, session, database, Redis, alert, schedule, migration, or environment setting changed.

## Dashboard branch view

- Removes technical store identities and rating-count columns from the main tables.
- Groups Overview rows by a deterministic brand/branch identity and shows Talabat and Keeta ratings under the same branch.
- Normalizes Keeta `KF` to `Kabab Fareej` and applies explicit operational aliases for cross-platform branch names.
- Adds a dynamic brand filter derived from the connected platform rows.
- Keeps aggregator tabs isolated and opens review/one-star details in the existing side drawer.
- Leaves Cloud History explicitly unavailable until a historical API is introduced.
