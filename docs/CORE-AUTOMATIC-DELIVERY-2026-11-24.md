# Core automatic rating delivery — production activation

Owner request: send one current snapshot now, then send automatically when ratings change. The owner confirmed that Core-side mapping was ready. This activation does not change collector schedules or run collectors.

## Released implementation

- RCC sender, persistent queue, protected route and 30-minute pending retry workflow: `2cb7920308736b718fa9511db345009f1baa525a` (baseline `a600ac046cf155fa5ea090c2c8aa8a5b809d523c`). Vercel production deployment `dpl_8RhqURAnXqQevHtkKTEmhTUgajuE` reached Ready.
- Talabat notifier: `072a697`; Keeta notifier: `ac0fc92`; Noon notifier: `5ed257d`; Deliveroo notifier: `d106ba0`. Each was pushed to its existing main branch. Existing collection workflows and schedules were unchanged.
- Existing Core production signing key configured server-side on RCC; a separate notification credential configured in RCC and all five relevant GitHub repositories. No secret values are recorded here or in source.
- Current payload remains only `branchId`, `brand`, `branch`, `platform`, `rating` per rating, plus the signed event envelope. No separate catalog, platform identifiers, review counts or sales data.

## Current snapshot delivered

On 2026-11-24 at 13:41:23 UTC (17:11:23 Tehran), Core acknowledged event `6d7c2b50-b39f-4a6e-b03d-5815104a646a`, sequence 4. The protected sender returned `APPLIED`, 122 ratings. This requires matching event identity and Core's applied/duplicate status with zero unmapped rows; HTTP 200 alone cannot acknowledge an event. The saved baseline has 18 unavailable ratings (`null`), not zeros.

The read-only database checkpoint at 13:43:50 UTC showed generation=handled=7, sequence=4, 122 baseline rows, no pending event, no lease, no last error and last success 13:41:23 UTC. Local bounded activation receipt: `outputs/core-auto-activation-receipt.json` (ignored, contains no credentials). Later source changes can legitimately change these values.

## Verification

- `npm run build` passed; `npm test` passed all 398 tests. Added behavior tests cover minimal fields/nulls, duplicate identities, missing rows, unchanged state, source outages, rejected/unmapped receiver responses, retry ordering/backoff, concurrent notifications, PostgreSQL lease fencing and exact request bytes after JSONB reload/process restart.
- Independent code-review Standards and Spec passes found no confirmed actionable issues. A raw-body replay concern was resolved by durably storing the serialized request bytes, with a PGlite restart regression. Combined slow dependencies can still hit the Vercel invocation deadline; generation/pending persistence and identical-event retries are recovery protections, not proof of zero latency.
- RCC CI [45405747506](https://github.com/abdulla95zf-max/rating-control-center-vercel/actions/runs/45405747506) succeeded.
- Real notification-only workflow checks succeeded for [Talabat](https://github.com/abdulla95zf-max/talabat-rating-monitor-vercel-poc/actions/runs/45406194442), [Keeta](https://github.com/abdulla95zf-max/keeta-rating-monitor-cloud/actions/runs/45406201091), [Noon](https://github.com/abdulla95zf-max/noon-rating-monitor-cloud/actions/runs/45406208412) and [Deliveroo](https://github.com/abdulla95zf-max/deliveroo-rating-monitor-cloud/actions/runs/45406218503). Every final response was `UNCHANGED`. Concurrent BUSY responses retried successfully. Sequence stayed 4: no duplicate outbound snapshot was created by these checks.
- The [pending retry workflow](https://github.com/abdulla95zf-max/rating-control-center-vercel/actions/runs/45406228411) also succeeded; it consumed remaining notification work without creating a new event.
- No UI was changed. No browser visual check was required. A future collector-completion event with genuinely changed production ratings has not yet been observed as part of this activation; changed-state behavior was exercised with isolated synthetic tests and the current-snapshot production send above. Core's rendered UI was not inspected.

## Operating limits

Automatic notification is after the listed collector workflows finish, subject to GitHub queue/workflow latency. It is not an instantaneous database trigger. Only meaningful minimal-payload changes send snapshots. All required platforms must be readable; missing prior rows or ambiguous identities block a new event rather than delete or merge records. Intentional scope/branch changes need review.

Retry checks occur every 30 minutes, subject to GitHub scheduling, and do not read sources when idle. Failed events keep identical body/ID/sequence and back off up to an hour. A notification that never reaches RCC needs a notifier rerun; source writes from direct/local runs outside the listed workflows must explicitly notify RCC. No collector success is coupled to Core availability.

Use the protected dispatcher for subsequent manual sends. Do not rerun old bootstrap scripts or reset the database stream sequence. Disabling `CORE_WEBHOOK_ENABLED` and redeploying pauses sending while preserving durable pending work. See [FRB-CORE-WEBHOOK.md](FRB-CORE-WEBHOOK.md) for the server contract and configuration names.
