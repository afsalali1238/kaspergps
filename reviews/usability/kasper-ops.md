# Usability script: Kasper Ops

**Tester plays:** Ravi Menon, Kasper operations. He registers, pairs and moves trackers and CAN adapters across all tenants, but doesn't see customer billing.
**Home (start state for every task):** signed in, on the Kasper console Overview (`/console`), demo clock at the anchor.

| # | Task (read aloud) | Start state | Success criterion | Click target | Time target | Happy path |
| --- | --- | --- | --- | --- | --- | --- |
| K1 | "Gulf Lift's welder trailer MW-01 has no tracker. Pair one." | Console Overview | An in-stock tracker now shows "Asset: MW-01" | ≤ 4 | ≤ 60 s | Trackers → Pair (an in-stock tracker) → MW-01 → Confirm |
| K2 | "Which CAN adapter is faulty?" | Console Overview | **AC3-005501** (faulty, in stock) is on screen | ≤ 1 | ≤ 20 s | CAN adapters → status filter Faulty |
| K3 | "Move a tracker from one customer's machine to another customer's." | Console Overview | The tracker shows the new asset and the new tenant | ≤ 4 | ≤ 60 s | Trackers → Move → pick an asset of another tenant → Confirm |
| K4 | "Show Emirates Earthmovers' assets." | Console Overview | The asset list shows EX-04 and other Emirates machines, and nothing of other tenants | ≤ 2 | ≤ 30 s | Assets → tenant filter Emirates Earthmovers |
| K5 | "Can you see customer billing?" | Console Overview | The tester confirms there's no Billing page for Ops (check the More menu too) | ≤ 1 | ≤ 15 s | Open More: no Billing |

**Watch for:** moving a tracker across tenants must be explicit about the new owner; the copy buttons on IMEI and SIM (scorecard A10).
