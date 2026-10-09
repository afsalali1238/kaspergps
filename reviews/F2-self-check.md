# F2 self-check — screens follow the store

Phase F2 of the fix prompt: screens read the store through hooks instead of
calling `getState()`, sign-in checks and View as go through one API, and a lint
rule stops `getState()` from coming back.

## What changed

- **Hooks** (`src/hooks/index.ts`, new): `useSession`, `useSwitches`, `useNow`,
  `useClockOffsetMs`, and `storeActions`. Components import these from `@/hooks`
  only. Hooks are not called inside handlers or after early returns.
- **`getState()` removed from `app/**` and `src/components/**`**: 106 calls in
  39 files at baseline (`0b1e234`) → **0**. Handlers included, not only render
  paths. Event handlers now call `storeActions.*` or the server layer.
- **Lint ban** (`eslint.config.mjs`): a `no-restricted-syntax` rule for
  `getState()` in `app/**` and `src/components/**` (tests excluded). The
  `react-hooks/rules-of-hooks` rule is on for the same files. The clock, seed,
  telemetry and capabilities modules keep their existing "off" overrides.
- **Architecture backstop** (`src/architecture.test.ts`): rule 5 fails on any
  `getState` in those directories. `KNOWN_DIRECT_DATA_IMPORTS` is now empty, so
  the ratchet cannot grow unnoticed.
- **Presets and scenarios moved out of the bar**: DemoBar presets and lookups are in
  `src/server/demo-presets.ts`. Scenario data is in `src/components/demo/scenarios.ts`,
  which has no `getState()`.
- **Clock writes only through the store**: `setClockOffsetMs` and `resetClock`
  are the only writers outside `src/lib/clock.ts`. A grep of `setOffsetMs|resetOffset`
  in `app/` and `src/` finds only `src/store/index.ts` (its own actions and the
  hydration step). `DemoBar`, `app/dev/seed/page.tsx` and the scenario setups no
  longer call `clocklib` directly. `DemoBar` no longer imports the seed.
- **`nextRowNumber(key, prefix, floor)`** (`src/server/db.ts`): import handlers use it
  for new row numbers, so ids stay unique across reloads.
- **AppShell** (`src/components/layout/AppShell.tsx`): the children wrapper is keyed by
  `session?.userId`, so a switch of user remounts the page. The desktop left nav now
  renders for customers at `lg` and up. Before this change a customer had no nav on
  desktop at all. This is a behaviour change beyond the F2 list; it is needed for the
  Day 1 proof.
- **Sign-in checks shared** (`src/server/api.ts`): `api.signIn(email, pw)` returns
  "Email or password is incorrect." for empty fields and for an unknown user.
  `api.signInAs(userId)` runs the deactivated, suspended-company and invited checks.
  An invited user is activated and gets the notice "Welcome to Kasper, <first name>.".
  The sign-in page shows the notice for 1500 ms before it redirects.
- **View as** (spec 10.1): `src/server/view-as.ts` builds the groups and badges from
  live `users`, `tenants`, `sites`, `assets` and `bookings`. The menu is
  `src/components/demo/ViewAsMenu.tsx`, opened from the bar and by `Ctrl+K`.
  - Groups: Kasper first, then each company in table order. A company with no
    matching user is hidden. Search matches name or email.
  - Row: name, then "role · site names".
  - Badges: "deactivated", "invited", "No CAN" (every visible asset is tier 1),
    the tier mix such as "T1 2 · T3 1", "renting N", "rented out N".
  - A deactivated row is greyed out. Picking it shows the sign-in error inline and
    keeps the current session.
  - Picking an invited user activates them.
  - The outside hirer row opens the live FB-12 tracking path.
  - The signed-out row clears the session and goes to `/sign-in`.
  - Switch target: `/console` when the bar is on `/console` and the new user is Kasper
    staff, otherwise `/app`.
- **Settings invite** (`app/app/settings/page.tsx`): wired to `createUser`
  (`src/server/team.ts`). Labels are "Full name", "Email", "Role" and "Sites".
  Errors and the notice are shown inline.
- **Hardware mix** (`app/console/tenant/[id]/page.tsx`, `app/console/tenants/page.tsx`):
  uses `tierForAsset` and shows "T1 · T2 · T3".
- **Hook-order fixes**: `app/console/assets/[id]/page.tsx` and
  `app/console/trackers/page.tsx` had hooks after early returns. They are fixed.

### Interpretations (stated, not in the spec)

- Spec 11.1's invited welcome is shown on sign-in. It is not shown on View as.
- View as picking an invited user also activates them. This follows the spec's
  "invited messages" line.
- "No CAN" means every asset the user can see has no CAN adapter (tier 1).

## Proof (F2 items)

The F2 plan names items rather than a numbered proof list, so the proofs below are
item-based. Tests are in `tests/e2e/f2-screens.spec.ts` (desktop only; phone is
skipped by design) and in the unit files named.

