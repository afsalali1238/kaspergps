# Agent B: design system (Wave 1). Wave 2 depends on this.

**Branch:** `agent-b-design-system` · **Spec:** `UI-UPGRADE.md` §3.1–3.3, §4, §5.1 · **Arabic namespace:** `ui`, `shell`

## Scope
1. **fleetx reference.**
   - Clone `https://github.com/afsalali1238/fleetx` to `/tmp/fleetx-ref` (outside the repo).
   - Serve it and capture each of its 11 screens at 1440 px into `reviews/fleetx-reference/`.
   - Copy only the values and patterns in §3.2. Never copy code, numbers or mock data (§3.3).
2. **Fonts.**
   - The `@import url(fonts.googleapis…)` in `app/globals.css` is dropped by the production build, so production shows system fonts.
   - Load Hanken Grotesk, Space Grotesk and Space Mono with `next/font/google` in `app/layout.tsx` as `--font-body`, `--font-heading` and `--font-mono`. Add an Arabic face for `[dir=rtl]`.
   - e2e: `document.fonts.check('12px "Space Mono"')` is true on `/app`.
3. **Tokens** (§4 table) in the `@theme` block of `app/globals.css`.
   - Secondary text moves to slate `#5B5F66`.
   - Replace hard-coded hex in `src/components/**` and `app/**`. Exception: the colours of map markers and pins that Leaflet needs as strings, which go in one `src/config/colors.ts` file that reads the same values.
4. **Type scale** (§4): utility classes `text-title`, `text-section`, `text-eyebrow`, `text-data`.
5. **Components** in `src/components/ui`. Each has a unit test and a short usage note at the top of its file:
   - `KpiStrip` and `KpiCell` (label, value, tone, context, source, onClick);
   - `MetricTile`;
   - `Badge`, with one shape and tones ok / warn / bad / info / neutral / accent;
   - `StatusDot`;
   - `Table` (sticky header, numeric alignment, hover, optional `RowMenu`);
   - `RowMenu`;
   - `Panel`;
   - `SideSheet` and `BottomSheet` (focus trap, Esc closes);
   - `SegmentedTabs` (scrolls sideways with an edge fade);
   - `ProgressBar`;
   - `Sparkline`;
   - `EmptyState`;
   - `ConfirmDialog`;
   - `CopyButton`.
   Keep the existing exports working, so screens that aren't redesigned yet still compile.
6. **Icons.** Add `lucide-react` and replace the nav SVGs in `AppShell` using the §4 mapping. Alerts and Maintenance are currently the same triangle.
7. **Shell: top navigation, no left sidebar** (owner decision, 13 Oct; spec `UI-UPGRADE.md` §5.1).
   - One top bar: logo + company, up to 6 page tabs (icon + label, accent underline when active), "More ▾" for the rest, ⌘K search, LIVE clock pill, bell, and user menu (Settings lives there).
   - The same for the console layout.
   - Remove the left sidebar. Keep every nav gating rule and test (update locators only).
   - Below 1024 px: "Menu ▾". Phones: the existing menu sheet.
   - Demo bar: **restyle only**. Agent J adds its new tools in Wave 3.
8. **Brand.** `src/config/brand.ts` exports `PRODUCT_NAME = 'Kasper'`, and the wordmark reads from it.

## Rules
- Don't redesign any page. Wave 2 does that. Existing pages must still render; they may simply look better from the tokens and fonts.
- Don't commit fleetx code. Only the PNGs in `reviews/fleetx-reference/`.

## Done when
- No raw hex in `src/components/**` or `app/**`, apart from `src/config/colors.ts` (grep output in the self-check).
- axe shows no colour-contrast violations on `/app`, `/app/alerts` and `/app/assets/a-ex04`. Agent D adds axe; until then, run `@axe-core/playwright` locally and paste the output.
- Before/after screenshots of the sign-in page, `/app`, and one asset page at 1440 and 390 px. CI is green.
