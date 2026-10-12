# Kasper GPS — Project Handoff

Status as of 2026-10-12, branch `arena/0968f813-kaspergps` (PR: J5 items 1–4, the four unbacked
alerts, J6.6 Arabic; then J6 — every §11.15 playback pin). This file replaces the 2026-10-12 16:00
handoff on `h4-spec-features`. `BUILD_PROMPT.md` is the spec and wins over this file; the owner's
decisions in section 9 win over the spec.

## 1. Where things stand

Every number below was produced by a command run on 2026-10-12 in this sandbox. Each command ran on
its own and its exit code was checked.

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `TZ=UTC npx vitest run` | exit 0, **884 / 884 tests, 63 files, 0 todo** |
| `TZ=Asia/Dubai npx vitest run` | exit 0, 884 / 884 tests |
| `npm run test:coverage` | exit 0, 85.5 % statements, **88.44 % lines** (floor 85 %) |
| `npm run build` | exit 0 (production server on :3000 serves it) |
| `npx playwright test` (desktop + phone, Chromium, one worker) | exit 0, **369 passed, 0 failed, 203 skipped by design**, 572 entries, 8.3 min |
| Screenshots, §15 review set (`tests/e2e/screenshots.spec.ts`) | 46 PNGs in `reviews/screenshots/P14/` (23 screens at 1440 and 390 px) |
| Screenshots, J5 proof (`tests/e2e/j5-proof.spec.ts`) | 19 PNGs in `reviews/screenshots/J5/` (Features panel × 3 users, Engine & fuel × 4 assets, map × 2 widths + List tab, hirer tracking) |
| Screenshots, J6 proof (`tests/e2e/j6-proof.spec.ts`) | 6 PNGs in `reviews/screenshots/J6/` (LB-05 towing + trip pins, WT-07 single trip, EX-04 7-day fuel, each at 1440 and 390 px) |

- **There is no `it.todo` left in `src/`.** The four seeded alerts that had no readings behind them
  are real tests now (section 3).
- The 203 skips are intentional: desktop-only specs skip on phone, the phone-layout specs skip on
  desktop, the three capture specs run once (desktop) and S18 "Onboard a company" skips below 900 px.
- Every number in this table was re-run on `main` (`2493e4d`) plus this branch's playback work, so it
  describes the tree that would be pushed, not the older branch snapshot.
- Repository baseline: 818 passed + 4 todo before this branch; the earlier note that quoted 729/729
  was stale.

## 2. Phase by phase (P1–P14)

"Done" means the phase's checks in `BUILD_PROMPT.md` §15 pass and a test or screenshot shows it.
"Gaps" means the phase works, but a check is not proven or a spec item is missing. Each Gaps line is
a known limit, not a hidden one.

