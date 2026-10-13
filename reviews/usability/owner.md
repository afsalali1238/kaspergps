# Usability script: Owner

**Tester plays:** Khalid Rahman, Tenant Admin of Emirates Earthmovers (owns 12 plant machines, rents some out). Task O2 uses Omar Saleh (Al Noor Transport), because FB-12 is Al Noor's truck.
**Home (start state for every task):** signed in, on the Map (`/app`), demo clock at the anchor (10:00).

| # | Task (read aloud) | Start state | Success criterion | Click target | Time target | Happy path |
| --- | --- | --- | --- | --- | --- | --- |
| O1 | "One of your machines lost fuel overnight. Which one, and when?" | Map | The tester says **GN-01** and **02:10** (the fuel-drop alert: "Fuel dropped 18% at 02:10 with engine off") | ≤ 3 | ≤ 30 s | Alerts → All → read the GN-01 fuel-drop row |
| O2 | "Send the customer a live tracking link for FB-12." (as Omar) | Map, as Omar | A new link URL (`/t/…`) is on screen, ready to copy | ≤ 4 | ≤ 45 s | FB-12 in the list → Share tracking link → Create |
| O3 | "Palm Contracting's hire of EX-11 is over. End their access now, and say why." | Map | The confirm is done with a reason of 10+ characters; EX-11 no longer shows "Rented to Palm Contracting" | ≤ 5 | ≤ 60 s | EX-11 → End access now → type reason → End Palm Contracting access now |
| O4 | "What's overdue in maintenance?" | Map | The overdue machine (**BD-02**, 30 h over) is on screen | ≤ 2 | ≤ 20 s | Maintenance |
| O5 | "Issue September's utilisation certificate for EX-04." | Map | A new sealed certificate for EX-04 covering September is in the list | ≤ 4 | ≤ 60 s | Certificates (under More at narrow widths) → Issue certificate → pick the September period → Issue and seal |

**Watch for:** whether the tester finds alerts from the map's "Open alerts" link or the top nav; whether "End access now" feels safe (it must confirm); whether "Last month" in the certificate form names the right month.
