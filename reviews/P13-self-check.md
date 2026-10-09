# P13 self-check — MUC, billing, payments and console billing

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

## Acceptance checks (§15 · P13)

| # | Check | Verdict | How it is verified |
| --- | --- | --- | --- |
| 1 | S31–S36 | Written, not executed | `tests/e2e/billing.spec.ts`, `tests/e2e/certificate.spec.ts`. |
| 2 | Seal stable across reissue and reload | Pass | `muc.test.ts` (15) canonical-payload/seal/void/reissue cases; `muc-pdf.test.ts` (2). |
| 3 | No edit path for a sealed MUC | Pass | `muc.test.ts` refusal cases — only void + reissue exist. |
| 4 | Tier 1/2 never offered a MUC | Pass | `hasFeature(asset, 'muc')` gates the tab, the issue action and the billable-hours path; S1 asserts the disabled tab. |
| 5 | Invoice totals equal between screen, PDF and Excel | Pass (numbers) | `billing.test.ts` money cases; exports consume the same view. |
| 6 | Renters see only invoices addressed to them | Pass | "shows each side only what it may see", "refuses a payer the invoice is not addressed to". |
| 7 | Ops has no billing | Pass | `billing.test.ts` + console gates. |
| 8 | Estimated hours billed only with agreement; MUC hours on Tier 3; daily counts started days | Pass | the four "invoices from bookings" cases in `billing.test.ts`. |
| 9 | Certificates follow the phase switch | **Pass — added in this PR** | `app/app/certificates/page.tsx` renders the §11.16 gate at Day 1; three new Playwright tests assert the locked screen, the Tier 3 asset tab disabled at Day 1 and enabled at Phase 2, and the unlock. `src/e2e-contract.test.ts` pins the gate copy so the spec and the page cannot drift apart silently. |
| 10 | Invoices reconcile | **Pass — added in this PR** | Five new tests in `src/server/billing.test.ts`: payments + balance = total for every invoice either side can see (plus the part-paid / settled / untouched shapes that must exist for the loop to mean anything); issuer and customer agree on the same invoice; `billingSummary` is the sum of the invoices in its window, per customer too; `agedReceivables` loses nothing to the invoice list; a GPS statement equals its tier lines + VAT and equals the invoice it becomes. Voiding is asserted to remove *exactly* the total and the balance from the summary — and removing the `void` skip from `billingSummary` makes the test fail (mutation-checked), so it is not a tautology. |

## Screenshots

`reviews/screenshots/P13/` — **empty**. §16 wants one file per screen; this
environment has no browser, so nothing was ever captured. The CI job added in
this PR is where they should come from (Playwright already writes `test-results/`
screenshots on failure; a deliberate capture pass is a follow-up, not this PR).

## Files that carry this phase today

`src/server/muc.ts`, `src/server/muc-canonical.ts`, `src/server/billing.ts`, `src/lib/muc-pdf.ts`, `app/app/certificates/page.tsx`, `app/app/billing/page.tsx`, `app/console/billing/page.tsx`.

## Deviations from BUILD_PROMPT.md (and why)

- The reconciliation tests deliberately run after the mutating billing tests, so they also prove a mutation cannot break the tie. Where a branch needed specific state (a voided invoice, a generated statement) the test creates it itself instead of depending on order.

## Libraries added (and why)

None. Nothing in this PR needed a dependency; the repository's §3 stack is unchanged.

## Questions for the reviewer

- Should reconciliation also assert the seeded AED figures as hard numbers — so a seed change fails the suite — or is that too brittle for a demo fixture?

## Known gaps

- The QR on the certificate PDF is generated but never decoded by a test.
- `muc.test.ts` takes ~9 s (sealing uses webcrypto over full payloads); CI inherits it.
