# J1 self-check — merge and one version

Date: 2026-10-12 · Agent: Claude (Haiku 5.5) · Branch `j1-verify` (from `main` @ `93f00ff`)

## Merges

- PR #14 (H4–H7) merged into `main` as `3cb90f3`. Its CI passed: typecheck/lint/unit and all three Playwright shards.
- PR #15 (sign-in dropdown) was re-based from `h4-spec-features` to `main` by changing its base branch. Its
  diff is now the four sign-in files only. Merged as `93f00ff`. Its CI passed on the PR head (`42b0454`).
- Stale branches (`arena/*`) untouched.

## Commands on `main` @ `93f00ff` (each run on its own)

| Command | Result |
| --- | --- |
| `npm ci` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run build` | exit 0 (after deleting `.next/dev`, see below) |
| `TZ=UTC npx vitest run` | exit 0, 736 / 736, 53 files |
| `TZ=Asia/Dubai npx vitest run` | exit 0, 736 / 736, 53 files |
| `npx playwright test --shard=1/3` | exit 0, 190 passed, 21 skipped |
| `npx playwright test --shard=2/3` | exit 1, 96 passed, 35 skipped, 1 failed (see below) |
| `npx playwright test --shard=3/3` | exit 0, 60 passed, 111 skipped |
| `npx playwright test tests/e2e/screenshots.spec.ts -g "ravi console-trackers at 1440"` | exit 0 (the one shard-2 failure, rerun) |
| `npx playwright test tests/e2e/j1-signin-picker.spec.ts` | exit 0, 8 passed (4 tests × desktop and phone) |

Playwright totals, counting the rerun: 347 passed, 0 failed, 167 skipped. The same as the earlier run.

Playwright ran as three foreground shards. Two background full runs were killed between turns, so they did not finish.

## Things that went wrong, and fixes

- **Server hang.** The first attempt used Playwright's local `npm run dev` (it starts when no server is up).
  `next dev` compiles each route on first visit, so `/app` timed out. Fixed by stopping the dev server and
  running `rebuild.sh`, which starts the production server. Playwright then reuses it.
- **Broken build from the dev server.** Killing `next dev` left half-written files in `.next/dev/types`,
  and the production build type-checks them. Fixed by deleting `.next/dev`, which is generated and git-ignored.
- **Tamper test timed out** (`certificate.spec.ts:33`). Caused by the dev server above, not by the app.
  It passes on the production server.
- **Ravi screenshot timed out once** (`ravi console-trackers at 1440`). It passes on rerun; treated as a timing flake.
- **Stale sandbox Chromium path.** Playwright 1.63 wants a browser build the sandbox does not have, so the run
  points `PW_CHROMIUM_PATH` at the installed `chromium-1194` binary. This is environment-only and does not change tests.

## J1 proof

| Proof | Result |
| --- | --- |
| `main` builds | Yes, build exit 0 |
| View as and Scenarios open as full dropdowns that are not clipped (1440 and 390 px) | Yes, on the `/app` home page. Checked by `j1-signin-picker.spec.ts`: View as search box and Scenarios' first item are visible and hit-testable. Screenshots in `reviews/screenshots/J1/`. |
| Sign-in dropdown signs in Deepa | Yes (test "choosing Deepa signs her in") |
| Sign-in dropdown refuses Karim | Yes (test "choosing Karim is refused …"; the message shows, the URL stays on `/sign-in`) |
| Sign-in dropdown welcomes Sam | Partly. The status notice shows and the page then moves to `/app`. The notice's exact text is not asserted. |

## Not proven / gaps (J1)

- "Any `/app` page" in the J1 proof is checked on the home page only.
- The Scenarios panel shows about six items and scrolls. S10 is below the fold, which is what J5 item 6 asks to fix
  ("at least 10 of the 50"). Not a J1 change.
- Sam's welcome text is not asserted.
- Only the desktop and phone projects were run for J1; the Karim refusal is also in `S20-S22.spec.ts` via the email form.
- CI on `main` for `93f00ff` is listed in the handoff's J7 "green CI on main" check; it is not claimed here beyond the PR checks above.

Phase J1 is ready for review.
