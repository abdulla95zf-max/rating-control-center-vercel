# Saved-data coverage audit

## Scope and policy (2026-11-19)

Inside the existing Overview Data confidence panel, a closed disclosure reads saved per-source daily coverage and current weekly comparisons on demand. No extra Overview panel, portal automation, collection, backfill, or polling is introduced.

The existing hourly emergency scan already reads 35 days of orders and sales. Its snapshot now also stores a compact audit: most recent valid completed order day, missing/duplicate/invalid order dates in the last 28 completed Dubai days, and four non-overlapping weekly sales/order summaries anchored to that source's reporting date. Missing days remain unknown; sales and order completeness are counted separately. Historical dates require the same unique-source, revision and end-of-day validation as emergency evidence. Account identity is retained for Keeta reconciliation. Existing incidents, thresholds, Telegram event identities and schedules remain unchanged. Legacy snapshots show unavailable audit until a regular scan upgrades them. Optional audit summaries are omitted if they would exceed the established 500,000-byte monitor payload budget; emergency evidence and incidents take precedence.

`GET /api/dashboard/performance/latest?dataset=data-audit` reuses the existing cloud dispatcher. Server requires Overview + overview.confidence, and each source's Performance/Operations grant and current active branch scope before projection. Actual emergency status/reason additionally requires overview.emergencies; otherwise it is NOT_PERMITTED. No internal incidents, revision IDs or unauthorized row counts are returned. Expired monitor evidence (>2 hours), read errors and missing summaries do not assert current coverage.

Weekly reads reuse scoped Growth readers and their bounded caches; disclosure requests coalesce and cache in memory for five minutes, and auth reset clears client data. The frontend requests nothing for this audit while closed. Manual refresh invalidates its cache; no additional automatic timer is added.

For Keeta and Noon, reconciliation requires a unique source, same Keeta account, eligible report, and exact complete current and previous weekly windows. Each period compares order totals and AED sales independently; an order difference or sales difference exceeding AED 0.01 is flagged. Different collection times or revisions can explain a difference, which is not proof of corruption. Talabat weekly values are derived from the same daily rows and are labelled non-independent; Deliveroo sales are not collected. Unmatched periods are unverified, not mismatches.

The list prioritizes differences, unavailable audit, emergency screening exclusions and missing days. It exposes actual emergency and weekly comparison eligibility separately. Four-week daily completeness is a history screen, not a claim that the separate Lens trend algorithm passed or failed; its exact snapshot/account/period rules still apply.

## Related compact UI changes

Emergency orders now occupy a single closed summary row by default, with count and explicit uncertainty states. Opening reveals compact branch rows; each row's recommended checks and evidence are disclosed together. Filters, detailed coverage, counts, monitor time and all existing measurements remain reachable. In-memory expansion/filter state survives rerenders and clears on auth reset.

Lens brand choices retain exact authorized names, source ordering, logos, controls and navigation. Intrinsic-width, single-line buttons replace equal-width desktop compression; horizontal scrolling is confined to the selector row. All buttons remain 48px high. No source identity or alias changes.

## Validation

Behavior tests cover coverage/zero/duplicate distinctions, authorization, account and period identity, missing/legacy/stale snapshots and reconciliation differences. Browser checks use synthetic local data only; do not treat them as production observations. Production audit details require the next normal monitor scan and an authenticated UI check.

Build and 379 tests passed. Synthetic browser checks covered 1440px/390px light/dark and Lens English/Persian: no page overflow or page errors, all eight brand controls 48px and unwrapped, closed emergency strip 58px. Audit made zero requests before expansion and one afterward. Keyboard activation, nested checks, fast-rerender disclosure preservation, error/retry, pending evidence and auth-reset cleanup passed. Separate spec/standards reviews found and closed previous-account provenance and monitor payload-size issues. Final interface audit preserved native details keyboard controls, visible focus and live loading feedback.
