# Kasper GPS prototype review, 12 Oct 2026

Files: `Kasper-GPS-prototype-review-2026-10-12.pdf` (full review with diagram, per-user table and
problem screenshots) and `01`–`10` screenshots (the 10 cited in the review).

Checked at `h4-spec-features` @ `659e738`. PR #14 has since been merged to `main` (`3cb90f3`).

## Status of the 12 changes

1. Merge PR #14 — **done** (`3cb90f3`). This also fixes the View as demo bar on `main`.
2. Simulator day starts use UTC midnight (`telemetry/simulator.ts`). Use `clock.startOfDubaiDay`. — open
3. Alert times do not match alert text; copied sample strings ("12:10", "14:32"); GN-01 fuel drop dated after "now". — open
4. Public tracking page has no map, only a "Live map" label. — open
5. Site Users get Settings with Invite, Deactivate, Add asset and Retire; the API refuses silently. Customers see tracker IMEIs in Settings → Assets. — open
6. Renters see the owner's yards; hide the Owned/Rented In filter when the user has only one. — open
7. Features panel should match spec §10.2 (reasons per permission, hardware section). — open
8. Engine & fuel tab should match §11.3; ignition-on time on Tier 3 labelled Estimated, not ECU. — open
9. Map layout: list beside the map; stop the code badge wrapping. — open
10. Phone demo bar wraps to 4 rows (~145 px); should be one row. — open
11. Copy fixes: "ago(hover for details)", "·1 Sep", "6 OctOverdue Overdue", utilisation days unsorted, fuel 53% everywhere, Scenarios menu shows only 3 rows. — open
12. Run Playwright on desktop and phone and take screenshots (H6/H7). — done on `659e738` (347 passed, 0 failed); re-run on `main` pending.
