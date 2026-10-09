# P4 self-check — Demo bar, sign-in and app shell

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

## Acceptance checks (§15 · P4)

| # | Check | Verdict | How it is verified |
| --- | --- | --- | --- |
| 1 | Every user selectable (incl. outside hirer, signed out, Ctrl+K) | Written, not executed | `tests/e2e/demo-shell.spec.ts` and `tests/e2e/helpers.ts` drive `View as`; no browser has run them. |
| 2 | Features panel: no CAN for Omar; ✕ with reasons for Lina | Written (UI), pass (reasons) | reasons come from `capability-reasons.test.ts`; the panel itself is browser-only. |
| 3 | Deactivated / invited / suspended messages | Pass (copy) | the exact §11.1 strings are in `app/sign-in/page.tsx`; the flow is asserted in `demo-shell.spec.ts` only. |
| 4 | Customers get "Page not found" on `/console` | Written, not executed | `demo-shell.spec.ts`; the guard reads the session, which is unit-tested. |
| 5 | Switching user never shows the previous user's data | Written, not executed | `demo-shell.spec.ts`; no unit test covers the store reset between identities. |
| 6 | Clock presets, phase, Show hidden, Sales view, Tools, Scenarios | Pass (contract) | `src/e2e-contract.test.ts` asserts the demo bar still exposes the triggers the helpers click (`View as`, `Clock`, `Scenarios`, `Tools`, `.demo-bar`). |
| 7 | Guided walkthroughs exist for S1–S50 | Pass (logic) | `src/components/demo/walkthroughs.test.ts`; the card itself is dismissed in specs, not tested. |
| 8 | Controls the specs label actually have accessible names | **Pass — added in this PR** | `src/e2e-contract.test.ts` (25 tests) walks every `getByLabel` in `tests/e2e` and fails unless `app/` pairs that name with a control. It reproduces the exact drift class this phase caused (see P10 row 6). |

## Screenshots

`reviews/screenshots/P4/` — **empty**. §16 wants one file per screen; this
environment has no browser, so nothing was ever captured. The CI job added in
this PR is where they should come from (Playwright already writes `test-results/`
screenshots on failure; a deliberate capture pass is a follow-up, not this PR).

## Files that carry this phase today

`src/components/demo/DemoBar.tsx`, `src/components/demo/FeaturesPanel.tsx`, `src/components/demo/walkthroughs.ts`, `src/components/layout/AppShell.tsx`, `src/components/layout/SearchCommand.tsx`, `app/sign-in/page.tsx`, `src/store`.

## Deviations from BUILD_PROMPT.md (and why)

- For a tenant session the desktop `<nav>` is not rendered at all (`!showMobileNav`), and the phone bottom bar shows only `visibleNavItems.slice(0, 5)` — so Certificates, Billing, Maintenance and Cost & ROI are unreachable from the nav for a customer at any width; they can only be deep-linked. §11 says phone items "move into a bottom sheet". Left as found and recorded here rather than silently changed, because it moves the demo's choreography.
- `playwright.config.ts` uses `retries: 0` with `trace: 'on-first-retry'`, i.e. traces could never exist. This PR sets CI retries to 2 (local still 0) and adds an HTML reporter on CI so a red run is debuggable.

## Libraries added (and why)

None. Nothing in this PR needed a dependency; the repository's §3 stack is unchanged.

## Questions for the reviewer

- Should the customer nav show all nine items on desktop with the bottom bar for phones (the §11 reading), or is the current "bottom bar only for tenants" deliberate?

## Known gaps

- No browser-proven pass exists for any part of this phase.
