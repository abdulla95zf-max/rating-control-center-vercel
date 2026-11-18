# Neon compute reduction assessment — 2026-11-17

Status: initial read-only assessment, followed by the authorized browser-refresh phase below. Scheduler, collector schedules, schema and authentication are unchanged.

## Evidence and limits

- Console production project `frb-control-center-production`: 57.01 of 100 CU-hours since November 1, 242.51 MB of 5 GB public transfer, 131.18 MB of 1 GB storage. Metrics may lag. These are whole-project totals, not attribution to individual components.
- A bounded read-only sample at 13:22 UTC woke the compute: postmaster startup was 13:22:16 UTC and only the audit connection was active. Statement statistics were unavailable (`public.pg_stat_statements` absent). No extension was installed or statistics reset. We cannot assign monthly CU-hour percentages to jobs from this sample.
- Watchdog's saved last check was 13:15 UTC. This does not establish its full configured interval. The watchdog always opens a DB transaction, acquires a lock, runs `CREATE TABLE IF NOT EXISTS`, reads saved state and normally writes a checkpoint; even its one-minute throttle is evaluated inside that transaction.
- The Talabat relay already has an accepted-slot process cache and coalesced table initialization (November 8 change). It performs no DB work when no slots are due. Cold/separate instances still consult the ledger during slot windows; do not repeat the prior patch or assume its synthetic SQL reduction equals CU savings.
- At assessment time dashboard config refresh was 60 seconds. Ratings browser cache is 60 seconds; daily report/Lens/Growth caches are generally five minutes; hidden tabs were already skipped. Each authorized API request still checks the DB-backed user/session, so extending only data caches cannot guarantee sleep.

## Implemented browser-refresh phase

- Default: manual refresh after the initial authorized page read. The header offers Refresh and an explicit optional 15-minute mode. Only this non-sensitive preference is saved in localStorage; blocked storage defaults safely to manual.
- Automatic ticks skip hidden tabs and unauthenticated sessions. Auth reset cancels the timer; overlapping refresh clicks coalesce. Normal navigation, explicit queued-report progress checks and collector schedules are preserved.
- Refresh reads saved data for the current page, bypassing its browser report cache while retaining bounded server cache policy. It never starts portal collection. Branch Lens preserves its open brand/branch selection on forced refresh.
- Cloud config reports autoRefreshEnabled=false and autoRefreshSeconds=900. The browser control owns the opt-in policy; legacy local config intervals do not enable polling.
- This reduces idle browser requests; actual Neon CU-hour savings remain unmeasured. The November 18 external relay cadence phase is recorded in `SCHEDULER-CADENCE-2026-11-18.md`. Shared cache and precomputation remain pending, not claimed complete.
- Shared server caches are per process/pool/fetch identity, not shared across Vercel instances. Source/source-account scope and server-side permissions must remain intact.
- Existing October 19 isolated load tests passed the 10-client stage and failed parts of the 50-client stage. They are neither current production capacity measurements nor acceptable evidence to advertise a 50-user guarantee.

## Priority order

1. Measure wake windows and call categories using existing provider/runtime telemetry with low sampling frequency. Distinguish query duration from billed active time. Do not add frequent SQL monitoring or a new DB log write per request. Capture a comparable baseline before measuring savings.
2. Reduce background DB wakeups: examine the actual external watchdog schedule and relay cold-start frequency. Prefer a compact health receipt outside Neon, published only after verified persistence, for routine health checks. Preserve source timestamps, coverage, failures and notifications; a green GitHub run alone is not proof of fresh data. Preserve the durable relay ledger and unknown-delivery protection. Any narrowed relay retry windows require missed-slot and recovery tests.
3. Replace minute-by-minute data refresh with source-aware, adaptive browser refresh; offer manual refresh and an explicit live mode. Preserve existing hidden-tab behavior, selection state, meaningful freshness and logout/revocation. Polling every five minutes can still inhibit a five-minute idle timeout; test intervals and actual sleep rather than assuming savings.
4. For growth, publish validated current source snapshots and reuse them across instances in bounded private cache storage. Apply current server authorization before returning scoped rows. Failed/partial reads cannot advance a healthy baseline. Coordinate invalidation with verified collector saves; do not mask observation age or cache sensitive user data in public/browser storage.
5. Batch collector persistence and precompute expensive report summaries after saved revisions, preserving transactions, exact source identity and KPI policies. Use query plans/index evidence before adding indexes or changing history retention. Do not drop history or store unchanged metadata as new business events merely to reduce bytes.

## Acceptance

- Compare CU-hours per day over comparable usage, plus actual active/idle windows; report measured savings only.
- Verify collector timing/recovery, source freshness, manual refresh, authentication/revocation and source/branch scope.
- Before growth claims, run an isolated bounded load test of the changed version; no unbounded load against production.
- At minimum 0.25 CU, 100 CU-hours funds 400 active compute hours. Continuous 30-day activity is 180 CU-hours at that minimum. The Free allowance cannot be promised for continuous growth through SQL tuning alone.

No paid services or reduced collection frequencies are approved by this assessment.
