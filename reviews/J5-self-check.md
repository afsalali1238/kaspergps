# J5 self-check: tenant navigation at every width

## Scope (provisional)

The J5 scope was not in any file in the repo. The candidate list was the screen gaps in `HANDOFF.md` §2. This phase takes one of them: **P4**, where tenant customer nav items (Certificates, Billing, Maintenance, Cost & ROI) might drop out at some widths. It was not re-verified before. Other gaps in §2 are not in J5.

## What was checked

`tests/e2e/j5-nav-widths.spec.ts` signs in two tenant admins at phase "Later" and checks widths 390, 768, 1024, 1280 and 1440 px:

- Below 1024 px: the "Open menu" sheet lists each late-phase item the user may see.
- From 1024 px: the left nav lists each item, and each item sits inside the viewport.
- Omar (Al Noor, Tier 1 fleet): Billing, Maintenance and Cost & ROI are shown. Certificates is absent at every width. This is correct: MUC needs a Tier 3 asset with ECU hours (§5, §11.16).
- Khalid (Emirates, Tier 3): all four items are shown at every width.

## Result

- P4 does not reproduce. No item drops out at the five widths tested.
- The first version of the spec wrongly expected Certificates for Omar. The check was corrected to the per-user expectation. The app behaviour was not changed.

## Gate on the merged branch

The branch was merged with the remote `fb99974` (another J5 track: "Sales view cards" and PR #22 "j5-demo-bar") and with main `49dfa62`. Main removed the Phase switch, so the spec no longer passes `phase`; the default phase is now `later`.


- `npm ci`: 0
- `npm run typecheck`: 0
- `npm run lint`: 0
- `npm run build`: 0
- `npm test` under `TZ=UTC`: 0 (817 passed, 5 todo)
- `npm test` under `TZ=Asia/Dubai`: 0 (817 passed, 5 todo)
- `npx playwright test` desktop + phone (CI=1): 0, 343 passed, 177 skipped (desktop-only tests skip on phone; the width spec skips on phone).

## Open-item decisions (J4 list)

- **EX-11 power cut:** seed text now says Ras Al Khor Yard (was Al Quoz Yard). The alert is still a todo: the readings show voltage on, so no power-cut event is produced.
- **FB-12 over-speed:** resolved on merge. 84 km/h is under the 90 km/h truck limit, so that text could not be an over-speed. The readings now carry a planned 96 km/h run on 4 Oct 07:40–07:42 (like WT-07), the alert points at it, and `alerts-truthful.test.ts` checks it.
- **PU-51 idle:** unchanged. The alert is still a todo because the readings show the ignition off.
- **LB-05 after-hours exit from Al Quoz Yard:** unchanged, stays a todo. Spec conflict: LB-05's home is DIP, but the fence belongs to Emirates' Al Quoz Yard. Needs a spec decision.
- **TP-21 harsh driving:** unchanged, stays a todo. Readings have no accelerometer events.

## Open items

- Scope: this check covers the nav at every width only. The rest of J5 in `HANDOFF-2026-10-12.md` (one-row phone demo bar, Scenarios menu, Sales view card placement) shipped in PR #22; J5 items 1–4 (public tracking map, Features panel, Engine & fuel, map layout) are still open.
- J4 open items still open: PU-51 idle location, LB-05 after-hours fence (spec conflict), TP-21 harsh driving, EX-11 power-cut readings. EX-11's yard name and FB-12's over-speed are resolved.

Phase J5 is ready for review.
