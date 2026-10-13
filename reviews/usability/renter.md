# Usability script: Renter

**Tester plays:** Lina Aziz, Tenant Admin of Marina Builders. Marina owns three light vehicles (PU-51, PU-52, VN-01) and rents EX-04 from Emirates Earthmovers (booking BK-1001, since 4 Oct 08:00).
**Home (start state for every task):** signed in, on the Map (`/app`), demo clock at the anchor.

| # | Task (read aloud) | Start state | Success criterion | Click target | Time target | Happy path |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | "Which machines can you see?" | Map | The list shows EX-04 and PU-51 (and the rest of what Marina owns or rents), and **not** EX-11 or FB-12 | 0 | ≤ 15 s | Read the fleet list |
| R2 | "Look at EX-04's history. When does it start?" | Map | The History tab is open and starts at the rental (4 Oct 08:00), not before | ≤ 2 | ≤ 30 s | EX-04 → History |
| R3 | "Get last week's trip report for EX-04 as a file." | Map | A file (.xlsx or .pdf) downloads | ≤ 5 | ≤ 60 s | Reports → Trip & Mileage → EX-04 → Last 7 days → Run report |
| R4 | "When will FB-12 arrive?" (a trick: Marina has nothing to do with FB-12) | Map | The tester concludes they can't see FB-12: search finds nothing and its page shows no position or arrival time | ≤ 1 | ≤ 20 s | Search → type FB-12 → no result |
| R5 | "Switch the app to Arabic, then back to English." | Map | The page is right-to-left in Arabic, then left-to-right again | ≤ 4 | ≤ 30 s | User menu → Language → user menu → Language |

**Watch for:** any number that reveals the owner's data (purchase price, other renters, history before the rental); whether Arabic mirrors the layout and keeps asset codes and times in Latin digits.
