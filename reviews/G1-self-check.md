# G1 self-check: Alerts (Agent G, part 1)

Night run, 13 Oct 2026, 06:20–07:30 UTC. PR #39, branch `night-g1` (from `origin/main` at `811979a`).
Scope: `handoff/agents/G-alerts-fuel-maintenance.md` scope 1; `UI-UPGRADE.md` §8 Alerts, §5.2 Alerts KPI row, scorecard A5.

## What changed and why

| File | Why |
| --- | --- |
| `app/app/alerts/page.tsx` | Rebuilt: KPI strip; one filter bar (Status as `SegmentedTabs` Open / Acknowledged / All with counts, Type, Site); severity groups; "Acknowledge all (n)" behind `ConfirmDialog`; rules panel in a 320 px right column (stacks below on phones). |
| `src/components/alerts/AlertRow.tsx` (new) | Left severity border, Lucide type icon, asset code as a link, text, relative time (`<time title=…>` exact Dubai time on hover), site, Acknowledge. Button ≥ 40 px tall on phones. |
| `src/components/alerts/AlertRulesPanel.tsx` (new) | Type → Instant / Daily digest / In-app only. Labelled "Prototype — no messages are sent". Tenant Admins only. |
| `src/components/alerts/severity.ts`, `relative-time.ts` (new) | Severity tones, borders and icons (tokens only); "3 h ago" from `clock.now()`. |
| `src/server/alerts-screen.ts` (new) | `alertSeverity`, `groupAlertsBySeverity` (Critical → Warning → Info), `alertKpis`, `mayAcknowledge` (mirrors `acknowledgeAlert`'s checks), `acknowledgeAlerts` (bulk; calls `acknowledgeAlert` per alert, so one audit entry each). |
| `src/server/alert-rules.ts` (new) | Rules per tenant in the db; `canManageAlertRules` (Tenant Admin of a company, via `can(session,'users.manage')`; no `role ===`); `saveAlertRule` audited as `alert.rule`; hardware types (fuel drop, fault) only when the visible fleet has the hardware. |
| `src/server/db.ts` | **Migration:** `alertRules` collection, `DB_VERSION` 1 → 2. `migrateDb` keeps a stored v1 db and adds `alertRules: []`; other versions rebuild from the seed (as before). Storage key unchanged. |
| `src/server/api.ts` | Exports appended under `// ── Agent G ──`. |
| `public/locales/ar.json` | New `alerts_page` namespace (inserted right after `alerts`, not at the end, so it can't conflict with F1's append). JSON-aware insert; the rest of the file is byte-identical. |
| `src/components/layout/AppShell.tsx` | **Outside G's files, one line:** `useDb(s => s.alerts)` so the bell re-renders after an acknowledge. Without it the bell kept the old count (the e2e "bell matches the page" test caught it: 8 instead of 1). Pre-existing bug for single acknowledges too. |
| `src/server/db.test.ts` | `DB_VERSION` exact value 1 → 2 (equally strict) plus two new migration tests. |
| `src/server/api-gate.test.ts` | `alertSeverity` and `groupAlertsBySeverity` added to PURE with a reason (type in → severity out; groups rows the caller already got from a gated call). Every other new export takes a Session first. |
| `src/server/alerts-screen.test.ts` (new) | 15 tests, listed below. |
| `tests/e2e/g1-alerts.spec.ts` (new) | 6 tests × desktop + phone. |
| `tests/e2e/S9-S12.spec.ts` | The row no longer reads "Since …" (relative time instead). The check `getByText(/^Since /)` became `getByTestId('alert-site')` has text: it still asserts the site travels with the alert line, and now checks the site itself. |

## Exit codes

| Command | Exit |
| --- | --- |
| `npm run typecheck` | 0 |
| `npm run lint` | 0 (0 warnings) |
| `npm run build` | 0 |
| `TZ=UTC npm test` | 0 (1134 passed; an earlier run had 2 timeouts in `consistency`/`trips` while two test runs overlapped, gone when run alone) |
| `TZ=Asia/Dubai npm test` | 0 (1134 passed) |
| Playwright `g1-alerts`, `S9-S12`, `phone-layout` (`--workers=2`, desktop + phone) | 0 (47 passed) |

Local Playwright needs `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium` (the bundled headless-shell build is missing in the sandbox). The full suite runs in CI.

## Tests added

Unit (`alerts-screen.test.ts`): spec's four critical types; grouping order and every alert in exactly one group, for 8 users; Khalid's critical group first; KPI counts equal the visible list; Acknowledged today +1 after an acknowledge; **bell = page Open list for 8 users**; `mayAcknowledge` agrees with `acknowledgeAlert` for every visible open alert of every user; Mark and Deepa may acknowledge nothing; **bulk acknowledge**: Khalid gets all, one audit each; Fatima's rented GN-01 drop and a foreign alert are skipped and the foreign one stays open; Mark's bulk does nothing and writes no audit; idempotent; **rules**: Tenant Admins only (Mark, Deepa, Rashid, Ahmed, Sara, Ravi refused), hardware types only for fleets with hardware (Omar T1 has no Fuel drop row, Khalid does), saved per tenant, audited, other companies stay on default, refused inputs write nothing.

E2E (`g1-alerts.spec.ts`): Khalid's strip, group order, row severities, Critical KPI = Critical rows, exact time in `title`, rules panel with the prototype label, asset link opens the asset; **Acknowledge all (7)**: Cancel changes nothing, confirm clears the Open list, "0 open alerts", Acknowledged today = 7, **bell drops by 7**, rows move to Acknowledged with "Acknowledged by Khalid Rahman at …"; a rule change survives a reload; Mark sees no Acknowledge / Acknowledge all / rules panel; Fatima sees the rented GN-01 drop without Acknowledge; the selects have names.

## Screenshots (looked at)

`reviews/screenshots/G1/alerts-{khalid,omar,mark,fatima}-{1440,390}.png`. Checked by eye:
- Khalid 1440: strip 6 / 3 / 3 / 0 with "Source: From alerts"; Critical (EX-07 offline, BD-02 fault, GN-01 drop), Warning (3), Info (EX-04 maintenance due); red / amber / blue borders; rules panel on the right with the amber prototype badge.
- Khalid 390: no sideways page scroll (the screenshot spec checked `scrollWidth`), the strip scrolls inside itself, Acknowledge buttons and selects ≥ 40 px, rules panel below the list.
- Mark 1440: no Acknowledge, no Acknowledge all, no rules panel; "Al Qusais Yard" on every row.
- Fatima: GN-01 fuel drop under Critical, no Acknowledge; her company's rules panel.

## Scorecard (UI-UPGRADE §2)

- **A5 Alerts 6.5 → 9.** KPI strip ✔, grouped by severity ✔, "Acknowledge all (filtered)" with confirm and audit per alert ✔, asset code links ✔, relative time with exact on hover ✔, rules panel (prototype, per tenant, Tenant Admins) ✔, the bell matches the page ✔ (unit for 8 users + e2e after bulk acknowledge). Not 10: no per-row "⋯" (mute, open on map) and the strip cells aren't clickable filters yet.
- **A12 Accessibility:** removes the only critical axe finding in D's baseline (Alerts selects without a name): they now have `aria-label` "Alert type" / "Site"; the severity groups are `section`s with headings.

## Supervisor review (BUILDER.md §5)

- Branched from latest main; no unrelated changes: **PASS** (one-line AppShell fix is explained above).
- All commands pass, exit codes recorded, CI green on all shards: **PASS** once CI on the PR head is green (recorded in the PR comment).
- No test weakened or deleted: **PASS** (DB_VERSION 1→2 is the legitimate data change; S9's "Since" check became a stricter site check).
- Architecture: screens import the server only through `src/server/api` ✔ (components import types/functions from `@/server/api`); no `role ===` ✔ (`grep` on the diff: none); time only from `clock.ts` ✔ (architecture test passes); coverage floor ✔ (in `npm test`): **PASS**.
- Access unchanged or narrower: **PASS**. Acknowledge still goes through `acknowledgeAlert`; bulk skips anything the user can't acknowledge; rules panel only for a company's Tenant Admin. Tested for Mark, Lina (rules: Tenant Admin → yes; nothing to acknowledge), Fatima, Deepa.
- Honest numbers: **PASS**. Every KPI is a count of visible alerts with "Source: From alerts". No forecasts. Rules panel says no messages are sent, and nothing is sent.
- No hard-coded hex: **PASS** (`colors.test.ts` passes; only token classes).
- Phone 390: no sideways scroll; tap targets ≥ 40 px: **PASS** (`min-h-10` on phone for buttons and selects; `phone-layout` spec passes for `/app/alerts`).
- Arabic: every new string in `ar.json` (`alerts_page`), i18n test passes: **PASS**.
- Screenshots attached and looked at: **PASS**.
- No fleetx / "dozr" / "KSP-0": **PASS**.
- User text into HTML strings: none (React text only). Raw floats: none (all counts are integers). Contrast: severity words use `*-ink` tones on tints.

## Decisions taken

- **Severity of non-listed types** (spec only names the critical four): Warning = towing, over speed, harsh driving, low battery, low fuel, after-hours move, geofence exit, maintenance overdue, invoice overdue; Info = geofence enter, maintenance due soon, long idle.
- **Rule defaults** (shown until a company saves): critical types Instant, everything else In-app only. A prototype default, not a claim about what's sent.
- **Who is a "Tenant Admin" for rules:** `can(session,'users.manage')` with a company (`tenantId`); Kasper staff don't get the panel (they have no company to save for).
- **DB migration:** v1 stores are migrated in place (demo changes survive). A demo-state *export* made by a v1 build is refused with the existing "this build reads version 2" message.
- E, F2 not taken: E is claimed by the supervisor's `night-e` branch; F2 shares F1's files (PR #38 open).

## Requests for other agents

- **B:** the bell now subscribes to `alerts` (one line in `AppShell.tsx`). Alerts nav icon is still `TriangleAlert`; the spec mapping says `Bell`.
- **J1:** Arabic copy in `alerts_page` is a draft.

## Open questions

- Should the KPI cells act as filters (Critical → Open + critical only)? Left off to keep G1 small.
