# P9 self-check — Rentals, tracking links and the public page

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

## Acceptance checks (§15 · P9)

| # | Check | Verdict | How it is verified |
| --- | --- | --- | --- |
| 1 | S13–S16 | Written, not executed | `tests/e2e/S13-S16.spec.ts`. |
| 2 | Token rules | Pass | `links.test.ts` (9) and `tracking-links.test.ts` (14). |
| 3 | Public resolver shape | Pass | resolver key-set test in `tracking-links.test.ts` — the payload carries only §11.6's fields. |
| 4 | Booking lifecycle, end early, nightly check | Pass | `src/server/bookings.test.ts` (10), incl. "ended-early access is not restored". |
| 5 | ETA on the public page | Pass (logic) | `src/domain/eta.test.ts` (8); rendering is browser-only. |
| 6 | `/verify/[number]`: valid, voided→replacement, not found, tampered | Written, not executed (UI); Pass (seal) | `certificate.spec.ts` for the page, `muc.test.ts` for the seal and `tamperWithMuc`. |
| 7 | `noindex` on public pages | Written, not executed | Both public pages assert it in Playwright — `certificate.spec.ts` (`/verify`) and `public-tracking.spec.ts` (`/t/[token]`) — so the rule is *encoded*, it has simply never run. |

## Screenshots

`reviews/screenshots/P9/` — **empty**. §16 wants one file per screen; this
environment has no browser, so nothing was ever captured. The CI job added in
this PR is where they should come from (Playwright already writes `test-results/`
screenshots on failure; a deliberate capture pass is a follow-up, not this PR).

## Files that carry this phase today

`src/server/bookings.ts`, `src/server/links.ts`, `src/server/tracking-links.ts`, `src/domain/eta.ts`, `app/t/[token]/page.tsx`, `app/verify/[number]/page.tsx`, `app/verify/layout.tsx`.

## Deviations from BUILD_PROMPT.md (and why)

- None found for this phase while re-reading §11.6–11.7 for this PR.

## Libraries added (and why)

None. Nothing in this PR needed a dependency; the repository's §3 stack is unchanged.

## Questions for the reviewer

- Should the demo bar's "Jump to" run the nightly check eagerly so S15 can be shown without waiting for a natural date change?

## Known gaps

- No test decodes the certificate QR, and no HTTP-level test checks the `noindex` meta — it is only asserted through a browser, which has never run.
