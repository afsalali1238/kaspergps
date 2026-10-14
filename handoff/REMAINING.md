# Handoff: the remaining work

Status: **13 Oct 2026, 19:45 Dubai.**

**Read first:**
1. `BUILD_PROMPT.md` §0a: the owner's decisions D1–D13. They override older sections.
2. `handoff/UI-UPGRADE.md`: the spec and the 9/10 scorecard.
3. `handoff/agents/<agent>.md`: the scope for your chunk.
4. `HANDOFF.md` §5: the rules.

**Goal:** every scorecard row (A1–A16) at ≥ 9.

## Done and merged on `main`

| Chunk | What | PR |
| --- | --- | --- |
| A | Bug fixes | #29 |
| B1–B3 | Fonts and tokens, UI kit, top navigation | #32 #34 #33 |
| C1–C2 | FB-12 at 10:30, data consistency, `src/lib/format.ts` | #35 #36 |
| D | Test tooling: axe, no-raw-floats, usability kit | #37 |
| G1 | Alerts | #39 |
| F1 | Asset header, 2×2, End-access confirm | #38 |
| E | Fleet map, three panes | #41 |
| R | Role-first login: 8 persona cards on `/`, Log out back to `/` | #44 |

## The queue

| Chunk | Scope | Status |
| --- | --- | --- |
| **H1** | Reports + Downloads as one screen (scorecard A6) | **merged** (#46) |
| **F2** | Asset page: History = playback, Engine & fuel tank and drop card, Share dialog (A4) | not started |
| **G2** | New Fuel screen and Maintenance schedule table (A7, A8) | not started |
| **I** | Kasper console (A10) | not started |
| **H2** | Cost & ROI, Billing, Certificates, Settings (A9, A10). **After H1.** | **merged** (#49) |
| **J1 → J2 → J3** | Phone + Arabic, demo tools, strict gates + scorecard + final handoff. **After every PR above.** | not started |

H1, F2, G2 and I don't share files, so they can be built in parallel.

**Run builders in the cloud, not on the owner's PC.** The PC's Linux VM has 2 cores and 3 GB; four parallel builds there filled 4 GB of disk and never finished.

## How every chunk is delivered

1. **Branch:** `night-<chunk>` from the latest `origin/main`. One chunk per PR.
2. **Verify** (run each and check its exit code):
   - typecheck, lint, build;
   - `TZ=UTC npm test` and `TZ=Asia/Dubai npm test`;
   - `next start` on :3000, then the e2e specs the chunk touches plus `a11y.spec.ts` and `no-raw-floats.spec.ts`. CI runs the full suite.
3. **Look at the changed screens** at 1440 and 390 px. Screenshots go to `reviews/screenshots/<chunk>/`, which is gitignored: generate them, look at them, don't commit them.
4. **Self-check goes in the PR description**, not in a file. It covers:
   - what changed;
   - the commands and exit codes;
   - the scorecard rows moved, with evidence;
   - decisions taken;
   - the checklist below, PASS or FAIL for each item.
5. **Update the chunk's row** in `handoff/agents/PROGRESS.md`. Push, open the PR, and **don't merge your own PR**. The supervisor merges.

### Merge checklist (the supervisor checks every item)

- **CI:** all 4 jobs are green on the head commit (`gh api repos/afsalali1238/kaspergps/commits/<sha>/check-runs`).
- **Tests:** none weakened or deleted (`git diff origin/main -- '*.test.ts' '*.test.tsx' '*.spec.ts' | grep -E '^-\s*(await )?expect'`; read each one).
- **Nav checks:** a check that a nav link is absent calls `openMore()` first.
- **Access:** unchanged or narrower. New panels and lists are role-scoped, with tests for Mark (site user), Lina (renter) and Fatima (client).
- **Code rules:**
  - screens import the server only through `@/server/api`;
  - no `role ===` outside `capabilities.ts`, `capability-reasons.ts` and `seed/`;
  - time comes only from `clock.ts`;
  - no raw hex.
- **Numbers:** every one has a source or reads "Not measured"; no raw floats; nothing invented (no savings, ROI multiples or forecasts).
- **Phone (390 px):** no sideways scroll; tap targets ≥ 40 px.
- **Arabic:** every new string is in `public/locales/ar.json`.
- **Pushback:** claiming a check you didn't run, mixing two chunks, or pushing to `main` gets the PR sent back.

If a check times out only in CI, read the check-run annotations: `gh api repos/afsalali1238/kaspergps/check-runs/<id>/annotations`. Job logs are blocked in the sandbox.

---

## Builder prompts

### Common header (put this before every chunk prompt)
> You're building one chunk of Kasper GPS in `afsalali1238/kaspergps` (Next.js 16).
>
> **Read first:**
> 1. `AGENTS.md`. This Next.js has breaking changes; read `node_modules/next/dist/docs/` before writing Next code.
> 2. `BUILD_PROMPT.md` §0a.
> 3. `handoff/REMAINING.md`: your chunk, "How every chunk is delivered" and the merge checklist.
> 4. `handoff/UI-UPGRADE.md`.
> 5. `HANDOFF.md` §5.
>
> **Branch:** `git fetch origin '+refs/heads/*:refs/remotes/origin/*'`, then `git checkout -b night-<chunk> origin/main`, then `npm ci`. Use `gh api` (REST); GraphQL may be blocked.
>
> **Build rules:**
> - Stay within your file ownership (`handoff/agents/README.md`).
> - Use the components in `src/components/ui/` and `src/lib/format.ts` for every number.
> - Add Arabic for every new string.
>
> **Never:**
> - weaken a test;
> - widen access;
> - invent a number;
> - add raw hex;
> - reintroduce a sidebar, phase labels or a people picker.
>
> **Deliver:** follow "How every chunk is delivered", and put the self-check in the PR description. Reply with the PR number, the checks you ran, and anything that needs the owner.

### H1: Reports + Downloads (merged, #46)
> Done. The report card opens the run panel at step 2 (type already picked); the panel is a labelled modal dialog; `/app/downloads` redirects to `/app/reports#recent`.
> **Carried to H2:** done in H2 (`startOfDubaiMonth` in `clock.ts`, tested under UTC and Dubai).

### F2: asset page part 2
> Chunk **F2**, `handoff/agents/F-asset-page.md` items 3–5, scorecard A4.
>
> - **History = playback:** a trip list, the route with coloured segments, a scrubber with the event pins, and a timeline of **state changes only** (moving, idle, ignition off, gap). The readings table goes behind "Show readings".
> - **Engine & fuel:** a tank bar at the top, and a fuel-drop card (shaded window, litres lost, engine off, a link to the alert).
> - **Share tracking link dialog:** a phone-frame preview beside the link actions. Keep `?panel=share` opening it; the map panel links there.
> - Map `PLAYBACK_EVENT_COLORS` / `PLAYBACK_STATE_COLORS` onto status tokens.
> - **Renters:** nothing before `historyFloor`.
> - **Specs to keep green:** `playback-motion`, `j6-proof`, `f1-asset-header`, S1–S12, S23–S30.

### G2: Fuel screen and Maintenance
> Chunk **G2**, `handoff/agents/G-alerts-fuel-maintenance.md` items 2–3, scorecard A7 and A8.
>
> **New `/app/fuel`:**
> - per-asset fuel cards: tank bar, today's use with source, 7-day trend, status;
> - a theft/drop card with the drop shaded; refuel ▲ and drop ▼ markers.
> - Add a **Fuel** nav item in `src/components/layout/AppShell.tsx`, after Reports, with `featureKey: 'fuel.level'` (D5). Update the TopTabs order tests and `j5-nav-widths` if needed.
> - Reuse `fuelWeekFor`, `fuelToday` and `fleetPanelFor(...).fuel`. Renters respect `historyFloor`; `src/server/fleet-panel.test.ts` is the pattern.
>
> **Maintenance:**
> - a KPI strip;
> - a schedule `Table` (asset, plan, current, due, remaining, approximate date, state) with a Board toggle.
> - Numbers come from `planSnapshot`. Extend `src/server/consistency.test.ts` so Maintenance, alerts and the asset page agree.
>
> **Role tests:** Omar (no Fuel tab), Lina (no owner maintenance), Mark (one site).

### I: Kasper console
> Chunk **I**, `handoff/agents/I-console.md`, scorecard A10.
>
> - **Overview:** a KPI strip (tenants, assets, trackers in stock and fitted, active bookings, open requests) and tables. Fix the yellow-on-white "Manage →" links (≈1.6:1 contrast).
> - **Assets, Trackers, CAN adapters:** `Table` with `CopyButton` on IMEI and SIM, plus a `RowMenu`.
> - **The rest:** restyle with `Table`, `Panel` and `Badge`.
> - **Role rules unchanged:** Ops has no Billing, Kasper team or Audit log, and customers get "Page not found". The console is desktop only (≥ 900 px).

### H2: money and Settings (merged, #49)
> Done: KPI strips on Cost & ROI, Billing, Certificates and Settings; Billing and Certificates row menus; Void (billing) behind a reason dialog; Deactivate/Reactivate behind ConfirmDialog; `startOfDubaiMonth` and `lastMonthPeriod` in `clock.ts`; part-month margin under 7 booked days; September certificates reseeded from `ecuHoursAt` with a guard test.

### J1: phone and Arabic (after every chunk above is merged)
> Chunk **J1**, `handoff/agents/J-phone-arabic-final.md` items 1–2, scorecard A11 and A12.
>
> **Every route at 390 × 844, the role picker included:**
> - no sideways scroll;
> - KPI strips scroll inside themselves;
> - panels become bottom sheets;
> - primary actions are full-width;
> - tap targets are ≥ 40 px.
>
> **Arabic:**
> - every key is in `ar.json`, and asset types are translated;
> - the three panes mirror, and truncation lands at the logical end;
> - numbers stay LTR;
> - alert descriptions get translated through their word templates.

### J2: demo tools
> Chunk **J2**, item 3, scorecard A15.
>
> - Add "Report a problem" and "Trigger alert" to the demo bar's More menu.
> - **⌘K** opens product search (it's unbound since R).
> - Update the demo-bar tests and `docs/demo-script.md`.

### J3: strict gates and the final pass
> Chunk **J3**, items 4–7, every scorecard row.
>
> - Make the a11y and visual jobs strict.
> - Run the usability kit and record clicks and time per task.
> - Write the scorecard in the PR description; every row must be ≥ 9.
> - `grep -rniE "dozr|KSP-0|fleetx" app src tests public` must print nothing.
> - **Update docs:**
>   - `docs/demo-script.md` and `docs/test-matrix.md`: role cards, no Phase switch, S20/S41 retired, FB-12 at +30 min;
>   - rewrite `HANDOFF.md` for the final state;
>   - delete `handoff/` once nothing is left in it.

### Supervisor prompt
> You supervise the Kasper GPS build in `afsalali1238/kaspergps`.
> 1. List open PRs: `gh api 'repos/afsalali1238/kaspergps/pulls?state=open'`.
> 2. Check each one against the merge checklist in `handoff/REMAINING.md`.
> 3. **If it passes:** rebase it on main if needed, merge it (`gh api -X PUT …/pulls/<n>/merge -f merge_method=merge`), mark it merged in `PROGRESS.md`, then delete its branch.
> 4. **If it fails:** comment exactly what's wrong on the PR.
> 5. **Order:** H1 before H2; J only after everything else is merged.
