# Talabat Growth read optimization — 2026-11-07

The Overview sales-priority card can be unavailable independently of LIVE ratings. Growth reads fourteen saved Performance days; its history query has a six-second timeout. Direct read-only testing found the original query close to or beyond that limit, while reports were present. This reproduces a timeout risk; it does not prove every unavailable-card event has the same cause.

Two minimal changes preserve results:

- SQL header normalization uses a simple CASE, evaluating the normalized field name once instead of repeating it for each alias. Supported aliases, case/spacing handling and unknown keys remain identical.
- Growth no longer transfers the duplicate raw JSON object for numeric commercial days. Raw values are used only to corroborate blank sales/orders no-order days. The projection conservatively retains raw JSON whenever both commercial strings contain no digits, preserving null, blank, tab and NBSP evidence. Zero and invalid/missing values remain distinct; raw revisions are not mutated.

Read-only benchmarks on the same 58-branch report dated 2026-11-06 produced byte-for-byte equal Growth JSON, including the same 42 eligible rows. Earlier pair: baseline7611ms, optimized1222/1216ms. Repeated final pair: baseline3808ms, optimized1688/1532ms. Transferable row JSON decreased from2358573 to1263399 bytes (about46%). Durations include database/network transfer and vary; these are direct-reader measurements, not browser page-load guarantees or a monthly quota forecast.

No timeout increase, scope change, schema write, source credential, collector schedule or KPI policy change. Existing bounded caches and immutable per-source/day/store revision rules remain.

Verification: build and all302 tests passed; new PGlite regressions exercise every supported SQL header, aliases, unknown fields, omitted trading-day raw values and whitespace-only zero-order evidence. Standards and spec reviews found no remaining actionable issues. Authenticated browser recovery must be verified separately; direct database success is not proof of the user’s current browser response.
