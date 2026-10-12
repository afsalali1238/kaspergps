# Agent I: Kasper console (Wave 2, after B)

**Branch:** `agent-i-console` · **Spec:** `UI-UPGRADE.md` §5.2 (Console overview row), §8 (Console) · **Arabic namespace:** `console_ui` (the console is desktop-only and English-first; add keys anyway)

## Scope
1. **Overview** (`/console`):
   - KPI strip: tenants, trackers in stock, faulty, open requests, overdue invoices;
   - a **"Needs action"** list: open tracker requests, faulty CAN adapters, overdue invoices, links expiring today;
   - each item links to its screen.
2. **Assets, Trackers and CAN adapters:**
   - dense `Table`s; clicking a row opens details;
   - one primary action per row, the rest in a `RowMenu` (Move, Unpair, Mark faulty, Settings, History);
   - `CopyButton` on IMEI and SIM;
   - filters stay.
3. **Tenants, Bookings, Requests, Billing, Team, Audit and Import:** restyle with `Table`, `Panel`, `Badge` and the KPI strip where §5.2 lists one.
4. **Role rules are unchanged:** Ops gets no Billing, no Kasper team and no Audit log; customers get "Page not found".

## Tests
- Overview counts match the data.
- `RowMenu` actions still work (Move, Unpair, Mark faulty).
- Copy buttons copy.
- Ops is denied Billing, Team and Audit; existing console tests pass.

## Done when
- Scorecard A10 (the console part) ≥ 9. Screenshots of Overview, Assets and Trackers at 1440 px for Sara and Ravi.
