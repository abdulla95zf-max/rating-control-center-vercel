# Lens weekly perspective and decision priorities — 2026-11-04

## Scope / acceptance criteria

Add a compact four-week perspective to Branch Lens and platform-specific review priorities. Preserve existing source details, comparisons, authorization, exports, collectors, themes and bilingual selection. No tracking workflow, paid service or AI integration is added.

- Four disjoint seven-day windows anchored to each platform's own latest comparison end date; never treat adjacent rolling reports as independent weeks.
- Show sales (AED), integer orders and sales/orders basket. Zero-order basket is unknown. Missing, invalid and ambiguous weeks stay gaps; no interpolation, causal claim or zero-baseline growth percentage.
- Talabat retains its original 14-day current-comparison query. Lens separately reads the preceding 14 days with only sales/orders projected through the immutable revision rules and the already-confirmed source key. A historical timeout cannot remove the current comparison. Every week requires seven unique, present, numerically valid days. Existing narrowly confirmed no-order rules remain in the current comparison; older blank days are conservatively unknown, not inferred as zero. Per-day revision references accompany the totals.
- Keeta and Noon query only saved exact-period snapshots. SQL projects only metrics for already-authorized source IDs; bounded at 2000 rows, 5-second query timeout, 5-minute bounded cache keyed by platform, IDs and windows. Keeta retains account/run identity; duplicate shops across accounts are withheld, never summed. Noon requires matching nested dashboard dates. Latest revision wins within the exact source/period.
- A valid existing current/prior comparison may fill its exact two weeks when a separate historical snapshot is absent. This is explicitly labeled as existing comparison evidence, with the current platform observation for its current point; prior fallback observation remains unknown when its original timestamp is unavailable. It never overrides a source conflict. History errors are sanitized and preserve the current comparison.
- Deliveroo has no sales-series claim. Its service evidence remains in the existing report.
- Priorities show the three largest validated AED declines separately for each platform. Evidence sample strength (at least 20 orders in both periods) breaks equal-loss ties and is visible independently; no invented composite score or cross-platform total. Period dates are shown. Two or more consecutive declining steps are flagged only across uninterrupted complete weeks. Financial decline is not lost profit or proven causation.
- Priority navigation selects the exact authorized group and restores report focus. Native disclosures preserve state in memory across repaint, clear on auth reset, support keyboard interaction and local table scrolling at 390px. All detail remains reachable; current loading/error/retry flows remain.

## Cost / limits

No additional portal collection, schedule, API route, polling or browser report storage. Lens Talabat adds one narrow cached read of at most 14 older days (7000-row bound), with a 5-second timeout. Keeta/Noon add at most one narrow cached query each, only on Lens reads for authorized nonempty sources. These are real additional saved-database reads, not free/zero-transfer work. Old weeks need already-saved exact periods; absent periods are not reconstructed from overlapping rolling totals. Daily-source timestamps are not manufactured. No historical operational trend is inferred; current service/funnel findings stay in the existing platform reports.

Implementation: `src/services/lens-trends.ts`, the optional Lens history mode in `growth.ts`, `lens.ts`, and `public/lens-trends.js/css`. Verification includes calculation/scope/SQL regressions plus synthetic desktop/mobile, theme and RTL/LTR checks; production evidence must be reported separately.

Validation before release: build and all 299 tests passed. PGlite exercises both projected snapshot SQL queries, latest-revision selection, account conflicts and forbidden-shop exclusion. Synthetic browser matrix: 1440/390px, light/dark, Persian/English; priority/brand navigation, keyboard disclosures, provenance preservation and document overflow. Standards/spec reviews resolved numeric-consistency, observation-provenance and disclosure-state findings. No collector or live database writes were used in validation.

