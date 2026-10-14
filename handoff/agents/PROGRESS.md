# Progress: UI upgrade

One row per chunk. The builder updates its row in its PR; the supervisor marks it merged. What each chunk must do, and the builder prompts, are in `handoff/REMAINING.md`.

| Chunk | Status | PR |
| --- | --- | --- |
| A — bug fixes | merged | #29 |
| B1–B3 — fonts and tokens, UI kit, top navigation | merged | #32 #34 #33 |
| C1–C2 — FB-12 timing, data consistency, `format.ts` | merged | #35 #36 |
| D — test tooling | merged | #37 |
| E — fleet map, three panes | merged | #41 |
| F1 — asset header, 2×2, End-access confirm | merged | #38 |
| G1 — Alerts | merged | #39 |
| R — role-first login (D13) | merged | #44 |
| H1 — Reports + Downloads | merged | #46 |
| F2 — asset page part 2 | not started | |
| G2 — Fuel and Maintenance | not started | |
| I — Kasper console | not started | |
| H2 — money and Settings | merged | #49 |
| J1 — phone and Arabic | not started | |
| J2 — demo tools | not started | |
| J3 — strict gates, scorecard, final handoff | not started | |

## Notes that still apply
- **Helpers:**
  - `src/lib/format.ts` for every number (null reads "Not measured").
  - UI kit in `src/components/ui/`.
  - Severity comes from `alertSeverity` in `src/server/alerts-screen.ts`.
  - Fleet panel data is in `src/server/fleet-panel.ts`.
- **E2E helpers** (`tests/e2e/helpers.ts`):
  - `signIn(page, email)` goes through `/dev/sign-in`.
  - `pickRole(page, id)` clicks a role card.
  - `navLink()` and `openMore()` reach tabs under the top nav's More.
  - `openDemoMore()` opens the demo bar's More (Scenarios, Tools).
- **Gates:**
  - `a11y.spec.ts` fails on a new critical axe violation versus `reviews/a11y-baseline.md`. Lower the counts there when you fix one; never raise them.
  - `no-raw-floats.spec.ts` fails on long decimals.
- **Unit tests:** the timeout is 30 s, because simulation-heavy tests exceed 5 s under coverage on CI.
- **Open owner findings** (`HANDOFF.md` §7): ⌘K was unbound by R; J2 makes it product search.
- **Row actions:** tables use the kit `Table` with `rowMenu`; e2e reaches them with `rowAction(row, name)` from `helpers.ts`. `Table` takes `rowAttrs` for `data-*` hooks.