| Item | Proof | Result |
| --- | --- | --- |
| `getState()` gone from `app/**` and `src/components/**` (106 in 39 files → 0) | `grep -rn getState app src/components` (non-test): 0. Rule 5 in `src/architecture.test.ts` | pass |
| Lint rule bans `getState()` in those directories | `eslint.config.mjs`; `npm run lint` clean. A probe file with `getState()` failed lint earlier; the probe was deleted | pass |
| Day 1: Maintenance nav hides without a reload | `f2-screens.spec.ts:18` | pass (desktop) |
| Invited user appears in View as at once | `f2-screens.spec.ts:32`; `S17-S19.spec.ts` "an invited user appears in the View as dropdown afterwards" | pass |
| Invited user who signs in sees the welcome notice, then lands in the app | `f2-screens.spec.ts:50` | pass |
| View as on a deactivated user: sign-in error shown, session kept | `f2-screens.spec.ts:68`; `S20-S22.spec.ts` second S22 test | pass |
| `Ctrl+K` opens View as | `f2-screens.spec.ts:80` | pass |
| Switching to Omar on `/app` shows Omar, not the previous user (keyed container) | `f2-screens.spec.ts:88` | pass (shows the new user; does not prove page state resets) |
| `api.signIn` and `api.signInAs` checks: empty fields, case-insensitive email, deactivated, suspended company, invited activation, unknown user | `src/server/api.test.ts` (6) | pass |
| `nextRowNumber` gives unique numbers after a reload | `src/server/db.test.ts` `nextRowNumber` block (2) | pass |
| View as groups come from live tenants (no fixed five); Kasper first; empty groups hidden; search | `src/server/view-as.test.ts` (6, incl. runtime-created company) | pass |
| Badges: "No CAN", tier mix, "invited", "deactivated" | `src/server/view-as.test.ts` | pass |
| Clock changes only through the store | grep of `setOffsetMs|resetOffset` in `app/` and `src/` | pass |

## Unproven (not claimed as done)

- **Phone nav gap.** The phone bottom bar still shows only the first five visible items,
  so Maintenance and Cost & ROI cannot be reached on a phone. Not fixed; not in F2.
- **View as badges beyond invited.** "renting N" and "rented out N" are not tested in
  the browser. The unit test covers "No CAN", "T1…T3" and "deactivated" only.
- **Signed-out row and outside hirer row.** Neither has a browser or unit test. The
  signed-out row's code path clears the session and goes to `/sign-in`, but this is not proven.
- **Scenarios 14 and 29.** The code now sets `fb12Public: true`, and the scenario start
  opens `fb12PublicPath()` (the live FB-12 link from the db), not a hard-coded token.
  No browser test covers the scenarios, so they are unproven. The tests `S13-S16.spec.ts`
  and `S23-S30.spec.ts` still hard-code the token in their `goto` calls, and those tests
  were not changed.
- **Schedules render-time write.** `app/app/schedules/page.tsx` still calls
  `runDueSchedules()` inside `useMemo`. It writes to the db during render, and React logs
  "Cannot update a component (DemoBar) while rendering SchedulesPage". This predates F2,
  and DemoBar's subscription makes it visible. Not fixed.
- **Keyed containers.** The AppShell children wrapper is keyed by `session?.userId`
  (`AppShell.tsx`). Page-level state reset is not proven by a test.
- **Empty-field sign-in message in the browser.** Proven at the API level only.
- **Tier-mix hardware label** on the tenant pages has no test. The change is a
  one-line swap to `tierForAsset`.

## Check results (final)

- `npm run typecheck`: clean (exit 0).
- `npm run lint`: clean (exit 0).
- `npm test`: 31 files, 305 tests, all pass. This includes `view-as.test.ts`, added after
  the Playwright run. It changes no app code.
- `npx playwright test` (full suite; log `/tmp/work/e2e-f2-final.log`): **131 passed,
  59 failed, 28 skipped**, out of 218 runs. F1 was 117 / 67 / 22 out of 206. The failure
  count is down by 8, and the 8 fixed are S19 (both tests, desktop and phone), S22 (desktop
  and phone) and S30 (desktop and phone). Compared with the earlier F2 run, there are **no
  new failures**. The F1 failure list was not saved, and the baseline logs were lost in a
  sandbox reset, so a strict diff against F1 is not available. The six f2-screens proofs
  all pass on desktop.
- The 59 remaining failures are in S1–S3, S4–S8, S9–S12, S13–S16, S17–S19 (S18 wizard
  "Company" strict-mode violation), S20–S22 (S21 locked Tier 3 cards), S23–S30 (S23 "Business
  Bay" site option; S24/S25 geofence and label tests), S31–S36, S37–S41, S42–S50,
  `billing.spec.ts`, `certificate.spec.ts`, `maintenance-cost.spec.ts`, `public-tracking.spec.ts`
  and `demo-shell.spec.ts:10`. Only S19, S22 and S30 were diagnosed in F2. The rest were not
  triaged and are left for F3–F5 or the spec work in F5.

## Known gaps and deviations (honest)

- **Presets read the db inside `demo-presets.ts`.** The plan said the caller passes a
  snapshot. The server functions read the live db, and components re-render through
  `useDb`. The result is the same, but the boundary is not as strict as the plan.
- **Phone nav** (see Unproven). A known gap, not fixed.
- **Settings invite has no site-required check.** A Site User can be created with no site
  selected. The spec says a Site User needs at least one site. Not fixed in F2.
- **View as's outside hirer row** does nothing when no live FB-12 link exists. Silent,
  not an error.
- **Remaining telemetry imports in screens**: `app/app/page.tsx` imports
  `getReadingForAsset`, and `app/app/assets/[id]/page.tsx` imports `getReadingForAsset`,
  `getReadingsForAsset` and `computeStatus`, all from `@/server/telemetry/simulator`. The
  architecture test allows this for now. F3 and F4 move it.
- **`hasCapability` and the `can()` placeholders are unchanged.** F3.
- **`app/t/[token]/page.tsx`** still imports from `@/server/links`. F5.
- **`HANDOFF.md` is not updated.** F5 rewrites it with honest per-phase status.
