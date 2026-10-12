# Builder work order: Kasper GPS UI/UX upgrade (U0–U8)

**You are the builder.** You write the code, one step per pull request. **Claude Opus is the supervisor:** it reviews every PR, asks for changes, and merges. You never merge.

**Read first, in order:**
1. `handoff/UI-UPGRADE.md`: the full specification (what to build and what "9/10" means). This work order overrides it only where noted.
2. `BUILD_PROMPT.md`: the product spec. It wins over both handoffs, except for the owner decisions below.
3. `HANDOFF.md`: the current state of the product.
4. `AGENTS.md`: this Next.js version has breaking changes. Read the guide in `node_modules/next/dist/docs/` before writing Next code.

Repo: `https://github.com/afsalali1238/kaspergps`. Branch from the latest `main` for every step.

---

## 1. Owner decisions (final; don't ask again)

| Topic | Decision |
| --- | --- |
| Wordmark | **"Kasper"**. Keep the product name in one place (`src/config/brand.ts`) so it can switch to "dozr" later in one line. |
| FB-12 trip | It arrives at Al Habtoor **about 30 min after the anchor (10:30)** at a realistic truck speed. The tracking page's ETA must then be within ±5 min of the actual arrival. Change `fb12Route` in `src/server/telemetry/simulator.ts` and its tests. |
| Fuel screen | Its own nav item, **only** for users whose visible assets have `fuel.level`. |
| Alert rules panel | Shown to Tenant Admins with the label **"Prototype — no messages are sent"**. Nothing is sent anywhere. |
| After-hours asset | **GR-01** at Al Quoz (as merged in PR #24). |
| Phases | Gone: no Phase switch, no Show hidden, no "Day one / Phase 2" labels anywhere. |
| Sign-in | Role-first (5 roles); keep it. |

## 2. Already done (don't redo)

- J1–J7 are complete (PRs #14–#25).
- The four seed alerts are backed by readings (PR #24); `alerts-truthful.test.ts` has no to-dos.
- **U0 part 1, PR #26:**
  - speed is rounded;
  - the duplicate Battery tile is removed;
  - maintenance reads ECU hours, so EX-04 is 80 h left and BD-02 30 h over, matching §8.10;
  - maintenance alert text comes from the plan;
  - generators earn engine hours (GN-01 no longer shows 0.0 h).

## 3. Your steps

Do them in order. Start a step only after the previous one is merged.

| Step | Branch | Scope (details in `handoff/UI-UPGRADE.md`) |
| --- | --- | --- |
| **U0b** | `u0b-bug-fixes` | The rest of U0, below |
| U1 | `u1-design-system` | §3.1–3.2 (fleetx clone and copy) and §4 (fonts, tokens, type, components, icons) |
| U2 | `u2-fleet-map` | §5–6 |
| U3 | `u3-asset-page` | §7 |
| U4 | `u4-work-screens` | §8: Alerts, Fuel, Maintenance, Reports |
| U5 | `u5-money-admin-data` | §8: money, settings and console; §9 data |
| U6 | `u6-phone-arabic` | §10 |
| U7 | `u7-testing-kit` | §11 |
| U8 | `u8-scorecard` | §2 scorecard; §3.4 remove fleetx; rewrite `HANDOFF.md` |

**U0b list** (re-check each on current `main` first, and skip any already fixed; say so in the self-check):
1. **Billing** opens on the first tab with content. Khalid lands on Issued, not an empty Received (`app/app/billing/page.tsx`, `useState<TabId>('received')`).
2. **Settings:** you can't deactivate yourself. Hide the button on your own row, and refuse in the API (`src/server/team.ts`), with tests.
3. **Reports:** remove the "Day one" / "Phase 2" labels under report types.
4. **Certificates:** View / Void / Reissue / Verify sit in one Actions cell (or a ⋯ menu), with no second row. A voided row shows "Voided" once.
5. **FB-12 arrival** (decision above), with a test that the tracking ETA and the simulated arrival agree within 5 min.
6. **No raw floats:** an e2e check that no visible text on the main screens matches `/\d+\.\d{4,}/`.
7. **Stale screenshots:** regenerate and commit `reviews/screenshots/P14/*`. 44 of 46 still show the removed Phase switch.
8. **The production font bug:** the Google Fonts `@import` in `app/globals.css` is dropped by the build. Move the fonts to `next/font/google` in `app/layout.tsx`. This is the first item of U1 but tiny; doing it here gives every later screenshot the right fonts.

## 4. How each step runs (the review loop)

1. `git fetch && git checkout -b <branch> origin/main`.
2. Build the step. Keep the PR focused. If a step gets too large to review, split it (`u4a-alerts`, `u4b-fuel` …) and say so.
3. **Before opening the PR**, run each command on its own and record the exit code:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run build`
   - `TZ=UTC npm test`
   - `TZ=Asia/Dubai npm test`
   - `npx playwright test` (desktop and phone)
4. Write `reviews/<STEP>-self-check.md` with:
   - what changed (files and why);
   - exit codes for every command in step 3;
   - before/after screenshots at 1440 and 390 px for each changed screen (in `reviews/screenshots/<STEP>/`);
   - the scorecard rows (§2 of the UI handoff) this step moves, with your score and the evidence;
   - anything skipped or deviating, and why;
   - open questions. Ask them here; don't guess.
5. Open the PR against `main`. Title: `<STEP>: <summary>`. Body: a link to the self-check, plus the checklist in §5 ticked honestly.
6. **Stop.** Post: `<STEP> ready for review: PR #<n>`. Don't start the next step.
7. The supervisor reviews and replies with **Approved** (it merges) or **Changes requested** (a numbered list). Fix every item in the **same PR**, reply to each by number with what you did, re-run the checks, update the self-check, and post `<STEP> updated: PR #<n>`.

## 5. PR checklist (the supervisor checks every item)

- [ ] Branched from the latest `main`; no unrelated changes; no merge commits from other branches.
- [ ] All commands in §4 step 3 pass; the exit codes are in the self-check, and CI is green on all 3 shards.
- [ ] No test was weakened or deleted. Tests changed only for intended markup changes, and behaviour assertions (who sees what, numbers, states) are kept.
- [ ] Architecture rules: screens import the server only through `src/server/api`; no `role ===` outside `capabilities.ts`, `capability-reasons.ts` and `seed/`; time only from `clock.ts`; coverage ≥ 85%.
- [ ] Access unchanged or narrower. New panels, strips and lists are role-scoped, with tests for at least Mark (Site User), Lina (renter) and Fatima (owns nothing).
- [ ] Honest numbers: every new number has a source label or "Not measured", and nothing is invented (no savings, ROI multiples or forecasts).
- [ ] No hard-coded hex in components. Tokens only, after U1.
- [ ] Phone, 390 px: no sideways scroll on the changed screens; tap targets ≥ 40 px.
- [ ] Arabic: every new string is in `public/locales/ar.json` (the i18n test passes).
- [ ] Screenshots attached and looked at; the self-check says what you checked by eye.
- [ ] Nothing from fleetx committed except `reviews/fleetx-reference/*.png` (deleted in U8). No "dozr", "KSP-0" or fleetx numbers in `app/`, `src/` or `tests/`.

## 6. Rules that get a PR sent back

- Claiming a check passed without running it.
- Deleting or weakening an assertion to get green.
- Merging your own PR, or pushing to `main`.
- Widening access, or showing a number without a source.
- Starting the next step before the current one is merged.
- Mixing two steps in one PR.

## 7. Sandbox notes

- GitHub GraphQL may be blocked. Use REST: `gh api repos/afsalali1238/kaspergps/commits/<sha>/check-runs`.
- After `npm run build`, restart `next start` (an old server serves stale chunks: "This page couldn't load").
- A local Playwright run rewrites `reviews/screenshots/**`. Restore the files you didn't mean to change (`git checkout -- reviews/screenshots/...`).
- Don't `pkill -f` a pattern that also appears in your own shell command; it kills your shell.
- Chromium is at `/opt/pw-browsers`. Don't run `playwright install`.
