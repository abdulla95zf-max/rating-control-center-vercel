# Early attention in Branch Lens

The owner approved a compact multi-week early-attention list, complementing the daily emergency monitor. It reuses authorized `row.trend.weeks` already loaded by Branch Lens. No new API/database/source reads, collections, polling, storage, access grants or notifications are introduced. Current server-side Lens, platform Performance and active brand/branch authorization remains the data boundary.

## Screening

- Require an eligible current comparison and successful four-slot trend response. Use the latest contiguous suffix of complete seven-day periods, with at least three verified weeks. Do not skip a gap in the middle or substitute an older week.
- Current and previous trend totals/dates must reconcile with the row's eligible current comparison. Duplicate source rows within a platform/group cannot rank. Unknown, contradictory, missing and zero evidence stay distinct.
- Every included week must have at least 20 orders, consistent with ordinary Growth directional screening. An older fourth low-volume week cannot strengthen an otherwise valid three-week sample.
- Sales or orders must decline by at least 5% in each of at least two consecutive latest weekly steps, and by at least 10% overall across those steps. These are explicit review-screening heuristics, not statistical significance tests. Rounded percentages never decide eligibility.
- Orders can weaken while sales hold up through larger baskets. Such cases remain visible with **zero latest-week financial decline**, not invented monetary loss. No percentage is calculated from a zero sales baseline.

## Ranking and evidence

Rank by measured **latest-week** sales decline in AED, separately within each platform and identical latest report dates; then by number of complete weeks and minimum weekly sample. Do not rank a three-week total decline against a four-week total decline. Do not combine platforms, calculate profit loss or claim a cause. Source-specific dates remain visible.

Each row links to the existing exact branch Lens view. Its disclosure keeps all included weekly sales, orders and recomputed average baskets reachable. Latest-week order/basket mathematical effects use the existing symmetric decomposition; their sum reconciles to that week's sales change, not a causal sales attribution.

Visits and availability context must match the latest **two-week** comparison, which is labelled explicitly; there is no invented four-week funnel series. Ratings come only from the already-authorized branch/platform rating rows; a unique dated latest snapshot and any dated previous saved snapshot are labelled independent of sales dates. Missing context or ungranted ratings remain unavailable. Deliveroo sales are not collected and are outside this sales screen.

The section is placed above the existing Lens priorities and branch selector. Source/date disclosures and top-three lists keep it compact; remaining cases and supporting evidence remain accessible. Disclosure state is bounded, preserved through repaint, and cleared on auth reset. Existing branch navigation, themes, Persian/English and manual refresh behavior remain unchanged.

## Verification — November 19, 2026

Build and all **366 tests** passed. Pure behavior tests cover suffix completeness, period reconciliation, sample exclusions, tiny fluctuations, recovery, sales/orders divergence, exact latest-week decomposition, platform/date separation, conflicting sources, escaping and independent dated context. Standards and specification reviews found no blocking issue; a presentation ambiguity was resolved by naming the declining metric and the displayed percentage horizon. Persian numerical arrows use explicit LTR isolation.

Synthetic browser checks passed at 1440/390px in both themes and languages, with no document overflow or ordinary page errors. Keyboard disclosures, preserved open state through language repaint, exact branch navigation, error/retry and auth-reset clearing worked. The branch navigation/language/detail flow kept the Lens request count at one; the separate error/retry test deliberately aborted requests and produced expected network errors. Synthetic candidate counts and monetary examples are not production findings. No authenticated production UI or current real branch ranking is claimed by these checks.
