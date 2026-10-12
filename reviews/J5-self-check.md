# J5 self-check: tenant navigation at every width

## Scope (provisional)

The J5 scope was not in any file in the repo. The candidate list was the screen gaps in `HANDOFF.md` §2. This phase takes one of them: **P4**, where tenant customer nav items (Certificates, Billing, Maintenance, Cost & ROI) might drop out at some widths. It was not re-verified before. Other gaps in §2 are not in J5.

## What was checked

`tests/e2e/j5-nav-widths.spec.ts` signs in two tenant admins at phase "Later" and checks widths 390, 768, 1024, 1280 and 1440 px:

- Below 1024 px: the "Open menu" sheet lists each late-phase item the user may see.
- From 1024 px: the left nav lists each item, and each item sits inside the viewport.
- Omar (Al Noor, Tier 1 fleet): Billing, Maintenance and Cost & ROI are shown. Certificates is absent at every width. This is correct: MUC needs a Tier 3 asset with ECU hours (§5, §11.16).
- Khalid (Emirates, Tier 3): all four items are shown at every width.

## Result

- P4 does not reproduce. No item drops out at the five widths tested.
- The first version of the spec wrongly expected Certificates for Omar. The check was corrected to the per-user expectation. The app behaviour was not changed.

## Gate on the merged branch

The branch was merged with the remote `fb99974` (another J5 track: "Sales view cards" and PR #22 "j5-demo-bar") and with main `49dfa62`. Main removed the Phase switch, so the spec no longer passes `phase`; the default phase is now `later`.


- `npm ci`: 0
- `npm run typecheck`: 0
- `npm run lint`: 0
- `npm run build`: 0
- `npm test` under `TZ=UTC`: 0 (817 passed, 5 todo)
- `npm test` under `TZ=Asia/Dubai`: 0 (817 passed, 5 todo)
- `npx playwright test` desktop + phone (CI=1): 0, 343 passed, 177 skipped (desktop-only tests skip on phone; the width spec skips on phone).

## Open-item decisions (J4 list)

*(History, from the nav-width PR. All five are resolved in the J5 items 1–4 section at the end of this file.)*

- **EX-11 power cut:** seed text now says Ras Al Khor Yard (was Al Quoz Yard). The alert is still a todo: the readings show voltage on, so no power-cut event is produced.
- **FB-12 over-speed:** resolved on merge. 84 km/h is under the 90 km/h truck limit, so that text could not be an over-speed. The readings now carry a planned 96 km/h run on 4 Oct 07:40–07:42 (like WT-07), the alert points at it, and `alerts-truthful.test.ts` checks it.
- **PU-51 idle:** unchanged. The alert is still a todo because the readings show the ignition off.
- **LB-05 after-hours exit from Al Quoz Yard:** unchanged, stays a todo. Spec conflict: LB-05's home is DIP, but the fence belongs to Emirates' Al Quoz Yard. Needs a spec decision.
- **TP-21 harsh driving:** unchanged, stays a todo. Readings have no accelerometer events.

## Open items

- Scope: this check covers the nav at every width only. The rest of J5 in `HANDOFF-2026-10-12.md` (one-row phone demo bar, Scenarios menu, Sales view card placement) shipped in PR #22; J5 items 1–4 (public tracking map, Features panel, Engine & fuel, map layout) follow in the section below.
- J4 open items still open: none. See "J5 items 1–4 and the four unbacked alerts" below: the four seeded alerts now have readings behind them and are real tests (no `it.todo` is left in `src/`).

Phase J5 (nav widths) is ready for review.

---

# J5 items 1–4 and the four unbacked alerts

The nav-width track above merged as PR #23. This section is the rest of the J5 list from the
2026-10-12 handoff, plus J6.6 (Arabic keys for the new copy).

## What was built

| Item | Where | What it does |
| --- | --- | --- |
| J5.1 public tracking page | `app/t/[token]/page.tsx` | Leaflet map with one marker for the live link, re-read every 30 s, ETA line kept. A revoked or unknown token renders one sentence, `[data-testid="tracking-inactive"]`, and no asset, map or position (S13, S14, S29). |
| J5.2 Features panel | `src/components/demo/FeaturesPanel.tsx`, `src/server/capability-catalog.ts` | Opens from the demo bar's `Features` button: who you are (name, company, role, sites, one line on what the role is for), capabilities in the §10.2 groups with ✓/✕ and a plain-words scope, every ✕ with its reason from `capability-reasons.ts`, the hardware in view (tier sentence + each §6.3 feature ✓/✕) and the "Right now" counts. Names are words ("View telemetry"), never capability ids. |
| J5.3 Engine & fuel tab | `src/components/assets/EngineFuelPanel.tsx`, `src/server/utilisation.ts` | Engine hours with the source that measured them (ECU / ECU · partial / Estimated), RPM, coolant, load, the 7-day fuel chart with refuel ▲ and drop ▼ markers, fuel used per day, AdBlue or "Not measured", fault codes in plain words. |
| J5.4 map layout | `app/app/page.tsx` | Desktop: filters above, list (22 rem column) beside the map, first asset on screen without scrolling at 1440×900. Phone: `Map \| List` tabs under the KPIs, default List; the asset-code badge never wraps (`min-w-8`, `whitespace-nowrap`). |

## The four seeded alerts the readings did not back

`src/server/seed/alerts-truthful.test.ts` listed four `it.todo`s. Each is now a passing test with
the readings to match, from `src/server/telemetry/simulator.ts`:

| Alert | Readings now show |
| --- | --- |
| `al-tp21-harsh` — 3 events in the last 2 days | 3 accelerometer events on the truck's morning runs: 5 Oct 06:20 `harsh_brake`, 5 Oct 07:42 `harsh_accel`, 6 Oct 07:17 `harsh_corner` (all moving, all inside the alert's window). |
| `al-pu51-idle` — idle for 2.5 hours | Ignition on, speed 0, standing inside the Dubai Hills site from 21:00 to 23:30 on 5 Oct (145 sampled minutes), within `s-marina-dh`'s radius. |
| `al-ex11-power` — power cut at Ras Al Khor Yard | External voltage 0 V from 03:30 to 04:15 on 6 Oct (23.9–27.8 V before and after), internal battery down to 3.5–3.8 V, position still in the yard: the TP-23 pattern. |
| `al-gr01-afterhours` — moved out of Al Quoz Yard after hours | GR-01 inside the yard fence, out at 23:40 (clear of it by 23:42), engine on, back inside by 23:53 on 5 Oct. |

