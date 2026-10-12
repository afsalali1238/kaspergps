# Handoff: Kasper GPS UI/UX upgrade to 9/10 everywhere (12 Oct 2026)

This is the specification. **The builder works from `handoff/BUILDER.md`** (the work order, review loop and PR checklist), with this file for the details. Claude Opus supervises: it reviews and merges every PR.

**Goal:** every area of the prototype scores **at least 9 / 10** on the scorecard in §2, judged by the measurable checks there. Keep everything that already works: rules, roles, privacy, honest data sources and tests. Rebuild the look, layout and workflows using the best of the old fleetx dashboard.

**Precedence:**
1. The owner's decisions (§1.3) win.
2. Then `BUILD_PROMPT.md`.
3. Then this file.
4. fleetx is a **visual reference only**. Its numbers, code structure and static mock-ups are not taken.

Background reviews (in the claude.ai project "gps arena"):
- `REVIEW-UI-2026-10-12-evening.md`: Kasper today, 6/10, with its bug list.
- `REVIEW-fleetx-vs-kasper-2026-10-12.md`: what to take from fleetx and what to leave.

---

## 0. How to work

1. **One coding session at a time.** Run `git fetch`, branch from the latest `main`, and open one PR per step (U0–U8). **The supervisor merges; the builder never does.** Don't start step N+1 until N is merged.
2. For each step:
   - run `npm run typecheck`, `npm run lint` and `npm run build`;
   - run `npm test` twice, with `TZ=UTC` and with `TZ=Asia/Dubai`;
   - run Playwright for desktop and phone (CI shards it 3 ways);
   - write `reviews/U<n>-self-check.md` with exit codes, before/after screenshots at 1440 and 390 px, and the scorecard rows that step moves.
3. Run each command on its own and check its exit code. Never claim a check passed unless it ran. Look at each changed screen in Chromium.
4. **Never weaken a test.** If a test pinned old markup that you intentionally changed, update its locator to the new role or label. Keep every assertion about **behaviour**: who sees what, numbers and states.
5. **Never widen access.** If it's unclear who can see something, they can't.
6. Architecture rules:
   - screens import the server only through `src/server/api`;
   - no `role ===` outside `capabilities.ts`, `capability-reasons.ts` and `seed/`;
   - time comes only from `clock.ts`;
   - line coverage stays at 85% or more.
7. **Honest numbers.** Every number on screen comes from the simulator or seed and carries its source (ECU / ECU · partial / Estimated / From invoices / Dummy rate), or reads "Not measured". No invented savings, ROI multiples or forecasts.
8. Use "Kasper", never "Dozr" (see §1.3). Keep "asset" (the machine) and "tracker" (the GPS unit) distinct.
9. **Sandbox pitfalls:**
   - GitHub GraphQL is blocked, so use REST for checks: `gh api repos/afsalali1238/kaspergps/commits/<sha>/check-runs`.
   - After `npm run build`, restart `next start`, or stale chunks give "This page couldn't load".
   - A local Playwright run rewrites `reviews/screenshots/**`. Commit screenshots only in the step that means to.
   - Never `pkill -f` a pattern that also appears in your own shell command.

---

## 1. Starting point

### 1.1 State
- `main` is at `317597c` (or later): green on CI and deployed to kaspergps.vercel.app.
- 857 unit tests and about 360 e2e tests pass.
- The owner's Windows clone (`Gpsarena\kaspergps`) is on `main` too.

### 1.2 What already works (don't break it)
- Role-first sign-in with 5 roles; View as; demo clock; Scenarios; Tools.
- Asset visibility per role and site, renter windows and renter-only sites, hardware tiers T1–T3, Sales view.
- The Features panel (capabilities with ✓/✕ and their reasons).
- Engine & fuel tab with its 7-day chart, Maintenance, Cost & ROI, Billing, certificates (MUC), the public tracking page and the verify page.
- The simulator: moves with the demo clock, has scenario times fixed to the anchor, and the four scripted alerts are backed by readings.

### 1.3 Owner decisions
- **Kept from earlier:**
  - sign-in is role-first;
  - no Phase switch and no Show hidden;
  - the after-hours event is GR-01 at Al Quoz.
