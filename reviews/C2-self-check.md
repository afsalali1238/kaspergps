# C2 self-check: last month varies, one number one source, format helpers

Chunk C2 of the night queue (#30): Agent C scope items 3, 4 and 5 (`handoff/agents/C-data-simulator.md`, `UI-UPGRADE.md` §9). PR #36, branch `night-c2`.

## What changed and why
- **`src/server/telemetry/ecu.ts`: engine hours vary day to day.** Before, every asset put exactly its behaviour's hours on the meter every day (9 h for site plant), so last month read 270 h / 90 % for every machine.
  - Each asset now has its own working level (0.8–1.1) and each Dubai day its own factor, seeded by code and day (deterministic). Site plant and light vehicles mostly rest on a Friday; a generator runs every day (17–23 h); a parked machine runs on about one day in six (a check or short job); trucks vary 0.6–1.4 ×.
  - `ecuHoursAt` = the §8.2 anchor value + the hours run since the anchor (prefix sums over ±800 days, cheap). **Anchor values are unchanged** (EX-04 8,420 h, BD-02 14,980 h, GN-01 2,100 h), so every seeded maintenance figure and alert still holds.
  - New `engineHoursBetween()`; Tier 1/2 `estimatedHoursAt` (`maintenance.ts`, outside C's list, a 2-line change) now uses the same day-by-day hours.
- **`src/server/telemetry/fuel.ts`:** the fuel chain's burn follows the same day factors, so the levels and litres vary with the work done. **GN-01 keeps its even burn**: its levels are scripted (§8.7: 20 % at 04:37, refuel at 07:00) and `alerts-truthful` pins them.
- **`src/server/cost.ts`**
  - Utilisation is engine hours ÷ available hours, capped at 100 %. A generator is available 24 h a day (GN-01 read **200 %** before; now 82 %).
  - Idle share is the behaviour's share ±20 % by machine (modelled, as before; still labelled ECU (ALL-CAN300) and "modelled" in the note).
  - **Revenue = rental invoices issued in the period + current bookings' days in the period that have no invoice yet** (§9.1). Daily rate × Dubai days on hire; hourly rate × max(engine hours, minimum hours × days). Cancelled bookings earn nothing; an owner-ended grant stops earning then; an invoiced booking is never counted twice. When booked days are included, the line's basis is **"Days on hire"** and the note names the bookings (e.g. CR-02 Sep: AED 60,800 invoiced + BK-1002 30 Sep, AED 3,500).
  - The six-month chart uses the same revenue.
  - Fuel cost stays hours × class-average L/h (dummy rate): "Fuel cost from measured fuel used" is a `later` feature in `features.ts`, so it isn't switched on here. Fuel now varies because the hours do.
- **`src/server/muc.ts`: a certificate's hours come from the ECU meter.** Before, billable hours were summed from the readings' ignition time (≈11.2 h a day) while the asset page showed the meter (9 h/day). For EX-04 over 1–6 Oct the MUC said 59.2 h and the meter 42.4 h: two numbers for one quantity.
  - Now each day's hours = the meter's hours that day (up to the last reading), minus the meter hours inside data gaps; gap hours = meter hours inside gaps (the ECU kept counting). Readings still decide which days have data, where the gaps are and the working/idling split. Days + gap hours = closing − opening.
- **`app/app/cost/page.tsx`** (H's file, one line): the Revenue cell's source label read a hard-coded "From invoices"; it now shows "Days on hire" when the line includes booked days, so the label stays true.
- **`src/lib/format.ts`** (new): `formatNumber`, `formatHours`, `formatKm`, `formatSpeed` (whole km/h), `formatAed`, `formatPct`, `formatVolts`. A missing value reads "Not measured". Screens are not switched (Wave 2 does that).
- **Tests**
  - New `src/server/consistency.test.ts` (8 tests): maintenance remaining (alert text = plan = asset page, also after a +1 day jump; the Alerts screen's words are the plan's); engine hours (asset page = maintenance card; a MUC issued for 1 Oct → now opens on the meter and closes within 0.2 h of the asset page; days + gaps = billable); fleet engine hours today = the sum per asset; fuel level (map row = asset page = fuel model = Engine & fuel week); GN-01 live with ignition on and engine hours today > 0.
  - `cost.test.ts`: the EX-04 September figures were 30 × 9 h constants. They are now pinned to the meter (`ecuHoursAt` delta, and the exact value 237.4 h), fuel = h × 16 × 3.05, idle within 18 % ± 20 %, utilisation = h ÷ 300. All other assertions unchanged. New: no two assets share fuel + idle + utilisation; no 6,588 AED fuel line; > 5 distinct plant utilisations; utilisation ≤ 100 % and GN-01 on 24 h; booked-days revenue (CR-02, EX-11, cancelled CR-05, no double count on TP-21); chart = table; role scoping (Mark, Lina, Fatima).
  - New `src/lib/format.test.ts` (8 tests).

## Before and after: last month (Sep 2026), every asset (Sara's view)
Before, every site machine read 270 h / AED 6,588 or 13,176 fuel / 48.6 idle h / 90 %; every truck 180 h / AED 6,588 / 60 %; GN-01 and GN-02 600 h / AED 54,900 / **200 %**; every parked machine 30 h / 10 %.

| Asset | Engine h | Idle h | Fuel AED | Utilisation % | Revenue AED |
| --- | --- | --- | --- | --- | --- |
| FB-12 | 183.4 | — | 6712.44 | 61.1 | 0 |
| FB-14 | 196.6 | — | 7195.56 | 65.5 | 0 |
| LB-02 | 203.3 | — | 7440.78 | 67.8 | 0 |
| LB-05 | 172.1 | — | 6298.86 | 57.4 | 0 |
| TP-21 | 173.3 | — | 6342.78 | 57.8 | 6600 |
| TP-22 | 175 | — | 6405 | 58.3 | 0 |
| TP-23 | 150.8 | — | 5519.28 | 50.3 | 0 |
| WT-07 | 143.2 | — | 5241.12 | 47.7 | 0 |
| WT-08 | 188 | — | 6880.8 | 62.7 | 0 |
| PU-31 | 119.1 | — | 1453.02 | 39.7 | 0 |
| EX-04 | 237.4 | 40 | 11585.12 | 79.1 | 83250 |
| EX-07 | 230.7 | 39 | 11258.16 | 76.9 | 0 |
| EX-11 | 249.9 | 42.6 | 12195.12 | 83.3 | 1400 |
| WL-03 | 264.5 | 42.4 | 6453.8 | 88.2 | 97600 |
| WL-06 | 261.2 | 41.9 | 6373.28 | 87.1 | 0 |
| BD-02 | 264.7 | 56.4 | 6458.68 | 88.2 | 0 |
| BH-05 | 211.2 | 32.3 | 5153.28 | 70.4 | 0 |
| GR-01 | 214 | 40.6 | 5221.6 | 71.3 | 0 |
| CP-03 | 256.4 | — | 6256.16 | 85.5 | 0 |
| GN-01 | 591.4 | 0 | 54113.1 | 82.1 | 0 |
| GN-02 | 609.7 | — | 55787.55 | 84.7 | 0 |
| LD-09 | 6 | — | 146.4 | 2 | 0 |
| CR-02 | 222.1 | 40.8 | 5419.24 | 74 | 64300 |
| CR-05 | 48.5 | 2.5 | 1183.4 | 16.2 | 0 |
| CR-08 | 40.8 | — | 995.52 | 13.6 | 0 |
| TH-01 | 210.7 | 37.9 | 4498.45 | 70.2 | 0 |
| TH-04 | 256.7 | 46.2 | 5480.54 | 85.6 | 0 |
| FL-09 | 19.3 | — | 176.6 | 6.4 | 0 |
| FL-10 | 227 | — | 2077.05 | 75.7 | 0 |
| BL-01 | 36 | — | 878.4 | 12 | 0 |
| SL-02 | 22.9 | — | 558.76 | 7.6 | 0 |
| MW-01 | 25.7 | — | 627.08 | 8.6 | 0 |
| PU-41 | 87.9 | — | 1072.38 | 29.3 | 0 |
| PU-51 | 102 | — | 1244.4 | 34 | 0 |
| PU-52 | 98.9 | — | 1206.58 | 33 | 0 |
| VN-01 | 95.7 | — | 1167.54 | 31.9 | 0 |

## Exit codes
| Command | Exit |
| --- | --- |
| `npm run typecheck` | 0 |
| `npm run lint` | 0 |
| `npm run build` | 0 |
| `TZ=UTC npm test` | 0 (74 files, 1,111 tests; +cost role test after) |
| `TZ=Asia/Dubai npm test` | 0 (1,111 tests) |
| `npx vitest run --coverage` | 0 (all files 86.39 % statements) |
| Playwright `maintenance-cost`, `certificate`, `billing`, `j2-proof` (desktop + phone, `--workers=2`) | 0 (36 passed) |
| Playwright `j5-proof`, `S9-S12`, `S31-S36`, `S37-S41`, `S42-S50`, `scenario-walkthroughs` | 0 (112 passed) |

Local Playwright needs `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium` (the bundled headless shell version is missing in this sandbox). The J2/J5 Engine & fuel screenshots that the run rewrote were restored (`git checkout -- reviews/screenshots/`): their fuel numbers move with this change, and refreshing them is J3's visual-baseline job.

## Screenshots (looked at)
- `reviews/screenshots/C2/cost-last-month-1440.png`: every row now differs; CR-02 and EX-11 revenue say "Days on hire"; utilisation 2–88 %, none above 100 %. No sideways page scroll.
- `reviews/screenshots/C2/cost-last-month-390.png`, `cost-this-month-390.png`: the table scrolls inside its own box as before; the "Days on hire" label wraps cleanly.
- `reviews/screenshots/C2/cost-this-month-1440.png`.

## Scorecard rows moved
- **A13 Data realism and consistency: 6 → 8.** Evidence: consistency unit test (§9.2) green; last month varies (table above, uniqueness test); FB-12 applied in C1. Not 9 yet: the e2e "no raw floats" check is D's.
- **A9 Money:** "Last-month data varies (§9)" check met; the rest of A9 is H's.

## Supervisor review (BUILDER §5)
- Branched from latest main; no unrelated changes: **PASS**.
- All commands pass, exit codes above; CI: see PR checks (recorded in the #30 comment): **PASS** locally.
- No test weakened: **PASS**. The EX-04 constants (270 h, 13,176, 48.6, 90 %) were derived from the flat model this chunk removes; they are replaced by checks against the meter plus pinned exact values. No behaviour assertion removed.
- Architecture: no screen imports added; no `role ===`; time only via `clock`/`ANCHOR_MS`; coverage 86.4 % ≥ 85 %: **PASS**.
- Access unchanged: `costRows` still gated by `cost.view`; booked revenue is the asset owner's only. Tests for Mark (nothing), Lina and Fatima (own assets only, no hired-in machines): **PASS**.
- Honest numbers: booked revenue carries "Days on hire" and names the bookings; nothing forecast; fuel still says dummy rate: **PASS**.
- No hard-coded hex: **PASS** (none added).
- Phone 390 px: no page-level sideways scroll on Cost & ROI: **PASS**.
- Arabic: no new UI strings ("Days on hire" already has `common.source` text in `SourceLabel`). The revenue *note* is server text, like the other cost notes: **PASS** (unchanged practice).
- Screenshots attached and looked at: **PASS**.
- No fleetx/dozr: **PASS**.
- User text into HTML: none added. Raw floats: format helpers round; cost values are `n2`/`n1` as before.

## Decisions taken
1. Utilisation from the ECU/estimated meter, not by replaying a month of raw readings: replaying September for 36 assets took 23 s, and the plant readings were 11 h every day anyway. The meter is the number the readings' own `engineHours` carry.
2. MUC hours = ECU meter delta (what a real certificate does), replacing "engine ran half the gap".
3. Fuel cost stays on the class-average dummy rate (`cost.fuel` is a `later` feature).
4. GN-01's fuel chain keeps the even burn (scripted levels).

## Open questions / requests
- **H:** EX-11's September margin reads −2,670.9 % (one booked day, AED 1,400, against a month of cost). The number is true; H may want to hide margin % when revenue is under a threshold or only a part-month.
- **H:** the Cost table shows utilisation with mixed decimals ("74%" vs "88.2%"); use `formatPct`.
- **Owner/J3:** the seeded September certificates (EX-04 450 h, WL-03 610 h) are sealed documents and were not changed; they don't match the simulated meter for September (EX-04 ≈ 180 h for 1–20 Sep). Re-seeding them would change their seals and invoices.
- **Simulator:** readings still show about 11.2 h ignition every working day for plant, while the meter now varies; the MUC and cost screens read the meter, so screens agree, but the 7-day ignition chart (Estimated) can differ from the ECU hours. A later chunk could drive shift length from `engineHoursOnDay`.
- LD-09 / FL-09 / MW-01 ("never reported") still accrue estimated hours in Cost & ROI (pre-existing).
