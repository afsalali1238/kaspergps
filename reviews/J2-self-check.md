# J2 self-check — believable simulated data (partial)

Date: 2026-10-12 · Agent: Claude (Haiku 5.5) · Branch `j2-simulated-data` (from `j1-verify`)

Status: **partial.** Items 1, 2 (speeds and trips), 3 and 5 are done and tested. Items 2 (FB-12 route),
4 (renter site) and the FB-12 scripted journey are not done. Phase J2 is **not** ready for review.

## What changed

- `src/server/telemetry/simulator.ts`
  - Day starts are Dubai midnight (`clock.startOfDubaiDay`) instead of UTC midnight. A 07:00 shift now starts at 07:00 Dubai.
  - Working assets (site, light-vehicle) move in the 30 minutes before the anchor, so they read "live", not "idle".
    Four assets the spec calls live (TP-21, BH-05, TH-04, PU-51) were reading idle; they now match.
  - Parked assets keep one heading all day.
  - Fuel is per asset: each tank starts the day at its own level, falls with use, gets one 40–70 point refuel, and GN-01 drops 18 points at 02:10. The old formula gave every asset the same level at the same moment (the "53% everywhere" bug).
  - Between-site trucks run trips: a 20-minute stop, a drive to another site of the same owner at 45–80 km/h, and back. On the anchor day the last drive covers the 40 minutes before the clock.

## Tests

| Check | Result |
| --- | --- |
| `TZ=UTC npx vitest run` | exit 0, 753 / 753, 54 files |
| `TZ=Asia/Dubai npx vitest run` | exit 0, 753 / 753, 54 files |
| `src/server/telemetry/j2-data.test.ts` (new) | 17 / 17 — shift start 07:00 Dubai; day key is Dubai midnight; working assets live with engine on; EX-04 rpm 1,200–2,100; parked 10-minute interval; constant parked heading; per-asset fuel varies; GN-01 drop at 02:10; trucks 20–90 km/h; trucks cover different distances; generator stays put |
| `src/server/seed/expected.test.ts` (status table, §8.2) | passes with all statuses matching |
| `npm run typecheck` / `npm run lint` | exit 0 / exit 0 |
| `rebuild.sh` (build + start) | exit 0 |
| Playwright shards 1–3 (desktop + phone) | 354 passed, 0 failed (one screenshot flake passed on rerun), 167 skipped |
| `tests/e2e/j2-data.spec.ts` | 4 / 4 — screenshots in `reviews/screenshots/J2/` |

## Not done (J2 gaps)

1. **FB-12 scripted journey.** The spec has FB-12 driving from Jebel Ali to Al Habtoor site, Al Barsha, arriving about 90 minutes later. It does not. Today FB-12 runs ordinary trips to nearby owner sites: at the anchor it drives 1.2 km from 09:20 to 09:59. The Al Habtoor site is not in the seed sites.
2. **Realistic distances.** Each truck covers about 7–8 km a day, because the owner's other sites are close. The spec does not give a distance; the 20–90 km/h speeds are correct.
3. **Rented assets at the renter's site (§9, item 4).** Not changed. The asset card's location is right ("Al Habtoor site, Al Barsha"), but the readings still come from the owner's yard.
4. **Plant within about 300 m and lifting short moves.** Not measured or changed in this phase.
5. **Screenshots.** Two were taken (EX-04 Engine & fuel as Khalid; FB-12 Trips as Omar). The FB-12 one shows the gap in item 1.

Phase J2 is not ready for review until items 1 and 3 are done.
