# J6 self-check: the missing playback event pins

Adding the pin kinds the 2026-10-12 handoff listed as missing (§11.15): **trip start/stop,
harsh, towing, power cut, refuel**, on top of the over-speed, fuel-drop and geofence pins
that were already built. Pins also draw on the map now, and click-to-jump works from both.

## What was built

| Piece | Where | What it does |
| --- | --- | --- |
| Trip rule, in one place | `src/domain/trips.ts` | `groupTrips()` / `isDriving()` — a trip starts at ignition on and speed > 3 km/h, ends after 5 minutes stopped, at ignition off, or at a data gap. `src/server/trips.ts` and the playback pins both read it, so a pin and a row of the Trips table can never disagree. |
| New pins | `src/domain/playback.ts` `buildPins()` | `trip_start`, `trip_stop`, `harsh` (in words), `towing` (rolling with the ignition off), `power_cut` (the feed dies and stays dead), `refuel` (a rise ≥ 5 points, Tier 2/3). Each pin carries the position the readings put the machine at, for the map. |
| Player | `src/components/playback/TripPlayer.tsx` | Colour per pin kind, a legend under the scrubber, pins stacked into rows so two close in time cannot cover each other, and the same pins drawn on the map (click one to jump there — the map and the scrubber drive the same playhead). |
| Thresholds | `src/config/thresholds.ts` | `FUEL_REFUEL_RISE_PCT = 5`, `POWER_CUT_V = 1`, `POWER_OK_V = 10`. `utilisation.ts` now uses `FUEL_REFUEL_RISE_PCT` where it had the literal. |

## Two decisions worth the owner's eye

1. **Trip boundaries get pins only in a window with at most `PIN_TRIP_MAX` (3) trips.**
   A machine that works on one site shuffles about all day and the trip rule (correctly)
   calls each shuffle a trip: EX-04's week holds **66**, WL-06's **63**, each about a
   minute long, which is 130+ identical pins that repeat what the coloured state track
   already shows. In the window the spec cares about — one trip played from the Trips tab
   (S27), or a day of a truck — the boundaries are the useful thing and they stay. **The
   Trips tab list itself is never filtered.** The underlying micro-trips are a simulator
   property (plant working at a site crossing 3 km/h for two samples); fixing them means
   changing seeded telemetry, which is a larger, separate change.
2. **A trip's end time is its last *driving* reading, not the first stopped one.** The
   stop is only known once the machine has stood still for five minutes, and inventing a
   time in between is the interpolation the spec forbids. So a stop pin sits at the same
   time and place the Trips tab reports as the trip's end.

## A real bug this found in the shared trip rule

The old rule measured "time since the previous reading", so a machine that keeps
reporting every 30 seconds while it idles with the engine on **never ended its trip**
(the gap never reached five minutes). The Trips tab had this too. `groupTrips()` now
measures five minutes from the *first reading that shows the machine standing*, and a
stopped machine adds no distance and no top speed to the trip it ends. Tests pin both
sides: a 5-minute stop splits the day into two trips however often the machine reports,
and a stop shorter than the rule does not.

## Verification

- `npm run typecheck` 0 · `npm run lint` 0 · `npm run build` 0.
- `TZ=UTC npx vitest run`: 0, **884 passed**, 63 files, 0 todo. `TZ=Asia/Dubai npx vitest run`: 0, 884 passed.
- `npm run test:coverage`: 0, 85.48 % statements / **88.42 % lines** (floor 85 %).
- `npx playwright test` (desktop + phone, production build): 0, **362 passed, 0 failed**, 196 skipped by design, 9.1 min.

New tests:

- `src/domain/trips.test.ts` (9): the rule itself, plus a fleet-wide assertion that
  `detectTrips()` reports exactly the windows `groupTrips()` finds for **every seeded
  asset** — that check is what exposed the never-ending-trip bug.
- `src/domain/playback.test.ts` (37, +12): every pin kind, the tier rule for fuel, the
  gap rules, the row layout, and the dense-window rule.
- `src/server/telemetry/playback-pins.test.ts` (7): each seeded event appears as a pin —
  TP-21's three harsh events in words, LB-05's tow at 23:40, TP-23's and EX-11's power
  cuts, GN-01's refuels and its 18-point drop at 02:10, and no fuel pins on a Tier 1 fleet.
- `tests/e2e/playback-motion.spec.ts` (+1): in Chromium, LB-05's History player shows the
  towing pin, the trip pins and the legend; the same pin is on the map; clicking it moves
  the playhead to a stationary readout at 4 km/h.

## Note on a false alarm

The first full Playwright run after these changes reported 3 failures (two certificate
`Tools` clicks and the S42 wizard). They were environmental: Playwright's `webServer`
falls back to `npm run dev` when nothing is listening on :3000, and first-compile
timeouts in a dev server made those pages time out. With the production server running
(`npm run start`, as in CI) the same specs pass — re-run confirmed.

## Supervisor review (Claude Opus, 12 Oct 22:40)

Applied the builder's `j6-pins.patch` to `main` (`2493e4d`): it applied cleanly. All checks were re-run here rather than taken from the report: typecheck 0, lint 0, vitest 886/886 under `TZ=UTC` and `TZ=Asia/Dubai`, and CI (3 shards, desktop + phone).

**Approved, with one fix made in review:**
1. **Fixed — script injection in the map pins.** `pinIcon` put the pin title into Leaflet `divIcon` HTML unescaped, and geofence pins carry the fence name, which users can edit. A fence named `"><img src=x onerror=…>` would have run for anyone replaying that asset. The HTML is now built by `pinMarkerHtml` in `src/domain/playback.ts`, which escapes the title and accepts only a hex colour. Two tests in `playback.test.ts` cover it.

**Notes, not blocking:**
2. **The `h-3` diagnosis was wrong.** `.h-3{height:calc(var(--spacing)*3)}` is in the built CSS and `--spacing` is `.25rem`, so the class works (12 px). The inline `height: 12px` is harmless; U1 replaces these inline styles with tokens.
3. **`PIN_TRIP_MAX = 3` hides a simulator problem.** EX-04's 66 one-minute "trips" a week are site shuffles that the simulator generates as driving (`speed > 3 km/h` with ignition on). Plant working on site shouldn't count as trips. The fix belongs in the simulator: plant moves under walking pace, or a minimum trip distance or duration. It's added to U3 in `handoff/BUILDER.md`. When it's fixed, raise or remove the cap.
4. **Pin colours are hard-coded hex** (`PIN_COLOUR`). They move to tokens in U1.
5. **History tab noise:** the J6 capture shows the raw readings table (100+ rows of "0 km/h · Off") under the player. U3 replaces it with the playback timeline list (`handoff/UI-UPGRADE.md` §7.3).
6. **Process:** this work was built from the old gap list instead of `handoff/BUILDER.md` (step U0b), on a branch that started before PRs #25 and #26. The next session starts from `main` with step U0b.
