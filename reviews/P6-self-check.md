# P6 self-check — Asset detail

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

## Acceptance checks (§15 · P6)

| # | Check | Verdict | How it is verified |
| --- | --- | --- | --- |
| 1 | S2, S3, S5, S11 detail parts, S21 | Written, not executed | `S1-S3.spec.ts`, `S4-S8.spec.ts`, `S20-S22.spec.ts`. |
| 2 | Tier 1 assets have no Engine & fuel tab | Pass (code) | `tabs[]`: `enabled: !isTier1 && phase !== 'day_one'`; S1 asserts `toBeDisabled()`. |
| 3 | Gaps drawn as gaps | Pass | `buildEcuBreakdown` records `gapMinutes` per day and window `gapHours`; the new ignition breakdown applies the same rule and `utilisation.test.ts` asserts no hours are attributed across a gap. |
| 4 | Renter history clipped | Pass | `access.test.ts` window cases; the detail page consumes the same readable window. |
| 5 | Edit refused by API for non-owners | Pass | ownership assertions in `access.test.ts` / `team.test.ts`. |
| 6 | Utilisation tab, Tier 3 (ECU meter, last 7 days) | Pass — deliberately unchanged | S2 asserts `Engine (h)` and `Gap (min)` in that table; the branch was left byte-for-byte intact. |
| 7 | Utilisation tab, Tier 1/2: 7 days of Moving / Ignition-on-stationary / Off with a source note | **Pass — added in this PR** | The branch was the sentence "Last 7 days utilisation for this asset." It is now a real 7-row table plus a stacked day-split bar from `buildIgnitionBreakdown`, with `SourceLabel: Estimated`, a "Not for billing" note and a `t('…note')` source line. 20 tests in `src/server/utilisation.test.ts`; the copy is pinned by `src/e2e-contract.test.ts`. |
| 8 | Overview: mini map, status, today's distance and ignition-on time, a tile per visible hardware feature | **Pass — added in this PR** | Two today cards (`asset_detail.overview.today_distance`, `today_ignition`) and the five absent hardware tiles (`power`, `coolant`, `load`, `adblue`, `faults`) — every one of those keys already existed in `ar.json` with no code referencing them. Tier 1 still renders no CAN tiles. |
| 9 | No tracker → "No tracker fitted", request flow; offline → last position + since | Pass (code) | the request panel and `offline_since` copy are in the page; the request flow is covered by `trackers.test.ts`. |

## Screenshots

`reviews/screenshots/P6/` — **empty**. §16 wants one file per screen; this
environment has no browser, so nothing was ever captured. The CI job added in
this PR is where they should come from (Playwright already writes `test-results/`
screenshots on failure; a deliberate capture pass is a follow-up, not this PR).

## Files that carry this phase today

`app/app/assets/[id]/page.tsx`, `src/server/utilisation.ts` (new), `src/server/muc.ts`, `src/server/trips.ts`, `src/server/alerts.ts`, `src/server/utilisation.test.ts` (new).

## Deviations from BUILD_PROMPT.md (and why)

- Today's distance comes from `detectTrips` (§11.5 trip rule) rather than an odometer diff, so the Overview card can never disagree with the Trips tab.
- The day-split bar draws Off as `24 h − on-hours − gap-hours` and carries an `aria-label` spelling all three numbers, so the bar is not colour-only.
- `STATUS-REVIEW.md` also suggested an "idle today" Overview tile. It is not there: on Tier 1/2 idling is not measured (§6), so the tile could only ever read "Not measured". Ignition-on time is the number that exists for every tier.
- The utilisation tab is enabled for any Phase-2 asset that reports ignition (`showsUtilisation`), which is what §11.3 implies; the previous code showed the tab for tracker-less assets too and then had nothing to say.

## Libraries added (and why)

None. Nothing in this PR needed a dependency; the repository's §3 stack is unchanged.

## Questions for the reviewer

- Should the Tier 1/2 utilisation tab get the period picker the Tier 3 branch implies? §11.3 pins "last 7 days" for the bars and the certificate month for the meter, so the two branches disagree with each other only because one has nothing to seal.

## Known gaps

- The non-MUC table is proven at the data layer and by static contract; the pixels still need the CI browser run.
