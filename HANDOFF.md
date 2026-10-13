# Kasper GPS — Project Handoff

Status: **13 Oct 2026, 23:30 Dubai.**

| Doc | What it is |
| --- | --- |
| `BUILD_PROMPT.md` | The spec (PRD). **§0a** lists the owner's decisions D1–D13, which override older sections. |
| `handoff/UI-UPGRADE.md` | The UI upgrade spec and the 9/10 scorecard (A1–A16). |
| `handoff/REMAINING.md` | What's left, how each chunk is delivered, the merge checklist, and paste-ready builder and supervisor prompts. |
| `handoff/agents/` | Per-chunk scopes, file ownership (`README.md`) and the progress table (`PROGRESS.md`). |
| `docs/demo-script.md`, `docs/test-matrix.md` | The walkthrough and the scenario-to-test map. They still mention the Phase switch; J3 updates them. |

## 1. Where things stand

`main` is deployed to kaspergps.vercel.app, and CI is green.

**Done:**
- the design system and top navigation;
- data fixes (FB-12 at 10:30, one number one source);
- test tooling (axe, no raw floats, usability kit);
- the Alerts page;
- the asset page header;
- the three-pane fleet map;
- the role-first login;
- Reports + Downloads as one screen (`/app/downloads` redirects to `/app/reports#recent`).

**Not started:** F2, G2, I, H2, J1–J3. See `handoff/REMAINING.md`.

## 2. How the demo works

- `/` is the **login page**: 8 persona cards plus a public tracking link. The cards are:
  - Kasper Admin and Kasper Ops;
  - Fleet owner · Tier 3 and Fleet owner · Tier 1;
  - Owner and renter · mixed tiers;
  - Renter;
  - Client · rents only;
  - Site user · one site.
- Pick a card to land in that role's home. **Log out** (or the demo bar's **Switch role**) returns to `/`.
- The demo bar has the clock (Jump to presets), Features (what this role can and can't do), Sales view, and More (Scenarios, Tools).
- There's no Phase switch, no Show hidden and no people picker.
- `/dev/sign-in` (prototype only, not linked) keeps the email form for tests and the account error messages.

## 3. How to run it

```bash
npm ci
npm run dev                       # http://localhost:3000
npm test                          # unit tests (also run with TZ=Asia/Dubai)
npx playwright install chromium   # once
npx playwright test               # desktop + phone e2e (CI uses next build && next start)
```

Keep `next start` (not `dev`) on :3000 before running Playwright locally.

## 4. CI

`.github/workflows/ci.yml` has these jobs:
- **checks:** typecheck, lint, unit tests, and an 85 % line-coverage floor (`app/**` is excluded);
- **e2e:** three Playwright shards, each running desktop and phone;
- report-only **a11y** and **visual** jobs.

Check runs with `gh api repos/afsalali1238/kaspergps/commits/<sha>/check-runs`. Read failures with `gh api …/check-runs/<id>/annotations`.

## 5. Rules every change keeps

- **Tests:** never weaken or delete an assertion. If data legitimately changes, replace the exact value with an equally strict one derived from its source.
- **Access:**
  - Never widen access.
  - Screens import the server only through `src/server/api`.
  - No `role ===` outside `capabilities.ts`, `capability-reasons.ts` and `seed/`.
  - A renter never sees the owner's yard, maintenance, or anything before the rental started (`historyFloor`).
- **Numbers:**
  - Every number has a source or reads "Not measured".
  - No raw floats; use `src/lib/format.ts`.
  - No invented savings, ROI multiples or forecasts.
- **Other code rules:**
  - Time comes only from `src/lib/clock.ts`.
  - Escape user text in HTML strings.
  - No raw hex: use tokens or `src/config/colors.ts`.
  - "Kasper", never "Dozr".
- **Repo hygiene:**
  - Screenshots (`reviews/screenshots/`) and per-chunk self-checks are not committed; the self-check goes in the PR description.
  - The only committed files under `reviews/` are `a11y-baseline.md` and `usability/`.

## 6. Production notes

- **Data:** the data layer is `src/server/db.ts`, a Zustand store persisted to `localStorage` (`kasper.db.v1`). In production it becomes a database (Postgres with Prisma or Drizzle).
- **Telemetry:** the Teltonika FMC130 sends Codec 8 / 8E over TCP or UDP to an ingestion server (Traccar, Kasper's own listener, or AWS IoT Core). That replaces `src/server/telemetry/simulator.ts`.
- **API:** every `api.ts` function becomes a server endpoint that checks `can`. `src/server/api-gate.test.ts` keeps the list honest.
- **Prototype-only parts:** real authentication replaces the persona login and `/dev/sign-in`, and the demo bar, `/dev/*` and the scenarios are dropped.

## 7. Open findings for the owner

1. **Certificates "Last month"** reads May 2026 at the October anchor (`lastMonthPeriod()` parses en-AE as month/day). September for EX-04 can't be certified. **H2 fixes it.**
2. **EX-11's September margin** reads −2,670.9 % (one booked day). **H2:** show "n/a — part month" below 7 booked days.
3. **Seeded September certificates** (EX-04, WL-03) don't match the simulated meter. **H2 reseeds them.**
4. **⌘K** is unbound since R. **J2** makes it product search.
5. **G1 defaults to confirm:**
   - unlisted alert types count as info;
   - rule defaults: critical → Instant, the rest → In-app only;
   - the rules panel is hidden from Kasper staff.

## 8. Files to know

- `src/config/personas.ts`: the 8 login cards; `personas.test.ts` keeps their tags true to the data.
- `src/server/fleet-panel.ts` (map panel, KPIs, events) and `src/server/alerts-screen.ts` (severities, groups, bulk acknowledge).
- `src/lib/format.ts`: the only number formatters. `src/server/consistency.test.ts`: no two screens disagree.
- `src/components/ui/`: the UI kit. `src/components/layout/TopTabs.tsx`: the top nav.
- `src/server/telemetry/` (`simulator.ts`, `ecu.ts`, `fuel.ts`): the simulated readings.
- `tests/e2e/helpers.ts`: `signIn`, `pickRole`, `navLink`, `openMore`, `openDemoMore`, and the tile stub.
