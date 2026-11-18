# External relay cadence — November 18, 2026

## Authorized change and scope

The owner requested reducing unnecessary scheduler/watchdog visits to Neon after the manual-refresh release. Live cron-job.org configuration confirmed Talabat relay job 8644387 was enabled every minute, while watchdog job 8638496 was already enabled every 15 minutes.

Change the external Talabat relay interval to `*/15 * * * *` in its existing Asia/Tehran timezone. Keep its URL, authentication, enabled state, notifications and response history unchanged. Keep the watchdog at 15 minutes; it still reads verified saved-source evidence and retains its 7-hour Talabat and 26-hour Keeta delay policies. This watchdog covers only those two platforms.

## Timing and safety

- Source collection slots remain four Ratings slots per day at 00:17/06:17/12:17/18:17 UTC, daily Performance at 05:30 UTC and daily tStar at 05:45 UTC. Idle relay requests do not collect data.
- A free runner on the quarter-hour grid first visits each Ratings slot at :30 (13 minutes after :17). Performance and tStar nominal times align to the grid. Busy jobs and service delays can postpone execution further, just as before; the 15-minute change is not an exact start-time guarantee.
- Existing one-hour Ratings and six-hour daily eligibility windows, server flags, busy-run check, committed unique slot ledger and no-replay rule for uncertain dispatches remain unchanged. Sustained outages beyond those windows still require investigation.
- Relay HTTP calls fall from 1,440 to 96 per full day (93.3%). This is the configured request-count reduction, not measured Neon CU-hour savings. The watchdog retains its existing 96 checks per day.
- Aligning both jobs on quarter-hour boundaries creates idle gaps between background checks; browser usage, other services, collector work and cold starts can still wake or hold compute. No guarantee about scale-to-zero or monthly allowance is made.

## Verification and rollback

New behavior tests replay a full quarter-hour day with busy runners, catch up after a missed morning window, preserve unknown-delivery no-replay, and compare fresh-process ledger SQL with the existing one-minute relay. The synthetic cold-instance replay retained the same six dispatches and reduced SQL calls from 2,491 to 170; this is not a production or billing measurement.

Before saving: build and all tests must pass. After saving: confirm the persisted quarter-hour schedule, watchdog interval, successful authenticated relay response and ledger state without blindly dispatching duplicate work. Record a provider CU-hour baseline and compare later over comparable usage; a short sample cannot assign costs to one component.

Rollback: restore job 8644387 to every minute. No application or database migration is necessary. Do not disable the watchdog or change source collection schedules as a rollback.

## Applied configuration and measurement baseline

- November 18: cron-job.org confirmed `Cronjob saved successfully` for enabled relay 8644387 at `*/15 * * * *` (Asia/Tehran), with the next automatic execution at 10:45 Tehran. Watchdog 8638496 remained at 15 minutes; its 10:30 check was successful. The prior relay's last recorded minute-based execution was 10:32.
- Build and all 334 tests passed, including 15 scheduler tests. Separate standards/specification reviews reported no actionable findings. No application runtime code or database schema changed.
- Owner-supplied production Neon screenshot at November 18, 10:36 Tehran: 59.14 CU-hours since November 1; storage 131.94 MB; history 4.49 MB; network transfer 252.32 MB; Free plan; default compute 0.25–2 CU. Against the November 17 sample of 57.01 CU-hours, the increase is 2.13 CU-hours over an interval shorter than a full day; it is not a daily rate.
- Compare a later provider sample after 24–48 hours of comparable use. Provider metrics may lag. Configured request-count reduction is confirmed; actual CU-hour savings are not yet measured. The empty alternate Neon account observed during login is not the production project's quota.

## Verified first quarter-hour execution

- Relay executed automatically at 10:45:12 Tehran, returned HTTP 200 in 4.56 seconds and `CHECKED` with `issues:[]` for today's Performance, tStar and 06:17 Ratings slots. The next execution was 11:00. No manual test or extra collection was triggered.
- Watchdog executed automatically at 10:45:19 Tehran, returned HTTP 200 in 3.62 seconds. A bounded read-only DB check at 07:16 UTC confirmed its persisted 07:15 checkpoint and OK health for both Talabat and Keeta.
- The same DB check confirmed ACCEPTED ledger entries for today's 00:17 and 06:17 Ratings, 05:30 Performance and 05:45 tStar slots. The CHECKED response reused already accepted work; a new collection slot under the new cadence has not yet been observed live. Busy/catch-up behavior remains covered by the tests, not misrepresented as a new live dispatch.
