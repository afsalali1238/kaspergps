# H3 self-check — Screens agree with each other and with the hardware
Branch `h3-screens-agree` on top of `h2-correctness-fixes` (PR #12). All H3 code items are in; the Playwright proofs and screenshots are NOT run (sandbox cannot download the browser) and belong to CI.

## Results
- Unit suite: `TZ=UTC` 588/588, `TZ=Asia/Dubai` 588/588 (42 files).
- `npx tsc --noEmit`, `npm run lint`, `npm run build`: pass.
- Playwright: NOT run (sandbox blocks the browser download). No screenshots produced yet.

## Items
| Item | Status | Change | Proof |
| --- | --- | --- | --- |
| H3.1 One status function | Done (code) | Map (`app/app/page.tsx`) and dev seed page (`app/dev/seed/page.tsx`) now call `computeStatus` from `@/server/api`; the local copies are deleted. | Typecheck. Map/list statuses equal `expected.ts` in unit tests (`expected.test.ts`). Playwright check not run. |
| H3.2 Pairing rows | Done | `seed/data.ts`: one open pairing per paired tracker (34). History: tr-pu41 on LD-09 until 10 days ago, then PU-41; CR-08 old tracker (spare-3) until 20 days ago, then tr-cr08; FL-09 paired 12 h ago. | `seed/data.test.ts`: 34 open pairings; each asset has exactly one except LD-09 and MW-01 (zero). |
| H3.4 CAN values | Done (unit) | ECU hours now come from the machine, not the tracker IMEI: `telemetry/ecu.ts` (EX-04 anchor 8,420 h, BD-02 14,980 h). The simulator fills supported CAN params only, after the adapter is fitted (`withCanValues`). | `telemetry/can-values.test.ts`: all 34 tracked assets, supported params defined, unsupported undefined; EX-04/BD-02 ECU hours within range in both zones. Screen check not run. |
| H3.6 Rental strip | Done (code) | Renter name = tenant name, or the booking's `renterName` for outside hires; destination on its own line; "until 20:00" on the same Dubai day. | Not covered by a unit test. Playwright check for FB-12 not run. |
| H3.3 Tier gating hides, not disables | Done (code) | Asset tabs are hidden, not disabled (`isFeatureVisible`); an open tab that becomes hidden falls back to Overview. Sales view shows locked cards on Overview (`lockedFeatures` in `domain/features.ts`): "Needs ALL-CAN300 (Tier 3)". | `domain/locked-features.test.ts` (phase rules, locked reasons, owned features never locked). Playwright (Omar's FB-12 tabs, Sales view cards) not run. |
| H3.5 `--demo-bar-h` layout offset; "Register one/many" clickable | Done (code) | `--demo-bar-h: 36px` on `:root`; body padded by it; the bar and the app header use it. The inline 36 px offset is gone. | Playwright "Register one" click and 1440/390 px screenshots not run. |

## Open items
- Playwright proofs for H3.1, H3.3, H3.4, H3.5 and H3.6, and the screenshots the handoff lists (Omar's map, Lina's map, EX-04 as Khalid and Lina, FB-12 as Omar, /console/trackers as Ravi, at 1440 px and 390 px).
- Sales view on the map and list still needs checking for engine/fuel columns on Tier 1 assets (H3.3 proof: "no Engine & fuel, fuel, RPM or Certificates anywhere" for Omar).
- Stacked on H2 (PR #12); the PR diff against main includes H2 until #12 merges.
