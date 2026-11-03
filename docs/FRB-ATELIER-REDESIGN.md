# FRB Atelier visual refresh — 2026-11-03

## Scope and visual direction

User requested a refined, distinctive, site-wide visual refresh and explicitly approved publication after successful checks. Baseline: `91601a8e5c0293f85f4ea1d6a5e3531536fbeb1c`.

`public/frb-atelier.css` is the final shared screen stylesheet for dashboard, Users and Branches. It extends the approved pearl/forest/emerald identity with warm paper surfaces, quieter corners/shadows, fine dividers, a restrained brass accent, clearer numeric hierarchy and consistent controls. Branch Lens reports use divided evidence columns on desktop and stacked sections on mobile. Authentic logos, compact brand rows, status rails, selection states and existing disclosures remain.

The change introduces no runtime JavaScript, third-party assets, fonts, packages, API requests or polling. CSS is screen-scoped; dedicated print/export styles remain authoritative. Data calculations, API contracts, authorization and collectors are unchanged. Existing reduced-motion handling is extended to management pages; the shared decorative orbit finishes after one cycle. Mobile hero art is locally contained to avoid document overflow.

## Verification

- Both TypeScript builds pass.
- All 280 existing tests pass outside the sandbox. The first sandbox run encountered local HTTP `EACCES`; it was rerun successfully with normal local networking.
- Playwright CLI: 1440px/390px, light/dark, eight main navigation views; no document overflow and no page exceptions in that matrix. Branch Lens language switching and keyboard skip-link focus exercised. Users/Branches mobile layout checked.
- Additional Branch Lens checks cover brand/branch selection, Persian/English report rendering, evidence disclosures, desktop columns and mobile stacking. Synthetic fixtures only; these screenshots are not production business evidence.
- Independent standards/spec review caught missing explicit hero foregrounds and an insufficiently specific shared hero selector; both corrected. Final static recheck found no further actionable regressions.
- Web interface review: external same-origin stylesheet, visible keyboard focus, restrained property-specific transitions, reduced motion, local scrolling and screen-only export isolation.

## Limits

No source-portal reconciliation or alternate-user security audit was performed for this visual change. Existing data-quality findings in `SITE-REVIEW-2026-11-02.md` remain separate and unresolved by styling. Print/export layouts are not restyled; actual PDF export was not exercised. Some local report fixtures return empty states; populated production datasets still require a live visual smoke check after deployment.

## Maintenance

### Approved dark palette follow-up

User selected sample 1 from the second palette study: charcoal surfaces (`#171a1b`, `#212526`), forest identity and matte champagne (`#c6b17b`). The accent appears in the attention-card surface, Explore Growth link, active action tabs, decorative orbit and sidebar details. These overrides apply only in dark screen mode; light mode, semantic status colors and chart fills remain unchanged. Palette-study images under `outputs/` use synthetic data and are not production evidence.

Keep additions in the shared finish focused on presentation. Extend existing components; do not add new data readers or animations that delay results. Retain scoped logical borders for RTL. Load the stylesheet last in the three HTML entry points. Revert by removing those links and the stylesheet; no data migration is involved.
