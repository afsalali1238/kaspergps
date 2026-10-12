# J3 self-check — alert times that match the readings

Branch `arena/2b1c0619-kaspergps` · Date 2026-10-12 · Stacked on J2 (PR #19), same branch

## Why this was needed

The seeded alerts (`src/server/seed/data.ts`) were built from `daysAgo(n) + hours`. `daysAgo(n)` keeps
the anchor's time of day (10:00), so many alerts opened in the **future** or on the wrong day, and most
detail texts disagreed with their own `openedAt`. Examples before this change:

| Alert | Opened (Dubai) before | Problem |
| --- | --- | --- |
| `al-gn01-drop` | 6 Oct 12:10 | after the 10:00 anchor; text says 02:10 |
| `al-bd02-fault` | 6 Oct 15:40 | in the future; the fault first appears at 05:40 |
| `al-tp23-power` | 5 Oct 20:10 | text says 12:10; spec §8.2 says 2 h before the anchor (08:00) |
| `al-wt07-speed` | 6 Oct 01:00 | the 104 km/h peak is at 07:31 on 5 Oct |
| `al-gn01-lowfuel` | 6 Oct 14:00 | fuel is 20% at 04:37 and refilled at 07:00 |

## What changed

- **Times from one helper.** `dubaiAt(daysBefore, hour, minute)` in `seed/data.ts` builds every
  alert and geofence-event time from Dubai wall-clock time. Detail texts use `dubaiHm` / `dubaiDayHm`,
  so they cannot disagree with `openedAt`. The helper does its own UTC+4 arithmetic: `clock.ts` imports
  `ANCHOR_MS` from `seed/data.ts`, so importing `clock` back would create a cycle (found and fixed here).
- **Readings made to match the spec (§8.2, §8.7, §8.10):**
  - GN-01 generator is now engine-off 02:00–02:30 on the anchor night **even while rented**. The stay path
    ignored the plan's off window before. `Segment.forced` gained `'off'`, as `'idle'` already had.
    The 18% drop at 02:10 now has the engine off, as the alert text says.
  - GN-02's tracker battery reads 3.45–3.50 V from three days before the anchor (below `LOW_BATTERY_V` 3.6).
- **Geofence events** for WL-06 (exit 19:10, enter 19:55) and LB-05 (exit 23:40, 5 Oct) now use the same times as their alerts.

## Evidence

| Check | Result |
| --- | --- |
| `src/server/seed/alerts-truthful.test.ts` | 10 passed; 7 todo (listed below) |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 (after moving a skip out of an empty fixture pattern in `j2-proof.spec.ts`) |
| `npm run build` | exit 0 |
| `TZ=UTC npx vitest run` | exit 0, 57 files, 800 passed, 7 todo |
| `TZ=Asia/Dubai npx vitest run` | exit 0, 57 files, 800 passed, 7 todo |
| Coverage `TZ=UTC npx vitest run --coverage` | exit 0, lines 87.41% (≥ 85%) |
| `npx playwright test --retries=0` (`CI=1`, production build), desktop + phone | exit 0, 349 passed |

The truthfulness test checks, for each reading-backed alert:
TP-23 power cut (voltage ~0 at 08:00, above 10 V 30 min before) · TP-23 offline (last reading 09:20) ·
EX-07 offline (last reading 06:50) · SL-02 offline (last reading 4 Oct 10:00) · GN-02 low battery (< 3.6 V) ·
WT-07 over-speed (peak 104 km/h inside the window) · BD-02 fault (first DTC at 05:40, ±1 min) ·
GN-01 drop (≥ 18% between 02:09 and 02:10, ignition off) · GN-01 low fuel (20% at 04:37, refilled at 07:00).
Each detail text's time is checked against `openedAt`.

## Not done — open alerts with no reading behind them (7 todo in the test)

These alerts are seeded but the readings do **not** show the event yet. They are not fixed in this phase.

1. **LB-05 towing** (spec §8.7: moved 400 m with ignition off, 5 Oct 23:40) — LB-05 does not move in the readings.
   Times now follow the spec; the simulator needs a scripted tow.
2. **LB-05 after-hours exit, Al Quoz Yard** (spec §8.7, §9) — needs the same tow to cross the yard fence.
3. **WL-06 geofence exit, Palm Crescent, 19:10** (spec §8.7) — WL-06 stays inside the fence in the readings.
   The times now follow the spec; the simulator needs a scripted exit.
4. **EX-11 power cut at "Al Quoz Yard"** (seed only, not in spec) — the voltage stays on; EX-11's yard is Ras Al Khor, so the text is also wrong.
5. **PU-51 idle, 2.5 h at Dubai Hills** (seed only) — the readings show ignition off, not idling.
6. **FB-12 over-speed 96 km/h** (seed only) — FB-12's highest speed in the past week is 84 km/h, below the 90 km/h rule.
7. **TP-21 harsh driving, 3 events** (spec §8.7) — the readings carry no accelerometer events, so this cannot be shown yet.

Items 1–3 are spec-mandated and are the most important follow-up. Items 4–6 are seed-only and could be removed or
reshaped in review.

## Other notes

- The spec's own example alert words (§10: "Offline since 14:32", "Power cut at 12:10") do not match §8.2 for a
  10:00 anchor (a power cut 2 h before the anchor is 08:00). I followed §8.2 and §8.7, because the spec says
  §8.2 is the statuses at the anchor.
- `al-bd02-maint` (maintenance overdue, not telemetry) now opens with the fault at 05:40. Its real opening time is unknown.
- `ge-004` (BH-05 enter, 7 Oct 20:30) is a future event and is left as it was. It is outside the alert list. Review it.
- The `HANDOFF-remaining-2026-10-12.md` file named in earlier notes is not in the repository. J3 scope came from
  §8.7, §8.10 and this self-check. If the handoff has more J3 items, they are not covered here.

Phase J3 is ready for review.
