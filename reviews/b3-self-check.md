# B3 self-check: top navigation (part 1) + demo bar, raw hex, LIVE pill (part 2)

Agent file `handoff/agents/B-design-system.md` items 3 (hex), 6 (icons) and 7 (shell, demo bar). Part 1 (top navigation, no left sidebar) is in `reviews/b3-topnav-self-check.md`; this run rebased it on B2 (#34) and added part 2.

## What changed and why

| Change | Why |
|---|---|
| Rebased #33 on main after B2 (#34) merged. PROGRESS conflict resolved to main's line | #33 was red only because `TopTabs.test.tsx` used jest-dom matchers whose types came with B2 |
| **Demo bar restyled** with tokens: one button shape (`DEMO_BTN`: 28 px, `rounded-md`, `demo-surface` / `demo-line` tokens, visible focus ring), Lucide icons (Clock, ListChecks, Play, Wrench) instead of hand-drawn SVGs, menus `rounded-lg`. View as and the language toggle use the same shape. No new tools (Agent J adds those in Wave 3) | Spec §5.1 / agent file item 7: "restyle only" |
| New tokens `--demo-surface`, `--demo-surface-2`, `--demo-line` (+ Tailwind `bg-demo-surface` …) replace `#1a1b20`, `#22242a`, `#2a2c30` in the demo bar, View as, Features panel, walkthrough card and language toggle | No raw hex |
| **No raw hex in `src/components/**` or `app/**`** (outside the `:root` token block of `globals.css`). Leaflet / Recharts strings now come from `src/config/colors.ts`: `MAP_STATUS_COLORS`, `geofenceColor()`, `PLAYBACK_EVENT_COLORS`, `PLAYBACK_STATE_COLORS`, `track`, `hatch`, `geofenceDraw`, and the `*Ink` text colours. Logo SVGs use `fill-ink` / `fill-yellow` classes | Agent file "done when" |
| **Guard test**: `src/config/colors.test.ts` walks `src/components` and `app` and fails on any hex outside comments (and outside the token block of `globals.css`). It also checks the four `*Ink` strings equal their CSS tokens | Keeps it that way in Wave 2 |
| **LIVE pill opens the demo clock**: it is now a button; it fires one window event (`src/components/demo/open-clock.ts`) that the demo bar listens for. The console bar shows the same pill (≥ 1760 px) | Part 2 item; console "gets the same bar" |
| **AA contrast on `/app`, `/app/alerts`, `/app/assets/a-ex04`** (axe colour-contrast, 0 violations, was 18 / 3 / 10): secondary text `--grey-500` `#6B6F76` → `#676B72` (axe measured 4.45:1 on the page background; now 4.72:1); status words in the map list, asset notices, engine & fuel refuel/drop words and the ECU source chip use `text-ok-ink` / `text-bad-ink` / `text-warn-ink`; "Prototype · dummy data" and other demo-bar hints `text-paper/60` | Agent file "done when" (axe) |
| Map popup HTML: colours from `COLORS` (text uses `warnInk`, not the 2.9:1 `#b89000`). All user text in it was already escaped; unchanged | Hex + contrast |
| UI kit: `RowMenu` (⋯), `CopyButton` (copy / check) and the sheet close button use Lucide, as B2 asked | B2 → B3 note |
| The word "fleetx" removed from three code comments (U8 clean-up grep) | Checklist |

Phone: the restyled demo bar first wrapped to two rows at 390 px (72 px, the one-row test failed). Fixed by tighter padding on phones and hiding the clock icon below `sm`; the test passes unchanged.

## Exit codes (final code, this sandbox)

| Command | Exit |
|---|---|
| `npm run typecheck` | 0 |
| `npm run lint` | 0 |
| `npm run build` | 0 |
| `TZ=UTC npm test` | 0 (1080 passed) |
| `TZ=Asia/Dubai npm test` | 0 (1080 passed) |
| Playwright, full suite, `--workers=2` (`PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`) | 1: 405 passed, 220 skipped, 5 failed, all `page.screenshot: Target page, context or browser has been closed` in j5-proof / j6-proof / screenshots specs |
| The 5 re-run alone | 0 (5 passed) |
| `phone-layout`, `j5-nav-widths` (incl. the 2 new LIVE-pill tests), `demo-shell` | 0 (63 passed) |

Earlier full run (before the phone fix) also found the real failure above; that is the only functional failure seen.

## axe (axe-core 4.10.3 injected locally, `color-contrast` only, Khalid at 1440 px)

```
before: /app 18 · /app/alerts 3 · /app/assets/a-ex04 10
after:  /app 0  · /app/alerts 0 · /app/assets/a-ex04 0
```

## Screenshots (`reviews/screenshots/b3/`, looked at)

- `app-1440.png`, `app-390.png`: top bar, restyled demo bar; on the phone the demo bar is one row with icon buttons; map list status words darker.
- `alerts-*`, `asset-ex04-*`: unchanged layout, darker secondary text.
- `demo-clock-open-1440/390.png`: the clock menu on the new surface tokens; on the phone it stays inside the screen.
- `app-live-pill-1760.png`, `app-live-pill-clicked-1760.png`: LIVE 10:00 pill; click opens the clock.
- `console-1760.png`: console bar with the same LIVE pill, tabs fit.
- `sign-in-1440/390.png`: logo now from tokens.

Other screenshot folders that local runs rewrote were restored with `git checkout`.

## Scorecard rows moved

- **A1 (visual design)**: no hard-coded hex in components or screens (guard test), secondary text AA on the three checked pages, Lucide in the nav, header, demo bar and kit. Moves from partial towards 8; full 9 needs the Wave 2 screens.
- **A11 (phone)**: demo bar stays one row at 390 px; no new sideways scroll.
- **A15 (testability)**: hex guard test; LIVE-pill e2e.

## Supervisor review (BUILDER.md §5)

| Item | Result |
|---|---|
| Branched from latest main; no unrelated changes | PASS (rebased on 5ebd062, B2 merge) |
| §4 step 3 commands pass, exit codes here; CI green | PASS locally; CI checked on the PR head before merge |
| No test weakened or deleted | PASS. Only additions (hex guard, ink mirror rows, 2 LIVE-pill e2e). Part 1 locator changes are listed in its self-check |
| Architecture rules (server via `src/server/api`, no `role ===`, time from `clock.ts`) | PASS (diff grep: none added) |
| Access unchanged | PASS. No gating code touched in part 2; the LIVE pill shows the demo clock to anyone signed in, as before; the clock control itself is demo-bar only |
| Honest numbers | PASS. No numbers added |
| No hard-coded hex | PASS (guard test) |
| Phone 390 px | PASS for sideways scroll. Note: demo-bar buttons are 28 px tall (presenter chrome, as before; the one-row test needs it). Product tap targets unchanged |
| Arabic strings | PASS: `shell.live_open_clock` added. Demo bar stays English by design |
| Screenshots looked at | PASS (list above) |
| No fleetx code or words in `app/`, `src/`, `tests/` | PASS (0 matches) |
| User text into HTML | PASS. Popup HTML still escapes code, name, status, time, link; colours now come from constants |
| Role leaks (Mark, Lina, Fatima) | PASS. No role-scoped content added |
| Raw floats | N/A |
| Contrast | PASS on the three axe pages. Open: console Overview "Manage →" links are yellow on white (≈1.6:1); that is the console screen (Agent I) |

## Decisions taken

- Playback event / state colours moved to `colors.ts` unchanged rather than re-mapped onto status tokens, so the playback screen looks the same until F2 redesigns it.
- Map pins keep their current colours (idle `#B89000`, stale grey); only the text colours changed to the ink tokens. E (fleet map) decides the final pin palette.
- `--grey-500` nudged to `#676B72` (smallest change that clears 4.5:1 on the page background).

## Open questions

- None that block. Console "Manage →" contrast is for Agent I.
