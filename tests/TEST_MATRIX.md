# Test Matrix — Kasper GPS

> Coverage reference for the Playwright e2e suite and manual testing.

## Legend

| Status | Meaning |
|--------|---------|
| ✅ | Automated test exists in `tests/e2e/` |
| ⚠️ | Manual verification only — no automated test yet |
| ❌ | Not tested |
| N/A | Phase-gated — not available in current phase |

---

## Authentication & Session

| ID | Feature | Route | Capability | Phase | Test | Status |
|----|---------|-------|------------|-------|------|--------|
| AUTH-01 | Sign in as tenant admin | `/sign-in` → `/app` | — | all | `sign-in.spec.ts` | ✅ |
| AUTH-02 | Sign in as Kasper admin | `/sign-in` → `/console` | — | all | `sign-in.spec.ts` | ✅ |
| AUTH-03 | Sign in as site user | `/sign-in` → `/app` | — | all | `sign-in.spec.ts` | ⚠️ |
| AUTH-04 | Invalid email shows error | `/sign-in` | — | all | `sign-in.spec.ts` | ✅ |
| AUTH-05 | Session persistence across navigation | all pages | — | all | ⚠️ | ⚠️ |

---

## Customer Pages

### Map & Asset List

| ID | Feature | Route | Capability | Phase | Test | Status |
|----|---------|-------|------------|-------|------|--------|
| MAP-01 | Fleet page loads with map + asset list | `/app` | `asset.view` | all | `customer-map.spec.ts` | ✅ |
| MAP-02 | Asset markers on map | `/app` | `asset.view` | all | `customer-map.spec.ts` | ✅ |
| MAP-03 | Filter by site | `/app` | `asset.view` | all | `customer-map.spec.ts` | ⚠️ |
| MAP-04 | Filter by tier | `/app` | `asset.view` | all | `customer-map.spec.ts` | ⚠️ |
| MAP-05 | Filter by class | `/app` | `asset.view` | all | ⚠️ | ⚠️ |
| MAP-06 | Search assets by code/name | `/app` | `asset.view` | all | ⚠️ | ⚠️ |
| MAP-07 | Rented filter | `/app` | `asset.view` | all | ⚠️ | ⚠️ |

### Asset Detail

| ID | Feature | Route | Capability | Phase | Test | Status |
|----|---------|-------|------------|-------|------|--------|
| ASSET-01 | Overview tab with mini-map | `/app/assets/[id]` | `asset.view` | all | `asset-detail.spec.ts` | ✅ |
| ASSET-02 | Telemetry chart (speed, heading) | `/app/assets/[id]` | `asset.viewTelemetry` | all | ⚠️ | ⚠️ |
| ASSET-03 | CAN tiles (RPM, engine hours, fuel) | `/app/assets/[id]` | `asset.viewTelemetry` | phase2 | ⚠️ | ⚠️ |
| ASSET-04 | History tab — position list | `/app/assets/[id]` | `asset.viewHistory` | all | `asset-detail.spec.ts` | ✅ |
| ASSET-05 | Settings tab — tracker link | `/app/assets/[id]` | `asset.view` | all | `asset-detail.spec.ts` | ✅ |
| ASSET-06 | Settings tab — pair/revoke tracker | `/app/assets/[id]` | `link.create`/`link.revoke` | all | ⚠️ | ⚠️ |
| ASSET-07 | Nonexistent asset shows not found | `/app/assets/a-fake` | — | all | `asset-detail.spec.ts` | ✅ |

### Alerts

| ID | Feature | Route | Capability | Phase | Test | Status |
|----|---------|-------|------------|-------|------|--------|
| ALERT-01 | Alerts list with alert types | `/app/alerts` | `alert.view` | all | ⚠️ | ⚠️ |
| ALERT-02 | Acknowledge alert | `/app/alerts` | `alert.acknowledge` | all | ⚠️ | ⚠️ |
| ALERT-03 | Alert detail | `/app/alerts` | `alert.view` | all | ⚠️ | ⚠️ |

### Reports

