# Kasper GPS — Project Handoff

Status as of 2026-10-12, branch `h4-spec-features`. This file replaces the 2026-10-09 handoff.

## 1. Where things stand

- All 14 phases of `BUILD_PROMPT.md` are in the tree. The H4 (features), H5 (public tracking
  and verify pages), H6 (CI) and H7 (screenshots, this file) work is done.
- Checks run in this sandbox on 2026-10-12. Each command below was run and its result is
  the one shown:

| Check | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` under `TZ=UTC` and `TZ=Asia/Dubai` | 697 / 697 passed, 50 files, both zones |
| `npm run test:coverage` (85 % line floor) | 85.62 % lines, passes |
| `npx playwright test` (desktop + phone, Chromium) | 253 passed, 0 failed, 75 skipped by design |
| Screenshots (`tests/e2e/screenshots.spec.ts`) | 26 PNGs in `reviews/screenshots/P14/` |

- **The GitHub Actions run has not happened yet.** The workflow changes below are untested on
  GitHub. The same commands pass locally, but treat the first CI run as the real check.
- The 75 skips are intentional: console specs and desktop-only specs skip on the phone
  project, the phone layout spec and the screenshot spec skip on desktop, and the S18
  "Onboard a company" test skips below 900 px.

## 2. What changed this round

- **Map (H4.3, H4.6):** labels on assets (create, rename, delete, bulk add and remove);
  clustering with `leaflet.markercluster`; map filters are kept in the address bar and come back on Back.
- **Geofences (H4.4):** circle and polygon drawing with `@geoman-io/leaflet-geoman-free`,
  a radius of 50–5,000 m and 3–30 polygon points, an overlay switch on the map, and events that
  need the next reading to confirm them.
- **Settings (H4.5):** Add asset and Add site create records; retire and reinstate work;
  a site's delete is blocked while anything depends on it; the labels tab.
- **Demo bar (H4.7):** the bar wraps on a phone instead of hiding its right-hand controls in a
  scrolling box. The page offset follows the bar's measured height.
- **Cost & ROI (H4.8):** tagged "Draft".
- **Verify page (H5.4):** `app/verify/[number]/page.tsx` shows the exact tamper and voided copy;
  `tests/e2e/certificate.spec.ts` covers the voided-and-replaced path.
- **Clock fix:** formatted times and dates were shifted by Dubai's offset twice on any machine
  outside Dubai's time zone, so the same moment could show as 23:00 instead of 19:00. Times are
  now formatted in Dubai directly, and `isoFromDubai` reads an offset-bearing string as written.
  Covered by `src/lib/clock.test.ts` under three zones.
- **Real bugs found by the new tests:** a share link closed the panel before it could be copied
  (fixed); creating a geofence crashed the page (fixed).

## 3. How to run it

```bash
npm ci
npm run dev                       # http://localhost:3000
npm test                          # unit tests
npx playwright install chromium   # once
npx playwright test               # desktop + phone e2e (CI uses next build && next start)
npx playwright test tests/e2e/screenshots.spec.ts --project=desktop   # regenerates reviews/screenshots/P14
```

Sign in with any dummy user email (for example `sara@kasper.ae`, `omar@alnoor.ae`) and any password.
The demo bar's "View as" menu switches users.

## 4. CI

`.github/workflows/ci.yml`:

- `checks`: typecheck, lint, unit tests and the 85 % coverage floor.
- `e2e`: three matrix shards (`npx playwright test --shard=N/3`), each running desktop and
  phone. Each shard uploads its own `playwright-report-shard-N` artifact, on success and on failure.

## 5. Known gaps and open decisions

- **Hosting is undecided.** The prototype runs from a production build on a machine. Either a
  deployment or a run guide for the team is still to be chosen.
- **Arabic is a first draft.** See section 6. A native reviewer has to check it before it ships.
- **Not re-verified this round:** the customer nav for tenants (`reviews/P4-self-check.md`
  flagged that Certificates, Billing and Maintenance can drop out at some widths). Check it on the
  first walkthrough.
- **Production work** (from section 5 of the original handoff, unchanged): a real database in
  place of `src/server/db.ts` and the seed; real authentication in place of the mock session;
  telemetry ingestion from Teltonika FMC130 trackers in place of `src/server/telemetry/`;
  server-side enforcement of `src/server/api.ts` as REST, tRPC or GraphQL guards.
- **Coverage margin is small** (85.62 % against a 85 % floor). New code needs tests with it.

## 6. Draft Arabic keys (`public/locales/ar.json`)

`_meta.status` is "Draft — needs native review". Every Arabic string in the file is a
first draft, not only the keys below. The list is every key added since the 8 October merge
(`eb70c32`). The 35 marked *(uncommitted)* were added this round and were not yet in a commit.

- `asset_detail.overview.km`
- `asset_detail.overview.since_midnight`
- `asset_detail.overview.tracker_battery`
- `asset_detail.trips.play`
- `asset_detail.trips.play_col`
- `asset_detail.utilisation.day_split`
- `asset_detail.utilisation.ignition_note`
- `asset_detail.utilisation.not_billing_grade`
- `asset_detail.utilisation.source_ignition`
- `asset_detail.utilisation.split`
- `cost.roi_calc`
- `cost.roi_cost_to_date`
- `cost.roi_cumulative`
- `cost.roi_drawer_title`
- `cost.roi_edit_profile`
- `cost.roi_net`
- `cost.roi_payback`
- `cost.roi_payback_months`
- `cost.roi_percentage`
- `cost.roi_profile_finance`
- `cost.roi_profile_insurance`
- `cost.roi_profile_operator`
- `cost.roi_profile_purchase`
- `cost.roi_profile_save`
- `cost.roi_profile_saved`
- `cost.roi_profile_title`
- `cost.roi_purchase_value`
- `cost.roi_revenue_to_date`
- `geofences.draw_first` *(uncommitted)*
- `geofences.draw_hint` *(uncommitted)*
- `geofences.no_shape` *(uncommitted)*
- `geofences.radius_hint` *(uncommitted)*
- `maintenance.confirm_log`
- `maintenance.confirm_log_success`
- `maintenance.cost_label`
- `maintenance.date_label`
- `maintenance.log_service_reset_note`
- `maintenance.log_service_title`
- `maintenance.notes_label`
- `maintenance.notes_placeholder`
- `maintenance.plan_basis_label`
- `maintenance.plan_due_soon_hint`
- `maintenance.plan_due_soon_label`
- `maintenance.plan_interval_label`
- `maintenance.plan_last_done_date`
- `maintenance.plan_last_done_value`
- `maintenance.plan_name_label`
- `maintenance.plan_name_placeholder`
- `maintenance.plan_save`
- `maintenance.plan_saved_success`
- `maintenance.plan_title_edit`
- `maintenance.plan_title_new`
- `maintenance.reading_label`
- `maintenance.tier_note`
- `map.bulk.add_label` *(uncommitted)*
- `map.bulk.clear` *(uncommitted)*
- `map.bulk.label_name` *(uncommitted)*
- `map.bulk.pick_label` *(uncommitted)*
- `map.bulk.remove_action` *(uncommitted)*
- `map.bulk.remove_label` *(uncommitted)*
- `map.bulk.selected` *(uncommitted)*
- `map.filters.all_sites` *(uncommitted)*
- `map.filters.geofences` *(uncommitted)*
- `map.filters.labels` *(uncommitted)*
- `map.kpi.litres_short`
- `reports.pick_label` *(uncommitted)*
- `reports.scope_label` *(uncommitted)*
- `settings.assets.add_title` *(uncommitted)*
- `settings.assets.plate` *(uncommitted)*
- `settings.assets.reinstate` *(uncommitted)*
- `settings.assets.starts_as` *(uncommitted)*
- `settings.assets.tank` *(uncommitted)*
- `settings.assets.year` *(uncommitted)*
- `settings.labels.assets` *(uncommitted)*
- `settings.labels.confirm_delete` *(uncommitted)*
- `settings.labels.empty` *(uncommitted)*
- `settings.labels.hint` *(uncommitted)*
- `settings.labels.name` *(uncommitted)*
- `settings.labels.title` *(uncommitted)*
- `settings.sites.add_title` *(uncommitted)*
- `settings.sites.edit` *(uncommitted)*
- `settings.sites.no_location` *(uncommitted)*
- `settings.sites.picked` *(uncommitted)*
- `settings.sites.search_area` *(uncommitted)*
- `settings.sites.search_placeholder` *(uncommitted)*
- `settings.tabs.labels` *(uncommitted)*
- `settings.users.edit_sites`
- `shell.not_in_your_role`

## 7. Files to know

- `BUILD_PROMPT.md`: the spec. It wins over this file.
- `reviews/P<n>-self-check.md` and `reviews/H<n>-self-check.md`: the acceptance evidence per phase and per H item.
- `reviews/screenshots/P14/`: `<user>-<screen>-<width>.png` at 1440 and 390 px.
- `docs/demo-script.md` and `docs/test-matrix.md`: the walkthrough and the scenario-to-test map.
