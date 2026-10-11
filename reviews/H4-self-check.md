# H4 self-check — in progress (trip playback, H4.1)

Date: 2026-10-11 · Agent: Claude (Haiku 5.5)

## Commands (run separately, each exit code checked)
| Command | Result |
| --- | --- |
| npm ci | pass |
| npm run typecheck | pass |
| npm run lint | pass |
| npm run build | pass |
| TZ=UTC npx vitest run | pass, 616/616 |
| TZ=Asia/Dubai npx vitest run | pass, 616/616 |
| npm run test:e2e (Playwright) | NOT RUN — browser download blocked by egress policy (cdn.playwright.dev 403) |

## Scope of this slice (H4.1 trip playback, §11.15)
Built:
- src/domain/playback.ts: spans (moving / stationary-on / off / no-data), gap jumping, reduced-motion step, position with interpolation only inside one trip under 2 min, trail split at gaps and capped at 5,000 points, full-resolution distance that never crosses gaps.
- src/components/playback/TripPlayer.tsx: play/pause, 1×/10×/60×/300×, restart, coloured scrubber with hatched no-data, heading-rotated marker with trail, faint full track, gap banner "No data … – …", readout (Tier 2/3 CAN fields show "Not measured" when absent).
- Asset detail Trips tab: Play button per trip, player opens above the table.
- Unit tests: src/domain/playback.test.ts (17 tests).
- ar.json: keys trips.play, trips.play_col (draft, needs native review).

Not built yet in H4.1 (spec items still open):
- Event pins on scrubber and map (own geofences, harsh events, fuel events Tier 2/3 only).
- "Play this period" in History (History tab not built, see H4.2).
- Renter window clipping (renters cannot scrub before their window).
- Clicking a pin to jump.
- Prefers-reduced-motion is implemented but unverified in a browser.

## Acceptance checks
| Check | Status | How verified |
| --- | --- | --- |
| Gap never drawn or interpolated | Pass (unit) | playback.test.ts |
| Playback jumps gaps with banner | Pass (unit for jump; banner rendered, not visually checked) | playback.test.ts |
| Trail ≤ 5,000 points | Pass (unit) | playback.test.ts |
| Scenarios S25, S27, S28 | NOT VERIFIED | needs Playwright |
| Screenshots 1440 px and 390 px | NOT DONE | no browser binary available in this session |

## Known gaps
- No e2e or screenshot evidence for any H4 item, including the already-merged "done" items. Treat as unproven.
- Stale branches arena/* and Windows-clone uncommitted files untouched, per handoff.

# H4.2 — History tab (§11.3)

Commands (each run on its own, exit codes checked):
| Command | Result |
| --- | --- |
| npm run typecheck | pass |
| npm run lint | pass |
| npm run build | pass |
| TZ=UTC npx vitest run | pass, 632/632 |
| TZ=Asia/Dubai npx vitest run | pass, 632/632 |
| npm run test:e2e | NOT RUN (browser download blocked) |

Built:
- Period picker: 24 h (default), 7 days, Custom (Dubai time inputs).
- Renter floor: `historyFloor(session, assetId)` in src/server/access.ts, exported through api.ts (gated: first parameter is Session). A range starting before the floor is clamped and labelled "History starts …"; a range wholly before it shows "No history before your rental window."
- Track on map, split at gaps (no line bridges a gap).
- Positions table: time, speed, ignition, heading, plus CAN columns the asset supports (fuel %, fuel rate, RPM, coolant, load, AdBlue). Unsupported columns are not shown; a supported field that is missing on a row shows "Not measured".
- Gap rows: "No data 13:05 – 15:40" in time order, no interpolation.
- Shows 100 rows at a time with "Show more".

Decisions made without the spec saying so (review these):
- Custom ranges capped at 31 days, to bound one query.
- Gap rows only for silences of at least 60 s, so leading seconds before the first reading are not shown.
- Table paginates at 100 rows.
- The fuel-rate column is included as a CAN column (spec lists fuel %, RPM, coolant, load).

Not built in H4.2:
- "Play this period" button in History (the playback player exists; it is not yet launched from History).
- Event pins on the track.
- Positions table is not sorted or exportable.

Acceptance checks:
| Check | Status |
| --- | --- |
| Renter cannot pick before window | Pass (unit: clamp and refusal); not browser-verified |
| Track breaks at gaps | Pass (unit via trailUntil split) |
| Gap rows present | Pass (unit) |
| Screenshots 1440 px and 390 px | NOT DONE |
| Playwright scenarios | NOT RUN |
