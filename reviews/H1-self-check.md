# H1 self-check — Merge F1–F3 into main and get the map loading
Date 9 Oct 2026 · Agent (Claude, Haiku 5.5) · Branch `h1-merge-f1-f3` from `main` (f512bf0) + `origin/arena/bcc6cc36-kaspergps` (73b5851)

## Commands
| Command | Result |
| --- | --- |
| `npm ci` | pass (599 packages) |
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm run build` | pass (all routes compile) |
| `TZ=UTC npx vitest run` | pass — 523/523 |
| `TZ=Asia/Dubai npx vitest run` | 522/523 — `cost.test.ts > gives Dubai months and never runs past the clock` fails. This is the known `clock.dubaiToIso` bug, fixed in H2.4, not an H1 item. |
| `npx playwright test` | **not run here.** The sandbox proxy blocks `cdn.playwright.dev` (403 policy denial), so no browser could be installed. Run in CI. |

## Acceptance checks (H1 proof)
| # | Check | Pass/Fail | How verified |
| --- | --- | --- | --- |
| 1 | `/app` renders for Omar, Lina, Khalid, Fatima, Sara with no "This page couldn't load" and no console errors | **Not verified locally** | Added `tests/e2e/map-loads.spec.ts` covering these users. It needs a browser, which this sandbox can't install. CI is the verifier. Code-level cause fixed: `openAlerts` is now declared before `visibleAssets` and listed in its dependencies. |
| 2 | `TZ=UTC npm test` passes | Pass | 523/523 |
| 3 | CI "checks" job green on the PR | Pending | Depends on the PR's CI run |

## Merge resolution (the four conflicts)
- `app/app/page.tsx`: kept the F2/F3 version (`useDb`, hooks). Re-applied PR #10's "today" tiles, per-asset fuel / engine-hours / open-alert cells, and the `openAlerts` memo, declared before `visibleAssets`. Added `openAlerts` to `visibleAssets`' deps. All data comes through `@/server/api`.
- `app/app/assets/[id]/page.tsx`: kept the F2/F3 version. Its auto-merged hunks already include PR #10's Overview tiles and the Tier 1/2 ignition utilisation table (source "Estimated", "Not for billing"). Resolved only the import conflict by using the `api` imports and adding `last7DaysIgnition`, `todayFor`, `IgnitionBreakdown`. The Tier 3 (MUC) branch is unchanged.
- `app/app/settings/page.tsx`: kept the F2/F3 controls (`value`/`onChange`), with `id`s and `<label htmlFor>` (PR #10's pairing). Also made the invite Name field a labelled "Full name" control. It was an `aria-label` with no paired `<label>`, which the e2e contract rejects.
- `src/server/billing.test.ts`: kept both sets of imports (`db` from the F2/F3 branch, `VAT_PCT` and `clock` from PR #10). PR #10's reconciliation tests already use the db helpers. No `seed` references remain.

Kept from `main` (not from the branch): `HANDOFF.md`, `.github/workflows/ci.yml`, `vitest.config.ts`, `playwright.config.ts`, `src/e2e-contract.test.ts`, `tests/e2e/certificate.spec.ts`.

## Other changes in this phase
- `src/server/api.ts`: re-exports `engineHoursToday`, `fleetTodayTotals`, `hoursSourceFor`, `last7DaysIgnition`, `todayFor`, `fuelToday`, `showsUtilisation`, `buildIgnitionBreakdown` from `utilisation.ts`, so screens import only through `api` (architecture rule 6).
- `src/e2e-contract.test.ts`: the "demo-bar affordances" check now reads `ViewAsMenu.tsx` as well as `DemoBar.tsx`. The "View as" trigger moved into `ViewAsMenu`, which `DemoBar` composes. The check still requires the text; only the file it reads changed.

## Files added / changed
- Added: `tests/e2e/map-loads.spec.ts`, `reviews/H1-self-check.md`
- Changed: the four conflicted files above, `src/server/api.ts`, `src/e2e-contract.test.ts`, plus the 117 files from the F1–F3 branch

## Deviations from BUILD_PROMPT.md (and why)
- H1.3 asks that `utilisation.ts` read "assets, pairings and fittings through `db.getState()`". `utilisation.ts` reads no pairings or fittings. It only uses `getReadingsForAsset`, which comes from the simulator. The simulator imports only a time constant (`ANCHOR_MS`) from the seed module. No data is read from `seed`, so no port was needed.
- H1.4 (architecture test for screens importing only `api`): already exists as `src/architecture.test.ts` rule 6 and passes on the merged tree, so no new test was added.

## Libraries added (and why)
None.

## Questions for the reviewer
1. Confirm the Dubai-only failure in `cost.test.ts` is expected at H1 and is the H2.4 `dubaiToIso` fix.
2. The map-load spec is unverified locally. Please check that CI runs it.

## Known gaps
- Browser proofs (map loads, screenshots) were not run in this sandbox (no Chromium download).
- The F2/F3 Ctrl+K, Site User and time-zone bugs remain, as they belong to H2.
- The stale branches `arena/137d2ee8`, `arena/53555479`, `arena/cdd2374a`, `arena/eeb42ef3` are untouched.
