# P1 self-check — Foundation

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

## Acceptance checks (§15 · P1)

| # | Check | Verdict | How it is verified |
| --- | --- | --- | --- |
| 1 | All routes load | Pass (server), unverified in a browser | `next build` compiles all routes; five of them (listed above) were fetched over HTTP and returned 200 with no error payload. Hydration is not checkable without a browser. |
| 2 | `/dev/ui` shows every component | Present, not visually verified | `app/dev/ui/page.tsx` renders the UI kit; no screenshot exists to prove completeness. |
| 3 | lint / typecheck / test pass | Pass | `npm run lint`, `npm run typecheck`, `npm test` — all green today. |
| 4 | 390 px with no sideways scroll | **Not verified** | The `Pixel 5` Playwright project covers it, and that project has never run. Overflow is a layout fact; no static check can stand in for it. |
| 5 | No banned brand words | Pass | `src/architecture.test.ts` rule 4 greps `src/` and `app/` (allowing only the sanctioned "device time" tooltip) and runs inside `npm test`. |
| 6 | Scripts `dev`/`build`/`lint`/`typecheck`/`test`/`test:e2e` | Pass | `package.json` carries all six; every one was run here except `test:e2e`. |
| 7 | Tailwind tokens and fonts | Pass (code) | `postcss.config.mjs` + the global stylesheet define the palette the components use (`bg-live`, `text-grey-500`, …). No visual check. |

## Screenshots

`reviews/screenshots/P1/` — **empty**. §16 wants one file per screen; this
environment has no browser, so nothing was ever captured. The CI job added in
this PR is where they should come from (Playwright already writes `test-results/`
screenshots on failure; a deliberate capture pass is a follow-up, not this PR).

## Files that carry this phase today

`src/components/ui/**` (Button, Badge, StatusBadge, TierChip, SourceLabel, Skeleton, EmptyState, ErrorState, Panel, Tabs, Table, Sheet, Toast, InlineConfirm, Dropdown), `src/styles`, `app/dev/ui/page.tsx`, `app/globals.css`, `eslint.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`.

## Deviations from BUILD_PROMPT.md (and why)

- `vitest.config.ts` aliased `@` to the absolute path `/home/user/kaspergps/src`, so the suite could only ever run in that one directory. This PR resolves the alias from the config file itself (`import.meta.url`) — it had to change before any CI runner could execute `npm test`.
- There is no `tailwind.config.js`: the palette (§14) lives in `app/globals.css`, which is Tailwind v4 practice and consistent with §3.

## Libraries added (and why)

None. Nothing in this PR needed a dependency; the repository's §3 stack is unchanged.

## Questions for the reviewer

- Should `/dev/ui` be reachable from the demo bar? Today it is URL-only, so a reviewer has to be told it exists.

## Known gaps

- No screenshots for any phase.
- Nothing measurable asserts the 390 px rule; the phone project is the only guard.
