# Same-brand comparison inside the selected Branch Lens

The owner approved comparing each branch against peers, and explicitly raised page clutter. The comparison is therefore a **closed disclosure inside the selected branch's detail**, not a new Overview panel or an additional portfolio-wide list. Per-platform evidence is disclosed progressively. Existing sections are preserved.

## Cohort and definitions

The selected branch is excluded from its reference. Use only already authorized, active, loaded Lens groups of the same canonical brand, the same platform and exactly the same current/previous seven-day periods. Both periods must be eligible, complete and contiguous. Current and prior order counts must each reach 20, consistent with existing Growth directional screens. Prior sales must be positive; do not create percentage growth from a zero baseline. A real zero current sales value stays −100%, not unknown. Deliveroo is outside this sales benchmark because sales are not collected.

Require at least **three other eligible branches**. Otherwise show insufficient peers without inferring a benchmark. Ambiguous source rows, duplicate canonical branch groups and source identities reused across groups do not contribute. Brand labels classify the already-resolved groups; they do not authorize access or join raw sources by branch name.

For each branch independently, calculate sales, order and average-basket percentage changes. Reference values are unweighted medians of those branch changes, not percentage changes of pooled totals. The selected-minus-peer sales gap is in **percentage points**, not percent. The medians for the three metrics are independent and must not be summed or multiplied as a decomposition. Show reference size, individual peer changes, exact periods, exclusions and the count of peers with lower sales.

Every statement refers to **the user's authorized loaded sample**, not all company branches or the market. Branch location, formats, promotions and maturity are not controlled; the comparison is exploratory and does not prove shared or branch-specific causes. Missing loaded sources are labelled as absence from the loaded set, not proof that a platform is disconnected. Exclusion counts cover authorized same-brand candidates only.

## Access, performance and interaction

No backend route, grant, registry, source reader, collector, Telegram event or refresh policy changes. Existing server-side Lens, source Performance and active brand/branch authorization remain the data boundary. The module uses those already-scoped rows and makes no requests, writes or browser storage entries; it cannot fetch broader peer data for a branch-only user. Branch-only users therefore see insufficient peers if their authorized sample is too small.

Open-state keys are bounded, preserved through repaint and cleared on auth reset. Comparison remains collapsed when selecting another branch; existing exact-branch navigation and source/date context remain intact. Persian/English, light/dark themes and explicit LTR numeric isolation follow existing Lens patterns. No Overview content is added.
