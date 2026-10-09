# P7 self-check — Alerts

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

## Acceptance checks (§15 · P7)

| # | Check | Verdict | How it is verified |
| --- | --- | --- | --- |
| 1 | S9 (per-user alert list) | Written, not executed | `tests/e2e/S9-S12.spec.ts`. |
| 2 | Alert types match the fleet's hardware | Pass | `src/server/alerts.ts` `HARDWARE_TYPES` gate; `src/server/alerts.test.ts` (4 tests). |
| 3 | Day one shows offline only | Pass | `alerts.test.ts` phase case. |
| 4 | Acknowledgement recorded with name and time | Pass | `alerts.test.ts` asserts `acknowledgedBy`, `acknowledgedAt` and the "Acknowledged by … at" copy; §5 gives `tenant_admin` the capability (defect 5.11, fixed in PR #8). |
| 5 | Bell, `/app/alerts`, asset Alerts tab, no replay alerts | Pass (code) | `bellAlerts()` feeds `AppShell`; the asset tab filters `visibleAlerts`; this PR's map tile reads the same function so the counts cannot drift apart. |

## Screenshots

`reviews/screenshots/P7/` — **empty**. §16 wants one file per screen; this
environment has no browser, so nothing was ever captured. The CI job added in
this PR is where they should come from (Playwright already writes `test-results/`
screenshots on failure; a deliberate capture pass is a follow-up, not this PR).

## Files that carry this phase today

`src/server/alerts.ts`, `app/app/alerts/page.tsx`, the Alerts tab in `app/app/assets/[id]/page.tsx`, `src/components/layout/AppShell.tsx`.

## Deviations from BUILD_PROMPT.md (and why)

- The new map tile counts the visible, currently filtered assets — deliberately a different scope from the bell, and it prints the asset count beside it so the narrower scope is legible.

## Libraries added (and why)

None. Nothing in this PR needed a dependency; the repository's §3 stack is unchanged.

## Questions for the reviewer

- The seeded alert set is static; nothing raises an alert when the clock jumps. Should `runDueSchedules`-style clock support also recompute alerts, so "offline since" moves in S9/S10?

## Known gaps

- No alert is ever produced from telemetry, so the "no replay alerts" rule cannot be violated but also cannot be exercised.