| Phase | Status | Evidence | Gaps still open |
| --- | --- | --- | --- |
| P1 Foundation | Done | typecheck, lint, build; `phone-layout.spec.ts` measures 390 px overflow | — |
| P2 Domain, seed, clock, telemetry | Done | `seed/data.test.ts`, `clock.test.ts` (3 zones), `planned-overspeed.test.ts`, `alerts-truthful.test.ts` (17) | §8 scenario overrides are now all built: TP-21's three harsh events, LB-05's towing, PU-51's idle, EX-11's power cut, GR-01's after-hours move, BD-02's DTC. Anything the spec adds later needs its own override. |
| P3 Access layer and API | Done | `api-visibility.test.ts` (7), `api-gate.test.ts`, S1–S12 scenario runs | — |
| P4 Demo bar, sign-in, shell | Done | `demo-shell.spec.ts`, `phone-layout.spec.ts`, `j5-nav-widths.spec.ts` (5 widths), 50 walkthrough runs | The tenant nav items stay on screen at 390–1440 px (proved). |
| P5 Map and asset list | Done | `h4-map-labels.spec.ts`: clustering, URL filters that survive Back, tile-error state with Retry; J5.4 layout in `j5-proof.spec.ts` | The "rented" ring is an outline in the marker code (`app/app/page.tsx`); no test asserts it. |
| P6 Asset detail | Done | `f2-screens.spec.ts`, S2/S3/S5 runs, `j5-proof.spec.ts` (Engine & fuel at 1440 and 390 px) | — |
| P7 Alerts | Gaps | S9 run, `alerts` tests, `alerts-truthful.test.ts` | Alerts are still seeded. Nothing is generated from telemetry at runtime, so "no replay alerts" is not exercised; the four scripted events are simulator overrides, not an alert engine. |
| P8 Reports | Gaps | `reports.test.ts`, S8 run; geofence report added (H4.4) | PDF and Excel bytes are not decoded by any test. Totals are checked on the shared table that both formats are built from. |
| P9 Rentals, tracking links, public page | Done | `public-tracking.spec.ts` (7): `noindex`, `no-referrer`, inactive copy, two-tab revoke within 30 s; J5.1 map marker | QR code on the certificate is not decoded by any test. |
| P10 Admin: users, sites, assets, console | Done | `asset-admin-rules.test.ts` (29), `h4-geofences-settings.spec.ts` (5), S17–S22 and S42–S50 runs | Hardware fields are read-only by design ("Contact Kasper to change hardware"). |
| P11 Multiple sites, labels, geofences | Gaps | `h4-map-labels.spec.ts`, `geofence-admin.test.ts` (13), `geofences.test.ts` | Rename from the row's Edit button is covered by e2e. A new shape, the delete, and the site-fence lock are unit-tested only. Drag-to-draw (`@geoman-io/leaflet-geoman-free`, `GeofenceMap.tsx`) is wired but has no e2e test. |
| P12 Trip playback, ETA, downloads, schedules | Gaps | `playback.test.ts` (37), `trips.test.ts` (9), `playback-pins.test.ts` (7), `playback-motion.spec.ts` (5), S27–S30 runs | Every pin in §11.15 is built: trip start/stop, harsh, over-speed, geofence enter/exit, refuel and fuel drop (Tier 2/3), power cut, towing — on the scrubber and on the map, click to jump (see section 3a). Trip boundaries are pinned only when the window holds ≤ 3 trips (a working machine makes 60+ micro-trips a week); the Trips tab list is never filtered. The gap banner is rendered and unit-tested. |
| P13 MUC, billing, payments, console billing | Gaps | `muc.test.ts`, `S31-S36.spec.ts` (tamper case included), `certificate.spec.ts` | QR not decoded by a test. `muc.test.ts` takes about 9 s. |
| P14 Maintenance, cost & ROI, Arabic, final pass | Gaps | `maintenance-cost.spec.ts` (10), S37–S41 runs, `i18n.test.tsx` (21) | Arabic is a first draft and needs a native reviewer (section 8). Export filenames and PDF/Excel headers stay in English. Long ROI copy is English. |

