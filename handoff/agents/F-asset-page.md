# Agent F: asset page, playback and share dialog (Wave 2, after B)

**Branch:** `agent-f-asset-page` · **Spec:** `UI-UPGRADE.md` §7, §8 (Share tracking link dialog) · **Arabic namespace:** `asset_page`, `share`

Already done (keep it): every playback pin (J6, PR #27), the shared trip rule, rounded speed, and one Power tile.

## Scope
1. **Header** (§7.1):
   - code, name, and status / tier / rented chips;
   - make, model, year and plate;
   - the viewer's site, owner or renter, and geofence;
   - "Last updated", with device time and received time in a tooltip.
   - Actions: one primary action (Share for owners, Run report for renters), and **End access now** as an outlined danger button that opens `ConfirmDialog` with the existing reason rules.
2. **Overview** (§7.2):
   - a 2×2 `MetricTile` grid beside a shorter map;
   - every number goes through `src/lib/format.ts`;
   - source labels stay;
   - `SegmentedTabs`, with an edge fade on phones.
3. **History = playback** (§7.3, fleetx layout):
   - a trip list on the left;
   - the route with coloured segments and the existing pins, plus a scrubber;
   - **a timeline list instead of today's raw readings table** (100+ rows of "0 km/h · Off" today).
   - Keep "Show readings" as a collapsed disclosure for power users.
4. **Engine & fuel** (§7.4): a tank bar at the top, and a fuel-drop card (shaded window, litres lost, engine off, a link to the alert) when a drop is in range.
5. **Share tracking link dialog** (§8):
   - a phone-frame live preview of `/t/<token>`;
   - Copy link, a QR code (`qrcode`) and expiry;
   - active-link counts in the Links section.

## Data
- Existing exports.
- A new `src/server/asset-page.ts` if you need one, exported under `// ── Agent F ──`.
- Renter rules are unchanged: a renter's history is clipped to the rental and starts with "History starts …".

## Tests
- No raw floats on the asset page: remove D's `fixme` for this screen, if there is one.
- The End-access confirm flow.
- The timeline replaces the table, and the disclosure works.
- The share dialog shows the preview and copies the link.
- Lina, as a renter, sees no End access and no Share.

## Done when
- Scorecard A4 ≥ 9, with evidence. Screenshots: EX-04 as Khalid, EX-04 as Lina, FB-12 as Omar, and GR-01; History and Engine & fuel at 1440 and 390 px.
