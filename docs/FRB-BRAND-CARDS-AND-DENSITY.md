# Brand cards and compact evidence views

2026-10-18. Follows the user's collected screenshot requests after the internal-page redesign.

Existing brand dropdown filters are progressively enhanced with small logo cards on Overview (directory, Operational Center and Recent Changes), platform ratings, Talabat Performance/T-Star, Growth, Noon, Deliveroo and branch management. Cards are built only from each existing select's authorized options and dispatch its original change event. The original values, handlers and access boundaries remain intact. Native selectors are hidden only after cards are mounted. Selected state, keyboard focus and All brands remain available.

Six user-provided PNGs are copied into public/brands. User confirmed plain red FRB=FRB Kabab, shawarma illustration=FRB Shawarma, final TM logo=Taazaa Mumbai. Logos display in proportion-preserving 44px frames; smaller frames are used in rows/inline filters. Source images are not redrawn. Brands without supplied logos use their visible name and initials rather than another brand's logo.

Compact changes:

- Ratings status tiles use an explicit 6px status rail and shorter inline label/count layout. All five states remain visible on mobile. Hero sync badge uses a translucent dark-heading treatment with readable light text in both themes.
- Performance/Growth tables use smaller cell spacing, restrained alternate rows, consistent numeric hierarchy and decorative brand marks. Source sorting and branch detail buttons remain intact.
- Keeta operational actions use compact evidence tiles. Coverage text is inset. Every original issue, threshold and action remains available.
- Keeta customer Visible columns defaults open, retaining the user's deliberate close during subsequent renders.
- Keeta and Noon item lists show five entries by default, sorted by sold quantity initially. Show all/Show top 5 retains all saved rows. Search, branch and sort use the original full dataset; changing them returns to the compact list.
- Noon complaints, cancellation breakdown and rider wait distribution share a responsive summary row. Complaint counts remain overlapping issues, not a mutually exclusive pie. Cancellation source zero/unknown values remain distinct. Wait bars share the highest source count as a scale and preserve the source buckets and exact numbers.

Validation:210 tests pass, both TypeScript builds pass. Added regression checks cover top-five/expanded scope and search, column default/disclosure, confirmed logo identity, and zero/missing wait geometry. Local synthetic browser checks cover brand selection updating authorized select/branch count/focus, 5→all items, default-open columns, status rails, sync contrast, mobile390 without horizontal overflow and dark theme. Production deployment and live evidence are in project checkpoint63.

No backend route, database schema, collector schedule, sessions, credentials or account permissions changed. Existing analytics completeness limitations persist. Local fixture servers, scripts and proof files are excluded from source commits.
