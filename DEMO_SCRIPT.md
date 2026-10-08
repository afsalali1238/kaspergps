# Kasper GPS — Demo Script

> **Target runtime:** 12–15 minutes
> **Prerequisites:** dev server running (`npm run dev`), browser open at `http://localhost:3000`
> **Audience:** prospective customer, internal review, or sales walkthrough
> **Note:** Arabic is not available in this prototype. All UI is in English.

---

## 1. Sign-in & Demo Bar (2 min)

**Start:** `http://localhost:3000` → shows sign-in page.

1. Sign in as **Khalid Rahman** — `khalid@emiratesearth.ae`, any password.
   - Shows the Fleet page (customer home) with the map and asset list.
2. Open the **demo bar** (top of the page, or in Settings).
   - **Role switcher:** show how switching to "Site User" filters the asset list to only assets at the user's sites.
   - **Phase toggle:** switch between Day one / Phase 2 / Later. Show how Phase 2 features (Cost, Maintenance, Geofences, Labels, Schedules) appear and disappear.
   - **Clock offset:** briefly show how the clock can be jumped forward/backward — this affects ETA, alert timing, and report date defaults.

**Key message:** "One codebase, three role levels, three delivery phases — all controlled from the demo bar."

---

## 2. Customer Map — Fleet (3 min)

**Stay on `/app`.**

1. **Map + asset list.**
   - Point out the map with all Emirates Earthmovers assets as markers.
   - Hover over a marker to see the asset code + status popup.
   - Show the asset list on the left (or below on mobile) — EX-04, EX-07, WL-03, BD-02, etc.

2. **Filters.**
   - **Site filter:** select "Al Quoz Yard" — list narrows to assets at that site.
   - **Tier filter:** select Tier 3 — only ALL-CAN300 assets remain (EX-04, EX-07, WL-03, BD-02, GN-01).
   - Clear filters.

3. **Open an asset — EX-04 (CAT 320 excavator).**
   - Navigate to `/app/assets/a-ex04`.
   - **Overview tab:**
     - Mini-map with current position marker.
     - Status tile (live/idle/stale/offline).
     - Speed, heading, coordinates.
   - **CAN tiles** (Phase 2): RPM, engine hours, fuel level — show the gauge tiles.
   - **History tab:** click to show position history (list of lat/lng/timestamp entries).
   - **Settings tab:** show the tracker link section — copy the public tracking link.
   - Open the tracking link in a new tab (`/t/[token]`) to show the public view.

**Key message:** "Customers see only their own assets. Every asset has a full telemetry picture — position, CAN data, history, and a public tracking link."

---

## 3. Alerts (2 min)

1. Navigate to `/app/alerts`.
2. Show the alert types present in the seed data:
   - **Maintenance due soon** — EX-04 500 h service (80 h left).
   - **Maintenance overdue** — BD-02 250 h service (30 h overdue).
   - **Low fuel** — GN-01 at 12%.
   - **Invoice overdue** — INV-EE-0415.
3. Click **Acknowledge** on one alert — it moves to the acknowledged section.
4. Filter by alert type (maintenance / fuel / invoice) — show the filter works.

**Key message:** "Alerts are real-time and type-specific. Acknowledging an alert records who did it and when."

---

## 4. Reports (2 min)

1. Navigate to `/app/reports`.
2. **Report type selection:** click "Trip & Mileage".
3. **Scope:** select "Multiple assets".
4. **Date preset:** select "Last 7 days".
5. **Format:** switch between Excel and PDF — show both options.
6. **Run report (Excel):** click "Run report" → browser downloads `Kasper_trip_mileage_multiple_assets_2026-10-01_to_2026-10-07.xlsx`.
   - Open the file briefly to show the Summary + Data sheets.
7. **Run report (PDF):** switch format to PDF, click "Run report" → downloads `Kasper_trip_mileage_multiple_assets_...pdf`.
   - Show the PDF with the title, scope, generated timestamp, and the readings table.
8. Show how Phase 2 reports (Operating hours, Fuel, Utilisation, Driving events) are hidden in Day one phase and appear in Phase 2.

**Key message:** "Two export formats, six report types, three scopes, date presets — all gated by phase and hardware capability."

---

## 5. Cost & Maintenance (2 min)