## Decisions taken for the owner

- **The after-hours asset is the grader (GR-01)**, not the loader WL-03: WL-03 has two tests that pin
  its day (`j2-simulated-data.test.ts` keeps all of yesterday's readings within 300 m of its yard;
  `dubai-day.test.ts` keeps its last ignition-on reading at or before 19:00). GR-01 is an Emirates
  machine homed at `s-emirates-alq` with no such constraint, and it stays "Idle" at the yard at the
  anchor. The alert was renamed `al-lb05-afterhours` → `al-gr01-afterhours`; `ge-003` is now
  `a-gr01` and `ge-005` (the return) was added. **LB-05's towing alert is untouched.**
- **The fence polygon was widened to the yard site** (25.1401/25.1331 lat, 55.2273/55.2349 lng).
  `g-em-afterhours` keeps its id, name, kind, tenant, after-hours window (19:00–06:00), exit-only
  alerting and creator — only its points changed. Reason: the old ~100 m polygon did not contain the
  machines that park at the yard (GR-01 parks at 25.1369, 55.2325; EX-07 and WL-03 park just outside
  it), so no exit event could be derived from readings without a jump in the trip. If the owner wants
  the original polygon back, the alternative is to pin GR-01's parking spot inside it from 17:30.

## Verification

- `npx tsc --noEmit` 0 · `npm run lint` 0 · `npm run build` 0.
- `TZ=UTC npx vitest run`: 0, **857 passed**, 61 files, 0 todo. `TZ=Asia/Dubai npx vitest run`: 0, 857 passed.
- `npm run test:coverage`: 0, 85.3 % statements / **88.24 % lines** (floor 85 %).
- `npx playwright test` desktop + phone: 0, see the numbers in `HANDOFF.md` §1.
- Looked at, not just measured: EX-04/GN-01/BD-02/GR-01 Engine & fuel, the Features panel for
  Omar/Lina/Mark, Omar's map at 1440 and 390 px (both tabs), the Arabic map and the hirer's tracking
  page. `tests/e2e/j5-proof.spec.ts` captures them into `reviews/screenshots/J5/` (19 PNGs, 1440 and
  390 px) and fails the capture if the page throws.

## Gates

| Check | Result |
| --- | --- |
| `npm ci` | 0 |
| `npm run typecheck` · `npm run lint` · `npm run build` | 0 · 0 · 0 |
| `npm test` (`TZ=UTC`, `TZ=Asia/Dubai`) | 0 (857 passed) · 0 (857 passed) |
| `npm run test:coverage` | 0 (88.24 % lines) |
| `npx playwright test` desktop + phone | 0, no failures |
| `tests/e2e/j5-proof.spec.ts` | 19 captures, 0 failures |

## Notes

- Arabic: only 7 keys were genuinely missing. `EngineFuelPanel.tsx` now reuses
  `asset_detail.engine.ecu_hours`, `ecu_hours_partial`, `fuel_used_per_day`, `fault_codes`, `adblue`
  and `asset_detail.utilisation.source_ignition`, and the map tabs reuse `map.map_tab`/`map.list_tab`.
  The 7 added keys are `asset_detail.engine.` `ecu_hours_partial`, `fuel_week`, `used_l`, `source`,
  `events`, `no_level_gauge`, `no_faults`. `src/i18n/i18n.test.tsx` passes (21 tests).
- Two recharts fixes were needed for the chart to be readable and stable in a screenshot: the Y axis
  needs `width={42}` with a `tickFormatter` for `%` (a `unit` collides with the tick labels), and the
  line is drawn with `isAnimationActive={false}` so a capture is not taken mid-animation.
- The map's phone tab highlight can look stale in a screenshot for the ~300 ms of `transition-colors`;
  `aria-selected` and the class list are correct. No rule in `app/globals.css` targets `[role=tab]`,
  and there is no `tailwind.config.*` (Tailwind v4 `@theme inline`).
