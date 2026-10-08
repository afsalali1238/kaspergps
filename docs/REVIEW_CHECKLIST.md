# Code Review Checklist — Kasper GPS

A reference for reviewing changes on `arena/53555479-kaspergps`. Tick each box during review; flag anything unchecked as a blocking issue.

---

## 1. Architecture rules

- [ ] Pages under `app/app/` are standalone, self-contained React components. They do **not** import from each other.
- [ ] Shared UI primitives live in `@/components/ui` (Button, Badge, Tabs, TabContent, EmptyState, Modal). Pages import from there, never redefine equivalents.
- [ ] Server-side data lives in `@/server/seed/data` (the `seed` object) or `@/server/access`. Pages read from those modules, never hardcode domain data.
- [ ] State management uses `@/store` (Zustand). Pages call `store.getState()` to read; mutations go through store actions when they exist.
- [ ] Client-only features are marked `'use client'` at the top of the file. Pages that read session/store state are always client components.
- [ ] No page imports from `app/app/[other-page]/` — cross-page coupling is a regression.

## 2. Phase gating

- [ ] Every page checks `phase` from the store (`store.getState().demoSwitches.phase`).
- [ ] When `phase === 'day_one'`, the page shows `EmptyState` with "Not available / Phase 2" and returns early. No feature UI renders.
- [ ] When `phase === 'day_two'` (or later), the full feature UI renders.
- [ ] Phase gate is the **first** render condition after the session null check. Not buried inside a tab or modal.

## 3. Capability gates (role-based)

- [ ] `session.isKasper` is checked where the user type matters (who can see what, who can act).
- [ ] Kasper sees all tenants' assets; tenant users see only their own. Use `isAssetVisible(session, assetId)` from `@/server/access` for asset-level checks.
- [ ] Tenant users never see Kasper-only UI (pair/decline console requests, all-tenants reports, etc.).
- [ ] The sign-in page redirects: `kasper@example.com` → console, everything else → app. No role bypass.

## 4. Asset visibility

- [ ] Asset lists, maps, and detail pages filter by `isAssetVisible` when the user is a tenant (not Kasper).
- [ ] The customer map page filters markers by site and tier dropdowns; clearing a filter shows everything (within visibility bounds).
- [ ] Asset detail is reachable from map marker click, list item click, and direct URL. Direct URL to a non-visible asset shows a proper not-found or empty state.
- [ ] The "View on map" or similar navigation from asset list → map centers on the right asset.

## 5. Time handling

- [ ] All times are Dubai time (`Asia/Dubai`). Use `@/lib/clock` (`formatDubaiDateTime`, `formatTs`, `now()`).
- [ ] Date pickers in report/schedule forms use Dubai-local dates. No UTC mixing.
- [ ] `schedule.nextRun` is stored as an ISO string in Dubai time. `calculateNextRun` returns `toIsoDubaiTime(...)`.
- [ ] UI displays formatted dates (short form: `dd MMM yy`), never raw timestamps.

## 6. Form state

- [ ] Create/edit forms track fields in `useState`. Submit button is disabled until the form is valid (required fields present).
- [ ] Form submit calls the appropriate handler; on success, the list refreshes or the form resets.
- [ ] Cancel/close buttons exist on every modal and edit form.
- [ ] Validation errors (e.g. missing reason on decline) show an inline message, not a silent no-op.
- [ ] Fixture/seed data used in forms (site dropdown, asset dropdown) comes from `seed.sites` / `seed.assets`, not hardcoded.

## 7. Empty handlers (anti-pattern)

- [ ] No `onClick={() => {}}` or `onClick={undefined}` on buttons that imply an action (Download again, Delete, Pay, Pair, Decline, Create invoice, Record payment, etc.).
- [ ] Every action button either calls a real handler or is hidden/disabled in contexts where the action is not available.
- [ ] "Create invoice" in billing → shows a toast "Invoice creation is a Phase 2 feature." (not silent).
- [ ] "Download" in GPS subscription → generates an Excel file with tier breakdown (not silent).

## 8. Download flows

