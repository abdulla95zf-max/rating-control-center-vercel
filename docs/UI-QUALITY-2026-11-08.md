# UI quality pass — 2026-11-08

Scope: improve existing readable evidence text, touch/form behavior, per-page mutation safety and error feedback. Preserve FRB themes, compact priority disclosures, every existing metric, authorization, brand/feature policies, exports, collector schedules and data readers. No new dependency, paid service, polling or persistent report storage.

## Requirements and implementation

- Increase small supporting text selectively (12–13px); mobile text-entry controls use16px. Keep dense evidence progressive, without restoring permanently expanded recommendations.
- Keep input labels/focus visible. Login and management sheets scroll within dynamic viewport height; use `interactive-widget=resizes-content` where supported and safe-area padding. Desktop1440/mobile390, reduced-height and text-enlargement simulations are required. Simulations do not establish real Android/iOS keyboard behavior; that remains a physical-device check.
- Shared `ui-feedback.js` owns per-operation pending keys, not authority. Login, account create/edit, password reset, account enable/disable, deletion and branch visibility changes reject repeat events until settlement. Snapshot original disabled/aria-busy states and restore them in finally. Resource keys block duplicates across DOM rerenders. Save captures values before controls are disabled and blocks opening/closing another editor while pending. A browser reload or another tab is outside this local lock; server authorization/constraints remain mandatory and unchanged.
- Management and dashboard transport errors show fixed, actionable messages. Only known safe validation copy is preserved. Network failures warn that a write may have completed and instruct refresh before retry; no automatic write replay. Non-JSON/error objects and private diagnostics are not echoed. Existing login-specific security-check guidance and auth-generation response guards remain.
- Bound requests to30seconds; a timeout is not proof that a write failed. Restore controls after failure, preserve meaningful empty/error states and native keyboard disclosures. Shared scripts load before consumers on all three HTML entry points.

Validation must use synthetic accounts/branches and mocked writes only; no live permission, credential or account mutation. Record actual checks and remaining limits before release.

## Verification

- `npm run build` passed; full `npm test`: 306 passed, zero failures. `git diff --check` passed.
- Playwright synthetic checks passed at 1440px and 390px, light/dark, Overview filters and Lens Persian/English RTL/LTR; no document overflow or JavaScript page errors. Expected injected HTTP failures were checked separately.
- Repeated login, create/edit, status, password-reset, deletion and branch-status submissions produced one mocked write each. Captured role/branch/feature payloads were retained. A failed save unlocked controls and retained values for a deliberate retry.
- Pending deletion resisted native Escape, another account dialog and repeat confirmation. Response-body interruption retained uncertain-write guidance. Unknown server diagnostics were suppressed.
- Short 390×360 viewport and synthetic 200% text-size stress passed. Touch-emulated controls measured 44px and inputs 16px. Desktop compact priority row remained approximately 107px. These are synthetic browser checks, not production data or physical-phone keyboard certification.
- Standards/spec review findings were resolved and rechecked. Final interface audit covered labels, focus, text sizing, error feedback and touch sizing. Fixed the existing username pattern for current browser Unicode regex mode.

Remaining limits: physical Android/iOS keyboard behavior remains unverified; pending locks do not provide cross-tab/server idempotency. No live account or permission writes were used for validation.

Release integration: preserved main's Neon scheduler optimization (baa9262); combined build and all 310 tests passed.
