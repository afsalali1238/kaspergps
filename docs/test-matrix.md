# Kasper GPS — scenario → test matrix

Every scenario from spec §13, what proves it, and where. Unit tests are Vitest
(`npx vitest run`), end-to-end tests are Playwright (`npx playwright test`, needs
`npx playwright install chromium` once; the suite starts the dev server itself).

Legend: **U** = unit test file, **E** = end-to-end spec, **demo** = walked through
in `docs/demo-script.md` (visual/clock-driven checks that no test asserts).

| # | Scenario | Covered by |
| --- | --- | --- |
| S1 | Omar — no-CAN fleet, Tier 1 features only | U `access.test.ts` (visibility, `hasCapability`), `capabilities.test.ts`, `expected.ts` anchor expectations; demo |
| S2 | Khalid — EX-04 Engine & fuel | U `muc.test.ts` (ECU hours), `expected.ts` EX-04 tier/features; E `maintenance-cost.spec.ts` (asset screen); demo |
| S3 | Khalid — GR-01 fuel used, gauge not measured | U `expected.ts` feature lists per asset; demo |
| S4 | Lina — own and rented assets on the map | U `access.test.ts` (`isAssetVisible`: own + rented, not EX-07) |
| S5 | Lina — history clipped to the rental | U `access.test.ts` (`rentalWindow`), `links.test.ts`; demo |
| S6 | Lina — clock to one minute before the EX-07 rental | U `access.test.ts` ("EX-07 becomes visible at rental start"); demo (the Clock menu presets) |
| S7 | Ahmed — Dubai Hills site user | U `access.test.ts` (site filtering for Marina site users) |
| S8 | Anil — JVC, own assets and past rentals | U `access.test.ts`, `bookings.test.ts` (past booking windows) |
| S9 | Deepa — two sites, fuel-drop alert | U `access.test.ts`, `capability-reasons.test.ts` (no acknowledge for Site Users) |
| S10 | Fatima — access ended early | U `access.test.ts` (`grantOverrides` on BK-1010), `bookings.test.ts` |
| S11 | Priya — rented-in BD-02 with a fault code | U `access.test.ts`, seed alerts (`al-bd02-fault`), `maintenance.test.ts` (fault-code task) |
| S12 | Priya — EX-04 not found | U `access.test.ts` ("Asset not found for a user who can't see it") |
| S13 | Omar — FB-12 share link then revoke | U `tracking-links.test.ts`, `links.test.ts` (revoked tokens resolve to null); E `public-tracking.spec.ts` |
| S14 | Outside hirer — FB-12 public link | E `public-tracking.spec.ts` (noindex, no referrer, one marker, arrival line) |
| S15 | Khalid — End access now | U `bookings.test.ts` (`endEarly` override survives the nightly check); E demo |
| S16 | Booking simulator — extend BK-1001, cancel BK-1002 | U `bookings.test.ts` (extend/shorten/cancel move the grant window and revoke links) |
| S17 | Ravi — pair a tracker to LD-09 | U `trackers.test.ts` (pair, send test reading); E `demo-shell.spec.ts` (tools menu) |
| S18 | Sara — create a tenant and a Tier 3 asset | U `tenants.test.ts` (create/dup-name/status), `adapters.test.ts` (CAN fit changes tier) |
| S19 | Lina — invite a user | U `team.test.ts` (invite, validation, site scoping) |
| S20 | Phase → Day one | E `maintenance-cost.spec.ts` (Later screens locked), `demo-shell.spec.ts`; U `features.ts` phase gates |
| S21 | Omar — sales view | E `maintenance-cost.spec.ts` baseline; U `features.ts` (`featureVisible` locked cards); demo |
| S22 | Karim — deactivated account | U `access.test.ts` ("Karim (deactivated)"); `api.ts signIn` refuses deactivated users |
| S23 | John — Business Bay + JVC Villas | U `access.test.ts` (multi-site Site User) |
| S24 | Khalid — labels "Project Alpha" | demo (labels UI); U `access.test.ts` keeps labels out of the renter's view |
| S25 | Fatima — Palm Crescent geofence playback | demo; U `expected.ts` anchor expectations |
| S26 | Khalid — Hatta Quarry gate geofence | demo |
| S27 | Omar — WT-07 trips and playback | U `expected.ts` (WT-07 anchor), `features.test.ts`; demo |
| S28 | Lina — EX-04 playback inside the rental | U `access.test.ts` (`rentalWindow`), `features.test.ts` (playback needs speed) |
| S29 | Outside hirer — FB-12 arrival time | U `src/domain/eta.test.ts`; E `public-tracking.spec.ts` (arrival line, ETA off) |
| S30 | Lina — schedules and downloads | demo; U `access.test.ts` (access ends → reports stop) |
| S31 | Khalid — issue and reissue a MUC | U `muc.test.ts` (issue, reissue keeps the seal, verify states); E `certificate.spec.ts` |
| S32 | Tamper with a certificate | U `muc.test.ts` ("detects tampering"); E `certificate.spec.ts` ("tampering in the demo bar makes the next verify red") |
| S33 | Omar — no certificates for Tier 1 | U `muc.test.ts` ("refuses when the asset is not Tier 3") |
| S34 | Fatima — pay an invoice (simulated) | E `billing.spec.ts` (received tab, MUC link, pay, settled); U `billing.test.ts` |
| S35 | Omar — record a part-payment | E `billing.spec.ts` (AED 500 → part-paid, over-payment refused); U `billing.test.ts` |
| S36 | Sara — console billing statements | E `billing.spec.ts` (statements per tenant, generate, over-balance refused); U `billing.test.ts` |
| S37 | Khalid — maintenance board and logging | E `maintenance-cost.spec.ts` (board, headlines, log service, asset tab); U `maintenance.test.ts` |
| S38 | Omar — GPS km and estimated hours plans | U `maintenance.test.ts` (basis labels, FB-14/TP-22 plans) |
| S39 | Khalid — Cost & ROI last month | E `maintenance-cost.spec.ts` (basis chips, totals, asset view); U `cost.test.ts` |
| S40 | Mark — Site User, maintenance view only | E `maintenance-cost.spec.ts` (no New plan / Log service), `maintenance-cost.spec.ts` ("Page not found" for a Site User); U `cost.test.ts` |
| S41 | Phase → Phase 2 | E `maintenance-cost.spec.ts` (locked screens), `demo-shell.spec.ts` (reset to Later) |
| S42 | Sara — onboard "Sharjah Plant Hire" | U `tenants.test.ts` (create), `team.test.ts` (admin invite), `trackers.test.ts` (bulk register + check digit), `adapters.test.ts` (fit ALL-CAN300) |
| S43 | Ravi — register many trackers | U `trackers.test.ts` (bulk register: duplicates, bad SIM/IMEI skipped) |
| S44 | Ravi — pair Priya's MW-01 | U `trackers.test.ts` (request lifecycle: `requests.ts` is pair/decline-driven) |
| S45 | Ravi — fit LVCAN200 to PU-31 | U `adapters.test.ts` ("keeps LVCAN200 for light vehicles only", tier change to 2) |
| S46 | Ravi — new booking, overlapping one | U `bookings.test.ts` (overlap refused, create allowed for owner/Kasper) |
| S47 | Sara — transfer CP-03 | U `access.test.ts` (`getRelationship` for owner/renter/none), `expected.ts` |
| S48 | Khalid — add EX-15, retire EX-07 | U `bookings.test.ts` (refuses a booking on a retired asset), `access.test.ts` (visibility follows ownership) |
| S49 | Lina — add a site and invite a Site User | U `team.test.ts` (site scoping), `access.test.ts` (empty site → no assets) |
| S50 | Sara — Kasper team, last admin rule | U `console staff` rules in `capabilities.test.ts` and `billing.test.ts` statements; demo for the refusal |

## Coverage summary

- Unit: 19 files, 218 tests (`npx vitest run`), covering the domain rules, the
  access layer, capabilities and reasons, billing, MUC seals, bookings, links,
  trackers, requests, adapters, team, tenants, maintenance and cost.
- End-to-end: 5 files, 64 tests (`npx playwright test`), desktop + phone:
  public tracking, certificate verification and tampering, demo shell and console
  shell, billing (S34–S36), maintenance and Cost & ROI.
- Not yet automated: the clock-driven choreography in S6, S25, S26, S30 and the
  map/playback visuals — they are demo steps (see `docs/demo-script.md`), and the
  underlying rules are unit-tested.