- [ ] Reports page: Excel download generates a real `.xlsx` via `XLSX` (xlsx library). PDF download generates a real `.pdf` via `jsPDF` + `jspdf-autotable`.
- [ ] Downloads page: "Download again" re-runs the export for that download item (Excel or PDF matching the original format). Not a silent no-op.
- [ ] Downloads page: "Delete" removes the item from local state. Not a silent no-op.
- [ ] Download filenames follow the convention: `Kasper_{reportType}_{scope}_{from}_to_{to}.{ext}`. GPS statement: `Kasper_GPS_subscription_{tenantId}_{date}.xlsx`.
- [ ] Downloads page filters by asset visibility when user is a tenant (not Kasper).

## 9. Link resolver

- [ ] `app/lib/links.ts` exports `resolveLink` for all known route patterns. Every profile/asset/history link shown in UI goes through `resolveLink`.
- [ ] `resolveLink` handles: asset profile, asset history, tenant profile, site detail, report detail, geofence detail, console request detail, maintenance plan detail, alert detail.
- [ ] Unknown/uncovered link types return `null` or a safe fallback, not throw.
- [ ] `app/lib/eta.ts` exports `resolveEta` for ETA computations. Used consistently wherever ETA is shown.
- [ ] MUC verify page uses `resolveLink` (not hardcoded paths) for asset/tenant navigation.

## 10. MUC module

- [ ] MUC (Monitor–Use–Control) pages are under `app/app/console/`. They are Kasper-only (checked via `session.isKasper`).
- [ ] MUC verify page: lists assets with verification status, allows verify/skip actions, shows progress.
- [ ] MUC verify page uses `resolveLink` for asset links, `seed.assets` for data.
- [ ] MUC unit tests in `tests/unit/` cover the core MUC logic. Test files exist and run.
- [ ] Console request flow (pair/decline) is part of MUC. Pair navigation opens the right asset; decline requires a reason.

## 11. E2E tests

- [ ] Every new user-facing feature has at least one E2E test in `tests/e2e/`. Tests are Playwright.
- [ ] Test helpers in `tests/fixtures/helpers.ts`: `signInAs`, `signInAsEmirates`, `signInAsKasper`, `goto`, `waitForToast`, `setPhase`, `expectPath`, `getDownloadFilename`.
- [ ] Tests use `setPhase('day_two')` (or appropriate phase) before exercising feature UI.
- [ ] Downloads tests verify real file generation (Excel + PDF), not just button clicks.
- [ ] Test matrix in `tests/TEST_MATRIX.md` is updated when features are added or removed.
- [ ] Demo script in `tests/e2e/demo.spec.ts` walks all major flows end-to-end.

## 12. TypeScript and lint

- [ ] No `any` types added. Existing `any` usage is documented and intentional (seed data, external lib wrappers).
- [ ] React components are typed: props interfaces where needed, no implicit `React.FC` without need.
- [ ] Event handlers are typed (`React.MouseEventHandler`, etc.) or inferred from JSX.
- [ ] `useMemo` / `useState` initializers are correctly typed (no `as any` to silence TS).
- [ ] ESLint passes: `pnpm lint` (or the project's lint command) clean on changed files.
- [ ] No unused imports. No unused variables (except intentional `_` prefixes).

---

## Current known issues

| # | Area | Issue | Severity | Notes |
|---|------|-------|----------|-------|
| 1 | Billing | GPS subscription row uses `gpsData` memo; download handler recomputes inline | Low | Slight duplication of tier computation; not user-visible. Could share one computation. |
| 2 | Schedules | `calculateNextRun` had a typo fixed in-session; verify no other date helpers have similar issues | Low | Fixed: all 3 return statements now use `toIsoDubaiTime(...)`. |
| 3 | Downloads | Delete removes from local state only; no server persistence (intentional for prototype) | Info | Documented as prototype limitation. |
| 4 | Reports | Excel/PDF generation uses seed telemetry; real telemetry integration is Phase 2 | Info | Design decision, not a bug. |
| 5 | Console | Pair/decline actions manipulate local state; server RPC stubs are placeholders | Info | Phase 2 work. UI flow is complete. |
| 6 | i18n | Some English strings may not be wrapped for i18n on newer pages | Low | Tracked separately; not blocking for this branch. |
