# Kasper GPS prototype — build-prompt review & status report

Date: 2026-10-08 · Reviewer: Arena agent (`arena/1cdfb1fe-kaspergps`)
Reviewed against: `BUILD_PROMPT.md` (14 phases, §1–§17), repo at `7e0d709`.

---

## Revision R1 — post-implementation status (2026-10-08, later the same day)

After the review, the §6 remediation order A–E was executed on this branch.
**Current completion: ≈ 82 %** (click-through estimate ≈ 78 %). The sections
below (2–7) remain the as-reviewed record; defects marked **FIXED** there have
been resolved. This revision supersedes §1 and the defect list where noted.

### What was built since the review (commits `cbecb90` → `b35b106`)

| Area | Delivered |
| --- | --- |
| **A — architecture** | Single permission gate restored in `src/server/api.ts` (React Query mutations replace direct `seed` writes in Settings/team/maintenance/cost pages); `grep "role ===" src/` clean outside `capabilities.ts` + session builder; brand-word rule confined to `src/` (app may say "device time"); `src/architecture.test.ts` runs **real greps** for rules 1–4 + a components ratchet (`KNOWN_DIRECT_DATA_IMPORTS` must only shrink) |
| **B — reports engine** | `src/server/trips.ts` (§11.5 trip rule, gaps, distance), `src/server/reports.ts` (6 types gated by hardware + phase; renter windows clipped with note; `runReport`/`regenerateReport` with permission re-check; xlsx/pdf filenames per §11.5), `src/server/schedules.ts` (daily/weekly/monthly; clock-driven `runDueSchedules`; skip rows + pause-after-2; Dubai day keys via `clock.dubaiDateKey`) |
| **B — screens** | Reports/Downloads/Schedules pages fully wired (Run produces a real file + run row; schedule form; Download again/Delete; skip reasons). Demo-bar clock jumps materialise due schedule runs (S30) |
| **C — alerts** | `src/server/alerts.ts`: tenant/site-scoped visibility, day-one offline-only, hardware-gated types, real Acknowledge (Kasper + owner Tenant Admin, name + time). Alerts page + bell dropdown fed by the 22 seeded alerts (S9). `tenant_admin` gained `alert.acknowledge` per §5 |
| **C — asset detail** | Overview tiles fixed (engine hours was showing GNSS odometer; RPM was `Math.random()` — now `reading.rpm` or "Not measured"); Trips tab = real `detectTrips`; History = 24 h of readings; Engine & fuel = real CAN values with per-value source labels; Driving tab = overspeed/harsh events; Alerts tab = user's alerts + Acknowledge |
| **C — geofences** | `src/server/geofences.ts` + customer/console pages on real seed geofences (circles/polygons) and enter/exit events; create/delete behind `geofence.manage` (S31) |
| **D — MUC + shell** | `src/lib/muc-pdf.ts`: certificate PDF with meter summary, day table, gap rule, seal hash, **QR + verify code** to `/verify/<number>` (S36–S39). `kasper.store.v2` rehydrate re-applies the demo clock offset (reload persistence). Ctrl/Cmd+K global search palette over visible assets + pages (S40) |
| **E — e2e self-check** | `npx playwright test --list` → 200 tests in 15 files ✓. S27 re-pointed at real trips (WT-07 has 7); S30 accepts the real empty-state copy; the alert-acknowledge expectation updated to §5 (Tenant Admin owner **can** acknowledge); geofence forms got label/input association for `getByLabel` |

### Current health

| Command | Result |
| --- | --- |
| `npm test` | 26 files, **275 tests**, all green |
| `npm run test:coverage` | `src/server` **87.6 %** lines · `src/domain` **88.2 %** — ≥ 85 % target met |
| `npm run typecheck` / `npm run lint` | Clean |
| `npx playwright test --list` | 200 tests in 15 files parse |
| Architecture greps | All rules pass, enforced by `src/architecture.test.ts` |

### What is left (ordered)