1. Switch phase to **Phase 2** in the demo bar.
2. **Cost page (`/app/cost`):**
   - Show the four summary cards: Total asset value (AED), Finance/month, Insurance/month, Maintenance spend.
   - Show the invoice table — issued invoices with status badges (paid/overdue/unpaid).
   - Show AED formatting throughout.
3. **Maintenance page (`/app/maintenance`):**
   - Show the maintenance alert banners (due soon / overdue).
   - Show the service plans list with status badges: On track (green), Due soon (yellow), Overdue (red).
   - Show the service history table — dates, assets, readings, costs in AED.
   - Point out the "due soon" calculation: based on engine hours interval vs. last service reading.

**Key message:** "Cost & ROI and Maintenance are Phase 2 features — available when the customer has enough telemetry history."

---

## 6. Geofences (1 min)

1. Navigate to `/app/geofences`.
2. Show the geofence list — Jebel Ali Port gate 4 (circle), Al Quoz Yard after hours (polygon), Hatta Quarry, Palm Crescent works, Dubai Hills school zone (restricted).
3. Click **Show on map** — the Leaflet map appears with circles and polygons overlaid.
4. Hover over a geofence to see the tooltip (name, shape, alert settings).
5. Point out the legend bar below the map (restricted = red, job = yellow, yard = amber).
6. Click **Hide on map** to remove the overlay.

**Key message:** "Geofences are drawn on the map. Customers see their own geofences; Kasper sees all."

---

## 7. Console — Kasper perspective (3 min)

1. **Sign out** (or open in a new incognito window) and sign in as **Sara Haddad** — `sara@kasper.ae`, any password.
   - Redirects to `/console` — the Kasper console.
2. **Dashboard:** show the overview KPIs.
3. **Assets (`/console/assets`):**
   - Show the full asset list across all tenants.
   - Use the filters (tenant, tier, class, no tracker, retired).
   - Click **Create asset** — show the form (code, name, type, class, make, model, year, plate, site, tenant).
   - Click Create — toast confirms.
   - Click **Edit** on an asset — toast says "Editing [code] — use the detail page form."
   - Click **Transfer** — toast says "Transfer dialog for [code]."
   - Click **Retire** — toast says "[code] marked as retired."
4. **Tracker requests (`/console/requests`):**
   - Show the open request (trreq-001 — welder trailer for Gulf Lift).
   - Click **Pair** — navigates to `/console/trackers`.
   - Click **Decline** — modal opens with reason field.
   - Enter a short reason ("nope") → validation error (needs ≥ 10 chars).
   - Enter a valid reason ("Not needed at this site") → click Decline → toast confirms.
5. **Audit (`/console/audit`):**
   - Show the audit log (tenant creates, asset creates, etc.).
   - Use filters (person, tenant, action, date range).
   - Click **Export CSV** — downloads `audit-log-YYYY-MM-DD.csv`.
6. **Labels (`/console/labels`):**
   - Show all labels across tenants.
   - Create a label, rename it, delete it.
7. **Team (`/console/team`):**
   - Show the Kasper staff list.
   - Create a new staff member (name, email, role).
   - Deactivate a staff member → confirm modal → reactivated.

**Key message:** "The console is the Kasper operations centre — full asset lifecycle, tracker requests with reason-guarded decline, audit log with CSV export, labels, and team management."

---

## 8. Wrap-up (1 min)

1. Return to the Fleet page.
2. Remind the audience of the phase model:
   - **Day one:** map, asset detail, alerts (view + acknowledge), reports (Trip & Mileage, Location history).
   - **Phase 2:** CAN tiles, fuel, engine hours, ETA, geofences, labels, cost, maintenance, schedules, muc.
   - **Later:** advanced cost analytics, maintenance by fault codes, scheduled reports.
3. Point to the **Downloads** page — show the reports generated during the demo.

**Closing:** "Kasper GPS gives equipment owners and rental companies full visibility over their fleet — from the map to the certificate, from alerts to cost analytics. Everything you saw today is in the prototype."

---

## Known Limitations (for the presenter)

- All data is seeded — no real backend, no persistence.
- MUC certificates are pre-generated; the issuance flow is not yet built.
- Schedules page exists but does not yet integrate with the download system.
- Arabic UI is not available in this prototype.
- All passwords are accepted — this is a demo-only authentication model.
- The download "again" feature regenerates the report from seed telemetry — it does not fetch from a real history store.
