# R: role-first entry — self-check

Owner decision, 13 Oct 15:09 (spec: `handoff/ROLE-LOGIN.md`, kept in the Project docs; decision D13 in `BUILD_PROMPT.md` §0a).

## What was built
- `/` is the role picker: eight persona cards plus the outside hirer link, in four groups. Each card signs in as one seeded account (`src/config/personas.ts`) and lands on that role's home. No names, emails or passwords on the page.
- A signed-in visitor sees a slim "Continue as …" bar; that is the only shortcut. `/` never redirects.
- `/sign-in` redirects to `/`. The email form moved to `/dev/sign-in` (prototype only, not linked).
- Log out (app menu, console header, demo bar "Switch role") clears the session and the walkthrough, then returns to `/`.
- `/app/**` and `/console/**` with no session redirect to `/`, so Back after Log out shows no app screens.
- Demo bar: View as is replaced by a role chip and "Switch role". Scenarios and Tools sit under "More". No demo bar on `/`.
- The hirer card opens `/t/<token>` with no session. The public pill has "← Back to roles".
- Arabic: `roles.*` keys in `public/locales/ar.json`, plus `sign_in.dev_subtitle`.

## Decisions and deviations
- **Chips are checked against the data.** `personas.test.ts` checks that each card's account exists, is active and has the claimed role, and that each chip is true of it (Kasper, console, owner, renter, client, site, tier 1, tier 3). It is forward-only: a card may leave out a tier its account also sees. Khalid's Tier 3 fleet also holds three Tier 1 assets, and Mark's site holds every tier, so their cards name only the headline tier.
- **ViewAsMenu.tsx and UserPicker.tsx are deleted.** `src/server/view-as.ts` stays because its unit tests and the API gate still use it.
- **A refused scenario keeps the current session.** S22 (deactivated Karim) used to sign out before going to the sign-in page. The new guard on `/app` and `/console` redirected to `/` first, so the scenario now keeps the session and lands on `/dev/sign-in`.
- **Test helpers.** `signIn` goes to `/dev/sign-in`. `viewAs(name)` signs in by email, and `pickRole(id)` clicks a card. `openDemoMore` opens More before Scenarios or Tools.
- **Specs that tested the dropdown itself were rewritten** (f2-screens, S17–S19, S20–S22, S4–S8, S9–S12, S1–S3, phone-layout, certificate, scenario-walkthroughs). Each now checks the same product behaviour through the new surfaces. `e2e-contract.test.ts` now checks for "Switch role", "role-chip", "More" and the other triggers.
- **Walkthrough copy** no longer says "View as".
- **Ctrl+K** is unbound. Owner finding §7.2 is still open.

## Checks
- Typecheck, lint: pass.
- `npm run build`: pass.
- Unit tests (`vitest run`, UTC): 76 files, 1153 tests pass. The Asia/Dubai run is not done yet.
- Playwright, full suite (desktop + phone, local production build): 505 passed, 361 skipped (platform-gated), 16 failed in the first run. The failures were the hirer pill (two `.demo-bar` matches), the S1 chip text, and screenshot or j6 timeouts. After the fixes, the affected files re-ran clean: roles-login, f2, S1–S3, S4–S8, S9–S12, phone-layout, certificate, scenario-walkthroughs, j5, j6, screenshots (101 passed, 84 skipped). The full suite has not been re-run since the last fix.
- `roles-login.spec.ts`: 11 desktop tests pass. The phone project runs its own copies.

## Screenshots (`reviews/screenshots/R/`)
- `home-1440-en.png`, `home-1440-ar.png`, `home-390-en.png`, `home-390-ar.png`: the picker.
- `land-owner-tier1-1440.png`: Fleet owner · Tier 1 landing.
- `land-kasper-admin-1440.png`: Kasper Admin landing on the console.
- `loop-after-logout-1440.png`, `loop-app-redirects-to-picker-1440.png`: Log out and the redirect.

Not done: a landing screenshot for every card, and a visual check of the Arabic home at 1440 beyond the file being captured.