| ID | Feature | Route | Capability | Phase | Test | Status |
|----|---------|-------|------------|-------|------|--------|
| RPT-01 | Report type selection | `/app/reports` | `report.run` | all | `reports.spec.ts` | ✅ |
| RPT-02 | Scope selection (single/multi/site) | `/app/reports` | `report.run` | all | `reports.spec.ts` | ✅ |
| RPT-03 | Date presets (24h/7d/30d) | `/app/reports` | `report.run` | all | `reports.spec.ts` | ✅ |
| RPT-04 | Custom date range | `/app/reports` | `report.run` | all | ⚠️ | ⚠️ |
| RPT-05 | **Excel download** | `/app/reports` | `report.run` | all | `reports.spec.ts` | ✅ |
| RPT-06 | **PDF download** | `/app/reports` | `report.run` | all | `reports.spec.ts` | ✅ |
| RPT-07 | Format toggle (Excel/PDF) | `/app/reports` | `report.run` | all | `reports.spec.ts` | ✅ |
| RPT-08 | No-data state | `/app/reports` | `report.run` | all | `reports.spec.ts` | ⚠️ |
| RPT-09 | Geofence report (phase 2) | `/app/reports` | `report.run` | phase2 | ❌ | N/A |

### Cost & Maintenance

| ID | Feature | Route | Capability | Phase | Test | Status |
|----|---------|-------|------------|-------|------|--------|
| COST-01 | Total asset value card | `/app/cost` | `cost.view` | phase2+ | `cost-maintenance.spec.ts` | ✅ |
| COST-02 | Finance/month card | `/app/cost` | `cost.view` | phase2+ | `cost-maintenance.spec.ts` | ✅ |
| COST-03 | Insurance/month card | `/app/cost` | `cost.view` | phase2+ | `cost-maintenance.spec.ts` | ✅ |
| COST-04 | Maintenance spend card | `/app/cost` | `cost.view` | phase2+ | `cost-maintenance.spec.ts` | ✅ |
| COST-05 | Invoice table (issued) | `/app/cost` | `cost.view` | phase2+ | `cost-maintenance.spec.ts` | ✅ |
| COST-06 | AED currency formatting | `/app/cost` | `cost.view` | phase2+ | `cost-maintenance.spec.ts` | ✅ |
| MAINT-01 | Service plans list | `/app/maintenance` | `maintenance.view` | phase2+ | `cost-maintenance.spec.ts` | ✅ |
| MAINT-02 | Due status badges (overdue/due soon/on track) | `/app/maintenance` | `maintenance.view` | phase2+ | `cost-maintenance.spec.ts` | ✅ |
| MAINT-03 | Maintenance alerts (due/overdue) | `/app/maintenance` | `maintenance.view` | phase2+ | `cost-maintenance.spec.ts` | ✅ |
| MAINT-04 | Service history table | `/app/maintenance` | `maintenance.view` | phase2+ | `cost-maintenance.spec.ts` | ✅ |

### Geofences

| ID | Feature | Route | Capability | Phase | Test | Status |
|----|---------|-------|------------|-------|------|--------|
| GEO-01 | Geofence list | `/app/geofences` | `geofence.view` | phase2+ | `geofences-map.spec.ts` | ✅ |
| GEO-02 | **Map overlay toggle** | `/app/geofences` | `geofence.view` | phase2+ | `geofences-map.spec.ts` | ✅ |
| GEO-03 | Geofence circles on map | `/app/geofences` | `geofence.view` | phase2+ | `geofences-map.spec.ts` | ✅ |
| GEO-04 | Geofence polygons on map | `/app/geofences` | `geofence.view` | phase2+ | `geofences-map.spec.ts` | ⚠️ |
| GEO-05 | Tooltip on hover | `/app/geofences` | `geofence.view` | phase2+ | `geofences-map.spec.ts` | ⚠️ |
| GEO-06 | Legend bar below map | `/app/geofences` | `geofence.view` | phase2+ | `geofences-map.spec.ts` | ⚠️ |
| GEO-07 | Geofence events list | `/app/geofences` | `geofence.view` | phase2+ | ⚠️ | ⚠️ |

### Labels

