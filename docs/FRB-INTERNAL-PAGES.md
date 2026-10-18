# FRB internal pages and compact visual analysis

2026-10-18. Extends the approved pearl / forest Overview into ratings, Growth, Performance, review inbox and management pages.

- Shared forest heading preserves source dates, status and original controls. Restrained surfaces, segmented views, compact filters and consistent typography apply to internal pages. Overview composition stays intact.
- Sidebar collapse uses a centered vector chevron. FRB logo returns to Overview through the existing navigation handler; management pages link to the dashboard.
- Review inbox uses responsive compact columns. Order identity, rating and text stay visible; customer/order metadata and replies remain available inside a closed disclosure.
- Noon combines period, brand and location controls. Date inputs appear only for Custom range. No collection runs as a result of switching filters.
- Noon sales trend has a bounded height and sits alongside meal-time composition on desktop. Source daily gaps remain gaps. Hover and keyboard lookup use the same responsive SVG coordinates.
- Meal composition uses the sum of reported meal counts, explicitly noting discrepancies against selected order totals. Invalid/missing counts cannot become a zero or a complete mix.
- Noon conversion and rating distributions use compact horizontal source bars. Unknown star counts keep the distribution denominator unknown. Branch revenue/orders compare each selected branch against its saved previous period.
- Shared native SVG branch comparisons cover Talabat, Keeta and Deliveroo. Metrics and rows come from existing authorized report data and existing filters. Top six / Show all, metric selection and exact-value tables are available; missing values stay unavailable and zero retains zero-length geometry. Talabat source funnel stages retain source order and are not presented as a cohort conversion.
- Keeta customer bars now use SVG geometry rather than inline styles, compatible with the production CSP. No dependencies, external fonts or chart services were added.

Verification: 205 tests passed, both TypeScript builds passed. Focused geometry, missingness, source ordering, CSP, compact-review tests added. Local synthetic Noon checks covered desktop, mobile390, brand filtering, metric changes and logo-to-Overview navigation. Authenticated production verification and deployment identity are recorded in project checkpoint62.

No collector schedule, session, credentials, database schema, access permissions or backend routes changed. Business data completeness limitations remain separate from visual styling. Local preview fixtures and screenshots are not production evidence and are excluded from commits.
