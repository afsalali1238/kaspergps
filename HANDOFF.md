# Kasper GPS — Project Handoff

Status as of **13 Oct 2026, 12:30 Dubai**. This replaces the 12 Oct handoff (still in git history).

- **Spec (PRD):** `BUILD_PROMPT.md`. Its **§0a Amendments** (owner decisions D1–D12) override the older sections.
- **UI upgrade spec and 9/10 scorecard:** `handoff/UI-UPGRADE.md`.
- **Build plan:** `handoff/agents/` (agents A–J); `handoff/BUILDER.md` §1 (owner decisions) and §4–§7 (review loop, PR checklist, sandbox notes).
- **Live status:** `handoff/agents/PROGRESS.md` and GitHub issue #30 (night log).
- **What's left and how to finish it:** `handoff/REMAINING.md`.

## 1. Where things stand

Production: `main` = `811979a`, deployed to kaspergps.vercel.app. CI is green on main.

| Step | What | State | PR |
| --- | --- | --- | --- |
| A | Bug fixes (billing default tab, no self-deactivate, no phase labels, one certificate Actions cell) | merged | #29 |
| B1 | Self-hosted fonts, tokens, AA secondary text, type scale, `brand.ts`, `colors.ts` | merged | #32 |
| B2 | UI kit: KpiStrip, MetricTile, Badge, StatusDot, Table + RowMenu, Panel, SideSheet, BottomSheet, SegmentedTabs, ProgressBar, Sparkline, ConfirmDialog, CopyButton | merged | #34 |
| B3 | Top navigation (no sidebar), demo bar restyle, Lucide, no raw hex, LIVE pill | merged | #33 |
| C1 | FB-12 arrives 10:30 with ETA ±5 min; plant shuffles aren't trips | merged | #35 |
| C2 | Engine hours vary by day; last month varies; one number one source (`consistency.test.ts`); `src/lib/format.ts` | merged | #36 |
| D | Test tooling: axe (report mode), no-raw-floats, visual spec (off), usability kit, perf check, coverage excludes `app/**` | **PR open, CI green** | #37 |
| F1 | Asset header, Overview 2×2 grid, End-access confirm dialog | **PR open, CI green**, self-check present | #38 |
| G1 | Alerts: KPI strip, severity groups, Acknowledge all, rules panel | **PR open, CI green**, self-check present | #39 |
| E | Fleet map, three panes | **built locally, not pushed** (see §2) | — |
| F2, G2, H1, H2, I, J1–J3 | — | not started (drafts of H1 and F2 exist locally, §2) | — |

The scheduled hourly runs build and open green PRs but **can't merge** (the sandbox refuses "merge without review"). The owner or supervisor merges.

## 2. The local clone (`Desktop\antigravity\Gpsarena\kaspergps`)

Checked 13 Oct 12:20. It has diverged from GitHub:

- Local `main` is **2 commits ahead** of `origin/main`: `7d58413` (E claim) and `6acc248` (E, three-pane fleet map, 24 files). These were committed straight onto main and never pushed. Local `night-e` has those plus `d21471b` (a lint fix).
  - **E has passed:** typecheck, lint, the new unit tests (`fleet-panel.test.ts`, 10 tests) and the map e2e set in the cloud sandbox. **Still to do:** the full unit suite on the final commit, CI, and `reviews/E-self-check.md`.
- **Uncommitted** (10:55–11:56):
  - `app/app/reports/page.tsx`: a KPI strip and a "Recently generated" table. This is H1 scope.
  - `next.config.ts`: redirects `/app/downloads` to `/app/reports#recent` (H1).
  - `src/components/history/HistoryPanel.tsx`: an event timeline above a "Show readings" disclosure. This is F2 scope.
  - Three E screenshots re-captured.
  - Every other file `git status` lists differs only by Windows line endings (CRLF). There's no real change.
- **Problems in those drafts** (fix before they ship; detail in `handoff/REMAINING.md` H1/F2):
  - **Reports:**
    - `runs` is memoised on `[session, session]`, so the table doesn't refresh after Download again or Delete.
    - `runDueSchedules()` runs inside `useMemo` (a side effect during render).
    - "Generated this month" counts every run, not this month's: the number is wrong. "Next scheduled: See tab" is filler.
    - The table has 7 headers and 6 cells.
    - The KPI words are hard-coded in English.
    - There is no `#recent` anchor for the redirect.
    - It uses a plain `<table>`, not the `Table` component.
  - **History:**
    - The timeline adds a row for *every* moving reading, so it isn't a state-change list. Its de-dupe compares labels that include the speed, so it never removes anything.
    - `rows.indexOf` inside the loop is O(n²).
    - The strings are hard-coded English.
    - It uses a hand-drawn chevron where the rest of the app uses Lucide.
