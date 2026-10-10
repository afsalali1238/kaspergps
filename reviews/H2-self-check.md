# H2 self-check — Correctness fixes (PARTIAL)
Branch `h2-correctness-fixes` on top of `h1-merge-f1-f3`.

## Results
- Unit suite: `TZ=UTC` 547/547, `TZ=Asia/Dubai` 547/547 (40 files).
- `npm run lint`, `npx tsc --noEmit`, `npm run build`: all pass.
- Playwright / browser proofs: NOT run. The sandbox blocks the Playwright browser CDN, so the screenshot and computed-style checks are deferred to CI.

## Done in this phase
| Item | Change | Proof |
| --- | --- | --- |
| H2.1 Invisible buttons | `Button.tsx` exports `variantStyles`; `background-*` → `bg-*` (ink, paper-2, transparent, red, yellow) | `Button.test.ts` (2 tests). Computed-style check in browser not run. |
| H2.2 Site User needs a site | `capabilities.ts` adds `isSiteScopedRole`/`isSiteScoped`; `access.ts` scopes visibility by `siteIds`; `team.ts` refuses site_user create/role change/site edit with zero sites | `site-scope.test.ts` (new), `team.test.ts` (inputs now carry `siteIds`). |
| H2.3 Sites multi-select | Invite form has site checkboxes (role="group"); user rows for site users get an Edit sites panel calling `updateUserSites` | Code review + `team.test.ts`. Browser check not run. |
| H2.4 Time zone | `clock.dubaiToIso` uses `formatInTimeZone(…, 'Asia/Dubai', …)` | Passes under both zones. |
| H2.5 Ctrl+K | Removed Ctrl/Cmd+K binding and hint from `SearchCommand.tsx`; Escape kept | Code review. |
| H2.6 Route guards | `AppShell.tsx` exports `navItemAllowed` (capability, phase, featureKey); unknown or disallowed `/app/*` routes render "Page not found" | `nav-rule.test.ts` (4 tests). |
| H2.7 Renter sees owner's site names | `alerts.ts` `siteNameFor`: renters see only the site on their active/scheduled booking | `site-names.test.ts` (new). |
| H2.9 Cross-tenant audit | `audit.ts` `recordCrossTenantView` writes `asset.view.crossTenant`, deduped per actor+asset per hour; wired into `getAsset` for Kasper views | `cross-tenant-audit.test.ts` (5 tests). |
| i18n | Added draft Arabic for `settings.users.edit_sites` and `shell.not_in_your_role` (`public/locales/ar.json`, still flagged for native review) | `i18n.test.tsx` passes. |

## Partial
- H2.8 API gate: a ratchet test (`api-gate.test.ts`) pins the allow-list of gated exports and a DEBT list of about 44 still-ungated tenant-data functions. Those functions are NOT gated yet. This is an honest partial, not a full fix.

## Open items
- Playwright proofs for H2.1, H2.3, H2.6 and H2.7 (screenshots, Dubai-team view) — run in CI.
- H2.8 DEBT list: gate each function, then shrink the list in `api-gate.test.ts`.
- Seven uncommitted files in the Windows clone (incl. a `team.ts` `input.role === 'site_user'` edit that violates architecture rule 2) — owner to confirm before syncing.
