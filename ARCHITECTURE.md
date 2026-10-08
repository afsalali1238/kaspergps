# Kasper GPS — Architecture

> **Audience:** developers working on `arena/53555479-kaspergps`
> **Last updated:** 2026-10-08
> **Branch:** `arena/53555479-kaspergps` → `1907d86`

---

## 1. System overview

Kasper GPS is a Next.js 14 (App Router) prototype for equipment tracking and rental management. It demonstrates the full surface area across three roles (Kasper Admin, Tenant Admin, Site User) and three delivery phases (Day one, Phase 2, Later).

**Tech stack:**
- **Framework:** Next.js 14 (App Router, client + server components)
- **State:** Zustand (`src/store/index.ts`) — session, demo switches, phase
- **Styling:** Tailwind CSS (utility classes throughout)
- **Maps:** Leaflet (via React Leaflet) for fleet and geofence maps
- **Exports:** `xlsx` (XLSX) for Excel, `jspdf` + `jspdf-autotable` for PDF
- **Testing:** Playwright (e2e), Vitest (unit)
- **Time:** All timestamps in `Asia/Dubai` via `src/lib/clock.ts`

**Key design principles:**
1. All data is seed-based — no real backend, no persistence. See `src/server/seed/data.ts`.
2. All permission checks go through `src/server/access.ts` — never `role ===` outside that file.
3. All capabilities are defined in `src/server/capabilities.ts` — the single source of truth for role → capability mapping.
4. Public links go through `src/server/links.ts` — returns only the allowed public shape.
5. MUC operations go through `src/server/muc.ts`.
6. All times use Dubai timezone — never UTC in the UI.

---

## 2. Phase model

| Phase | Features available | Gated by |
|-------|-------------------|----------|
| **Day one** | Map + asset list, asset detail (overview, history, settings), alerts (view + acknowledge), reports (Trip & Mileage, Location history — Excel), tracking link, sign-in, customer pages | `demoSwitches.phase === 'day_one'` |
| **Phase 2** | CAN tiles (RPM, engine hours, fuel), all 6 report types + PDF, geofences (map overlay, events), labels (customer + console), cost & ROI, maintenance, MUC certificates, schedules, console pages | `demoSwitches.phase !== 'day_one'` |
| **Later** | Advanced cost analytics (fuel cost, idle cost), maintenance by fault codes, scheduled report generation | Not yet implemented |

**Phase gating pattern** (in every page):
```tsx
const phase = store.getState().demoSwitches.phase;
if (phase === 'day_one') {
  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold text-ink mb-4">Page title</h1>
      <EmptyState title="Not available" description="Available in Phase 2." />
    </div>
  );
}
```

The phase is toggled via the Demo Bar (top of page) or Settings page.

---

## 3. Role model

