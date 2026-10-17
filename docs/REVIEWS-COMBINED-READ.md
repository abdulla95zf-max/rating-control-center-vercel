# Combined Talabat Reviews read path

Operational update, 2026-10-17: combined reads and independent production collection are enabled. All 49 active registered branches were collected for 30 completed Dubai days (259 reviews). Details for all 100 one/two-star reviews were verified; new order enrichment is limited to those ratings by user choice. Additive collector migration 007 now supplies source_metadata and metadata_observed_at on review_v2_reviews. The source-metadata backfill is a separate production collection run; check its actual outcome before treating every row as refreshed.

The code default remains `legacy`; Production uses the server-only `TALABAT_REVIEWS_READ_MODE=combined`. This is not a request parameter.

The existing branch registry/role checks run before opening the combined transaction. Authorized branch codes are enforced on every combined query. A read-only repeatable-read snapshot supplies counts, paginated rows, analysis corpus, orders and collection coverage. Missing new tables or conflicting known old/new order links cause a read error, never a false empty-success result. The full authorized branch history is checked for link conflicts, even outside the displayed dates.

Current rows take precedence over historical duplicates by vendor + review ID. Historical-only reviews, branch names, replies and customer-history metadata are retained. Ordered items join on both vendor and order ID. Verified new details take precedence over historical details; historical details remain labelled unverified. Coverage merges overlapping or adjacent completed intervals from both stores per vendor; gaps remain incomplete. This review coverage does not mean every order has verified details.

For replies and customer history, an observed key in source_metadata takes precedence, including explicit JSON null. An omitted key falls back to the historical payload. Collector updates merge only observed keys, so older callers cannot erase stored metadata. Zero counts and false Pro flags remain valid values; unknown counts remain null. Customer identity/address/contact fields are excluded from the new history projection.

Review cards show verified, identified/pending, unknown-ID and historical/unverified states. Identical order IDs in different branches cannot supply each other's details. Before display, stored order payload identity is checked against its row keys.

SQL integration tests use disposable PGlite and the actual dashboard service. They exercise role scoping, duplicate counts and analysis, preserved zero/null history, adjacent coverage and gaps, order identity conflicts, missing-table errors and the legacy path. PGlite is a development dependency only.

Live changes require additive migration before deploying code that references new columns. Independent auth uses a separate encrypted session namespace. The six-hour review collection and nightly low-star backlog workflows share only the independent Reviews concurrency group. Configuration alone does not prove a future scheduled execution or multi-day session longevity; verify actual runs.
