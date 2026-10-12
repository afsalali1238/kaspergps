# Progress: parallel UI build

One line per step, with its status, PR, merge commit and date. Hourly runs and the supervisor keep this file up to date; the night log is GitHub issue #30.

| Step | Status | PR | Merge commit | Date |
| --- | --- | --- | --- | --- |
| A — bug fixes | merged (branch `arena/21299846-kaspergps`; P14 screenshots added in review) | #29 | see `git log --grep "#29"` | 2026-10-13 |
| B — design system | B1 in review (fonts, tokens, type scale, brand, colours); B2 next; B3 = top navigation like fleetx | B1: see issue #30 | | 2026-10-13 |
| C — data and simulator | not started | | | |
| D — test tooling | not started | | | |
| E — fleet map | not started | | | |
| F — asset page | not started | | | |
| G — alerts, fuel, maintenance | not started | | | |
| H — reports and money | not started | | | |
| I — console | not started | | | |
| J — phone, Arabic, final | not started | | | |

Next: **B1 merge, then B2** (components), then B3 (top nav, no left sidebar)

## Notes for the next steps
- **D:** exclude `app/**` from the unit-coverage denominator (`vitest.config.ts`), so Wave 2 can render screens in unit tests without failing the 85% floor (Agent A request #1).
- **H:** put Settings Deactivate/Reactivate behind `ConfirmDialog` (today one click acts). Fix `reports.none_available` ("for the current phase") and the "Voided" duplicated in the certificate detail modal (needs a `voided_at` key). Keep `billingTabs()` and `aria-current`.
- **B:** restyle the certificate Actions cell with tokens.
- **B3 (owner, 13 Oct):** pages in a top bar like fleetx, no left sidebar (`UI-UPGRADE.md` §5.1). Max 6 tabs + "More ▾"; Settings in the user menu; phones keep the menu sheet; console gets the same bar.
