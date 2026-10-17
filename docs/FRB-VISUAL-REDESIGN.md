# FRB dashboard visual redesign

The user approved the pearl canvas, forest sidebar/hero and emerald accents in the local concept, then authorized implementation, testing and production publication without further design questions.

## Implementation
- `public/frb-design.js`: wraps the existing identity and platform navigation in a collapsible sidebar. Existing button nodes/listeners, authorization and report readers remain in place. Mobile drawer supports Escape, focus return/trapping and inert offscreen navigation.
- `public/frb-design.css`: screen-only design tokens and layout across the dashboard shell, Overview, Growth, ratings, Performance, Reviews and detail sheets. Original export layouts remain separate. Both explicit light/dark choices remain available.
- `public/app.js`: Overview hero uses the same authorized grouped branch count and status counts as before. Source SUCCESS is explicitly separate from freshness. Critical, warning or unknown shortcuts apply the existing table filter and focus the directory. Original operational/recent-change/source warnings and full tables remain accessible. No pooled sales/customer total introduced.
- `public/theme.js`: new visitors default to light; existing stored theme preferences are respected.

No API, database schema, collector, scheduler, credentials, business threshold or scope change. No task-tracking feature added.

## Validation boundaries
Full suite194 tests passed for the initial redesign; subsequent focused tests cover default/persisted theme behavior. Both TypeScript builds and JavaScript syntax passed. Browser verification uses an isolated local synthetic API server for authorized dashboard interactions; the real site's session had expired by deployment verification, so full signed-in production data/rendering cannot be claimed verified. Production commit/deployment and public assets are verified separately. Existing History timeout and direct-Growth header UNKNOWN behavior are not fixed by this change.

The local synthetic checker and proof screenshots in `outputs/frb-design-preview` are not deployed or committed. They must never be presented as live portfolio statistics.
