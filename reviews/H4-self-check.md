# H4 self-check — spec features (H4.1–H4.8)

Date: 2026-10-12 · Agent: Claude (Haiku 5.5) · Branch `h4-spec-features`

## Commands (each run on its own, exit code checked)

| Command | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `TZ=UTC npx vitest run` | exit 0, 729 / 729, 52 files |
| `TZ=Asia/Dubai npx vitest run` | exit 0, 729 / 729, 52 files |
| `npm run test:coverage` | exit 0, 86.05 % lines (floor 85 %) |
| `bash /home/claude/rebuild.sh` | exit 0 |
| `npx playwright test` (desktop + phone) | exit 0, 347 passed, 0 failed, 167 skipped, 514 entries |

The GitHub CI run has not happened.

## Item by item

| Item | Built | Proof | Gaps |
| --- | --- | --- | --- |
| **H4.1 Trip playback (§11.15)** | Play/pause; speeds 1×/10×/60×/300×; restart; scrubber coloured by state with hatched no-data; heading-rotated marker with trail; gap banner "No data … – …" that jumps the gap; readout by tier with "Not measured", including AdBlue; reduced motion starts paused and steps ("Step 5 min"); trail capped at 5,000 points. **Event pins on the scrubber:** over-speed (one per run, labelled with its top speed), fuel drop (Tier 2/3), own geofence enter and exit; click a pin to jump | `src/domain/playback.test.ts` (26, including the pin rules: runs, gap breaks, Tier 1 never gets fuel pins, geofence window); `src/server/telemetry/planned-overspeed.test.ts` (3); `tests/e2e/playback-motion.spec.ts` (4: Play, reduced motion, S27 over-speed pin reached through History, S28 AdBlue "Not measured") | Not built: harsh-event, towing, power-cut and refuel pins, and pins on the map. The simulator has no TP-21, LB-05 or BD-02 override that would make them. |
| **H4.2 History tab (§11.3)** | 24 h default, 7 days, custom (31-day cap); renter floor clamps and refuses before the window; track split at gaps; positions table with the CAN columns the asset supports; gap rows; 100 rows per page; **"Play this period"** opens the player over the period | `src/server/access.test.ts` (history floor); `playback-motion.spec.ts` (S27 and S28 both start from "Play this period") | Positions table is not sortable or exportable. The renter floor is unit-tested, not checked in a browser. |
| **H4.3 Labels (§11.11)** | Chips and "+ Label" on asset detail; labels column and bulk add/remove on the map list; label filter (any-of) on the map; Settings tab with rename and delete | `src/server/asset-admin-labels.test.ts` (40-character limit, case-insensitive reuse, rename clash, 20 per asset, renter never sees owner labels, site user cannot manage, delete takes it everywhere); `h4-map-labels.spec.ts` (bulk add and remove, filter) | The "assets with label …" scope in reports and schedules is not verified this round. |
| **H4.4 Geofences (§11.12)** | Circle (50–5,000 m) and polygon (3–30 points) drawn with `@geoman-io/leaflet-geoman-free`; **edit** (name, new shape, alert switches; a new shape re-derives its last-7-days events; a site geofence's shape is locked to its site) and delete; site geofence created from the site; map overlay switch; asset "Inside: …" / "Outside all geofences" line (own company only); geofence report only when the company has a geofence | `src/server/geofence-admin.test.ts` (19, including 6 for edit); `src/server/geofences.test.ts` (limits, create and delete); `h4-geofences-settings.spec.ts` (6: rename from the row's Edit, Inside line, renter sees none, report offered in Phase 2, site geofence once, new asset's hardware); `h4-map-labels.spec.ts` (overlay switch) | The shape edit and the drag-to-draw are not e2e-tested. The Kind and Assets fields are disabled while editing, so a fence's asset scope cannot be changed after creation. |
| **H4.5 Settings forms (§11.8)** | Sites: create and edit (map or place list, 100–2,000 m); delete only with nothing depending on the site. Add asset: unique code, starts as No tracker, Tier 1, list only; hardware read-only with "Contact Kasper to change hardware"; "Request a tracker" link. Retire and reinstate blocked during an active or upcoming hire. Retired filter. All saved and audited | `src/server/asset-admin-rules.test.ts` (29: code uniqueness, add defaults, retire rule, site-delete rule); `h4-geofences-settings.spec.ts` (new asset shows read-only hardware and links to a request) | Site create and edit have no e2e test. |
| **H4.6 Map (§11.2)** | Filters and search in the URL, restored on Back; `leaflet.markercluster` clustering; "rented" outline on rented-in markers; after three tile failures a notice with Retry, and the list stays usable | `h4-map-labels.spec.ts` (clustering; `?status=offline` on arrival; Back keeps `status=live`; tile error with Retry) | The rented outline is styling only and no test asserts it. Text search is not e2e-tested. |
| **H4.7 Demo bar at 390 px** | The bar wraps on a phone instead of hiding controls behind a scroll; the page offset follows the bar's measured height | `phone-layout.spec.ts`: "the demo bar fits a 390 px phone: every control is on screen", and no sideways scroll on each screen | — |
| **H4.8 Cost & ROI "Draft" tag** | Tagged "Draft" (`cost.draft_tag`) | `maintenance-cost.spec.ts` asserts the text | — |

## Real bugs found and fixed in this round

- **Clock:** on a machine outside Dubai, times showed two hours late (19:00 shown as 23:00). Fixed in
  `src/lib/clock.ts`; covered by `src/lib/clock.test.ts` under UTC, Asia/Dubai and New York.
- **Arabic placeholders:** "last updated" showed `({ago})`, and some strings had placeholders that no
  caller filled. Fixed. Nine alert-word entries that could never be filled were removed.
- **The simulator had no WT-07 over-speed**, although spec §8 and S27 require one. Added as a planned
  104 km/h run yesterday (six contiguous moving readings).
- **History had no "Play this period"**, although S28 told the user to press it. Added.
- **Event pins were missing** although S27 expects an over-speed pin. Built.
- **Geofences could not be edited**, although H4.4 requires it. Built (`updateGeofence`, Edit button).
- **Stale production server:** the e2e run reuses the server on :3000, so a rebuild is needed after every
  app change. A run against the old build failed on controls that existed only in the new code.

## Known gaps (H4)

- Event pins: harsh-event, towing, power-cut and refuel pins, and pins on the map, are not built.
- No e2e test for the shape edit, delete, site create and edit, or the browser drag-to-draw.
- The rented outline on the map and the text search are not asserted.
- The "assets with label …" scope in reports and schedules is not verified.
- The GitHub CI run has not happened.
