# Agent G: Alerts, Fuel and Maintenance (Wave 2, after B)

**Branch:** `agent-g-work-screens` · **Spec:** `UI-UPGRADE.md` §5.2 (Alerts, Fuel and Maintenance rows), §8 · **Arabic namespace:** `alerts_page`, `fuel`, `maintenance_page`

## Scope
1. **Alerts:**
   - KPI strip;
   - filter bar (status, type, the viewer's sites);
   - **grouped by severity**: Critical (offline, power cut, fuel drop, fault), then Warning, then Info;
   - each `AlertRow` has a severity border, a Lucide icon, the asset code as a link, the text, a relative time with the exact time on hover, the site, and Acknowledge;
   - **"Acknowledge all (n)"** acts on the filtered alerts the user may acknowledge, with a confirm and one audit entry per alert;
   - **`AlertRulesPanel`** for Tenant Admins (type → Instant / Daily digest / In-app only), saved per tenant, labelled **"Prototype — no messages are sent"**.
2. **Fuel** (new `/app/fuel`):
   - a nav item only when `anyAssetHasFeature(session, 'fuel.level')` (B owns `AppShell`; ask through the supervisor, or add it in your PR with the change scoped to one nav entry);
   - KPI strip;
   - a `FuelCard` grid (level, tank bar, L / capacity, today's use, rate, status, trend);
   - a `FuelDropCard` for each drop in range (GN-01 at 02:10);
   - ECU / Estimated sources;
   - renter scoping.
3. **Maintenance:**
   - KPI strip;
   - four summary cards;
   - a **schedule table** by default (asset, type, item, last/due, current, remaining with an approximate date, status, Log service);
   - a Board toggle;
   - the service history stays;
   - every number comes from `planSnapshot` (one source).

## Data
- New `src/server/fuel-screen.ts` and `src/server/alert-rules.ts` as needed, exported under `// ── Agent G ──`.
- The alert-rules table goes in the local db, with a db migration in the same PR.

## Tests
- Grouping order.
- Bulk acknowledge touches only allowed alerts.
- The bell matches the page.
- Fuel: Omar gets "Page not found", Khalid sees the GN-01 drop, and Fatima sees only her rented T3 assets.
- The rules panel is hidden for Site Users and renters' Site Users.
- The maintenance table numbers equal the alert text (`consistency.test.ts` from C covers the server side).

## Done when
- Scorecard A5, A7 and A8 ≥ 9. Screenshots of each screen for Khalid, Omar and Mark at 1440 and 390 px.
