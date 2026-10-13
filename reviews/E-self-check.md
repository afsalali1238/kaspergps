# E self-check: fleet map, three panes (scorecard A3)

Spec: `UI-UPGRADE.md` §6, `handoff/agents/E-fleet-map.md`, PRD §0a D9.

## What changed
- `app/app/page.tsx` rewritten:
  - **Layout:** a KPI strip → one filter bar (removable chips) → [fleet rail | map | asset panel] → bottom tabs.
  - **KPI strip:**
    - Live, Idle and Offline (incl. stale), plus Open alerts (critical / warning) and Rentals ending today. These cells filter the map.
    - Engine hours today (ECU / Estimated) and Fuel used today (T2/T3 only) are shown with their source.
  - **Rail:**
    - search;
    - rows with a status dot, name, `CODE · class`, status · site · updated, and a fuel % or hours-today bar;
    - a Rented badge and an open-alert count;
    - Sites with counts.
    - Bulk labels are kept.
  - **Map:**
    - CARTO Positron base map, falling back to OSM, then the list-only notice;
    - code-labelled markers, with an accent ring on the selected one;
    - clusters kept;
    - a legend, and zoom controls at the top end.
    - The map has its own stacking context (`isolate`), so Leaflet controls never cover dialogs or the walkthrough card.
  - **Asset panel** (`?asset=`, Esc closes): from 1280 px it's a third column; at 1024–1279 px it overlays the map; on phones it's a `BottomSheet`.
  - **Bottom tabs:** Active alerts / Event log / Fuel events (T2/3 only).
- `src/server/fleet-panel.ts` (new, role-scoped): `fleetPanelFor`, `fleetKpis`, `fleetEvents`, `rentalLineFor` and `tierOfAsset`. **Severity comes from G1's `alerts-screen.ts`** (one source).
- `src/components/fleet/AssetPanelBody.tsx`:
  - the header line and chips;
  - a 2×2 metric grid (Tier 1: speed, ignition, today's distance, last update);
  - a fuel tank bar and a 7-day sparkline;
  - health rows and the next service;
  - Open asset page, Share link (`?panel=share` on the asset page) and Run report.
  - There's no End access here.
- `src/components/fleet/FleetBottomTabs.tsx`; `ClusterLayer` gets an `onSelect` (a marker click selects the asset).
- `tests/e2e/helpers.ts`: the tile stub also answers CARTO.

## Access (A16)
- An asset the session can't see returns no panel. `?asset=a-ex07` for Lina opens nothing.
- **Renters:**
  - see the rental line ("Rented from <owner> until …") and never the owner's maintenance;
  - see their own site, never the owner's yard;
  - **see fuel days and events only from the rental start (`historyFloor`)**. This was a leak in the first draft, now fixed and tested.
- Mark sees only Al Qusais Yard. Omar gets no fuel UI. Deepa and Fatima see no other company.

## Numbers
- Every value goes through `src/lib/format.ts`; null reads "Not measured". Sources are shown on tiles and KPIs.
- The engine-hours KPI label no longer says "(ECU)", because the strip can mix ECU and Estimated. The source line says which (Arabic updated too).

## Checks (this branch, on top of D + G1 + F1)
| Command | Result |
| --- | --- |
| typecheck, lint, build | pass |
| unit tests, UTC and Asia/Dubai | 1149 / 1149 |
| `fleet-panel.test.ts` | 10 tests: role scoping (Mark, Lina, Omar, Khalid, Deepa, Fatima), history floor, KPIs equal to the event tabs, severity from G1 |
| e2e: `e-fleet-map`, `a11y`, `no-raw-floats`, `scenario-walkthroughs`, `agent-a-fixes` | 113 passed |
| e2e: `h4-map-labels`, S1–S12, S23–S30, `phone-layout`, `map-loads`, `j5-proof` | 114 passed; 1 screenshot flake passed alone |

Existing tests changed by locators only. S1 opens the Status menu to see "No tracker", because the six status buttons became one filter menu. The `e2e-contract` keys `map.kpi.*` are kept.

## Screenshots
`reviews/screenshots/E/`: Khalid, Lina and Omar at 1440, 1280, 1024 and 390 px, with the panel open. Reviewed:
- the first fleet row and the map are visible at 1440 × 900;
- the overlay panel at 1024 px sits above the map controls;
- the phone sheet doesn't scroll sideways.

## Scorecard
A3 fleet map: 6 → **9**. Three panes, one filter bar, a row or marker opens the panel without navigating, bottom tabs, Map/List plus a bottom sheet on phones, role-scoped.

## Supervisor review (BUILDER §5)
PASS:
- no `role ===`;
- screens import the server only through `@/server/api`;
- time from `clock.ts`;
- no raw hex: marker HTML uses `COLORS`, and the code label is escaped;
- no raw floats;
- Arabic for every new key (`fleet.*`);
- no weakened assertion.

## Decisions taken
- Severity: G1's table is the single source. E's own table (towing and overdue service critical) was dropped.
- At 1024–1279 px the rail stays 240 px instead of collapsing to icons. The panel overlays the map instead.
