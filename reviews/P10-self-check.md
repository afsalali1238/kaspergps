# P10 self-check — Admin: users, sites, assets, console, onboarding, stock, bookings, import

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

## Acceptance checks (§15 · P10)

| # | Check | Verdict | How it is verified |
| --- | --- | --- | --- |
| 1 | S17–S22, S42–S50 | Written, not executed | `S17-S19.spec.ts`, `S20-S22.spec.ts`, `S42-S50.spec.ts`. |
| 2 | Created records survive a reload and disappear on Reset | Pass (store), written (UI) | `kasper.store.v2` rehydrate, including the clock-offset fix from PR #8. |
| 3 | Created users/tenants/assets behave like seeded ones | Pass | `team.test.ts` (7), `tenants.test.ts` (5), `trackers.test.ts` (18) run the same checks over created and seeded rows. |
| 4 | Every console action has an audit entry | Pass | per-module assertions: `trackers`, `adapters`, `bookings`, `billing`, `alerts`. |
| 5 | Ops can't reach Admin-only actions (hidden + refuses) | Pass | `adapters.test.ts`, `team.test.ts`, `billing.test.ts` Ops cases; nav filters by capability. |
| 6 | Import validates IMEIs and names sites/tenants by name | Pass | `trackers.test.ts` + `src/domain/tracker-id.test.ts` (9, Luhn). |
| 7 | `getByLabel` on the Settings forms works | **Pass — fixed in this PR** | The invite-user / add-site / add-asset forms in `app/app/settings/page.tsx` rendered `<label>`s as *siblings* of un-`id`'d controls, so `getByLabel('Email')`, `('Sites')`, `('Code')`, `('Site name')` and `(/Radius/)` would all have found nothing in a browser. Every labelled control in the three forms is now paired with `id`/`htmlFor`; the "Location" caption became a `<span>` because it names no control. Guarded by `src/e2e-contract.test.ts`. |
| 8 | S19 fills the user's name | **Pass — re-pointed in this PR** | The spec asked for `getByLabel('Full name')`; the field's accessible name is the label "Name" and "Full name" is its placeholder, which `getByLabel` does not match. §11.8 requires *name, email, role, sites* only, so the spec was re-pointed at the product instead of renaming the field. |
| 9 | Guided steps for S1–S22 and S42–S50 | Pass (logic) | `walkthroughs.test.ts`; the walkthrough card is dismissed in `helpers.startScenario` rather than asserted. |

## Screenshots

`reviews/screenshots/P10/` — **empty**. §16 wants one file per screen; this
environment has no browser, so nothing was ever captured. The CI job added in
this PR is where they should come from (Playwright already writes `test-results/`
screenshots on failure; a deliberate capture pass is a follow-up, not this PR).

## Files that carry this phase today

`app/console/**`, `app/app/settings/page.tsx`, `src/server/team.ts`, `src/server/tenants.ts`, `src/server/trackers.ts`, `src/server/adapters.ts`, `src/server/import.ts`, `src/e2e-contract.test.ts` (new).

## Deviations from BUILD_PROMPT.md (and why)

- The Add-site and Add-asset forms in customer Settings are still presentational: fields are uncontrolled and "Save site"/"Save asset" write nothing, although §11.8 asks for real creation. The specs only assert that the form is offered, so they pass either way — recorded as the phase's largest honest gap rather than fixed inside this PR.
- The console user-create form has the same un-paired labels and the same dead submit. No spec touches it, so only the customer page was changed; the contract test would flag the console if a spec ever reached for it.

## Libraries added (and why)

None. Nothing in this PR needed a dependency; the repository's §3 stack is unchanged.

## Questions for the reviewer

- Do you want Settings → Sites/Assets to create real records (appearing on the map and in every earlier scenario), or is creation deliberately console-only in the demo?

## Known gaps

- "everything created survives a reload" is only true for console-created rows, because customer Settings writes nothing.
