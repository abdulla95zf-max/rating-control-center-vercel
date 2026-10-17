# Evidence-led Growth next checks

Growth rows include a versioned, read-only `recommendation`: title, action,
confidence, measured evidence, unknowns, and an optional independent quality check.
This is a deterministic screening aid, not a causal model or a promise of recovered
revenue. It does not create assignments, change prices, or start campaigns.

Recommendations are calculated **after authorization and branch scoping**. Context
must match the exact branch identity and both comparison periods. Keeta customer
funnel records are matched by shop ID; duplicate/missing metrics or previous values
cannot drive stage-specific advice. Noon customer/complaint context must match the
nested report dates. No sources are joined by display name.

Rules distinguish discovery/entry, menu conversion, checkout progression, basket
changes, general demand checks, zero orders, growing/stable sales, and insufficient
data. Keeta discovery advice requires fewer orders and entries with non-deteriorating
entry-to-cart conversion. Evidence never equates funnel customer counts with valid
order counts. Basket advice compares negative mathematical components and highlights
unknown prior product mix, discounts and unusually large orders.

Both periods need at least 20 orders for ordinary directional advice. Smaller
samples receive low-confidence inspection advice. Declines below 5% receive a
low-confidence monitoring recommendation. These are explicit screening defaults,
not statistical significance tests. Maximum advice confidence is Medium; precise
causes such as prices, promotions or delivery fees remain unverified until checked.
Invalid/incomplete/stale comparisons produce data checks, not sales interventions.
Platform read failures pause recommendations for that platform.

Noon complaint-order counts are shown separately only with a matching denominator.
They are not asserted to explain sales changes. Opening a Talabat Growth detail
loads only its own branch's 1–2 star reviews for the same dates using the existing
authorized reader. The review preview retains the exact order link; the full-review
button preserves dates, branch and stars. Incomplete/unavailable review evidence
stays unknown. A request cannot repaint another detail or a newer login.

The table shows a short next-check title. Its branch detail exposes the action,
evidence, confidence, unknowns, optional quality check and source-report link.
No collector, raw metric storage, session, scheduling, or existing comparison
eligibility rules are changed. Independent confirmed no-order dates remain governed
by the existing exact branch/day evidence list.
