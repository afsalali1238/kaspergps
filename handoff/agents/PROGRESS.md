# Progress: parallel UI build

One line per step, with its status, PR, merge commit and date. Hourly runs and the supervisor keep this file up to date; the night log is GitHub issue #30.

| Step | Status | PR | Merge commit | Date |
| --- | --- | --- | --- | --- |
| A — bug fixes | merged (branch `arena/21299846-kaspergps`; P14 screenshots added in review) | #29 | see `git log --grep "#29"` | 2026-10-13 |
| B — design system | **merged**: B1 (fonts, tokens, type scale, brand, colours), B2 (UI kit, `reviews/b2-self-check.md`), B3 (top navigation, demo bar restyle, no raw hex, LIVE pill opens the clock, AA contrast; `reviews/b3-self-check.md`) | B1: #32 · B2: #34 · B3: #33 | see `git log --grep "#33"` | 2026-10-13 |
| C — data and simulator | **merged**: C1 (FB-12 arrives 10:30 with ETA ±5 min, plant shuffles at walking pace, `PIN_TRIP_MAX` 20; `reviews/C1-self-check.md`), C2 (engine hours vary by day, last month varies, booked-days revenue, MUC hours from the ECU meter, `consistency.test.ts`, `src/lib/format.ts`; `reviews/C2-self-check.md`) | C1: #35 · C2: #36 | see `git log --grep "#36"` | 2026-10-13 |
| D — test tooling | **merged** (axe report mode + `reviews/a11y-baseline.md`, no-raw-floats gate, visual spec off unless `VISUAL=1` + report-only CI job, usability kit + `usability.spec.ts`, perf check, `signInAsRole`/`openAsset`/`settle`, coverage excludes `app/**`; `reviews/D-self-check.md`) | #37 | | 2026-10-13 |
| E — fleet map | built, **not pushed**: local `night-e` (`6acc248` + `d21471b`). Needs rebase on D/F1/G1, drop its own `alertSeverity` for G1's, `reviews/E-self-check.md` (see `handoff/REMAINING.md` step 0.3) | — | | 2026-10-13 |
| F — asset page | F1 **merged** (header, 2×2 Overview, End-access confirm; `reviews/F1-self-check.md`). F2 not started (local draft of the History timeline parked) | F1: #38 | | 2026-10-13 |
| G — alerts, fuel, maintenance | G1 (Alerts: severity groups, KPI strip, Acknowledge all, rules panel, DB v2 `alertRules`) **merged** (`reviews/G1-self-check.md`); G2 not started | G1: #39 | | 2026-10-13 |
| H — reports and money | not started (local draft of the H1 Recently generated table parked; fix list in `handoff/REMAINING.md`) | | | |
| I — console | not started | | | |
| J — phone, Arabic, final | not started | | | |

Next: **Step 0 in `handoff/REMAINING.md`** (D, G1 and F1 merged; push and PR E), then F2, G2, H1 → H2, I in parallel; J1 → J2 → J3 last.

## Notes for the next steps
- **D → everyone:** new e2e gates: `a11y.spec.ts` fails on a **new critical** axe violation versus `reviews/a11y-baseline.md` (lower counts there when you fix one, never raise them); `no-raw-floats.spec.ts` fails on any `\d+\.\d{4,}` on 23 main screens. Helpers: `signInAsRole(page, 'owner'|'renter'|'siteUser'|'kasperOps'|'kasperAdmin')`, `openAsset(page, 'a-ex04')`, `settle(page)` (use instead of `networkidle`, which hangs on polling screens). `usability.spec.ts` logs `USABILITY {…}` per task (report-only); keep its paths working when you redesign a screen, or update the path in the same PR.
- **D findings for Wave 2:** G: Alerts filter selects have no accessible name (the one critical axe item). H/A: certificates "Last month" shows May at the October anchor (`lastMonthPeriod()` parses an en-AE date string as M/D) and booking periods always issue for `bookings[0]`, so September can't be certified (usability O5). Shell: Ctrl/⌘+K opens the demo bar's View as, not product search (M5). E/F: no `<h1>` on map and asset pages.
- **G1 → everyone:** DB_VERSION is 2 (`alertRules`); v1 stores migrate in place. The bell now re-renders on alert changes (`useDb(s => s.alerts)` in `AppShell`). Alerts' filter selects have names (D's critical axe finding).
- **C2 → everyone:** engine hours now vary by day (`engineHoursOnDay` in `telemetry/ecu.ts`); anchor meter values unchanged. Format numbers with `src/lib/format.ts` (`formatHours`, `formatAed`, `formatPct` …; null → "Not measured"). A MUC's hours are the ECU meter delta. Cost revenue can carry basis **"Days on hire"** (booked days not invoiced yet). **H:** margin % on a part-month booking can be extreme (EX-11 Sep −2,670.9 %); mixed-decimal utilisation. **J3:** J2/J5 Engine & fuel screenshots will differ (fuel levels vary now).
- **C1 → everyone:** plant shuffles now read 2 km/h "Stationary, ignition on" (not trips); plant trams once a shift at 5 km/h. FB-12 arrives at 10:30 (anchor +30 min); the tracking link's "Arrived" time is the real arrival. Demo jumps that relied on FB-12 being en route after +30 min need a shorter jump.
- **Colours (B3):** no raw hex in `src/components/**` or `app/**`; `src/config/colors.test.ts` fails on any. Leaflet/chart strings come from `src/config/colors.ts` (`MAP_STATUS_COLORS`, `geofenceColor()`, `PLAYBACK_*_COLORS`). Words on tints or white use `text-ok-ink` / `text-bad-ink` / `text-warn-ink`, not `text-live` / `text-red`.
- **I:** console Overview "Manage →" links are yellow on white (≈1.6:1): fix with the console redesign.
- **F2:** map `PLAYBACK_EVENT_COLORS` / `PLAYBACK_STATE_COLORS` onto the status tokens.
- **D:** exclude `app/**` from the unit-coverage denominator (`vitest.config.ts`), so Wave 2 can render screens in unit tests without failing the 85% floor (Agent A request #1).
- **H:** put Settings Deactivate/Reactivate behind `ConfirmDialog` (today one click acts). Fix `reports.none_available` ("for the current phase") and the "Voided" duplicated in the certificate detail modal (needs a `voided_at` key). Keep `billingTabs()` and `aria-current`.
- **B:** restyle the certificate Actions cell with tokens.
- **B2 → Wave 2:** use `KpiStrip`/`KpiCell`, `Table` (`numeric`, `rowMenu`), `RowMenu`, `ConfirmDialog`, `SideSheet`/`BottomSheet`, `SegmentedTabs`, `ProgressBar`, `Sparkline`, `CopyButton`, `MetricTile`, `Panel title=…` from `@/components/ui`; pass `null` for an unmeasured value (it reads "Not measured"). Text on tints uses the `*-ink` tokens (`text-ok-ink` …), not the base status colours.
- **B3 (owner, 13 Oct):** pages in a top bar like fleetx, no left sidebar (`UI-UPGRADE.md` §5.1). Max 6 tabs + "More ▾"; Settings in the user menu; phones keep the menu sheet; console gets the same bar.
