# C1 self-check: FB-12 arrival, plant micro-trips, PIN_TRIP_MAX

Chunk C1 of the night queue (#30). It covers Agent C scope items 1 and 2 (`handoff/agents/C-data-simulator.md`). PR #35, branch `night-c1`.

## What changed and why
- **`src/server/telemetry/simulator.ts`**
  - **FB-12 timing (owner decision, BUILDER §1).** FB-12 leaves Jebel Ali Yard at 09:55 and reaches the Al Habtoor site at **10:30**, 30 min after the 10:00 anchor. Before this it arrived at 11:30.
  - **FB-12 route.** The route now has one turn, `fb12Waypoint()`, on the ellipse whose paths are 1.3 × the straight line (`ETA_ROAD_FACTOR`).
    - The road distance is 18.5 km, driven in 35 min at about **32 km/h** door to door: a loaded truck in morning traffic.
    - So the speed the truck reports, the distance on its odometer, and the ETA all agree.
    - A straight line would have needed either a reported speed the odometer contradicts or an ETA 8 min off.
  - **Plant micro-trips: fixed in the simulator, not with a minimum trip in `trips.ts`.**
    - Shuffles on site now run at walking pace: `SHUFFLE_KMH` = 2, under `IDLE_SPEED_KMH` = 3. They read as "Stationary, ignition on" and are not trips.
    - Once a shift, in the 07:xx bucket, the machine trams to the work face at `TRAM_KMH` = 5. That is a real trip.
    - On a day with a scripted excursion (WL-06's geofence exit, GR-01's after-hours job), the tram is skipped, so the day still has at most 2 trips.
    - Why not the trip rule? A minimum of "200 m or 3 min" would still pass many shuffles: offsets reach about 450 m. It would also hide real short truck trips, and it changes the trip rule for every asset.
- **`src/domain/playback.ts`:** `PIN_TRIP_MAX` raised from 3 to **20**. A plant week is now about 7 trips and a truck week 14–18, so their trip pins show. A month (30+ trips) still gets no boundary pins.
- **`src/server/links.ts`** (outside C's list; a small fix that goes with the FB-12 change).
  - Before: once FB-12 had arrived, the tracking link read "Arrived <the current time>". With the new timing, the hirer would see that wrong time for most of the demo.
  - Now `arrivedSince()` passes the real arrival time, the first reading of the unbroken run at the destination, to `computeEta`, which already accepted an `arrivedAt` argument.
- **`src/components/demo/walkthroughs.ts`** (B's folder; one-word edit): the S29 step now says "Jump the clock +40 minutes" instead of +90, because FB-12 arrives at +30.
- **Tests**
  - New `src/server/telemetry/c1-trips-eta.test.ts`:
    - FB-12 arrives at anchor +25 to +35 min, at 25–60 km/h.
    - The ETA at +0, +10 and +20 min is within ±5 min of the arrival.
    - FB-12 stays at the site at +40, +90 and +240 min, and "Arrived" shows the real arrival time.
    - EX-04 and WL-06 make ≤ 2 trips on every Dubai day for 4 weeks, and at least one trip each week.
    - A plant week is ≤ `PIN_TRIP_MAX` trips.
    - Shuffles read under 3 km/h and are not "moving".
    - TP-21, LB-05 and WT-07 still make 10+ trips a week.
  - `clock-move.test.ts`: the FB-12 arrival test changed from "about 90 min" to "about 30 min" (owner decision). It now checks more than 5 km away at +10 and less than 0.5 km at +35 and +4 h. Before, the checks were at +30 and +95.
  - `playback.test.ts`: the pin-density test now builds `PIN_TRIP_MAX + 10` separate trips, in a window wide enough to hold them. It keeps both assertions (no pins, trips still exist) and adds a check that trips still exist above `PIN_TRIP_MAX`. A new test checks that exactly `PIN_TRIP_MAX` trips keep one pin pair each.
  - `playback-pins.test.ts`: comments only. The assertions are unchanged and still pass in both branches.

## Before and after (measured with the simulator at the anchor)
| | Before | After |
| --- | --- | --- |
| FB-12 arrival | 11:30 | **10:30** |
| FB-12 speed while driving | 8–10 km/h | 30–34 km/h |
| Tracking ETA at +0 / +10 / +20 min | 10:42 / 10:48 / 10:53 (actual arrival 11:30) | 10:32 / 10:34 / 10:33 (actual arrival 10:30) |
| "Arrived" time at +100 min | 11:40 (time the page was opened) | 10:30 |
| EX-04 trips a week (per day) | 66 (12,11,9,10,10,10,9) | 7 (1 each day) |
| WL-06 trips a week | 63 | 8 (1 a day; 2 on its excursion day) |
| CR-05 trips a week | 72 | 6 |
| FB-12 trips a week | 16 | 16 |
| TP-21 / LB-05 / WT-07 trips a week | 14 / 18 / 17 | 14 / 18 / 17 (unchanged) |

## Exit codes
| Command | Exit |
| --- | --- |
| `npm run typecheck` | 0 |
| `npm run lint` | 0 |
| `npm run build` | 0 |
| `TZ=UTC npm test` | 0 (72 files, 1090 tests) |
| `TZ=Asia/Dubai npm test` | 0 (72 files, 1090 tests) |
| Playwright, `--workers=2`: public-tracking, S1-S3, S4-S8, S9-S12, S13-S16, S23-S30, j2-proof, j5-proof, j6-proof, playback-motion | 1 on the first run: 111 passed, 2 failed, 31 skipped |
| The 2 failures re-run alone (j6 `ex04-7day at 1440`, j5 `engine-fuel-gr01 at 390`) | 0 and 0 |

Both failures were "Target page, context or browser has been closed" while taking a screenshot. Each passed when run alone.

## Screenshots (`reviews/screenshots/C1/`)
- `before-/after-J5-hirer-tracking-{1440,390}.png`: the hirer's link now reads "Arriving about 10:32 (in 32 min)". Before, it predicted 10:42 for a truck that actually arrived at 11:30.
- `before-/after-J6-ex04-7day-{1440,390}.png`: EX-04's week of playback.
  - Before: amber and green slivers for every shuffle, and no trip pins (66 trips was over the cap).
  - After: no moving slivers, one trip start/stop pair a day, and the refuel pins.
  - Checked by eye: the readout shows "Stationary, ignition on · 2 km/h" during a shuffle, which is honest.
- `before-/after-J2-fb12-trips-1440.png`: FB-12's Trips tab.
- Other screenshots rewritten by the local run (J2, J5, J6) were restored.
- No layout changed in this chunk. It is data only, so no phone-overflow risk.

## Scorecard rows moved (UI-UPGRADE §2)
- **A13, data realism:** the FB-12 decision is applied and tested. The micro-trip noise is gone. It stays *partial* until C2: last month varies, `consistency.test.ts`, `format.ts`.
- **A7 / playback:** trip pins now show for a week of plant and trucks.

## Supervisor review (BUILDER §5)
- PASS: branched from the latest `main` (`243ceaa`); no unrelated changes.
- PASS: all commands run and exit codes recorded. CI is checked on the PR head before merge.
- PASS: no test weakened.
  - The FB-12 test changed its times for the owner's decision. Its shape is kept: far at first, then there, then staying.
  - The pin-density test is stricter than before.
- PASS: architecture.
  - Screens are untouched.
  - No `role ===` added.
  - Time comes from `clock.ts`; `simulator.ts` already imports it, and no new `Date.now`.
- PASS: access unchanged. No new panel or list. The tracking link payload has the same keys.
- PASS: honest numbers. Nothing invented; ETA and arrival both come from the readings.
- PASS: no hex, no new strings (the walkthrough copy is English-only, as before), no "Dozr" or fleetx.
- PASS: user text into HTML: none added.
- PASS: phone at 390 px: no layout change.

## Deviations and decisions taken
- **Simulator rather than trip rule** for micro-trips, for the reasons above.
- **The shift-start tram is skipped on excursion days.** This keeps "≤ 2 trips a day" true while keeping "every working machine drives in the week" (an existing assertion in `playback-pins.test.ts`).
- **The "Arrived" time fix** is in `src/server/links.ts`, which is outside C's list. It is needed so the owner's FB-12 change doesn't show a wrong arrival time.
- **The departure time, 09:55, is my choice.** FB-12 must already be driving at the anchor (existing tests), and 30 min after the anchor leaves 35 min for an 18.5 km road trip.

## Open questions
- None blocking. If the owner wants a faster truck (about 45 km/h), it would have to leave after the anchor, which breaks "FB-12 is driving at the anchor" (spec §8.2).
