# Data confidence panel

2026-11-04. Compact progressive disclosure on Overview/platform ratings, Growth, Branch Lens and Talabat daily/weekly Performance. Uses only already loaded, server-authorized responses. No backend contract, source read, collector, polling interval, browser report storage or new service is introduced.

`public/data-trust.js` owns pure view projections and bilingual HTML rendering. `data-trust.css` uses the shared pearl/forest/charcoal tokens. Each platform has one keyboard-operable native disclosure with dataset-specific summaries. Opening it exposes each dataset's own observation/save time, source period, gap reasons and available coverage; ratings and report periods are never merged into a single freshness verdict. Times are displayed in Dubai time; invalid/future timestamps are explicitly unavailable.

- Ratings: finite 1–5 ratings / returned authorized rows, carried-forward counts and oldest/newest valid observation dates. Freshness uses the existing `cloudHealth` policy. These counts do not claim coverage of every registered branch.
- Growth/Lens: comparable branch rows / returned comparison rows. Current/previous missingness, old periods and low samples remain distinct. Deliveroo service reports are separate and never imply sales collection. Source SUCCESS is labeled Saved, not Complete. Overview uses the existing Growth load; its failed-refresh flag retains the last-success dates and discloses the failure without resurrecting state after auth reset.
- Performance: current report filters. Complete sales/order periods require valid values plus exact per-metric day coverage for weekly data. Unknown legacy coverage is not counted complete. Other service/funnel fields can still be incomplete. Partial sums remain in their owning report.

Overview counts describe authorized source scope independently of branch-table filters. Growth follows its platform/brand/branch filters; Lens follows the exact selected branch. Feature gating stays in the original readers and Overview avoids showing cached Growth data without Growth permission.

Disclosure state is memory-only, contains component keys rather than report data, and clears on auth reset. Existing request-generation/auth guards remain. The new component performs no fetch and adds no timers. Styling is excluded from print; original exports remain authoritative.

## Confirmed display alias

User confirmed **FRB Kabab — Al Warqa 3** and **FRB Kabab — Al Warqa** are the same branch. The former now displays as Al Warqa only for FRB Kabab, using `BranchLabels`. Authorized cross-platform rows group in the UI and exports. Raw names, source IDs, registry mappings and permission keys are unchanged; same-platform collisions are still kept separate. Other brands' Al Warqa 3 labels remain unchanged.

## Validation

Build and 292 tests pass. Targeted checks cover per-dataset clocks, carried-forward provenance, zero/missing distinctions, per-metric day gaps, zero-row source failures, escaping, disclosure reset, stale post-logout completions and source-preserving export grouping. Playwright synthetic checks exercise four integrated views at 1440px/390px in light/dark, Persian/English, keyboard disclosure and no overflow. Standards/spec reviews completed; missing metric-day explanations and dropped platform-level failure reasons were corrected and rechecked. No live alternate-user impersonation or source-portal reconciliation was performed; original export encoding is unchanged and its grouping is covered by regression tests.
