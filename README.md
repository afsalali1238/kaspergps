# Kasper GPS

Equipment tracking & rental management platform for construction and logistics fleets.

## What it is

Kasper GPS gives equipment owners and rental companies full visibility over their fleet — from a live map of every tracker to sealed Monthly Utilisation Certificates (MUCs) for billing. It covers the full lifecycle: asset registration, tracker pairing, telemetry (GNSS + CAN bus), alerts, reports, cost & ROI, geofences, labels, and billing.

The prototype demonstrates the full surface area across three roles (Kasper Admin, Tenant Admin, Site User) and three delivery phases (Day one, Phase 2, Later).

## Architecture rules

1. **Access through `src/server/access.ts`** — every permission check goes through here. UI and API call `hasCapability(session, 'cap.name')`.
2. **Capabilities in `src/server/capabilities.ts`** — the single source of truth for role → capability mapping. No `role ===` checks outside this file.
3. **Seed data in `src/server/seed/data.ts`** — all demo data lives here. Pages read from `seed.*`. No hardcoded arrays in pages.
4. **Public link resolver — `src/server/links.ts`** — returns only the allowed public shape (no index, no referrer). Architecture rule 8.
5. **MUC operations — `src/server/muc.ts`** — all MUC lookups and mutations go through here. Architecture rule 7.
6. **Time in Dubai** — all timestamps use `src/lib/clock.ts` with `Asia/Dubai` timezone.

## Phases

| Phase | Features |
|-------|---------|
| **Day one** | Map + asset list, asset detail (overview, history, settings), alerts (view + acknowledge), reports (Trip & Mileage, Location history — Excel), tracking link, sign-in |
| **Phase 2** | CAN tiles (RPM, engine hours, fuel), alerts (all types), reports (all 6 types + PDF), geofences (map overlay, events), labels (customer + console), cost & ROI, maintenance, MUC certificates, schedules |
| **Later** | Advanced cost analytics (fuel cost, idle cost), maintenance by fault codes, scheduled report generation |

Switch phases in the demo bar (or Settings page) to see what's available in each phase.

## Running the project

```bash
npm install
npm run dev       # Next.js dev server at http://localhost:3000
npm run build     # Production build
npm run start     # Production server
npm run test      # Vitest unit tests
npm run lint      # ESLint
npm run typecheck # TypeScript check
npm run test:e2e  # Playwright e2e tests
```

## Demo bar

The demo bar (built into `AppShell`) exposes three controls:

- **View as** — switch between Kasper Admin, Tenant Admin, and Site User roles. Affects asset visibility, available actions, and redirect target after sign-in.
- **Phase** — switch between Day one, Phase 2, and Later. Gates Phase 2 and Later features.
- **Clock offset** — jump the demo clock forward or backward. Affects ETA calculations, alert timing, report date defaults, and next-run calculations on the schedules page.

## Seed data

All demo data is in `src/server/seed/data.ts`. Key entities:

- **Tenants:** Emirates Earthmovers, Al Noor Contracting, Gulf Lift, Dubai Marina, Palm Contracting
- **Users:** Sara Haddad (Kasper Admin), Khalid Rahman (Emirates), Omar Saleh (Al Noor), Priya Nair (Gulf Lift), Lina Aziz (Marina), Fatima Noor (Palm)
- **Assets:** 30+ assets across plant, truck, lifting, power, light vehicle classes
- **Trackers:** in-stock, paired, faulty, retired
- **Bookings:** active, scheduled, closed, cancelled rentals
- **Maintenance plans & service records:** for Emirates and Al Noor
- **Invoices & payments:** rental and GPS subscription
- **Geofences:** 5 geofences (circles and polygons) across multiple tenants
- **MUC certificates:** sealed certificates for EX-04, CR-02, and others

## Test coverage

- **Unit tests:** `src/server/links.test.ts` (4/4 pass), `src/domain/features.test.ts`, `src/server/access.test.ts`, `src/server/capabilities.test.ts`, `src/server/seed/data.test.ts`
- **E2e tests:** `tests/e2e/` — Playwright suite covering sign-in, customer map, asset detail, reports (Excel + PDF), cost, maintenance, geofences map overlay, console requests, downloads
- **Test matrix:** `tests/TEST_MATRIX.md` — full coverage reference

## Project structure

```
app/
  app/                  # Customer-facing pages (/app/*)
    page.tsx            # Fleet / map
    alerts/             # Alerts
    assets/[id]/        # Asset detail
    billing/            # Billing (invoices, payments)
    certificates/       # MUC certificates list
    cost/               # Cost & ROI
    downloads/          # Download history
    geofences/          # Geofences + map overlay
    labels/             # Customer labels
    maintenance/        # Service plans + history
    reports/            # Reports (Excel + PDF)
    schedules/          # Recurring report schedules
    settings/           # Demo controls
  console/              # Kasper console (/console/*)
    assets/             # Asset management
    audit/              # Audit log + CSV export
    bookings/           # Booking management
    adapters/           # CAN adapter inventory
    geofences/          # Geofence CRUD
    import/             # Import tools
    labels/             # Label management
    onboarding/         # Onboarding wizard
    requests/           # Tracker requests
    team/               # Staff management
    tenant/[id]/        # Tenant detail
    tenants/            # Tenant list
    trackers/           # Tracker inventory
    users/              # User management
  sign-in/              # Sign-in page
  verify/[number]/      # Public MUC verification
  t/[token]/           # Public tracking link
  dev/                  # Demo utility pages
src/
  server/
    access.ts           # Permission checks
    api.ts              # Sign-in + asset reads
    capabilities.ts     # Role → capability map
    muc.ts              # MUC operations
    links.ts            # Public tracking link resolver
    telemetry/simulator.ts  # Fake telemetry readings
    seed/data.ts        # All seed data
  domain/
    eta.ts              # ETA calculation
    features.ts         # Feature flags + phase gating
    types.ts            # Domain types
  components/
    ui/                 # Button, Badge, Tabs, Toast, etc.
    layout/             # AppShell, DemoBar
    demo/               # Demo bar components
  config/               # Pricing, thresholds
  lib/
    clock.ts            # Dubai-time clock with offset
```

## Key implementation notes

- **Reports:** Excel via `xlsx` (SheetJS), PDF via `jspdf` + `jspdf-autotable`. Both in `app/app/reports/page.tsx` and `app/app/downloads/page.tsx`.
- **Geofences map:** `react-leaflet` (MapContainer, TileLayer, Circle, Polygon, Tooltip) + `leaflet`. Styled with kind-colored fills.
- **MUC seal:** deterministic hash function in `src/server/muc.ts` (`sealMuc`). In production this would use SHA-256 via Web Crypto.
- **Tracking link:** `resolveTrackingLink(token)` in `src/server/links.ts` — returns `{ assetName, lat, lng, at, eta? }` or `null` for expired/revoked/cancelled links.
- **ETA:** `calcEta` + `averageMovingSpeed` in `src/domain/eta.ts`.
