# B1 self-check: fonts, tokens, type scale, brand, colours

| Check | Result |
|---|---|
| Fonts self-hosted (@fontsource), no Google Fonts request | Done (the sandbox and CI can't reach Google Fonts, and the production build dropped the @import) |
| `tests/e2e/fonts.spec.ts`: Space Mono, Hanken Grotesk and Space Grotesk load; body uses Hanken Grotesk | Pass (desktop + phone) |
| Secondary text `--grey-500` #6B6F76 on paper is AA (4.9:1); the old #9A9CA1 moves to `--muted` for non-text decoration only | Done |
| New tokens: ok/warn/bad/info tints, zone-2, line-2, shadows; mapped in @theme | Done |
| Type scale utilities: text-title, text-section, text-eyebrow, text-data, text-data-sm | Done (used from B2 on) |
| `src/config/brand.ts` (PRODUCT_NAME = "Kasper") feeds the page title | Done |
| `src/config/colors.ts` for map/chart code, with a unit test pinning it to the CSS tokens | 16 tests pass |
| Typecheck, lint | Pass |
| Unit tests, TZ=UTC and TZ=Asia/Dubai | 917/917 each |
| e2e: demo-shell, nav widths, phone layout, fonts | Pass |
| No test assertion weakened or removed | Confirmed. One comment in brand.ts tripped the brand-words rule, so I reworded the comment and left the test unchanged |

Also in this branch: the owner decision on **top navigation like fleetx, no left sidebar**, recorded in the handoffs (built in B3).
