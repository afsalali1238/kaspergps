# P14 self-check — Maintenance, cost & ROI, Arabic and the final pass

Date · Agent — 2026-10-08 · Arena agent (`arena/ca12dbe7-kaspergps`)

## Commands

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass (`tsc --noEmit`, clean) |
| `npm run lint` | pass (`eslint`, clean) |
| `npm test` | pass — 21 files, 244 tests |
| `npx vitest run src/i18n src/components/i18n` | pass — 26 tests (dictionary, cookie, RTL, StatusBadge/SourceLabel, toggle) |
| `npm run test:coverage` | pass — **91.08 % lines** (≥ 85 % target) |
| `npx playwright test --list` | 200 tests in 15 files (desktop + phone) |
| `npm run test:e2e` | **not run** — no Chromium in this environment (see Known gaps) |

## Acceptance checks

| # | Check | Pass/Fail | How verified |
| --- | --- | --- | --- |
| 1 | S37–S41 run start to finish from the Scenarios menu | Pass (code), unverified at runtime | `tests/e2e/S37-S41.spec.ts` starts S37–S41 through the demo bar. |
| 2 | Arabic mirrors every customer screen and the public page | Pass | `src/i18n/i18n.test.tsx` fails the build if a `t()` key used in `app/`, `src/components/` or `src/i18n/` is missing from `public/locales/ar.json`. Maintenance and Cost & ROI chrome (titles, phase gates, board columns, period picker) is wrapped. Public tracking/verify already used `translate()`. |
| 3 | Every cost and maintenance figure has a basis label | Pass | `SourceLabel` now translates; `maintenance-cost.spec.ts` asserts the English labels. |
| 4 | Tier 1 shows "Estimated"/"Not measured", never 0 | Pass | `Amount`/`SourceLabel` render `Not measured` for `null`. |
| 5 | All unit tests pass | Pass (this session) | `npm test`. |
| 6 | All E2E tests pass | **Blocked** if no browser | `--list` confirms the specs parse. |
| 7 | Coverage ≥ 85 % lines | Measure this session | `npm run test:coverage`. |
| 8 | No sideways scroll at 390 px on every new page | Partial | `Table` scrolls inside the card (`overflow-x-auto`); logical utilities (`text-start`, `ms-auto`, `border-s-2`, `end-0`) mirror chrome. Phone project needs Playwright. |
| 9 | `docs/demo-script.md` is a 20-minute walkthrough using the scenarios | Pass | Already rewritten in an earlier phase. |
| 10 | `docs/test-matrix.md` maps scenario → test → status | Pass | Updated: i18n unit files named. |
| 11 | Language toggle | Pass | Demo bar **عربي** / **EN** and the user-menu Language row. `LanguageToggle.test.tsx`: cookie, `/ar` navigation, RTL, console stays English, public tracking URL. |

## Screenshots

`reviews/screenshots/P14/` is **empty** unless a browser is available. Capture list once Chromium is installed:

| File | Screen |
| --- | --- |
| `omar-map-1440.png` / `omar-map-390.png` | S1 Tier 1 map |
| `ar-signin-1440.png` / `ar-signin-390.png` | `/ar/sign-in` RTL first paint |
| `ar-map-1440.png` | `/ar/app` RTL map and nav |
| `ar-track-390.png` | public page after demo-bar **عربي** |

## Files added / changed

Added:

- `src/i18n/locale.ts` — cookie + path helpers (`kasper_lang`, `resolveLocale`) so `proxy.ts` does not pull `ar.json`.
- `src/components/i18n/LanguageToggle.tsx` (+ test) — demo-bar and user-menu switch.

Changed:

