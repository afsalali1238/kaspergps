# J4 self-check — the spec's scripted alert events appear in the readings

Branch `arena/2b1c0619-kaspergps` · Date 2026-10-12 · Stacked on J2 and J3 (PR #19)

## Scope — please confirm

The handoff file `HANDOFF-remaining-2026-10-12.md` is not in the repository, and I could not get its J4
list. I took J4 to be the **spec-mandated alert events that J3 left without readings** (BUILD_PROMPT.md §8.7,
§9). The LB-05 tow and the WL-06 geofence exit are in this phase. The rest of the open list is unchanged
(see below). If the handoff defines J4 differently, this phase should be re-scoped.

## What changed

- **Scripted excursions** (`src/server/telemetry/simulator.ts`, `excursionLegs` / `excursionAt`). Each excursion
  overrides position, mode and speed for its legs only; everything else keeps the normal plan.
  - **LB-05 tow**, yesterday 23:40–23:50 Dubai: moves north 400 m from its yard with the engine off (speed 4 km/h).
    It then holds there until midnight.
  - **WL-06 exit**, yesterday: leaves the Palm Crescent works at 19:10 (30 km/h), stops 667 m outside
    from 19:20 to 19:45 with the engine on, and drives back, inside by 19:55.
- Excursions use the same times as the seeded alerts and geofence events from J3 (`dubaiAt`), so they agree.

## Evidence

Readings from the diagnostic before the test was written (distance from the start / works centre):

| Time (yesterday) | LB-05 ignition | LB-05 distance from yard | WL-06 distance from works | WL-06 ignition |
| --- | --- | --- | --- | --- |
| 23:38 | off | 0 m | — | — |
| 23:48 | off | 341 m (mid-tow, 4 km/h) | — | — |
| 23:58 | off | 393 m (held) | — | — |
| 19:10 | — | — | 0 m (leaving) | on, 30 km/h |
| 19:22 | — | — | 667 m (outside) | on, stopped |
| 19:54 | — | — | 67 m (back in) | on, 30 km/h |

`alerts-truthful.test.ts` now asserts both events (the LB-05 window runs to midnight, because parked readings come every 10 minutes):
- LB-05: no reading with the ignition on from 23:35 to midnight; the farthest reading is 350–450 m from the yard;
  a reading shows movement.
- WL-06: a reading more than 500 m from the works between 19:15 and 19:25; a reading within 150 m between 19:52 and 19:56.

| Check | Result |
| --- | --- |
| `alerts-truthful.test.ts` | 12 passed; 5 todo |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run build` | exit 0 |
| `TZ=UTC npx vitest run` | exit 0, 57 files, 802 passed, 5 todo |
| `TZ=Asia/Dubai npx vitest run` | exit 0, 57 files, 802 passed, 5 todo |
| Coverage `TZ=UTC npx vitest run --coverage` | exit 0, lines 87.47% (≥ 85%) |
| `npx playwright test --retries=0` (`CI=1`, production build), desktop + phone | exit 0, 349 passed |

## Still open (5 todo in the test)

1. **LB-05 after-hours exit from Al Quoz Yard** (§8.7, §9). LB-05 is homed at DIP, not at the Al Quoz Yard fence, so
   the crossing needs the spec resolved first. This is a spec inconsistency, not a missing script.
2. **EX-11 power cut at "Al Quoz Yard"** (seed only). Voltage stays on; the yard is Ras Al Khor, so the text is also wrong.
3. **PU-51 idle at Dubai Hills** (seed only). Readings show the ignition off, not idling.
4. **FB-12 over-speed 96 km/h** (seed only). FB-12's highest speed in the past week is 84 km/h.
5. **TP-21 harsh driving, 3 events** (§8.7). Readings carry no accelerometer events, so this cannot be shown yet.

## Known deviations

- **LB-05 after the tow.** It stays at the tow's end point until midnight, then the normal plan takes it back to its
  yard. The odometer counts that ~400 m jump at midnight as distance (a small overcount, about 0.4 km once).
- **WL-06 readings during the rental.** Between 19:55 and 20:05 the readings keep the normal plant wobble inside the works radius, so a reading can
  sit about 200 m from the works centre. Those readings are not checked against the fence polygon.

Phase J4 is ready for review.