- **Defaults for this upgrade.** Implement these; the owner can override:
  - **Wordmark: "Kasper".** Use fleetx's dozer-blade **icon** shape only if the owner approves; otherwise keep the K mark.
  - **Fuel gets its own nav item**, shown only to users whose visible assets have `fuel.level` (Tier 2/3).
  - **The alert notification-rules panel is shown** with a visible "Prototype — no messages are sent" label (§17: no real WhatsApp, SMS or email).
- **Decided (12 Oct, 19:30):**
  - the wordmark is "Kasper", kept in `src/config/brand.ts`;
  - FB-12 arrives about 30 min after the anchor at a realistic truck speed, and the tracking ETA agrees within ±5 min.

---

## 2. Scorecard: what "9" means (the definition of done)

Score every area at the end of U8 in `reviews/U8-scorecard.md`. Each area needs **all** of its checks for a 9.

| # | Area | Today | Checks for 9 |
| --- | --- | --- | --- |
| A1 | Visual design | 5 | Brand fonts load in production. One token set (§4) and no hard-coded hex in components. Three type levels. Secondary text is AA contrast (≥ 4.5:1). One Badge style. Lucide icons everywhere. Before/after screenshots look like the fleetx reference on every screen. |
| A2 | Information density / hierarchy | 5 | Every customer and console screen opens with a KPI strip (§5.2). No screen needs scrolling to reach its main content at 1440 × 900. Tables are real tables with sticky headers and right-aligned mono numbers. |
| A3 | Fleet map (home) | 6 | Three-pane layout on desktop (§6). One filter bar. Clicking a fleet-list row or marker opens the right panel without navigating. Bottom tabs: Alerts / Event log / Fuel events. Phone: Map / List tabs and a bottom sheet. |
| A4 | Asset page | 5 | Header summary line. 2×2 metric grid. No raw floats. One Power tile. Destructive actions are secondary and confirm. Tabs scroll with a fade on phone. History = playback (§7.3). |
| A5 | Alerts | 6.5 | KPI strip; grouped by severity; "Acknowledge all (filtered)"; asset code links; relative time with exact time on hover; rules panel (prototype); the bell matches the page. |
| A6 | Reports and downloads | 5 | One Reports screen: report cards with cadence badges, then a 3-step run panel, then a "Recently generated" table with re-download that re-checks permission. No phase labels. |
| A7 | Maintenance | 6 | KPI strip. Schedule table (fleetx layout) with remaining and approximate date, plus a Board toggle. Numbers agree with alerts and the asset page (one source). |
| A8 | Fuel (new) | — | Per-asset fuel cards with tank bar, today's use, trend and status; a theft/drop card with the drop shaded; refuel ▲ and drop ▼ markers; ECU / Estimated sources. Only for fleets with `fuel.level`. |
| A9 | Money (Cost & ROI, Billing, Certificates) | 6 | KPI strips. Cost & ROI hero shows only real revenue, cost and margin, with sources. Last-month data varies (§9). Billing opens on the first tab with content. Certificate actions in one cell or a ⋯ menu. |
| A10 | Settings and the Kasper console | 5–5.5 | Dense tables with one primary action and a ⋯ row menu. No self-deactivate. Console Overview with KPIs. Copy buttons on IMEI and SIM. |
| A11 | Phone (390 px) | 6 | Every screen passes the no-sideways-scroll check. The KPI strip scrolls horizontally inside itself. Panels become bottom sheets. Primary actions are full-width. Tap targets are ≥ 40 px. |
| A12 | Arabic / RTL | 6 | All new copy is in `ar.json`; asset types are translated; the three-pane layout mirrors; truncation lands at the logical end; numbers stay LTR. |
| A13 | Data realism and consistency | 6 | No two screens disagree on the same number (unit test, §9). No raw floats anywhere (e2e check). Last month varies. FB-12 decision applied. |
| A14 | Workflows | 7 | Each §11 usability task is done in ≤ the target clicks and time in a scripted run. |
| A15 | Testability | 7 | Usability kit, "Start session as …", "Report a problem", visual-regression snapshots and axe checks (§11). |
| A16 | Rules, roles, privacy | 9 | Unchanged. All existing access tests still pass, and the new panels and strips are role-scoped (tests for Mark, Lina, Deepa and Fatima). |

---

## 3. Using fleetx (clone → copy → remove)

