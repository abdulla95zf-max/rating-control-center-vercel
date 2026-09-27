# Phase 2B — Keeta Live dashboard

## Action Center rules update · 2026-09-27

- Triggers rating actions only below 4.1.
- Uses daily thresholds of complaints above 1%, avoidable cancellation above 1.5%,
  offline above 2%, and average preparation time above 16 minutes.
- Suppresses operational actions when Successful Orders is zero; missing order data
  becomes a data check. Rating actions remain independent.
- Shows Successful Orders on operational action rows and adds an Action Center brand filter.
- Labels the mixed time basis clearly: latest ratings and daily Performance.

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
- Matches Talabat `Mleha, Al Bdai'a Suburb` with Keeta `Hay Hoshi` as one physical branch.
- Adds a dynamic brand filter derived from the connected platform rows.
- Keeps aggregator tabs isolated and opens review/one-star details in the existing side drawer.
- Leaves Cloud History explicitly unavailable until a historical API is introduced.
- Adds a custom dashboard favicon and touch icon.
- Keeps the platform navigation visible while scrolling and adds local platform identity artwork.
- Separates platform identity from rating status so only semantic status uses status styling.
- Reflows cloud rating tables into touch-friendly mobile cards without horizontal scrolling.