Earlier rounds H1–H3 merged to `main` (PR #11, #12, #13), then H4–H7 (PR from `h4-spec-features`),
then the J5 nav-width track (PR #23).

## 3. What changed in this round (J5 items 1–4, J6.6, the four unbacked alerts)

- **J5.1 public tracking page** (`app/t/[token]/page.tsx`): a Leaflet map with one marker for the live
  link, re-read every 30 s (plus a `storage` listener), and the ETA line. A revoked or unknown token
  shows exactly one sentence — "This tracking link is no longer active." — with no asset name, map or
  position.
- **J5.2 Features panel** (`src/components/demo/FeaturesPanel.tsx`, `src/server/capability-catalog.ts`):
  opened from the demo bar's `Features` button. It answers "who am I, what can I do, what is in front
  of me": identity (name, company, role, sites, one line on the role's purpose), the §10.2 capability
  groups with ✓/✕, a plain-words scope per row and the reason from `capability-reasons.ts` on every ✕,
  the hardware in view (tier sentence plus every §6.3 feature ✓/✕ with its reason) and the "Right now"
  counts. Capability names are words ("View telemetry"), never ids.
- **J5.3 Engine & fuel tab** (`src/components/assets/EngineFuelPanel.tsx`, `src/server/utilisation.ts`):
  engine hours with the source that measured them (**ECU / ECU · partial / Estimated** only), RPM,
  coolant and load, the 7-day fuel chart with refuel ▲ and drop ▼ markers (GN-01's 02:10 drop), fuel
  used per day with its source, AdBlue or "Not measured", and fault codes in plain words (BD-02:
  `SPN 110 FMI 0` — "Engine coolant temperature high"). "Today's ignition-on time" is always
  Estimated.
- **J5.4 map layout** (`app/app/page.tsx`): filters above both panes, the asset list in a 22 rem
  column beside the map on desktop (first asset on screen without scrolling at 1440×900), and
  `Map` / `List` tabs at phone width (List is the default). The asset-code badge never wraps.
- **The four seeded alerts the readings did not back** are now backed by the simulator and tested:
  TP-21 (3 harsh events: 5 Oct 06:20 brake, 5 Oct 07:42 accel, 6 Oct 07:17 corner), PU-51 (engine on,
  standing at Dubai Hills 21:00–23:30 on 5 Oct), EX-11 (0 V from 03:30 to 04:15 on 6 Oct at Ras Al
  Khor Yard, internal battery 3.5–3.8 V — the TP-23 pattern), GR-01 (out of the Al Quoz Yard fence at
  23:40, back inside by 23:53 on 5 Oct). See section 9 for the two decisions this took.
- **J6.6 Arabic:** only 7 keys were missing — `asset_detail.engine.ecu_hours_partial`, `fuel_week`,
  `used_l`, `source`, `events`, `no_level_gauge`, `no_faults`. The new screen copy reuses the keys
  that already existed (`ecu_hours`, `fuel_used_per_day`, `fault_codes`, `adblue`,
  `asset_detail.utilisation.source_ignition`, `map.map_tab`, `map.list_tab`) instead of duplicating
  them. `i18n.test.tsx` passes; "Draft — needs native review" stays.
- **Two recharts fixes** for the fuel chart: an explicit `YAxis width={42}` with a `tickFormatter` for
  `%` (a `unit` collides with the tick labels) and `isAnimationActive={false}` so a screenshot is not
  taken mid-animation.

## 3a. What changed in this round (J6: the missing playback event pins)

- **Every §11.15 pin kind is built** (`src/domain/playback.ts` `buildPins`): trip start/stop,
  harsh (in words), over-speed, refuel, fuel drop, power cut, towing and the viewer's own
  geofence enter/exit. Each pin carries the position the readings put the machine at, so the
  player draws them **on the map** as well as on the scrubber, and clicking either jumps the
  playhead there.
- **The player** (`src/components/playback/TripPlayer.tsx`) colours the pins per kind, explains
  them in a legend, and stacks pins that are close in time into rows so one pin can never cover
  another (a 7-day window can hold a trip's end and an over-speed two minutes apart).
- **The trip rule now lives in one place** (`src/domain/trips.ts`), read by both the Trips tab
  and the playback pins. Fixing a real bug on the way: the old rule measured time since the
  previous reading, so a machine reporting every 30 s while idling **never ended its trip**; it
  now measures five minutes from the first reading that shows the machine standing, and a
  stopped machine adds no distance or top speed to the trip it ends.
- **Decisions taken** (see `reviews/J6-self-check.md`): trip-boundary pins appear only in windows
  of ≤ 3 trips, and a trip's end is its last driving reading. New thresholds:
  `FUEL_REFUEL_RISE_PCT`, `POWER_CUT_V`, `POWER_OK_V` in `src/config/thresholds.ts`.

## 4. How to run it

```bash
npm ci
npm run dev                       # http://localhost:3000
npm test                          # unit tests
npx playwright install chromium   # once
npx playwright test               # desktop + phone e2e (CI uses next build && next start)
npx playwright test tests/e2e/screenshots.spec.ts tests/e2e/j5-proof.spec.ts --project=desktop
# → reviews/screenshots/P14 (46 files) and reviews/screenshots/J5 (19 files)
npx playwright test tests/e2e/j6-proof.spec.ts --project=desktop
# → reviews/screenshots/J6 (6 files)
```

**Sandbox without the Playwright CDN** (`npx playwright install chromium` fails with a TLS reset):
`npm pack @sparticuz/chromium`, then brotli-decompress `package/bin/chromium.br` to `chromium` (chmod
755) and `package/bin/al2023.tar.br` to `al2023.tar`, untar the latter into `libs/`. Run with
`LD_LIBRARY_PATH=<dir>/libs/lib PW_CHROMIUM_PATH=<dir>/chromium
PW_CHROMIUM_ARGS='["--no-sandbox","--disable-gpu","--disable-dev-shm-usage"]'` — the config reads both
variables. Keep `npm run start` (not `dev`) listening on :3000 first, or Playwright falls back to
`npm run dev` and the first-hit compile makes the certificate and S42 specs time out.

Sign in with any seeded email (for example `sara@kasper.ae`, `omar@alnoor.ae`,
`khalid@emiratesearth.ae`, `mark@gulflift.ae`) and any non-empty password. Sign-in is role-first: pick
Role (Kasper Admin, Kasper Ops, Tenant Admin, Site User, Link viewer), then Person. Every seeded user
is in that dropdown. There is **no Phase switch and no "Show hidden"**: the demo always shows
everything. The demo bar's "View as" menu switches users.

## 5. CI

`.github/workflows/ci.yml`:

- `checks`: typecheck, lint, unit tests and the 85 % line-coverage floor.
- `e2e`: three matrix shards (`npx playwright test --shard=N/3`), each running desktop and phone,
  with a 30-minute timeout. Each shard uploads `playwright-report-shard-N`, on success and failure.

The GitHub Actions runs are green for the merged history (H1–H7, J5 nav widths) and were checked with
the REST API (`gh api repos/afsalali1238/kaspergps/commits/<sha>/check-runs`); `gh pr checks` fails in
this sandbox because GitHub GraphQL is blocked.

## 6. Production notes (corrected from the 2026-10-09 handoff)

The earlier handoff had four errors. They are fixed here.

- **Data layer is `src/server/db.ts`.** There is no `store.ts`. It is a Zustand store persisted to
  `localStorage` under `kasper.db.v1`, and it is the only place data lives.
- **Telemetry is not webhooks.** The Teltonika FMC130 does not call webhooks. It sends Codec 8 or
  Codec 8 Extended frames over TCP or UDP to an ingestion server: Traccar, Kasper's own listener, or
  AWS IoT Core in front of it. That server writes readings to the database. What gets replaced is
  `src/server/telemetry/simulator.ts` (and, for the scripted demo events, the overrides in it).
- **Every `api.ts` function becomes a server endpoint** that checks `can`
  (`src/server/capabilities.ts`). `src/server/api-gate.test.ts` keeps the list honest: every export is
  pure, gated, or on the DEBT list, and the DEBT list may only shrink.
- **Auth replaces `signIn`.** The prototype's `signIn` (`src/server/api.ts`) accepts any non-empty
  password for a seeded email, and the sign-in form is role-first with a person dropdown. Real
  authentication replaces both. The demo bar, `/dev/*` pages and the scenarios menu are
  prototype-only.
- **Database:** replace the seed and `src/server/db.ts` with a real database (Postgres with an ORM
  such as Prisma or Drizzle, as the team chooses).

## 7. Known gaps and open decisions

- **Hosting is undecided.** Either a deployment or a run guide for the team has to be chosen.
- **Arabic is a first draft.** A native reviewer must check every string (section 8).
- **Event pins are complete** for §11.15, with one deliberate limit: trip boundaries are pinned only
  in windows of ≤ 3 trips, because plant working at a site makes 60+ minute-long trips a week.
  Those micro-trips are a simulator property, not a pin problem — fixing them means changing seeded
  telemetry and is a separate change.
- **The S1–S50 walkthrough run proves each scenario runs start to finish from the Scenarios menu**,
  and that each card shows its "What you should see" text. It does not assert every expectation
  written in `src/components/demo/walkthroughs.ts`. Those assertions live in the per-scenario specs.
- **Geofence assets scope cannot be edited** once a fence exists; the Kind and Assets fields are
  disabled while editing.
- **Coverage margin:** 88.24 % lines against an 85 % floor. New code still needs tests with it.
- **No `role ===` outside `capabilities.ts`, `capability-reasons.ts` and `seed/`**; screens reach the
  server only through `src/server/api`; time comes only from `src/lib/clock.ts`. `src/architecture.test.ts`
  enforces these, and it is green.

## 8. Draft Arabic keys (`public/locales/ar.json`)

`_meta.status` is "Draft — needs native review". Every Arabic string is a first draft, not only the
keys listed here.

- **Added in this round (7):** `asset_detail.engine.ecu_hours_partial`, `asset_detail.engine.fuel_week`,
  `asset_detail.engine.used_l`, `asset_detail.engine.source`, `asset_detail.engine.events`,
  `asset_detail.engine.no_level_gauge`, `asset_detail.engine.no_faults`. The rest of the new copy
  reuses existing keys: `asset_detail.engine.ecu_hours`, `fuel_used_per_day`, `fault_codes`, `adblue`,
  `asset_detail.utilisation.source_ignition`, `map.map_tab`, `map.list_tab`.
- An earlier note about "14 missing keys" for the Engine & fuel tab was wrong: those keys existed. Do
  not re-serialize `ar.json` — a formatter reorders every key and produces a ~1,000-line diff. Make
  anchored string edits and check `git diff --stat`.
- From the H4–H7 round: 98 keys were added since 8 October and two values were corrected
  (`map.updated_ago`, `asset_detail.last_updated`). Nine `alerts.words.*` entries were removed because
  they carried placeholders no caller filled; those alerts now show their English sentence in Arabic
  mode until the sentences are parameterised.
- Seven keys may be unused: `settings.assets.starts_as`, `maintenance.plan_due_soon_label`,
  `cost.roi_revenue_to_date`, `cost.roi_cost_to_date`, `cost.roi_net`, `cost.roi_purchase_value`,
  `cost.roi_profile_title`. The native reviewer should decide whether to delete them.
- The End-access note (`asset_detail.end_access.body`) carries `{company}` and `{code}`; its Arabic
  wording says something different from the English draft and needs review.

## 9. Housekeeping and decisions for the owner

**Owner decisions taken (they override the spec):**

- **Sign-in is role-first** — Role dropdown (Kasper Admin, Kasper Ops, Tenant Admin, Site User, Link
  viewer) preselecting Sara, Ravi, Khalid, Deepa; Person dropdown keeps all 16 seeded users; Link
  viewer has no account and opens FB-12's tracking link.
- **No Phase switch and no "Show hidden"**: the demo always shows everything. A stored "Day 1" is
  overridden on load. S20 and S41 are gone, with the spec/test lines that depended on them.
- **LB-05's after-hours alert moved to an Emirates asset at Al Quoz.** Two choices were made where the
  owner's instruction left room:
  1. **The asset is GR-01 (grader)**, not WL-03: WL-03 has two tests pinning its day
     (`j2-simulated-data.test.ts` keeps yesterday's readings within 300 m of its yard;
     `dubai-day.test.ts` keeps its last ignition-on reading at or before 19:00). GR-01 is an Emirates
     machine homed at `s-emirates-alq` with no such constraint and is "Idle" at the yard at the
     anchor. The alert is now `al-gr01-afterhours`; `ge-003` is `a-gr01` and `ge-005` (the return) was
     added. **LB-05's towing alert and test are untouched.**
  2. **`g-em-afterhours`' polygon was widened to the yard site** (lat 25.1331–25.1401, lng
     55.2273–55.2349). Its id, name, kind, tenant, after-hours window (19:00–06:00), exit-only
     alerting and creator are unchanged. Reason: the old ~100 m polygon did not contain the machines
     that park at the yard, so no exit event could be derived from the readings without a jump in the
     trip. To revert, pin GR-01's parking spot inside the original polygon from 17:30 instead.

**Housekeeping:**

- **Stale branches** `arena/137d2ee8`, `arena/53555479`, `arena/cdd2374a` and `arena/eeb42ef3`, plus
  `j1-verify` and `j2-simulated-data`: do not merge. The owner deletes them.
- **Windows clone** `C:\Users\HP\Desktop\antigravity\Gpsarena\kaspergps` has seven uncommitted files,
  including `team.ts` with `input.role === 'site_user'`. Do not overwrite them without asking the
  owner.
- A local Playwright run rewrites `reviews/screenshots/P14/*` and `reviews/screenshots/J2/*`; run
  `git checkout -- reviews/screenshots` before committing unless the phase is meant to refresh them.

## 10. Files to know

- `BUILD_PROMPT.md`: the spec. It wins over this file.
- `reviews/P<n>-self-check.md`, `reviews/H<n>-self-check.md`, `reviews/J<n>-self-check.md`: acceptance
  evidence per phase.
- `reviews/screenshots/P14/`: the §15 review set, `<user>-<screen>-<width>.png` (46 files).
- `reviews/screenshots/J5/`: the J5 proof set (19 files); `reviews/screenshots/J6/`: the J6 proof set
  (6 files, reproduced byte-for-byte by `j6-proof.spec.ts`); `reviews/screenshots/J2/`: the J2 proof,
  refreshed by its own spec. `reviews/J6-self-check.md`: the playback pins.
- `src/server/capability-catalog.ts`: the Features panel's one source of words (capability labels and
  groups, scope sentences, role words and purposes, feature availability and reasons, tier sentences,
  "Right now" counts). Re-exported from `src/server/api.ts`, so screens never reach past the gate.
- `src/components/assets/EngineFuelPanel.tsx`: the Engine & fuel tab; `src/server/utilisation.ts`
  (`fuelWeekFor`, `last7DaysIgnition`, `todayFor`) is the maths behind it.
- `src/server/telemetry/simulator.ts`: day plans, excursion legs (LB-05, WL-06, PU-51, GR-01) and the
  scripted events (TP-21 harsh, EX-11 power cut, WT-07/FB-12 over-speed, GN-01 fuel drop).
- `src/domain/trips.ts`: the §11.5 trip rule, shared by the Trips tab (`src/server/trips.ts`) and
  the playback pins (`src/domain/playback.ts`); `src/components/playback/TripPlayer.tsx` plays a
  window and draws its pins on the scrubber and the map.
- `tests/e2e/j5-proof.spec.ts`, `tests/e2e/j6-proof.spec.ts`, `tests/e2e/screenshots.spec.ts`: the three
  capture specs.
- `docs/demo-script.md` and `docs/test-matrix.md`: the walkthrough and the scenario-to-test map.
