# B3 (part 1) self-check: top navigation like fleetx, no left sidebar

Owner decision, 13 Oct 00:36: "I want the different pages or menu on top like fleetx, not a left sidebar."

| Check | Result |
|---|---|
| Left sidebar removed (app and console). Pages get the full width | Done |
| `TopTabs`: icon + label tabs, an accent underline and tint when active, `aria-current="page"` | Done |
| Overflow: 4 tabs from 1024 px, 6 from 1280 px, 7 from 1600 px, the rest under "More ▾". Pure CSS, so nothing jumps on load | Done |
| The bar fits at 1024, 1280, 1440, 1536, 1600, 1760 and 1920 px (app and console; the test checks the header and the tab column) | New test passes |
| Nav gating unchanged (`navItemAllowed`, `routeGate`); priority order is Map, Alerts, Reports, Maintenance, Billing, Geofences, Certificates, Cost & ROI, Downloads | Unit tests 917/917 |
| Settings: a gear in the bar, company admins only | AppShell unit test passes |
| Under 1024 px the existing "Open menu" sheet is kept. The console shows a "Menu" from 900–1023 px | j5 and phone-layout pass |
| Asset pages highlight the Map tab | Done |
| Lucide icons in the app and console nav and in the header (bell, settings, user menu, search, menu) | Done |
| Logo SVG uses tokens (`fill-ink`, `fill-yellow`), not raw hex. "K" centred, so it doesn't clip in RTL | Done |
| **Root-cause fix:** the Arabic `.font-mono` rule sat outside the CSS layers, so its `display: inline-block` overrode `hidden` and `flex` on every mono element in Arabic. It now lives in `@layer base` | Regression test: the LIVE pill stays hidden at 1440 px in Arabic |
| Arabic strings: shell.pages, shell.more, shell.live, shell.search | Added |
| Tests: locators updated only. Every negative "no link" check now opens More first, so it can't pass trivially | demo-shell, f3, S17, maintenance-cost, j5 |
| J6 proof screenshots regenerated (they now show the top bar) | Updated |

Screenshots checked: app at 1024, 1280 and 1440 px, the More menu open, the console at 1600 px, Arabic at 1440 px, phone.

Left for B3 part 2: the demo-bar restyle, removing the remaining raw hex in screens, and the LIVE pill opening the clock.
