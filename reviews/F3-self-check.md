# F3 self-check — permissions follow the asset

Phase F3 of the fix prompt: `can(session, capability, assetId?)` answers per
asset as well as per role; `hasCapability` is gone; screens import server code
only through `src/server/api.ts`; and the architecture test and lint rule stop
the old imports from coming back.

## What changed

- **`can(session, cap, assetId?)`** (`src/server/capabilities.ts`): role first,
  then the asset relationship. With no asset it answers the role question only.
  `hasCapability`, `hasCompanyCapability`, `canEndAccess` and `isAssetEditable`
  are deleted (`src/server/access.ts` keeps only the data helpers).
- **Asset-scoped checks in the server**: `canManageMaintenance(session, assetId?)`,
  `canViewCost(session, assetId?)`. The role check runs first, then the asset
  check, and each function has its own ownership message. Alerts: a renter
  Tenant Admin cannot acknowledge alerts, including geofence alerts their own
  company raised on a rented asset (spec §5 ✕).
- **Role comparisons go through `hasRole`**: `src/server/muc.ts` (Kasper Admin
  override), `src/server/team.ts`, `src/server/view-as.ts`,
  `app/dev/bookings/page.tsx`. `app/console/tenant/[id]/page.tsx` uses
  `chosenRole` (the earlier rename left three stale `role` references; fixed).
- **Asset-scoped checks in screens**: `app/app/assets/[id]/page.tsx` (asset.edit,
  link.create, grant.endEarly, tracker.request, maintenance.view, report.run,
  maintenance manage), `app/app/alerts/page.tsx` (per-row acknowledge),
  `src/components/demo/FeaturesPanel.tsx` (`can(session, cap, asset?.id)`).
- **Bug found and fixed by the browser proof**: the asset page wrapped *all*
  actions in `(canEdit || canShare || canEndAccess)`, so a renter or Site User
  lost the **Run report** link too, though spec §5 gives them `report.run`. The
  link now has its own check (`canRunReport`). The owner-only `rel === 'owner'`
  test on End access is removed; `can(grant.endEarly, assetId)` already decides
  it.
- **Screen facade** (`src/server/api.ts`): a block of re-exports, one per name
  screens take from server modules (27 modules). It carries no logic. Permission
  checks stay in the underlying modules.
- **All non-test files in `app/` and `src/components/`** import only from
  `@/server/api` (43 files rewritten, imports merged into one statement per file).
- **Lint** (`eslint.config.mjs`): `no-restricted-imports` in the screens block
  bans `@/server/**` except `@/server/api`. A probe file importing
  `@/server/db` and `@/server/capability-reasons` failed lint; `@/server/api` passed.
  The probe was deleted.
- **Lint leftover**: `src/server/tracking-links.ts` had an unused import, which
  lint caught; removed.

## Deliberate scope decisions

- **`app/dev/access/page.tsx` stays role-level.** It is a read-only explorer with
  a per-asset relationship column. Per-asset cells are not shown in F3.
- **`src/architecture.test.ts` rule 2 now covers `src/` and `app/`**, not only
  `src/server`. The only offender was the tenant page; it is fixed.

## Proof

| Item | Proof | Result |
|---|---|---|
| `can()` per asset follows the §5 matrix (role first, then asset) | `src/server/permissions.test.ts`: 161 tests. `it.each` over the asset-matrix table (owner, renter, site user, Kasper, one row per capability and user) and a 36-row company-level table. Site User denied on own asset. No-asset call answers the role question only. | pass |
| `hasCapability` is gone and not called | `src/architecture.test.ts` "hasCapability, hasCompanyCapability, canEndAccess and isAssetEditable are not called anywhere"; `tsc --noEmit` clean | pass |
| Screens import only `@/server/api` | `src/architecture.test.ts` "no screen imports a server module other than src/server/api"; ESLint `no-restricted-imports` (probe failed as expected) | pass |
| Role comparisons only in the capability and reason maps | `src/architecture.test.ts` rule 2 over `src/` and `app/` | pass |
| Owner sees Edit asset, Share tracking link, End access now on her asset | `tests/e2e/f3-permissions.spec.ts:18` (Khalid, `/app/assets/a-ex04`) | pass (desktop) |
| Renter sees Run report, no owner actions, on the rented asset | `tests/e2e/f3-permissions.spec.ts:26` (Lina, `/app/assets/a-ex04`) | pass (desktop) |
| Site User sees no owner actions on own company's asset | `tests/e2e/f3-permissions.spec.ts:35` (Mark, `/app/assets/a-cr02`) | pass (desktop) |
| Kasper Admin sees Audit log; Kasper Ops does not | `tests/e2e/f3-permissions.spec.ts:48`, `:54` | pass (desktop) |
| F2 proofs still pass | `tests/e2e/f2-screens.spec.ts` (6 tests) | pass (desktop) |
| Alerts: owner acknowledges own asset's alert; renter cannot | `src/server/alerts.test.ts` (4 tests) | pass |
| Maintenance and cost: role first, then asset | `src/server/maintenance.test.ts`, `src/server/cost.test.ts` | pass |
| Reports daily-runs: past rental = grant window ended | `src/server/reports.test.ts` | pass |

The asset page is proven by the browser specs above. The alerts page's per-row
acknowledge button has no browser proof; its server behaviour is proven in
`alerts.test.ts`.

## Checks at the end of F3

| Check | Result |
|---|---|
| `npm test` (`vitest run`) | **32/32 files, 462/462 tests pass** |
| `npm run typecheck` (`tsc --noEmit`) | **clean** |
| `npm run lint` (`eslint`) | **clean** |
| `npx playwright test` (all projects, full suite) | **136 passed, 59 failed, 33 skipped** (11.6 min) |

The 59 failures are the same 59 tests that failed at the end of F2 (name-by-name
diff, `/tmp/work/f2-fail-sorted.txt` vs `/tmp/work/f3-fail-sorted.txt`). F3 adds
no new failure, and its 5 new browser tests pass. The 59 are old specs from the
S1–S50 set, and they are not F3 work:

- Strict-mode selector collisions, e.g. `S2` (`/^Rented to /` matches a current
  rental and a past one) and `S15` (the End-access heading and its button share
  the same text). The panel opens; the selectors are ambiguous.
- Flows the specs describe that the app does not yet match. These are the F5
  "write missing Playwright specs S1–S50" items and are not fixed here.

Playwright was run with the desktop and phone projects. The F3 spec is
desktop-only (`test.skip` on mobile), matching F2.

## Not done in F3 (carried forward)

- The 59 Playwright failures above belong to F5 (spec rewrite and selectors).
- `app/dev/access/page.tsx` per-asset relationship cells (deliberately deferred).
- F4 (map status, tier gating, CAN values, demo bar) and F5 are not started.
