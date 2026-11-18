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

**Delivery ambiguity:** Telegram cannot provide exactly-once delivery across a process crash. A timed-out/failed request is recorded UNKNOWN and is not automatically retried; a crash after claiming may leave CLAIMED. Inspect these outbox states during operations before any deliberate resend. This favors avoiding duplicate notifications; dashboard detection is independent of delivery. A detected incident is not proof that menu problems caused the decline. No real Telegram test messages belong in validation.

## Verification

Targeted tests cover exact threshold/volume boundaries, incomplete/duplicate/future data, frozen baselines, stale evidence, scope/grants, durable outbox deduplication and ambiguous delivery, and hourly throttling inside the existing watchdog. Browser preview uses clearly synthetic data, never production evidence. Read-only production source dry-run on Nov 19 confirmed all four SQL readers work; one bounded four-source scan took about 5.3 seconds (network/cold-start dependent), not a measurement of monthly compute savings.

Disable the environment flag to stop new scans and delivery without altering collector schedules or removing saved data. The public feature can also be independently withdrawn from a custom user. Release verification and any remaining limits must be recorded before enabling production.