1. **Walkthroughs** (P13): the five guided first-run tours with dismiss state in `kasper.store.v2` — the largest remaining piece of §13.
2. **Settings/Time toggles** (S45): 12/24-hour and date-format toggles wired through `clock` formatting.
3. **e2e execution**: specs are re-pointed at real behaviour but Chromium cannot be downloaded in this sandbox — they must be run in CI (`npm run test:e2e`) and any selector drift fixed.
4. **Screenshot + self-check artefacts** (P1–P13): the prompt's per-phase self-checks with screenshots were never produced; only `reviews/P14-self-check.md` exists.
5. **Small polish**: utilisation tab for non-MUC assets still short (no 7-day breakdown without ECU); polygon drawing in the geofence create form (circle create is done, S31's polygon draw is numeric-point based); Overview "distance today / idle today" tiles could be computed from `detectTrips` instead of the daily sample.

### Defect status vs the original review (§5)

| # | Defect | Status |
| --- | --- | --- |
| 5.1 | `npm ci` ERESOLVE | **FIXED** (`cbecb90`) |
| 5.2 | Architecture rules were no-ops | **FIXED** (`cbecb90`) |
| 5.3 | Reports/Schedules/Downloads non-functional | **FIXED** (`cdc9622`) |
| 5.4 | Alerts fabricated with `Math.random()` | **FIXED** (`003a1a7`) |
| 5.5 | Asset-detail tiles/tabs wrong or stubbed | **FIXED** (`d40d0cb`) |
| 5.6 | Geofence pages mock data | **FIXED** (`ed60562`) |
| 5.7 | MUC PDF/QR missing | **FIXED** (`3c8e822`) |
| 5.8 | Reload persistence incomplete (clock offset) | **FIXED** (`3c8e822`) |
| 5.9 | Search placeholder not functional | **FIXED** (`85c76ff`) |
| 5.10 | e2e written against stubs | **ADDRESSED** (`b35b106`) — re-pointed, still unexecuted |
| 5.11 | Capability gap: `alert.acknowledge` for tenant_admin | **FIXED** (`003a1a7`) |

---

## 1. Headline

**Overall completion: ≈ 68 %** (range 65–72 %).

The split is unusual and important:

| Layer | State | ≈ % |
| --- | --- | --- |
| Domain + server logic (`src/domain`, `src/server`) | Strong — full type model, deterministic seed, telemetry simulator, access/capabilities, bookings/grants, links, MUC seal, billing maths, maintenance, cost. Well unit-tested. | ~80 % |
| Screens (`app/**`, `src/components`) | Mixed — console and admin flows are largely real; several marquee customer screens are stubs or mock data (reports, schedules, downloads, alerts, geofences, asset-detail tabs, playback). | ~55 % |
| Tests / docs / process | 244 unit tests green (91 % line coverage), 200 e2e tests written **but never executed and written against the stubs**, only `reviews/P14-self-check.md` exists (P1–P13 self-checks and all screenshots missing). | ~60 % |

If the measure is "can a reviewer click every flow in §13 and see the specified behaviour", the honest number is closer to **60 %**. If the measure is "engine built and tested", it is closer to **80 %**.

---

## 2. How this was verified

| Command | Result |
| --- | --- |
| `npm ci` | **FAILS** on a clean checkout — peer conflict: `@eslint/js@10.0.1` requires `eslint@^10`, repo pins `eslint@^9.39.5`. `npm install --legacy-peer-deps` is required. |
| `npm run typecheck` | Pass (clean). |
| `npm run lint` | Pass (clean — but see §5.2; the architecture rules are no-ops). |
| `npm test` | Pass — 21 files, **244 tests**. |
| `npm run test:coverage` | **91.08 % lines** overall (`src/server` 92.8 %, `src/domain` 88.2 %) — meets the ≥ 85 % target. |
| `npm run build` | Pass (all routes compile, `proxy.ts` middleware registered). |
| `npx playwright test --list` | 200 tests in 15 files parse. |
| `npm run test:e2e` | **Cannot run here** — Chromium download blocked; same gap recorded in P14 self-check. |
| Dev-server smoke test | `/`, `/sign-in`, `/app`, `/console`, `/dev/ui`, `/t/k7Qm2Xc9TpLw4ZaN8rVb3Ye5`, `/verify/MUC-2026-09-EX-04-01` all return 200. |
| Architecture greps (§2 rules 1/2/9, §14) | Multiple violations — see §5. |

---

## 3. Phase scorecard (§15)

| Phase | Scope | ≈ % | Evidence |
| --- | --- | --- | --- |
| P1 Foundation | Scaffold, scripts, tokens, UI kit, routes, `/dev/ui` | **95** | All 13 UI-kit components present and demonstrated on `/dev/ui`; every route placeholder exists; Tailwind v4 + fonts wired. 390 px pass unverified (no browser). |
| P2 Domain, seed, clock, telemetry | Types, PRNG seed, simulator, features, thresholds, `expected.ts` | **90** | All §8 counts asserted in `seed/data.test.ts` (5 tenants, 10 sites, 16 users, 36 assets, 37 trackers, 22 adapters = 17/4/1, 15 bookings incl. 3 last-month, 4 links, open MW-01 request, Luhn-valid IMEIs, fixed demo token). `simulator.ts` (591 lines) with determinism/CAN/gap/scenario tests. `features.ts` carries the required "prototype assumption" comment. Clock with anchor + offset works. |
| P3 Access layer and API | Session, capabilities, grants, `can()`, `/dev/access` | **70** | `access.ts` + `capabilities.ts` + `capability-reasons.ts` + `expected.ts` fixture for all 16 users, with passing tests (visibility, windows, forbidden==missing, multi-site, end-early). **But** `api.ts` is not the single gate (3 functions, unused by screens), cross-tenant audit is a stub comment, and the §14 architecture tests do not exist. |
| P4 Demo bar, sign-in, shell | View as, Features, clock+jump, phase, switches, tools, scenarios | **85** | View-as with search + badges + outside hirer + signed-out; Features panel (capabilities with reasons, hardware, right-now); clock with 10 jump presets; phase / Show hidden / Sales view; Tools (bookings, audit, access, outbox, tamper, import/export JSON, reset); all 50 scenarios listed with user/clock/page setup. **Missing:** Ctrl+K shortcut, the guided step-through walkthrough (pulsing ring, Next, self-ticking steps — §10.7), pill collapse on the public page. |
| P5 Map and asset list | §11.2 | **75** | Real map (Leaflet + OSM), status markers, rented ring, KPI strip, list panel, filters, search. **Missing:** `leaflet.markercluster` is a dependency but never imported; URL-persisted filters unverified. |
| P6 Asset detail | §11.3 all tabs | **50** | Header, rental strip, actions, Overview (mini map, status tiles, CAN gating, no-tracker + request-a-tracker) are real. **Stubs:** History shows a single row instead of a track + period picker + gap rows; Trips = permanent "No trips recorded yet" empty state; Engine & fuel = one-line placeholder; Driving = static "No driving events"; Utilisation partially built. **Bugs:** the "Engine hours" tile renders `gnssOdometerKm … km`; "Engine RPM" renders `Math.random()*3000`. |
| P7 Alerts | §11.4 | **45** | Bell + notifications are real (`notifications.ts`/`outbox.ts`). **But** `/app/alerts` fabricates rows with `Math.random()` (acknowledgement state, timestamps, one row per asset×type) and never reads `seed.alerts` — so the scripted §8.7 alerts (GN-01 fuel drop, BD-02 fault, TP-23 power cut, LB-05 towing, tenant geofence/maintenance/invoice alerts) never appear and S9 cannot pass as specified. Acknowledge does not write through the API. |
| P8 Reports | §11.5 | **25** | Type/scope/format picker UI exists with hardware-gated types. **"Run report" is `onClick={() => {}}`** — no ReportRun created, no PDF/Excel, no filename, no renter clipping header, no "Nothing to report" per range logic. `src/lib/export.ts` (jsPDF + SheetJS) is proven on billing/cost/maintenance pages but not wired here. |
| P9 Rentals, links, public page | §11.6–11.7 | **85** | Token generation (16 random bytes, base64url), expiry options, revoke reasons, link states incl. cancel/close/early-cut-off; resolver returns exactly the 4/5 keys with a key-set test; `/dev/bookings` simulator + nightly check; public page with auto-refresh, ETA states, `noindex`/`no-referrer`; booking actions audited. |
| P10 Admin, console, onboarding, hardware, import | §11.8–11.9 | **75** | Substantial real screens: trackers (715 lines — register one/many, Luhn + SIM validation, pair/move/unpair, requests), adapters (fit rules incl. LVCAN200 class refusal), bookings (overlap/own-asset checks), import (506 lines), onboarding wizard (528 lines), team, tenants + tenant page (883 lines), audit + CSV, transfer, JSON export/import. **Missing:** user changes do **not** persist across reload (in-memory seed only; the Reset handler's own comment admits it) — contradicts §3/§11.9; guided walkthroughs absent. |
| P11 Multi-site, labels, geofences | §11.10–11.12 | **55** | Multi-site visibility is tested and works (John, Deepa). Labels exist in seed + a console page; the tenant Labels tab (rename/delete, chips, bulk, label filter, label scope) is missing. **Geofences page is a mock** — local hardcoded `GEOFENCES` array, ignoring `seed.geofences`; no map editor (`@geoman-io/leaflet-geoman-free` installed but never imported), no derived enter/exit events, no geofence alerts/report/overlay. |
| P12 Playback, ETA, downloads, schedules | §11.13–11.15 | **35** | ETA maths (`domain/eta.ts`) + resolver + public-page states + tests are done. **Playback entirely missing** (player bar, scrubber, event pins, gap banners). **Downloads** = 3 hardcoded rows (no Download again with permission re-check, no Delete, not tied to real runs). **Schedules** = `/app/schedules` literally says "Schedule list coming soon" — no create/pause/run/skip loop at all. |
| P13 MUC, billing, console billing | §11.16–11.17 | **75** | MUC core is excellent: canonical payload + SHA-256 seal (Web Crypto), issue/void/reissue, gap > 24 h block + admin override, tamper detection, `/verify/[number]` public page, tamper tool, thorough tests. Billing UI (722 lines) wires `createInvoiceFromBooking`, min-hours top-up, `recordPayment`, `payInvoice` (simulated), `voidInvoice`, aged receivables, statements, PDF/Excel; console billing exists; Ops excluded. **Missing:** the MUC **PDF document** (wordmark, daily table, seal block, footer) and its **QR code** — `qrcode` is installed but never imported. |
| P14 Maintenance, cost, Arabic, final | §11.18–11.19 | **75** | Maintenance (590 lines) and Cost & ROI (464 lines) are real screens with basis labels, "Not measured", exports, and solid unit tests; Arabic first draft (`public/locales/ar.json`, 876 keys) with i18n tests, RTL via `proxy.ts`, EN/عربي toggles; `docs/demo-script.md` + `docs/test-matrix.md` exist. **Final pass not verifiable:** e2e never ran, 390 px sweep not done, S37–S41 runtime unproven. |

Weighted mean of the 14 phases ≈ **67–68 %**.

---

## 4. What is genuinely done (solid, tested)

1. **Seed data (§8)** — all 5 tenants / 10 sites / 16 users / 36 assets / 37 trackers / 22 CAN adapters / 15 bookings / 4 links / grant override / tracker request match the prompt exactly, including the fixed FB-12 token, Luhn-valid IMEIs, Al Noor as the no-CAN fleet, and last-month bookings. Counts are enforced by tests.
2. **Telemetry simulator (§9)** — on-demand generation, working-day patterns, gap injection, scenario overrides (GN-01 fuel drop, BD-02 DTC, TP-23 power cut, replay batch), CAN fields only when supported, deterministic PRNG per IMEI; unit-tested.
3. **Access model (§5)** — roles → capabilities map, plain-word capability reasons, asset-attached permissions, rental grants with windows, end-early overrides that survive the nightly check, renter window clipping, multi-site narrowing, "forbidden looks like missing", `expected.ts` fixture for every user.
4. **Hardware registry (§6)** — `features.ts` with param requirements and phases, `hasFeature`/`featureVisible`, tier chips, "Not measured" discipline in the modules that matter (billing/maintenance/cost).
5. **Tracking links & public page (§11.6, §11.14)** — secure tokens, all end-of-link rules, resolver key-set enforced by type + test, ETA states (en-route / arrived / unavailable), owner sees what the hirer sees.
6. **MUC engine (§11.16)** — seal stability across reissue, void with reason, no edit path, tamper detection, verify page.
7. **Billing engine (§11.17)** — invoice maths (min-hours top-up, days-on-hire, VAT 5 %), payments, over-payment refusal, overdue, aged receivables, GPS subscription statements.
8. **Kasper console** — trackers (incl. bulk register with per-row errors), CAN adapters with class rules, bookings with overlap checks, onboarding wizard, import, audit + CSV, transfer owner, Kasper team with last-admin rule.
9. **Demo shell** — View as (searchable, badges, all 50 scenarios seeded), Features panel reading the same `can()`/`hasFeature()` as the screens, clock with jump presets, phase/sales/show-hidden switches, tools incl. JSON state export/import and certificate tampering.
10. **Engineering hygiene** — strict TS, lint clean, prod build clean, 244 passing unit tests, 91 % line coverage on `src/server`+`src/domain`, Arabic i18n with fallback tests, docs (`demo-script`, `test-matrix`).

---

## 5. Defects and spec violations

### 5.1 Blocked / broken

| # | Issue | Where |
| --- | --- | --- |
| 1 | `npm ci` fails on a clean checkout (ERESOLVE: `@eslint/js@10` peer-wants `eslint@10`, repo has `eslint@9`). Every new contributor/CI is blocked until `--legacy-peer-deps`. | `package.json` |
| 2 | Playwright suite has never been executed and several specs assert **stub behaviour, not acceptance criteria** (e.g. `S27–S28` asserts the "No trips recorded yet" empty-state text; `S30` asserts only the Schedules/Downloads **headings**). Even green, they would not prove S27/S28/S30. | `tests/e2e/S23-S30.spec.ts:55–95` |

### 5.2 Architecture rules (§2) — several are unenforced or broken

| # | Rule | Status |
| --- | --- | --- |
| 1 | One permission gate; components never import store/seed/telemetry; lint rule or test must fail on it | **Violated + unenforced.** `api.ts` holds only `signIn`/`getAsset`/`getVisibleAssets`; screens import `seed` and even `telemetry/simulator` directly (`DemoBar.tsx:7,12`, `FeaturesPanel.tsx:6`, `AppShell.tsx:9`, `app/app/assets/[id]/page.tsx:16`, and most pages). No `no-restricted-imports` rule exists despite the config comment claiming rule 1. |
| 2 | `grep "role ===" src/` empty outside capabilities + session builder | **Violated.** ~70 hits in `access.ts`, `muc.ts`, `team.ts`, `tenants.ts`, `bookings.ts`, `outbox.ts`, `capability-reasons.ts`, `DemoBar.tsx`, `AppShell.tsx`, etc. (Some are display-only; the rule as written still fails.) |
| 3 | Audit for Kasper staff opening a tenant's asset (`asset.view.crossTenant`, dedup 1/user/asset/hour) | **Not implemented at runtime** — only a seeded entry (`data.ts:738`) and a stub comment `// audit entry would go here` (`api.ts:68`). |
| 8 | Public resolver returns exactly 4/5 keys | **Done and tested.** |
| 9 | `Date.now()`/argument-less `new Date()` banned outside `clock.ts` | **Violated and unenforced.** `src/server/muc.ts:254,333` and `app/console/page.tsx:9` call `Date.now()`. The ESLint selector matches `Date()` calls only — it does not match `Date.now()` or `session.role ===`, which is why lint is green. |
| 12 | Sealed MUC never changes | **Done and tested.** |

Missing entirely: the §14 **architecture tests** (component imports, role greps, Date ban, "device"/"Dozr" grep). The grep for `device`/`Dozr` in `src/` is clean except a comment naming the banned words.

### 5.3 Screens that fabricate data instead of using the domain

| Screen | Problem |
| --- | --- |
| `/app/alerts` | Builds alert rows with `Math.random()` (ack state, timestamps) from a 4-type template; ignores `seed.alerts` and `access`-scoped alert types. S9 (Deepa / GN-01 fuel drop) cannot pass. `app/app/alerts/page.tsx:116–128` |
| Asset detail Overview | "Engine hours" tile shows GPS odometer km; "Engine RPM" shows `Math.random()*3000`. `app/app/assets/[id]/page.tsx:655,663` |
| Asset detail History / Trips / Engine & fuel / Driving | Placeholders (single-row table, permanent empty states, one-line stubs). |
| `/app/reports` | "Run report" button does nothing (`onClick={() => {}}`); the "Nothing to report" state always shows. |
| `/app/downloads` | 3 hardcoded demo rows; not `ReportRun`s; no Download again / Delete / permission re-check. |
| `/app/schedules` | "Schedule list coming soon." |
| `/app/geofences` | Local hardcoded `GEOFENCES` array; `seed.geofences` unused; no editor/events/report. |

### 5.4 Data-persistence requirement not met (§3, §11.9)

Only session/demo switches/clock offset persist to `kasper.store.v2`. Every user-made change (created tenants, users, assets, bookings, payments, MUCs…) lives in the in-memory seed module and is **lost on reload**. The Reset handler comment confirms this is known. Manual JSON export/import exists as a workaround.

### 5.5 Unused installed dependencies

`qrcode` (MUC PDF QR), `@geoman-io/leaflet-geoman-free` (geofence drawing), `leaflet.markercluster` (map clustering) are in `package.json` but never imported — corresponding features missing.

### 5.6 Process artifacts missing (§0, §16)

`reviews/` contains only `P14-self-check.md`. The prompt requires `reviews/P<n>-self-check.md` for **every** phase (P1–P14) and Playwright screenshots at 1440/390 for every touched screen under `reviews/screenshots/P<n>/` — **none exist** (P14 self-check admits screenshots are empty).

---

## 6. What is left to do (prioritised)

**A. Un-break the project**
1. Fix the eslint dependency pair so `npm ci` works (`eslint@^10` or `@eslint/js@^9`).
2. Fix the ESLint architecture selectors (catch `Date.now()`, `X.role ===`, seed/telemetry imports from `app/`+`src/components/`) and remove the violations (`muc.ts` ids can use `clock.now()` or a seq).
3. Add the §14 architecture tests so this can't regress.

**B. Complete the customer-facing flows that the prototype is for (P6–P8, P12)**
4. Reports engine: trip/mileage, location history, operating hours, fuel, utilisation, driving events (+ geofence report) → `ReportRun`, PDF + Excel via `lib/export.ts`, `Kasper_<Report>_<scope>_<from>_to_<to>` names, renter clipping header, "Nothing to report for this period"; wire the Run button.
5. Schedules loop (11.13): create/edit/pause/delete, `nextRunAt`, clock-driven runs, "Skipped — you no longer have access…", pause after 2 skips, email outbox items; replace the `/app/schedules` stub.
6. Downloads page backed by real runs, with Download again (permission re-check) and Delete.
7. Asset detail tabs: History (period picker, track with gap breaks, full positions table + CAN columns, gap rows), Trips (detection already unit-tested — list + totals + Play), Engine & fuel (hours with source labels, RPM, coolant, load, fuel chart with refuel/drop markers, AdBlue, DTCs with plain descriptions), Driving events, Utilisation bars; fix the two Overview tile bugs.
8. Trip playback (11.15): player bar, scrubber coloured by state, event pins, gap banners, renter clipping, reduced-motion.
9. Alerts screen: render `seed.alerts` + alerts derived per the §12 rules, hardware-gated types, real acknowledge via the API with "Acknowledged by … at …", wording per §11.4; keep replay readings inert.

**C. Geofences & labels (P11)**
10. Wire geofences to `seed.geofences`; map editor (geoman) for circle/polygon; derived enter/exit events with 2-reading confirmation; alerts; overlay toggle; geofence report; asset-detail geofence line.
11. Tenant Labels tab + chips + bulk apply + label filter + label scope in reports (§11.11).

**D. Close the seams (P10, P13, P4)**
12. Persist user-created demo state to `kasper.store.v2` (or an equivalent mutation log) so it survives reload; Reset restores the seed.
13. MUC PDF document with seal block + QR to `/verify/<number>`.
14. Demo bar: Ctrl+K, guided scenario walkthrough (numbered steps, pulsing ring, Next, self-ticking, wrong-user greys with one-click switch), pill collapse on public pages.
15. Marker clustering on the map.

**E. Prove it (P14, process)**
16. Install Chromium and **run** the e2e suite; rewrite vacuous assertions to the §13 acceptance lines (S27–S30, S8, S9 etc.).
17. Backfill `reviews/P1–P13-self-check.md` and the screenshot set (or state that phases P1–P13 were delivered in one push and record that as a deviation).
18. 390 px phone sweep; Arabic copy review beyond chrome for maintenance/cost.

---

## 7. Review of the prompt itself (as an expert spec)

The prompt is unusually good: self-contained, exact permission/hardware rules, deterministic data, acceptance checks per phase, and testable invariants (resolver key set, Luhn, seal stability, forbidden==missing). A few refinements that would have prevented the gaps found:

1. **Say "no `Date.now()`/`X.role ===` member expressions"** — the agent-implemented ESLint selectors match only bare identifiers, so the bans silently did nothing. Require the architecture test to run actual greps and assert emptiness, not just a lint config.
2. **"Run report must produce a file" belongs in phase acceptance** — P8's checks mention totals equality between PDF and Excel but nothing forced the button to work; the e2e then encoded the stub.
3. **Explicitly forbid tests that assert empty states/headers as proxies for behaviour** ("an e2e must assert the acceptance line, not that a heading exists").
4. **`npm ci` (clean install) should be a P1 check** — the eslint peer conflict would have been caught immediately.
5. **Clarify "components"** in rule 1 to "anything under `app/` or `src/components/`", and reconcile rule 2 with `capability-reasons.ts` (which legitimately maps roles to words) — e.g. "no *authorization decisions* by role name outside `capabilities.ts`/`access.ts`".
6. **Persistence requirement** (§3 `kasper.store.v2`) is easy to half-read; call out that *all mutations* must survive reload, and that "Reset demo data" re-materialises the seed in place.
7. The stop-after-each-phase loop plus per-phase screenshots is right for reviewability; the single squashed PR (#7) shows the process wasn't followed — consider requiring the self-check files to be committed **with** each phase's merge.

---

## 8. Bottom line

The foundation, data, telemetry, permission engine, booking/link/certificate/billing logic and the Kasper console are in good shape and properly tested — that work is real and roughly 80 % of its spec. The customer dashboard, which is the heart of the clickable prototype (reports, schedules, downloads, alerts, asset-detail tabs, playback, geofences), is largely stub or mock data, and the e2e suite was written to match the stubs rather than the spec. Fix the five "fabricated data" screens and the reports/schedules loop, run the e2e suite for real, and this converges quickly — the server APIs those screens need mostly already exist and pass their unit tests.
