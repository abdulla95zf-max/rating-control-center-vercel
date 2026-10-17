# Combined Talabat Reviews read path (disabled)

Operational update, 2026-10-17: the three new collector tables have now been created and verified in the existing Neon production database with explicit user approval. They are empty. This does not enable this read path or the collector; deployment, ingestion completeness, independent authentication and cloud execution still need validation.

The default read mode remains `legacy`. The server-only `TALABAT_REVIEWS_READ_MODE=combined` enables the prepared compatibility path. It is not a request parameter. No environment setting, deployment or live migration was changed during implementation.

The existing branch registry/role checks run before opening the combined transaction. Authorized branch codes are enforced on every combined query. A read-only repeatable-read snapshot supplies counts, paginated rows, analysis corpus, orders and collection coverage. Missing new tables or conflicting known old/new order links cause a read error, never a false empty-success result. The full authorized branch history is checked for link conflicts, even outside the displayed dates.

Current rows take precedence over historical duplicates by vendor + review ID. Historical-only reviews, branch names, replies and customer-history metadata are retained. Ordered items join on both vendor and order ID. Verified new details take precedence over historical details; historical details remain labelled unverified. Coverage merges overlapping or adjacent completed intervals from both stores per vendor; gaps remain incomplete. This review coverage does not mean every order has verified details.

Review cards show verified, identified/pending, unknown-ID and historical/unverified states. Identical order IDs in different branches cannot supply each other's details. Before display, stored order payload identity is checked against its row keys.

SQL integration tests use disposable PGlite and the actual dashboard service. They exercise role scoping, duplicate counts and analysis, preserved zero/null history, adjacent coverage and gaps, order identity conflicts, missing-table errors and the legacy path. PGlite is a development dependency only.

Before activation: inspect actual live schema/constraints read-only, review and apply the new collector schema/migration, confirm compatible independent ingestion including branch metadata, reply/customer history and bounded order enrichment, verify durable independent auth/cloud execution, then validate deployed reads. Do not set `combined` merely because local tests pass. No permanent data has been migrated or written through this path.
