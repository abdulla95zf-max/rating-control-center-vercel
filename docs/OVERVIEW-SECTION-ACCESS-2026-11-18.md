# Optional Overview sections

The owner requested independent controls for Data confidence, Action priorities and Recent Changes, while retaining access to Overview itself. No Recipe/Report integration work is part of this change.

Three feature grants are added to the existing owner-only Site sections editor: `overview.confidence`, `overview.actions`, `overview.changes`. Each requires the existing `overview` grant. Selecting a detail without its parent does not enable it. Server and browser apply the same dependency. Existing full-access accounts (`features=null`) and the owner retain full access. Accounts with explicit feature arrays must be granted the new details explicitly; Overview alone now provides the base page without these panels. No account rows are migrated or permission grants silently rewritten. Ordinary administrators still cannot customize feature grants; their new accounts retain the existing ratings-only default.

## Data and display boundaries

- Data confidence and Recent Changes use the already-authorized ratings response. Their Overview grants control those sections, not access to basic/current/previous ratings already legitimately available through permitted platform pages, detail drawers and exports. They do not grant access to another platform or brand. Platform-specific Data confidence remains governed by that platform's existing ratings access.
- Action priorities is not rendered and its extra Performance/history reads are skipped when denied. The action-history endpoint is dedicated to this Overview workflow and now requires `overview` + `overview.actions` + `talabat.performance`, before reading upstream or scoped data. The ordinary Performance page remains independently authorized.
- Action priorities with only ratings access shows rating-based actions, explicitly labelled Rating evidence only; it neither reads nor reuses operational reports. Operational checks still need Talabat Performance access.
- Sales decline priorities continues to follow the existing Growth permission; it was not one of the three marked sections and is not silently changed by this patch.
- If only one of Action priorities/Recent Changes is visible, it fills the existing panel row. If neither is visible, their wrapper is omitted. Ratings table, filters, exports, existing source scope and metrics are retained.
- Permission changes already invalidate user sessions through the existing session-version mechanism. Auth reset also clears the three section evidence arrays and existing report caches. Late responses retain existing generation guards.

## Validation and rollback

Tests cover server/browser dependency parity, owner/legacy behavior, no implicit sibling grants, ordinary-admin denial, action-history authorization before source reads, source-ID filtering, ordinary Performance access, all eight display combinations, skipped hidden-panel reads and ratings-only actions. Verify the owner user editor, overview-only and single-panel views, desktop/mobile themes and unaffected platform views using synthetic data before release. No validation creates or edits production users.

Verified before release: build and all 336 tests passed. Playwright CLI checked the owner editor with a synthetic account, all eight grant combinations at 1440/390 px in light/dark (32 display cases), no document overflow or page errors, no operational reads when Action priorities was off, ratings-only behavior without Performance, unchanged platform Data confidence, and cleared section arrays after auth reset. Separate standards/specification reviews reported no actionable findings. The Recipe/Report pilot remains on its separate stopped branch and is not part of this release.

Rollback is the previous application deployment. No schema, collector schedule, credential or account data migration is required. The new feature strings may remain stored in custom account arrays; reverting the catalog must account for the existing fail-closed parser (unknown stored feature IDs resolve to deny-all). Prefer a forward fix retaining the new IDs if any accounts have already been edited, rather than blindly reverting a release after new grants are saved.
