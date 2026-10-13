# D self-check: test tooling (night run, 13 Oct 2026)

Chunk **D** from the night queue (#30), agent file `handoff/agents/D-test-tooling.md`, spec `UI-UPGRADE.md` §11 items 1, 4, 5, 6. Branch `night-d` from `main` at `811979a`. PR #37. No app code changed.

## What changed and why

| File | Change |
| --- | --- |
| `package.json`, `package-lock.json` | `@axe-core/playwright` (dev) — the only package D may add. |
| `tests/e2e/a11y.spec.ts` (new) | axe on the 10 screens the handoff lists (desktop, 1440 × 900). Logs `A11Y <screen> {…}` and attaches the JSON; **fails only on a critical violation not in the baseline** (new rule, or more nodes). |
| `reviews/a11y-baseline.md` (new) | The baseline: a human table plus the JSON block the spec reads, and who owns each fix. |
| `tests/e2e/no-raw-floats.spec.ts` (new) | 23 screens (Khalid 11, Omar 6, Lina 6): no visible text matches `/\d+\.\d{4,}/`. A gate. Every screen passes today, so no `fixme` was needed. |
| `tests/e2e/visual.spec.ts` (new) | `toHaveScreenshot` on 16 screens × 1440 and 390 px; tiles stubbed, animations off, caret hidden, clock at the anchor. `test.skip(!process.env.VISUAL)`. |
| `playwright.config.ts` | `snapshotPathTemplate` → `tests/e2e/__screenshots__/<spec>/<name>.png` (UI-UPGRADE §11.4 location, no platform suffix). No baselines committed: J records them. |
| `.github/workflows/ci.yml` | New job **"Visual regression (report only)"**: `VISUAL=1`, `--update-snapshots=missing`, step `continue-on-error`, uploads the captures and diffs as the `visual-regression` artifact (J can take the runner's Linux captures as the first baselines). The four existing jobs are untouched. |
| `reviews/usability/` (new) | README (how to run a session, scoring) and one script per role: owner, renter, site-user, kasper-ops, customer. Each task: start state, success criterion, click target, time target, happy path. |
| `tests/e2e/usability.spec.ts` (new) | The 24 happy paths (O1–O5, R1–R5, M1–M5, K1–K5, C1–C4). Counts clicks and time, logs `USABILITY {…}`, attaches JSON. **Report-only**: a broken path is recorded as `completed: false` with the reason; the test never fails on it. |
| `tests/e2e/perf.spec.ts` (new) | `/app` navigation timing (domInteractive, DCL, load) and time to first fleet row/marker vs a 2.5 s budget. Report-only (annotation when over). |
| `tests/e2e/helpers.ts` | Appended only: `ROLE_USERS`, `signInAsRole(page, role)`, `assetCode(id)`, `openAsset(page, id)`, `settle(page)`. Existing helpers unchanged. |
| `vitest.config.ts` | `coverage.exclude: ['app/**']` (Agent A request #1, PROGRESS note for D). **Outside D's ownership list** but named in D's chunk in #30 and in PROGRESS; one line plus a comment. |

## Exit codes

| Command | Exit |
| --- | --- |
| `npm ci` | 0 |
| `npm run typecheck` | 0 |
| `npm run lint` | 0 (first run 1: `no-control-regex` in usability.spec.ts; fixed by building the ANSI regex from `String.fromCharCode(27)`) |
| `npm run build` | 0 |
| `TZ=UTC npm test` | 0 (1112 passed) |
| `TZ=Asia/Dubai npm test` | 0 (1112 passed) |
| `npm run test:coverage` | 0 (lines 89.29 %) |
| `npx playwright test a11y no-raw-floats usability perf visual demo-shell --workers=2` (desktop + phone, server restarted after the build) | 0 (71 passed, 125 skipped: phone-project skips, and visual without `VISUAL`) |
| `VISUAL=1 npx playwright test visual --project=desktop --update-snapshots=missing`, then again without the flag | 0 on the second run: 32 / 32 match the first run's captures (deterministic). Captures deleted, not committed. |
| `npx playwright test usability --workers=2` (final) | 0 (24 passed, 24 skipped on phone) |

Earlier runs used `waitForLoadState('networkidle')`, which timed out on some screens (they poll). Replaced with `settle()`: load event, two animation frames, a short pause. Five back-to-back runs after that: no flakes.

## Baseline counts (axe, report mode)

10 screens. **Critical: 1 rule on 1 screen, 2 nodes** (`select-name` on Alerts, the two filter selects). **Serious: 7 rule×screen, 12 nodes** (color-contrast on sign-in, maintenance, console, tracking, verify; `aria-command-name` on the asset page and tracking page). **Moderate: 15 rule×screen, 33 nodes** (`region`, `landmark-one-main`, `page-has-heading-one`). Full table and owners in `reviews/a11y-baseline.md`.

## No raw floats

23 screens for Khalid, Omar and Lina: **0 raw floats**. No `fixme` cases.

## Usability run (scripted, desktop, anchor clock)

| Task | | Done | Clicks / target | Time / target | Within target |
| --- | --- | --- | --- | --- | --- |
| C1 | Open the link on a phone | yes | 0 / 0 | 0.3 s / 10 s | yes |
| C2 | Read the arrival time | yes | 0 / 0 | 0 s / 10 s | yes |
| C3 | Confirm nothing else is visible | yes | 0 / 0 | 0 s / 10 s | yes |
| C4 | See "no longer active" after the link is revoked | yes | 0 / 0 | 0.3 s / 15 s | yes |
| K1 | Pair a tracker to MW-01 | yes | 4 / 4 | 0.3 s / 60 s | yes |
| K2 | Find the faulty CAN adapter | yes | 2 / 1 | 0.1 s / 20 s | no |
| K3 | Move a tracker between tenants | yes | 4 / 4 | 0.2 s / 60 s | yes |
| K4 | Open a tenant's assets | yes | 2 / 2 | 0.1 s / 30 s | yes |
| K5 | Confirm Billing is hidden | yes | 1 / 1 | 0 s / 15 s | yes |
| M1 | Find his site's alerts | yes | 1 / 1 | 0.1 s / 15 s | yes |
| M2 | Confirm he can't edit or deactivate anything | yes | 1 / 1 | 0.1 s / 30 s | yes |
| M3 | Open a machine's engine data | yes | 2 / 2 | 0.6 s / 20 s | yes |
| M4 | Run a report for his site | yes | 3 / 3 | 0.3 s / 45 s | yes |
| M5 | Use search (⌘K) to jump to an asset | yes | 2 / 0 | 0.4 s / 15 s | no |
| O1 | Find which machine had a fuel drop and when | yes | 2 / 3 | 0.3 s / 30 s | yes |
| O2 | Share FB-12's tracking link | yes | 3 / 4 | 0.4 s / 45 s | yes |
| O3 | End Palm's access to EX-11 with a reason | yes | 3 / 5 | 0.6 s / 60 s | yes |
| O4 | See what's overdue in maintenance | yes | 1 / 2 | 0.3 s / 20 s | yes |
| O5 | Issue September's certificate for EX-04 | no | 5 / 4 | — / 60 s | no |
| R1 | See only what she rents and owns | yes | 0 / 0 | 0 s / 15 s | yes |
| R2 | Open EX-04's history and confirm it starts at the rental | yes | 3 / 3 | 0.9 s / 30 s | yes |
| R3 | Run and download last week's trip report | yes | 5 / 5 | 0.8 s / 60 s | yes |
| R4 | Find the arrival time of nothing she doesn't own (FB-12 is not findable) | yes | 1 / 1 | 0.4 s / 20 s | yes |
| R5 | Switch to Arabic and back | yes | 4 / 4 | 0.4 s / 30 s | yes |

**20 of 24 within target, 23 of 24 completed.** Times are machine times (a script, not a person); the time targets matter for human sessions.
- **O5 fails: two certificate bugs** (`app/app/certificates/page.tsx`, owner A/H):
  1. "Last month" reads **May 2026** at the October anchor. `lastMonthPeriod()` parses `toLocaleString('en-AE')` (day/month order) with `new Date()`, which reads it month/day: 6 Oct → 10 Jun → "last month" May.
  2. The period dropdown's booking options all issue for `selectedAssetBookings[0]` (BK-1001, still running), whichever booking is picked, so picking BK-0981 (1–20 Sep) fails with "Only past periods can be certified."
- **M5 (⌘K): 2 clicks, target 0.** Ctrl/⌘+K opens the demo bar's **View as** user search (`ViewAsMenu.tsx`), not product search; product search has no shortcut. Search button + result works.
- **K2: 2 clicks, target 1.** The faulty adapter is found through the status filter; nothing on the list flags it at a glance.
- **O5 clicks 5 vs 4:** Certificates sits under "More" at 1440 px for Khalid.

## Performance (report-only)

`/app` (Khalid, production build, local): domInteractive **424 ms**, DOMContentLoaded 424 ms, load 756 ms, first fleet row/marker **1,174 ms**. Within the 2.5 s budget. CI numbers will be in the shard log (`PERF {…}`).

## Screenshots

None: D changes no screen. The visual spec's 32 dry-run captures were looked at for stability only (two identical runs) and deleted, since Wave 2 replaces every screen.

## Scorecard rows moved (UI-UPGRADE §2)

- **A15 Testability: 7 → 8.** Evidence: usability kit (5 scripts, 24 tasks), `usability.spec.ts`, axe spec with baseline, visual-regression spec + CI job, perf check, role helpers. Not 9 yet: baselines unrecorded, axe not strict, "Start session as" and "Report a problem" are J2.
- **A13 Data realism: no change in score**, but the "no raw floats anywhere (e2e check)" criterion now has its gate (23 screens, 0 found).
- **A14 Workflows: 7 (unchanged), now measured**: 20 / 24 within target; O5, M5, K2 named above.

## Supervisor review (BUILDER.md §5)

- Branched from the latest `main`; no unrelated changes; no merge commits: **PASS**
- All §4 commands pass, exit codes above; CI green on all shards: **PASS** locally; CI result in the PR (`check-runs` on the head).
- No test weakened or deleted: **PASS** (only additions; `helpers.ts` appended, no existing helper touched).
- Architecture rules (server via `src/server/api`, no `role ===`, time from `clock.ts`, coverage ≥ 85 %): **PASS**. No app code. `Date.now()` appears only in the perf and usability specs, to time the browser in wall-clock time; it never feeds the app.
- Access unchanged or narrower: **PASS** (no app change). The usability spec also re-checks scoping: Lina can't find FB-12 (R4) or see EX-11 (R1); Mark has no Settings, Edit asset or End access (M2); Ravi has no Billing (K5); the customer link shows nothing else (C3).
- Honest numbers: **PASS** (no screen numbers added; the self-check's numbers are measured and labelled).
- No hard-coded hex: **PASS** (none in the diff).
- Phone 390 px: **PASS (n/a)** — no screen changed; C1 checks the tracking page has no sideways scroll.
- Arabic strings: **PASS (n/a)** — no UI copy added.
- Screenshots attached and looked at: **PASS (n/a)** — no screen changed; see Screenshots.
- No fleetx / "dozr" / "KSP-0" in `app/`, `src/`, `tests/`: **PASS**.
- Own-diff checks: user text into HTML — none; role leaks — none (tests only); raw floats — the new gate; contrast — reported in the baseline, not changed.

## Deviations and decisions taken

1. **`vitest.config.ts` and `.github/workflows/ci.yml` are outside D's ownership list.** Both are named in D's scope (coverage exclude: #30 queue and PROGRESS; CI job: D-test-tooling.md §3). Changes are additive.
2. **Visual CI job is green even on diffs.** "Allowed to fail" implemented as step-level `continue-on-error` plus `--update-snapshots=missing`, so the PR's check list doesn't show a red job while there are no baselines. J removes both when it records baselines.
3. **Customer has 4 tasks**, not 5: UI-UPGRADE §11 lists four for that role. Noted in `customer.md`.
4. **O2 runs as Omar**, not Khalid: FB-12 belongs to Al Noor. Click and time targets for the non-Owner roles are mine (§11 gives them only for the Owner); they're in each script.
5. **axe and usability run in the desktop project only** (the phone project skips them); visual sets both widths itself. Phone a11y is J1's pass.
6. Keyboard checks of §11.5 (nav, ⌘K, side panel Esc, dialog focus traps) are not in this chunk: D's file names only axe. Left for J3.

## Requests for other agents

- **G (Alerts):** give the two filter `<select>`s an accessible name (the only critical axe finding). **G (Maintenance):** two low-contrast texts.
- **H or A (Certificates):** fix `lastMonthPeriod()` (shows May at the October anchor) and issue for the booking actually picked, not `bookings[0]`. Then O5 passes.
- **B / J2 (shell):** give product search a shortcut that doesn't clash with the demo bar's Ctrl/⌘+K (or move View as to another key). Then M5 passes.
- **I (Console):** four low-contrast elements on Overview; flag faulty adapters on the list (K2).
- **E, F:** the map and asset pages have no `<h1>`; one nameless button on the asset and tracking maps (`aria-command-name`).
- **J:** record visual baselines from the CI artifact, make the visual job required, make axe strict (no serious/critical), turn usability targets into assertions, add the §11.5 keyboard checks.

## Open questions

None blocking.