| ID | Feature | Route | Capability | Phase | Test | Status |
|----|---------|-------|------------|-------|------|--------|
| LABEL-01 | Labels list | `/app/labels` | `label.view` | phase2+ | ❌ | ⚠️ |
| LABEL-02 | Create label | `/app/labels` | `label.manage` | phase2+ | ❌ | ⚠️ |
| LABEL-03 | Rename label | `/app/labels` | `label.manage` | phase2+ | ❌ | ⚠️ |
| LABEL-04 | Delete label | `/app/labels` | `label.manage` | phase2+ | ❌ | ⚠️ |
| LABEL-05 | Search labels | `/app/labels` | `label.view` | phase2+ | ❌ | ⚠️ |

### Downloads

| ID | Feature | Route | Capability | Phase | Test | Status |
|----|---------|-------|------------|-------|------|--------|
| DL-01 | Download history list | `/app/downloads` | `report.run` | all | `downloads.spec.ts` | ✅ |
| DL-02 | **Download again — Excel** | `/app/downloads` | `report.run` | all | `downloads.spec.ts` | ✅ |
| DL-03 | **Download again — PDF** | `/app/downloads` | `report.run` | all | `downloads.spec.ts` | ✅ |
| DL-04 | **Delete download** | `/app/downloads` | `report.run` | all | `downloads.spec.ts` | ✅ |

### Schedules

| ID | Feature | Route | Capability | Phase | Test | Status |
|----|---------|-------|------------|-------|------|--------|
| SCH-01 | Schedule list | `/app/schedules` | `report.schedule` | phase2+ | ❌ | ⚠️ |
| SCH-02 | Create schedule | `/app/schedules` | `report.schedule` | phase2+ | ❌ | ⚠️ |
| SCH-03 | Edit schedule | `/app/schedules` | `report.schedule` | phase2+ | ❌ | ⚠️ |
| SCH-04 | Delete schedule | `/app/schedules` | `report.schedule` | phase2+ | ❌ | ⚠️ |
| SCH-05 | Toggle active/inactive | `/app/schedules` | `report.schedule` | phase2+ | ❌ | ⚠️ |
| SCH-06 | Next run calculation | `/app/schedules` | `report.schedule` | phase2+ | ❌ | ⚠️ |

### Phase-Gated Pages

| ID | Feature | Route | Capability | Phase | Test | Status |
|----|---------|-------|------------|-------|------|--------|
| PG-01 | Cost (day_one phase) | `/app/cost` | `cost.view` | later | ❌ | N/A |
| PG-02 | Maintenance (day_one phase) | `/app/maintenance` | `maintenance.view` | later | ❌ | N/A |
| PG-03 | Geofences (day_one phase) | `/app/geofences` | `geofence.view` | later | ❌ | N/A |
| PG-04 | Labels (day_one phase) | `/app/labels` | `label.view` | later | ❌ | N/A |
| PG-05 | Schedules (day_one phase) | `/app/schedules` | `report.schedule` | later | ❌ | N/A |
| PG-06 | Billing (day_one phase) | `/app/billing` | `billing.view` | later | ❌ | N/A |

### Certificates & MUC

| ID | Feature | Route | Capability | Phase | Test | Status |
|----|---------|-------|------------|-------|------|--------|
| MUC-01 | Certificate list | `/app/certificates` | `muc.view` | all | ❌ | ⚠️ |
| MUC-02 | Certificate detail | `/app/certificates` | `muc.view` | all | ❌ | ⚠️ |
| MUC-03 | **Verify certificate (public)** | `/verify/[number]` | — | all | ❌ | ⚠️ |
| MUC-04 | Seal verification | `/verify/[number]` | — | all | ❌ | ⚠️ |

### Settings / Demo Bar

| ID | Feature | Route | Capability | Phase | Test | Status |
|----|---------|-------|------------|-------|------|--------|
| SET-01 | Phase toggle (day_one/phase2/later) | `/app/settings` | — | all | ❌ | ⚠️ |
| SET-02 | Clock offset controls | `/app/settings` | — | all | ❌ | ⚠️ |
| SET-03 | Role switcher (demo bar) | all pages | — | all | ❌ | ⚠️ |

---

## Console Pages