- `Gpsarena\_review\` holds an older draft of E and H1, superseded by `6acc248`.
- `h2-correctness-fixes` and `stash@{0}` (12 Oct) are obsolete.

## 3. How to run it

```bash
npm ci
npm run dev                       # http://localhost:3000
npm test                          # unit tests (run also with TZ=Asia/Dubai)
npx playwright install chromium   # once
npx playwright test               # desktop + phone e2e (CI uses next build && next start)
```

Sign in role-first (Kasper Admin, Kasper Ops, Tenant Admin, Site User, Link viewer), then pick a person. Any non-empty password works, for example `sara@kasper.ae`, `omar@alnoor.ae`, `khalid@emiratesearth.ae` or `mark@gulflift.ae`. The demo bar's **View as** switches users. There's no Phase switch and no Show hidden.

In a sandbox without the Playwright CDN, point `PW_CHROMIUM_PATH` at a local Chromium. The cloud sandbox has one at `/opt/pw-browsers`. Keep `next start` (not `dev`) on :3000 before running Playwright. On the owner's PC the Linux test VM has no Playwright browser, so e2e runs in CI.

## 4. CI

`.github/workflows/ci.yml`:
- **checks:** typecheck, lint, unit tests, and an 85 % line-coverage floor (D excludes `app/**`).
- **e2e:** three Playwright shards (desktop + phone).
- **D adds** report-only axe and visual jobs.

Check runs with `gh api repos/afsalali1238/kaspergps/commits/<sha>/check-runs`; GraphQL (`gh pr checks`) is blocked in the sandbox.

## 5. Rules every change keeps

- Never weaken or delete a test assertion. If data legitimately changes, replace the exact value with an equally strict one derived from its source.
- **Access:**
  - Never widen access.
  - Screens import the server only through `src/server/api`.
  - No `role ===` outside `capabilities.ts`, `capability-reasons.ts` and `seed/`.
  - A renter never sees the owner's yard, maintenance, or anything before their rental started (`historyFloor`).
- **Numbers:**
  - Every number has a source or reads "Not measured".
  - No raw floats; use `src/lib/format.ts`.
  - No invented savings, ROI multiples or forecasts.
- **Other code rules:**
  - Time only from `src/lib/clock.ts`.
  - Escape user text in HTML strings.
  - No raw hex: use tokens or `src/config/colors.ts`.
  - "Kasper", never "Dozr".
- **E2E nav checks:** a tab may sit under **More**. Use `navLink()` / `openMore()` from `tests/e2e/helpers.ts`, and call `openMore()` before asserting that a nav link is absent.

## 6. Production notes

- **Data:** the data layer is `src/server/db.ts`, a Zustand store persisted to `localStorage` (`kasper.db.v1`). In production it is replaced by a database (Postgres with Prisma or Drizzle).
- **Telemetry:** the Teltonika FMC130 sends Codec 8 / 8E frames over TCP or UDP to an ingestion server (Traccar, Kasper's own listener, or AWS IoT Core in front of it). That replaces `src/server/telemetry/simulator.ts`.
- **API:** every `api.ts` function becomes a server endpoint that checks `can`. `src/server/api-gate.test.ts` keeps the list honest.
- **Prototype-only parts:** auth replaces the prototype `signIn`, and the demo bar, `/dev/*` and the scenarios are dropped.

## 7. Open findings for the owner

1. **Certificates "Last month"** reads **May 2026** at the October anchor: `lastMonthPeriod()` parses en-AE dates as month/day. September for EX-04 can't be certified (usability task O5 fails). This is H2's to fix.
2. **⌘K** opens the demo bar's View as, not product search. Decide which wins (suggested: product search; View as moves to Ctrl+Shift+K). This is J2's.
3. **Seeded September certificates** (EX-04 450 h, WL-03 610 h) don't match the simulated meter. Reseed them from `ecuHoursAt` (C follow-up, done in H2).
4. **EX-11's September margin** reads −2,670.9 % (one booked day). H2 decides the display (suggested: "n/a — part month" below 7 booked days).
5. **G1 decisions to confirm:**
   - severities for unlisted types;
   - rule defaults (critical → Instant, the rest → In-app only);
   - the rules panel is hidden from Kasper staff.
6. **Console Overview "Manage →"** is yellow on white (≈1.6:1 contrast). This is I's.
7. **Vercel production deploys** stalled on 12 Oct and recovered by the 13 Oct merges. Keep an eye on them.

## 8. Files to know

- `src/server/fleet-panel.ts` (E): the map panel, KPI strip and event tabs, all role-scoped.
- `src/server/alerts-screen.ts` (G1): severities, groups and bulk acknowledge.
- `src/lib/format.ts`: the only number formatters. `src/server/consistency.test.ts`: no two screens disagree.
- `src/components/ui/`: the B2 kit. `src/components/layout/TopTabs.tsx`: the top nav.
- `src/server/telemetry/simulator.ts`, `ecu.ts`, `fuel.ts`: the simulated readings.
- `tests/e2e/helpers.ts`: `demo()`, `navLink()`, `openMore()`, the tile stub (OSM + CARTO).
- `reviews/<chunk>-self-check.md`, `reviews/screenshots/<chunk>/`: evidence per chunk.
- `docs/demo-script.md`, `docs/test-matrix.md`: the walkthrough and the scenario-to-test map. Both still mention the Phase switch; J3 updates them.