- `src/i18n/dictionary.ts`, `src/i18n/index.tsx`, `src/i18n/i18n.test.tsx` — cookie, remount, RTL document, StatusBadge/SourceLabel coverage.
- `proxy.ts` — honours `kasper_lang` on unprefixed customer routes; console/dev stay English.
- `src/components/demo/DemoBar.tsx` — **عربي** / **EN** toggle.
- `src/components/layout/AppShell.tsx` — LanguageToggle, translated nav labels, logical utilities, locale-stripped active state.
- `src/components/ui/StatusBadge.tsx`, `SourceLabel.tsx` — translate via `t()`.
- `src/components/ui/Table.tsx`, `Sheet.tsx`, `Dropdown.tsx` — `text-start` / `ms-auto` / `end-0`.
- `app/app/maintenance/page.tsx`, `app/app/cost/page.tsx` — chrome wrapped in `t()`.
- `public/locales/ar.json` — `common.source.*`, extra maintenance/cost keys.
- `README.md`, `docs/test-matrix.md`, this self-check.

## Deviations from BUILD_PROMPT.md (and why)

1. **After-hydration switch.** The toggle writes the cookie and updates `lang`/`dir` immediately, then `router.push`s the `/ar` prefix (or `refresh`es on the console). First paint of a subsequent load is still Arabic because the proxy reads the cookie / prefix before React hydrates.
2. **Logical utilities, not a full CSS flip.** Customer chrome uses `text-start`, `ms-auto`, `border-s-2`, `end-0`. Leaflet and the demo bar stay LTR (demo bar is prototype tooling).
3. **English tab titles.** `document.title` / Next metadata stay English so the browser tab is stable across languages.
4. **Maintenance and Cost & ROI.** §14's screen list omits both; P14 says "every customer screen". Chrome (titles, empty states, board columns, period picker) is translated; long form copy and export filenames stay English.
5. **E2E listed, not always executed.** Without Chromium the Playwright suite is verified by `--list` and `tsc`.

## Libraries added (and why)

None.

## Questions for the reviewer

1. Should export filenames and PDF/Excel column headers go through `t()` as well? They currently stay English so a downloaded file is readable in either UI language.
2. The scenario specs have never been executed in this environment. They need one run with a browser to shake out selectors.

## Known gaps

- **No browser in some build environments**, so `npm run test:e2e` and the P14 screenshots may be missing.
- **Arabic is a first draft** — `public/locales/ar.json` is marked *Draft — needs native review*.
- **Deep maintenance/cost copy** (log-service form, ROI drawer) is still mostly English.

---

## Update 2026-10-12 (H4–H7)

The sections above were written before a browser was available. This update records what has changed.

| Earlier gap | Now |
| --- | --- |
| The Playwright suite had never run ("no Chromium") | Full run, desktop + phone: exit 0, 347 passed, 0 failed, 167 skipped, 514 entries (`reviews/H6-self-check.md`). |
| Check 8: no sideways scroll at 390 px "needs Playwright" | `phone-layout.spec.ts`: 21 tests (customer and public pages at 390 × 844, plus the demo bar). All pass. |
| Check 1: S37–S41 "pass (code), unverified at runtime" | `maintenance-cost.spec.ts` (10) and `S37-S41.spec.ts` pass in the final run. Every scenario S1–S50 runs from the Scenarios menu (`scenario-walkthroughs.spec.ts`, 50 tests). |
| Check 3: "every cost and maintenance figure has a basis label" | Asserted by `maintenance-cost.spec.ts`. |
| Screenshots "empty unless a browser is available" | 46 PNGs in `reviews/screenshots/P14/` (23 screens × 2 widths), including `omar-ar-map` (Arabic RTL) and `anon-sign-in`. |
| Reduced motion had no automated check | `playback-motion.spec.ts`: the player starts stepped and never runs by itself. |
| Scenario specs had never been run ("needs one run with a browser") | The final run is that run. Selector drift was fixed in the specs, never by deleting an assertion. |

Still open from this phase:

- Arabic is a first draft and needs a native reviewer. One Arabic string was corrected to show a
  placeholder properly (`map.updated_ago`, "last updated" line); nine placeholder-only alert words were
  removed. See `HANDOFF.md` section 8.
- Export filenames and PDF/Excel column headers stay in English, as the original question 1 left open.
- The Deep maintenance/cost copy (log-service form, ROI drawer) is still mostly English.
- The GitHub CI run has not happened.
