# Phase 2B — Keeta Live dashboard

- Extends the existing server-side proxy to request and strictly validate `platform=all`.
- Computes display status centrally from rating and ignores legacy source status for presentation.
- Adds combined Overview, isolated Talabat and Keeta tabs, platform badges, independent freshness, partial-failure states, and deterministic sorting.
- Preserves null counts as `—` while numeric zero remains `0`.
- Marks carried-forward Keeta rows and keeps Cloud History explicitly unavailable.
- Removes raw Express error messages and the local database path from externally visible output/logs.

No collector, session, database, Redis, alert, schedule, migration, or environment setting changed.
