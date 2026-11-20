# Analysis correctness repair — 19 November 2026

Scope: the first three findings from the live site review, followed by the narrow disconnected-status correction below. Registry consolidation and collector/source-gap investigations remain separate work. No grants, source data, collector schedules, thresholds owned by other views, API routes or automatic requests change.

## Keeta customer stage ratios

Keep all reported counts/percentages visible, including anomalous values; label them descriptive stage ratios, not a tracked customer cohort. A ratio outside 0–100% is text-only, not a clipped probability bar. A raw percentage-point difference is an arithmetic observation, not sufficient for a prioritized recommendation.

Ranking requires unique metric codes; exact valid, completed, contiguous equal-length current/previous report dates; current/previous integer nonnegative upstream and downstream counts; downstream <= upstream; at least 20 upstream observations in **each** period; reported ratios within 0–100% and within 0.15 percentage points of their respective count ratios (source rounding tolerance). Each excluded stage displays its reason. The eligible-stage comparison says it is among sufficiently supported stages, and does not claim a cause. The 20-observation management screen is local to this view, not a vendor SLA or statistical significance test. Other operational and emergency policies remain unchanged.

## Review keyword classification

Retain the transparent keyword model and inspectable review IDs/evidence. Before the missing-item rule only, remove the idiom “missing out” and selected explicit English/Arabic/Persian negations of missing items. Other categories and genuine complaints in the same text remain eligible. Five-star reviews are not excluded. Normalize Persian and Arabic yeh consistently. Browser and server rules remain identical and are checked against the same fixtures. This is a bounded correction, not a claim of full semantic or multilingual negation understanding.

## Rating precision

UI and print show the numeric source rating with at least one decimal and without the former one-decimal rounding. Excel retains numeric cells and an optional-decimal number format. Classification thresholds remain in rating-status.ts; no rating score is modified.

Recent Changes decides direction/ranking on the unrounded numeric difference. Only the displayed delta is cleaned to 12 significant digits to remove binary subtraction noise; this does not suppress small changes. Existing action/recovery thresholds remain unchanged. Existing observations, missing values, filters, scope, row ordering and authorization are preserved.

## Verification plan

Regress invalid 150% stage ratios, small/absent denominators, missing/duplicate metrics, nonreconciling counts, incomplete/unmatched periods, and a supported stage comparison. Test idioms/negations, genuine mixed five-star complaints and browser/server parity. Regress 4.39→4.4 and small 4.1 boundary drops, unchanged ratings, precision in screen/print and numeric Excel output. Exercise synthetic browser flows at 1440/390, both themes and relevant direction states; no synthetic data is sent to production.

Build and all 389 tests passed. Synthetic browser checks at 1440/390, light/dark and LTR/RTL preserved the raw 150% while withholding unsupported rankings; a valid matched stage still produced a cautious comparison. No overflow or page errors were observed. Recent Changes displayed 4.4→4.39 (−0.01); print HTML displayed 4.39. A canvas test verifies the exact 4.39 tooltip with concise 5.0 axis ticks. Excel numeric cells and optional-decimal formatting were verified in OOXML; native Excel rendering and OS print dialogs were not exercised. Separate standards/spec review found and closed the history-tooltip precision gap, with no remaining actionable findings.

## 20 November follow-up

`renderDisconnected` now replaces the previous dataset's health label with the current platform's Not connected text and an EMPTY indicator. This prevents, for example, Careem inheriting a Deliveroo/Keeta FRESH label. A focused regression plus the full build/390 tests passed. Synthetic browser transitions from Keeta Performance to Careem passed at 1440/390 in light/dark, with no page errors or overflow and no additional source requests introduced by the correction.

A single bounded read-only registry query confirmed 11 active label-equivalent record pairs when existing brand-aware display aliases are applied. Their source types are typically split between Talabat and the other platforms. This establishes distinct legacy/source registry records, not physical-branch equivalence. Preserve canonical keys, source identities, active flags and grants; do not merge from labels alone. An ignored local audit artifact records the exact mappings for a later reviewed identity plan. No registry or permission data was modified.

Live verification before the browser tool became unavailable confirmed exact Deliveroo source ratings 4.354167 versus 4.4275 and a supported cautious Keeta stage comparison. The final live check of the historical “missing out” theme could not be completed after the browser-control integration changed; server/browser rule parity and the offending phrase are covered by automated tests. Do not claim that final live theme check passed.
