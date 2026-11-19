# Emergency order monitoring

## Approved policy (2026-11-19)

The owner approved dashboard **and the existing Telegram chat**. Detect an order-count decline of at least 80% against the preceding seven complete calendar days, with a baseline daily mean of at least 4.5. This allows a quieter baseline day (e.g. six days of 5 and one of 3); it does not require every day to reach 5. This is order decline, not a revenue/profit claim.

Comparison uses exact integers (`current * 35 <= baseline total`), never rounded means. The baseline freezes at onset so persistent outages cannot lower their own threshold. Missing days break confirmed consecutive-day counts and never imply zero or recovery. Valid evidence above the frozen emergency threshold exits the incident; this is not proof of full business recovery. Source changes/revised frozen baselines require review.

Timezone is Asia/Dubai. Exclude the current day and observations made before that day's Dubai midnight. A source can lag yesterday by one reporting day, explicitly labelled; older or >48-hour-old observations are unknown. First detection needs seven complete dated baseline observations. New branches and low-volume branches are not emergencies without that evidence. Saved historical incidents may be retained when current evidence becomes unavailable.

## Sources and scope

`order-emergency-reader.ts` reads saved daily counts from published Talabat revisions, Keeta exact-day period snapshots (per account), Noon finalized exact-day store reports, and Deliveroo 30-day `total_orders` dated series. No portal calls, collection, backfill, schedules or credentials change. Talabat reuses published field revision rules and the existing narrowly approved zero-order evidence helper; blank values are otherwise unknown. Source/account lineage and revisions remain internal. Deliveroo's total-order definition remains platform-specific; no cross-platform order sum is produced.

The server requires `overview.emergencies`, Overview, and the respective Performance/Operations grant, then filters by **current active source registry and current brand/branch scope**. New explicit custom accounts must be granted the new feature; legacy full-access/owner policy remains unchanged. Display names never authorize a join. `GET /api/dashboard/performance/latest?dataset=order-emergencies` projects permitted evidence only; internal incident dictionaries, revisions and global source errors are not returned.

## Execution and delivery

Disabled by default. Set `ORDER_EMERGENCY_ALERTS_ENABLED=1` in the existing cloud deployment to enable the existing authenticated watchdog's extra step. The watchdog's schedule remains 15 minutes; daily evidence scans run at most hourly after a successful scan. Dashboard requests only read the saved snapshot. Failed scans retain prior incidents; the dashboard marks a failed or >2-hour-old monitor as unknown rather than claiming current emergencies or normality.

The watchdog JSON gains optional `orderEmergencies`, `emergencyPending`, `emergencyError`; old payloads remain valid. A separate `dashboard_order_emergency_notifications` outbox uses stable SHA-256 identifiers per source/branch/incident start/event type. Queue insertion and claim are autocommitted before sending, outside the watchdog's transaction. Replays and snapshot-save rollback therefore do not resend an already claimed event. One digest, at most 12 events of at most 280 characters each, is attempted per watchdog check to bound latency. Backlog drains on later scheduled checks without rescanning daily history. Messages use existing server-side Telegram configuration; there is no new recipient.

**Delivery ambiguity:** Telegram cannot provide exactly-once delivery across a process crash. A timed-out/failed request is recorded UNKNOWN and is not automatically retried; a crash after claiming may leave CLAIMED. These states produce an owner-only Telegram review notice on the next delivery check. Inspect outbox state before any deliberate resend. This favors avoiding duplicate notifications; dashboard detection persists even if a health Telegram message fails. A detected incident is not proof that menu problems caused the decline. No real Telegram test messages belong in validation.

## Investigation evidence (next checks)

For each confirmed emergency, an optional version-1 `diagnosis` enriches the saved row. It compares the incident report day with **daily means or ratios of summed denominators across the frozen seven-day baseline**, never with a different week. Published source revisions/account lineage must match the initial order read. No additional portal collection, schedule, notification recipient or business-policy threshold changes. Existing Telegram event identities stay unchanged; enriching an old incident does not resend it.

