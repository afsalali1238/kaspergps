# P2 self-check — Domain, seed, clock and telemetry

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

## Acceptance checks (§15 · P2)

| # | Check | Verdict | How it is verified |
| --- | --- | --- | --- |
| 1 | 5 tenants · 10 sites · 16 users · 36 assets · 37 trackers · 22 adapters (17 fitted / 4 in stock / 1 faulty) · 15 bookings (3 last month) · 4 links | Pass | `src/server/seed/data.test.ts` (19 tests) asserts each count, the fixed demo token, the fitted/in-stock/faulty split, the 22 alerts and the single grant override. |
| 2 | Readings exist from the 1st of last month | Pass | `data.test.ts` plus the new `src/server/utilisation.test.ts`, which reads a 7-day window off the simulator and gets 7 populated day buckets. |
| 3 | Every asset's status at anchor matches §8.2 | Pass | `src/server/seed/expected.test.ts` — "matches the asset table for every seeded asset". |
| 4 | Visible features match a snapshot | Pass | `expected.test.ts` — "gives each tier exactly the features its params allow". |
| 5 | GN-01 fuel drop, BD-02 DTC, TP-23 power cut in readings | Pass | `data.test.ts` scenario cases; `injectGNFuelDrop` and the TP-23 branch in the simulator. |
| 6 | Deterministic across reloads | Pass | `data.test.ts` and `utilisation.test.ts` ("is deterministic: the same window gives the same numbers"); the PRNG is seeded from the tracker IMEI, IMEIs are Luhn-checked. |
| 7 | +1 h turns WT-08 Offline | Pass | `expected.test.ts` clock-shift case against `src/config/thresholds.ts`. |
| 8 | `/dev/seed` shows all tables with computed status and tier | Pass (code), not executed | `app/dev/seed/page.tsx` reads the same accessors the tests pin. |

## Screenshots

`reviews/screenshots/P2/` — **empty**. §16 wants one file per screen; this
environment has no browser, so nothing was ever captured. The CI job added in
this PR is where they should come from (Playwright already writes `test-results/`
screenshots on failure; a deliberate capture pass is a follow-up, not this PR).

## Files that carry this phase today

`src/domain/types.ts`, `src/domain/features.ts`, `src/server/seed/data.ts`, `src/server/seed/expected.ts`, `src/server/telemetry/simulator.ts`, `src/lib/clock.ts`, `src/config/thresholds.ts`, `app/dev/seed/page.tsx`.

## Deviations from BUILD_PROMPT.md (and why)

- `baseReading` leaves `fuelLevelPct`, `fuelUsedL`, `fuelRateLph`, `rpm`, `coolantC`, `engineLoadPct`, `adBluePct` and `activeDtcs` **undefined for every generated reading** (only the FB-14 replay batch and the GN-01 injection set CAN fields). Screens therefore show "Not measured" — which is what §4 demands for an unmeasured value, but it means several CAN surfaces are simulated only in the negative. Recorded, not quietly faked: inventing sensor values would break §2.
- Engine hours are modelled as behaviour-per-day × elapsed time (`ecuHoursAt`) rather than a stream of ECU frames. The MUC meter and this PR's today tiles use the same function so they cannot disagree.

## Libraries added (and why)

None. Nothing in this PR needed a dependency; the repository's §3 stack is unchanged.

## Questions for the reviewer

- Should the simulator populate CAN values for assets whose `canProfile.supported` includes them? One change there lights up the Engine & fuel tab, the fuel report and the new fuel tile; today every one of those tests asserts the empty answer.

## Known gaps

- No asset reports fuel used, RPM, coolant, load, AdBlue or DTCs from telemetry, so the "measured" branches of those screens are unreachable in the demo.
