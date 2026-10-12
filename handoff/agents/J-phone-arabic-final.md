# Agent J: phone, Arabic, demo tools and the final scorecard (Wave 3)

**Branch:** `agent-j-final` · **Spec:** `UI-UPGRADE.md` §2, §3.4, §5.1 (demo bar), §10, §11 (items 2–3) · **Arabic namespace:** `demo_tools`, plus any keys missing elsewhere

Starts after every Wave 2 PR is merged.

## Scope
1. **Phone pass** (§10): every route at 390 × 844.
   - No sideways scroll: extend `phone-layout.spec.ts` to every route.
   - KPI strips scroll inside themselves.
   - Tables become stacked cards, or scroll inside their panel.
   - Sheets work everywhere.
   - Primary actions are full-width, and tap targets are ≥ 40 px.
   Fix only layout. Logic issues go back to the supervisor.
2. **Arabic and RTL** (§10):
   - mirror the three-pane map;
   - numbers, IDs and times stay LTR;
   - truncation at the logical end;
   - asset types translated;
   - every new key from A–I is present (the i18n test passes);
   - keep the file marked "Draft — needs native review".
3. **Demo tools:**
   - **Start session as …** (reset data, clock to the anchor, sign in the role, land on its home);
   - **Report a problem** (route, user, clock, viewport and a note into the local db; a Tools → "Feedback (n)" list with CSV export);
   - **Trigger alert ▸** (offline, power cut, fuel drop, fault, over-speed), which writes a real reading or alert through the simulator API.
4. **Make the test gates strict:**
   - record the visual-regression baselines (D's spec, `VISUAL=1`) and turn the CI job on as required;
   - switch axe to "no serious or critical violations";
   - run D's usability spec and record clicks and time for every task against its targets.
5. **Scorecard** (§2): write `reviews/U8-scorecard.md` with a score and evidence for all 16 areas. Every row must be ≥ 9. If one isn't, list the gap and stop; the supervisor assigns a fix.
6. **Remove fleetx** (§3.4):
   - `rm -rf /tmp/fleetx-ref`;
   - `git rm -r reviews/fleetx-reference`;
   - `grep -rniE "dozr|KSP-0|fleetx" app src tests public` must print nothing.
7. **Rewrite `HANDOFF.md`** for the final state.

## Done when
- Every scorecard row is ≥ 9, with evidence.
- CI is green, including the visual and axe jobs.
- The fleetx grep is clean.