fleetx is the owner's older single-file dashboard: `https://github.com/afsalali1238/fleetx`. Its `index.html` is about 3,400 lines of HTML, CSS and JS.

### 3.1 Clone it outside the repo
```bash
git clone --depth 1 https://github.com/afsalali1238/fleetx.git /tmp/fleetx-ref
cd /tmp/fleetx-ref && python3 -m http.server 8090   # open http://localhost:8090/index.html
```
- It loads Supabase from a CDN and logs `supabase is not defined` in the sandbox. That's harmless.
- Switch screens with `showScreen('map'|'fuel'|'maint'|'geo'|'util'|'roi'|'reports'|'history'|'alerts'|'client'|'timesheet')`.
- Ctrl+K opens the palette; Ctrl+Shift+D opens the demo panel.
- Capture each screen at 1440 px into `reviews/fleetx-reference/<screen>-1440.png`. These are the **only** fleetx files committed, as the visual target. They're deleted in U8.

### 3.2 What to copy (as values and patterns, re-implemented in React and Tailwind)
| fleetx source (`index.html`) | Take | Becomes in Kasper |
| --- | --- | --- |
| `:root` tokens (about lines 15–30) | every colour, the 9% tints (`--green-d` …), `--shadow`, `--shadow-md` | `app/globals.css` `@theme` tokens (§4) |
| Fonts link (Space Mono, Space Grotesk, Hanken Grotesk) | the weights used | `next/font/google` in `app/layout.tsx` |
| `.sc` / `.stats-bar` (line 101 and the `stats-bar` blocks) | padding, divider, eyebrow and value styles | `KpiStrip` / `KpiCell` |
| `.d-header`, `.metrics-2`, `.d-section` (138–160), `renderDetail` (1736) | detail panel structure | `AssetPanel` (right pane) and the asset page header |
| `.tbl` (206–209) | sticky uppercase mono header, 11–12 px rows, hover tint | `Table` component |
| `.badge` (211) and status classes | one badge shape: mono 8.5–10 px, radius 3 | `Badge` / `StatusBadge` |
| `.alert-item` (219) | left-border severity row, icon, time on the right | `AlertRow` |
| `.theft-panel` (244–246), the fuel screen (585+), `renderFuelCards` (1937) | fuel card layout, shaded drop window | `FuelCard`, `FuelDropCard` |
| `renderMaintScreen` (1979) | KPI strip, then summary cards, then the schedule table | Maintenance page |
| `renderHistory` (2530) | trip list + route with coloured segments + scrubber + timeline | History tab / `PlaybackView` |
| Reports screen (794+) `.rep-card` | card with icon, name, one line, cadence tag, then the "Recently generated" table | Reports page |
| Alerts screen (2612+) `.al-rule-row` | rules panel layout | `AlertRulesPanel` (prototype) |
| `renderClient` (2645) | phone-frame preview beside the link actions | the Share tracking link dialog |
| `openCmdK` (2518) and the command list (about 2760) | grouped results (Assets, then Actions), footer key hints, Esc chip | extend `src/components/layout/SearchCommand.tsx` |
| `.logo-mark` SVG (line 34, the manifest icon) | only if the owner approves the dozer-blade mark | `src/components/brand/Mark.tsx` |

### 3.3 Don't copy
- Any number or claim: "AED 18,420 savings", "19.2× ROI", "AED 210K+", "Breakdowns prevented".
- Asset IDs like `KSP-00x`, the vendor names, and the static mock data.
- The single-file structure, the inline SVG UAE map (Kasper keeps Leaflet), global mutable state and `onclick` attributes.
- The crowded top bar (11 nav items, More ▾, Sim 30m, Add Asset). Kasper keeps its left nav.
- Emoji icons. Use Lucide.
- The Timesheet screen (out of scope, §17).
- The "dozr" wordmark (§1.3).

### 3.4 Remove when done (end of U8)
```bash
rm -rf /tmp/fleetx-ref
git rm -r reviews/fleetx-reference
grep -rniE "dozr|KSP-0|fleetx" app src tests public || echo clean   # must print "clean"
```
Record the grep output in `reviews/U8-self-check.md`.

---

## 4. Design system (U1)

