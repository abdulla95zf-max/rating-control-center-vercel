# Performance dashboard

The Performance tab reads stored Talabat CSV revisions via a server-to-server proxy.
It does not run a collector or open a portal browser. No OpenAI dependency is added.

## Coverage and aggregation correction — 2026-11-04

The 7-day API now selects seven consecutive calendar dates ending at the latest saved day on/before yesterday, never seven nonconsecutive available days. `dayCount` is the count of saved report dates, not proof of complete branch coverage. Each period row additionally supplies `coverage.expectedDays`, `presentDays`, and `metricDays` for aggregated metrics. Latest resolved fields stay within each existing exact source/day/revision boundary. No stored revisions or collector schedules change.

Preparation uses successful-order weighting, the established Branch Lens convention. A positive-order day missing preparation, or a day missing/invalid orders, makes the preparation result unavailable; zero-order days contribute no weight. Zero total orders gives unknown preparation, not zero minutes. This is the same calculation convention as Lens, not a claim to reproduce an undocumented vendor denominator. Percentage columns retain explicitly labeled means of available daily reported rates; valid period denominators have not been established for all those vendor fields. `aggregation` describes `SUM`, `ORDER_WEIGHTED` or `DAILY_MEAN` by metric.

Partial sums remain visible. KPI totals disclose complete branch periods, and each branch/metric exposes its day count. Weekly comparison charts exclude incomplete or unknown metric coverage; numeric table sorting puts such rows after comparable rows while retaining their details. Older backend payloads without the optional metadata remain accepted and explicitly display unknown coverage. Daily report behavior remains unchanged.

tStar null tiers display **Unavailable**, unfamiliar codes **Unknown tier**, and only explicit `INELIGIBLE__LOW_ORDERS` displays **Not eligible**. Missing current-tier data and source period are disclosed separately; no source missingness is converted into an eligibility decision.

Deployment order: publish the backward-compatible Talabat API first, then dashboard. No migration, new secret or collection run is needed. The dashboard proxy validates and projects the optional metadata before applying the existing active-branch/user scope.

Validation for this correction: dashboard build and 285 tests pass; Talabat build and 691 tests pass. Isolated SQL regression covers unequal order weights, missing positive-order preparation, zero-order undefined averages, partial branches and an internal calendar gap. Browser checks with explicitly synthetic data cover 1440px/390px, both themes, filters, monthly missingness, two-platform Lens coverage, language switching, keyboard focus and error/retry. Independent standards/spec review completed; the source-membership identity finding was corrected and rechecked. No collector was run by validation.

## Deployment

1. Deploy the backend patch into C:\talabat-rating-monitor-vercel-poc first.
2. Deploy the dashboard patch into C:\RatingControlCenter-Vercel.
3. Existing backend DATABASE_URL, REPORT_SOURCE_KEY and RATINGS_API_TOKEN are used.
   Existing dashboard RATINGS_API_URL and RATINGS_API_TOKEN are used unchanged.
4. No migration, dependency installation or new environment variable is required.
5. Open the dashboard with #performance. Both deployments must be Ready.

Backend GET /api/performance/latest accepts optional date=YYYY-MM-DD, with Bearer
RATINGS_API_TOKEN. The browser calls only GET /api/dashboard/performance/latest.
The proxy derives the report URL from the validated ratings URL and keeps the same
origin. Redirects are rejected, timeout is 25 seconds, response is capped at 2 MB,
and only validated fields are returned. No driver errors or credentials are exposed.

The backend opens a repeatable-read, read-only transaction. It reads one entire
current revision for one source/day. It never combines rows across revisions or
sources. Available dates are capped at 90; an explicit valid date can read an older
stored report. Default is newest stored day on/before two days ago in Asia/Dubai;
an older fallback is labeled clearly. A missing requested day has an EMPTY state.
The selected source is the existing REPORT_SOURCE_KEY, never browser supplied.

## Display and calculations

- Tabs: Sales & orders, Operations, Customer funnel.
- Date, brand, exact branch and text filters; branch rows are never merged by name.
- Click a branch for all 53 non-identity source fields (56 CSV columns minus Date,
  Restaurant ID and Outlet name, which are represented separately).
- Totals: Gross Sales, Successful Orders, Cancelled Orders, Total customer complaints
  received. Totals include only numeric cells in present rows; coverage is shown.
- Gross Sales is source gross sales in AED, not settlement/net proceeds.
- Source percentage fields are displayed as reported. No average of branch rates or
  averages is calculated. Total AWT Duration is explicitly TOTAL minutes, not a mean.
- Zero remains zero. Empty source cells remain unknown. Missing scoped branches have
  unknown metrics, not zero revenue. Source absence does not prove inactivity.
- Names for missing CSV rows fall back to the latest known rating name using exact
  TB_AE;storeId identity. Brand normalization is presentation only.
- Funnel coverage concerns only four funnel columns, not overall data quality.
- All report values are escaped before display. Unknown upstream fields are dropped.
- No cross-day graphs or blended rates are fabricated. Only stored days are offered.

## Action Center

- Rating actions use each platform's latest snapshot and trigger only below 4.1.
- Daily Performance actions trigger above these source values: customer complaint
  rate 1%, avoidable cancellation rate 1.5%, unavailable time rate 2%, and average
  preparation time 16 minutes.
- Operational thresholds are evaluated only when Successful Orders is numeric and
  above zero for that report day. Zero-order rows do not create operational actions;
  a missing order value creates a data check instead of assuming zero.
- The action row shows the day's Successful Orders for context. Rating actions remain
  independent of daily order count.
- Action Center has its own brand filter. Counts and the 12-row priority list follow
  that filter.

Reports are rechecked at most once per five minutes while this tab is active;
brand/branch/search/view changes use the loaded data. Manual refresh bypasses the
browser memory cache. There is no browser localStorage persistence of reports.
An error removes the old report display and offers Retry. Ratings retain their
existing independent refresh behavior.

## Validation

Backend read/storage/ratings regression suite: 17 tests passed, including real SQL
against an isolated PGlite database. Backend build passed.
Dashboard application/proxy/regression suites: 36 tests passed. Dashboard build passed.
Windows packaging tests are excluded because the supplied source ZIP intentionally
omits Windows installers and .env.example; no missing files were fabricated.
No live Neon, Vercel, GitHub, Telegram or Talabat operations are performed by these tests.

Chromium UI checks passed with synthetic data at 1440px and 390px: filters, date
selection, metric views, details, cache reuse, error/retry and no horizontal overflow.
