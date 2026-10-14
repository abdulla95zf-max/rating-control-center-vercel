# Independent Talabat scheduling

Status: implemented and tested locally; not activated.

The existing config function accepts `POST /api/config?scheduler=talabat` with
`Authorization: Bearer <TALABAT_SCHEDULER_SECRET>`. It dispatches the existing
GitHub collectors; it does not collect data itself. Existing config and watchdog
requests retain their existing behavior. No additional Vercel function is added.

## Configuration

Production environment variables:

- `TALABAT_SCHEDULER_ENABLED`: default `0`; set `1` only during cutover.
- `TALABAT_SCHEDULER_SECRET`: separate strong random bearer secret for the timer.
- `TALABAT_GITHUB_DISPATCH_TOKEN`: token restricted to the Talabat repository,
  with Actions write and Variables read. Never supply this token to cron-job.org.
- `TALABAT_SCHEDULER_START_AT`: canonical UTC activation time, such as
  `2026-10-15T00:00:00.000Z`; choose a future time during actual activation.

The relay checks repository variables before dispatching: all three collector
modes must be `github`, and `TALABAT_EXTERNAL_SCHEDULER_ENABLED` must equal `1`.
The existing daily enable flags still control Performance and tStar.

Create a separate cron-job.org job, initially disabled, every minute, POSTing to
the endpoint with only the relay bearer secret. Enable failure/recovery alerts.
Keep the existing watchdog job unchanged.

## Cutover

1. Publish the three Talabat workflow changes first. With the external flag
   absent or `0`, native scheduling remains enabled and manual runs still work.
2. Publish dashboard code with the relay disabled. Configure the restricted
   token, relay secret, and future activation time securely in Vercel.
3. Verify the deployed endpoint rejects unauthenticated requests and reports
   `SCHEDULER_DISABLED` for an authenticated disabled request.
4. Prepare the separate disabled timer and verify its method, URL, and header.
5. Wait until all three collector workflows have no active or queued jobs.
   Set repository external flag `1`, enable the deployed relay, and enable the
   timer before the chosen future activation time. Verify each applied setting.
6. Verify the first due slot has one ledger entry, one GitHub run, successful
   collection/storage, and the expected dashboard freshness. Do not describe
   activation as complete before this evidence exists.

## Delivery behavior and limits

UTC schedule: Ratings `17 */4 * * *`, Performance `30 5 * * *`, tStar `45 5 * * *`.
Ratings slots are eligible for one hour; daily slots for six hours. Slots before
activation are excluded. Each tick dispatches at most one workflow and waits if
one of the latest 100 repository runs is a noncompleted Talabat collector.
The shared workflow concurrency group remains in place. Disabled native events
use a separate group so they cannot replace pending collector runs.

The database creates `dashboard_talabat_scheduler`, keyed by workflow and UTC
slot. An atomic claim is saved before the HTTP dispatch. Only `ACCEPTED` entries
are treated as delivered. Ambiguous delivery, rejected dispatch, or failure to
save the outcome returns HTTP 503 and requires review; the relay never blindly
resends the slot. Inspect GitHub run history and ledger before deciding whether
a manual run is needed. This favors avoiding duplicate collection over automatic
retry and is not an exactly-once execution guarantee. A successful dispatch does
not prove collection succeeded. GitHub runner delays remain possible.

Rollback: disable the external timer and relay first, verify dispatches have
stopped, then set repository external flag `0`. Preserve the ledger and inspect
uncertain/inflight runs before manual collection or any later reactivation.

Validation: dashboard build and 154 tests passed; Talabat build and 618 tests
passed. Live deployment, credentials, external timer, and first-slot evidence
remain pending.
