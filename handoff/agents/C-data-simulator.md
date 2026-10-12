# Agent C: data, simulator and consistency (Wave 1)

**Branch:** `agent-c-data` · **Spec:** `UI-UPGRADE.md` §9 · **Arabic namespace:** none (server only)

## Scope
1. **FB-12 trip** (owner decision).
   - Arrive at Al Habtoor about **30 min after the anchor (10:30)** at a realistic truck speed. Change `fb12Route` in `src/server/telemetry/simulator.ts`.
   - Test: the tracking ETA (`src/domain/eta.ts`, through the link resolver) and the simulated arrival agree within ±5 min at anchor +0, +10 and +20 min. FB-12 stays at the site afterwards.
2. **Plant micro-trips.**
   - EX-04 logs 66 one-minute "trips" a week from site shuffles. Plant working on site must not count as trips.
   - Fix it in the simulator (plant moves at walking pace, under `IDLE_SPEED_KMH`) **or** with a minimum trip of 200 m or 3 min in `src/domain/trips.ts`. Choose one and explain why in the self-check.
   - Test: EX-04 and WL-06 have ≤ 2 trips a day; trucks are unchanged.
   - Then raise `PIN_TRIP_MAX` in `src/domain/playback.ts` to 20, or remove it if trips are now few.
3. **Last month varies.**
   - The previous calendar month's fuel, idle and utilisation come from the fuel model and the readings; no repeated 6,588 L and no flat 90%.
   - Revenue comes from the 3 past bookings plus the current bookings' days in that month (`src/server/cost.ts`, `src/server/utilisation.ts`).
   - Test: no two assets share identical fuel, idle and utilisation for the month.
4. **One number, one source.** New `src/server/consistency.test.ts` checks that each of these agrees wherever it appears:
   - maintenance remaining: alert text, plan and asset page;
   - engine hours: asset page, maintenance card and MUC;
   - fleet engine hours today: the KPI value and the sum per asset;
   - fuel level: the map-row value, the asset page and the fuel model;
   - GN-01's engine hours today are > 0 while it's working.
   Fix any disagreement at its source.
5. **Formatting helpers.** New `src/lib/format.ts` with `formatNumber`, `formatHours`, `formatKm`, `formatSpeed` (whole km/h), `formatAed`, `formatPct` and `formatVolts`, plus unit tests. Don't change screens to use them; Wave 2 agents do that on their pages.

## Rules
- Seed and §8 scenario facts stay true: all `alerts-truthful`, `j2-simulated-data`, `clock-move` and `dubai-day` tests must still pass. If one has to change, cite the spec line in the PR.
- No UI changes.

## Done when
- The tests above are added, CI is green, and the self-check includes before/after numbers: FB-12 arrival and ETA; trips a week for EX-04, WL-06 and FB-12; and last month's fuel and utilisation per asset.
