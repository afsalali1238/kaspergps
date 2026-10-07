# Build prompt — Kasper GPS Dashboard prototype (from scratch)

Give this file to your coding agent (Claude Code, Codex, Cursor), opened in the project folder. It is self-contained: everything the agent needs is below.

**If the folder already has the earlier M00 setup** (Next.js scaffold, Tailwind tokens, fonts, UI kit, placeholder routes, one test): keep it, check it against P1 below, and add only what's missing. Don't scaffold again. Where the spec docs in `docs/spec/` exist, they agree with this file; if anything conflicts, **this file wins**.

---

## 0. How you (the agent) must work

1. Build in the **14 phases** in section 15, in order. After each phase:
   - run `npm test`, `npm run typecheck`, `npm run lint` — all must pass;
   - save Playwright screenshots of every screen the phase touched, at 1440 px and 390 px, to `reviews/screenshots/P<n>/` (name them `<user>-<screen>-<width>.png`, e.g. `omar-map-1440.png`);
   - write `reviews/P<n>-self-check.md` (template in section 16): every acceptance check of that phase with pass/fail and how you verified it, screenshots, files changed, deviations, questions;
   - **stop** and say: "Phase P<n> is ready for review." Do not start the next phase until told to.
2. Never invent behaviour. If this prompt doesn't answer something, choose the most conservative option (less access, less data shown), and list it under "Questions" in the self-check.
3. Never widen access. Any doubt about who can see something → they can't.
4. Keep files small and named after what they do. One screen per folder.
5. Write plain, specific UI copy: say what happened and what to do next. No exclamation marks, no jargon.

---

## 1. What you are building

A **clickable prototype** of the Kasper GPS dashboard: one web app where a reviewer picks any user from a **"View as" dropdown** and experiences exactly what that user would see and do — every role, every flow, every hardware tier — with realistic dummy data for 5 companies and 36 assets, plus tracker readings from the 1st of the previous month to now.

Beyond live tracking, the prototype also covers labels, geofences, trip playback, report downloads and schedules, ETA on the tracking page, the sealed Monthly Utilisation Certificate (MUC), rental billing and payments, Kasper's GPS subscription billing, maintenance scheduling, and cost & ROI (section 11.10 onwards). All of them obey the same permission and hardware rules.

Purpose: let the founder, ops team, interns and dev team click through the real product rules before production is built. It is the working spec, so **permission rules and hardware rules must be exact**, while infrastructure is fake (no backend, no database, no real trackers).

Kasper is a UAE equipment-rental and logistics marketplace. Companies on it (**tenants**) own equipment and vehicles (**assets**), rent them to each other, and hire them to outside customers. Each asset carries a Teltonika **FMC130** GPS **tracker**. Some assets also have a **CAN adapter** that reads engine data:

- no adapter → **Tier 1** (tracker only)
- **LVCAN200** (light vehicles: pickups, vans) → **Tier 2**
- **ALL-CAN300** (heavy machinery and trucks) → **Tier 3**

**The screen for an asset shows only what its hardware can measure.** A company with no CAN adapters must never see fuel, RPM, engine hours from the ECU, fault codes, or any empty panels for them.

### Three surfaces in one app

| Surface | Route | Who |
| --- | --- | --- |
| Customer dashboard | `/app/...` | Tenant Admins, Site Users; Kasper staff viewing tenants |
| Kasper console | `/console/...` | Kasper Admin, Kasper Ops |
| Public tracking page | `/t/[token]` | Outside hirer, no account |

Plus a **demo bar** (always visible in the prototype) with the "View as" dropdown, time controls, and feature switches (section 10).

---

## 2. Non-negotiable architecture rules

1. **One permission gate.** All reads and writes go through `src/server/api.ts`. Every function takes a `session` first and checks access in `src/server/access.ts`. Components never import the store, seed or telemetry modules. (Add a lint rule or test that fails if they do.) Hiding a button is not security; the API must refuse.
2. **Capabilities, not role names.** UI and API call `can(session, 'asset.edit', assetId)`. Only `src/server/capabilities.ts` maps roles to capabilities. `grep "role ===" src/` must find nothing outside that file and the session builder.
3. **Hardware features come from one registry.** `src/domain/features.ts` decides what each asset can show. No component checks `tier === 3` directly; they call `hasFeature(asset, 'fuel.level')`.
4. **Permissions attach to the asset**, never to the tracker. Swapping a tracker never changes who sees the asset.
5. **Visibility = owned ∪ active rental grants**, narrowed to a Site User's sites.
6. **Renters see readings only inside their rental window**, judged by each reading's own timestamp.
7. **Forbidden looks like missing.** An asset you can't see returns exactly what a non-existent asset returns ("Asset not found").
8. **The public link resolver returns only** `{ assetName, lat, lng, at }`, plus an optional `eta: { destinationName, etaAt, state }` when the link was created with ETA on. This is enforced by its TypeScript return type and a test.
9. **Time comes from the simulated clock** `src/lib/clock.ts`. `Date.now()` and argument-less `new Date()` are banned elsewhere (ESLint `no-restricted-syntax`).
10. **Audit**: an audit entry is written via the API for:
    - Kasper staff opening a tenant's asset;
    - tracking-link create/revoke and early cut-off;
    - user changes and tenant/asset/tracker changes;
    - MUC issue/void/reissue;
    - invoice issue, payments and voids;
    - geofence and maintenance-plan changes.
11. **Engine and fuel values always carry a source label**: `ECU`, `ECU · partial` or `Estimated`. They are never merged, and a value that isn't measured shows **"Not measured"**, never `0`.
12. **A sealed certificate never changes.** An issued MUC is stored with its canonical payload and SHA-256 seal. It can be voided and reissued (with a reason, audited) but never edited.
13. **Every money figure is labelled with how it was worked out**: billable hours from `ECU`, `Estimated` (ignition) or `Days on hire`; fuel cost from `ECU` fuel used or `Estimated`. Prices and rates are dummy values from `src/config/pricing.ts` and the UI says "Dummy rates" next to them.

---

## 3. Stack (fixed)

- Next.js (App Router) + TypeScript `strict`, Tailwind CSS v4, ESLint
- Leaflet + react-leaflet, OpenStreetMap tiles (no key), `leaflet.markercluster` for clustering
- Zustand for client state (session, clock, demo switches); the "server" is plain TypeScript modules called from the client
- date-fns + date-fns-tz — every time shown in `Asia/Dubai`, 24-hour ("14:32"), dates as "5 Oct"
- Recharts for the few small charts (fuel level, engine hours per day)
- SheetJS (`xlsx`) for Excel; jsPDF + jspdf-autotable for PDF
- Vitest + Testing Library for unit/component tests; Playwright for end-to-end
- Data: in-memory store built from a deterministic seed; user changes persisted to `localStorage` (`kasper.store.v2`), with "Reset demo data" restoring the seed

No other libraries unless you justify them in the self-check.

---

## 4. Words and brand

**Words (UI, code names, comments):**

| Use | Never use |
| --- | --- |
| Asset (the equipment or vehicle) | device, machine (in UI) |
| Tracker (the GPS unit, IMEI) | device |
| CAN adapter (LVCAN200, ALL-CAN300) | CAN device, box |
| Pair a tracker to an asset | tag |
| Booking, rental | order |
| Tracking link | public link, share link (in UI) |
| Kasper | Dozr |

**Brand:** ink `#141518` · Kasper yellow `#FFC400` (accent, sparingly; never yellow text on white) · yellow-dark `#E6AF00` · paper `#F1F1EC` · paper-2 `#F6F6F3` · line `#E8E8E3` · grey-700 `#5B5F66` · grey-500 `#9A9CA1` · red `#D64545` · green `#1F9A6D`.
Fonts (`next/font/google`): **Space Grotesk** headings, **Hanken Grotesk** body, **Space Mono** for codes, IMEIs, numbers and times.

**Status colours:** Live green · Idle amber (`#E6AF00`) · Stale pink (`#D6457F`) · Offline red · Unknown grey-500 · No tracker grey outline. Colour always comes with the word.

**UI rules:** buttons a user can't use are **hidden**, not greyed out (except in the demo bar's Show hidden mode) · loading = skeleton · errors say what failed + Retry · confirmations happen on the page, never `window.confirm` · customer screens work at 390 px wide; the console is desktop only · tier/phase badges are small and quiet.

---

## 5. Roles and permissions

### Roles

| Role | Code | Who | Scope |
| --- | --- | --- | --- |
| Kasper Admin | `kasper_admin` | Kasper platform staff (very few) | Everything; cross-tenant views audited |
| Kasper Ops | `kasper_ops` | Kasper operations team | All assets and trackers; no user or tenant administration |
| Tenant Admin | `tenant_admin` | Owner or office manager of a company | Everything their company owns, plus assets rented in, view-only |
| Site User | `site_user` | A client-side site supervisor or foreman | Assets at their site(s): their company's own assets there, plus assets **rented to their site** |
| Outside hirer | — (no account) | A customer not on Kasper | One asset's live location via a tracking link |

A **renter** is not a role: it is a company that holds a rental grant. Site Users are the renter's people on site; they see rented assets booked to their site. Vendor companies (those that only rent out) typically have only Tenant Admins.

### Capabilities (`src/server/capabilities.ts`)

```
asset.view  asset.viewHistory  asset.viewTelemetry  asset.edit
report.run
link.create  link.revoke
grant.endEarly
alert.view  alert.acknowledge
users.manage  sites.manage
console.tenants.view  console.tenants.manage  console.assets.manage
console.trackers.view  console.trackers.manage  console.trackers.configure
console.audit.view
label.view  label.manage
geofence.view  geofence.manage
playback.view
report.schedule
maintenance.view  maintenance.manage
cost.view
muc.view  muc.issue  muc.void
billing.view  billing.recordPayment  billing.pay
console.billing.view  console.billing.manage
asset.create  asset.retire  tracker.request
console.assets.transfer  console.adapters.manage  console.bookings.view  console.bookings.manage
console.staff.manage  console.import
```

### Matrix — role has capability AND relationship to the asset allows it