| Role | Session flag | Capabilities | Pages accessible |
|------|-------------|-------------|-----------------|
| **Kasper Admin** | `session.isKasper === true` | All capabilities | Console + app pages |
| **Tenant Admin** | `session.isKasper === false`, `session.tenantId` set | Tenant-scoped capabilities | App pages only (their own tenant's data) |
| **Site User** | `session.isKasper === false`, `session.tenantId` set, `session.siteUser === true` | Site-scoped capabilities | App pages — filtered to their sites |

**Sign-in routing:**
- `kasper@example.com` (or any `@kasper.ae` email) → `/console`
- All other valid emails → `/app`

**Asset visibility:** Tenant users see only assets where `isAssetVisible(session, assetId)` returns true. Kasper sees all assets. Use the `isAssetVisible` helper from `@/server/access` in any asset list or map.

---

## 4. Data model — seed data

All domain data lives in `src/server/seed/data.ts` as a single exported `seed` object. Pages read from `seed.*` — never hardcode domain arrays.

### Key seed types

| Type | File | Fields (key ones) |
|------|------|-------------------|
| `Tenant` | `seed/data.ts` | `id`, `name`, `type`, `sites` |
| `Site` | `seed/data.ts` | `id`, `name`, `lat`, `lng`, `radius`, `tenantId` |
| `Asset` | `seed/data.ts` | `id`, `code`, `name`, `type`, `class`, `canProfile` (adapter, tier), `ownerTenantId`, `sites` |
| `Tracker` | `seed/data.ts` | `id`, `imei`, `simIccid`, `stockStatus`, `assetId`, `firmware`, `pingIntervalSec` |
| `CanAdapter` | `seed/data.ts` | `id`, `serial`, `model`, `status`, `assetId`, `fittedAt` |
| `Booking` | `seed/data.ts` | `id`, `reference`, `assetId`, `start`, `end`, `status`, `rateType`, `rateAed` |
| `Invoice` | `seed/data.ts` | `id`, `number`, `kind`, `customerName`, `totalAed`, `status`, `issuedAt`, `dueAt` |
| `Geofence` | `seed/data.ts` | `id`, `name`, `shape`, `type`, `alertSettings`, `tenantId` |
| `Alert` | `seed/data.ts` | `id`, `assetId`, `type`, `severity`, `status`, `details`, `tenantId` |
| `Label` | `seed/data.ts` | `id`, `name`, `color`, `tenantId` |
| `MaintenancePlan` | `seed/data.ts` | `id`, `assetId`, `intervalHours`, `lastServiceHours`, `nextDueAt` |
| `AuditEntry` | `seed/data.ts` | `id`, `at`, `actorUserId`, `action`, `detail` |
| `TrackerRequest` | `seed/data.ts` | `id`, `tenantId`, `assetId`, `requestedBy`, `at`, `note`, `status`, `handledBy` |
| `User` | `seed/data.ts` | `id`, `name`, `email`, `role`, `tenantId` |

### Import pages

The console import page (`app/console/import/page.tsx`) supports CSV bulk import for:
- **Assets:** `code,name,type,class,make,model,year,plateOrSerial,tenantName,siteName,tankLitres,behaviour`
- **Trackers:** `imei,simIccid` (IMEI validated with Luhn algorithm)
- **CAN adapters:** `serial,adapterModel`
- **Users:** `name,email,role,tenantName,siteNames`

All importers validate rows, show a preview table with errors, and import only valid rows.

---

## 5. Store (Zustand)

**File:** `src/store/index.ts`

The store holds:
- `session` — current user session (tenantId, isKasper, siteUser, user name). Set on sign-in.
- `demoSwitches` — demo bar controls:
  - `phase` — `'day_one' | 'day_two' | 'later'`
  - `role` — current demo role
  - `clockOffset` — minutes to add/subtract from current time (for demo ETA/alert timing)
- `assets` — (optional) local asset state for pages that mutate

**Pattern for reading session:**
```tsx
const store = useStore;
const session = store.getState().session;
const phase = store.getState().demoSwitches.phase;
```

---

## 6. Access control

**File:** `src/server/access.ts`

```ts
export function hasCapability(session: Session, capability: string): boolean { ... }
export function isAssetVisible(session: Session, assetId: string): boolean { ... }
```

Pages call `hasCapability(session, 'cap.name')` for permission checks. The capability list is defined in `src/server/capabilities.ts`.

**Never** do `role === 'kasper'` or `tenantId ===` checks directly in pages. Always go through `hasCapability` or `isAssetVisible`.

---

## 7. Link resolver

**File:** `src/server/links.ts`

```ts
export function resolveLink(type: string, id: string): string | null { ... }
```

Returns the public URL for a given entity type and ID. Used everywhere a link to an asset, tenant, site, etc. is shown. Returns `null` for unknown types.

**Supported types:** asset profile, asset history, tenant profile, site detail, report detail, geofence detail, console request detail, maintenance plan detail, alert detail.

---

## 8. ETA resolver

**File:** `src/lib/eta.ts`

```ts
export function resolveEta(assetId: string, destinationId: string): number | null { ... }
```

Computes ETA for a given asset heading to a destination. Used in the asset detail page and anywhere ETA is displayed. All times are Dubai-local.

---

## 9. Clock / time handling

**File:** `src/lib/clock.ts`

```ts
export function now(): Date { return new Date(); }
export function formatDubaiDateTime(ms: number): string { ... }
export function formatDubaiDate(ms: number): string { ... }
export function formatDubaiTime(ms: number): string { ... }
export function formatTs(ts: string | number): string { ... }
```

All timestamps displayed in the UI use these helpers. The timezone is always `Asia/Dubai`. The demo bar allows offsetting the clock for demo purposes (affects ETA, alert timing, report date defaults).

---

## 10. Download flows

### Reports page (`app/app/reports/page.tsx`)

- **Excel:** `XLSX.utils.book_new()` → create workbook → add sheets → `XLSX.writeFile(wb, filename)`.
- **PDF:** `new jsPDF({ orientation })` → `doc.text(...)` → `autoTable(doc, {...})` → `doc.save(filename)`.

**Filename convention:** `Kasper_{reportType}_{scope}_{from}_to_{to}.{ext}`

### Downloads page (`app/app/downloads/page.tsx`)

- **Download again:** Re-runs the export for that download item using `rowsForDownload(download)` + `downloadAsExcel` or `downloadAsPdf`.
- **Delete:** Removes item from local `downloads` state (no server persistence — prototype limitation).

### Billing page (`app/app/billing/page.tsx`)

- **Download statement:** Generates `Kasper_GPS_subscription_{tenantId}_{date}.xlsx` with 4-row sheet: Tier 1 (AED 75/tracker-month), Tier 2 (AED 110), Tier 3 (AED 165), Total.

---

## 11. MUC (Monitor–Use–Control)

**Files:** `src/server/muc.ts`, `app/app/console/` MUC pages

The MUC module handles Monthly Utilisation Certificate generation and verification. MUC certificates are pre-generated in the seed data. The issuance flow is not yet fully built.

**Architecture rule:** All MUC lookups and mutations go through `src/server/muc.ts`.

---

## 12. Page inventory

### Customer-facing pages (`app/app/`)

| Page | Path | Phase | Notes |
|------|------|-------|-------|
| Sign-in | `/sign-in` | All | Redirects by role |
| Fleet / Map | `/app` | Day one | Map + asset list, filters |
| Asset detail | `/app/assets/[id]` | Day one | Overview, History, Settings tabs |
| Alerts | `/app/alerts` | Day one | View + acknowledge, filter |
| Reports | `/app/reports` | Day one (T&M, Loc hist) / Phase 2 (+4 types, PDF) | Excel + PDF exports |
| Cost | `/app/cost` | Phase 2 | Summary cards + invoice table |
| Maintenance | `/app/maintenance` | Phase 2 | Alert banners, service plans, history |
| Geofences | `/app/geofences` | Phase 2 | List + map overlay toggle + legend |
| Labels | `/app/labels` | Phase 2 | Customer labels list + CRUD |
| Schedules | `/app/schedules` | Phase 2 | Create/edit/delete/toggle report schedules |
| Downloads | `/app/downloads` | All | Download history, Download again, Delete |
| Billing | `/app/billing` | Phase 2 | Issued/received invoices, GPS subscription statement |
| Settings | `/app/settings` | All | Demo bar controls, profile |

### Console pages (`app/console/`)

| Page | Path | Role | Notes |
|------|------|------|-------|
| Dashboard | `/console` | Kasper | Overview KPIs |
| Assets | `/console/assets` | Kasper | Full list, filters, CRUD, transfer, retire |
| Asset detail | `/console/assets/[id]` | Kasper | Full detail + actions |
| Trackers | `/console/trackers` | Kasper | List, register one/many, pair/unpair, mark faulty |
| Adapters | `/console/adapters` | Kasper | CAN adapter list, fit/remove/faulty actions |
| Bookings | `/console/bookings` | Kasper | Booking list, filters, create, extend/close/cancel |
| Audit | `/console/audit` | Kasper | Audit log, filters, CSV export |
| Labels | `/console/labels` | Kasper | All labels, CRUD |
| Requests | `/console/requests` | Kasper | Tracker requests, Pair, Decline (reason-guarded) |
| Team | `/console/team` | Kasper | Staff list, create, deactivate/reactivate |
| Users | `/console/users` | Kasper | User management |
| Tenants | `/console/tenants` | Kasper | Tenant list, detail, CRUD |
| Tenant detail | `/console/tenant/[id]` | Kasper | Full tenant detail, sub-sections |
| Import | `/console/import` | Kasper | CSV import for assets, trackers, adapters, users |
| Onboarding | `/console/onboarding` | Kasper | 6-step tenant onboarding wizard |
| Geofences | `/console/geofences` | Kasper | Geofence management |
| Billing | `/console/billing` | Kasper | Console billing views |
| Settings | `/console/settings` | Kasper | Console settings |

---

## 13. Component inventory

**File:** `src/components/ui/index.ts` (re-exports)

| Component | File | Props | Notes |
|-----------|------|-------|-------|
| `Button` | `src/components/ui/Button.tsx` | `variant`, `size`, `onClick`, `disabled` | Variants: primary, secondary, yellow, ghost. Sizes: sm, md. |
| `Badge` | `src/components/ui/Badge.tsx` | `variant` | Variants: green, yellow, red, grey, ink, default, ink. |
| `EmptyState` | `src/components/ui/EmptyState.tsx` | `title`, `description` | Centered empty state with icon. |
| `Tabs` | `src/components/ui/Tabs.tsx` | `tabs`, `activeId`, `onChange` | Tab bar renderer. |
| `TabContent` | `src/components/ui/TabContent.tsx` | `activeId`, `id` | Renders children only when `id === activeId`. |
| `Modal` | `src/components/ui/Sheet.tsx` | — | Slide-in panel / modal. |
| `Toast` | `src/components/ui/Toast.tsx` | — | Toast notification component. |
| `Dropdown` | `src/components/ui/Dropdown.tsx` | — | Dropdown menu. |
| `Panel` | `src/components/ui/Panel.tsx` | — | Panel/container component. |
| `Skeleton` | `src/components/ui/Skeleton.tsx` | — | Loading skeleton. |
| `SourceLabel` | `src/components/ui/SourceLabel.tsx` | — | Source/label chip. |
| `StatusBadge` | `src/components/ui/StatusBadge.tsx` | — | Status-specific badge. |
| `TierChip` | `src/components/ui/TierChip.tsx` | — | Tier indicator chip. |
| `Table` | `src/components/ui/Table.tsx` | — | Table component. |
| `ErrorState` | `src/components/ui/ErrorState.tsx` | — | Error state display. |
| `InlineConfirm` | `src/components/ui/InlineConfirm.tsx` | — | Inline confirmation button. |

---

## 14. Domain types

**File:** `src/domain/types.ts`

Key types:
- `Session` — user session (tenantId, isKasper, siteUser, user)
- `Asset`, `Tracker`, `CanAdapter`, `Tenant`, `Site`, `Booking`, `Invoice`, `Geofence`, `Alert`, `Label`, `MaintenancePlan`, `AuditEntry`, `TrackerRequest`, `User`
- `ReportType`, `ScopeType`, `FrequencyType` — report/schedule types
- `Capability` — capability string type

---

## 15. Server modules

| Module | File | Responsibility |
|--------|------|---------------|
| Access | `src/server/access.ts` | `hasCapability`, `isAssetVisible` — all permission checks |
| Capabilities | `src/server/capabilities.ts` | Capability definitions per role |
| Links | `src/server/links.ts` | `resolveLink` — public link generation |
| ETA | `src/lib/eta.ts` | `resolveEta` — ETA computation |
| MUC | `src/server/muc.ts` | MUC certificate lookups and mutations |
| Seed data | `src/server/seed/data.ts` | All demo data — single source of truth |
| Telemetry simulator | `src/server/telemetry/simulator.ts` | `getReadingsForAsset` — simulated telemetry readings |
| API | `src/server/api.ts` | API route handlers |

---

## 16. Known limitations

1. **All data is seeded** — no real backend, no persistence. Changes are local only.
2. **Delete in downloads is local-state only** — no server persistence. Prototype limitation.
3. **MUC certificates are pre-generated** — issuance flow not yet built.
4. **Schedules page does not yet integrate with the download system** — schedules generate reports on a schedule but the download integration is pending.
5. **Arabic UI is not available** in this prototype.
6. **All passwords are accepted** — demo-only authentication.
7. **Download "again" regenerates from seed telemetry** — it does not fetch from a real history store.
8. **Console scaffolding pages are fully implemented** as of `1907d86` (merge commit).

---

## 17. Testing

| Type | Tool | Location | Status |
|------|------|----------|--------|
| E2E | Playwright | `tests/e2e/*.spec.ts` | 9 spec files (sign-in, customer-map, asset-detail, reports, cost-maintenance, geofences-map, console-requests, downloads, demo) |
| E2E helpers | Playwright fixtures | `tests/fixtures/helpers.ts` | `signInAs`, `signInAsKasper`, `goto`, `waitForToast`, `setPhase`, `expectPath`, `getDownloadFilename` |
| Unit | Vitest | `src/**/*.test.ts` | `links.test.ts`, `muc.test.ts`, `seed/data.test.ts`, `features.test.ts`, `access.test.ts`, `capabilities.test.ts`, `server/access.test.ts`, `server/capabilities.test.ts`, `server/seed/data.test.ts` |

**Test coverage reference:** `tests/TEST_MATRIX.md` — 121 features, 34 automated, 59 manual, 28 not tested.

**Demo walkthrough:** `tests/e2e/demo.spec.ts` — 8 test cases covering the full walkthrough. `DEMO_SCRIPT.md` — markdown walkthrough guide (12–15 min target runtime).

---

## 18. Implementation rules (from code review checklist)

1. Pages under `app/app/` are standalone — never import from each other.
2. Shared UI primitives in `@/components/ui` — never redefine equivalents in pages.
3. Server-side data in `@/server/seed/data.ts` — pages read from `seed.*`.
4. State in `@/store` (Zustand) — read via `store.getState()`.
5. Client-only features marked `'use client'`.
6. Cross-page coupling is a regression.
7. Phase gate is the first render condition after session null check.
8. `session.isKasper` checked where user type matters.
9. Asset visibility via `isAssetVisible` for tenant users.
10. All times in Dubai via `@/lib/clock`.
11. Form submit validation, cancel buttons, toast on success.
12. No empty `onClick` handlers on action buttons.
13. Download filenames follow convention.
14. `resolveLink` used for all public links.
15. MUC operations through `src/server/muc.ts`.
16. Every feature has at least one E2E test.
17. No `any` types added.

---

*End of ARCHITECTURE.md*
