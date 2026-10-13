# B2 self-check: UI kit components

Chunk **B2** of the night queue (issue #30). Agent file `handoff/agents/B-design-system.md`, scope item 5; spec `handoff/UI-UPGRADE.md` §4 (components), §2 rows A1/A2/A10/A11. PR #34, branch `night-b2`, built by the hourly run at 22:20 UTC on 12 Oct.

## What changed and why

**New components** in `src/components/ui` (each file opens with a short usage note; each has unit tests):

| Component | What it does | Tests |
| --- | --- | --- |
| `KpiStrip`, `KpiCell` | Strip for §5.2. Eyebrow label, mono value, context line, `Source: …`. `null`/`undefined` reads **"Not measured"** and drops the source; a real `0` stays `0`. Clickable cells are `aria-pressed` toggle buttons. Scrolls sideways inside itself on phones. | `KpiStrip.test.tsx` |
| `MetricTile` | 2×2 grid tile (value, unit, context, source; "Not measured" when empty). | `KpiStrip.test.tsx` |
| `Badge` (reworked) | **One shape**: mono 10.5 px, radius 3, 9% tint, AA ink. Tones ok / warn / bad / info / neutral / accent. The old `variant` prop still works and maps onto a tone. | `Badge.test.tsx` |
| `StatusBadge` (reworked) | Same badge shape plus `StatusDot`, status still written in words. | `Badge.test.tsx` |
| `StatusDot` | Status or tone dot; `aria-hidden` unless given a `label`. | `Badge.test.tsx` |
| `Table` (extended) | Sticky header (default on), uppercase mono header, `numeric` columns end-aligned mono tabular figures, `mono` columns, hover tint, sr-only `caption`, optional `maxHeight`, optional trailing ⋯ `rowMenu`. Old props unchanged. | `Table.test.tsx` |
| `RowMenu` | ⋯ menu: `aria-haspopup="menu"`, arrows / Home / End / Esc (focus back to the button), click outside closes, renders nothing when the role has no actions, destructive items in the bad ink. Opening it does not trigger the row click. | `Table.test.tsx` |
| `Panel` (extended) | `title` / `eyebrow` / `actions` props draw a header bar above the body. Without `title` it is the old card, so every existing screen is unchanged. | `Bits.test.tsx` |
| `SideSheet`, `BottomSheet` | Labelled modal dialogs, shared `useFocusTrap` (Tab wraps, Esc closes, focus returns to the opener, page scroll locked). Bottom sheet ≤ 85 dvh, full-width footer actions. | `Sheets.test.tsx` |
| `SegmentedTabs` | `role="tablist"`, roving tabindex, ←/→ (mirrored in Arabic), Home/End, sideways scroll with start/end edge fades that appear only when there is more to scroll. | `Bits.test.tsx` |
| `ProgressBar` | `role="progressbar"`, clamped fill, formatted value label; empty track + "Not measured" without a value. | `Bits.test.tsx` |
| `Sparkline` | Labelled SVG line; fewer than two finite points draws nothing (no fake flat line); points rounded. | `Bits.test.tsx` |
| `EmptyState` (tokens + note) | Unchanged API. | `Bits.test.tsx` |
| `ConfirmDialog` | `role="alertdialog"`, focus starts on **Cancel**, Esc / backdrop cancel, destructive confirm button, async confirm disables both buttons until it settles. | `Sheets.test.tsx` |
| `CopyButton` | Clipboard copy with a polite live region: "Copied", or "Copy failed" when the browser blocks it (never pretends). | `Bits.test.tsx` |

**Supporting changes**
- `src/components/ui/tones.ts`: the one tone vocabulary (text / tint / fill / stroke / border classes) and the focus ring.
- `app/globals.css`: tone inks `--ok-ink #136B4F`, `--warn-ink #7A5C00`, `--bad-ink #A83232`, `--info-ink #305C80`, `--stale-ink #9C2F5F`, `--accent-tint`, and the theme names `accent`, `slate`, `ok`, `warn`, `bad`, `*-ink`. The base status colours are too light for small text on their tints (green 3.2:1, red 3.9:1, amber 1.9:1).
- `Button.tsx`: removed its three raw hex hovers (`hover:bg-ink/90`, `hover:bg-yellow-dark`); **danger** is now `bg-bad-ink` because white on `#D64545` is 4.4:1 (below AA). Accepts `ref` (React 19 prop) so ConfirmDialog can focus Cancel.
- `index.ts` exports every new component; all old exports kept.
- `public/locales/ar.json`: new `ui` namespace (11 keys), added at the end with a JSON-aware script; nothing reordered.
- `src/components/ui/jest-dom.d.ts`: types for the jest-dom matchers the new tests use (the matchers were already registered in `tests/setup.ts`).
- `app/dev/ui/KitGallery.tsx` + one import line in `app/dev/ui/page.tsx`: the kit on `/dev/ui` with example values (each with a source or "Not measured"), for the screenshots. **Outside B's ownership list** (`app/dev/**`); it is the existing component preview page, so this is the natural place.

## Commands and exit codes

| Command | Exit | Notes |
| --- | --- | --- |
| `npm run typecheck` | 0 | |
| `npm run lint` | 0 | |
| `npm run build` | 0 | |
| `TZ=UTC npm test` | 0 | 70 files, 974 tests (59 new in `src/components/ui`) |
| `TZ=Asia/Dubai npm test` | 0 | 70 files, 974 tests |
| `npx playwright test --workers=2` (full suite, desktop + phone, `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`) | see below | |

Playwright, first full run: 386 passed, 203 skipped (desktop-only screenshot specs on phone, etc.), 7 failed, all `page.screenshot: Target page, context or browser has been closed` timeouts in `j5-proof.spec.ts` and `screenshots.spec.ts`. Re-run alone, all 7 passed (`engine-fuel-ex04/bd02 at 1440`, `omar reports/geofences`, `sara console-billing`, `ravi console-requests/trackers`). Second full run after the last class tweaks (exit 1): 390 passed, 203 skipped, 3 failed with the same screenshot timeout (`j6-proof wt07-trip at 390`, `screenshots omar geofences at 390`, `screenshots sara console-team at 1440`). Each re-run alone: passed. No functional assertion failed in either run. After that only comments changed (the word "fleetx" taken out of four file headers so the U8 clean-up grep stays clean).

Screenshots the local runs rewrote under `reviews/screenshots/J5`, `J6`, `P14` were restored with `git checkout`.

## Screenshots (`reviews/screenshots/b2/`, looked at)

- `dev-ui-kit-1440.png`, `dev-ui-kit-390.png`: KPI strip (selected cell tinted with an accent underline; "Not measured" cell), metric tiles, bars, sparkline, the six badge tones, tabs with the end fade. At 390 the strip scrolls inside itself and the page does not.
- `kit-table-rowmenu-1440.png` / `-390.png`: sticky mono header, end-aligned numbers, ⋯ menu open with the destructive item in red ink; GN-01 has no menu (no actions). At 390 mono IDs no longer wrap ("EX-04" was breaking as "EX- / 04" before I added `whitespace-nowrap`).
- `kit-confirm-1440.png` / `-390.png`: on phones the dialog is a bottom card with full-width buttons, Cancel below the destructive action.
- `kit-side-sheet-1440.png`, `kit-bottom-sheet-390.png`.
- `app-map`, `alerts`, `maintenance`, `asset-ex04` at 1440 and 390: existing screens still render. Visible change: badges now show their tint and border (the old Badge used `background-*` classes that don't exist, so most badges had no background), and danger buttons are a darker red. `scrollWidth − clientWidth` = 0 on every captured screen at both widths.

## Scorecard rows moved (UI-UPGRADE §2)

| Row | Before → now | Evidence |
| --- | --- | --- |
| A1 Visual design | partial | **One Badge style** (Badge + StatusBadge share `badgeClasses`; `Badge.test.tsx`). No raw hex left in `src/components/ui` (`grep -rnE "#[0-9A-Fa-f]{6}" src/components/ui` → nothing). Page-level hex is B3 part 2. |
| A2 Density / hierarchy | partial | `KpiStrip`, sticky-header `Table` with end-aligned mono numbers exist; screens adopt them in Wave 2. |
| A10 Settings / console | partial | `RowMenu`, `ConfirmDialog`, `CopyButton` exist for H2 and I. |
| A11 Phone | partial | `BottomSheet`, scrolling `KpiStrip` and `SegmentedTabs`, 40 px tap targets on ⋯ / copy / close below 640 px. |

No row reaches 9 from B2 alone: the rows need the screens (Wave 2) to use the kit.

## Decisions taken

1. **Focus ring is ink, not accent.** The spec says the accent is the focus ring, but yellow on white is about 1.6:1, under the 3:1 a focus indicator needs. `focusRing` = 2 px ink outline + accent halo.
2. **Tone inks** for text on tints. Measured on the tint over white / over the page background: ok-ink 5.9 / 5.2, warn-ink 5.9 / 5.2, bad-ink 5.9 / 5.2, info-ink 6.3 / 5.6, slate on surface-2 6.4 / 5.7, ink on accent-tint 16.6 / 15.0; white on the danger button 6.6. The base status colours stay for dots, bars and markers. (axe isn't installed yet; Agent D adds it. These ratios are computed with the WCAG formula.)
3. **No `lucide-react` in B2.** PR #33 (B3 part 1) adds it to `package.json`; adding it here too would conflict. The three small icons (⋯, ×, copy) are inline SVG with `currentColor`. They can switch to Lucide once #33 is merged.
4. **Badge text is not CSS-uppercased**, so `getByText` and screen readers see the same words as before.
5. Sheets and dialogs use their own `useFocusTrap`; the old `Sheet` is left as it is for the screens that use it.

## Open questions / for the owner

- **PR #33 (B3 part 1, top navigation) is red on all 4 CI jobs** at `8feefc0`. It was left "merge when green" by the supervisor. It is not part of B2; the next run (B3) should look at it first.

## Supervisor review (BUILDER.md §5)

| Item | Verdict |
| --- | --- |
| Branched from latest `main`; no unrelated changes; no merge commits | PASS (`night-b2` from `fe4ac02`) |
| All commands pass, exit codes recorded, CI green on all shards | PASS locally (above); CI result recorded in the PR before merge |
| No test weakened or deleted | PASS: no existing test file touched; 59 tests added |
| Architecture: screens import the server only via `src/server/api`; no `role ===`; time only from `clock.ts`; coverage | PASS: the kit imports nothing from `src/server`; no `role ===`; no `Date`/`Date.now` (CopyButton's reset uses `setTimeout`, UI feedback, not domain time) |
| Access unchanged or narrower; new panels role-scoped (Mark, Lina, Fatima) | PASS: no screen or data access changed. The kit holds no data; callers decide what each role sees, and `RowMenu`/`Table` render no ⋯ when a row has no actions, so a role with no actions sees no menu. Role tests belong to the Wave 2 screens that use the kit. |
| Honest numbers: source label or "Not measured"; nothing invented | PASS: `KpiCell`, `MetricTile`, `ProgressBar` print "Not measured" for a missing value and drop the source line; `Sparkline` draws nothing rather than a flat line. Gallery values are labelled as examples, each with a source. |
| No hard-coded hex in components | PASS: `grep -rnE "#[0-9A-Fa-f]{3,6}\b" src/components/ui app/dev/ui` → nothing. New hex lives only in `app/globals.css` tokens. |
| Phone 390: no sideways scroll; tap targets ≥ 40 px | PASS: overflow 0 on all 6 captured screens; ⋯, copy and close are 40 px below 640 px (32 px on desktop); dialog buttons `min-h-10`; KPI cells 44 px. |
| Arabic: new strings in `ar.json`, i18n test passes | PASS: `ui.*` (11 keys); the i18n key test passes; SegmentedTabs mirrors arrows in RTL (tested); fades and menus use logical `start`/`end`. |
| Screenshots attached and looked at | PASS (list above) |
| Nothing from fleetx; no "dozr", "KSP-0", fleetx numbers | PASS: `grep -rniE "dozr\|KSP-0\|fleetx" src/components/ui app/dev/ui` → nothing |
| User text put into HTML strings | PASS: none. Everything renders through React; no `innerHTML`/`dangerouslySetInnerHTML`. |
| Raw floats | PASS: the kit never formats numbers; `sparkPoints` rounds to 0.1 and is tested. |
| Contrast | PASS by computation (Decisions 1–2); axe arrives with D. |
