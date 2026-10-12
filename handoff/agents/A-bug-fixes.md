# Agent A: bug fixes (Wave 1)

**Branch:** `agent-a-bug-fixes` · **Spec:** `UI-UPGRADE.md` §12 U0 · **Arabic namespace:** `fixes`

Already fixed (don't redo): the raw speed float, the duplicate battery tile, maintenance 80/95 h, BD-02 hours, and GN-01 0.0 h (PR #26).

## Scope
Re-check each item on current `main` first. Skip it if it's already fixed, and say so.

1. **Billing default tab.** Open on the first tab that has content. Khalid lands on **Issued**, not an empty Received (`app/app/billing/page.tsx`, `useState<TabId>('received')`). Test: Khalid → Issued; Lina (a renter with received invoices) → Received; Sara → Issued.
2. **You can't deactivate yourself.** Hide Deactivate on your own row in Settings → Users. `src/server/team.ts` refuses it with "You can't deactivate your own account." Unit test for the API and an e2e test for the button.
3. **Reports phase labels.** Remove "Day one" and "Phase 2" under the report types (`app/app/reports/page.tsx`). Change only that label line; Agent H rebuilds this page later.
4. **Certificate actions.** View / Void / Reissue / Verify sit in one Actions cell (View as a button, the rest in a small ⋯ menu, or inline in one row). No second row, and "Voided" appears once. e2e: each row of the certificates table is one `<tr>`.
5. **Stale screenshots.** Regenerate `reviews/screenshots/P14/*` with `tests/e2e/screenshots.spec.ts` and commit them. 44 of 46 still show the removed Phase switch. Do this **last**, after 1–4, so the captures show the fixes.

## Not yours
- Fonts (B).
- FB-12 arrival (C).
- The raw-float e2e check (D).
- Page redesigns (H).

## Done when
- Every item has a test, CI is green, and fresh P14 screenshots are committed.
- Self-check: `reviews/agent-A-self-check.md`.