**Fonts** (`app/layout.tsx`). The current `@import url(fonts.googleapis…)` in `globals.css` is **dropped by the build**: no built CSS contains it, so production renders system fonts. Replace it:
```ts
import { Hanken_Grotesk, Space_Grotesk, Space_Mono } from 'next/font/google';
const body = Hanken_Grotesk({ subsets: ['latin'], weight: ['400','500','600','700'], variable: '--font-body' });
const heading = Space_Grotesk({ subsets: ['latin'], weight: ['500','600','700'], variable: '--font-heading' });
const mono = Space_Mono({ subsets: ['latin'], weight: ['400','700'], variable: '--font-mono' });
// <html className={`${body.variable} ${heading.variable} ${mono.variable}`}>
```
Add an Arabic face for `[dir=rtl]`, e.g. IBM Plex Sans Arabic, through `next/font`. Add an e2e check that `document.fonts.check('12px "Space Mono"')` is true on `/app`.

**Tokens** (`@theme` in `globals.css`; replace any duplicates):
| Token | Value | Use |
| --- | --- | --- |
| bg / canvas | `#F6F6F3` | page background |
| surface | `#FFFFFF` | panels and cards |
| line / line-2 | `#E8E8E3` / `#D8D8D2` | borders, dividers |
| ink | `#141518` | primary text |
| slate | `#5B5F66` | **secondary text** (replaces today's light grey) |
| muted | `#9A9CA1` | eyebrow labels only, never body copy |
| accent | `#FFC400` | the one primary action per view, the active nav item, focus ring |
| ok | `#1F9A6D` (+ `ok-tint` 9%) | Live, OK, positive |
| warn | `#E6AF00` (+ tint) | Idle, due soon |
| bad | `#D64545` (+ tint) | Offline, overdue, critical |
| info | `#3D6E96` (+ tint) | informational, zones |
| zone-2 | `#6E6398` | second zone colour only |
| shadow / shadow-md | from fleetx | panels / popovers |

**Type scale:**
- page title: Space Grotesk 22/28 semibold;
- section title: 15/20 semibold;
- body: Hanken 14/20;
- eyebrow: Space Mono 10 px, uppercase, letter-spacing 1 px, muted;
- data value: Space Mono 22–28 for KPIs, 13 in tables;
- IDs, times and codes: always Space Mono.

**Components** (`src/components/ui`, each with a unit or story test):
- `KpiStrip`, `KpiCell(label, value, tone, context, source?)`;
- `MetricTile` (for the 2×2 grids);
- `Badge` (one shape; tones ok / warn / bad / info / neutral / accent);
- `StatusDot`;
- `Table` (sticky header, numeric alignment, row hover, optional ⋯ `RowMenu`);
- `RowMenu`;
- `Panel` (header + body, used everywhere instead of ad-hoc cards);
- `SideSheet` (desktop right panel) and `BottomSheet` (phone);
- `SegmentedTabs`;
- `ProgressBar` (tank and utilisation);
- `Sparkline`;
- `EmptyState`;
- `ConfirmDialog` (destructive actions);
- `CopyButton`.

**Icons:** add `lucide-react` and replace every hand-drawn nav SVG. Today Alerts and Maintenance are both triangles. The mapping: Map → `Map`, Alerts → `Bell`, Reports → `FileBarChart`, Fuel → `Fuel`, Geofences → `Hexagon`, Certificates → `BadgeCheck`, Billing → `Receipt`, Maintenance → `Wrench`, Cost → `TrendingUp`, Settings → `Settings`.

**Checks (U1):**
- no raw hex left in `src/components` or `app` (grep);
- axe shows no colour-contrast violations on `/app`, `/app/alerts` and `/app/assets/a-ex04`;
- before/after screenshots of every §15 screen.

---

## 5. Shell (U1–U2)

### 5.1 Layout
- **Owner decision (13 Oct): top navigation like fleetx, no left sidebar.**
  - One 56 px top bar holds: the logo + company name, the page tabs, search (⌘K), a LIVE clock pill, the bell and the user menu.
  - Page tabs: Lucide icon + label; the active tab gets an accent underline and tint; the order follows the existing nav rules (role, phase and hardware gating are unchanged).
  - fleetx's bar overflowed at 1440 px, so show at most 6 tabs. Map, Alerts, Reports, Fuel (when shown), Maintenance and Billing come first. The rest (Geofences, Certificates, Cost & ROI, Downloads, Schedules) go under **"More ▾"**, a dropdown with the same gating. Settings sits in the user menu.
  - Below 1024 px the tabs collapse into "Menu ▾". On phones, keep the existing menu sheet, opened from the bar.
  - The Kasper console gets the same top bar with its own tabs (Overview, Tenants, Assets, Trackers, CAN adapters, Bookings, then More ▾).
  - Remove the left sidebar from `AppShell` and the console layout. Pages get the full width.
- **Header:** company name; the search field showing a ⌘K hint; a LIVE pill showing the demo clock time (fleetx style; clicking it opens the demo clock); the bell; the user menu.
- **Demo bar:** keep it, restyled with the tokens. Tools gains **Trigger alert ▸** (offline, power cut, fuel drop, fault, over-speed). Each one writes a real reading or alert through the simulator API, so screens update. This mirrors fleetx's demo panel.

### 5.2 KPI strip on every screen (role-scoped, honest)
| Screen | Cells |
| --- | --- |
| Map | Live · Idle · Offline (one cell, coloured counts) · Engine hours today (ECU / Estimated) · Fuel used today (T2/3 only) · Open alerts (critical / warning) · Rentals ending today |
| Alerts | New today · Critical · Warning · Acknowledged today |
| Fuel | Fuel used today · Avg L/h (working) · Drops (24 h) · Refuels today · Below 25% |
| Maintenance | Overdue · Due this week · OK · Logged this month · Cost this month |
| Reports | Generated this month · Next scheduled · Formats |
| Cost & ROI | Revenue · Cost · Margin · Utilisation (period) |
| Billing | Issued · Overdue · Paid this month · GPS subscription |
| Certificates | Sealed · Voided · Hours certified (period) |
| Console overview | Tenants · Trackers in stock · Faulty · Open requests · Overdue invoices |

Rules for the strip:
- Each cell is clickable and applies the matching filter.
- Hide cells the user's hardware or role can't produce (no fuel cell for Omar).
- On phones the strip scrolls sideways inside itself.

---

## 6. Fleet map: three-pane (U2)

**Desktop (≥ 1280 px):**
- **Left rail (280 px):** search, then the fleet list, then Sites.
  - A fleet row shows: status dot; asset name (Space Grotesk 13); `CODE · class` (mono 10); a right-aligned mini bar for fuel % (T2/3) or today's utilisation (T1); and a Rented badge if rented.
  - Selected rows are tinted with accent-tint and an accent left border.
  - Sites lists a name and count; clicking one filters the list.
- **Centre:** Leaflet map with a **muted base style**, e.g. CARTO Positron. Status-coloured markers with the code label. The selected marker is ringed in accent. Clusters stay. A legend chip row sits bottom-left (Live / Idle / Offline / Zones). Zoom controls sit top-right.
- **Right panel (360 px, `SideSheet`)** opens on a row or marker click. The URL gets `?asset=<id>`.
  - **Header:** `CODE · tracker model hidden for customers · rental line`, the name, `site · owner/renter`, and status chips (Live, Ignition on, Maintenance due, Rented).
  - **2×2 metrics:** engine hours (source), RPM or speed, fuel rate or level, load. Tier 1 shows speed, ignition, today's distance and last update instead.
  - **Fuel:** a tank bar (L remaining / capacity) plus a 7-day bar sparkline (T2/3).
  - **Health:** coolant, voltage, DTCs, satellites, last ping, each with ✓ or a warning.
  - **Maintenance:** next due and remaining.
  - **Actions:** Open asset page (primary), Share link, Run report. The destructive "End access" lives only on the asset page.
- **Bottom tabs (collapsible, 260 px):** Active alerts (severity rows) | Event log (table: time, asset, event, status) | Fuel events (T2/3).
- **One filter bar** above the map: Status ▾, Site ▾, Type ▾, Tier ▾ (only if mixed), Labels ▾, Owned/Rented (only if the user has both). Active filters show as removable chips. The current four rows go away.

**1024–1279 px:** the rail collapses to icons plus a list popover; the right panel overlays the map.

**Phone:** Map | List tabs (keep). Tapping an asset opens a `BottomSheet` with the same panel content. The bottom tabs move to Alerts in the nav.

**Tests:**
- clicking a fleet row opens the panel with the right asset and updates the URL; Esc closes it;
- role scoping: Lina's rail shows her own and rented assets only; Mark's shows his site only;
- Omar gets no fuel UI;
- 1440 × 900: the first fleet row and the map are visible without scrolling;
- 390 px: no sideways scroll; the bottom sheet opens.

---

## 7. Asset page (U3)

### 7.1 Header
- **Line 1:** `CODE` (mono) + name (Space Grotesk 22) + status chip + tier chip + Rented chip.
- **Line 2:** `make model · year · plate`.
- **Line 3:** `site (viewer's site) · owner/renter · Inside: <geofence> | Outside all geofences`.
- **Line 4:** `Last updated 09:59 (now)`, with device and received times in a tooltip.
- **Actions:** primary = Share tracking link (owners) or Run report (renters); secondary = Edit and Run report; **End access now** is an outlined danger button that opens `ConfirmDialog` with the existing reason rules.

### 7.2 Overview
- A 2×2 `MetricTile` grid beside a shorter map (desktop: map 60%, tiles 40%; phone: stacked).
- Speed is rounded (`Math.round`), never raw. Add an e2e check that no visible text matches `/\d+\.\d{4,}/`.
- **One Power tile:** vehicle voltage, with "Tracker battery 4.0 V" as the sub-line. Remove the separate Battery tile.
- Today's distance and ignition-on time keep their source labels.
- Tabs (`SegmentedTabs`) scroll sideways on phones with an edge fade.

### 7.3 History = playback (fleetx layout)
- **Left:** date picker + trip list (`Trip 1 · 06:42 → 09:15 · 61 km` with a from→to tag).
- **Right:** the Leaflet route with segments coloured by event (over-speed red, idle amber), event pins (over-speed, harsh, towing, power cut, refuel, fuel drop, geofence enter/exit), and a scrubber with event ticks, play/pause and 1× / 4× / 16× speed.
- **Under it:** a timeline list (`07:38 Stopped 22 min · Al Quoz`). Clicking a line seeks to it.
- Renters are clipped to their rental window; the "History starts …" line stays.
- This closes the P12 gap: the harsh, towing, power-cut and refuel pins are still missing today.

### 7.4 Engine & fuel
- Keep the current content.
- Add a fleetx-style tank bar at the top and a **fuel drop card** when a drop is in range: the shaded window, −L, engine off, a link to the alert.

**Tests:**
- no raw floats;
- one Power tile;
- the End access confirm flow;
- playback pins exist for all 7 event types on their scripted assets (TP-21 harsh, LB-05 towing, TP-23 and EX-11 power cut, GN-01 drop and refuel, WT-07 and FB-12 over-speed, WL-06 geofence).

---

## 8. Work screens (U4–U5)

**Alerts (`/app/alerts`):**
- KPI strip.
- Filter bar: Status (Open / Acknowledged / All), Type ▾, Site ▾ (the viewer's sites).
- **Grouped by severity:** Critical (offline, power cut, fuel drop, fault), then Warning, then Info. Each `AlertRow` has a left severity border, a Lucide icon, the asset code as a link, the text, a relative time with the exact time on hover, the site, and Acknowledge.
- "Acknowledge all (n)" acts on the filtered open alerts the user may acknowledge, with a confirm and an audit entry per alert.
- Right column (desktop): `AlertRulesPanel` with a type → Instant / Daily digest / In-app only selector, labelled "Prototype — no messages are sent". It's saved per tenant in the db and visible only to Tenant Admins.
- Tests: grouping order; bulk acknowledge only touches allowed alerts; the bell matches the page.

**Fuel (`/app/fuel`, new):**
- Nav item shown only when `anyAssetHasFeature(session,'fuel.level')`.
- KPI strip, then a grid of `FuelCard` (code, name, site; level % with a tank bar and L/capacity; today L; rate; status; 30-reading trend) and a `FuelDropCard` per drop in range.
- Uses the existing fuel model (`src/server/telemetry/fuel.ts`) through `api.ts`.
- Renter scoping applies.
- Tests: Omar gets "Page not found"; Khalid sees GN-01's 02:10 drop; Fatima sees only her rented T3 assets.

**Maintenance:**
- KPI strip, then four summary cards (Overdue, Due soon, OK, Completed this month).
- **Schedule table** (default): asset, type, service item, last/due, current, remaining (h / km / days, plus an approximate date from average daily use), status badge, and an action (Log service / Book).
- The Board toggle keeps today's columns.
- The service history table stays.
- **One source of truth:** maintenance alert text and the asset page are derived from `planSnapshot`. The "80 h vs 95 h" mismatch must be impossible (test).

**Reports (merge Downloads into it):**
- Top: report cards (icon, name, one line, cadence badge: "On demand", or "Weekly · scheduled" when a schedule exists).
- Clicking a card opens the **run panel**: scope (single / site / label / all), date range presets, format, then **Run**. It's one panel, not a scroll past six cards.
- Bottom: **Recently generated** (report, period, assets, generated, format, download). Re-download re-checks permission (existing rule).
- Schedules stay a tab.
- Remove the "Day one / Phase 2" labels.
- `/app/downloads` redirects to `/app/reports#recent`, so existing links keep working.

**Cost & ROI:**
- KPI strip; a hero with period revenue, cost, margin and margin % (honest, with sources); per-asset horizontal cost bars (fuel / idle / maintenance / fixed / operator stacked); the existing detailed table under a "Details" disclosure.
- No savings or ROI-multiple claims.

**Billing:** KPI strip. Opens on the first tab with content (Issued for owners with invoices). Invoice table with status badges and a ⋯ menu (Record payment, Download PDF).

**Certificates:** KPI strip; table with one Actions cell (View primary, then ⋯ Void / Reissue / Verify link); no duplicate "Voided" text.

**Settings:**
- Tables use `Table` + `RowMenu` (Edit, Resend invite, Deactivate / Reactivate behind a confirm).
- **You can't deactivate yourself** (hidden on your own row, and refused by the API, with a test).
- Tab counts ("Users 2").

**Console:**
- New **Overview** (KPI strip + "Needs action": open requests, faulty adapters, overdue invoices, links expiring today).
- Assets, Trackers and CAN adapters become dense tables: the row click opens details; one primary action; the rest in ⋯.
- `CopyButton` on IMEI and SIM.
- Filters stay.

**Share tracking link dialog (owner):**
- fleetx client layout: the phone-frame live preview of `/t/<token>` (asset name, map thumbnail, ETA line), plus Copy link, QR code (`qrcode` package, already used for the MUC) and expiry.
- Active-link KPIs on the asset's Links section.

---

## 9. Data realism and consistency (U5)

1. **Last month varies.** The cost, utilisation and MUC inputs for the previous calendar month must vary per asset. Fuel from the J2 fuel model (no repeated 6,588 L); utilisation from the readings (no flat 90%); revenue from the 3 past bookings plus the current bookings' days in that month. Add a unit test that no two assets share identical fuel, idle and utilisation for the month.
2. **One number, one source.** Add `src/server/consistency.test.ts`, which checks that the same quantity agrees everywhere it appears:
   - maintenance remaining: alert text vs plan vs asset page;
   - engine hours: asset page vs maintenance card vs MUC;
   - fleet engine hours today vs the sum of the per-asset values;
   - fuel level: map row vs asset page vs Fuel screen;
   - GN-01 "engine hours today" > 0 while it's working.
3. **Formatting.** One `formatNumber`, `formatHours`, `formatKm`, `formatAed` and `formatPct` in a new `src/lib/format.ts`, used everywhere. Add an e2e check for no raw floats on the main screens.
4. **FB-12:** apply the owner's choice from §1.3.

---

## 10. Phone and Arabic (U6)

- Every screen at 390 × 844:
  - no sideways scroll (extend `phone-layout.spec.ts` to every route);
  - KPI strip scrolls sideways;
  - tables become stacked cards, or scroll inside their panel with a sticky first column;
  - side panels become `BottomSheet`;
  - primary actions are full-width;
  - tap targets ≥ 40 px.
- RTL:
  - mirror the three-pane layout (rail on the right);
  - icons that imply direction flip;
  - numbers, IDs and times stay LTR (`dir="ltr"` spans);
  - truncation lands at the logical end;
  - add `ar.json` keys for all new copy, including asset type names (Truck, Light Vehicle, Excavator …) and the Fuel and Rules copy;
  - keep the file marked "Draft — needs native review".

---

## 11. Ready for testing (U7)

1. **Usability kit (`reviews/usability/`):** one script per role, five tasks each. Each task has a start state, a success criterion, a click target and a time target. Run each script yourself with Playwright (the `usability.spec.ts` paths) and record clicks and time in the self-check.

| Role (user) | Tasks |
| --- | --- |
| Owner (Khalid) | Find which machine had a fuel drop and when (≤ 3 clicks) · share FB-12's tracking link (≤ 4) · end Palm's access to EX-11 with a reason (≤ 5) · see what's overdue in maintenance (≤ 2) · issue September's certificate for EX-04 (≤ 4) |
| Renter (Lina) | See only what she rents and owns · open EX-04's history and confirm it starts at the rental · run and download last week's trip report · find the arrival time of nothing she doesn't own · switch to Arabic and back |
| Site User (Mark) | Find his site's alerts · confirm he can't edit or deactivate anything · open a machine's engine data · run a report for his site · use search (⌘K) to jump to an asset |
| Kasper Ops (Ravi) | Pair a tracker to MW-01 · find the faulty CAN adapter · move a tracker between tenants · open a tenant's assets · confirm Billing is hidden |
| Customer (tracking link) | Open the link on a phone · read the arrival time · confirm nothing else is visible · see "no longer active" after the link is revoked |

2. **Start session as …** (Tools): resets demo data, sets the clock to the anchor, signs in the chosen role and lands on its home. One click per tester.
3. **Report a problem** (demo bar): a small form saving route, user, demo clock, viewport and a note to the local db, with a Tools → "Feedback (n)" list and CSV export.
4. **Visual regression:** Playwright `toHaveScreenshot` on 16 key screens × 2 widths, with tiles stubbed and animations off. Baselines live in `tests/e2e/__screenshots__`. Any intended change updates the baseline in the same PR, with before/after in the self-check.
5. **Accessibility:** add `@axe-core/playwright`. No serious or critical violations on 10 main screens. Keyboard: the nav, ⌘K, the side panel (Esc closes it) and dialogs trap focus.
6. **Performance:** `/app` reaches interactive in < 2.5 s on the CI runner (Playwright trace). No `renderMarkers`-style re-renders inside loops: memoise the fleet list and markers.

---

## 12. Steps and order

| Step | Contents | Exit criteria |
| --- | --- | --- |
| **U0** | Bug fixes: raw speed float; maintenance 80 vs 95 h; BD-02 hours; GN-01 0.0 h; Billing default tab; self-deactivate; phase labels in Reports; duplicate battery tile; certificate actions row; regenerate the stale `reviews/screenshots/P14` (44 of 46 are stale) | each fix has a test; the screenshots are fresh |
| **U1** | Clone fleetx (§3.1); fonts, tokens, type scale, components, icons (§4); restyle the shell and demo bar | the §4 checks; A1 ≥ 8 |
| **U2** | Fleet map three-pane, filter bar, KPI strip, bottom tabs, phone sheet (§5–6) | the §6 tests; A3 ≥ 9 |
| **U3** | Asset page header, overview, playback, Engine & fuel drop card (§7) | the §7 tests; A4 ≥ 9 |
| **U4** | Alerts, Fuel, Maintenance, Reports+Downloads (§8) | A5–A8 ≥ 9 |
| **U5** | Cost & ROI, Billing, Certificates, Settings, Console, Share dialog; data realism and consistency (§8–9) | A9, A10, A13 ≥ 9 |
| **U6** | Phone and Arabic pass (§10) | A11, A12 ≥ 9 |
| **U7** | Testing kit, feedback, visual regression, axe, performance (§11) | A14, A15 ≥ 9 |
| **U8** | Full run; scorecard (`reviews/U8-scorecard.md`) with evidence per row; remove fleetx (§3.4); rewrite `HANDOFF.md` | every row ≥ 9; CI green on `main`; the grep prints `clean` |

About 11 working days. U0 and U1 give the biggest visible jump; ship them first.

## Out of scope (`BUILD_PROMPT.md` §17)
- Real trackers or backend.
- Real email, WhatsApp or SMS (the rules panel is a prototype).
- Payment gateways; accounting export.
- Timesheets.
- Route-based ETA.
- Arabic beyond a first draft.
