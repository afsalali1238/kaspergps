# Handoff: the remaining work (13 Oct 2026, 12:30 Dubai)

For whoever builds next (a model, an agent or the hourly scheduled task) and for the supervisor who reviews and merges. Read first:
1. `BUILD_PROMPT.md` §0a (owner decisions D1–D12);
2. `handoff/BUILDER.md` §1, §4–§7;
3. `handoff/UI-UPGRADE.md` (the spec and the 9/10 scorecard);
4. the agent file for your chunk in `handoff/agents/`;
5. `HANDOFF.md` §5 (rules).

**Goal:** every row of the scorecard (`UI-UPGRADE.md` §2, A1–A16) at **≥ 9**, with evidence in `reviews/U8-scorecard.md`.

---

## Step 0: tidy up first (supervisor or owner, about 30 min)

Do these in order. Nothing else starts until 0.1–0.4 are done.

**0.1 Stop anything that edits the local clone**, then park the local drafts:
```bash
cd Desktop/antigravity/Gpsarena/kaspergps
git config core.autocrlf true          # the CRLF-only "changes" disappear
git stash push -m "local H1+F2 drafts 13 Oct" -- app/app/reports/page.tsx next.config.ts src/components/history/HistoryPanel.tsx
git checkout -- .                      # drop the line-ending noise and the re-captured E screenshots
git branch -f night-e d21471b          # night-e keeps the E work
git checkout main && git reset --hard origin/main
```

**0.2 Merge the green PRs, in this order:**
1. **#37 D**, then **#39 G1**. Rebase each on main before merging, because both edit `PROGRESS.md`; keep both rows.
2. **#38 F1** after them. F1 has a self-check; also check that its screenshots exist. F1 and E both edit `app/app/assets/[id]/page.tsx` and `tests/e2e/S1-S3.spec.ts`, so merge F1 before E and rebase E onto it.

**0.3 Finish E (`night-e`):**
- Rebase onto main (after D, G1 and F1). Expect conflicts in:
  - `tests/e2e/helpers.ts`: D owns it. Keep D's version and re-add E's one change, the CARTO host in `TILE_HOST`.
  - `public/locales/ar.json`: keep every namespace.
  - `src/server/api.ts`: append-only blocks; keep both.
  - `app/app/assets/[id]/page.tsx`: keep F1's version and re-add E's `?panel=share` deep link.