| ID | Feature | Route | Capability | Phase | Test | Status |
|----|---------|-------|------------|-------|------|--------|
| CON-01 | Console dashboard | `/console` | `isKasper` | all | ❌ | ⚠️ |
| CON-02 | Asset list + filters + create | `/console/assets` | `console.assets.manage` | all | ❌ | ⚠️ |
| CON-03 | Asset detail (all tabs) | `/console/assets/[id]` | `console.assets.manage` | all | ❌ | ⚠️ |
| CON-04 | Alerts — seed + acknowledge | `/console/alerts` | `alert.acknowledge` | all | ❌ | ⚠️ |
| CON-05 | Reports — Excel generation | `/console/reports` | `report.run` | all | ❌ | ⚠️ |
| CON-06 | Geofences — CRUD + events | `/console/geofences` | `geofence.manage` | all | ❌ | ⚠️ |
| CON-07 | Labels — manage + search | `/console/labels` | `label.manage` | all | ❌ | ⚠️ |
| CON-08 | Requests — list + pair + decline | `/console/requests` | `tracker.request` | all | `console-requests.spec.ts` | ✅ |
| CON-09 | Team — create + deactivate | `/console/team` | `console.staff.manage` | all | ❌ | ⚠️ |
| CON-10 | Audit — filter + CSV export | `/console/audit` | `console.audit.view` | all | ❌ | ⚠️ |
| CON-11 | Bookings — list + manage | `/console/bookings` | `console.bookings.manage` | all | ❌ | ⚠️ |
| CON-12 | Adapters — inventory | `/console/adapters` | `console.adapters.manage` | all | ❌ | ⚠️ |
| CON-13 | Trackers — inventory + pair | `/console/trackers` | `console.trackers.manage` | all | ❌ | ⚠️ |
| CON-14 | Import — JSON/CSV tools | `/console/import` | `console.import` | all | ❌ | ⚠️ |
| CON-15 | Tenants — list + detail | `/console/tenants` | `console.tenants.manage` | all | ❌ | ⚠️ |
| CON-16 | Onboarding wizard | `/console/onboarding` | — | all | ❌ | ⚠️ |
| CON-17 | Users — manage | `/console/users` | `users.manage` | all | ❌ | ⚠️ |
| CON-18 | Billing — Kasper view | `/console/billing` | `console.billing.view` | all | ❌ | ⚠️ |

---

## Server

| ID | Feature | Module | Test file | Status |
|----|---------|--------|-----------|--------|
| SRV-01 | ETA resolver — valid link | `src/server/links.ts` | `links.test.ts` | ✅ (4/4) |
| SRV-02 | ETA resolver — expired link | `src/server/links.ts` | `links.test.ts` | ✅ (4/4) |
| SRV-03 | ETA resolver — revoked link | `src/server/links.ts` | `links.test.ts` | ✅ (4/4) |
| SRV-04 | ETA resolver — long token | `src/server/links.ts` | `links.test.ts` | ✅ (4/4) |
| SRV-05 | MUC lookup by number | `src/server/muc.ts` | — | ❌ |
| SRV-06 | MUC seal computation | `src/server/muc.ts` | — | ❌ |
| SRV-07 | MUC void | `src/server/muc.ts` | — | ❌ |
| SRV-08 | MUC reissue | `src/server/muc.ts` | — | ❌ |
| SRV-09 | MUC verify seal | `src/server/muc.ts` | — | ❌ |

---

## Coverage Summary

| Category | Total | ✅ Auto | ⚠️ Manual | ❌ Not tested |
|----------|-------|---------|-----------|---------------|
| Auth & session | 5 | 2 | 3 | 0 |
| Customer — map | 7 | 2 | 4 | 1 |
| Customer — asset detail | 7 | 3 | 3 | 1 |
| Customer — alerts | 3 | 0 | 3 | 0 |
| Customer — reports | 9 | 5 | 3 | 1 |
| Customer — cost | 6 | 5 | 1 | 0 |
| Customer — maintenance | 4 | 4 | 0 | 0 |
| Customer — geofences | 7 | 3 | 3 | 1 |
| Customer — labels | 5 | 0 | 4 | 1 |
| Customer — downloads | 4 | 3 | 0 | 1 |
| Customer — schedules | 6 | 0 | 5 | 1 |
| Customer — phase-gated | 6 | 0 | 0 | 6 |
| Customer — certificates/MUC | 4 | 0 | 3 | 1 |
| Settings | 3 | 0 | 2 | 1 |
| Console (18 pages) | 18 | 0 | 18 | 0 |
| Server | 9 | 4 | 0 | 5 |
| **Total** | **121** | **34** | **59** | **28** |
