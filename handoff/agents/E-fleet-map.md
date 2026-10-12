# Agent E: fleet map, three panes (Wave 2, after B)

**Branch:** `agent-e-fleet-map` · **Spec:** `UI-UPGRADE.md` §5.2 (Map row), §6 · **Arabic namespace:** `fleet`

## Scope
1. **KPI strip** (Map row of §5.2), role-scoped:
   - Live / Idle / Offline;
   - engine hours today (ECU or Estimated);
   - fuel used today (T2/T3 only);
   - open alerts (critical / warning);
   - rentals ending today.
   Clicking a cell filters the map.
2. **Desktop ≥ 1280 px:**
   - **Left rail, 280 px:** search, then the fleet list, then Sites with counts. A fleet row shows a status dot, the name, `CODE · class`, a fuel or utilisation mini-bar, and a Rented badge. The selected row is tinted.
   - **Centre:** Leaflet map with a muted base layer (CARTO Positron, with OSM as fallback) and status markers with code labels. The selected marker gets an accent ring; keep clustering and add a legend.
   - **Right panel**, a `SideSheet` of 360 px, opened by a row or marker click. The URL gets `?asset=<id>`.
     - Header and status chips.
     - A 2×2 metric grid (Tier 1 gets its own set).
     - Fuel tank bar and 7-day sparkline (T2/3).
     - Health rows, the next maintenance item, and actions: Open asset page (primary), Share link, Run report.
     - **No "End access" here.**
   - **Bottom tabs** (collapsible): Active alerts | Event log | Fuel events (T2/3).
3. **One filter bar:** Status, Site, Type, Tier (only when the fleet is mixed), Labels, and Owned/Rented (only when the user has both), with removable chips. It replaces today's four rows.
4. **1024–1279 px:** the rail collapses to icons, and the panel overlays the map.
5. **Phone:** keep the Map | List tabs; tapping an asset opens a `BottomSheet` with the panel content.
6. Use `src/lib/format.ts` (from C) for every number. No raw floats.

## Data
- Use the existing `src/server/api` exports.
- New read functions go in a new `src/server/fleet-panel.ts`, exported at the end of `api.ts` under `// ── Agent E ──`.
- Everything is role-scoped: Lina sees her own and rented assets; Mark sees only his site; Omar gets no fuel UI.

## Tests
- Clicking a row opens the panel with the right asset and updates the URL; Esc closes it.
- Role-scoping tests for Lina, Mark and Omar.
- At 1440 × 900 the first fleet row and the map are visible without scrolling.
- At 390 px there's no sideways scroll, and the sheet opens.
- Existing map tests: update locators only where markup changed, and keep every behaviour assertion.

## Done when
- Scorecard A3 ≥ 9, with evidence. Screenshots at 1440, 1280, 1024 and 390 px for Khalid, Lina and Omar.
