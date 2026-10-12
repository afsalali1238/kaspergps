# Agent H: Reports, Cost & ROI, Billing, Certificates and Settings (Wave 2, after A and B)

**Branch:** `agent-h-reports-money` · **Spec:** `UI-UPGRADE.md` §5.2 (Reports, Cost, Billing and Certificates rows), §8 · **Arabic namespace:** `reports_page`, `money`, `settings_page`

Agent A's fixes are on `main` and must survive: the Billing default tab, no self-deactivate, no phase labels, and certificate actions in one cell.

## Scope
1. **Reports + Downloads (one screen):**
   - KPI strip;
   - report cards (Lucide icon, name, one line, cadence badge);
   - clicking a card opens a **run panel**: scope, date presets, format, Run;
   - a **Recently generated** table with re-download, which re-checks permission;
   - Schedules stays as a tab;
   - `/app/downloads` redirects to `/app/reports#recent`.
2. **Cost & ROI:**
   - KPI strip;
   - a hero with real revenue, cost, margin and margin %, with sources;
   - per-asset stacked cost bars (fuel / idle / maintenance / fixed / operator);
   - the existing table under a "Details" disclosure;
   - **no savings or ROI-multiple claims.**
3. **Billing:** KPI strip; an invoice `Table` with status badges and a `RowMenu` (Record payment, Download PDF).
4. **Certificates:** KPI strip; a `Table` with View plus a `RowMenu` (Void, Reissue, Verify link).
5. **Settings:**
   - `Table` + `RowMenu` for users, sites, assets and labels;
   - tab counts ("Users 2");
   - destructive actions behind `ConfirmDialog`.

## Tests
- The downloads redirect.
- Re-download re-checks permission (the existing rule).
- Cost & ROI shows only sourced numbers, with no "×" multiple.
- A's fixes still hold.
- Role scoping for Lina (renter), Mark (Site User; no Settings) and Fatima (no Cost & ROI).

## Done when
- Scorecard A6, A9 and A10 (the Settings part) ≥ 9. Screenshots of each screen at 1440 and 390 px.
