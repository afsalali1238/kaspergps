# P5 self-check — Map and asset list

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

## Acceptance checks (§15 · P5)

| # | Check | Verdict | How it is verified |
| --- | --- | --- | --- |
| 1 | S1, S4, S6, S7, S10, S11 map/list parts | Written, not executed | `S1-S3.spec.ts`, `S4-S8.spec.ts`, `S9-S12.spec.ts`. |
| 2 | Tier filter only for mixed fleets | Pass (code) | `hasTierFilter` derives from the visible set; S1 asserts the negative for Omar. |
| 3 | Omar sees no CAN columns | Pass (code) | the Phase-2 cells added in this PR are gated on `hasFeature`, so a Tier 1 fleet renders nothing instead of zeros. |
| 4 | Filters and search live in the URL so Back restores them | **Fail — not implemented** | `app/app/page.tsx` keeps status, site, class, tier, rented and search in `useState`. §11.2 requires them in the URL. Left open deliberately rather than half-done: it needs a `useRouter`/`searchParams` rewrite of a 470-line client page. |
| 5 | KPI tiles for today from Phase 2 | **Pass — added in this PR** | `map.kpi.engine_hours_today`, `map.kpi.fuel_used_today`, `map.kpi.open_alerts` already existed in `ar.json` referenced by nothing. `fleetTodayTotals()` in `src/server/utilisation.ts` now feeds three tiles, each rendered only if at least one visible asset meters it; `utilisation.test.ts` proves an asset that cannot measure yields `null`, never 0. |
| 6 | Statuses, colours, "Rented" ring, Unknown/No tracker list-only | Pass (code) | `computeStatus` + marker icons; the list-only rule is asserted in `S1-S3.spec.ts` only. |
| 7 | Phone Map / List tabs | Written, not executed | `map.map_tab` / `map.list_tab` render; only the phone project can judge them. |
| 8 | Loading skeleton / empty / error+Retry states | Partial | The `loading` skeleton and the `EmptyState` for no matches exist (`app/app/page.tsx`). There is no error + Retry path on the map page — `ErrorState` is only used on the dashboard — and the tile-failure fallback is Leaflet-side and untested. |

## Screenshots

`reviews/screenshots/P5/` — **empty**. §16 wants one file per screen; this
environment has no browser, so nothing was ever captured. The CI job added in
this PR is where they should come from (Playwright already writes `test-results/`
screenshots on failure; a deliberate capture pass is a follow-up, not this PR).

## Files that carry this phase today

`app/app/page.tsx`, `src/server/utilisation.ts` (new), `src/server/telemetry/simulator.ts`, `docs/test-matrix.md`.

## Deviations from BUILD_PROMPT.md (and why)

- §11.2 puts the today tiles in the KPI strip; they render on a second row under the status chips so the toggles keep one line at 390 px.
- "Fuel used today" cannot come from the ECU counter (no asset streams `fuelUsedL`), so it reuses the class-average burn rate already sanctioned in `cost.ts` for the Cost & ROI dummy-rate line, and prints an `Estimated` source chip. It is never presented as measured. When a CAN feed starts reporting `fuelUsedL`, `fuelToday()` switches to the measured number and the label to `ECU` on its own.
- The per-asset Phase-2 columns render inside each row rather than as a headered table, because the list panel is a flex list; `map.columns.asset` / `status` / `last_updated` / `site` / `fuel` / `engine_hours` / `open_alerts` are therefore used as inline labels (`fuel`, `engine_hours`, `open_alerts`) and the rest stay unused in the dictionary.

## Libraries added (and why)

None. Nothing in this PR needed a dependency; the repository's §3 stack is unchanged.

## Questions for the reviewer

- Is URL filter state worth a follow-up before the demo? It is the only §15 check in this phase that currently fails.
- The alerts tile counts the *filtered* set so it moves with the filters; the bell counts everything the session may see. Which of the two do you want?

## Known gaps

- Filters/search are not restorable via Back (row 4).
- Map tile-loading failure fallback is untested.
