# Progress: parallel UI build

One line per step, with its status, PR, merge commit and date. Hourly runs and the supervisor keep this file up to date; the night log is GitHub issue #30.

| Step | Status | PR | Merge commit | Date |
| --- | --- | --- | --- | --- |
| A — bug fixes | merged (branch `arena/21299846-kaspergps`; P14 screenshots added in review) | #29 | see `git log --grep "#29"` | 2026-10-13 |
| B — design system | **merged**: B1 (fonts, tokens, type scale, brand, colours), B2 (UI kit, `reviews/b2-self-check.md`), B3 (top navigation, demo bar restyle, no raw hex, LIVE pill opens the clock, AA contrast; `reviews/b3-self-check.md`) | B1: #32 · B2: #34 · B3: #33 | see `git log --grep "#33"` | 2026-10-13 |
| C — data and simulator | C1 **merged** (FB-12 arrives 10:30 with ETA ±5 min, plant shuffles at walking pace, `PIN_TRIP_MAX` 20; `reviews/C1-self-check.md`); C2 not started | C1: #35 | see `git log --grep "#35"` | 2026-10-13 |
| D — test tooling | not started | | | |
| E — fleet map | not started | | | |
| F — asset page | not started | | | |
| G — alerts, fuel, maintenance | not started | | | |
| H — reports and money | not started | | | |
| I — console | not started | | | |
| J — phone, Arabic, final | not started | | | |

Next: **C2** (last month varies, `consistency.test.ts`, `src/lib/format.ts`), then D. Wave 2 (E–I) may start: B1–B3 are merged.

## Notes for the next steps
- **C1 → everyone:** plant shuffles now read 2 km/h "Stationary, ignition on" (not trips); plant trams once a shift at 5 km/h. FB-12 arrives at 10:30 (anchor +30 min); the tracking link's "Arrived" time is the real arrival. Demo jumps that relied on FB-12 being en route after +30 min need a shorter jump.
- **Colours (B3):** no raw hex in `src/components/**` or `app/**`; `src/config/colors.test.ts` fails on any. Leaflet/chart strings come from `src/config/colors.ts` (`MAP_STATUS_COLORS`, `geofenceColor()`, `PLAYBACK_*_COLORS`). Words on tints or white use `text-ok-ink` / `text-bad-ink` / `text-warn-ink`, not `text-live` / `text-red`.
- **I:** console Overview "Manage →" links are yellow on white (≈1.6:1): fix with the console redesign.
- **F2:** map `PLAYBACK_EVENT_COLORS` / `PLAYBACK_STATE_COLORS` onto the status tokens.
- **D:** exclude `app/**` from the unit-coverage denominator (`vitest.config.ts`), so Wave 2 can render screens in unit tests without failing the 85% floor (Agent A request #1).
- **H:** put Settings Deactivate/Reactivate behind `ConfirmDialog` (today one click acts). Fix `reports.none_available` ("for the current phase") and the "Voided" duplicated in the certificate detail modal (needs a `voided_at` key). Keep `billingTabs()` and `aria-current`.
- **B:** restyle the certificate Actions cell with tokens.
- **B2 → Wave 2:** use `KpiStrip`/`KpiCell`, `Table` (`numeric`, `rowMenu`), `RowMenu`, `ConfirmDialog`, `SideSheet`/`BottomSheet`, `SegmentedTabs`, `ProgressBar`, `Sparkline`, `CopyButton`, `MetricTile`, `Panel title=…` from `@/components/ui`; pass `null` for an unmeasured value (it reads "Not measured"). Text on tints uses the `*-ink` tokens (`text-ok-ink` …), not the base status colours.
- **B3 (owner, 13 Oct):** pages in a top bar like fleetx, no left sidebar (`UI-UPGRADE.md` §5.1). Max 6 tabs + "More ▾"; Settings in the user menu; phones keep the menu sheet; console gets the same bar.
