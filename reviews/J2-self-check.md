# J2 self-check — believable simulated data (partial)

Date: 2026-10-12 · Agent: Claude (Haiku 5.5) · Branch `j2-simulated-data` (from `j1-verify`)

Status: **partial.** The FB-12 scripted journey and the renter-site change are done and tested (items 1 and 3 below).
Still open: realistic distances for every truck (item 2) and the plant and lifting measurements (item 4).
Phase J2 is **not** ready for review until those are done.

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
  - Between-site trucks run trips: a 20-minute stop, a drive to another site of the same owner at 45–80 km/h, and back. On the anchor day the last drive covers the 40 minutes before the clock.

## Tests

| Check | Result |
| --- | --- |
| `TZ=UTC npx vitest run` | exit 0, 759 / 759, 54 files |
| `TZ=Asia/Dubai npx vitest run` | exit 0, 759 / 759, 54 files |
| `src/server/telemetry/j2-data.test.ts` (new) | 23 / 23 in UTC and Dubai. Adds: FB-12 waits at the yard 10–40 min before the anchor; FB-12 is moving with the engine on at the anchor; its track gets closer to Al Barsha; median speed 8–12 km/h; EX-04 and WL-06 work within 1 km of their renter's site |
| `src/server/seed/expected.test.ts` (status table, §8.2) | passes (included in the full run) |
| `npm run typecheck` / `npm run lint` | exit 0 / exit 0 |
| `rebuild.sh` (build + start) | exit 0; server answers HTTP 200 |
| Playwright shards 1/3, 2/3, 3/3 (desktop + phone) | 196 + 103 + 60 = 359 passed, 0 failed, 167 skipped |
| `tests/e2e/j2-data.spec.ts` | 4 / 4 |

## Screenshots

- `reviews/screenshots/J2/desktop-fb12-trips.png` (and phone): FB-12 Trips at the anchor shows 09:55–09:59, 0.7 km, 10 km/h, still in progress.
- `reviews/screenshots/J2/*-ex04-engine-fuel.png`: EX-04 Engine & fuel, regenerated.

## Open J2 items

1. **FB-12 scripted journey.** Done (see What changed). The Al Habtoor site is not in the seed sites, so the destination uses the booking's
   coordinates. Decision for review: the 90-minute journey on a 14 km straight line means about 10 km/h. A longer route or a faster
   journey would need a different scripted timeline.
2. **Realistic distances for other trucks.** Open. Each truck still covers about 7–8 km a day, because the owner's other sites are close.
   The 20–90 km/h speed range is right; the distances are not yet.
3. **Rented assets at the renter's site.** Done. The asset card's location and the readings now agree.
4. **Plant within about 300 m and lifting short moves.** Open. Not measured or changed in this phase.

Phase J2 is not ready for review until items 2 and 4 are done.
