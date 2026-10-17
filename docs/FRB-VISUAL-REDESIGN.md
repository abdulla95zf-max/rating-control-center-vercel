# FRB dashboard visual redesign

The user approved the pearl canvas, forest sidebar/hero and emerald accents in the local concept, then authorized implementation, testing and production publication without further design questions.

## Implementation
- `public/frb-design.js`: wraps the existing identity and platform navigation in a collapsible sidebar. Existing button nodes/listeners, authorization and report readers remain in place. Mobile drawer supports Escape, focus return/trapping and inert offscreen navigation.
- `public/frb-design.css`: screen-only design tokens and layout across the dashboard shell, Overview, Growth, ratings, Performance, Reviews and detail sheets. Original export layouts remain separate. Both explicit light/dark choices remain available.
- `public/app.js`: Overview hero uses the same authorized grouped branch count and status counts as before. Source SUCCESS is explicitly separate from freshness. Critical, warning or unknown shortcuts apply the existing table filter and focus the directory. Original operational/recent-change/source warnings and full tables remain accessible. No pooled sales/customer total introduced.
- `public/theme.js`: new visitors default to light; existing stored theme preferences are respected.

No API, database schema, collector, scheduler, credentials, business threshold or scope change. No task-tracking feature added.

## Validation boundaries
Final full suite195 tests passed after the responsive-navigation and theme changes. Both TypeScript builds and JavaScript syntax passed. Browser verification uses an isolated local synthetic API server for authorized dashboard interactions; an initial live observation showed sign-in, but subsequent reads with the existing session succeeded. Live Overview was verified with52 actual branch groups (4healthy,5acceptable,6warning,36critical,1unknown),4 successful saved-rating sources and36 table rows after the Critical shortcut. Source freshness is still separate. Growth rendered49/13/22 comparable rows. No new credentials were read or entered. Production commit/deployment and public assets are verified separately. Existing History timeout and direct-Growth header UNKNOWN behavior are not fixed by this change.

The local synthetic checker and proof screenshots in `outputs/frb-design-preview` are not deployed or committed. They must never be presented as live portfolio statistics.

## Final production checks
The signed-in Keeta Performance report10–16Oct (13shops) and Talabat Reviews (50cards on page1) rendered in the new shell. Noon Performance10–16Oct rendered with22 scoped branches. Default rolling reports immediately after midnight may have no saved snapshot yet; no collector was dispatched during visual verification. Production CSP blocks inline style attributes, so the overview distribution uses SVG numeric geometry and external fill classes; its proportions have a dedicated regression test. Final suite195 passed before this SVG correction; all5 focused design tests then passed.
