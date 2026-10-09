# H3 self-check — Screens agree with each other and with the hardware (PARTIAL)
Branch `h3-screens-agree` on top of `h2-correctness-fixes` (cb40581). Not yet a PR: H3.3, H3.5 and the Playwright proofs are still open.

## Results
- Unit suite: `TZ=UTC` 584/584, `TZ=Asia/Dubai` 584/584 (41 files).
- `npx tsc --noEmit`, `npm run lint`, `npm run build`: pass.
- Playwright: NOT run (sandbox blocks the browser download). No screenshots produced yet.

## Items
| Item | Status | Change | Proof |
| --- | --- | --- | --- |
| H3.1 One status function | Done (code) | Map (`app/app/page.tsx`) and dev seed page (`app/dev/seed/page.tsx`) now call `computeStatus` from `@/server/api`; the local copies are deleted. | Typecheck. Map/list statuses equal `expected.ts` in unit tests (`expected.test.ts`). Playwright check not run. |
| H3.2 Pairing rows | Done | `seed/data.ts`: one open pairing per paired tracker (34). History: tr-pu41 on LD-09 until 10 days ago, then PU-41; CR-08 old tracker (spare-3) until 20 days ago, then tr-cr08; FL-09 paired 12 h ago. | `seed/data.test.ts`: 34 open pairings; each asset has exactly one except LD-09 and MW-01 (zero). |
| H3.4 CAN values | Done (unit) | ECU hours now come from the machine, not the tracker IMEI: `telemetry/ecu.ts` (EX-04 anchor 8,420 h, BD-02 14,980 h). The simulator fills supported CAN params only, after the adapter is fitted (`withCanValues`). | `telemetry/can-values.test.ts`: all 34 tracked assets, supported params defined, unsupported undefined; EX-04/BD-02 ECU hours within range in both zones. Screen check not run. |
| H3.6 Rental strip | Done (code) | Renter name = tenant name, or the booking's `renterName` for outside hires; destination on its own line; "until 20:00" on the same Dubai day. | Not covered by a unit test. Playwright check for FB-12 not run. |
| H3.3 Tier gating hides, not disables | NOT DONE | — | — |
| H3.5 `--demo-bar-h` layout offset; "Register one/many" clickable | NOT DONE | — | — |

## Open items
- H3.3: hidden features render as locked cards when Sales view is on; no disabled tabs anywhere.
- H3.5: CSS variable for the demo bar; nothing under the bar at 1440 px or 390 px.
- Playwright proofs for H3.1, H3.4, H3.6 and the screenshots listed in the handoff.
- Stacked on H2 (PR #12). Open the PR once H3 is complete.
