# Scheduler database read reduction

## Evidence and scope

Neon production project `frb-control-center-production` showed 30.64 CU-hours since November 1. A live query-performance sample showed 34 scheduler claim attempts, 33 state reads and 67 repeated `CREATE TABLE IF NOT EXISTS` calls; these counters are a short sample, not monthly attribution. Compute autoscaling was 0.25–2 CU, with scale-to-zero after five idle minutes. No endpoint settings or collector schedules were changed.

The minute-based relay repeatedly visits an already ACCEPTED slot during its eligibility window (one hour for ratings, six hours for the daily jobs). Even very fast queries can prevent five idle minutes. This patch addresses that repeated work, not the watchdog, user authentication or collector behavior.

## Behavior

- Preserve PostgreSQL's unique workflow/UTC-slot claim and commit-before-dispatch behavior.
- Reuse only ACCEPTED outcomes read from PostgreSQL or successfully persisted by `finish`. DISPATCHING, UNKNOWN, REJECTED, missing/invalid states and failed finishes are not cached.
- Keep a process-local cache per database-pool identity, shared across the stores constructed per HTTP request. Bound it to 64 slots and six hours plus one minute (covering the inclusive six-hour eligibility boundary).
- Initialize the unchanged scheduler table once per database pool, coalescing concurrent initialization and retrying failures using the existing initializer pattern.
- Retain GitHub configuration and busy-run checks. Cold or separate function instances still consult PostgreSQL; no global cache or exactly-once guarantee is claimed. Eviction/expiry rechecks PostgreSQL and does not resend an accepted slot.

## Validation and production limits

Existing UTC schedules, activation cutoff, busy-run behavior and uncertain-delivery tests remain unchanged. New tests exercise cross-request reuse, database isolation, expiry, bounded capacity, initialization retry/coalescing, failed finish, result-copy isolation and a complete synthetic day.

In the accepted-slot replay with a warm instance and one tick per minute, SQL count fell from 3,864 to 13. This is a synthetic request reduction, not measured production CU-hour savings. Cold starts, other clients and the watchdog may still wake the shared database. Verify deployment, actual scheduler health and later Neon compute consumption before claiming real savings.

Rollback: revert this patch; persisted ledger format and schedules are unchanged.

Validation completed: npm run build passed; npm test passed 306/306 tests, including 12 scheduler tests. Separate standards and specification reviews reported no actionable findings. Live CU-hour savings remain unmeasured; no collector timing or Neon endpoint changes are part of this release.