Only emergency sources are enriched. Context reads are bounded (3-second query timeout, 18,000-row limit) and failures leave the order emergency intact with insufficient context. Talabat uses published field projection; Keeta uses exact shop conversion/opening cards (hours converted to minutes); Noon uses exact-day funnel and operating hours; Deliveroo uses dated rejected-order series, not 30-day service totals. Nulls, missing days, duplicate shop metrics and invalid denominators remain unavailable. Each measurement requires the current day and all seven baseline days; there is no partial mean.

Investigation screening, not a vendor SLA or causal model:

- Visits decline at least 30%, with baseline mean at least 20; exposure decline at least 30%, with baseline at least 50.
- Reported ordering/visit ratio declines at least 30%, with baseline and current visits at least 20. This is a ratio of reported stages, not a traced customer cohort. If visits also fell, the wording explicitly says so.
- Unavailable share of scheduled time reaches at least 10%, rises at least 5 percentage points, and at least 20 unavailable minutes are observed. Baseline availability uses summed minutes, not mean percentages.
- Cancelled/lost share of reported successful-plus-cancelled/lost orders reaches at least 10%, increases at least 5 points and includes at least 2 affected current orders. Deliveroo rejection counts are kept distinct: at least 2 observed rejections and an increase of at least 2 against the daily baseline; no invented denominator.

Ranking prioritizes availability, then cancellation/rejection, then the larger relative funnel decline. The ranking is a review heuristic, not an estimate of sales explained. One leading check appears inline, up to two additional signals and the matched measurements stay under the existing disclosure. No strong signal and missing evidence are distinct states; neither establishes a cause. The server returns bounded derived fields only after existing section/platform/active-branch scope checks; stale or unknown emergencies carry no diagnosis. Old saved snapshots remain readable while awaiting the next hourly scan.

## Verification

Targeted tests cover exact threshold/volume boundaries, incomplete/duplicate/future data, frozen baselines, stale evidence, scope/grants, durable outbox deduplication and ambiguous delivery, and hourly throttling inside the existing watchdog. Browser preview uses clearly synthetic data, never production evidence. Read-only production source dry-run on Nov 19 confirmed all four SQL readers work; one bounded four-source scan took about 5.3 seconds (network/cold-start dependent), not a measurement of monthly compute savings.

Disable the environment flag to stop new scans and delivery without altering collector schedules or removing saved data. The public feature can also be independently withdrawn from a custom user. Release verification and any remaining limits must be recorded before enabling production.

## Released and activated

- Runtime release `9706ef6` is deployed to production; GitHub verification and Vercel deployment succeeded. Build and all **350 tests** passed. Standards/spec reviews were completed; disclosure persistence and initial UNKNOWN health-notification retry findings were resolved with regression checks.
- Synthetic browser checks covered 1440/390px, light/dark, LTR/RTL, local overflow (none), brand filtering, keyboard disclosure, preserved disclosure, pending/empty/error/retry and late responses after auth reset. These are synthetic UI checks, not an authenticated production UI inspection. The production module is reachable; an unauthenticated emergency API request returned 401.
- The Production-only config `ORDER_EMERGENCY_ALERTS_ENABLED=1` was saved before release. Existing cron job 8638496 remains enabled every 15 minutes in Asia/Tehran. No collector schedule or credential changed.
- First execution was manually started through that existing cron job on **2026-11-18 23:10:53 UTC (Nov 19, 03:10:53 Dubai)**, against genuine saved data. HTTP 200 in **8.74 seconds**; scan error false; 124 registered source/branch entries saved. Two real emergency events reached outbox SENT after Telegram acknowledgement; delivery uncertainty false. No synthetic alert was sent to production.
- Delivery acknowledgement confirms Telegram accepted the messages, not that a person read them. Fresh-report completeness and real-world menu root causes remain unverified where evidence is absent. Automatic calendar execution after activation is checked separately from this manual initial run.
