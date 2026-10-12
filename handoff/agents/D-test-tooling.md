# Agent D: test tooling (Wave 1)

**Branch:** `agent-d-test-tooling` · **Spec:** `UI-UPGRADE.md` §11 (items 1, 4, 5, 6) · **Arabic namespace:** none

## Scope
1. **Accessibility.**
   - Add `@axe-core/playwright` and `tests/e2e/a11y.spec.ts` covering `/sign-in`, `/app`, `/app/alerts`, `/app/reports`, `/app/maintenance`, `/app/assets/a-ex04`, `/app/settings`, `/console`, `/t/k7Qm2Xc9TpLw4ZaN8rVb3Ye5` and `/verify/MUC-2026-09-EX-04-01`.
   - Start in **report mode**: write the violations to `reviews/a11y-baseline.md`, and fail only on new **critical** violations versus that baseline. Wave 3 (J) turns it strict.
2. **No raw floats.** `tests/e2e/no-raw-floats.spec.ts`: on the main screens for Khalid, Omar and Lina, no visible text matches `/\d+\.\d{4,}/`. If a screen fails, don't touch the app: mark that case `test.fixme('<screen>: <text found> — owner: agent <X>')` and list it under "Requests for other agents". The owning Wave 2 agent removes the `fixme`.
3. **Visual regression.**
   - `tests/e2e/visual.spec.ts` with `toHaveScreenshot` on 16 key screens × 2 widths. Stub the map tiles (helper exists), turn animations off, and fix the demo clock.
   - Mark the spec `test.skip(!process.env.VISUAL, …)` so it runs only when `VISUAL=1`. Wave 2 changes every screen; J records the baselines and switches it on.
   - Add a CI job (allowed to fail for now) that runs it.
4. **Usability kit.** `reviews/usability/` gets one script per role:
   - roles: Owner (Khalid), Renter (Lina), Site User (Mark), Kasper Ops (Ravi), Customer (link);
   - five tasks each, from the §11 table;
   - each task has a start state, a success criterion, a click target and a time target.
   - Add `tests/e2e/usability.spec.ts`, which runs each task's happy path and records its click count. It's report-only for now.
5. **Performance.** A Playwright check that `/app` is interactive within 2.5 s on CI (navigation timing). Report-only.
6. **Helpers.** Add `signInAsRole(page, role)` and `openAsset(page, id)` to `tests/e2e/helpers.ts`, without changing existing helpers.

## Rules
- Don't change app code. If a test needs a `data-testid`, list it under "Requests for other agents".
- No existing test is changed or weakened.

## Done when
- The new specs run in CI. Report-only specs never fail the build; the axe critical-only gate and no-raw-floats do.
- The self-check includes the baseline counts.
