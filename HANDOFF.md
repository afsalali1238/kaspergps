# Kasper GPS — Project Handoff

Status as of 2026-10-12, branch `h4-spec-features`. This file replaces the 2026-10-09 handoff
(commit `595f1cd`). `BUILD_PROMPT.md` is the spec and wins over this file.

## 1. Where things stand

Every number below was produced by a command run on 2026-10-12 in this sandbox. Each command
ran on its own and its exit code was checked.

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `TZ=UTC npx vitest run` | exit 0, 729 / 729 tests, 52 files |
| `TZ=Asia/Dubai npx vitest run` | exit 0, 729 / 729 tests, 52 files |
| `npm run test:coverage` | exit 0, 86.05 % lines (floor 85 %), 82.95 % statements |
| `npm run build` (via the production server on :3000) | exit 0 |
| `npx playwright test` (desktop + phone, Chromium, one machine) | exit 0, 347 passed, 0 failed, 167 skipped by design, 514 entries, 9.3 min |
| Screenshots (`tests/e2e/screenshots.spec.ts`) | 46 PNGs in `reviews/screenshots/P14/` (23 screens at 1440 and 390 px) |

- **The GitHub Actions run has not happened.** `.github/workflows/ci.yml` changes (3 e2e shards)
  are tested only locally. Treat the first CI run on GitHub as the real check.
- The 167 skips are intentional: desktop-only specs skip on phone, the phone-layout specs skip on
  desktop, the screenshot spec runs once (desktop), and S18 "Onboard a company" skips below 900 px.

## 2. Phase by phase (P1–P14)

"Done" means the phase's checks in `BUILD_PROMPT.md` §15 pass and a test or screenshot shows it.
"Gaps" means the phase works, but a check is not proven or a spec item is missing. Each Gaps line
is a known limit, not a hidden one.

| Phase | Status | Evidence | Gaps still open |
| --- | --- | --- | --- |
| P1 Foundation | Done | typecheck, lint, build; `phone-layout.spec.ts` measures 390 px overflow | — |
| P2 Domain, seed, clock, telemetry | Gaps | `seed/data.test.ts`, `clock.test.ts` (3 zones), `planned-overspeed.test.ts` | §8 scenario overrides not built: harsh events (TP-21), towing (LB-05), BD-02 DTC. The old note "no CAN readings" is out of date: the simulator writes CAN fields for every field an adapter supports. |
| P3 Access layer and API | Done | `api-visibility.test.ts` (7), `api-gate.test.ts`, S1–S12 scenario runs | — |
| P4 Demo bar, sign-in, shell | Gaps | `demo-shell.spec.ts`, `phone-layout.spec.ts`, 50 walkthrough runs | Customer nav for tenants (Certificates, Billing, Maintenance, Cost) may drop out at some widths. Not re-verified this round. |
| P5 Map and asset list | Done | `h4-map-labels.spec.ts`: clustering, URL filters that survive Back, tile-error state with Retry | The "rented" ring is an outline in the marker code (`app/app/page.tsx`); no test asserts it. |
| P6 Asset detail | Done | `f2-screens.spec.ts`, S2/S3/S5 runs, screenshots at both widths | — |
| P7 Alerts | Gaps | S9 run, `alerts` tests | Alerts are seeded. Nothing is generated from telemetry, so "no replay alerts" is not exercised. |
| P8 Reports | Gaps | `reports.test.ts`, S8 run; geofence report added (H4.4) | PDF and Excel bytes are not decoded by any test. Totals are checked on the shared table that both formats are built from. |
| P9 Rentals, tracking links, public page | Done | `public-tracking.spec.ts` (7): `noindex`, `no-referrer`, inactive copy, two-tab revoke within 30 s | QR code on the certificate is not decoded by any test. |
| P10 Admin: users, sites, assets, console | Done | `asset-admin-rules.test.ts` (29), `h4-geofences-settings.spec.ts` (5), S17–S22 and S42–S50 runs | Hardware fields are read-only by design ("Contact Kasper to change hardware"). |
| P11 Multiple sites, labels, geofences | Gaps | `h4-map-labels.spec.ts`, `geofence-admin.test.ts` (13), `geofences.test.ts` | Rename from the row's Edit button is covered by e2e. A new shape, the delete, and the site-fence lock are unit-tested only. Drag-to-draw (`@geoman-io/leaflet-geoman-free`, `GeofenceMap.tsx`) is wired but has no e2e test. |
| P12 Trip playback, ETA, downloads, schedules | Gaps | `playback.test.ts`, `playback-motion.spec.ts` (4), S27–S30 runs | Pins built: over-speed, fuel drop (Tier 2/3), own geofence enter and exit, click to jump. Not built: harsh, towing, power-cut and refuel pins, and pins on the map. The gap banner is rendered and unit-tested. |
| P13 MUC, billing, payments, console billing | Gaps | `muc.test.ts`, `S31-S36.spec.ts` (tamper case included), `certificate.spec.ts` | QR not decoded by a test. `muc.test.ts` takes about 9 s. |
| P14 Maintenance, cost & ROI, Arabic, final pass | Gaps | `maintenance-cost.spec.ts` (10), S37–S41 runs, `i18n.test.tsx` | Arabic is a first draft and needs a native reviewer. Export filenames and PDF/Excel headers stay in English. Long ROI copy is English. |

