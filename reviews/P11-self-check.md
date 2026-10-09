# P11 self-check — Multiple sites, labels and geofences

Reconstructed 2026-10-09 · Arena agent (`arena/dae7b9a9-kaspergps`)

> **Read this first.** `BUILD_PROMPT.md` §1 asks for a self-check file per phase.
> P1–P13 were built without one — `reviews/STATUS-REVIEW.md` ("What is left",
> item 4) records that as an open gap, and this PR closes it. This file is
> therefore **retrospective**: it is not the contemporaneous record §16 wants and
> must not be read as one. What it does instead is take each of §15's acceptance
> checks for this phase and state, today, whether the check is satisfied by the
> tree and *what actually demonstrates it* — a command that was run, a test that
> exists, or plainly nothing. Anything this session could not execute is written
> as "not executed", never as a pass.

## Commands (run 2026-10-09 on this branch)

| Command | Result |
| --- | --- |
| `npm ci` | pass — clean install, no peer-resolution failure (defect 5.1 stays fixed) |
| `npm run typecheck` | pass — `tsc --noEmit`, clean |
| `npm run lint` | pass — `eslint .`, clean |
| `npm test` | pass — 29 files, **329 tests** |
| `npm run test:coverage` | pass — **87.97 %** lines (≥ 85 % floor in `vitest.config.ts`) |
| `npm run build` + `next start` | pass — every route compiles; `/sign-in`, `/app`, `/app/assets/a-ex04`, `/app/certificates`, `/app/settings` served HTTP 200 with no error payload |
| `npm run test:e2e` | **not run** — no Chromium here and `cdn.playwright.dev` is unreachable. `.github/workflows/ci.yml` (this PR) is the first job that will execute the suite |

## Acceptance checks (§15 · P11)

| # | Check | Verdict | How it is verified |
| --- | --- | --- | --- |
| 1 | S9, S23–S26 | Written, not executed | `S9-S12.spec.ts`, `S23-S30.spec.ts`. |
| 2 | Multi-site visibility | Pass | `access.test.ts` site-scoped cases; `team.test.ts` site assignment. |
| 3 | Renter never sees owner labels or geofences | Pass (API) | `geofences.test.ts` (3) owner-scoping; labels stay on the owner record. |
| 4 | Gaps never create geofence events | Pass (code) | events are evaluated between consecutive readings and stop at a gap (shared `findGaps`). |
| 5 | Day one hides labels and geofences | Pass (code) | nav item `phase: 'phase2'`, and the page re-checks the store phase. |
| 6 | Create a circle geofence by name + radius | Pass, and its labels are paired | `getByLabel('Name')` resolves to `gf-name`; checked by `src/e2e-contract.test.ts`. |
| 7 | Geofence alerts and report | **Partial — the report is missing** | Geofence *events* are built and owner-scoped (`geofences.test.ts`) and `FEATURE_LABEL_KEYS` lists `report.geofence`, but `REPORT_TYPES` in `src/server/reports.ts` has six entries (trip_mileage, location_history, operating_hours, fuel, utilisation, driving_events) and none of them is the geofence report. |

## Screenshots

`reviews/screenshots/P11/` — **empty**. §16 wants one file per screen; this
environment has no browser, so nothing was ever captured. The CI job added in
this PR is where they should come from (Playwright already writes `test-results/`
screenshots on failure; a deliberate capture pass is a follow-up, not this PR).

## Files that carry this phase today

`src/server/geofences.ts`, `app/app/geofences/page.tsx`, `app/console/geofences/page.tsx`, `app/console/labels/page.tsx`.

## Deviations from BUILD_PROMPT.md (and why)

- Polygon geofences are created by typing numbered points; the drag-to-draw map path in S31 is not built, and `@geoman-io/leaflet-geoman-free` is a dependency that nothing in `app/` uses.

## Libraries added (and why)

None. Nothing in this PR needed a dependency; the repository's §3 stack is unchanged.

## Questions for the reviewer

- Should polygon drawing ship before the demo, or does the numeric-point path satisfy S31 for your audience? If it is deferred, the Geoman dependency should go (it is only justified by that feature).

## Known gaps

- The geofence report (§11.9 / §15 P11) does not exist — `report.geofence` is a capability label with no report type behind it.
- The map overlay itself is untestable here, so "gaps never create geofence events" is proven at the function level only.