- **Severity collision.** E exports its own `alertSeverity`/`Severity` from `fleet-panel.ts`, and G1 exports `alertSeverity` from `alerts-screen.ts`. With both, `api.ts` has a duplicate export and the typecheck fails.
  - Delete E's copy and import G1's into `fleet-panel.ts`.
  - Map G1's `info` to the warning column of the KPI strip, or add an info count.
  - The rules differ (G1: towing is a warning, and `maintenance_overdue` follows G1's table), so update `fleet-panel.test.ts`'s severity test to G1's table. That isn't weakening it: the table it checks has one owner now.
- Re-run:
  - typecheck, lint and build;
  - unit tests in both time zones;
  - `tests/e2e/e-fleet-map.spec.ts` plus the map specs (`h4-map-labels`, `S1-S3`, `S4-S8`, `S9-S12`, `S23-S30`, `phone-layout`, `map-loads`).
- Write `reviews/E-self-check.md`: scorecard row A3 with the screenshots in `reviews/screenshots/E/` (Khalid, Lina, Omar at 1440/1280/1024/390). Mark E built in `PROGRESS.md`. Push, open the PR, merge when CI is green.
- **Known E items to verify in the self-check:**
  - **History floor:** a renter's fuel sparkline and fuel events start at its rental start (EX-04 for Lina from 4 Oct).
  - **Overlay layering:** at 1024–1279 px the panel overlays the map and sits above the Leaflet controls (`z-[1100]`).
  - **Tier 1 row bar:** Tier 1 rows show today's ignition hours (Estimated) as the bar.

**0.4 Update issue #30's queue:** tick D, E, F1 and G1, and note the open PRs, so the hourly runs pick the right next chunk.

---

## The queue

One chunk per PR, from `origin/main`, on branch `night-<chunk>`. Each chunk is done when:
- it has a self-check, screenshots at 1440 and 390 px, and its `PROGRESS.md` row;
- CI is green;
- its scorecard rows are at ≥ 9 with evidence.

They can run in parallel only where the files don't overlap (see the ownership table in `handoff/agents/README.md`).

### F2: asset page part 2 (`F-asset-page.md` items 3–5; scorecard A4)
- **History is playback** (§7.3, fleetx layout):
  - a trip list on the left;
  - the route with coloured segments;
  - a scrubber with the event pins (J6);
  - the timeline of **state changes**: moving, idle, ignition off, gaps.
- The readings table goes behind a "Show readings" disclosure.
- **The parked draft** (`git stash list`, "local H1+F2 drafts") is a starting point only. Fix it before it ships:
  - emit a row only when the state changes (moving → idle → off → gap), not one per reading;
  - track the previous state in the loop, with no `rows.indexOf`;
  - use `t()` keys under `asset_page`, a Lucide `ChevronDown`, and `formatSpeed`/`formatNumber`.
- **Engine & fuel:** a tank bar at the top, and a fuel-drop card (shaded window, litres lost, engine off, a link to the alert) when a drop is in range.
- **Share tracking link dialog** (§8): a phone-frame preview beside the link actions, plus copy, expiry and job.
  - E's map panel links to `/app/assets/<id>?panel=share`; keep that deep link opening the dialog.
- Map `PLAYBACK_EVENT_COLORS` / `PLAYBACK_STATE_COLORS` onto the status tokens.

### G2: Fuel screen and Maintenance (`G-alerts-fuel-maintenance.md` items 2–3; scorecard A7, A8)
- **New `/app/fuel`**, in the nav only when the visible assets have `fuel.level` (D5):
  - per-asset fuel cards (tank bar, today's use with source, a 7-day trend, status);
  - a theft/drop card with the drop shaded;
  - refuel ▲ and drop ▼ markers.
  - Add the **Fuel** tab to `navItems` in `AppShell.tsx` after Reports, gated by `featureKey: 'fuel.level'`. Update `TopTabs` unit tests and `j5-nav-widths` if the order changes.
- **Maintenance:**
  - a KPI strip;
  - a schedule `Table` (asset, plan, current, due, remaining, approximate date, state) with a Board toggle.
  - Numbers must agree with alerts and the asset page: use `planSnapshot`, and extend `consistency.test.ts`.
- **Reuse** `fuelWeekFor`, `fuelToday` and the fleet panel's fuel data. Respect `historyFloor` for renters (E's test is the pattern).

### H1: Reports + Downloads, one screen (`H-reports-money.md` item 1; scorecard A6)
- **Layout:**
  - report cards with cadence badges;
  - a 3-step run panel (what, scope, period and format);
  - a **"Recently generated"** `Table` with `id="recent"`;
  - Download again re-checks permission now; Delete.
  - `/app/downloads` redirects to `/app/reports#recent` (`next.config.ts`), and the Downloads nav item goes away.
  - The scheduler's runs (`runDueSchedules`) show there too.
- **The parked draft** is a starting point only. Fix it before it ships:
  - **State:** recompute `runs` after Download again and Delete (a version counter in the deps, not `[session, session]`).
  - **Side effect:** call `runDueSchedules()` in a `useEffect` on clock change, not in `useMemo`.
  - **KPI strip:** use real numbers only. "Generated this month" filters by month, and "Next scheduled" shows the next schedule's time from `schedulesFor`, or the cell is dropped. No filler.
  - **Markup:** headers must match the cells. Use `Table` with numeric columns, `RowMenu` for row actions, and `t()` keys under `reports_page`.
- **Existing tests:**
  - Keep `billingTabs()` and `aria-current`.
  - Fix `reports.none_available` ("for the current phase"; phases are gone).
  - Migrate the Downloads e2e specs (S30, `h4-*`) to the new location by locators only.

### H2: Cost & ROI, Billing, Certificates, Settings (`H-reports-money.md` items 2–5; scorecard A9, A10 for Settings)
- KPI strips on each screen.
- **Cost & ROI:** show only real revenue, cost and margin, with sources. Margin on a part month: decide the display (owner finding #4; suggested "n/a — part month" below 7 booked days).
- **Billing:** an invoice `Table` with status badges and a `RowMenu` (Record payment, Download PDF). It opens on the first tab with content.
- **Certificates:**
  - a `Table` with View plus a `RowMenu` (Void, Reissue, Verify link);
  - **fix `lastMonthPeriod()`** (owner finding #1: it reads May at the October anchor);
  - the duplicated "Voided" in the detail modal needs a `voided_at` key;
  - reseed the September MUCs from `ecuHoursAt` (finding #3).
- **Settings:**
  - dense tables, with one primary action and a `RowMenu`;
  - Deactivate/Reactivate behind `ConfirmDialog`;
  - no self-deactivate (A's fix stays).

### I: Kasper console (`I-console.md`; scorecard A10)
- **Overview:** a KPI strip (tenants, assets, trackers in stock and fitted, active bookings, open requests) plus tables. Fix the yellow-on-white "Manage →" links.
- **Assets, Trackers, CAN adapters:** `Table` with `CopyButton` on IMEI and SIM, and `RowMenu`.
- **The rest:** restyle with `Table`, `Panel` and `Badge`.
- **Role rules unchanged:** Ops has no Billing, Kasper team or Audit log. Negative nav checks call `openMore()` first.

### J1: phone and Arabic (`J-phone-arabic-final.md` items 1–2; scorecard A11, A12)
- **Every route at 390 × 844:**
  - no sideways scroll;
  - KPI strips scroll inside themselves;
  - panels become bottom sheets;
  - primary actions are full-width;
  - tap targets are ≥ 40 px.
- **Arabic and RTL:**
  - every new key is in `ar.json`, and asset types are translated;
  - the three panes mirror, and truncation lands at the logical end;
  - numbers stay LTR;
  - alert descriptions are still English in Arabic. Translate them via the alert word templates.

### J2: demo tools (`J-phone-arabic-final.md` item 3; scorecard A15)
- "Start session as …", "Report a problem", "Trigger alert".
- **⌘K** (owner finding #2): make it product search, and move View as to Ctrl+Shift+K. Update the demo-bar tests and `docs/demo-script.md`.

### J3: strict gates and the final pass (items 4–7; every row)
- Turn D's report-only axe and visual jobs strict.
- Run the usability kit (`reviews/usability/`) and record clicks and time against the targets (A14).
- Write `reviews/U8-scorecard.md`. Every row must be ≥ 9; if one isn't, list the gap and stop.
- **Remove fleetx** (`UI-UPGRADE.md` §3.4): `grep -rniE "dozr|KSP-0|fleetx" app src tests public` must print nothing.
- Update `docs/demo-script.md` and `docs/test-matrix.md`: no Phase switch, S20/S41 retired, FB-12 at +30 min.
- Rewrite `HANDOFF.md` for the final state.

---

## Order and parallelism

```
Step 0 (tidy, merge D → G1 → F1 → E)
   ├─ F2  (asset page)        ┐
   ├─ G2  (fuel, maintenance) │  can run in parallel: separate files
   ├─ H1 → H2 (reports, money)│  H2 after H1 (same owner, same files)
   └─ I   (console)           ┘
J1 → J2 → J3   (after every Wave 2 PR is merged)
```

**Shared-file rules:**
- `ar.json` gets one namespace per agent.
- `api.ts` blocks are append-only, under `// ── Agent X ──`.
- `AppShell.tsx` belongs to B. G2 may add only the Fuel entry.
- `tests/e2e/helpers.ts` belongs to D. Others add helpers only by appending.

**Estimated effort** (one capable model, with review):

| Chunk | Hours |
| --- | --- |
| Step 0 | 0.5 |
| F2 | 2–3 |
| G2 | 2–3 |
| H1 | 1.5 |
| H2 | 2–3 |
| I | 2 |
| J1 | 2 |
| J2 | 1 |
| J3 | 2 |

## Merge gate (the supervisor checks, every PR)

1. **CI:** all 4 jobs are green on the head commit.
2. **Self-check:** `reviews/<chunk>-self-check.md` has PASS lines for `BUILDER.md` §5 and screenshots at 1440 and 390 px, and the reviewer has looked at them.
3. **Tests:**
   - no assertion was weakened or removed (`git diff origin/main -- '*.test.ts' '*.spec.ts' | grep '^-\s*expect'` and read each one);
   - negative nav checks call `openMore()`.
4. **Access:** none widened. Role tests cover Mark, Lina, Deepa and Fatima where the chunk shows assets.
5. **Code rules:** no new raw hex, raw floats, `role ===`, `Date.now()` or server imports outside `api`.
6. **Progress:** `PROGRESS.md` is updated and issue #30 is ticked.

## Prompt for a builder (paste as is)

> You're building Kasper GPS chunk **<CHUNK>** in `afsalali1238/kaspergps`. Read `AGENTS.md` (this Next.js has breaking changes; read `node_modules/next/dist/docs/` before Next code), then `BUILD_PROMPT.md` §0a, `handoff/REMAINING.md` (your chunk's section and the merge gate), `handoff/agents/<agent file>`, `handoff/UI-UPGRADE.md` and `HANDOFF.md` §5. Branch `night-<chunk>` from `origin/main`.
>
> Build only your chunk, within your file ownership. Use the B2 components in `src/components/ui/` and `src/lib/format.ts` for every number. Add Arabic for every new string.
>
> Then run: typecheck, lint, build, unit tests in UTC and Asia/Dubai, and the e2e specs your chunk touches. Capture screenshots at 1440 and 390 px and look at them. Write `reviews/<chunk>-self-check.md` and update `handoff/agents/PROGRESS.md`. Push and open a PR. Don't merge your own PR.
>
> Never weaken a test, widen access, invent a number, or reintroduce a left sidebar or phase labels.