Earlier rounds H1–H3 merged to `main` (PR #11, #12, #13) before this branch.

## 3. What changed this round (H4–H7)

- **Playback (H4.1, H4.2):** pins on the scrubber with click to jump; "Play this period" in the
  History tab; AdBlue row in the readout. The simulator now plans a 104 km/h over-speed for WT-07
  yesterday, as spec §8 and S27 require.
- **Labels, geofences, settings (H4.3–H4.5):** bulk add and remove; label limits (40 characters,
  unique per company, 20 per asset); circle and polygon geofences with a map overlay switch; edit (rename, new shape, alert switches) and delete; asset
  "Inside: …" line; geofence report; site geofence; Add asset, retire and reinstate, and site delete
  rules, all saved and audited.
- **Map (H4.6):** filters in the URL, clustering, tile-error notice with Retry.
- **Demo bar at 390 px (H4.7):** the bar wraps instead of scrolling; the page offset follows its
  measured height.
- **Cost & ROI (H4.8):** tagged "Draft".
- **Public and verify pages (H5):** 30 s refresh, `storage` listener, ETA lines, tamper copy.
- **Clock fix:** times were shifted by Dubai's offset twice on any machine outside Dubai, so 19:00
  could show as 23:00. Times are now formatted in Dubai directly (`src/lib/clock.ts`).
- **Arabic fixes:** the "last updated" line showed the literal `({ago})`, and several keys had
  placeholders that no caller filled (for example `{company}` in the end-access note). Nine
  alert-word entries with unfilled placeholders were removed, so those alerts show their English
  sentence instead of a broken Arabic one. See section 6.

## 4. How to run it

```bash
npm ci
npm run dev                       # http://localhost:3000
npm test                          # unit tests
npx playwright install chromium   # once
npx playwright test               # desktop + phone e2e (CI uses next build && next start)
npx playwright test tests/e2e/screenshots.spec.ts --project=desktop   # regenerates reviews/screenshots/P14
```

Sign in with any seeded email (for example `sara@kasper.ae` or `omar@alnoor.ae`) and any non-empty
password. The demo bar's "View as" menu switches users.

## 5. CI

`.github/workflows/ci.yml`:

- `checks`: typecheck, lint, unit tests and the 85 % line-coverage floor.
- `e2e`: three matrix shards (`npx playwright test --shard=N/3`), each running desktop and phone,
  with a 30-minute timeout. Each shard uploads `playwright-report-shard-N`, on success and failure.

## 6. Production notes (corrected from the 2026-10-09 handoff)

The earlier handoff had four errors. They are fixed here.

- **Data layer is `src/server/db.ts`.** There is no `store.ts`. It is a Zustand store persisted to
  `localStorage` under `kasper.db.v1`, and it is the only place data lives.
- **Telemetry is not webhooks.** The Teltonika FMC130 does not call webhooks. It sends Codec 8 or
  Codec 8 Extended frames over TCP or UDP to an ingestion server: Traccar, Kasper's own listener, or
  AWS IoT Core in front of it. That server writes readings to the database. What gets replaced is
  `src/server/telemetry/simulator.ts`.
- **Every `api.ts` function becomes a server endpoint** that checks `can` (`src/server/capabilities.ts`).
  `src/server/api-gate.test.ts` keeps the list honest: every export is pure, gated, or on the debt
  list.
- **Auth replaces `signIn`.** The prototype's `signIn` (`src/server/api.ts`) accepts any non-empty
  password for a seeded email. Real authentication replaces it. The demo bar, `/dev/*` pages and the
  scenarios menu are prototype-only.
- **Database:** replace the seed and `src/server/db.ts` with a real database (Postgres with an ORM
  such as Prisma or Drizzle, as the team chooses).

## 7. Known gaps and open decisions

- **Hosting is undecided.** Either a deployment or a run guide for the team has to be chosen.
- **Arabic is a first draft.** A native reviewer must check every string (see section 8).
- **Event pins are partial** (see the P12 row). Harsh, towing, power-cut and refuel pins, and map
  pins, are not built, and the matching simulator overrides (TP-21, LB-05, BD-02) do not exist.
  Scenarios S27–S30 do not claim more than what is built.
- **The S1–S50 walkthrough run proves each scenario runs start to finish from the Scenarios menu**,
  and that each card shows its "What you should see" text. It does not assert every expectation
  written in `src/components/demo/walkthroughs.ts`. Those assertions live in the per-scenario specs.
- **Not re-verified:** the tenant customer nav (P4 row).
- **Geofence assets scope cannot be edited** once a fence exists; the Kind and Assets fields are disabled while editing.
- **Coverage margin is small:** 85.96 % lines against an 85 % floor. New code needs tests with it.
- **CI on GitHub is unproven** (see section 1).

## 8. Draft Arabic keys (`public/locales/ar.json`)

`_meta.status` is "Draft — needs native review". Every Arabic string is a first draft, not only the
keys listed here. The list below is generated by comparing `git show eb70c32:public/locales/ar.json`
with the working tree (`eb70c32` is the 8 October merge).

- 98 keys were added since 8 October. Those marked *(uncommitted)* are not yet in `HEAD`.
- Two existing values were corrected: `map.updated_ago` and `asset_detail.last_updated`.
- Nine `alerts.words.*` entries were removed. They carried placeholders that no caller filled.
  Those alerts now show their English sentence in Arabic mode until the sentences are parameterised.
- Seven added keys have no exact string caller in `app/` or `src/`. They may be reached through a
  computed key, or they may be unused. The native reviewer should decide whether to delete them:
  `settings.assets.starts_as`, `maintenance.plan_due_soon_label`, `cost.roi_revenue_to_date`,
  `cost.roi_cost_to_date`, `cost.roi_net`, `cost.roi_purchase_value`, `cost.roi_profile_title`.
- The End-access note (`asset_detail.end_access.body`) gained `{company}` and `{code}` parameters.
  Its Arabic wording says something different from the English draft, and needs review.

Added keys (98), grouped by section:

- **asset_detail** (12): `asset_detail.geofence.inside` *(uncommitted)*, `asset_detail.geofence.outside` *(uncommitted)*, `asset_detail.overview.km`, `asset_detail.overview.since_midnight`, `asset_detail.overview.tracker_battery`, `asset_detail.trips.play`, `asset_detail.trips.play_col`, `asset_detail.utilisation.day_split`, `asset_detail.utilisation.ignition_note`, `asset_detail.utilisation.not_billing_grade`, `asset_detail.utilisation.source_ignition`, `asset_detail.utilisation.split`
- **cost** (18): `cost.roi_calc`, `cost.roi_cost_to_date`, `cost.roi_cumulative`, `cost.roi_drawer_title`, `cost.roi_edit_profile`, `cost.roi_net`, `cost.roi_payback`, `cost.roi_payback_months`, `cost.roi_percentage`, `cost.roi_profile_finance`, `cost.roi_profile_insurance`, `cost.roi_profile_operator`, `cost.roi_profile_purchase`, `cost.roi_profile_save`, `cost.roi_profile_saved`, `cost.roi_profile_title`, `cost.roi_purchase_value`, `cost.roi_revenue_to_date`
- **geofences** (4): `geofences.draw_first`, `geofences.draw_hint`, `geofences.no_shape`, `geofences.radius_hint`
- **maintenance** (22): `maintenance.confirm_log`, `maintenance.confirm_log_success`, `maintenance.cost_label`, `maintenance.date_label`, `maintenance.log_service_reset_note`, `maintenance.log_service_title`, `maintenance.notes_label`, `maintenance.notes_placeholder`, `maintenance.plan_basis_label`, `maintenance.plan_due_soon_hint`, `maintenance.plan_due_soon_label`, `maintenance.plan_interval_label`, `maintenance.plan_last_done_date`, `maintenance.plan_last_done_value`, `maintenance.plan_name_label`, `maintenance.plan_name_placeholder`, `maintenance.plan_save`, `maintenance.plan_saved_success`, `maintenance.plan_title_edit`, `maintenance.plan_title_new`, `maintenance.reading_label`, `maintenance.tier_note`
- **map** (12): `map.bulk.add_label`, `map.bulk.clear`, `map.bulk.label_name`, `map.bulk.pick_label`, `map.bulk.remove_action`, `map.bulk.remove_label`, `map.bulk.selected`, `map.filters.all_sites`, `map.filters.geofences`, `map.filters.labels`, `map.kpi.litres_short`, `map.tiles_failed` *(uncommitted)*
- **reports** (2): `reports.pick_label`, `reports.scope_label`
- **settings** (27): `settings.assets.add_title`, `settings.assets.hw_adapter` *(uncommitted)*, `settings.assets.hw_locked` *(uncommitted)*, `settings.assets.hw_none` *(uncommitted)*, `settings.assets.hw_tracker` *(uncommitted)*, `settings.assets.plate`, `settings.assets.reinstate`, `settings.assets.request_tracker` *(uncommitted)*, `settings.assets.starts_as`, `settings.assets.tank`, `settings.assets.year`, `settings.labels.assets`, `settings.labels.confirm_delete`, `settings.labels.empty`, `settings.labels.hint`, `settings.labels.name`, `settings.labels.title`, `settings.sites.add_title`, `settings.sites.edit`, `settings.sites.geofence_made` *(uncommitted)*, `settings.sites.make_geofence` *(uncommitted)*, `settings.sites.no_location`, `settings.sites.picked`, `settings.sites.search_area`, `settings.sites.search_placeholder`, `settings.tabs.labels`, `settings.users.edit_sites`
- **shell** (1): `shell.not_in_your_role`

## 9. Housekeeping and decisions for the owner

- **Stale branches** `arena/137d2ee8`, `arena/53555479`, `arena/cdd2374a` and `arena/eeb42ef3`: do
  not merge. The owner deletes them.
- **Windows clone** `C:\Users\HP\Desktop\antigravity\Gpsarena\kaspergps` has seven uncommitted
  files, including `team.ts` with `input.role === 'site_user'`. Do not overwrite them without asking
  the owner.

## 10. Files to know

- `BUILD_PROMPT.md`: the spec. It wins over this file.
- `reviews/P<n>-self-check.md`, `reviews/H<n>-self-check.md`: acceptance evidence per phase and per H item.
- `reviews/screenshots/P14/`: `<user>-<screen>-<width>.png` at 1440 and 390 px (46 files).
- `docs/demo-script.md` and `docs/test-matrix.md`: the walkthrough and the scenario-to-test map.
