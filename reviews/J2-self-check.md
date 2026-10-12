# J2 self-check — believable simulated data

Date: 2026-10-12 · Agent: Claude (Haiku 5.5) · Branch `j2-simulated-data` (from `j1-verify`)

Status: **ready for review**, with one seed decision open (item 5 below). All J2 items are implemented and tested.

## What changed

- `src/server/telemetry/simulator.ts`
  - Day starts are Dubai midnight (`clock.startOfDubaiDay`) instead of UTC midnight. A 07:00 shift now starts at 07:00 Dubai.
  - Working assets (site, light-vehicle) move in the 30 minutes before the anchor, so they read "live", not "idle".
    Four assets the spec calls live (TP-21, BH-05, TH-04, PU-51) were reading idle; they now match.
  - Parked assets keep one heading all day.
  - Fuel is per asset: each tank starts the day at its own level, falls with use, gets one 40–70 point refuel, and GN-01 drops 18 points at 02:10. The old formula gave every asset the same level at the same moment (the "53% everywhere" bug).
  - FB-12 follows a scripted journey. It waits at the Jebel Ali Yard with the engine off, leaves 5 minutes before the anchor,
    and drives to the Al Habtoor site in Al Barsha (25.1130, 55.2000) over 90 minutes. The straight line is about 14 km, so
    the reported speed is about 9–11 km/h, which keeps the track and the speed consistent. Afterwards it is parked at the destination.
    This replaces the unused `getFB12Readings` helper.
  - A rented asset sits at its renter's site while the rental is active (`siteFor`). EX-04 is at Dubai Hills Project (Marina Builders),
    WL-06 at Palm Crescent Works (Palm Contracting). Otherwise assets stay at their home site.
  - Between-site trucks run trips: a stop of 10–45 minutes, a drive to another site of the same owner at 45–80 km/h, and back. Each truck picks its destinations at random and ends its shift between 14:00 and 18:00, so daily distances differ. On the anchor day the last drive covers the 40 minutes before the clock.
  - Plant working at a site stays within 250 m of that site; lifting makes short moves within 120 m (§9). Both use one bounded walk (`stepWithin`), and their odometers now accumulate. The odometer used to be set to each step, so every working plant asset logged 0.0 km.

## Tests

| Check | Result |
| --- | --- |
| `TZ=UTC npx vitest run` | exit 0, 766 / 766, 54 files |
| `TZ=Asia/Dubai npx vitest run` | exit 0, 766 / 766, 54 files |
| `src/server/telemetry/j2-data.test.ts` (new) | 30 / 30 in UTC and Dubai. Adds: FB-12 waits at the yard before the anchor; FB-12 is moving at the anchor; its track gets closer to Al Barsha; median speed 8–12 km/h; EX-04 and WL-06 work within 1 km of their renter's site; plant (EX-04, WL-06, GR-01, CP-03) within 300 m of its working site; lifting (TH-04, TH-01) within 150 m; a working plant's odometer accumulates; truck daily distances 10–60 km and at least 5 km apart |
| `src/server/seed/expected.test.ts` (status table, §8.2) | passes (included in the full run) |
| `npm run typecheck` / `npm run lint` | exit 0 / exit 0 |
| `rebuild.sh` (build + start) | exit 0; server answers HTTP 200 |
| Playwright shards 1/3, 2/3, 3/3 (desktop + phone) | 196 + 102 + 60 passed, 0 failed, 167 skipped. One screenshot test (`sara console-billing at 1440 px`) timed out once and passed on rerun |
| `tests/e2e/j2-data.spec.ts` | 4 / 4 |

## Screenshots

- `reviews/screenshots/J2/desktop-fb12-trips.png` (and phone): FB-12 Trips at the anchor shows 09:55–09:59, 0.7 km, 10 km/h, still in progress.
- `reviews/screenshots/J2/*-ex04-engine-fuel.png`: EX-04 Engine & fuel, regenerated.

## Open J2 items

1. **FB-12 scripted journey.** Done. The Al Habtoor site is not in the seed sites, so the destination uses the booking's coordinates.
   The journey is 90 minutes over a 14 km straight line, so the reported speed is about 10 km/h.
2. **Realistic distances.** Done. Trucks cover about 16–30 km a day, and the figure differs by truck and by day. Before, all of them
   covered about 37 km because each truck filled its shift with the same stops and destinations.
3. **Rented assets at the renter's site.** Done. The asset card's location and the readings now agree.
4. **Plant within about 300 m and lifting short moves.** Done. Measured against each asset's working site: plant at work was 334–812 m before the fix (EX-04 552 m, WL-06 632 m, BD-02 812 m); now ≤ 300 m. Lifting at work was 353–592 m (TH-01, TH-04); now ≤ 150 m.
5. **Decision for review (seed data, not changed here).** BH-05 and EX-11 are plant seeded as `drives_between_sites`, so they drive 10–13 km a day. §9 says plant stays within about 300 m of its site. Either their behaviour changes to `works_at_site` in the seed, or §9 is read as allowing them to travel. I did not change the seed.