Relationship of a user to an asset: `kasper` (Kasper staff), `owner` (user's company owns it), `renter` (active grant), `none`.

| Capability | Kasper Admin | Kasper Ops | Tenant Admin — owner | Tenant Admin — renter | Site User — own asset at site | Site User — rented to site |
| --- | --- | --- | --- | --- | --- | --- |
| asset.view / viewHistory / viewTelemetry | ✓ | ✓ | ✓ full history | ✓ from rental start | ✓ full history | ✓ from rental start |
| report.run | ✓ | ✓ | ✓ | ✓ rental periods only (incl. past rentals) | ✓ | ✓ rental periods only |
| asset.edit (name, type, plate, site) | ✓ | ✓ | ✓ | ✕ | ✕ | ✕ |
| link.create | ✓ | ✕ | ✓ | ✕ | ✕ | ✕ |
| link.revoke | ✓ | ✓ (support) | ✓ | ✕ | ✕ | ✕ |
| grant.endEarly | ✓ | ✓ | ✓ | ✕ | ✕ | ✕ |
| alert.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| alert.acknowledge | ✓ | ✓ | ✓ | ✕ | ✕ | ✕ |
| users.manage / sites.manage | ✓ any tenant | ✕ | ✓ own company | — | ✕ | ✕ |
| console.tenants.view | ✓ | ✓ read-only | ✕ | ✕ | ✕ | ✕ |
| console.tenants.manage, console.assets.manage | ✓ | ✕ | ✕ | ✕ | ✕ | ✕ |
| console.trackers.view / manage / configure | ✓ | ✓ | ✕ | ✕ | ✕ | ✕ |
| console.audit.view | ✓ | ✕ | ✕ | ✕ | ✕ | ✕ |
| label.view | ✓ | ✓ | ✓ own company's labels | ✕ never the owner's labels | ✓ own company's labels | ✕ |
| label.manage | ✓ | ✕ | ✓ | ✕ | ✕ | ✕ |
| playback.view | ✓ | ✓ | ✓ | ✓ inside rental window | ✓ | ✓ inside rental window |
| report.schedule (own schedules) | ✓ | ✓ | ✓ | ✓ rental periods only | ✓ | ✓ rental periods only |
| maintenance.view | ✓ | ✓ | ✓ | ✕ | ✓ | ✕ |
| maintenance.manage | ✓ | ✓ | ✓ | ✕ | ✕ | ✕ |
| cost.view | ✓ | ✕ | ✓ | ✕ | ✕ | ✕ |
| muc.view | ✓ | ✓ | ✓ | ✓ certificates for their rental periods only | ✕ | ✕ |
| muc.issue / muc.void | ✓ | ✕ | ✓ | ✕ | ✕ | ✕ |

Company-level capabilities (not tied to one asset):

| Capability | Kasper Admin | Kasper Ops | Tenant Admin | Site User |
| --- | --- | --- | --- | --- |
| geofence.view | ✓ all tenants | ✓ all tenants | ✓ own company's geofences | ✓ own company's geofences at their sites |
| geofence.manage | ✓ | ✕ | ✓ own company's | ✕ |
| billing.view | ✓ all | ✕ | ✓ invoices their company issued or received, and their GPS subscription statements | ✕ |
| billing.recordPayment | ✓ | ✕ | ✓ on invoices their company issued | ✕ |
| billing.pay (simulated) | ✕ | ✕ | ✓ on invoices their company received | ✕ |
| console.billing.view / manage | ✓ | ✕ | ✕ | ✕ |
| asset.create (own company; asset starts with no tracker) | ✓ any tenant | ✓ any tenant | ✓ own company | ✕ |
| asset.retire / reinstate | ✓ | ✓ | ✓ own assets with no active booking | ✕ |
| tracker.request ("We need a tracker fitted") | — | — | ✓ own assets | ✕ |
| console.assets.transfer (move an asset to another owner) | ✓ | ✕ | ✕ | ✕ |
| console.adapters.manage (CAN adapter stock, fit/remove) | ✓ | ✓ | ✕ | ✕ |
| console.bookings.view | ✓ | ✓ | ✕ | ✕ |
| console.bookings.manage (create, extend, shorten, cancel, close) | ✓ | ✓ | ✕ | ✕ |
| console.staff.manage (Kasper Admin/Ops accounts) | ✓ | ✕ | ✕ | ✕ |
| console.import (bulk CSV/paste: assets, trackers, users) | ✓ | ✓ trackers and adapters only | ✕ | ✕ |

Hard rules:
- Tenants never see each other's assets, users, sites, labels or bookings with other companies.
- A renter never sees: history before their rental start, other renters, the owner's other assets, tracker IMEI/SIM, or tracking links.
- Customers never see trackers, IMEIs, SIMs, firmware, or the console.
- Labels, geofences, maintenance plans, cost figures and invoices belong to the tenant that created them. A renter never sees the owner's, and the owner never sees the renter's.
- Kasper Admin/Ops opening a tenant's asset writes `asset.view.crossTenant` to the audit log (deduplicate: one per user per asset per hour).

### Rental grants (`src/server/grants.ts`)

- A booking whose renter is a Kasper tenant creates a **grant**. Window = booking `start` → the earliest of `end`, `cancelledAt`, `closedAt`, or an early cut-off (`GrantOverride.endedAt`).
- Access starts at the booking **start**, not when the booking was created. Extend or shorten moves the window; cancel ends it at the cancel time; close job ends it then.
- If the booking names a renter site, only the renter's Site Users at that site see the asset. The renter's Tenant Admins always do.
- After a rental ends the asset leaves the renter's map, but the renter can still **run reports** on their own past windows.
- A booking with no renter tenant (outside hirer) creates **no grant**; the owner sends a tracking link instead.
- Early cut-off is saved as an override. The nightly check recomputes every window and must never undo an override.

### Tracking links (`src/server/links.ts`)

- Token: 16 bytes from `crypto.getRandomValues`, base64url (≥ 22 characters), never sequential.
- Tied to one asset and optionally one booking. Default expiry = booking end; with no booking, 24 h.
- A link stops working when it is revoked or expires, or when its booking is cancelled, its job is closed, or access is ended early. Record why (`revokeReason`).

---

## 6. Hardware tiers and what each screen may show

### 6.1 Parameters (`ParamKey`)

| Param key | Meaning | Source |
| --- | --- | --- |
| `gnss` | Location, heading, satellites | FMC130 |
| `speed` | GPS speed | FMC130 |
| `ignition` | Ignition on/off | FMC130 ignition input |
| `movement` | Moving / stationary | FMC130 accelerometer |
| `extVoltage` | Vehicle battery voltage, power cut detection | FMC130 |
| `intBattery` | Tracker's own backup battery | FMC130 |
| `gsm` | GSM signal level 0–5 | FMC130 |
| `gnssOdometer` | Distance from GPS | FMC130 |
| `accelEvents` | Harsh braking, harsh acceleration, harsh cornering | FMC130 accelerometer |
| `fuelLevel` | Fuel tank level % (and litres if tank size known) | CAN |
| `fuelUsed` | Total fuel used, litres | CAN |
| `fuelRate` | Fuel consumption rate, L/h | CAN (ALL-CAN300) |
| `rpm` | Engine RPM | CAN |
| `canOdometer` | Vehicle's own odometer, km | CAN |
| `coolantTemp` | Engine coolant temperature, °C | CAN |
| `engineLoad` | Engine load % | CAN (ALL-CAN300) |
| `engineHours` | Engine hours from the ECU | CAN (ALL-CAN300 full; LVCAN200 partial on some vehicles) |
| `faultCodes` | Active diagnostic trouble codes (DTC) | CAN (ALL-CAN300, vehicle-dependent) |
| `adBlue` | AdBlue level % | CAN (ALL-CAN300, vehicle-dependent) |

### 6.2 What each adapter supports by default

| Param | Tier 1 · FMC130 only | Tier 2 · + LVCAN200 | Tier 3 · + ALL-CAN300 |
| --- | --- | --- | --- |
| gnss, speed, ignition, movement, extVoltage, intBattery, gsm, gnssOdometer, accelEvents | ✓ | ✓ | ✓ |
| fuelLevel, fuelUsed, rpm, canOdometer | — | ✓ | ✓ |
| coolantTemp | — | ✓ (vehicle-dependent) | ✓ |
| engineHours | — | partial (vehicle-dependent) | ✓ |
| fuelRate, engineLoad, faultCodes, adBlue | — | — | ✓ (faultCodes, adBlue vehicle-dependent) |

Each asset also has a **CAN check result**: the params its actual vehicle supports (some vehicles don't expose everything their adapter could read). Store it as `asset.canProfile = { adapter: 'none' | 'LVCAN200' | 'ALL-CAN300', supported: ParamKey[] }`. `supported` starts from the adapter defaults minus anything the CAN check removed. Put a comment in `features.ts`: *"Default lists are a prototype assumption; verify against Teltonika's vehicle support lists (Intern Task 5)."*

### 6.3 Features (`src/domain/features.ts`)

Every feature declares the params it needs and its phase. `hasFeature(asset, key)` = all required params in `asset.canProfile.supported`. `featureVisible(session, asset, key)` = `hasFeature` ∧ phase allowed by the demo switch ∧ user has the capability.

| Feature key | Shows | Needs | Phase |
| --- | --- | --- | --- |
| `location.live` | Map marker, last position | gnss | Day one |
| `status` | Live / Idle / Stale / Offline / Unknown / No tracker | gnss, ignition | Day one |
| `history.track` | Track and positions table, gaps | gnss | Day one |
| `trips` | Trips, distance (GPS), driving time | gnss, speed, ignition | Day one |
| `alerts.offline` | Offline alert | gnss | Day one |
| `power.status` | Vehicle battery voltage, tracker battery, power-cut flag | extVoltage, intBattery | Phase 2 |
| `connection.quality` | GSM level, satellites (Kasper staff only) | gsm | Phase 2 |
| `hours.ignition` | **Ignition hours · Estimated** (ignition-on time) | ignition | Phase 2 |
| `hours.ecu` | **Engine hours · ECU** (billing-grade) | engineHours + adapter ALL-CAN300 | Phase 2 |
| `hours.ecuPartial` | **Engine hours · ECU · partial, not for billing** | engineHours + adapter LVCAN200 | Phase 2 |
| `driving.events` | Harsh braking/acceleration/cornering, over-speed | accelEvents, speed | Phase 2 |
| `alerts.power` | Power cut, low tracker battery | extVoltage, intBattery | Phase 2 |
| `alerts.towing` | Moved with ignition off | movement, ignition | Phase 2 |
| `fuel.level` | Fuel level gauge + 7-day chart, refuel and drop markers | fuelLevel | Phase 2 |
| `fuel.used` | Fuel used per day/period, L/h when available | fuelUsed | Phase 2 |
| `alerts.fuelDrop` | Sudden fuel drop (possible theft) | fuelLevel | Phase 2 |
| `engine.live` | RPM, coolant temp, engine load (each "Not measured" if that param missing) | rpm | Phase 2 |
| `odometer.can` | Vehicle odometer (CAN) alongside GPS distance | canOdometer | Phase 2 |
| `faults` | Active fault codes list + alert | faultCodes | Phase 2 |
| `adblue` | AdBlue level | adBlue | Phase 2 |
| `utilisation` | Working / idling / off hours per day | ignition (Tier 1: ignition-based) · engineLoad improves it (Tier 3) | Phase 2 |
| `labels` | Label chips, label filter | — (any asset) | Phase 2 |
| `geofence.events` | Enter/exit events, geofence alerts, geofence report | gnss | Phase 2 |
| `playback` | Trip playback on the map | gnss, speed | Phase 2 |
| `eta` | ETA on the tracking page | gnss, speed | Phase 2 |
| `muc` | Monthly Utilisation Certificate (sealed) | engineHours + adapter ALL-CAN300 (billing-grade hours only) | Phase 2 |
| `billing.hours` | Hourly rental billing from measured hours | `hours.ecu` → ECU; otherwise ignition → "Estimated — not billing-grade" | Phase 2 |
| `maintenance.hours` | Service plans by engine hours | engineHours (ECU) or ignition (Estimated) | Later |
| `maintenance.km` | Service plans by distance | canOdometer, or gnssOdometer (GPS distance) | Later |
| `maintenance.faults` | Create a service task from a fault code | faultCodes | Later |
| `cost.fuel` | Fuel cost from measured fuel used | fuelUsed | Later |
| `cost.idle` | Idle cost from measured idling | engineLoad, fuelRate | Later |

### 6.4 Display rules

1. **Asset level:** a panel appears only if its feature is visible for that asset. A Tier 1 asset shows location, status, history, trips, power, ignition hours, driving events, utilisation — and **nothing** about fuel, RPM, ECU hours or faults.
2. **Inside a visible panel**, a param the vehicle doesn't support shows "Not measured" (e.g., a Tier 3 grader without a fuel-level sensor: Fuel used shows, Fuel level says "Not measured").
3. **Fleet level** (list columns, filters, KPI tiles, report types, alert types): a fuel or engine column/filter/report/alert type appears only if **at least one asset in the user's current view** supports it. A company with no CAN adapters never sees any of them anywhere.
4. **Hours source labels:** Tier 3 shows "Engine hours · ECU" as primary and "Ignition hours · Estimated" as secondary; Tier 2 partial shows "ECU · partial, not for billing"; Tier 1 shows only "Ignition hours · Estimated". Never add or average them together.
5. **Idle vs working for plant:** for excavators, loaders, dozers, graders, cranes and generators, stationary + ignition on is labelled "Stationary, ignition on" in utilisation; only Tier 3 (engineLoad) splits it into **Working** (load ≥ 25%) and **Idling** (load < 25%). Trucks and vans keep "Idling".
6. **Sales view switch** (demo bar, off by default): when on, hidden hardware features appear as quiet locked cards: "Needs ALL-CAN300 (Tier 3)". Off = hidden entirely, as the client sees it.
7. Renters and Site Users see the same hardware features as the owner for the assets they can see (within their window).
8. The public tracking page shows location only, whatever the tier.
9. Kasper console shows each asset's adapter, tier and CAN check list.
10. **Phases:** each feature has a phase: Day one, Phase 2 or Later. The demo bar's phase switch shows only features up to the chosen phase. In this prompt, "Phase 2+" means Phase 2 or Later.
11. **Tier 1 money and maintenance:** a Tier 1 asset can still be billed by days on hire, or by ignition hours labelled "Estimated — not billing-grade". It can have date- or GPS-distance-based service plans. It never gets a MUC, measured fuel cost or measured idle cost. Cost & ROI shows those lines as "Estimated" (class average L/h × ignition hours, from `pricing.ts`) or "Not measured" when there is no basis.

---

## 7. Data model (`src/domain/types.ts`)

```ts
type TenantType = 'vendor' | 'client' | 'both';
type Role = 'kasper_admin' | 'kasper_ops' | 'tenant_admin' | 'site_user';
type Adapter = 'none' | 'LVCAN200' | 'ALL-CAN300';
type AssetStatus = 'live' | 'idle' | 'stale' | 'offline' | 'unknown' | 'no_tracker';
type AssetClass = 'truck' | 'light_vehicle' | 'plant' | 'lifting' | 'power';

interface Tenant { id; name; type: TenantType; status: 'active' | 'suspended'; createdAt }
interface Site { id; tenantId; name; center: { lat; lng }; radiusM }
interface User { id; name; email; role: Role; tenantId: string | null; siteIds: string[];
  status: 'active' | 'invited' | 'deactivated'; title?: string }
interface Asset { id; code; name; type; assetClass: AssetClass; make; model; year;
  plateOrSerial; ownerTenantId; homeSiteId; tankLitres?: number;
  canProfile: { adapter: Adapter; supported: ParamKey[]; checkedAt?: string; notes?: string } }
interface Tracker { id; imei; model: 'FMC130'; simIccid; firmware; pingIntervalSec; sleepMode: 'off' | 'deep' | 'gps';
  stockStatus: 'in_stock' | 'paired' | 'faulty' | 'retired'; registeredAt; registeredBy;
  flaggedForSupport?: { by; at; note } }
interface Pairing { id; trackerId; assetId; from; to: string | null }
interface Reading { trackerId; deviceTime; receivedAt; lat; lng; speedKmh; heading; satellites;
  ignition: boolean; moving: boolean; extVoltage: number; intBattery: number; gsm: 0|1|2|3|4|5;
  gnssOdometerKm: number;
  // CAN values present only if the asset's profile supports them:
  fuelLevelPct?; fuelUsedL?; fuelRateLph?; rpm?; canOdometerKm?; coolantC?; engineLoadPct?;
  engineHours?; activeDtcs?: string[]; adBluePct?;
  event?: 'harsh_brake' | 'harsh_accel' | 'harsh_corner' | 'overspeed' | 'power_cut' | 'towing' }
interface Booking { id; assetId; ownerTenantId; renterTenantId: string | null; renterName?: string;
  renterSiteId: string | null; start; end; status: 'scheduled' | 'active' | 'closed' | 'cancelled';
  cancelledAt?; closedAt?; reference }
interface GrantOverride { bookingId; endedAt; endedBy; reason }
interface TrackingLink { id; token; assetId; bookingId: string | null; createdBy; createdAt; expiresAt;
  revokedAt?; revokedBy?; revokeReason?: 'manual' | 'job_closed' | 'booking_cancelled' | 'access_ended' }
interface Alert { id; assetId; type: AlertType; openedAt; closedAt?; acknowledgedBy?; acknowledgedAt?; detail }
type AlertType = 'offline' | 'power_cut' | 'low_battery' | 'towing' | 'overspeed' | 'harsh_driving' | 'fuel_drop' | 'fault_code'
  | 'geofence_enter' | 'geofence_exit' | 'after_hours_move' | 'maintenance_due' | 'maintenance_overdue' | 'invoice_overdue';
// Alert gains tenantId: geofence, maintenance and invoice alerts belong to one tenant and only that tenant sees them.
interface AuditEntry { id; at; actorUserId; action; tenantId?; assetId?; detail; reason? }
// Asset gains: status: 'active' | 'retired'; behaviour: SimBehaviour; createdAt; createdBy
// Asset ownership is dated: OwnershipPeriod { assetId; tenantId; from; to: string | null }
type SimBehaviour = 'parked' | 'works_at_site' | 'drives_between_sites' | 'stationary_24h' | 'light_vehicle_day';
interface CanAdapter { id; serial; model: 'LVCAN200' | 'ALL-CAN300'; status: 'in_stock' | 'fitted' | 'faulty' | 'retired';
  assetId: string | null; fittedAt?; registeredAt }
interface AdapterFitting { id; adapterId; assetId; from; to: string | null }   // dated, like Pairing
interface TrackerRequest { id; tenantId; assetId; requestedBy; at; note; status: 'open' | 'done' | 'declined'; handledBy?; handledAt? }
interface OnboardingDraft { id; createdBy; step: 1 | 2 | 3 | 4 | 5 | 6; data: unknown; updatedAt }
// Booking gains: rateType: 'daily' | 'hourly'; rateAed: number; minHoursPerDay?: number;
//   destination?: { name; lat; lng }   (for ETA on tracking links)
// TrackingLink gains: showEta: boolean
interface Label { id; tenantId; name; createdBy; createdAt }            // ≤ 40 chars, unique per tenant (case-insensitive)
interface AssetLabel { labelId; assetId; tenantId }                      // ≤ 20 labels per asset per tenant
interface Geofence { id; tenantId; name; kind: 'site' | 'job' | 'restricted' | 'yard';
  shape: { type: 'circle'; center; radiusM } | { type: 'polygon'; points: { lat; lng }[] };
  siteId?; alertOnEnter: boolean; alertOnExit: boolean;
  afterHoursOnly?: { from: 'HH:mm'; to: 'HH:mm' }; assetIds: 'all' | string[]; createdBy; createdAt }
interface GeofenceEvent { id; geofenceId; assetId; type: 'enter' | 'exit'; at }   // derived from readings, cached
interface ReportRun { id; userId; reportType; scope; from; to; format: 'pdf' | 'xlsx'; createdAt;
  scheduleId?; status: 'ready' | 'skipped'; skipReason?; fileName }       // files regenerate on demand
interface ReportSchedule { id; userId; reportType; scope; frequency: 'daily' | 'weekly' | 'monthly';
  runAt: 'HH:mm'; weekday?; format; nextRunAt; active: boolean }
interface MaintenancePlan { id; tenantId; assetId; name; basis: 'engine_hours' | 'km' | 'days';
  hoursSource?: 'ecu' | 'estimated'; kmSource?: 'can' | 'gps'; interval: number; dueSoonAt: number;
  lastDoneAt: string; lastDoneValue: number }
interface ServiceRecord { id; planId?; assetId; tenantId; doneAt; value; notes; costAed; createdBy; fromFaultCode? }
interface Muc { id; number; assetId; ownerTenantId; bookingId?: string; periodFrom; periodTo;
  payload: MucPayload; sealSha256; issuedAt; issuedBy; status: 'sealed' | 'voided';
  voidedAt?; voidedBy?; voidReason?; replacesMucId?; reissueOf?: string }
interface MucPayload { version: 1; asset: { code; name; make; model; serial }; owner; renter?; periodFrom; periodTo;
  openingHoursEcu; closingHoursEcu; billableHours; days: { date; engineHours; workingHours; idlingHours; gapMinutes }[];
  gaps: { from; to }[]; gapRule: 'delta_disclosed'; source: 'ECU' }
interface Invoice { id; number; kind: 'rental' | 'gps_subscription'; issuerTenantId: string | 'kasper';
  customerTenantId: string | null; customerName; bookingId?; mucId?; lines: InvoiceLine[];
  subtotalAed; vatAed; totalAed; issuedAt; dueAt; status: 'unpaid' | 'part_paid' | 'paid' | 'overdue' | 'void' }
interface InvoiceLine { description; basis: 'ECU' | 'Estimated' | 'Days on hire' | 'Tracker · Tier 1' | 'Tracker · Tier 2' | 'Tracker · Tier 3';
  quantity; unit: 'h' | 'day' | 'tracker-month'; rateAed; amountAed }
interface Payment { id; invoiceId; at; amountAed; method: 'bank_transfer' | 'cheque' | 'cash' | 'simulated_online'; reference; recordedBy }
interface AssetCostProfile { assetId; tenantId; purchaseValueAed; monthlyFinanceAed; operatorCostPerHourAed;
  insurancePerMonthAed }
```

Derived, never stored: current pairing; readings of an asset (from whichever tracker was paired **at each reading's time**); status; grant windows; open alerts.

---

## 8. Seed data (deterministic)

Use a seeded PRNG (mulberry32, fixed seed `20261005`). All times are relative to the clock's **anchor** = real time when the store is first created (persist the anchor so "2 days ago" stays consistent across reloads until Reset). Fictional companies and people only.

### 8.1 Tenants and sites

| Tenant | Type | Hardware profile | Sites (lat, lng) |
| --- | --- | --- | --- |
| **Al Noor Transport** | vendor | **No CAN adapters at all** (Tier 1 only) | Jebel Ali Yard (25.0118, 55.1132) · DIP Yard (24.9840, 55.1735) |
| **Emirates Earthmovers** | vendor | Mostly ALL-CAN300; two older Tier 1 units | Al Quoz Yard (25.1366, 55.2311) · Ras Al Khor Yard (25.1890, 55.3460) |
| **Gulf Lift Rentals** | both | Mixed: Tier 3 cranes/telehandlers, Tier 1 small lifts, one Tier 2 pickup | Al Qusais Yard (25.2860, 55.3820) |
| **Marina Builders** | both | Owns 3 light vehicles with LVCAN200; rents heavy equipment | Dubai Hills Project (25.1045, 55.2486) · Business Bay Tower (25.1865, 55.2721) · JVC Villas (25.0600, 55.2100) |
| **Palm Contracting** | client | Owns nothing; only rents | Palm Crescent Works (25.1124, 55.1390) · Dubai South Hub (24.8960, 55.1600) |

### 8.2 Assets (36)

| Code | Asset | Class | Owner | Home site | Adapter | CAN check removes | Scenario at anchor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FB-12 | Flatbed trailer truck · Mercedes Actros 2017 | truck | Al Noor | Jebel Ali | none | — | Live, moving; hired to an outside hirer, active tracking link |
| FB-14 | Flatbed truck · Volvo FH 2019 | truck | Al Noor | Jebel Ali | none | — | Live, parked |
| LB-02 | Lowbed · MAN TGS 2018 | truck | Al Noor | DIP | none | — | Live; past outside-hire link expired yesterday |
| LB-05 | Lowbed · Scania R500 2020 | truck | Al Noor | DIP | none | — | Idle at a site |
| TP-21 | Tipper · Volvo FMX 2016 | truck | Al Noor | Jebel Ali | none | — | Live; harsh braking events; rental to Marina closed last week |
| TP-22 | Tipper · Volvo FMX 2016 | truck | Al Noor | Jebel Ali | none | — | Live; active "no job" 24 h link |
| TP-23 | Tipper · Hino 700 2015 | truck | Al Noor | DIP | none | — | Power cut 2 h ago (ext voltage 0, running on tracker battery), then Offline 40 min ago |
| WT-07 | Water tanker · Isuzu FVZ 2018 | truck | Al Noor | DIP | none | — | Live; over-speed event yesterday |
| WT-08 | Water tanker · Isuzu FVZ 2018 | truck | Al Noor | Jebel Ali | none | — | Stale |
| PU-31 | Pickup · Toyota Hilux 2021 | light_vehicle | Al Noor | Jebel Ali | none | — | Live |
| EX-04 | Excavator · CAT 320 2020 | plant | Emirates | Al Quoz | ALL-CAN300 | adBlue | Working; rented to Marina (Dubai Hills), active −2 d → +5 d |
| EX-07 | Excavator · Komatsu PC210 2019 | plant | Emirates | Al Quoz | ALL-CAN300 | — | Offline 3 h; booking to Marina (Dubai Hills) starts tomorrow 08:00 |
| EX-11 | Excavator · Hyundai HX220 2021 | plant | Emirates | Ras Al Khor | ALL-CAN300 | faultCodes | Live; rental to Palm ended early yesterday by owner (reason given) |
| WL-03 | Wheel loader · CAT 950 2018 | plant | Emirates | Al Quoz | ALL-CAN300 | — | Idling (low load) |
| WL-06 | Wheel loader · Volvo L120 2020 | plant | Emirates | Ras Al Khor | ALL-CAN300 | — | Working; rented to Palm (Palm Crescent), active −1 d → +10 d |
| BD-02 | Bulldozer · CAT D6 2017 | plant | Emirates | Al Quoz | ALL-CAN300 | — | Active fault code `SPN 110 FMI 0` (coolant high); rented to Gulf Lift (Al Qusais) −3 d → +4 d |
| BH-05 | Backhoe loader · JCB 3CX 2019 | plant | Emirates | Ras Al Khor | ALL-CAN300 | fuelLevel | Live |
| GR-01 | Motor grader · CAT 140K 2016 | plant | Emirates | Al Quoz | ALL-CAN300 | fuelLevel, coolantTemp | Idle |
| CP-03 | Soil compactor · Bomag BW213 2012 | plant | Emirates | Ras Al Khor | none | — | Live (old machine, no CAN) |
| GN-01 | Generator 250 kVA · Cummins 2020 | power | Emirates | Al Quoz | ALL-CAN300 | — | Running; fuel drop of 18% at 02:10 last night; rented to Palm (Dubai South) active |
| GN-02 | Generator 60 kVA · Perkins 2014 | power | Emirates | Ras Al Khor | none | — | Low tracker battery (vehicle power off for days), Stale |
| LD-09 | Skid steer loader · Bobcat S650 2018 | plant | Emirates | Al Quoz | — | — | **No tracker**: its tracker was moved to PU-41 10 days ago |
| CR-02 | Mobile crane 50 t · Liebherr LTM 1050 2018 | lifting | Gulf Lift | Al Qusais | ALL-CAN300 | — | Idle; rented to Marina (Business Bay) −6 d → +8 d |
| CR-05 | Mobile crane 30 t · Tadano GR-300 2016 | lifting | Gulf Lift | Al Qusais | ALL-CAN300 | faultCodes | Stale; its booking to Marina was cancelled |
| CR-08 | Crawler crane · Sany SCC550 2015 | lifting | Gulf Lift | Al Qusais | none | — | Live |
| TH-01 | Telehandler · JCB 540-170 2021 | lifting | Gulf Lift | Al Qusais | ALL-CAN300 | — | Working; rented to Palm (Dubai South) −4 d → +3 d |
| TH-04 | Telehandler · Manitou MT1840 2019 | lifting | Gulf Lift | Al Qusais | ALL-CAN300 | adBlue | Live |
| FL-09 | Forklift 5 t · Toyota 2022 | lifting | Gulf Lift | Al Qusais | none | — | **Unknown**: paired this morning, never reported |
| FL-10 | Forklift 3 t · Hyster 2017 | lifting | Gulf Lift | Al Qusais | none | — | Idle |
| BL-01 | Boom lift · JLG 600S 2018 | lifting | Gulf Lift | Al Qusais | none | — | Live |
| SL-02 | Scissor lift · Genie GS-3246 2020 | lifting | Gulf Lift | Al Qusais | none | — | Offline 2 days |
| MW-01 | Mobile welder trailer · Lincoln Vantage 2023 | power | Gulf Lift | Al Qusais | — | — | **No tracker**: added by Priya 2 days ago; tracker requested (open) |
| PU-41 | Pickup · Nissan Navara 2020 | light_vehicle | Gulf Lift | Al Qusais | LVCAN200 | coolantTemp, engineHours | Live; its tracker came from LD-09 10 days ago |
| PU-51 | Pickup · Toyota Hilux 2022 | light_vehicle | Marina | Dubai Hills | LVCAN200 | — (engineHours partial supported) | Live |
| PU-52 | Pickup · Ford Ranger 2021 | light_vehicle | Marina | Business Bay | LVCAN200 | engineHours | Idle |
| VN-01 | Van · Toyota Hiace 2019 | light_vehicle | Marina | JVC Villas | LVCAN200 | coolantTemp, engineHours | Live |

Tank sizes: excavators 400 L, loaders 300 L, dozer 450 L, grader 350 L, backhoe 160 L, generators GN-01 500 L, cranes 400 L, telehandlers 140 L, pickups 80 L, van 70 L.

### 8.3 Trackers and pairings

One FMC130 per tracked asset (34 trackers, IMEIs `35209310` + 6 deterministic digits + a Luhn check digit, SIMs `89971` + 14 digits, firmware `03.29.00.Rev.03`, ping 30 s). Plus **3 spare trackers** registered but unpaired (for the pairing flow); one of them is CR-08's old tracker, swapped out 20 days ago and flagged for support ("Returned for repair — intermittent GSM"). Pairing history includes: the LD-09 → PU-41 move 10 days ago; FL-09 paired this morning; CR-08's swap 20 days ago.

Every seeded IMEI is 15 digits with a valid **Luhn check digit** (generate the first 14, compute the 15th). **CAN adapters:** one per CAN-fitted asset (serials `LV2-` / `AC3-` + 6 digits), with fitting history matching each asset's adapter, plus stock: 2 ALL-CAN300 and 2 LVCAN200 in stock, 1 ALL-CAN300 marked faulty. **Tracker request:** Priya (Gulf Lift) asked 2 days ago for a tracker on a new asset **MW-01 · Mobile welder trailer** (Tier 1, No tracker, created by Priya); status open.

### 8.4 Bookings

| Ref | Asset | Renter | Renter site | Window | Status |
| --- | --- | --- | --- | --- | --- |
| BK-1001 | EX-04 | Marina | Dubai Hills | −2 d 08:00 → +5 d 18:00 | active |
| BK-1002 | CR-02 | Marina | Business Bay | −6 d 07:00 → +8 d 18:00 | active |
| BK-1003 | EX-07 | Marina | Dubai Hills | tomorrow 08:00 → +8 d 18:00 | scheduled |
| BK-1004 | WL-06 | Palm | Palm Crescent | −1 d 07:00 → +10 d 18:00 | active |
| BK-1005 | TH-01 | Palm | Dubai South | −4 d 07:00 → +3 d 18:00 | active |
| BK-1006 | GN-01 | Palm | Dubai South | −5 d 06:00 → +9 d 22:00 | active |
| BK-1007 | BD-02 | Gulf Lift | Al Qusais | −3 d 07:00 → +4 d 18:00 | active |
| BK-1008 | TP-21 | Marina | JVC Villas | −10 d 07:00 → −5 d 18:00 | closed |
| BK-1009 | CR-05 | Marina | Business Bay | −2 d → +6 d (cancelled −3 d) | cancelled |
| BK-1010 | EX-11 | Palm | Palm Crescent | −6 d → +4 d; **ended early** −1 d 16:20 by Khalid, reason "Payment overdue for two weeks" | active + override |
| BK-1011 | FB-12 | Outside hirer "Al Habtoor Logistics" (not on Kasper) | — | today 06:00 → today 20:00 | active |
| BK-1012 | LB-02 | Outside hirer "Bin Saeed Haulage" | — | −2 d → −1 d 17:00 | closed |

### 8.5 Tracking links

| Asset | Booking | Token | State |
| --- | --- | --- | --- |
| FB-12 | BK-1011 | fixed demo token `k7Qm2Xc9TpLw4ZaN8rVb3Ye5` | active, expires today 20:00 |
| TP-22 | none ("no job") | random | active, expires in 20 h |
| LB-02 | BK-1012 | random | ended: job closed yesterday |
| CR-02 | BK-1002 | random | revoked manually by Priya 2 d ago |

### 8.6 Users (shown in the "View as" dropdown, grouped by company)

| Name | Email | Role | Company | Sites | Status | Why they're here |
| --- | --- | --- | --- | --- | --- | --- |
| Sara Haddad | sara@kasper.ae | kasper_admin | Kasper | — | active | Full platform, console, audit |
| Ravi Menon | ravi@kasper.ae | kasper_ops | Kasper | — | active | Trackers, pairing, no admin |
| Omar Saleh | omar@alnoor.ae | tenant_admin | Al Noor | — | active | **No-CAN fleet**: never sees fuel/engine anything |
| Hessa Al Mansoori | hessa@alnoor.ae | tenant_admin | Al Noor | — | active | Second admin (last-admin rule test) |
| Khalid Rahman | khalid@emiratesearth.ae | tenant_admin | Emirates Earthmovers | — | active | Tier 3 fleet owner; rents out a lot |
| Priya Nair | priya@gulflift.ae | tenant_admin | Gulf Lift | — | active | Mixed tiers; owns and rents (BD-02) |
| Mark D'Souza | mark@gulflift.ae | site_user | Gulf Lift | Al Qusais | active | Sees own Al Qusais assets + rented BD-02 |
| Lina Aziz | lina@marina.ae | tenant_admin | Marina | — | active | Renter of EX-04, CR-02; owns 3 Tier 2 vehicles |
| Ahmed Yousef | ahmed@marina.ae | site_user | Marina | Dubai Hills | active | Sees EX-04 (rented) + PU-51 (own); EX-07 from tomorrow |
| John Mathew | john@marina.ae | site_user | Marina | **Business Bay + JVC Villas** | active | **Two sites**: CR-02 (rented) + PU-52 + VN-01 (own); TP-21 in past-rental reports |
| Anil Kumar | anil@marina.ae | site_user | Marina | JVC Villas | active | Sees VN-01 only now; TP-21 only in past-rental reports |
| Karim Old | karim@marina.ae | site_user | Marina | Dubai Hills | deactivated | Can't sign in |
| Sam Invite | sam@marina.ae | site_user | Marina | Business Bay | invited | First sign-in activates |
| Fatima Noor | fatima@palmcontracting.ae | tenant_admin | Palm | — | active | Pure renter; owns nothing; lost EX-11 early |
| Rashid Ali | rashid@palmcontracting.ae | site_user | Palm | Palm Crescent | active | Sees WL-06 only (EX-11 access ended) |
| Deepa Shah | deepa@palmcontracting.ae | site_user | Palm | **Dubai South + Palm Crescent** | active | **Two sites**: TH-01, GN-01 (fuel drop alert, view only) + WL-06; Palm's geofence alerts at both sites |
| (Outside hirer) | — | — | Al Habtoor Logistics | — | — | Opens FB-12's tracking link, no account |

### 8.7 Alerts at anchor (Phase 2+)

Offline: EX-07, TP-23, SL-02 · Power cut: TP-23 · Low battery: GN-02 · Over-speed: WT-07 (yesterday, closed) · Harsh driving: TP-21 (3 events, last 2 d) · Fuel drop: GN-01 (02:10 last night, open) · Fault code: BD-02 (open) · Towing: LB-05 moved 400 m with ignition off yesterday 23:40 (closed).
Also (tenant-owned): geofence exit WL-06 from Palm Crescent works yesterday 19:10 (Palm, closed) · after-hours move LB-05 out of Al Quoz Yard (Emirates, closed) · maintenance overdue BD-02 and CR-08, due soon EX-04, FB-14, CR-02 (owners) · invoice overdue INV-EE-0415 (Emirates).
Day one shows offline alerts only.

### 8.8 Audit log at anchor

~35 entries since the 1st of last month: tenant creation (Palm, 12 d ago), pairings, the LD-09 → PU-41 move, CR-08 tracker swap and support flag, link creations/revocations, Khalid's early cut-off with reason, Sara viewing Marina's assets, Lina inviting Sam, MUC issue/void/reissue, payments recorded, geofence and maintenance plan changes.

### 8.10 Data for the extended features

P2 seeds the history window, past bookings, rates, the BK-1011 destination and the scripted movements (section 9). Each other part of this section is seeded in the phase that builds its feature (P11–P14), with a check that its counts match.

**History window.** Telemetry exists from **00:00 on the 1st of the previous month** to the simulated now, so a full previous calendar month is available for MUCs and invoices. In the rest of this section, "last month" means that previous calendar month, and "day 5" means its 5th.

**Past bookings (closed, last month)**, added to 8.4:

| Ref | Asset | Renter | Renter site | Window | Rate |
| --- | --- | --- | --- | --- | --- |
| BK-0981 | EX-04 | Palm | Palm Crescent | day 1 07:00 → day 20 18:00 | hourly AED 185, min 8 h/day |
| BK-0982 | WL-03 | Marina | Dubai Hills | day 5 07:00 → day 25 18:00 | hourly AED 160, min 8 h/day |
| BK-0983 | CR-02 | Palm | Dubai South | day 10 07:00 → day 28 18:00 | daily AED 3,200 |

Rates for the current bookings: plant hourly AED 150–200 with a minimum of 8 h/day; cranes and telehandlers daily AED 1,200–3,500; trucks daily AED 900–1,400 (TP-21 daily AED 1,100); outside hires daily. BK-1011 (FB-12, outside hirer) has destination **"Al Habtoor site, Al Barsha" (25.1130, 55.2000)**. During the hire, FB-12 drives from Jebel Ali towards it and arrives about 90 minutes after the anchor.

**Labels:**
- Al Noor: "Port runs" (FB-12, FB-14, LB-02), "Night shift" (WT-07, WT-08).
- Emirates: "Project Alpha" (EX-04, WL-03, BD-02), "Long-term hire" (WL-06, GN-01), "Needs service" (BD-02).
- Gulf Lift: "Cert due Q4" (CR-02, CR-05, CR-08).
- Marina: "Site vehicles" (PU-51, PU-52, VN-01).

**Geofences.** Every site automatically gets a `site` circle from its centre and `radiusM` (default 300 m; quarry/yard 500 m). Also:
- Al Noor: "Jebel Ali Port gate 4" (job circle, 400 m), enter/exit alerts on.
- Emirates: "Al Quoz Yard — after hours" (yard polygon, exit alerts 19:00–06:00 only). LB-05's towing event also produces an exit event here. "Hatta Quarry" (job circle, 600 m).
- Palm: "Palm Crescent works" (job polygon, 6 points), exit alert on. Seed event: WL-06 exited it yesterday 19:10 and re-entered 19:55 (closed alert).
- Marina: "Dubai Hills — no-go: school zone" (restricted circle, 250 m), enter alert on.

**Maintenance plans** (owners only):

| Asset | Plan | Basis | State at anchor |
| --- | --- | --- | --- |
| EX-04 | 500 h service | engine hours · ECU | last 8,000 h; now ~8,420 h → **Due soon** (80 h left) |
| BD-02 | 250 h service | engine hours · ECU | last 14,700 h; now ~14,980 h → **Overdue** by 30 h |
| GN-01 | Oil change 250 h | engine hours · ECU | Ok |
| FB-14 | 10,000 km service | km · GPS distance | **Due soon** (300 km left) |
| TP-22 | 400 h service | engine hours · Estimated (ignition) | Ok |
| CR-02 | Annual crane inspection | 365 days | **Due soon** (in 12 days) |
| CR-08 | Annual crane inspection | 365 days | **Overdue** by 5 days |
| PU-51 | 10,000 km service | km · CAN odometer | Ok |

Thresholds: due soon = within 10% of the interval or 14 days. Seed 2–4 past service records per plan, with costs (AED 450–6,800).

**Cost profiles** for every Emirates, Gulf Lift and Al Noor asset: purchase value, monthly finance and insurance, and operator cost per hour, all realistic for the UAE and all labelled dummy.

**MUCs:**
- Sealed: MUC-<YYYY-MM>-EX-04-01 for BK-0981, and MUC-<YYYY-MM>-WL-03-01 for BK-0982 (rental-period certificates).
- A full-month certificate for BD-02 (owner use, no renter).
- MUC-…-WL-03-01 was voided 3 days after issue (reason: "Wrong period — booking was extended by 2 days") and replaced by MUC-…-WL-03-02.

**Invoices:**

| Invoice | Issuer → customer | For | Basis | Status |
| --- | --- | --- | --- | --- |
| INV-EE-0412 | Emirates → Palm | BK-0981 EX-04 | ECU hours from the MUC; min 8 h/day applied | Paid (bank transfer) |
| INV-EE-0415 | Emirates → Marina | BK-0982 WL-03 | ECU hours from MUC -02 | Overdue (due 6 days ago) |
| INV-GL-0207 | Gulf Lift → Palm | BK-0983 CR-02 | Days on hire | Part-paid (60%) |
| INV-AN-0098 | Al Noor → Marina | BK-1008 TP-21 | Days on hire | Unpaid, due in 9 days |
| INV-AN-0091 | Al Noor → Bin Saeed Haulage (no account) | BK-1012 LB-02 | Days on hire | Paid (cash) |

VAT is 5% on every invoice.

**GPS subscription (Kasper → each tenant)**, last month: one line per tracker-month, by tier (dummy AED 75 Tier 1 · 110 Tier 2 · 165 Tier 3, from `pricing.ts`). Al Noor: paid. Emirates: paid. Gulf Lift: unpaid. Marina: paid. Palm: no trackers, no statement.

**Report schedules:** Khalid has a weekly Trip & Mileage report for "Project Alpha" every Sunday 07:00, with 2 past runs. Lina has a daily Location history report for EX-04 at 18:00.

### 8.9 Expected results at anchor (`src/server/seed/expected.ts`)

Write a fixture with, for every user in 8.6: the asset codes they see at the anchor, with their relationship (owner / renter) and readable window. Also list, for every asset in 8.2: its status at the anchor and its visible feature set. Unit tests, `/dev/access` and the Features panel (section 10) all compare against this file. If the code and the fixture disagree, the fixture follows this prompt. Fix the code, not the fixture.

---

## 9. Telemetry simulator (`src/server/telemetry/`)

Generate readings **on demand** per tracker per day and cache them (never pre-generate everything).

- **Working days:** Sat–Thu, shifts 07:00–18:00 (generators can run 24 h; trucks may run 05:00–21:00). Friday light.
- **Reading interval:** every 30 s while ignition on or moving; every 10 min while parked with ignition off; trackers in deep sleep send one reading per hour.
- **Movement:** trucks drive between their yard and job sites/quarries along plausible straight-ish polylines with jitter; speeds 20–90 km/h on roads, never above 100 except planned over-speed events. Plant moves little (within ~300 m of its work site) with ignition on most of the shift. Lifting: short moves. Generators: stationary.
- **Where:** an asset on an active rental works at the renter's site; otherwise around its home site or job locations near it. Readings for the period a rental covers are located at the renter's site.
- **Assets created during the demo** generate readings from their tracker's pairing time (after a 2–5 min first fix), using their `SimBehaviour`:
  - `parked`: ignition off at the home site, a reading every 10 min.
  - `works_at_site`: shifts as for plant, moving within 300 m of the home site.
  - `drives_between_sites`: shifts as for trucks, driving between the home site and the owner's other sites, or the renter's site during a booking.
  - `stationary_24h`: a generator profile.
  - `light_vehicle_day`: 07:00–19:00 trips around the owner's sites.
  - CAN values only from the adapter's fitting time, for the params the CAN check ticked. The PRNG is seeded from the tracker IMEI, so the same set-up gives the same readings.
- **Scripted movements for the extended features:**
  - FB-12 drives Jebel Ali → BK-1011's destination, arriving about 90 min after the anchor.
  - WL-06 leaves the Palm Crescent works polygon yesterday 19:10 and returns at 19:55.
  - LB-05's towing event crosses the Al Quoz Yard after-hours fence.
  - BH-05 is carried from Ras Al Khor Yard to Hatta Quarry (24.8128, 56.1175) tomorrow 08:30–10:15, works there until 17:00, and returns.
  - Last month's bookings place their assets at the renter's site for the booking window.
  - FB-14's distance is about 300 km below its next service, and EX-04's and BD-02's ECU hours line up with 8.10.
- **Ignition, moving, speed, heading, satellites (7–14), gsm (2–5), extVoltage** (24.0–28.4 V trucks/plant running, 12.4–14.2 V light vehicles; drops 0.5 V when ignition off), **intBattery** (3.9–4.1 V; falls toward 3.5 V when external power is cut).
- **gnssOdometerKm** accumulates from distance.
- **CAN values** only for params the asset supports:
  - rpm 650–850 idling, 1200–2100 working/driving; 0 ignition off
  - coolantC 82–94 running; drifts to ambient (30–42) when off; BD-02 rises to 108 with the fault
  - engineLoadPct 10–20 idling, 35–85 working
  - fuelLevelPct falls with fuelRate; refuel jumps of 40–70% once every 1–3 days during shift; GN-01's theft drop of 18% at 02:10 while ignition off
  - fuelRateLph: excavator 12–22 working, loader 10–18, dozer 18–28, crane 6–12, generator 25–40 (250 kVA), pickup equivalent from distance
  - fuelUsedL cumulative from rate
  - engineHours (ECU) cumulative: starts at a realistic number per asset (EX-04 8,420.4 h; BD-02 14,980.2 h…), increases with engine-on time
  - canOdometerKm for road vehicles, slightly different from GPS distance (±2%)
  - activeDtcs for BD-02 from 05:40 today
  - adBluePct for trucks/plant that support it, slowly falling
- **Gaps:** inject realistic connectivity gaps (5–40 min) a few times per week per asset, plus each scenario's offline period. Never interpolate across gaps.
- **Scenario overrides** from the asset table (offline since, stale, power cut, unknown, towing, over-speed, harsh events).
- `reportingUntil`: trackers that keep reporting generate up to the **simulated now**; scenario trackers stop at their scenario time.
- **Replay batch:** on FB-14, 20 readings whose device time is 6 h before the anchor, all received 2 h before the anchor (a tracker flushing its memory after a coverage gap). They fill history in device-time order. They must never open or close an alert.
- `receivedAt` = `deviceTime` + 2–8 s for all other readings.

Unit tests: determinism (same seed → identical readings for a given asset/day), CAN fields absent when unsupported, gaps respected, GN-01's drop present, status at anchor matches the asset table for every asset.

---

## 10. Demo bar (top of every page, prototype only)

A slim bar above the app, ink background, small text:

1. **View as ▾** — a searchable dropdown of all users, grouped by company (Kasper, Al Noor, Emirates, Gulf Lift, Marina, Palm). `Ctrl+K` opens it.
   - Each row shows name, role and site, e.g. "Ahmed Yousef — Site User · Dubai Hills".
   - Each row also has small badges computed from live data: "No CAN", "T1 · T2 · T3" hardware mix, "renting 2", "rented out 3", "deactivated", "invited".
   - The list ends with "Outside hirer (tracking link)", which opens `/t/<FB-12 token>`, and "Signed out", which shows the sign-in page.
   - Switching user takes effect immediately and lands on that user's home: `/app`, or `/console` if they were on the console and are Kasper staff.
   - Deactivated users appear greyed; picking one shows the sign-in error. Users invited during the demo appear here with the "invited" badge.
2. **Features** button → right-side sheet for the current user:
   - **Header:** who they are, company, role, sites, and one line on what the role is for.
   - **Permissions:** every capability from section 5, grouped (Seeing assets · Acting on assets · Rentals & links · Alerts · Labels & geofences · Reports & downloads · Certificates & billing · Maintenance & cost · Company admin · Kasper console). Each row has ✓ or ✕, the scope in plain words ("own assets only", "rented: from rental start"), and, for ✕, the reason, e.g. "Site Users can't edit assets — the company decides how its fleet is organised". Reason text lives in `src/server/capability-reasons.ts`.
   - **Hardware:** the tiers in their current view (e.g. "10 assets · all Tier 1 (no CAN)"), and every feature from section 6.3 with ✓ or ✕ and the reason, e.g. "Fuel level — none of your assets has a CAN adapter".
   - **Right now:** counts of owned, rented-in and rented-out assets, active tracking links and open alerts.
3. **Clock:** shows simulated Dubai time. Buttons: −1 d, −1 h, +1 h, +1 d, +1 w, Reset to now. **Jump to ▾** lists event presets computed from the seed:
   - "EX-07 rental starts (tomorrow 08:00)"
   - "1 min before EX-07 rental starts"
   - "EX-04 rental ends"
   - "FB-12 link expires (today 20:00)"
   - "TP-22 24-hour link expires"
   - "WT-08 goes offline"
   - "FB-12 arrives at Al Habtoor site"
   - "Start of last month" / "End of last month"
   - "INV-AN-0098 becomes overdue"
4. **Phase:** Day one / Phase 2 / Later (default Later, i.e. everything). Each step hides every feature, tab, column, report, alert type and menu item from a later phase (section 6.3).
5. **Show hidden:** off/on, for reviewers. When on, actions this user can't use (because of their role or relationship to the asset) appear with a dashed outline and a lock. Hovering shows the same reason as the Features panel. When off, they are simply absent, as in the product.
6. **Sales view:** off/on (section 6.4 rule 6). This is separate from Show hidden: Show hidden explains permissions, Sales view shows hardware upgrades.
7. **Scenarios ▾ (guided walkthroughs)** — every scenario in section 13 is a short guided walkthrough:
   - **Start** sets the user, clock and page.
   - The walkthrough then shows numbered steps in a small floating card and outlines the element to click with a pulsing yellow ring.
   - **Next** advances the steps. Where a step can be checked (link created, booking cancelled), it ticks itself.
   - The last step states what you should see.
   - Scenarios the current user can't do are listed greyed with "Not for this user — switch to Omar to try this", plus a one-click switch.
8. **Tools ▾:**
   - Booking simulator (`/dev/bookings`, section 11.7).
   - Audit log in "Demo view": read-only and labelled as such. It is visible to the demo runner even when the current user can't see audit.
   - `/dev/access` explorer.
   - Export demo state as JSON.
   - Email outbox (simulated): every scheduled report and alert that would have been emailed, with recipient and time.
   - Tamper with a stored certificate (section 11.16).
   - Reset demo data, with an on-page confirm.
9. A small "Prototype — dummy data" label. The bar uses the ink background and a yellow "DEMO" tag so nobody mistakes it for product UI. On the public page it collapses to a small floating pill.

The demo bar is a dev aid: it calls the same API with the chosen user's session and never bypasses permissions. The Features panel and Show hidden read from the same `can()` and `hasFeature()` the screens use, so they can't drift.

---

## 11. Screens

Global layout for `/app`: demo bar → top bar (Kasper wordmark · company name, or "Viewing: All tenants ▾" for Kasper staff · search · alerts bell · user menu) → page. User menu: name, role in words, Users & sites (if allowed), Console (Kasper), Language (EN/عربي), Sign out.

Left navigation for `/app`. Each item appears only if the user has the capability **and** the current phase allows it **and**, for hardware features, at least one asset in their view supports it:
- Map (Day one)
- Alerts (Day one)
- Reports (Day one)
- Downloads (Day one)
- Geofences (Phase 2)
- Certificates (MUC, Phase 2)
- Billing (Phase 2)
- Maintenance (Later)
- Cost & ROI (Later)

On phones these items move into a bottom sheet.

### 11.1 Sign-in (`/sign-in`)
Email + password (any password works for seeded emails). Exact messages:
- wrong/empty → "Email or password is incorrect."
- unknown email → "You don't have an account. Please contact your administrator."
- deactivated → "Your account is no longer active. Contact your company admin."
- suspended company → "Your company's account is suspended. Contact Kasper."
- invited user → signs in and becomes active ("Welcome to Kasper, Sam.")
"Forgot password?" → "We've sent a reset link to your email." Note for Kasper staff: "Kasper staff use two-factor in production."

### 11.2 Map view (`/app`, landing)
- **KPI strip:** fleet counts Live · Idle · Stale · Offline · Unknown · No tracker (each is a filter toggle). From Phase 2, if any visible asset supports them: "Engine hours today (ECU)", "Fuel used today", "Open alerts".
- **Map:** markers coloured by status, labelled by code on hover; clusters; "Rented" ring on rented-in assets; Unknown and No tracker assets are list-only. Start view: Kasper → all UAE assets; Tenant Admin → fit their assets; Site User → their site(s).
- **Popup:** code, name, status, last updated, tier chip (T1/T2/T3, quiet), "Open".
- **Asset list panel** beside the map (collapsible; on phones a Map | List tab): Asset (code + name; renters see "From Emirates Earthmovers"), Status, Last updated ("14:32 · 2 h ago"), Site, Badges (Rented, No tracker, Tier). Phase 2+ adds, only when relevant to visible assets: Fuel %, Engine hours (with source label), Open alerts.
- **Filters:** Status, Site (hidden for single-site Site Users), Asset type, Tier (only if the view contains more than one tier), Rented (Owned / Rented in) when the user has both, Tenant (Kasper only).
- **Search** by code, name or plate.
- Filters and search live in the URL so Back restores them.
- States: loading skeleton · "No assets yet" · "No assets match these filters" + Clear · error + Retry · map tiles fail → list fills the screen.

### 11.3 Asset detail (`/app/assets/[id]`)
- **Header:** code + name, make/model/year, plate or serial, site, StatusBadge, "Last updated 14:32 (2 h ago)" (hover shows device time vs received time), tier chip, Rented badge.
- **Rental strip:** owner sees current, upcoming and last 3 rentals ("Rented to Marina Builders · Dubai Hills Project · until 9 Oct 18:00"); renter sees "Rented from Emirates Earthmovers until 9 Oct 18:00 · History starts 3 Oct 08:00".
- **Actions** (only if allowed): Run report · Edit asset · Share tracking link · End access now.
- **Tabs:** Overview · History · Trips · (Phase 2+, if features exist) Engine & fuel · Driving · Utilisation · Alerts.
  - **Overview:** mini map; status; today's distance and ignition-on time; tiles for each visible hardware feature (power, hours with source label, fuel gauge, engine live values, faults count). Tier 1 assets show no CAN tiles at all.
  - **History:** period picker (24 h default, 7 d, custom; renters can't pick before their window), track on map with gap breaks, positions table (time, speed, ignition, plus CAN columns the asset supports), gap rows "No data 13:05 – 15:40".
  - **Trips:** list of trips (start/end time and place as coordinates, distance, duration, max speed); totals.
  - **Engine & fuel** (Tier 2/3): engine hours (ECU / partial / estimated, per rule), RPM, coolant, load (each "Not measured" if unsupported), fuel level chart with refuel ▲ and drop ▼ markers, fuel used per day, AdBlue, active fault codes with plain descriptions (`SPN 110 FMI 0 — Engine coolant temperature high`).
  - **Driving** (all tiers, Phase 2+): harsh events and over-speed list with time and place.
  - **Utilisation** (Phase 2+): last 7 days bars per day — Working / Idling / Off for Tier 3 plant; "Ignition on, stationary" / Moving / Off for Tier 1 and 2; with source note.
  - **Alerts:** this asset's alerts, Acknowledge where allowed ("Acknowledged by Omar Saleh at 15:02").
- **Edit asset** (owner, Kasper): name, type, plate or serial, home site (owner's sites only). Customers can't change tier or adapter.
- **Share tracking link** panel (11.6) and **End access now** panel (11.7).
- States: never reported → "No location data yet" · no tracker → "No tracker fitted" (no map) · offline → last position + "Offline since 14:32" · not allowed/missing → "Asset not found".

### 11.4 Alerts
Bell in top bar with count of open, unacknowledged alerts the user can see; dropdown list (asset, type in words, since, site); "View all" → `/app/alerts` page with filters (type, status, site) — in Day one phase only offline alerts exist. Alert types appear only if the user's visible assets can produce them. Acknowledge: Kasper and owner Tenant Admins only. Replayed (late-arriving) readings never open or close an alert.

Alert words: "Offline since 14:32" · "Power cut at 12:10 — running on tracker battery" · "Tracker battery low (3.5 V)" · "Moved with ignition off" · "Over speed: 104 km/h" · "Harsh braking" · "Fuel dropped 18% at 02:10 with engine off" · "Fault code SPN 110 FMI 0 — Engine coolant temperature high".

### 11.5 Reports (`/app/reports` and the "Run report" side sheet)
Report types (each listed only if at least one selected asset supports it and the phase allows):

| Report | Needs | Phase |
| --- | --- | --- |
| Trip & Mileage | trips | Day one |
| Location history | history.track | Day one |
| Operating hours (ignition hours estimated; ECU engine hours where available, separate columns, source labelled) | hours.ignition | Phase 2 |
| Fuel (used, refuels, drops, L/h) | fuel.used or fuel.level | Phase 2 |
| Utilisation | utilisation | Phase 2 |
| Driving events | driving.events | Phase 2 |

Scope: one asset, several assets, or a site. Date presets + custom. Format: PDF or Excel. Renters' ranges are clipped to their windows, with the header "Limited to your rental period: …". Past rentals (TP-21 for Anil/Lina) appear as "Past rental: 25–30 Sep". Excel: Summary sheet + one sheet per asset; PDF: Kasper wordmark, header block (company, assets, period, generated at/by, "Times in Dubai time (GST)"), table, page numbers. File name `Kasper_<Report>_<scope>_<from>_to_<to>.<ext>`, e.g. `Kasper_TripMileage_EX-04_2026-09-28_to_2026-10-05.xlsx`. Nothing in range → "Nothing to report for this period" (no empty file).

Trip rule: starts at ignition on + speed > 3 km/h; ends after 5 min stopped or ignition off; a gap > N minutes ends the trip and adds a "No data" row; distance never interpolated across gaps.

### 11.6 Tracking links + public page
- Share panel on Asset detail (owner, Kasper Admin): pick job (active/upcoming bookings for this asset, or "No job — 24 hour link"), shows expiry, Create → link + Copy (fallback: select text) + suggested message "Track FB-12 live: <link>". Active links list (created by/at, expires, job, Revoke). Past links with reason ("Job closed", "Booking cancelled", "Access ended", "Revoked by Priya Nair").
- Tokens: 16 random bytes, base64url; never sequential.
- When the booking has a destination, the Share panel shows a "Show arrival time (ETA) to the hirer" switch (on by default).
- `/t/[token]`: no app shell, phone first: Kasper wordmark, asset name, map with one marker, "Live" dot, "Updated 14:32"; refreshes every 30 s and on clock change; tracker offline but link valid → last position "Waiting for update"; with ETA on (section 11.14) a line under the map: "Arriving about 14:52 (in 18 min)" / "Arrived 14:50" / "ETA unavailable — waiting for update"; invalid/ended/altered → "This tracking link is no longer active." with nothing else. `noindex`, `no-referrer`.

### 11.7 Rentals
- Owner's rental strip and **End access now** (owner Tenant Admin, Kasper): reason required (≥10 characters: "Give a reason of at least 10 characters."), confirm button "End Palm Contracting's access now", then: override saved, the booking's links revoked, audit entry, toast "Palm Contracting no longer has access to EX-11."
- **Booking simulator** `/dev/bookings` (stands in for the booking system; linked from the demo bar): list bookings; create; extend; shorten; cancel; close job; "Run nightly check" (recomputes all windows, never undoes an override). Bookings show status in words: Upcoming, Active, Ended, Cancelled, Ended early. Every action shows a toast that spells out its effect, e.g. "Marina Builders lost access to CR-02 · 1 tracking link revoked" or "Lina Aziz will see EX-07 from 6 Oct 08:00".

### 11.8 Users, sites and assets for Tenant Admins (`/app/settings`)
Tenant Admin (own company) and Kasper Admin (any company, audited).

**Users tab:**
- Table: name, email, role, sites, status (Active, Invited, Deactivated). Actions: Invite, Edit (role, sites), Deactivate (signed out on next action), Reactivate, Resend invite.
- Invite needs name, email, role, and sites for a Site User.
- A new or invited user appears in the demo bar's View as list **immediately**.
- Messages: "Every company needs at least one Tenant Admin." · "This email already has an account."

**Sites tab:**
- Table: name, location, radius, asset count, users.
- Create or edit: name; location picked on a map (click, or search a place name from a small built-in list of Dubai/UAE areas); radius 100–2,000 m.
- Delete is allowed only with no assets, users, bookings or geofences ("Move the 3 assets at this site first.").

**Assets tab** (`asset.create`, `asset.edit`, `asset.retire`):
- **Add asset:** code, name, type, class, make, model, year, plate or serial, home site, tank size (optional), and "How it behaves in the demo" (`SimBehaviour`, prototype only).
  - Codes are unique across Kasper, case-insensitive: "This code is already in use."
  - The new asset starts as **No tracker**, Tier 1, and shows on the map at its home site as list-only until a tracker reports.
- **Request a tracker** on an asset with none: an optional note creates a `TrackerRequest` that Kasper sees in the console. The asset shows "Tracker requested 6 Oct".
- **Retire / Reinstate:**
  - Only with no active or upcoming booking ("EX-04 is on hire until 9 Oct. Retire it after the hire ends.").
  - Retired assets leave the map, list, KPIs and alerts. History and reports for past periods remain. They show in a "Retired" filter.
- Tenant Admins can't change adapters or trackers. Those are Kasper's, so the fields are read-only, with "Contact Kasper to change hardware".

### 11.9 Kasper console (`/console`)
Left nav shows only what the role can view: Tenants · Onboard a company · Assets · Trackers · CAN adapters · Bookings · Requests · Billing · Kasper team · Import · Audit log. Customers get "Page not found" on every `/console` route. Below 900 px wide the console shows "Open the console on a computer." Every create, change, retire, pair, fit, transfer and import writes an audit entry.

**Tenants:**
- Table: name, type, hardware mix ("T1 10 · T3 0"), assets, trackers, users, open requests, status.
- Admin actions:
  - **create** (name, type vendor/client/both, trade licence no. (optional), first Tenant Admin name + email, both required);
  - **edit**, **suspend / unsuspend** (suspended users get the sign-in message; their links stop working; bookings stay);
  - **close** (only with no active bookings; becomes read-only history).
- Tenant page tabs: Overview, Sites, Users, Assets, Bookings, Billing, Audit. The Sites, Users and Assets tabs are the same components as 11.8, scoped to that tenant. "Open dashboard as Kasper" is audited.
- Ops sees tenants read-only.

**Onboard a company** (Admin) — a 6-step wizard with a saved draft, so leaving and coming back keeps your place:
1. **Company** — name, type, licence no.
2. **Sites** — add one or more on the map.
3. **People** — first Tenant Admin (required), plus optional more admins and Site Users with their sites.
4. **Assets** — add rows one by one, or paste/upload CSV (11.9 Import). Pick each asset's home site and demo behaviour.
5. **Hardware** — for each asset, either:
   - pick a tracker from stock, or register new IMEIs inline;
   - optionally fit a CAN adapter from stock, or register a new one;
   - tick the CAN check (defaults from the adapter).
   - The tier shows live as you choose.
6. **Review** — a summary of everything. **Create company** creates it all in one step (all or nothing). The confirmation shows "View as <first admin>" and "Open in console".

**Assets** (Admin; Ops view + hardware only):
- Table across tenants: code, name, owner, home site, tier, adapter, tracker IMEI, status, active booking.
- Filters: tenant, tier, class, "No tracker", "Retired".
- **Create/edit** for any tenant (same form as 11.8 plus adapter and CAN check).
- **CAN check:** tick the params the vehicle supports, defaulted from the fitted adapter; date checked; notes. Changing it changes the asset's features everywhere at once.
- **Transfer owner** (Admin, `console.assets.transfer`): pick the new tenant and home site, effective now, reason required.
  - Blocked while a booking is active or upcoming.
  - Ends the old owner's ownership period, and drops the old owner's labels, geofence assignments and maintenance plans.
  - Revokes the asset's tracking links.
  - The new owner sees history only from the transfer time.
  - The old owner keeps **report-only** access to their ownership period, like a past rental. List this choice under Questions in the self-check.

**Trackers** (Admin, Ops):
- Table: IMEI, SIM, firmware, stock status (In stock / Paired / Faulty / Retired), paired asset, tenant, last reading, GSM, status. Filters by stock status and tenant; search by IMEI or SIM.
- **Register one:** IMEI and SIM, with checks:
  - IMEI: 15 digits with a valid Luhn check digit ("This IMEI isn't valid — check the last digit."), unique ("This IMEI is already registered.");
  - SIM ICCID: 19–20 digits starting `89` ("Enter the SIM number printed on the card (19–20 digits).");
  - firmware (defaults to `03.29.00.Rev.03`), ping interval, sleep mode.
- **Register many:** paste lines `IMEI,SIM` or upload CSV. A preview table shows ✓ or the error per row (bad Luhn, duplicate in file, already registered, bad SIM). **Import valid rows** adds only those; the summary reads "18 added · 2 skipped". The template CSV is downloadable.
- **Pair** an in-stock tracker to an asset with no tracker:
  - pick the asset by searching code/name across tenants;
  - the confirm panel shows the asset's owner and tier;
  - the asset becomes Unknown;
  - the simulator starts generating readings from the pairing time using the asset's behaviour, after a 2–5 minute first-fix delay;
  - "Send test reading" sends one immediately.
- **Move:** one action, with the confirm "Move tracker 352093… from LD-09 to PU-41? History before now stays with LD-09."
- **Unpair:** the tracker returns to In stock and the asset to No tracker.
- **Mark faulty** with a note (flags for support); **Retire** (only when unpaired).
- **Settings:** ping 30–300 s, sleep mode. **Pairing history** per tracker and per asset.
- **Requests:** open `TrackerRequest`s show here with "Pair a tracker" (jumps to Pair with the asset preselected) or "Decline" with a reason. Done or declined requests notify the requesting Tenant Admin in their bell.

**CAN adapters** (Admin, Ops):
- Table: serial, model, status, fitted asset, tenant, fitted at.
- **Register** one or many: serial unique, model LVCAN200 or ALL-CAN300.
- **Fit to asset:** the asset must have a tracker, and an LVCAN200 only fits light vehicles ("LVCAN200 is for light vehicles. Use ALL-CAN300 for trucks and machinery.").
  - Fitting sets the adapter, opens the CAN check with defaults, and changes the tier from the fitting time.
  - CAN readings are generated only after the fitting time. Earlier history stays Tier 1, and charts start at the fitting with a marker "CAN adapter fitted 6 Oct 10:15".
- **Remove:** the asset drops back to Tier 1 from that moment. Earlier CAN data stays visible for its period with its source label.
- **Mark faulty** with a note. Fitting history is dated, like pairing.

**Bookings** (Admin, Ops) — the console version of the booking simulator (same logic as 11.7):
- Table with filters (tenant, asset, status, dates).
- **New booking:**
  - asset (any active asset);
  - renter: a Kasper tenant, or "Outside hirer" with a name;
  - renter site (only that renter's sites; required for a tenant renter);
  - start and end; rate type and amount; destination (optional; picked on the map, used for ETA).
- **Checks:**
  - end after start;
  - renter ≠ owner ("A company can't rent its own asset.");
  - no overlap with another scheduled or active booking on the same asset ("EX-04 is already booked 3 – 9 Oct (BK-1001).");
  - not a retired asset.
- Booking refs continue from BK-1013.
- Extend, shorten, cancel, close job, end access early — each with the same toasts and effects as the simulator.

**Kasper team** (Admin): add, edit and deactivate Kasper Admin and Kasper Ops accounts. The last active Kasper Admin can't be removed ("Kasper needs at least one active admin."). New staff appear in View as.

**Import** (Admin; Ops for trackers and adapters):
- One page with four importers: Assets, Trackers, CAN adapters, Users.
- Each has a downloadable template, paste or upload, a per-row preview with errors, "Import valid rows", and a result summary.
- Asset rows name their tenant and site by name. An unknown name is an error, never auto-created.

**Audit log** (Admin only): filters (person, tenant, action, date), CSV export, read-only.

**Reset and save:** everything created here persists in `localStorage` until "Reset demo data". Demo bar → Tools adds **Import demo state (JSON)** next to Export, so a set-up company can be saved and loaded again.

### 11.10 Multiple sites per Site User
- A Site User can belong to one or more sites (`siteIds`). Visibility = their company's own assets at **any** of their sites, plus assets rented to **any** of their sites.
- The Site filter appears only when the user has more than one site. It lists only their sites. Map start view fits all their sites.
- Invite and Edit user (11.8) use a multi-select for sites. At least one is required for a Site User ("Pick at least one site.").
- Removing a site from a user takes effect on their next action. Their scheduled reports for assets they no longer see are skipped (11.13).
- The header and Features panel show "Sites: Business Bay, JVC Villas".

### 11.11 Labels (Phase 2)
Rules from Task 11:
- Labels belong to the tenant that created them.
- Tenant Admin (own company) and Kasper Admin create, rename, delete and apply them. Site Users see their company's labels on their company's assets but can't edit them.
- A renter never sees the owner's labels. Renter-side labels on rented assets are out of scope.
- Labels never appear on the tracking page.
- A label is plain text, ≤ 40 characters, unique per tenant (case-insensitive: "A label with this name already exists."). An asset can have ≤ 20 labels per tenant.

Where they appear:
- **Asset detail:** chips under the header. "+ Label" opens a combobox to pick an existing label or create one.
- **Asset list:** a Labels column, plus bulk select → "Add label" / "Remove label".
- **Filters:** a Label filter (multi-select, any-of) on the map and list.
- **Reports and schedules:** "Assets with label …" as a scope.
- **Users & sites:** a Labels tab to rename or delete. Deleting asks "Remove 'Project Alpha' from 3 assets?" on the page.

### 11.12 Geofences (Phase 2)
`/app/geofences` (all tiers; `geofence.events` needs only GPS):
- **List:** name, kind (Site / Job / Yard / Restricted), shape, assets covered ("All assets" or a list), alerts (enter, exit, after hours), events in the last 7 days.
- **Map editor:**
  - Draw a circle (click the centre, drag the radius; a radius field 50–5,000 m) or a polygon (3–30 points), using `@geoman-io/leaflet-geoman-free`.
  - Edit points, delete.
  - Name required; overlapping geofences allowed.
- **Site geofences** are created automatically from each site and are edited from the site, not deleted here.
- **Ownership:** a geofence belongs to the tenant that drew it. Events are computed only for assets that tenant can see, and only inside the readable window. Example: Palm's "Palm Crescent works" fence produces events for WL-06 only during Palm's rental. Emirates never sees Palm's fence or its events, and the reverse.
- **Map overlay:** a "Geofences" toggle on the map shows the user's fences (dashed outline, kind colour, name on hover).
- **Events:**
  - Enter/exit are derived from readings: two consecutive readings on the new side, judged by device time. A gap never creates an event; the next reading after a gap does, timestamped at that reading.
  - Alert types (Phase 2): "Entered Dubai Hills — no-go: school zone" · "Left Palm Crescent works at 19:10" · "Moved out of Al Quoz Yard after hours (23:40)".
  - Replayed readings create history events but never alerts (same rule as 11.4).
- **Geofence report:** time in and out per asset per fence, dwell time, number of visits; PDF/Excel. It appears in report types only when the user has at least one geofence.
- **Asset detail:** a "Geofences" line on Overview: "Inside: Al Quoz Yard" / "Outside all geofences". It shows only the viewer's own tenant's fences.

### 11.13 Report downloads and schedules
**Downloads** `/app/downloads` (Day one):
- Every report the user generates is listed: name, scope, period, format, generated at, "by schedule" or "by you", size.
- Actions: Download again (regenerated from the same parameters; the deterministic seed makes it identical) and Delete from list.
- Each user sees only their own runs. Kasper Admin sees everyone's runs in the console (audited).
- Download again re-checks permission **now**. If the user lost access (rental ended and the period is outside their windows, site removed, user deactivated), it shows "You no longer have access to this report's assets." and creates no file.
- Empty state: "Reports you generate appear here."

**Schedules** (Phase 2), from the report sheet ("Schedule this report") or the Downloads page:
- Fields: frequency (daily at a time, weekly on a day and time, monthly on the 1st), format, and "Deliver to: my email (simulated)".
- When the simulated clock passes `nextRunAt`, a run is created for the period just ended, checking permissions at that moment. Moving the clock forward a week creates 7 daily runs.
- If the user has lost access, the run is listed as "Skipped — you no longer have access to EX-04 (rental ended 10 Oct)" and the schedule pauses itself after 2 skips.
- A run creates a notification in a simulated "Email outbox" panel, so the demo can show delivery without sending anything.
- Users can pause, resume, edit and delete their own schedules. Renters' schedules are clipped to their windows like any renter report.

### 11.14 ETA on the tracking page (Phase 2)
- Available when the link's booking has a `destination` and the link was created with "Show arrival time" on. Owners can turn it off later from the link row.
- ETA, computed in `src/domain/eta.ts` and unit-tested:
  - distance = straight-line distance to the destination × road factor 1.3;
  - speed = average moving speed over the last 15 min, clamped to 25–80 km/h, defaulting to 40 km/h;
  - ETA = now + distance ÷ speed, rounded to the minute.
- **Arrived:** a reading inside 200 m of the destination, shown as "Arrived 14:50". It stays arrived even if the asset leaves later.
- **Unavailable:** the last reading is older than S, or there is no reading after the link's start. Shown as "ETA unavailable — waiting for update".
- Shows the destination name only, never its coordinates. No route line, no history.
- The resolver adds only `eta: { destinationName, etaAt, state: 'en_route' | 'arrived' | 'unavailable' }`. The test asserts the exact key set with and without ETA.
- The owner's link row shows the same ETA, so the owner sees what the hirer sees.

### 11.15 Trip playback (Phase 2)
On Asset detail → Trips (a "Play" button per trip) and History ("Play this period"):
- **Player bar:**
  - play/pause, speed 1× / 10× / 60× / 300×, restart;
  - a time scrubber coloured by state (moving green, stationary with ignition on amber, off grey, no data hatched);
  - current time and speed readout.
- **Map:**
  - a marker rotated to the heading, moving along the track;
  - the trail drawn behind it;
  - the rest of the track faint.
- **Event pins on the scrubber and map:** trip start/stop, harsh events, over-speed, geofence enter/exit (the viewer's own fences only), refuel and fuel drop (Tier 2/3 only), power cut, towing. Clicking a pin jumps to it.
- **Side readout:**
  - Tier 1: speed, ignition, heading, GPS distance so far.
  - Tier 2/3: also the CAN values the asset supports (fuel %, RPM, coolant, load), each "Not measured" if unsupported.
- **Gaps:** playback jumps across a gap with a banner "No data 13:05 – 15:40". No line is drawn and nothing is interpolated.
- **Renters:** they can't scrub before their window start, and the scrubber starts at their window.
- Respects `prefers-reduced-motion`: starts paused and steps instead of animating.
- **Performance:** downsample to ≤ 5,000 points for the trail. The marker uses `requestAnimationFrame`, interpolating between consecutive readings only when both sides are inside the same trip and less than 2 min apart.

### 11.16 Monthly Utilisation Certificate — MUC (Phase 2, Tier 3 only)
`/app/certificates`, plus a "Certificates" tab on Tier 3 asset detail.

**Who and what:**
- Owner Tenant Admins and Kasper Admin issue certificates for **Tier 3 assets with `hours.ecu`**.
- Periods: a calendar month, or a booking period (rental certificate). Only past periods (end ≤ now).
- Renter Tenant Admins can view and download certificates whose period lies inside their rental windows. They can't issue, void or reissue.
- Tier 1/2 assets never offer a MUC. Sales view shows "Certificates need ALL-CAN300 (Tier 3) engine hours".

**Issue flow:**
1. Pick asset, then period (month or booking).
2. The preview shows:
   - opening and closing ECU engine hours (the first and last reading in the period);
   - billable hours = closing − opening;
   - a per-day table with engine hours, working and idling (from engine load), and gap minutes;
   - the gaps list.
3. A disclosure line reads: "Hours are measured by the engine computer (ECU). During the 2 data gaps listed, the ECU kept counting; those hours are included in the total but can't be assigned to specific days."
4. **Issue and seal** → builds the canonical `MucPayload`:
   - stable key order;
   - times in ISO UTC;
   - numbers fixed to 1 decimal.
5. It computes `sealSha256` over the canonical JSON with Web Crypto, stores both, and assigns number `MUC-<YYYY-MM>-<code>-<nn>`.
6. Cut-off checks:
   - a gap longer than 24 h in the period blocks issue ("This period has a 31-hour data gap. Certificates can't be issued until it's reviewed.");
   - Kasper Admin can override with a reason (audited).

**Document:**
- PDF with the Kasper wordmark, "Monthly Utilisation Certificate", number, asset, owner, renter (if any), period, opening and closing hours, billable hours, the daily table, the gaps list, the disclosure and the source "ECU (ALL-CAN300)".
- Seal block: the first 16 characters of the hash, the full hash in small mono, issued at and by.
- A QR code (`qrcode` library) to `/verify/<number>`.
- Footer: "Issued at …" and, if reissued, "Reissued on …".
- The seal covers the payload, not the PDF bytes, so a reissue (same payload) has the same seal.

**Verify page** `/verify/[number]`, public, no shell:
- Shows number, asset code, period, billable hours and whether the stored payload still matches its seal: "Valid — sealed 1 Oct 09:12", "Voided on 4 Oct — replaced by MUC-2026-09-WL-03-02", or "Not found".
- It shows nothing else. `noindex`.

**Void and reissue:**
- Void requires a reason (≥ 10 characters) and is audited. The certificate stays listed as Voided.
- Reissue creates `-02` with a new payload and seal. The old one points to the new.
- No edit action exists anywhere (architecture rule 12).

**Demo tamper tool** (demo bar → Tools): "Tamper with a stored certificate" changes one stored number. The verify page then says "Does not match its seal — contact Kasper." Reset restores it.

### 11.17 Billing and payments (Phase 2)
`/app/billing`, tabs shown by capability:

**Rental invoices (owner side — "Issued"):**
- Table: number, customer, asset, booking, period, basis, total AED, status, due date. Filters by status and customer.
- **Create invoice from a booking:**
  - **Hourly + Tier 3:** quantity = billable hours from the booking's MUC, or "Issue the certificate first" with a button. A minimum of N h/day applies per day on hire, shown as a separate line "Minimum hours top-up".
  - **Hourly + Tier 1/2:** quantity = ignition hours, labelled "Estimated — not billing-grade". A confirm checkbox is required: "Customer has agreed to estimated hours."
  - **Daily:** days on hire, counting each started day.
  - VAT 5%. Due date is +14 days by default.
  - The invoice links to its MUC when there is one.
- **Record payment** (`billing.recordPayment`): amount, date, method, reference. Status becomes Part-paid or Paid. A payment over the balance is refused ("This is more than the AED 4,200 still owed.").
- Void an invoice (reason, audited). Download PDF/Excel.

**Rental invoices (customer side — "Received"):**
- The renter's Tenant Admin sees invoices addressed to their company, with the linked MUC for checking hours.
- **Pay (simulated):** a confirm panel "Pay AED 18,375.00 to Emirates Earthmovers? This is a demo; no money moves." There are no card fields. It records a `simulated_online` payment, visible to both sides.

**GPS subscription:**
- Each Tenant Admin sees Kasper's monthly statements for their company: a line per tracker by tier, total, status. Download.
- The customer can "Pay (simulated)".

**Outside hirers:** invoices to customers without an account are issuer-only, and payments are recorded by the owner.

**Overdue:** status becomes Overdue when now > due date and the invoice is unpaid or part-paid. The bell shows "Invoice INV-EE-0415 is overdue (6 days)" to the issuer (Phase 2 alert type `invoice_overdue`).

**Reports:**
- Billing summary per period: issued, received, paid, outstanding, by customer.
- Aged receivables: 0–30 / 31–60 / 61–90 / 90+ days.
- Both PDF/Excel, Tenant Admin only.

**Console → Billing** (Kasper Admin): every tenant's GPS statements and all rental invoices (read-only, audited when opened). Actions: generate last month's statements, record payments on statements, mark a statement void. Ops can't see billing.

### 11.18 Maintenance scheduling (Later)
`/app/maintenance`, plus a "Maintenance" tab on asset detail. Owners and Kasper only; Site Users of the owner company view only; renters never.
- **Board:** Overdue / Due soon / Ok columns, or a table. Each card shows asset, plan, "Due at 8,500 h · ECU — 80 h left" / "Due in 300 km · GPS distance" / "Due 17 Oct (12 days)".
- **Plan form:**
  - basis by hardware: engine hours (ECU when `hours.ecu`; otherwise "Estimated (ignition hours)", with a note "Estimated hours drift; check the hour meter at each service"), km (CAN odometer when supported, else GPS distance), or days;
  - interval, last done at (value + date), due-soon threshold.
- **Log service:** date, meter value (prefilled from the current reading, editable, with the source label), notes, cost AED, linked plan. This resets the plan.
- **Fault codes** (Tier 3 `maintenance.faults`): an active fault code shows "Create service task", which makes a one-off task "SPN 110 FMI 0 — Engine coolant temperature high" on the board.
- **Alerts** (Later): "Maintenance due soon: EX-04 500 h service (80 h left)", "Maintenance overdue: BD-02".
- **Report:** service history and upcoming services, PDF/Excel.
- **Rentals:** a maintenance plan stays with the owner during a rental. The owner sees "On hire to Gulf Lift until 9 Oct" on the card, so they can plan around it.

### 11.19 Cost & ROI (Later; the BRD marks this screen "under product review", so show a small "Draft" tag)
`/app/cost`, Tenant Admin (own assets) and Kasper Admin only.
- **Fleet view:** period picker (last month default). Per asset:
  - revenue (rental invoices in the period);
  - fuel cost: ECU fuel used × diesel price, or "Estimated" from class average L/h × ignition hours;
  - idle cost: Tier 3 idling hours × fuel rate × price; Tier 1/2 "Not measured";
  - maintenance cost (service records);
  - fixed costs (finance + insurance, pro-rated);
  - operator cost (ignition hours × rate);
  - margin and utilisation % (engine/ignition hours ÷ available shift hours).
  - Sortable. Totals row.
- **Asset view:**
  - a 6-month bar chart of revenue vs cost;
  - ROI to date = (cumulative revenue − cumulative cost) ÷ purchase value;
  - payback estimate in months at the current rate, or "Not enough data".
- **Labels:** every cost line shows its basis chip (ECU / Estimated / From invoices / From service log / Dummy rate). Lines with no basis show "Not measured", never 0.
- **Inputs** (owner): edit the cost profile per asset, and the diesel price (default AED 3.05/L, dummy) in company settings.
- **Export** PDF/Excel. Renters, Site Users and Ops never see this page.

---

## 12. Status rules and thresholds (`src/config/thresholds.ts`)

Placeholders until Task 13: `STALE_AFTER_MIN = 10`, `OFFLINE_AFTER_MIN = 30`, `IDLE_SPEED_KMH = 3`, `WORKING_LOAD_PCT = 25`, `FUEL_DROP_PCT = 10` (drop within 15 min with ignition off), `LOW_BATTERY_V = 3.6`, `OVERSPEED_KMH = 90` (trucks), `GEOFENCE_CONFIRM_READINGS = 2`, `ETA_ROAD_FACTOR = 1.3`, `ETA_ARRIVED_M = 200`, `MUC_MAX_GAP_H = 24`, `MUC_GAP_RULE = 'delta_disclosed'` (OPEN-03: ECU delta billable, gaps disclosed; Finance to confirm), `MAINT_DUE_SOON_PCT = 10`, `MAINT_DUE_SOON_DAYS = 14`, `INVOICE_DUE_DAYS = 14`, `VAT_PCT = 5`.

`src/config/pricing.ts` (all dummy, all shown with a "Dummy rates" note): GPS subscription per tracker-month by tier (75 / 110 / 165 AED), diesel AED 3.05/L, class average fuel L/h for estimates (excavator 16, loader 14, dozer 22, grader 15, crane 9, telehandler 7, generator 30, truck 12 equivalent, pickup 4).

| Status | Rule |
| --- | --- |
| No tracker | No current pairing |
| Unknown | Paired, no reading ever |
| Offline | Last reading older than N |
| Stale | Last reading older than S, not older than N |
| Idle | Recent, ignition on, speed < 3 km/h |
| Live | Recent, otherwise |

---

## 13. Scenarios (demo bar shortcuts and the walkthrough you must make work)

| # | View as | Do | Expect |
| --- | --- | --- | --- |
| S1 | Omar (Al Noor, no CAN) | Open map, list, FB-12, reports | Only Tier 1 features anywhere; no fuel/engine columns, tiles, reports or alert types; ignition hours labelled Estimated |
| S2 | Khalid (Emirates, Tier 3) | Open EX-04 → Engine & fuel | ECU engine hours, RPM, load, fuel chart; AdBlue "Not measured"; rental strip "Rented to Marina…" |
| S3 | Khalid | Open GR-01 | Fuel used shown; fuel level and coolant "Not measured" |
| S4 | Lina (Marina) | Map | Sees PU-51, PU-52, VN-01 (own, Tier 2) + EX-04, CR-02 (Rented); not EX-07 yet, not CR-05 |
| S5 | Lina | EX-04 → History 7 d | Nothing before the rental start; banner says so; only Run report button |
| S6 | Lina | Clock → Jump to "1 min before EX-07 rental starts", then "EX-07 rental starts" | Hidden at 07:59, appears at 08:00, Rented |
| S7 | Ahmed (Dubai Hills) | Map | EX-04 + PU-51 only; no site filter |
| S8 | Anil (JVC) | Reports | VN-01 + "Past rental: TP-21" with range clipped |
| S9 | Deepa (Dubai South + Palm Crescent) | Alerts | GN-01 fuel drop visible, no Acknowledge; TH-01 and WL-06 visible; Site filter shows her two sites |
| S10 | Fatima (Palm) | Map | WL-06, TH-01, GN-01; EX-11 gone (access ended early) |
| S11 | Priya (Gulf Lift) | Map → BD-02 | Rented-in BD-02 with fault code; her own mixed fleet; FL-09 Unknown; Tier filter shown |
| S12 | Priya | Open `/app/assets/<EX-04 id>` | "Asset not found" |
| S13 | Omar | FB-12 → Share link → open link in private window → Revoke | Link works, then "no longer active" within 30 s |
| S14 | Outside hirer | Open FB-12 link | One live dot, no other data |
| S15 | Khalid | EX-04 → End access now | Marina loses EX-04 on refresh; audit has reason; nightly check doesn't restore |
| S16 | Booking simulator | Extend BK-1001 2 d; cancel BK-1002 | Lina keeps EX-04; loses CR-02; CR-02's links revoked |
| S17 | Ravi (Ops) | Console → pair a spare tracker to LD-09 → Send test reading | LD-09 Unknown → Live; audit entry; no Users & sites, no Audit log |
| S18 | Sara (Admin) | Console → create tenant + asset with ALL-CAN300 | New tenant's admin can sign in; tier shows T3 |
| S19 | Lina | Settings → invite user → View as them | New user sees only their site |
| S20 | Any | Phase → Day one | All Phase 2 tabs, tiles, columns, reports and alert types disappear |
| S21 | Omar | Sales view on | Locked cards "Needs ALL-CAN300 (Tier 3)" appear on FB-12; off → gone |
| S22 | Karim | View as | Deactivated message |
| S23 | John (Business Bay + JVC Villas) | Map, Site filter, Reports | Site filter lists his two sites; sees CR-02, PU-52, VN-01; TP-21 as "Past rental"; nothing from Dubai Hills |
| S24 | Khalid | Label EX-04 and WL-03 "Project Alpha" → filter by it → View as Lina | Filter shows 3 assets; Lina's EX-04 shows no labels and her filter has no Emirates labels |
| S25 | Fatima | Geofences → see "Palm Crescent works" → Jump to yesterday 19:00 → play WL-06 | Exit at 19:10 and re-entry at 19:55 on the scrubber; closed alert; View as Khalid: no Palm geofence anywhere |
| S26 | Khalid | Draw a 300 m circle "Hatta Quarry — gate" with enter alert → Jump +1 d | BH-05 enter event about 10:15 and an alert in the bell; events visible in the geofence report |
| S27 | Omar | WT-07 → Trips → yesterday's trip → Play at 60× | Over-speed pin at 104 km/h; gap banner where data is missing; no fuel/RPM in readout |
| S28 | Lina | EX-04 → History → Play this period | Scrubber starts at rental start; RPM/load in readout; AdBlue "Not measured" |
| S29 | Outside hirer | Open FB-12 link | "Arriving about … (in … min)"; Jump +90 min → "Arrived"; no route, no history |
| S30 | Lina | Reports → schedule daily Location history for EX-04 → Jump to "EX-04 rental ends" + 2 d | Runs appear in Downloads until the end, then "Skipped — you no longer have access…"; schedule paused after 2 skips |
| S31 | Khalid | Certificates → issue last month for BD-02 → Reissue | Sealed; reissue has the same seal; verify page "Valid" |
| S32 | Khalid | Tools → Tamper with a stored certificate → open verify link | "Does not match its seal — contact Kasper." |
| S33 | Omar | Look for Certificates | No Certificates nav or tab (Tier 1 only); Sales view shows a locked card |
| S34 | Fatima | Billing → Received → INV-EE-0412 → open MUC → Pay (simulated) | Hours on invoice equal MUC billable hours (+ minimum top-up line); Paid; View as Khalid shows Paid |
| S35 | Omar | Billing → INV-AN-0098 (TP-21) → Record payment AED 500 | Basis "Days on hire"; Part-paid; over-payment refused |
| S36 | Sara | Console → Billing | GPS statements per tenant by tier; Gulf Lift unpaid; Ravi (Ops) has no Billing |
| S37 | Khalid | Maintenance | EX-04 Due soon (ECU), BD-02 Overdue while on hire to Gulf Lift; Log service on BD-02 → Ok; View as Priya: no maintenance on BD-02 |
| S38 | Omar | Maintenance | FB-14 by GPS distance, TP-22 by "Estimated" ignition hours; no fault-code tasks |
| S39 | Khalid | Cost & ROI → last month | EX-04 fuel cost labelled ECU; CP-03 fuel cost "Estimated"; idle cost "Not measured" for CP-03 |
| S40 | Mark (Gulf Lift site user) | Look for Billing, Cost, Certificates, Maintenance edit | Maintenance view-only for own assets; no Billing, Cost or Certificates |
| S42 | Sara | Onboard a company: "Sharjah Plant Hire" (vendor), 2 sites, admin "Noura Khalid", 3 assets (paste CSV), register 3 new IMEIs (one with a bad check digit → error, fix it), fit 1 ALL-CAN300 from stock → Create → View as Noura | Noura sees her 3 assets (Unknown → Live within minutes of simulated time); the CAN-fitted one is Tier 3 with Engine & fuel; others show no CAN features |
| S43 | Ravi | Trackers → Register many → paste 10 lines (2 duplicates, 1 bad SIM) | Preview shows 3 errors; "7 added · 3 skipped"; new trackers In stock |
| S44 | Ravi | Requests → Priya's MW-01 request → Pair a tracker → +10 min | MW-01 Unknown → Live; Priya's bell: "Tracker fitted on MW-01" |
| S45 | Ravi | CAN adapters → fit LVCAN200 to EX-11 | Refused: "LVCAN200 is for light vehicles…"; fit to PU-31 works and PU-31 becomes Tier 2 with a "CAN adapter fitted" marker in its charts; Omar now sees fuel columns (Al Noor no longer has zero CAN) |
| S46 | Ravi | Bookings → New booking: WL-03 to Palm, Palm Crescent, tomorrow → +3 d; then try EX-04 3–5 days from now | WL-03 appears for Fatima and Rashid from the start; the EX-04 booking is refused for overlapping BK-1001 |
| S47 | Sara | Transfer CP-03 from Emirates to Gulf Lift | Khalid loses CP-03 from the map but can report on it up to the transfer; Priya sees it from the transfer only; Emirates' labels gone |
| S48 | Khalid | Settings → Assets → Add asset "EX-15", then Retire EX-07 | EX-15 No tracker with "Request a tracker"; EX-07 refused (booking tomorrow) |
| S49 | Lina | Settings → Sites → add "Al Furjan Villas" → invite a Site User there → View as them | Empty map with "No assets yet"; after Ravi books an asset to that site, it appears |
| S50 | Sara | Kasper team → add an Ops user → View as them; try to remove the last Kasper Admin | New Ops user works in the console; removal refused |
| S41 | Any | Phase → Phase 2, then Day one | Phase 2: Maintenance and Cost & ROI disappear. Day one: also geofences, labels, playback, ETA, MUC, billing, schedules (Downloads stays) |

---

## 14. Tests

- **Unit (Vitest):** status rules incl. exact S/N boundaries; attribution across the LD-09→PU-41 move; feature registry for every asset in the seed (expected visible feature set per asset, as a snapshot test); access functions for every scenario S1–S41 at API level; trip detection; fuel-drop detection; renter window clipping; forbidden == missing; public resolver return shape (exactly the 4 keys, or 5 with `eta`); token uniqueness (200 tokens, ≥22 chars); every booking event's effect on the grant window (create, extend, shorten, cancel, close, end early, nightly check); renter-site narrowing; outside-hire bookings create no grant; link expiry defaults and every way a link ends; replay batch opens/closes no alert; visible assets and features per user equal `expected.ts`; multi-site visibility; label visibility across owner/renter; geofence enter/exit with 2-reading confirmation, gaps and windows; ETA maths and states; resolver key set with and without ETA; canonical payload stability (same data → same hash, key order irrelevant), void/reissue, tamper detection; invoice maths (min hours top-up, days on hire counting, VAT, part-payments, over-payment refusal, overdue); schedule runs and skips as the clock moves; maintenance due states per basis; cost lines' basis labels and "Not measured" for Tier 1; IMEI Luhn validation (all seeded IMEIs valid); bulk import preview errors (duplicates within file and against existing, bad SIM); pairing starts readings after first fix; adapter fitting changes tier from the fitting time only; LVCAN200 class rule; booking overlap and renter ≠ owner; asset transfer ownership windows (new owner from transfer, old owner report-only); retire blocked by active/upcoming booking; onboarding wizard creates all-or-nothing; last Kasper Admin / last Tenant Admin rules; created users appear in View as.
- **Architecture tests:** no component imports `src/server/store|seed|telemetry`; no `role ===` outside allowed files; no `Date.now()` outside `clock.ts`; grep for "device" and "Dozr" in `src/` is empty.
- **End-to-end (Playwright):** one spec per scenario group (S1–S3, S4–S8, S9–S12, S13–S16, S17–S19, S20–S22, S23–S30, S31–S36, S37–S41, S42–S50).
- Coverage of `src/server` and `src/domain` ≥ 85% lines.

---

## 15. Build phases and acceptance checks

### P1 · Foundation
Scaffold, scripts (`dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`), Tailwind tokens, fonts, UI kit (`Button`, `Badge`, `StatusBadge`, `TierChip`, `SourceLabel`, `Skeleton`, `EmptyState`, `ErrorState`, `Panel`, `Tabs`, `Table`, `Sheet`, `Toast`, `InlineConfirm`), route placeholders for all surfaces, demo bar shell (no logic), `/dev/ui` showing every component and status.
**Checks:** all routes load · `/dev/ui` shows every component · lint/typecheck/test pass · 390 px no overflow · no "device"/"Dozr".

### P2 · Domain, seed, clock and telemetry
Types, PRNG, seed (sections 8.1–8.8), clock with anchor + offset, telemetry simulator (section 9), feature registry (section 6), status rules, `expected.ts` fixture (8.9), `/dev/seed` (all tables with computed status and tier, clock controls).
**Checks:** 5 tenants, 10 sites, 16 users, 36 assets, 37 trackers, 22 CAN adapters (17 fitted · 4 in stock · 1 faulty), 1 tracker request, 15 bookings (incl. last month's 3), 4 links · readings exist from the 1st of last month · every asset's status at anchor matches 8.2 · every asset's visible features match a snapshot · GN-01 drop, BD-02 fault, TP-23 power cut present in readings · deterministic across reloads · +1 h turns WT-08 Offline.

### P3 · Access layer and API
Session, capabilities, capability reasons, grants (section 5), access (owned, grants, visibility, relationship, readable windows, `can`), API for reads, audit for cross-tenant views, `/dev/access` explorer (pick user + time → capabilities, visible assets with relationship and window).
**Checks:** every user's visible assets match `expected.ts` · grant window tests · API-level tests for S1, S4–S12 visibility, S12 forbidden == missing, Ravi/Sara capability differences, renter windows, past rentals for reports, architecture tests.

### P4 · Demo bar, sign-in and app shell
View as dropdown (all users + outside hirer + signed out, badges, `Ctrl+K`), Features panel, clock controls with Jump to presets, phase, Show hidden and Sales view switches, Tools menu, scenarios menu (Start only; guided steps come in P10), reset; sign-in page and messages; top bar; user menu; console shell and guard.
**Checks:** every user selectable; Features panel for Omar shows no CAN features and for Lina shows ✕ on Edit/Share/End access with reasons; deactivated/invited/suspended behave as specified; customers get "Page not found" on `/console`; switching user never shows the previous user's data.

### P5 · Map and asset list
Section 11.2 in full, including tier-aware columns, KPI tiles and filters.
**Checks:** S1, S4, S6, S7, S10, S11 map/list parts · Tier filter only for mixed fleets · Omar sees no CAN columns · Back keeps filters · phone tabs.

### P6 · Asset detail
Section 11.3 in full, all tabs, tier display rules, "Not measured", source labels, edit asset.
**Checks:** S2, S3, S5, S11 detail parts, S21 · Tier 1 assets have no Engine & fuel tab · gaps drawn as gaps · renter history clipped · edit refused by API for non-owners.

### P7 · Alerts
All alert types (phase-gated), bell, `/app/alerts`, asset Alerts tab, acknowledge rules, no replay alerts.
**Checks:** S9 · alert types per user match their fleet's hardware · Day one shows offline only · acknowledgement recorded with name and time.

### P8 · Reports
Section 11.5 in full, PDF and Excel.
**Checks:** S8 · Omar's report picker has only Trip & Mileage and Location history (Day one) or + Operating hours, Utilisation, Driving events (Phase 2+) — never Fuel · Khalid's includes Fuel · totals equal between PDF and Excel · clipped header for renters.

### P9 · Rentals, tracking links, public page
Sections 11.6 and 11.7, booking simulator, nightly check.
**Checks:** S13–S16 · token rules · public resolver shape test · ended-early access not restored by nightly check.

### P10 · Admin: users, sites, assets, Kasper console, onboarding, hardware stock, bookings, import
Sections 11.8, 11.9 in full (wizard, trackers with bulk register, CAN adapters, requests, console bookings, transfer, Kasper team, import, JSON import/export); simulator support for created assets; guided steps for scenarios S1–S22 and S42–S50 (S23–S41 get theirs in the phase that builds them).
**Checks:** S17–S22, S42–S50 · everything created survives a reload and disappears on Reset · created users, tenants and assets behave exactly like seeded ones in every earlier scenario check · every console action has an audit entry · Ops can't reach Admin-only actions (UI hidden + API refuses).

### P11 · Multiple sites, labels, geofences
Sections 11.10–11.12, geofence alerts and report, map overlay.
**Checks:** S9, S23–S26 · multi-site visibility tests · renter never sees owner labels or geofences (API-level) · gaps never create geofence events · Day one hides labels and geofences.

### P12 · Trip playback, ETA, downloads and schedules
Sections 11.13–11.15.
**Checks:** S27–S30 · playback never draws across gaps · renter scrubber clipped · resolver key-set test with ETA · Download again re-checks permission · reduced-motion respected.

### P13 · MUC, billing and payments, console billing
Sections 11.16, 11.17, `/verify/[number]`, tamper tool.
**Checks:** S31–S36 · seal stable across reissue and reload · no edit path for a sealed MUC (API refuses) · Tier 1/2 never offered a MUC · invoice totals equal between screen, PDF and Excel · renters see only invoices addressed to them · Ops has no billing.

### P14 · Maintenance, cost & ROI, final pass
Sections 11.18, 11.19; Arabic (`ar.json`, RTL, Latin digits for codes/numbers/times, file marked "Draft — needs native review"; console stays English); phone pass; consistency sweep; Playwright suite for S1–S50; `docs/demo-script.md` (20-minute walkthrough using the scenarios); `docs/test-matrix.md` (scenario → test).
**Checks:** S37–S41 · every scenario runs start to finish from the Scenarios menu · Arabic mirrors every customer screen and the public page · every cost and maintenance figure has a basis label · Tier 1 shows "Estimated"/"Not measured", never 0 · all unit + E2E pass · coverage ≥ 85% · no sideways scroll at 390 px on every new page.

---

## 16. Self-check template (`reviews/P<n>-self-check.md`)

```
# P<n> self-check — <phase name>
Date · Agent

## Commands
| npm test | npm run typecheck | npm run lint | npm run test:e2e (P10 onwards) |

## Acceptance checks
| # | Check | Pass/Fail | How verified |

## Screenshots
reviews/screenshots/P<n>/ — list each file and what it shows

## Files added / changed

## Deviations from BUILD_PROMPT.md (and why)

## Libraries added (and why)

## Questions for the reviewer

## Known gaps
```

---

## 17. Out of scope

Real trackers or backend; real email/WhatsApp/SMS (schedules and alerts go to the simulated outbox); real payment processing, card entry or payment gateways (payments are recorded or simulated only); accounting-system export; route-based ETA (straight-line estimate only); renter-side labels on rented assets; editing Arabic copy beyond a first draft.
