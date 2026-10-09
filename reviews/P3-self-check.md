# P3 self-check — Access layer and API

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

## Acceptance checks (§15 · P3)

| # | Check | Verdict | How it is verified |
| --- | --- | --- | --- |
| 1 | Every user's visible assets match `expected.ts` | Pass | `expected.test.ts` — "matches the fixture for every user, asset by asset". |
| 2 | Grant window tests | Pass | `src/server/access.test.ts` (28 tests): readable windows, clipped history, past rentals, overrides. |
| 3 | API tests for S1, S4–S12 visibility; forbidden == missing | Pass | `access.test.ts` and `reports.test.ts` — "forbids reports on assets the user cannot see (forbidden looks like missing)". |
| 4 | Ravi/Sara capability differences | Pass | `capabilities.test.ts` (4) and `capability-reasons.test.ts` (4). |
| 5 | Renter windows and past rentals for reports | Pass | `reports.test.ts` clipping case and the S8 "keeps past rentals reportable" case. |
| 6 | Architecture rules enforced for real | Pass | `src/architecture.test.ts` greps rules 1–4 and ratchets `KNOWN_DIRECT_DATA_IMPORTS`; the list may only shrink and every entry must still be true. |
| 7 | Audit for cross-tenant views | Pass | audit assertions in `bookings.test.ts`, `billing.test.ts`, `alerts.test.ts`. |

## Screenshots

`reviews/screenshots/P3/` — **empty**. §16 wants one file per screen; this
environment has no browser, so nothing was ever captured. The CI job added in
this PR is where they should come from (Playwright already writes `test-results/`
screenshots on failure; a deliberate capture pass is a follow-up, not this PR).

## Files that carry this phase today

`src/server/api.ts`, `src/server/access.ts`, `src/server/capabilities.ts`, `src/server/capability-reasons.ts`, `src/server/grants.ts`, `src/server/audit.ts`, `app/dev/access/page.tsx`.

## Deviations from BUILD_PROMPT.md (and why)

- None found while re-reading §5 and §11 for this PR.

## Libraries added (and why)

None. Nothing in this PR needed a dependency; the repository's §3 stack is unchanged.

## Questions for the reviewer

- `api.ts` gates reads, but list pages still read `seed` directly for rendering (that is what the ratchet pins). Is moving those reads onto the API layer worth doing before this becomes a real backend, or does it only matter once there is one?

## Known gaps

- Visibility is proven at the unit level only. The e2e specs encode the same expectations and have never executed, so a screen-level leak would wait for CI.
